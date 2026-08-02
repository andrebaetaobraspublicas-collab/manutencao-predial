import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  MembershipStatus,
  TenantStatus,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCESS_COOKIE } from './auth.constants';
import type { JwtPayload } from './jwt-payload.type';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request?.cookies?.[ACCESS_COOKIE] as string | null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const now = new Date();
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: payload.membershipId,
        tenantId: payload.tenantId,
        userId: payload.sub,
        sessionVersion: payload.sessionVersion,
        status: MembershipStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        user: { status: UserStatus.ACTIVE, deletedAt: null },
        tenant: {
          status: { in: [TenantStatus.TRIAL, TenantStatus.ACTIVE, TenantStatus.PAST_DUE] },
          deletedAt: null,
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        tenant: { select: { id: true, slug: true } },
      },
    });

    if (!membership) {
      throw new UnauthorizedException('Acesso suspenso, expirado ou inválido.');
    }

    return {
      userId: membership.user.id,
      membershipId: membership.id,
      tenantId: membership.tenant.id,
      tenantSlug: membership.tenant.slug,
      role: membership.role,
      email: membership.user.email,
      name: membership.user.name,
    };
  }
}
