import { NotificationEventType } from '../../generated/prisma/client';
import { NotificationOutboxService } from './notification-outbox.service';

describe('NotificationOutboxService', () => {
  it('faz upsert idempotente com tenant e destinatário no evento', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'event-1' });
    const client = { notificationOutbox: { upsert } };
    const service = new NotificationOutboxService();

    await service.enqueue(client as never, {
      tenantId: 'tenant-a',
      recipientUserId: 'user-a',
      eventType: NotificationEventType.WORK_ORDER_STATUS_CHANGED,
      deduplicationKey: 'work-order:1:history:2',
      title: 'OS alterada',
      message: 'A OS passou para em execução.',
      actionUrl: '/ordens-servico/detalhe/?id=1',
      workOrderId: '00000000-0000-0000-0000-000000000001',
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId: 'tenant-a',
          recipientUserId: 'user-a',
          eventType: NotificationEventType.WORK_ORDER_STATUS_CHANGED,
        }),
        update: {},
      }),
    );
    expect(upsert.mock.calls[0][0].where.eventKey).toMatch(/^notification:[a-f0-9]{64}$/);
  });
});
