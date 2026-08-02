import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { MailService } from '../../common/mail/mail.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  AuditAction,
  MembershipRole,
  MembershipStatus,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async list(tenantId: string) {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId },
      orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            emailVerifiedAt: true,
            lastLoginAt: true,
          },
        },
        refreshSessions: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
        },
      },
    });

    return memberships.map(({ refreshSessions, ...membership }) => ({
      ...membership,
      effectiveStatus:
        membership.expiresAt && membership.expiresAt <= new Date()
          ? MembershipStatus.EXPIRED
          : membership.status,
      activeSessions: refreshSessions.length,
    }));
  }

  listInvitations(tenantId: string) {
    return this.prisma.tenantInvitation.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        membership: { select: { id: true, role: true, status: true } },
        invitedBy: { select: { id: true, name: true } },
      },
    });
  }

  async invite(actor: AuthenticatedUser, dto: InviteMemberDto, request: Request) {
    this.assertAssignableRole(actor, dto.role);
    const email = dto.email.trim().toLowerCase();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('A validade do acesso deve estar no futuro.');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (
      existingUser &&
      (existingUser.deletedAt ||
        (existingUser.status !== UserStatus.ACTIVE && existingUser.status !== UserStatus.INVITED))
    ) {
      throw new ConflictException('A conta vinculada a este e-mail está indisponível.');
    }
    const existingMembership = existingUser
      ? await this.prisma.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId: actor.tenantId, userId: existingUser.id } },
        })
      : null;
    if (existingMembership?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException('Este usuário já é membro ativo da organização.');
    }
    if (existingMembership?.status === MembershipStatus.SUSPENDED) {
      throw new ConflictException('Este acesso está suspenso. Reative-o na lista de usuários.');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const invitationExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const placeholderPassword = existingUser
      ? undefined
      : await hash(randomBytes(48).toString('base64url'), 12);

    const invitation = await this.prisma.$transaction(async (tx) => {
      const user =
        existingUser ??
        (await tx.user.create({
          data: {
            name: 'Usuário convidado',
            email,
            passwordHash: placeholderPassword!,
            status: UserStatus.INVITED,
          },
        }));

      const membership = await tx.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: actor.tenantId, userId: user.id } },
        create: {
          tenantId: actor.tenantId,
          userId: user.id,
          role: dto.role,
          status: MembershipStatus.INVITED,
          invitedAt: new Date(),
          expiresAt,
        },
        update: {
          role: dto.role,
          status: MembershipStatus.INVITED,
          invitedAt: new Date(),
          acceptedAt: null,
          expiresAt,
        },
      });

      const createdInvitation = await tx.tenantInvitation.upsert({
        where: { membershipId: membership.id },
        create: {
          tenantId: actor.tenantId,
          membershipId: membership.id,
          invitedByUserId: actor.userId,
          email,
          tokenHash,
          expiresAt: invitationExpiresAt,
        },
        update: {
          invitedByUserId: actor.userId,
          email,
          tokenHash,
          expiresAt: invitationExpiresAt,
          acceptedAt: null,
          revokedAt: null,
          createdAt: new Date(),
        },
        include: { tenant: { select: { name: true, slug: true } } },
      });

      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: AuditAction.INVITE,
          entityType: 'TenantMembership',
          entityId: membership.id,
          afterData: { email, role: dto.role, expiresAt: expiresAt?.toISOString() ?? null },
          ...this.requestMetadata(request),
        },
      });
      return createdInvitation;
    });

    const webBaseUrl = this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
    await this.mail.sendActionEmail({
      to: email,
      subject: `Convite para ${invitation.tenant.name}`,
      heading: 'Você recebeu um convite',
      message: `Aceite o convite para acessar a organização ${invitation.tenant.name}. O link expira em 72 horas.`,
      actionLabel: 'Aceitar convite',
      actionUrl: `${webBaseUrl.replace(/\/$/, '')}/convite?token=${encodeURIComponent(rawToken)}`,
    });

    return {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      delivered: true,
    };
  }

  async update(
    actor: AuthenticatedUser,
    membershipId: string,
    dto: UpdateMemberDto,
    request: Request,
  ) {
    const membership = await this.findMember(actor.tenantId, membershipId);
    this.assertCanManage(actor, membership.userId, membership.role);
    if (dto.role) this.assertAssignableRole(actor, dto.role);
    if (
      dto.status &&
      dto.status !== MembershipStatus.ACTIVE &&
      dto.status !== MembershipStatus.SUSPENDED
    ) {
      throw new BadRequestException('A situação deve ser ACTIVE ou SUSPENDED.');
    }
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : dto.status === MembershipStatus.ACTIVE &&
          membership.expiresAt &&
          membership.expiresAt <= new Date()
        ? null
        : undefined;
    if (expiresAt && expiresAt <= new Date() && dto.status !== MembershipStatus.SUSPENDED) {
      throw new BadRequestException('A validade deve estar no futuro para um acesso ativo.');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.tenantMembership.update({
        where: { id: membership.id },
        data: {
          role: dto.role,
          status: dto.status,
          expiresAt,
          sessionVersion: { increment: 1 },
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      if (dto.role || dto.status || dto.expiresAt) {
        await tx.refreshSession.updateMany({
          where: { membershipId: membership.id, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: AuditAction.UPDATE,
          entityType: 'TenantMembership',
          entityId: membership.id,
          beforeData: {
            role: membership.role,
            status: membership.status,
            expiresAt: membership.expiresAt?.toISOString() ?? null,
          },
          afterData: {
            role: result.role,
            status: result.status,
            expiresAt: result.expiresAt?.toISOString() ?? null,
          },
          ...this.requestMetadata(request),
        },
      });
      return result;
    });
    return updated;
  }

  async revokeSessions(actor: AuthenticatedUser, membershipId: string, request: Request) {
    const membership = await this.findMember(actor.tenantId, membershipId);
    this.assertCanManage(actor, membership.userId, membership.role);
    const result = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshSession.updateMany({
        where: { membershipId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.tenantMembership.update({
        where: { id: membershipId },
        data: { sessionVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: AuditAction.SESSION_REVOKE,
          entityType: 'TenantMembership',
          entityId: membershipId,
          afterData: { revokedSessions: revoked.count },
          ...this.requestMetadata(request),
        },
      });
      return revoked;
    });
    return { revokedSessions: result.count };
  }

  private async findMember(tenantId: string, membershipId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        expiresAt: true,
      },
    });
    if (!membership) throw new NotFoundException('Membro não encontrado.');
    return membership;
  }

  private assertAssignableRole(actor: AuthenticatedUser, role: MembershipRole): void {
    if (role === MembershipRole.OWNER) {
      throw new BadRequestException('A propriedade da organização não pode ser atribuída por convite.');
    }
    if (actor.role === MembershipRole.ADMIN && role === MembershipRole.ADMIN) {
      throw new ForbiddenException('Somente o proprietário pode conceder o papel de administrador.');
    }
  }

  private assertCanManage(
    actor: AuthenticatedUser,
    targetUserId: string,
    targetRole: MembershipRole,
  ): void {
    if (targetUserId === actor.userId) {
      throw new BadRequestException('Use as configurações da própria conta para alterar seu acesso.');
    }
    if (targetRole === MembershipRole.OWNER) {
      throw new ForbiddenException('O acesso do proprietário não pode ser alterado por esta operação.');
    }
    if (actor.role === MembershipRole.ADMIN && targetRole === MembershipRole.ADMIN) {
      throw new ForbiddenException('Somente o proprietário pode administrar outro administrador.');
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private requestMetadata(request: Request) {
    return {
      ipAddress: request.ip?.slice(0, 64),
      userAgent: request.get('user-agent')?.slice(0, 500),
    };
  }
}
