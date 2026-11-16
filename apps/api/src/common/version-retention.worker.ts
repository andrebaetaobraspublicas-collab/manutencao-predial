import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mariadb, { Connection } from 'mariadb';
import { randomUUID } from 'node:crypto';
import { parseMySqlUrl } from '../prisma/database-url';
import { historySelectSql, disposableVersions, HistoryRow, infraProductionVersionRetentionEnabled, productionVersionRetentionEnabled, versionRetentionEnabled } from './version-retention';

@Injectable()
export class VersionRetentionWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(VersionRetentionWorker.name);
  constructor(private readonly config: ConfigService) {}
  onModuleInit() {
    if (!versionRetentionEnabled(this.config) || productionVersionRetentionEnabled(this.config) || infraProductionVersionRetentionEnabled(this.config)) return;
    this.timer = setInterval(() => void this.run(), 60000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async run() {
    if (this.running || !versionRetentionEnabled(this.config) || productionVersionRetentionEnabled(this.config) || infraProductionVersionRetentionEnabled(this.config)) return;
    this.running = true;
    const connections: Connection[] = [];
    try {
      // Open and validate every development database before considering deletions.
      const specs = [['DATABASE_URL', 'u296746636_gestaopredios'], ['INFRA_DATABASE_URL', 'u296746636_orcapro_infra'], ['GESTAO_DATABASE_URL', 'u296746636_gestao_dev']];
      for (const [key, name] of specs) {
        const options = parseMySqlUrl(this.config.getOrThrow(key));
        if (options.database !== name) throw new Error('Unexpected database');
        connections.push(await mariadb.createConnection({ ...options, connectTimeout: 10000 }));
      }
      const [primary, infra, contracts] = connections;
      for (const [db, product, projectTable, versionTable] of [[primary, 'ORCAPRO', 'OrcaproProject', 'OrcaproProjectVersion'], [infra, 'INFRA', 'InfraProject', 'InfraProjectVersion']] as const) {
        // System maintenance discovers partitions; every subsequent operation is tenant scoped.
        const projects = await db.query('SELECT DISTINCT entity_id,tenant_id FROM VersionRetention');
        for (const item of projects) {
          await db.beginTransaction();
          try {
            const isInfra = product === 'INFRA', tenantColumn = isInfra ? 'tenant_id' : 'tenantId';
            const projectColumn = isInfra ? 'project_id' : 'projectId';
            const parents = await db.query(`SELECT id,version FROM ${projectTable} WHERE id=? AND ${tenantColumn}=? FOR UPDATE`, [item.entity_id, item.tenant_id]);
            if (!parents.length) { await db.rollback(); continue; }
            // A failed source/audit lookup fails closed. Contract ledgers themselves are never purged.
            const sources = await contracts.query('SELECT source_version FROM GcSource WHERE tenant_id=? AND product=? AND project_id=?', [item.tenant_id, product, item.entity_id]);
            const audits = await db.query(isInfra
              ? "SELECT entity_id AS entityId,payload AS metadata FROM InfraAudit WHERE tenant_id=? AND (action LIKE 'export.%' OR action LIKE 'risk.%')"
              : "SELECT entityId,metadata FROM OrcaproAudit WHERE tenantId=? AND (action LIKE 'export.%' OR action LIKE 'risk.%')", [item.tenant_id]);
            const pins = new Set<number>(sources.map((s: any) => Number(s.source_version)));
            for (const event of audits) {
              const m = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;
              if (!m) continue;
              if (event.entityId === item.entity_id && Number.isSafeInteger(m.version)) pins.add(m.version);
              if ((m.sourceProjectId || event.entityId) === item.entity_id && Number.isSafeInteger(m.sourceVersion)) pins.add(m.sourceVersion);
            }
            for (const version of pins) await db.query('UPDATE VersionRetention SET protected=1 WHERE entity_id=? AND tenant_id=? AND version=?', [item.entity_id, item.tenant_id, version]);
            const rows = await db.query<HistoryRow[]>(historySelectSql + ' ORDER BY version FOR UPDATE', [item.entity_id, item.tenant_id]);
            const expired = disposableVersions(rows).filter(v => v !== parents[0].version);
            for (const version of expired) {
              await db.query(`DELETE v FROM ${versionTable} v JOIN ${projectTable} p ON p.id=v.${projectColumn} WHERE p.id=? AND p.${tenantColumn}=? AND v.version=?`, [item.entity_id, item.tenant_id, version]);
              await db.query('DELETE FROM VersionRetention WHERE entity_id=? AND tenant_id=? AND version=?', [item.entity_id, item.tenant_id, version]);
            }
            if (expired.length) {
              const details = JSON.stringify({ initiator: 'system', policy: 'session-day-v1', recoveryHours: 24, versions: expired });
              const systemId = '00000000-0000-0000-0000-000000000000';
              await db.query(isInfra
                ? "INSERT INTO InfraAudit(id,tenant_id,user_id,action,entity,entity_id,payload) VALUES(?,?,?,'history.consolidate','project',?,?)"
                : "INSERT INTO OrcaproAudit(id,tenantId,actorUserId,action,entityId,metadata) VALUES(?,?,?,'history.consolidate',?,?)", [randomUUID(), item.tenant_id, systemId, item.entity_id, details]);
            }
            await db.commit();
          } catch (error) { await db.rollback(); throw error; }
        }
      }
    } catch { this.logger.error('Consolidação interrompida; históricos não processados preservados.'); }
    finally { for (const db of connections) await db.end().catch(() => undefined); this.running = false; }
  }
}
