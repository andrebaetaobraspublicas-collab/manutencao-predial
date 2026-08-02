import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { MailService } from '../../common/mail/mail.service';
import { MembershipRole } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { OperationsService } from '../operations/operations.service';

describe('AuthService — segurança de senha', () => {
  it('revoga todas as sessões após alteração autenticada', async () => {
    const passwordHash = await hash('Senha-Antiga-123!', 4);
    const userUpdate = jest.fn().mockResolvedValue({});
    const sessionUpdate = jest.fn().mockResolvedValue({ count: 2 });
    const auditCreate = jest.fn().mockResolvedValue({});
    const membershipUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = jest.fn().mockImplementation(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    );
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', passwordHash }), update: userUpdate },
      refreshSession: { updateMany: sessionUpdate },
      auditLog: { create: auditCreate },
      tenantMembership: { updateMany: membershipUpdate },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new AuthService(
      prisma,
      new JwtService({ secret: 'test' }),
      new ConfigService(),
      {} as MailService,
      {} as OperationsService,
    );

    await service.changePassword(
      {
        userId: 'user-1', membershipId: 'membership-1', tenantId: 'tenant-1',
        tenantSlug: 'tenant', role: MembershipRole.OWNER, email: 'owner@example.test', name: 'Owner',
      },
      { currentPassword: 'Senha-Antiga-123!', newPassword: 'Senha-Nova-456!' },
    );

    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejeita token de redefinição inexistente sem alterar a conta', async () => {
    const userUpdate = jest.fn();
    const prisma = {
      accountToken: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { update: userUpdate },
    } as unknown as PrismaService;
    const service = new AuthService(
      prisma,
      new JwtService({ secret: 'test' }),
      new ConfigService(),
      {} as MailService,
      {} as OperationsService,
    );

    await expect(
      service.resetPassword({ token: 'x'.repeat(32), newPassword: 'Senha-Nova-456!' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
