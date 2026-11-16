import { ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { parseMySqlUrl } from '../../prisma/database-url';
import { OrcaproService } from '../orcapro/orcapro.service';
import { InfraService } from '../infraestrutura/infra.service';
import { ContractDatabase } from './contract-db';
import { ReadonlySourceSql, sourcePrisma } from './contract-readonly';

type Product = 'ORCAPRO' | 'INFRA';
type Local = Pick<AuthenticatedUser, 'tenantId' | 'userId'>;
/** Trial/demo access is not an existing paid/manual subscription. */
export function baseSubscriptionActive(row: any, now = new Date()) {
  return !!row && ['ACTIVE', 'MANUAL_CONTRACT'].includes(row.status)
    && (!row.currentPeriodEnd || new Date(row.currentPeriodEnd) > now)
    && (row.billingSource !== 'STRIPE' || !!row.currentPeriodEnd);
}

@Injectable()
export class ContractSources implements OnModuleDestroy {
  private identities = new Map<Product, ReturnType<typeof sourcePrisma>>();
  private infraData?: ReadonlySourceSql;
  private orca?: OrcaproService;
  private infra?: InfraService;
  constructor(private readonly config: ConfigService, private readonly db: ContractDatabase, private readonly primary: PrismaService) {}
  private url(key: string) {
    const url = this.config.get<string>(key);
    if (!url) throw new ServiceUnavailableException('Integração de origem indisponível.');
    const database = parseMySqlUrl(url).database;
    if (['DATABASE_URL', 'GESTAO_DATABASE_URL'].some(k => this.config.get(k) && parseMySqlUrl(this.config.get<string>(k)!).database === database)) throw new ServiceUnavailableException('A origem não pode ser o banco da Gestão Contratual.');
    return url;
  }
  private identity(product: Product) {
    if (!this.identities.has(product)) this.identities.set(product, sourcePrisma(this.url(`GESTAO_SOURCE_${product}_AUTH_URL`)));
    return this.identities.get(product)!;
  }
  private infraDb() { return this.infraData ??= new ReadonlySourceSql(this.url('GESTAO_SOURCE_INFRA_DATA_URL')); }
  private sourceAdmin(product: Product, id: string) { return String(this.config.get(`GESTAO_SOURCE_${product}_ADMIN_IDS`) || '').split(',').map(x => x.trim()).includes(id); }
  private async candidate(product: Product, where: { id?: string; email?: string }, tenantId?: string) {
    const source = this.identity(product);
    const user = await source.user.findUnique({ where: where as any, include: { orcaproSubscription: true, orcaproAccess: true } });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt || user.orcaproAccess?.enabled === false || user.orcaproAccess?.deletedAt) return null;
    const member = await source.tenantMembership.findFirst({ where: { userId: user.id, ...(tenantId || user.orcaproSubscription?.tenantId ? { tenantId: tenantId || user.orcaproSubscription!.tenantId } : {}), status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], tenant: { deletedAt: null, status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELED'] } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { tenant: true } });
    if (!member) return null;
    if (product === 'INFRA') {
      const profile = (await this.infraDb().query<any[]>('SELECT status,deleted_at FROM InfraUser WHERE external_user_id=? AND tenant_id=? LIMIT 1', [user.id, member.tenantId]))[0];
      if (!profile || profile.status !== 'ACTIVE' || profile.deleted_at) return null;
    }
    const entitled = user.orcaproSubscription?.tenantId === member.tenantId && baseSubscriptionActive(user.orcaproSubscription);
    return { product, user, member, entitled: !!entitled, readable: !!entitled || this.sourceAdmin(product, user.id) };
  }
  async eligibility(local: Local) {
    const mappings = await this.db.query<any[]>('SELECT product,source_user_id,source_tenant_id FROM GcSourceIdentity WHERE tenant_id=? AND user_id=?', [local.tenantId, local.userId]);
    const products: Product[] = [];
    let unavailable = false;
    for (const mapping of mappings) {
      try { if ((await this.candidate(mapping.product, { id: mapping.source_user_id }, mapping.source_tenant_id))?.entitled) products.push(mapping.product); }
      catch { unavailable = true; }
    }
    return { eligible: products.length > 0, products, unavailable, required: true, message: products.length ? 'Assinatura prévia confirmada.' : unavailable ? 'Não foi possível confirmar a assinatura de origem. Tente novamente.' : 'É necessário manter assinatura ativa do OrçaPro ou do OrçaPro Infraestrutura. Períodos de teste não habilitam esta contratação.' };
  }
  async assertEligible(local: Local) { const result = await this.eligibility(local); if (!result.eligible) throw new ForbiddenException(result.message); }
  private async principal(local: Local, product: Product): Promise<AuthenticatedUser> {
    const mapping = (await this.db.query<any[]>('SELECT source_user_id,source_tenant_id FROM GcSourceIdentity WHERE tenant_id=? AND user_id=? AND product=?', [local.tenantId, local.userId, product]))[0];
    if (!mapping) throw new NotFoundException('Conta de origem não vinculada.');
    const found = await this.candidate(product, { id: mapping.source_user_id }, mapping.source_tenant_id);
    if (!found?.readable) throw new ForbiddenException('Assinatura de origem inativa ou conta bloqueada.');
    return { userId: found.user.id, tenantId: found.member.tenantId, membershipId: found.member.id, tenantSlug: found.member.tenant.slug, email: found.user.email, name: found.user.name, role: found.member.role, maintenanceAccess: false };
  }
  /** First login creates a local identity only after checking an existing subscription + password. */
  async prepareLogin(email: string, password: string) {
    email = email.trim().toLowerCase();
    const existing = await this.primary.user.findUnique({ where: { email } });
    if (existing) return; // Local password changes never propagate to, or get overwritten by, a source.
    const verified: NonNullable<Awaited<ReturnType<ContractSources['candidate']>>>[] = [];
    let unavailable = false;
    for (const product of ['ORCAPRO', 'INFRA'] as const) {
      try { const found = await this.candidate(product, { email }); if (found?.entitled && await compare(password, found.user.passwordHash)) verified.push(found); }
      catch { unavailable = true; }
    }
    if (!verified.length) {
      if (unavailable) throw new ServiceUnavailableException('Não foi possível confirmar sua conta de origem. Tente novamente.');
      throw new UnauthorizedException('Use as credenciais de uma assinatura ativa do OrçaPro ou do OrçaPro Infraestrutura.');
    }
    const first = verified[0], id = randomUUID();
    try {
      await this.primary.$transaction(async db => {
        const tenant = await db.tenant.create({ data: { name: first.member.tenant.name, slug: `gestao-${id}`, status: 'ACTIVE' } });
        await db.user.create({ data: { id, name: first.user.name, email, passwordHash: first.user.passwordHash, status: 'ACTIVE' } });
        const member = await db.tenantMembership.create({ data: { tenantId: tenant.id, userId: id, role: 'REQUESTER', status: 'ACTIVE', maintenanceAccess: false, acceptedAt: new Date() } });
        await db.$executeRawUnsafe("INSERT INTO GcSaasUser(id,membership_id,tenant_id,user_id,status,billing_source) VALUES(?,?,?,?,'ACTIVE','STRIPE')", randomUUID(), member.id, tenant.id, id);
        for (const found of verified) await db.$executeRawUnsafe('INSERT INTO GcSourceIdentity(tenant_id,user_id,product,source_user_id,source_tenant_id) VALUES(?,?,?,?,?)', tenant.id, id, found.product, found.user.id, found.member.tenantId);
        await db.$executeRawUnsafe('INSERT INTO GcSaasAudit(id,tenant_id,actor_id,kind,entity_id,details) VALUES(?,?,?,?,?,?)', randomUUID(), tenant.id, id, 'identity.source-replicated', id, JSON.stringify({ products: verified.map(v => v.product), sourceWrites: false }));
      });
    } catch (e) { if ((e as any)?.code === 'P2002') throw new ConflictException('A conta foi criada por outra solicitação. Entre novamente.'); throw e; }
  }
  async link(local: AuthenticatedUser, product: Product, password: string) {
    if (!['ORCAPRO', 'INFRA'].includes(product)) throw new ForbiddenException();
    const found = await this.candidate(product, { email: local.email });
    if (!found?.entitled || !(await compare(password, found.user.passwordHash))) throw new UnauthorizedException('Credenciais ou assinatura de origem inválidas.');
    await this.db.transaction(async db => {
      const prior = (await db.query('SELECT source_user_id,source_tenant_id FROM GcSourceIdentity WHERE tenant_id=? AND user_id=? AND product=? FOR UPDATE', [local.tenantId, local.userId, product]))[0];
      if (prior && (prior.source_user_id !== found.user.id || prior.source_tenant_id !== found.member.tenantId)) throw new ConflictException('A origem já vinculada exige conferência administrativa.');
      await db.query('INSERT IGNORE INTO GcSourceIdentity(tenant_id,user_id,product,source_user_id,source_tenant_id) VALUES(?,?,?,?,?)', [local.tenantId, local.userId, product, found.user.id, found.member.tenantId]);
      await db.query('INSERT INTO GcSaasAudit(id,tenant_id,actor_id,kind,entity_id,details) VALUES(?,?,?,?,?,?)', [randomUUID(), local.tenantId, local.userId, 'identity.source-linked', local.userId, JSON.stringify({ product, sourceWrites: false })]);
    });
    return this.eligibility(local);
  }
  orcaAdapter() {
    const service = () => this.orca ??= new OrcaproService(this.identity('ORCAPRO') as any, {} as any, this.config);
    return {
      projects: async (u: AuthenticatedUser) => service().projects(await this.principal(u, 'ORCAPRO')),
      project: async (u: AuthenticatedUser, id: string) => service().project(await this.principal(u, 'ORCAPRO'), id),
      calculation: async (u: AuthenticatedUser, id: string) => service().calculation(await this.principal(u, 'ORCAPRO'), id),
      graph: (...args: Parameters<OrcaproService['graph']>) => service().graph(...args),
    };
  }
  accessAdapter() { return { enabledFor: async (u: AuthenticatedUser) => { try { await this.principal(u, 'ORCAPRO'); return true; } catch { return false; } } }; }
  infraAdapter() {
    const service = () => this.infra ??= new InfraService(this.infraDb() as any, this.config, this.identity('INFRA') as any, { configuredAdmin: (id: string) => this.sourceAdmin('INFRA', id) } as any);
    return {
      contractSources: async (u: AuthenticatedUser) => service().contractSources(await this.principal(u, 'INFRA')),
      project: async (u: AuthenticatedUser, id: string) => service().project(await this.principal(u, 'INFRA'), id),
      contractSnapshot: async (u: AuthenticatedUser, id: string) => service().contractSnapshot(await this.principal(u, 'INFRA'), id),
    };
  }
  async onModuleDestroy() { await Promise.all([...this.identities.values()].map(p => p.$disconnect())); await this.infraData?.close(); }
}
