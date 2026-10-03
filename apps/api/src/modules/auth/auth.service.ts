import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import {
  AccountTokenPurpose,
  AuditAction,
  BillingInterval,
  MembershipRole,
  MembershipStatus,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
  Prisma,
} from '../../generated/prisma/client';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { LoginDto } from './dto/login.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import type { JwtPayload } from './jwt-payload.type';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { OperationsService } from '../operations/operations.service';
import { hasOrcaproAccount } from './product-session';
import { OrcaproLoginDto, RegisterOrcaproDto } from './dto/orcapro-account.dto';

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthenticatedUser;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly operations: OperationsService,
  ) {}

  async acceptInvitation(dto: AcceptInvitationDto) {
    const now = new Date();
    const invitation = await this.prisma.tenantInvitation.findUnique({
      where: { tokenHash: this.hashOpaqueToken(dto.token) },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        membership: { include: { user: true } },
      },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= now ||
      invitation.membership.status !== MembershipStatus.INVITED
    ) {
      throw new BadRequestException('Convite inválido, expirado ou já utilizado.');
    }
    if (
      invitation.membership.user.status !== UserStatus.ACTIVE &&
      invitation.membership.user.status !== UserStatus.INVITED
    ) {
      throw new BadRequestException('A conta vinculada ao convite não pode ser ativada.');
    }

    const isNewAccount = invitation.membership.user.status === UserStatus.INVITED;
    if (isNewAccount && (!dto.name?.trim() || !dto.password)) {
      throw new BadRequestException('Nome e senha são obrigatórios para ativar a nova conta.');
    }
    const passwordHash = isNewAccount ? await hash(dto.password!, 12) : undefined;

    await this.prisma.$transaction(async (tx) => {
      const consumedInvitation = await tx.tenantInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt: now },
      });
      if (consumedInvitation.count !== 1) {
        throw new BadRequestException('Convite já utilizado.');
      }
      const activatedMembership = await tx.tenantMembership.updateMany({
        where: { id: invitation.membershipId, status: MembershipStatus.INVITED },
        data: { status: MembershipStatus.ACTIVE, acceptedAt: now },
      });
      if (activatedMembership.count !== 1) {
        throw new BadRequestException('O vínculo deste convite não pode ser ativado.');
      }
      await tx.user.update({
        where: { id: invitation.membership.userId },
        data: {
          name: isNewAccount ? dto.name!.trim() : undefined,
          passwordHash,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: invitation.membership.user.emailVerifiedAt ?? now,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: invitation.tenantId,
          actorUserId: invitation.membership.userId,
          action: AuditAction.INVITE,
          entityType: 'TenantInvitation',
          entityId: invitation.id,
          afterData: { accepted: true, membershipId: invitation.membershipId },
        },
      });
    });

    return {
      accepted: true,
      tenant: invitation.tenant,
      email: invitation.email,
    };
  }

  async inspectInvitation(rawToken: string) {
    const invitation = await this.prisma.tenantInvitation.findUnique({
      where: { tokenHash: this.hashOpaqueToken(rawToken) },
      include: {
        tenant: { select: { name: true, slug: true } },
        membership: { include: { user: { select: { status: true } } } },
      },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date() ||
      invitation.membership.status !== MembershipStatus.INVITED
    ) {
      throw new BadRequestException('Convite inválido, expirado ou já utilizado.');
    }
    return {
      email: invitation.email,
      tenant: invitation.tenant,
      role: invitation.membership.role,
      expiresAt: invitation.expiresAt,
      requiresAccountSetup: invitation.membership.user.status === UserStatus.INVITED,
    };
  }

  async changePassword(user: AuthenticatedUser, dto: ChangePasswordDto): Promise<void> {
    const account = await this.prisma.user.findUnique({ where: { id: user.userId } });
    if (!account || !(await compare(dto.currentPassword, account.passwordHash))) {
      throw new UnauthorizedException('A senha atual está incorreta.');
    }
    if (await compare(dto.newPassword, account.passwordHash)) {
      throw new BadRequestException('A nova senha deve ser diferente da senha atual.');
    }
    const passwordHash = await hash(dto.newPassword, 12);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.userId }, data: { passwordHash } }),
      this.prisma.refreshSession.updateMany({
        where: { userId: user.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.tenantMembership.updateMany({
        where: { userId: user.userId },
        data: { sessionVersion: { increment: 1 } },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AuditAction.PASSWORD_CHANGE,
          entityType: 'User',
          entityId: user.userId,
        },
      }),
    ]);
  }

  async requestPasswordReset(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email, status: UserStatus.ACTIVE, deletedAt: null },
    });
    if (!user) return;

    const rawToken = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      await tx.accountToken.updateMany({
        where: {
          userId: user.id,
          purpose: AccountTokenPurpose.PASSWORD_RESET,
          consumedAt: null,
        },
        data: { consumedAt: new Date() },
      });
      await tx.accountToken.create({
        data: {
          userId: user.id,
          purpose: AccountTokenPurpose.PASSWORD_RESET,
          tokenHash: this.hashOpaqueToken(rawToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
    });

    const webBaseUrl = this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
    await this.mail
      .sendActionEmail({
        to: user.email,
        subject: 'Redefinição de senha',
        heading: 'Redefina sua senha',
        message: 'Recebemos uma solicitação para redefinir sua senha. O link expira em 1 hora.',
        actionLabel: 'Criar nova senha',
        actionUrl: `${webBaseUrl.replace(/\/$/, '')}/redefinir-senha?token=${encodeURIComponent(rawToken)}`,
      })
      .catch(() => undefined);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const now = new Date();
    const token = await this.prisma.accountToken.findUnique({
      where: { tokenHash: this.hashOpaqueToken(dto.token) },
      include: { user: { include: { memberships: { select: { tenantId: true } } } } },
    });
    if (
      !token ||
      token.purpose !== AccountTokenPurpose.PASSWORD_RESET ||
      token.consumedAt ||
      token.expiresAt <= now ||
      token.user.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException('Token inválido, expirado ou já utilizado.');
    }
    const passwordHash = await hash(dto.newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.accountToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException('Token já utilizado.');
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.tenantMembership.updateMany({
        where: { userId: token.userId },
        data: { sessionVersion: { increment: 1 } },
      });
      await tx.refreshSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      for (const membership of token.user.memberships) {
        await tx.auditLog.create({
          data: {
            tenantId: membership.tenantId,
            actorUserId: token.userId,
            action: AuditAction.PASSWORD_CHANGE,
            entityType: 'User',
            entityId: token.userId,
            afterData: { method: 'password_reset' },
          },
        });
      }
    });
  }

  async requestEmailVerification(user: AuthenticatedUser): Promise<{ alreadyVerified: boolean }> {
    const account = await this.prisma.user.findUnique({ where: { id: user.userId } });
    if (!account) throw new UnauthorizedException();
    if (account.emailVerifiedAt) return { alreadyVerified: true };

    const rawToken = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      await tx.accountToken.updateMany({
        where: {
          userId: account.id,
          purpose: AccountTokenPurpose.EMAIL_VERIFICATION,
          consumedAt: null,
        },
        data: { consumedAt: new Date() },
      });
      await tx.accountToken.create({
        data: {
          userId: account.id,
          purpose: AccountTokenPurpose.EMAIL_VERIFICATION,
          tokenHash: this.hashOpaqueToken(rawToken),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    });
    const webBaseUrl = this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
    await this.mail.sendActionEmail({
      to: account.email,
      subject: 'Confirme seu e-mail',
      heading: 'Confirme seu endereço de e-mail',
      message: 'Confirme que este endereço pertence a você. O link expira em 24 horas.',
      actionLabel: 'Confirmar e-mail',
      actionUrl: `${webBaseUrl.replace(/\/$/, '')}/verificar-email?token=${encodeURIComponent(rawToken)}`,
    });
    return { alreadyVerified: false };
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const now = new Date();
    const token = await this.prisma.accountToken.findUnique({
      where: { tokenHash: this.hashOpaqueToken(rawToken) },
      include: { user: { include: { memberships: { select: { tenantId: true } } } } },
    });
    if (
      !token ||
      token.purpose !== AccountTokenPurpose.EMAIL_VERIFICATION ||
      token.consumedAt ||
      token.expiresAt <= now
    ) {
      throw new BadRequestException('Token de verificação inválido, expirado ou já utilizado.');
    }
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.accountToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException('Token já utilizado.');
      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: now } });
      for (const membership of token.user.memberships) {
        await tx.auditLog.create({
          data: {
            tenantId: membership.tenantId,
            actorUserId: token.userId,
            action: AuditAction.EMAIL_VERIFY,
            entityType: 'User',
            entityId: token.userId,
          },
        });
      }
    });
  }

  async registerTenant(dto: RegisterTenantDto, request: Request): Promise<IssuedSession> {
    if (this.config.get<string>('ORCAPRO_ONLY') === 'true') throw new ForbiddenException('O cadastro neste ambiente é exclusivo do OrçaPro. Escolha um plano para criar sua conta.');
    const email = dto.email.trim().toLowerCase();
    const slug = dto.tenantSlug.trim().toLowerCase();

    const [existingTenant, existingUser] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { slug } }),
      this.prisma.user.findUnique({ where: { email } }),
    ]);

    if (existingTenant) throw new ConflictException('Identificador da organização já utilizado.');
    if (existingUser) {
      throw new ConflictException(
        'O e-mail já possui conta. Entre na conta para solicitar acesso a outra organização.',
      );
    }

    const passwordHash = await hash(dto.password, 12);
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const created = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.saaSPlan.upsert({
        where: { code: 'TRIAL_30D' },
        create: {
          code: 'TRIAL_30D',
          name: 'Trial 30 dias',
          billingInterval: BillingInterval.MONTH,
          priceBrl: 0,
          maxBuildings: 3,
          maxOperationalUsers: 5,
          maxStorageGb: 2,
          maxWorkOrdersYear: 500,
          features: { trial: true },
        },
        update: {},
      });

      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName.trim(),
          slug,
          status: TenantStatus.TRIAL,
          trialEndsAt,
        },
      });

      const newUserId = randomUUID();
      const user = await tx.user.create({
        data: {
          id: newUserId,
          name: dto.ownerName.trim(),
          email,
          passwordHash,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          orcaproAccess: { create: { managed: true, updatedByUserId: newUserId } },
          orcaproSubscription: { create: { tenantId: tenant.id, status: 'TRIALING', currentPeriodStart: new Date(), currentPeriodEnd: trialEndsAt } },
        },
      });

      const membership = await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
          acceptedAt: new Date(),
        },
      });

      await tx.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: SubscriptionStatus.TRIALING,
          currentPeriodStart: new Date(),
          currentPeriodEnd: trialEndsAt,
        },
      });

      await this.operations.provisionTenantDefaults(tenant.id, tenant.timezone, tx);

      return { tenant, user, membership };
    });

    return this.issueSession(created.user, created.membership, created.tenant, request);
  }

  async registerOrcapro(dto: RegisterOrcaproDto, request: Request) {
    this.requireOrcapro();
    if (dto.name.trim().length < 2) throw new BadRequestException('Informe seu nome.');
    if (Buffer.byteLength(dto.password, 'utf8') > 72) throw new BadRequestException('A senha deve ter no máximo 72 bytes.');
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new ConflictException('Este e-mail já possui conta. Entre para retomar sua assinatura.');
    const passwordHash = await hash(dto.password, 12);
    const userId = randomUUID();
    try {
      const created = await this.prisma.$transaction(async db => {
        const plan = await db.orcaproPlan.findFirst({ where: { id: dto.planId, active: true, stripePriceId: { not: null } } });
        if (!plan) throw new BadRequestException('Plano indisponível para contratação online.');
        const tenant = await db.tenant.create({ data: { name: dto.name.trim(), slug: `orcapro-${userId}`, status: 'ACTIVE' } });
        const user = await db.user.create({ data: { id: userId, name: dto.name.trim(), email, passwordHash, status: 'ACTIVE', orcaproAccess: { create: { managed: true, enabled: true, updatedByUserId: userId } }, orcaproSubscription: { create: { tenantId: tenant.id, planId: plan.id, status: 'UNPAID', billingSource: 'STRIPE' } } } });
        const membership = await db.tenantMembership.create({ data: { tenantId: tenant.id, userId, role: 'REQUESTER', status: 'ACTIVE', maintenanceAccess: false, acceptedAt: new Date() } });
        await db.orcaproAudit.create({ data: { tenantId: tenant.id, actorUserId: userId, entityId: userId, action: 'saas.user.self-register', metadata: { planId: plan.id, pendingPayment: true, maintenanceAccess: false } } });
        return { tenant, user, membership };
      });
      const session = await this.issueSession(created.user, created.membership, created.tenant, request);
      return { ...session, tenant: { id: created.tenant.id, name: created.tenant.name, slug: created.tenant.slug } };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Este e-mail já possui conta. Entre para retomar sua assinatura.');
      throw error;
    }
  }

  private requireOrcapro() {
    if (this.config.get<string>('ORCAPRO_ENABLED') !== 'true') throw new ServiceUnavailableException('OrçaPro ainda não habilitado neste ambiente.');
  }

  async loginOrcapro(dto: OrcaproLoginDto, request: Request): Promise<IssuedSession> {
    this.requireOrcapro();
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() }, include: { orcaproAccess: true, orcaproSubscription: { select: { tenantId: true } } } });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt || user.orcaproAccess?.enabled === false || user.orcaproAccess?.deletedAt || !(await compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Credenciais inválidas ou acesso suspenso.');
    // The licence's original tenant wins. Never silently switch to another organization.
    // Historical accounts without a licence use their oldest valid membership.
    const membership = await this.prisma.tenantMembership.findFirst({ where: { userId: user.id, ...(user.orcaproSubscription ? { tenantId: user.orcaproSubscription.tenantId } : {}), status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], tenant: { deletedAt: null, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED'] } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { tenant: true } });
    if (!membership || (membership.tenant.status === 'CANCELED' && !(await hasOrcaproAccount(user.id, this.prisma, this.config)))) throw new UnauthorizedException('Credenciais inválidas ou acesso suspenso.');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueSession(user, membership, membership.tenant, request);
  }

  async login(dto: LoginDto, request: Request): Promise<IssuedSession> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        status: MembershipStatus.ACTIVE,
        tenant: {
          slug: dto.tenantSlug.trim().toLowerCase(),
          status: { in: [TenantStatus.TRIAL, TenantStatus.ACTIVE, TenantStatus.PAST_DUE, TenantStatus.CANCELED] },
          deletedAt: null,
        },
        user: {
          email: dto.email.trim().toLowerCase(),
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      },
      include: { user: true, tenant: true },
    });

    if (!membership || !(await compare(dto.password, membership.user.passwordHash))) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    if (membership.tenant.status === 'CANCELED' && !(await hasOrcaproAccount(membership.userId, this.prisma, this.config))) throw new UnauthorizedException('A organização não possui acesso contratado.');

    if (membership.expiresAt && membership.expiresAt <= new Date()) {
      throw new UnauthorizedException('O acesso provisório expirou.');
    }

    await this.prisma.user.update({
      where: { id: membership.userId },
      data: { lastLoginAt: new Date() },
    });

    return this.issueSession(membership.user, membership, membership.tenant, request);
  }

  async refresh(rawRefreshToken: string | undefined, request: Request): Promise<IssuedSession> {
    if (!rawRefreshToken) throw new UnauthorizedException('Sessão de atualização ausente.');

    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: true,
        membership: { include: { tenant: true } },
      },
    });

    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== UserStatus.ACTIVE ||
      session.user.deletedAt ||
      session.membership.status !== MembershipStatus.ACTIVE ||
      (session.membership.expiresAt && session.membership.expiresAt <= now) ||
      session.membership.tenant.deletedAt ||
      !( [TenantStatus.TRIAL, TenantStatus.ACTIVE, TenantStatus.PAST_DUE, TenantStatus.CANCELED] as TenantStatus[]).includes(
        session.membership.tenant.status,
      )
    ) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
    if (session.membership.tenant.status === 'CANCELED' && !(await hasOrcaproAccount(session.userId, this.prisma, this.config))) throw new UnauthorizedException('A organização não possui acesso contratado.');

    const revoked = await this.prisma.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) {
      throw new UnauthorizedException('Sessão já utilizada ou revogada.');
    }

    return this.issueSession(
      session.user,
      session.membership,
      session.membership.tenant,
      request,
    );
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) return;

    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: this.hashRefreshToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(user: AuthenticatedUser) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: user.membershipId,
        tenantId: user.tenantId,
        userId: user.userId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            emailVerifiedAt: true,
          },
        },
        tenant: { select: { id: true, name: true, slug: true, status: true, trialEndsAt: true } },
      },
    });

    if (!membership) throw new UnauthorizedException('Vínculo de acesso não encontrado.');
    return { user: membership.user, tenant: membership.tenant, role: membership.role, maintenanceAccess: membership.maintenanceAccess && membership.tenant.status !== 'CANCELED' };
  }

  private async issueSession(
    user: { id: string; name: string; email: string },
    membership: { id: string; tenantId: string; role: MembershipRole; sessionVersion: number; maintenanceAccess?: boolean },
    tenant: { id: string; slug: string; status?: TenantStatus },
    request: Request,
  ): Promise<IssuedSession> {
    const payload: JwtPayload = {
      sub: user.id,
      membershipId: membership.id,
      sessionVersion: membership.sessionVersion,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      role: membership.role,
      email: user.email,
      name: user.name,
    };

    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);
    const refreshExpiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        membershipId: membership.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: request.get('user-agent')?.slice(0, 500),
        ipAddress: request.ip?.slice(0, 64),
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt,
      user: {
        userId: user.id,
        membershipId: membership.id,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        role: membership.role,
        email: user.email,
        name: user.name,
        maintenanceAccess: membership.maintenanceAccess !== false && tenant.status !== 'CANCELED',
      },
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
