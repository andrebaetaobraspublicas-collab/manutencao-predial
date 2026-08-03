import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MailService } from '../../common/mail/mail.service';
import { MembershipRole } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembersService } from './members.service';

describe('MembersService — isolamento por organização', () => {
  it('filtra a listagem pelo tenant autenticado', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { tenantMembership: { findMany } } as unknown as PrismaService;
    const service = new MembersService(
      prisma,
      {} as MailService,
      new ConfigService(),
    );

    await service.list('tenant-a');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
  });

  it('não altera um membership que pertence a outro tenant', async () => {
    const update = jest.fn();
    const prisma = {
      tenantMembership: { findFirst: jest.fn().mockResolvedValue(null), update },
    } as unknown as PrismaService;
    const service = new MembersService(
      prisma,
      {} as MailService,
      new ConfigService(),
    );

    await expect(
      service.update(
        {
          userId: 'owner-a', membershipId: 'owner-membership-a', tenantId: 'tenant-a',
          tenantSlug: 'tenant-a', role: MembershipRole.OWNER, email: 'owner-a@example.test', name: 'Owner A',
        },
        'membership-b',
        { status: 'SUSPENDED' },
        { ip: '127.0.0.1', get: () => undefined } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('não redefine a senha global quando a conta está ativa em outro tenant', async () => {
    const findFirst = jest.fn()
      .mockResolvedValueOnce({
        id: 'member-b', userId: 'user-b', role: MembershipRole.OPERATOR,
        status: 'ACTIVE', expiresAt: null,
      })
      .mockResolvedValueOnce({ id: 'foreign-membership' });
    const transaction = jest.fn();
    const prisma = { tenantMembership: { findFirst }, $transaction: transaction } as unknown as PrismaService;
    const service = new MembersService(prisma, {} as MailService, new ConfigService());

    await expect(service.setPassword(
      {
        userId: 'owner-a', membershipId: 'owner-membership-a', tenantId: 'tenant-a',
        tenantSlug: 'tenant-a', role: MembershipRole.OWNER, email: 'owner-a@example.test', name: 'Owner A',
      },
      'member-b',
      { newPassword: 'senha-segura-2026' },
      { ip: '127.0.0.1', get: () => undefined } as never,
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'member-b', tenantId: 'tenant-a' },
    }));
    expect(transaction).not.toHaveBeenCalled();
  });
});
