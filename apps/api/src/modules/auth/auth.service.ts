import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import {
  BillingInterval,
  MembershipRole,
  MembershipStatus,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { LoginDto } from './dto/login.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import type { JwtPayload } from './jwt-payload.type';

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
  ) {}

  async registerTenant(dto: RegisterTenantDto, request: Request): Promise<IssuedSession> {
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

      const user = await tx.user.create({
        data: {
          name: dto.ownerName.trim(),
          email,
          passwordHash,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
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

      return { tenant, user, membership };
    });

    return this.issueSession(created.user, created.membership, created.tenant, request);
  }

  async login(dto: LoginDto, request: Request): Promise<IssuedSession> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        status: MembershipStatus.ACTIVE,
        tenant: {
          slug: dto.tenantSlug.trim().toLowerCase(),
          status: { in: [TenantStatus.TRIAL, TenantStatus.ACTIVE, TenantStatus.PAST_DUE] },
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
      !( [TenantStatus.TRIAL, TenantStatus.ACTIVE, TenantStatus.PAST_DUE] as TenantStatus[]).includes(
        session.membership.tenant.status,
      )
    ) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

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
        user: { select: { id: true, name: true, email: true, phone: true, status: true } },
        tenant: { select: { id: true, name: true, slug: true, status: true, trialEndsAt: true } },
      },
    });

    if (!membership) throw new UnauthorizedException('Vínculo de acesso não encontrado.');
    return { user: membership.user, tenant: membership.tenant, role: membership.role };
  }

  private async issueSession(
    user: { id: string; name: string; email: string },
    membership: { id: string; tenantId: string; role: MembershipRole },
    tenant: { id: string; slug: string },
    request: Request,
  ): Promise<IssuedSession> {
    const payload: JwtPayload = {
      sub: user.id,
      membershipId: membership.id,
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
      },
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
