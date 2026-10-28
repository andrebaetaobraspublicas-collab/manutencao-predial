import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { auditDetails, auditPeriod } from '../orcapro/orcapro-audit';
import { AuditListQuery, AuditNavigationDto } from '../orcapro/orcapro.dto';
import { InfraDatabase } from './infra-db';
import { InfraAccess } from './infra.guard';
import { parsed } from './infra-domain';

const ANONYMOUS = '00000000-0000-0000-0000-000000000000';
const ACCESS_ACTIONS = ['access.login','access.login.failed','access.logout','access.request','access.request.failed'];
type Actor = Pick<AuthenticatedUser, 'userId' | 'tenantId'>;
type EventRow = { id: string; tenantId: string; actorUserId: string; action: string; entity: string; entityId: string; payload: unknown; createdAt: Date };

@Injectable()
export class InfraAuditService {
  private readonly logger = new Logger(InfraAuditService.name);
  constructor(private readonly db: InfraDatabase, private readonly primary: PrismaService, private readonly access: InfraAccess) {}

  // Observability must never turn a completed business operation into a retry.
  async record(actor: Actor | undefined, action: string, entity: string, entityId: string, metadata: unknown = {}) {
    try {
      await this.db.query('INSERT INTO InfraAudit(id,tenant_id,user_id,action,entity,entity_id,payload) VALUES(?,?,?,?,?,?,?)',
        [randomUUID(),actor?.tenantId ?? ANONYMOUS,actor?.userId ?? ANONYMOUS,action,entity,entityId.slice(0,100),JSON.stringify(auditDetails(metadata))]);
    } catch { this.logger.error('Falha ao registrar atividade Infraestrutura; nenhuma credencial foi registrada.'); }
  }

  async navigation(user: AuthenticatedUser, dto: AuditNavigationDto) {
    if (dto.projectId) {
      const rows = await this.db.query<{ id: string }[]>('SELECT id FROM InfraProject WHERE id=? AND tenant_id=? AND user_id=? AND deleted_at IS NULL',[dto.projectId,user.tenantId,user.userId]);
      if (!rows.length) throw new NotFoundException('Orçamento não encontrado na sua conta.');
    }
    await this.record(user,'activity.navigation','project',dto.projectId ?? 'infraestrutura',{ screen: dto.screen });
    return { recorded: true };
  }

  async logs(user: AuthenticatedUser, query: AuditListQuery) {
    const principal = await this.access.principal(user);
    if (principal?.status !== 'ACTIVE' || !(this.access.configuredAdmin(user.userId) || principal.role === 'ADMIN')) throw new ForbiddenException('Auditoria global Infraestrutura restrita.');
    const period = auditPeriod(query.from,query.to), conditions: string[] = [], values: unknown[] = [];
    if (query.user?.trim()) {
      // This explicit global product administration is the only cross-tenant
      // identity lookup. Literal matching avoids wildcard/collation surprises.
      const term = query.user.trim();
      const [central,local] = await Promise.all([
        this.primary.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM User WHERE LOCATE(CONVERT(${term} USING utf8mb4) COLLATE utf8mb4_unicode_ci,name COLLATE utf8mb4_unicode_ci)>0 OR LOCATE(CONVERT(${term} USING utf8mb4) COLLATE utf8mb4_unicode_ci,email COLLATE utf8mb4_unicode_ci)>0`),
        this.db.query<{ id: string }[]>('SELECT external_user_id AS id FROM InfraUser WHERE LOCATE(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci,name COLLATE utf8mb4_unicode_ci)>0 OR LOCATE(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci,email COLLATE utf8mb4_unicode_ci)>0',[term,term]),
      ]);
      const ids = [...new Set([...central,...local].map(row=>row.id))];
      conditions.push(ids.length ? `a.user_id IN (${ids.map(()=>'?').join(',')})` : '1=0'); values.push(...ids);
    }
    if (period.gte) { conditions.push('a.created_at>=?'); values.push(period.gte); }
    if (period.lt) { conditions.push('a.created_at<?'); values.push(period.lt); }
    if (query.category === 'access' || query.category === 'activity') {
      conditions.push(`a.action ${query.category==='activity'?'NOT ':''}IN (${ACCESS_ACTIONS.map(()=>'?').join(',')})`); values.push(...ACCESS_ACTIONS);
    } else if (query.category === 'failure') { conditions.push("(a.action IN ('access.login.failed','access.request.failed','user.password.failed'))"); }
    const where = conditions.length ? ' WHERE '+conditions.join(' AND ') : '';
    return this.db.transaction(async db=>{
      const count = await db.query('SELECT COUNT(*) AS total FROM InfraAudit a'+where,values) as { total: bigint | number }[];
      const total = Number(count[0].total), pages = Math.max(1,Math.ceil(total/query.pageSize)), page = Math.min(query.page,pages);
      const items = await db.query('SELECT a.id,a.tenant_id AS tenantId,a.user_id AS actorUserId,a.action,a.entity,a.entity_id AS entityId,a.payload,a.created_at AS createdAt FROM InfraAudit a'+where+' ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?',[...values,query.pageSize,(page-1)*query.pageSize]) as EventRow[];
      const actorIds = [...new Set(items.map(row=>row.actorUserId))], entityIds = [...new Set(items.map(row=>row.entityId))];
      const [actors,profiles,projects,targets] = await Promise.all([
        actorIds.length ? this.primary.user.findMany({ where: { id: { in: actorIds } },select: { id: true,name: true,email: true } }) : [],
        actorIds.length ? db.query('SELECT external_user_id AS id,name,email FROM InfraUser WHERE external_user_id IN ('+actorIds.map(()=>'?').join(',')+')',actorIds) as Promise<{id:string;name:string;email:string}[]> : [],
        entityIds.length ? db.query('SELECT id,name FROM InfraProject WHERE id IN ('+entityIds.map(()=>'?').join(',')+')',entityIds) as Promise<{id:string;name:string}[]> : [],
        entityIds.length ? this.primary.user.findMany({ where: { id: { in: entityIds } },select: { id: true,name: true } }) : [],
      ]);
      return { items: items.map(row=>{
        const details = auditDetails(parsed(row.payload));
        return { ...row,userId: row.actorUserId,payload: details,
          metadata: details && typeof details === 'object' && !Array.isArray(details) ? details : details === null ? null : { details },
          actor: actors.find(a=>a.id===row.actorUserId) ?? profiles.find(a=>a.id===row.actorUserId) ?? null,
          entityName: (row.entity === 'project' ? projects.find(p=>p.id===row.entityId)?.name : targets.find(p=>p.id===row.entityId)?.name) ?? null };
      }),total,page,pages,pageSize: query.pageSize,timezone: 'America/Sao_Paulo' };
    });
  }
}
