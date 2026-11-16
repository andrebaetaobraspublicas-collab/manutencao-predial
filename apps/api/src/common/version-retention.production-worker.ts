import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mariadb, { Connection } from 'mariadb';
import { randomUUID } from 'node:crypto';
import { parseMySqlUrl } from '../prisma/database-url';
import { disposableVersions, historySelectSql, HistoryRow, productionVersionRetentionEnabled } from './version-retention';

const parse = (value: any) => typeof value === 'string' ? JSON.parse(value) : value;
const stable = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

/** Separate worker: never opens Infra or development connections. Unknown registries fail closed. */
@Injectable()
export class ProductionVersionRetentionWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(ProductionVersionRetentionWorker.name);
  constructor(private readonly config: ConfigService) {}
  onModuleInit() {
    if (!productionVersionRetentionEnabled(this.config)) return;
    this.timer = setInterval(() => void this.run(), 60000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async run() {
    if (this.running || !productionVersionRetentionEnabled(this.config)) return;
    this.running = true;
    let db: Connection | undefined;
    try {
      if (this.config.get('GESTAO_DATABASE_URL')) throw Error('Unreviewed external contract registry');
      const options = parseMySqlUrl(this.config.getOrThrow('DATABASE_URL'));
      if (options.database !== 'u528277311_orcapro_live') throw Error('Unexpected database');
      db = await mariadb.createConnection({ ...options, connectTimeout: 10000 });
      await db.query('SET SESSION innodb_lock_wait_timeout=10');
      const foreignKeys = await db.query("SELECT table_name FROM information_schema.key_column_usage WHERE referenced_table_schema=DATABASE() AND referenced_table_name='OrcaproProjectVersion'");
      if (foreignKeys.length) throw Error('Unreviewed historical foreign key');
      const registries = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE 'Gc%'");
      if (registries.length) throw Error('Unreviewed contract registry');
      const projects = await db.query('SELECT DISTINCT entity_id,tenant_id FROM VersionRetention WHERE protected=0 AND session_key IS NOT NULL AND superseded_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR)');
      for (const item of projects) {
        await db.beginTransaction();
        try {
          const parents = await db.query('SELECT id,version FROM OrcaproProject WHERE id=? AND tenantId=? FOR UPDATE', [item.entity_id, item.tenant_id]);
          if (!parents.length) { await db.rollback(); continue; }
          const rows = await db.query<HistoryRow[]>(historySelectSql + ' ORDER BY version FOR UPDATE', [item.entity_id, item.tenant_id]);
          let expired = disposableVersions(rows).filter(v => v !== parents[0].version);
          if (!expired.length) { await db.rollback(); continue; }
          // Opaque contract references conservatively protect the entire budget.
          if (await this.contractReferences(db, item.tenant_id, item.entity_id)) { await db.rollback(); continue; }
          const pins = new Set<number>([parents[0].version]);
          const audits = await db.query("SELECT entityId,metadata FROM OrcaproAudit WHERE tenantId=? AND (action LIKE 'risk.%' OR action LIKE 'export.%') FOR UPDATE", [item.tenant_id]);
          for (const event of audits) {
            const m = parse(event.metadata) || {};
            if (event.entityId === item.entity_id) {
              if (Number.isSafeInteger(m.version)) pins.add(m.version);
              if (Number.isSafeInteger(m.details?.sourceVersion)) pins.add(m.details.sourceVersion);
            }
            if ((m.sourceProjectId || event.entityId) === item.entity_id && Number.isSafeInteger(m.sourceVersion)) pins.add(m.sourceVersion);
          }
          // Read only the risk section, not the full multi-megabyte budget documents.
          const history = await db.query("SELECT v.version,JSON_EXTRACT(v.data,'$.risks') risks FROM OrcaproProjectVersion v JOIN OrcaproProject p ON p.id=v.projectId WHERE p.id=? AND p.tenantId=? ORDER BY v.version FOR UPDATE", [item.entity_id, item.tenant_id]);
          let previous: { version: number; risk: string | undefined } | undefined;
          for (const row of history) {
            const risks = parse(row.risks);
            for (const analysis of Array.isArray(risks?.analyses) ? risks.analyses : []) {
              if (Number.isSafeInteger(analysis?.snapshot?.projectVersion)) pins.add(analysis.snapshot.projectVersion);
            }
            const risk = stable(risks ?? null);
            if (risk !== previous?.risk && risk !== 'null') { pins.add(row.version); if (previous) pins.add(previous.version); }
            if (previous && previous.risk !== 'null' && risk !== previous.risk) pins.add(previous.version);
            previous = { version: row.version, risk };
          }
          const existing = new Set(history.map((row: any) => row.version));
          if ([...pins].some(version => !existing.has(version))) throw Error('Missing referenced history');
          for (const version of pins) await db.query('UPDATE VersionRetention SET protected=1 WHERE entity_id=? AND tenant_id=? AND version=?', [item.entity_id, item.tenant_id, version]);
          expired = expired.filter(version => !pins.has(version));
          for (const version of expired) {
            const deleted = await db.query('DELETE v FROM OrcaproProjectVersion v JOIN OrcaproProject p ON p.id=v.projectId WHERE p.id=? AND p.tenantId=? AND v.version=?', [item.entity_id, item.tenant_id, version]);
            if (Number(deleted.affectedRows) !== 1) throw Error('Unexpected historical row count');
            await db.query('DELETE FROM VersionRetention WHERE entity_id=? AND tenant_id=? AND version=?', [item.entity_id, item.tenant_id, version]);
          }
          if (expired.length) await db.query("INSERT INTO OrcaproAudit(id,tenantId,actorUserId,action,entityId,metadata) VALUES(?,?,?,'history.consolidate',?,?)", [randomUUID(), item.tenant_id, '00000000-0000-0000-0000-000000000000', item.entity_id, JSON.stringify({ initiator: 'system', policy: 'session-day-v1', recoveryHours: 24, versions: expired })]);
          await db.commit();
        } catch (error) { await db.rollback(); throw error; }
      }
    } catch { this.logger.error('Consolidação OrçaPro interrompida; históricos não processados preservados.'); }
    finally { await db?.end().catch(() => undefined); this.running = false; }
  }
  private async contractReferences(db: Connection, tenant: string, project: string): Promise<boolean> {
    const columns = await db.query("SELECT table_name t,column_name c FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name LIKE 'Contract%' AND (data_type IN ('json','longtext','text') OR column_name REGEXP 'source.*(project|version)|project.*id')");
    const groups = new Map<string, string[]>();
    for (const row of columns) {
      if (!/^[A-Za-z0-9_]+$/.test(row.t + row.c)) throw Error('Invalid identifier');
      groups.set(row.t, [...(groups.get(row.t) || []), row.c]);
    }
    for (const [table, fields] of groups) {
      // A missing tenant column raises an error and prevents cleanup.
      const records = await db.query('SELECT ' + fields.map(c => '`' + c + '`').join(',') + ' FROM `' + table + '` WHERE tenantId=? FOR UPDATE', [tenant]);
      for (const record of records) for (const field of fields) {
        const ids = JSON.stringify(record[field] ?? '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
        if (ids.some(id => id.toLowerCase() === project.toLowerCase())) return true;
      }
    }
    return false;
  }
}
