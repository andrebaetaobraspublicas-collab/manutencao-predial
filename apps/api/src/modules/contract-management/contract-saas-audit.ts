import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { defer, lastValueFrom } from 'rxjs';
import { auditDetails, auditPeriod } from '../orcapro/orcapro-audit';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ContractDatabase, ContractSql } from './contract-db';
import { ContractSaasAccess } from './contract-saas-access';
import { GcAuditQuery } from './contract-saas.dto';

const ZERO = '00000000-0000-0000-0000-000000000000';
export async function saasAudit(db: ContractSql, actor: Pick<AuthenticatedUser,'tenantId'|'userId'>, kind: string, entity: string, details: unknown) {
  await db.query('INSERT INTO GcSaasAudit(id,tenant_id,actor_id,kind,entity_id,details) VALUES(?,?,?,?,?,?)',
    [randomUUID(),actor.tenantId,actor.userId,kind,entity,JSON.stringify(auditDetails(details))]);
}
// Global metadata directory is explicitly authorized by the product SaaS role.
// Contract contents and documents remain under tenant/contract permissions.
const auditUnion = `SELECT id,tenant_id,actor_id,kind,entity_id,details,created_at FROM GcSaasAudit
 UNION ALL SELECT id,tenant_id,COALESCE(actor_id,owner_id),CONCAT('contract.',kind),contract_id,
 JSON_OBJECT('version',version,'title',JSON_UNQUOTE(JSON_EXTRACT(payload,'$.title'))),created_at FROM GcAction
 UNION ALL SELECT id,tenant_id,actor_id,kind,contract_id,details,created_at FROM GcAdministrativeAudit
 UNION ALL SELECT id,tenant_id,owner_id,CONCAT('stripe.',type),owner_id,JSON_OBJECT('stripeCreated',stripe_created),processed_at FROM GcBillingEvent`;
@Injectable()
export class ContractSaasAudit {
  private readonly logger = new Logger(ContractSaasAudit.name);
  constructor(private readonly db: ContractDatabase, private readonly primary: PrismaService, private readonly access: ContractSaasAccess) {}
  async observe(actor: Pick<AuthenticatedUser,'tenantId'|'userId'>|undefined, kind: string, entity: string, details: unknown) {
    try { await saasAudit(this.db as ContractSql,actor || {tenantId:ZERO,userId:ZERO},kind,entity,details); }
    catch { this.logger.error('Falha na auditoria de acesso da Gestão Contratual. Credenciais não registradas.'); }
  }
  async passwordChange(actor: AuthenticatedUser, failed: boolean, status: number) {
    // The shared identity endpoint also serves other products. Record only an
    // existing Gestao membership, resolved from the authenticated tenant.
    try {
      const rows=await this.db.query('SELECT id FROM GcSaasUser WHERE tenant_id=? AND user_id=? LIMIT 1',[actor.tenantId,actor.userId]);
      if(rows.length)await this.observe(actor,failed?'account.password.failed':'account.password.changed',actor.userId,{status,sharedIdentity:true,sessionsRevoked:!failed});
    } catch { this.logger.error('Falha ao registrar metadados da alteração de senha; auditoria central preservada.'); }
  }
  async logs(actor: AuthenticatedUser, query: GcAuditQuery) {
    await this.access.assertAdmin(actor);
    const period = auditPeriod(query.from,query.to), clauses: string[] = [], params: unknown[] = [];
    if (period.gte) {clauses.push('a.created_at>=?');params.push(period.gte);}
    if (period.lt) {clauses.push('a.created_at<?');params.push(period.lt);}
    if (query.entity) {clauses.push('a.entity_id=?');params.push(query.entity);}
    if (query.category==='access') clauses.push("a.kind LIKE 'access.%'");
    if (query.category==='activity') clauses.push("a.kind NOT LIKE 'access.%'");
    if (query.category==='failure') clauses.push("a.kind LIKE '%.failed'");
    if (query.user?.trim()) {
      const term=query.user.trim();
      const ids=await this.primary.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM User WHERE LOCATE(CONVERT(${term} USING utf8mb4) COLLATE utf8mb4_unicode_ci,name COLLATE utf8mb4_unicode_ci)>0 OR LOCATE(CONVERT(${term} USING utf8mb4) COLLATE utf8mb4_unicode_ci,email COLLATE utf8mb4_unicode_ci)>0`);
      clauses.push(ids.length?`a.actor_id IN (${ids.map(()=>'?').join(',')})`:'1=0');params.push(...ids.map(r=>r.id));
    }
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const total=Number((await this.db.query(`SELECT COUNT(*) AS n FROM (${auditUnion}) a${where}`,params))[0].n),pages=Math.max(1,Math.ceil(total/query.pageSize)),page=Math.min(query.page,pages);
    const rows=await this.db.query<any[]>(`SELECT * FROM (${auditUnion}) a${where} ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?`,[...params,query.pageSize,(page-1)*query.pageSize]);
    const ids=[...new Set(rows.map(r=>r.actor_id))], actors=ids.length?await this.primary.user.findMany({where:{id:{in:ids}},select:{id:true,name:true,email:true}}):[];
    return {items:rows.map(r=>({id:r.id,tenantId:r.tenant_id,actorUserId:r.actor_id,actor:actors.find(a=>a.id===r.actor_id)||null,action:r.kind,entityId:r.entity_id,createdAt:r.created_at,metadata:auditDetails(typeof r.details==='string'?JSON.parse(r.details):r.details)})),total,page,pages,pageSize:query.pageSize};
  }
}
@Injectable()
export class ContractSaasAuditInterceptor implements NestInterceptor {
  constructor(private readonly db: ContractDatabase, private readonly audit: ContractSaasAudit) {}
  intercept(ctx: ExecutionContext,next: CallHandler) {
    if(ctx.getType()!=='http'||!this.db.enabled())return next.handle();
    const req=ctx.switchToHttp().getRequest(),res=ctx.switchToHttp().getResponse(),path=String(req.path||'').replace(/\/+$/,'');
    const login=path.endsWith('/auth/gestao/login'),password=path.endsWith('/auth/password/change')&&req.method==='POST'&&!!req.user,product=path.includes('/contract-management/');
    if(!login&&!password&&(!product||!req.user)||req.method==='OPTIONS'||/\/(admin|activity)\//.test(path)||/\/(access|capacity|sources|config|content)$/.test(path)||path.endsWith('/billing/webhook'))return next.handle();
    // Exclude high-frequency worksheet reads; source actions already have their immutable ledger.
    if(req.method==='GET'&&!/\/contracts\/[^/]+$|\/export$|\/download$/.test(path))return next.handle();
    const started=Date.now();
    return defer(async()=>{
      let result:any,failure:unknown;try{result=await lastValueFrom(next.handle());}catch(e){failure=e;}
      const actor=req.user||result?.user,status=failure?failure instanceof HttpException?failure.getStatus():500:res.statusCode;
      if(password)await this.audit.passwordChange(actor,!!failure,status);
      else await this.audit.observe(actor,login?(failure?'access.login.failed':'access.login'):(failure?'access.request.failed':'access.request'),String(req.params?.id||'gestao-contratual').slice(0,100),{method:req.method,route:String(req.route?.path||'').slice(0,200),status,durationMs:Date.now()-started});
      if(failure)throw failure;return result;
    });
  }
}
