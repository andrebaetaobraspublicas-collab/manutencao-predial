import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrcaproAccess } from './orcapro.guard';
import { subscriptionAllowsAccess } from './orcapro-entitlement';
import { CreateSaasUserDto, SaasListQuery, SaasPasswordDto, SaasPlanDto, SaasSubscriptionDto, SaasUserStatusDto } from './orcapro-saas.dto';

type Db = Prisma.TransactionClient;

@Injectable()
export class OrcaproSaasService {
  constructor(private readonly prisma: PrismaService, private readonly access: OrcaproAccess) {}
  private audit(db: Db, actor: AuthenticatedUser, action: string, entityId: string, metadata: Record<string, unknown>) {
    return db.orcaproAudit.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, action, entityId, metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue } });
  }
  private async target(db: Db, actor: AuthenticatedUser, id: string, protect = true) {
    this.access.assertAdmin(actor);
    if (protect && (id === actor.userId || this.access.role({ ...actor, userId: id }) === 'ADMIN')) {
      throw new BadRequestException('Use a própria conta para sua senha. Administradores globais são protegidos neste módulo.');
    }
    await db.$queryRaw(Prisma.sql`SELECT id FROM User WHERE id = ${id} AND deletedAt IS NULL FOR UPDATE`);
    const user = await db.user.findFirst({ where: { id, deletedAt: null }, include: { orcaproAccess: true, memberships: { where: { status: 'ACTIVE', tenant: { deletedAt: null } }, select: { tenantId: true } } } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }
  async users(actor: AuthenticatedUser, query: SaasListQuery) {
    this.access.assertAdmin(actor);
    const where: Prisma.UserWhereInput = { deletedAt: null,
      ...(query.search ? { OR: [{ name: { contains: query.search } }, { email: { contains: query.search } }] } : {}),
      ...(query.deleted === 'true' ? { orcaproAccess: { deletedAt: { not: null } } } : { NOT: { orcaproAccess: { deletedAt: { not: null } } } }),
    };
    const [items, total] = await Promise.all([this.prisma.user.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize,
      select: { id: true, name: true, email: true, status: true, createdAt: true, orcaproAccess: true, orcaproSubscription: { include: { plan: true } }, memberships: { where: { tenant: { deletedAt: null } }, select: { id: true, status: true, maintenanceAccess: true, tenant: { select: { id: true, name: true, slug: true } } } } },
    }), this.prisma.user.count({ where })]);
    return { items: items.map(user => ({ ...user, protected: this.access.role({ ...actor, userId: user.id }) === 'ADMIN',
      accessAllowed: user.status === 'ACTIVE' && user.memberships.some(m => m.status === 'ACTIVE') && !user.orcaproAccess?.deletedAt && user.orcaproAccess?.enabled !== false && (this.access.role({ ...actor, userId: user.id }) === 'ADMIN' || subscriptionAllowsAccess(user.orcaproSubscription, user.orcaproAccess?.managed === true)) })), total, page: query.page, pageSize: query.pageSize };
  }
  async createUser(actor: AuthenticatedUser, dto: CreateSaasUserDto) {
    this.access.assertAdmin(actor);
    if (!!dto.organizationName !== !!dto.organizationSlug) throw new BadRequestException('Informe nome e identificador da nova organização juntos.');
    if (dto.name.trim().length < 2 || (dto.organizationName && dto.organizationName.trim().length < 2)) throw new BadRequestException('Nome obrigatório.');
    if (Buffer.byteLength(dto.password, 'utf8') > 72) throw new BadRequestException('A senha deve ter no máximo 72 bytes.');
    const passwordHash = await hash(dto.password, 12);
    try {
      return await this.prisma.$transaction(async db => {
        const tenant = dto.organizationSlug
          ? await db.tenant.create({ data: { name: dto.organizationName!.trim(), slug: dto.organizationSlug, status: 'ACTIVE' } })
          : await db.tenant.findFirst({ where: { id: actor.tenantId, deletedAt: null }, select: { id: true, slug: true } });
        if (!tenant) throw new NotFoundException('Organização indisponível.');
        const user = await db.user.create({ data: { name: dto.name.trim(), email: dto.email.trim().toLowerCase(), passwordHash, status: 'ACTIVE' }, select: { id: true, name: true, email: true } });
        await db.tenantMembership.create({ data: { userId: user.id, tenantId: tenant.id, role: 'REQUESTER', status: 'ACTIVE', acceptedAt: new Date(), maintenanceAccess: false } });
        await db.orcaproUserAccess.create({ data: { userId: user.id, enabled: true, managed: true, updatedByUserId: actor.userId } });
        const periodEnd = new Date(Date.now() + 30 * 86400000);
        await db.orcaproSubscription.create({ data: { userId: user.id, tenantId: tenant.id, status: 'TRIALING', billingSource: 'MANUAL', currentPeriodStart: new Date(), currentPeriodEnd: periodEnd } });
        await this.audit(db, actor, 'saas.user.create', user.id, { customerTenantId: tenant.id, maintenanceAccess: false, trialEndsAt: periodEnd.toISOString() });
        return { ...user, organizationSlug: tenant.slug, trialEndsAt: periodEnd };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('E-mail ou identificador de organização já cadastrado.');
      throw error;
    }
  }
  private async revoke(db: Db, id: string) {
    await db.tenantMembership.updateMany({ where: { userId: id }, data: { sessionVersion: { increment: 1 } } });
    await db.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  async password(actor: AuthenticatedUser, id: string, dto: SaasPasswordDto) {
    if (Buffer.byteLength(dto.newPassword, 'utf8') > 72) throw new BadRequestException('A senha deve ter no máximo 72 bytes.');
    const passwordHash = await hash(dto.newPassword, 12);
    return this.prisma.$transaction(async db => {
      await this.target(db, actor, id);
      await db.user.update({ where: { id }, data: { passwordHash } });
      await db.accountToken.updateMany({ where: { userId: id, purpose: 'PASSWORD_RESET', consumedAt: null }, data: { consumedAt: new Date() } });
      await this.revoke(db, id);
      await this.audit(db, actor, 'saas.user.password', id, { sharedLogin: true, sessionsRevoked: true });
      return { passwordUpdated: true, sessionsRevoked: true };
    });
  }
  async userStatus(actor: AuthenticatedUser, id: string, dto: SaasUserStatusDto) {
    return this.prisma.$transaction(async db => {
      await this.target(db, actor, id);
      const record = await db.orcaproUserAccess.upsert({ where: { userId: id }, create: { userId: id, enabled: dto.status === 'ACTIVE', deletedAt: dto.status === 'DELETED' ? new Date() : null, updatedByUserId: actor.userId }, update: { enabled: dto.status === 'ACTIVE', deletedAt: dto.status === 'DELETED' ? new Date() : null, updatedByUserId: actor.userId } });
      await this.revoke(db, id);
      await this.audit(db, actor, 'saas.user.status', id, { status: dto.status, recoverable: true, maintenancePreserved: true });
      return { status: dto.status, deletedAt: record.deletedAt };
    });
  }
  async revokeSessions(actor: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async db => { await this.target(db, actor, id); await this.revoke(db, id); await this.audit(db, actor, 'saas.user.revoke', id, { sharedLogin: true }); return { sessionsRevoked: true }; });
  }
  async plans(actor?: AuthenticatedUser) {
    return this.prisma.orcaproPlan.findMany({ where: actor ? {} : { active: true }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  }
  async savePlan(actor: AuthenticatedUser, dto: SaasPlanDto, id?: string) {
    this.access.assertAdmin(actor);
    try { return await this.prisma.$transaction(async db => {
      const data = { code: dto.code, name: dto.name.trim(), billingInterval: dto.billingInterval, priceBrl: new Prisma.Decimal(dto.priceBrl), active: dto.active, stripePriceId: dto.stripePriceId ?? null };
      if (id) {
        if (!dto.expectedVersion) throw new BadRequestException('Informe a versão atual do plano.');
        await db.$queryRaw(Prisma.sql`SELECT id FROM OrcaproPlan WHERE id = ${id} FOR UPDATE`);
        const old = await db.orcaproPlan.findUnique({ where: { id } });
        if (old && (old.stripePriceId !== data.stripePriceId || !old.priceBrl.equals(data.priceBrl) || old.billingInterval !== data.billingInterval)
          && await db.orcaproSubscription.count({ where: { OR: [{ planId: id, stripeSubscriptionId: { not: null } }, ...(old.stripePriceId ? [{ stripeCheckoutPriceId: old.stripePriceId, stripeCheckoutId: { not: null } }] : [])] } })) throw new ConflictException('Este plano já tem contratações ou checkouts Stripe. Crie um novo plano para outro preço ou periodicidade.');
        const result = await db.orcaproPlan.updateMany({ where: { id, version: dto.expectedVersion }, data: { ...data, version: { increment: 1 } } });
        if (!result.count) throw new ConflictException('Plano alterado por outra operação. Atualize a tela.');
      }
      const plan = id ? await db.orcaproPlan.findUniqueOrThrow({ where: { id } }) : await db.orcaproPlan.create({ data });
      await this.audit(db, actor, 'saas.plan.save', plan.id, { code: plan.code, version: plan.version });
      return plan;
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Código ou preço Stripe já cadastrado em outro plano.');
      throw error;
    }
  }
  async subscription(actor: AuthenticatedUser, id: string, dto: SaasSubscriptionDto) {
    const end = dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : null;
    if (['ACTIVE', 'TRIALING', 'MANUAL_CONTRACT'].includes(dto.status) && end && end <= new Date()) throw new BadRequestException('A validade precisa estar no futuro para liberar acesso.');
    if (dto.status === 'TRIALING' && !end) throw new BadRequestException('Período de teste exige data final.');
    return this.prisma.$transaction(async db => {
      const target = await this.target(db, actor, id);
      if (dto.planId && !(await db.orcaproPlan.findFirst({ where: { id: dto.planId, active: true } }))) throw new BadRequestException('Selecione um plano ativo.');
      const current = await db.orcaproSubscription.findUnique({ where: { userId: id } });
      if (current && current.version !== dto.expectedVersion) throw new ConflictException('Assinatura alterada por outra operação. Atualize a tela.');
      if (!current && dto.expectedVersion) throw new ConflictException('Assinatura não encontrada nesta versão.');
      const tenantId = current?.tenantId ?? target.memberships.find(m => m.tenantId === actor.tenantId)?.tenantId ?? target.memberships[0]?.tenantId;
      if (!tenantId) throw new BadRequestException('Usuário precisa de uma organização ativa.');
      const data = { status: dto.status, billingSource: 'MANUAL', planId: dto.planId ?? null, currentPeriodStart: current?.currentPeriodStart ?? new Date(), currentPeriodEnd: end };
      if (current) {
        const changed = await db.orcaproSubscription.updateMany({ where: { userId: id, version: dto.expectedVersion }, data: { ...data, version: { increment: 1 } } });
        if (!changed.count) throw new ConflictException('Assinatura alterada por outra operação. Atualize a tela.');
      }
      const result = current ? await db.orcaproSubscription.findUniqueOrThrow({ where: { userId: id } }) : await db.orcaproSubscription.create({ data: { ...data, userId: id, tenantId } });
      await this.audit(db, actor, 'saas.subscription.manual', result.id, { userId: id, customerTenantId: tenantId, status: dto.status, periodEnd: end?.toISOString() ?? null, reason: dto.reason, stripeBillingUnchanged: true });
      return result;
    });
  }
}
