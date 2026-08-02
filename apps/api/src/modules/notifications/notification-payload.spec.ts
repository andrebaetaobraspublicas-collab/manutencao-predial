import { NotificationEventType } from '../../generated/prisma/client';
import { InvalidNotificationPayloadError, parseNotificationPayload } from './notification-payload';
import { NotificationOutboxService } from './notification-outbox.service';

describe('payload e chave idempotente de notificação', () => {
  it('aceita somente caminhos internos como ação', () => {
    expect(
      parseNotificationPayload({
        title: 'OS atualizada',
        message: 'A ordem de serviço mudou de estado.',
        actionUrl: '/ordens-servico/detalhe/?id=123',
      }),
    ).toEqual(
      expect.objectContaining({ actionUrl: '/ordens-servico/detalhe/?id=123' }),
    );

    expect(() =>
      parseNotificationPayload({
        title: 'OS atualizada',
        message: 'Mensagem',
        actionUrl: 'https://example.test/phishing',
      }),
    ).toThrow(InvalidNotificationPayloadError);
  });

  it('gera a mesma chave para a mesma ocorrência e outra chave para outro destinatário', () => {
    const service = new NotificationOutboxService();
    const base = {
      tenantId: 'tenant-a',
      recipientUserId: 'user-a',
      eventType: NotificationEventType.WORK_ORDER_CREATED,
      deduplicationKey: 'work-order:1:created',
    };

    expect(service.eventKey(base)).toBe(service.eventKey(base));
    expect(service.eventKey(base)).not.toBe(
      service.eventKey({ ...base, recipientUserId: 'user-b' }),
    );
  });
});
