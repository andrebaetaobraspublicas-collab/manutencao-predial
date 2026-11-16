import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ContractDatabase, ContractSql } from './contract-db';

export function profileAllowsLogin(row: any) { return !row || (!row.deleted_at && row.status === 'ACTIVE'); }
export function manualLicence(row: any): boolean | undefined {
  if (!profileAllowsLogin(row)) return false;
  if (row?.billing_source !== 'MANUAL') return undefined;
  return ['ACTIVE','TRIALING','MANUAL_CONTRACT'].includes(row.manual_status) &&
    (row.manual_period_end ? new Date(row.manual_period_end).getTime() > Date.now() : row.manual_status !== 'TRIALING');
}
@Injectable()
export class ContractSaasAccess {
  constructor(private readonly db: ContractDatabase, private readonly config: ConfigService) {}
  root(user: AuthenticatedUser) { return this.db.enabled() && user.email.toLowerCase() === String(this.config.get('GESTAO_ADMIN_EMAIL') || '').trim().toLowerCase() && this.rootId(user.userId); }
  rootId(id: string) { return String(this.config.get('GESTAO_ADMIN_USER_IDS') || '').split(',').map(x=>x.trim()).includes(id); }
  protectedIdentity(id: string) { return ['GESTAO_ADMIN_USER_IDS','ORCAPRO_ADMIN_USER_IDS','INFRA_ADMIN_USER_IDS'].some(key=>String(this.config.get(key)||'').split(',').map(x=>x.trim()).includes(id)); }
  async profile(user: Pick<AuthenticatedUser,'tenantId'|'userId'>, sql: ContractSql = this.db as ContractSql) {
    return (await sql.query('SELECT * FROM GcSaasUser WHERE tenant_id=? AND user_id=?',[user.tenantId,user.userId]))[0];
  }
  async admin(user: AuthenticatedUser) {
    if (!this.db.enabled()) return false;
    if (this.root(user)) return true;
    const row = await this.profile(user);
    return profileAllowsLogin(row) && row?.role === 'ADMIN';
  }
  async assertAdmin(user: AuthenticatedUser) {
    if (!this.db.enabled()) throw new NotFoundException();
    if (!user?.tenantId || !user.userId || !(await this.admin(user))) throw new ForbiddenException('Gestão do SaaS restrita aos administradores deste produto.');
  }
}
