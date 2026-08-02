import { ConfigService } from '@nestjs/config';
import { WorkOrderPriority } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationOutboxService } from '../notifications/notification-outbox.service';
import { OperationsService } from '../operations/operations.service';
import { ListWorkOrdersQuery } from './dto/list-work-orders.query';
import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersService - filtros analíticos', () => {
  it('combina filtros do GP-030 mantendo o escopo do tenant', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      workOrder: { count, findMany },
      $transaction: jest.fn().mockImplementation((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    } as unknown as PrismaService;
    const service = new WorkOrdersService(
      prisma,
      new ConfigService({ NODE_ENV: 'test' }),
      {} as OperationsService,
      {} as NotificationOutboxService,
    );
    const query = Object.assign(new ListWorkOrdersQuery(), {
      priority: WorkOrderPriority.HIGH,
      assignedToUserId: '22222222-2222-4222-8222-222222222222',
      categoryId: '33333333-3333-4333-8333-333333333333',
      contractId: '44444444-4444-4444-8444-444444444444',
      ageMinDays: 10,
      ageMaxDays: 30,
    });

    await service.list('tenant-a', query);

    const where = count.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-a',
        deletedAt: null,
        priority: WorkOrderPriority.HIGH,
        assignedToUserId: query.assignedToUserId,
        categoryId: query.categoryId,
        openedAt: { gte: expect.any(Date), lte: expect.any(Date) },
        contracts: {
          some: {
            contractId: query.contractId,
            contract: { tenantId: 'tenant-a', deletedAt: null },
          },
        },
      }),
    );
    expect(findMany.mock.calls[0][0].where).toBe(where);
  });
});
