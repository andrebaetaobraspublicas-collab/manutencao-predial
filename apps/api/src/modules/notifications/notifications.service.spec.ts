import { NotFoundException } from '@nestjs/common';
import { MembershipRole, NotificationEventType } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService — isolamento e preferências', () => {
  it('lista e conta somente no tenant e usuário autenticados', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    const prisma = { notification: { findMany, count } } as unknown as PrismaService;
    const service = new NotificationsService(prisma);

    const result = await service.list('tenant-a', 'user-a', MembershipRole.MANAGER, {
      unreadOnly: false,
      page: 1,
      pageSize: 25,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a', userId: 'user-a' } }),
    );
    expect(count).toHaveBeenLastCalledWith({
      where: { tenantId: 'tenant-a', userId: 'user-a', readAt: null },
    });
    expect(result.unreadCount).toBe(3);
  });

  it('não marca como lida uma notificação de outro contexto', async () => {
    const update = jest.fn();
    const prisma = {
      notification: { findFirst: jest.fn().mockResolvedValue(null), update },
    } as unknown as PrismaService;
    const service = new NotificationsService(prisma);

    await expect(
      service.markRead(
        'tenant-a',
        'user-a',
        MembershipRole.MANAGER,
        'notification-b',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('revoga imediatamente notificações alheias após rebaixamento para demandante', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const findFirst = jest.fn().mockResolvedValue(null);
    const update = jest.fn();
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      notification: { findMany, count, findFirst, update, updateMany },
    } as unknown as PrismaService;
    const service = new NotificationsService(prisma);

    await service.list('tenant-a', 'requester-a', MembershipRole.REQUESTER, {
      unreadOnly: false,
      page: 1,
      pageSize: 25,
    });
    await service.unreadCount('tenant-a', 'requester-a', MembershipRole.REQUESTER);
    await expect(
      service.markRead(
        'tenant-a',
        'requester-a',
        MembershipRole.REQUESTER,
        'old-manager-notification',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await service.markAllRead('tenant-a', 'requester-a', MembershipRole.REQUESTER);

    const requesterScope = {
      tenantId: 'tenant-a',
      userId: 'requester-a',
      workOrderId: { not: null },
      workOrder: {
        is: {
          tenantId: 'tenant-a',
          requesterUserId: 'requester-a',
          deletedAt: null,
        },
      },
    };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(requesterScope) }),
    );
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ ...requesterScope, readAt: null }),
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        ...requesterScope,
        id: 'old-manager-notification',
      }),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ ...requesterScope, readAt: null }),
      data: { readAt: expect.any(Date) },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('aplica preferências padrão sem materializar linhas no banco', async () => {
    const prisma = {
      notificationPreference: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventType: NotificationEventType.CONTRACT_EXPIRING,
            inAppEnabled: true,
            emailEnabled: false,
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new NotificationsService(prisma);

    const preferences = await service.getPreferences('tenant-a', 'user-a');

    expect(
      preferences.find(
        (preference) => preference.eventType === NotificationEventType.CONTRACT_EXPIRING,
      ),
    ).toEqual(
      expect.objectContaining({ inAppEnabled: true, emailEnabled: false }),
    );
    expect(
      preferences.find(
        (preference) => preference.eventType === NotificationEventType.WORK_ORDER_CREATED,
      ),
    ).toEqual(
      expect.objectContaining({ inAppEnabled: true, emailEnabled: true }),
    );
  });
});
