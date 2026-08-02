import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  NotificationEventType,
  type NotificationOutbox,
  type Prisma,
} from '../../generated/prisma/client';
import {
  type NotificationPayload,
  toNotificationJson,
} from './notification-payload';

type OutboxClient = Pick<Prisma.TransactionClient, 'notificationOutbox'>;

export type EnqueueNotificationInput = NotificationPayload & {
  tenantId: string;
  recipientUserId: string;
  eventType: NotificationEventType;
  /**
   * Identifica uma ocorrência de domínio, por exemplo
   * `work-order:<id>:status-history:<historyId>`. A chave final também inclui
   * tenant, tipo e destinatário para que a operação seja idempotente.
   */
  deduplicationKey: string;
  availableAt?: Date;
};

@Injectable()
export class NotificationOutboxService {
  async enqueue(client: OutboxClient, input: EnqueueNotificationInput) {
    const eventKey = this.eventKey(input);
    const payload = toNotificationJson(input);

    return client.notificationOutbox.upsert({
      where: { eventKey },
      create: {
        tenantId: input.tenantId,
        recipientUserId: input.recipientUserId,
        eventKey,
        eventType: input.eventType,
        payload,
        availableAt: input.availableAt,
      },
      // Não reabre nem altera um evento existente: o primeiro payload é a
      // versão auditável da ocorrência de domínio.
      update: {},
    });
  }

  async enqueueMany(client: OutboxClient, inputs: EnqueueNotificationInput[]) {
    const events: NotificationOutbox[] = [];
    for (const input of inputs) {
      events.push(await this.enqueue(client, input));
    }
    return events;
  }

  eventKey(input: Pick<
    EnqueueNotificationInput,
    'tenantId' | 'recipientUserId' | 'eventType' | 'deduplicationKey'
  >): string {
    const deduplicationKey = input.deduplicationKey.trim();
    if (!deduplicationKey) {
      throw new Error('deduplicationKey da notificação é obrigatória.');
    }
    const digest = createHash('sha256')
      .update(
        [input.tenantId, input.recipientUserId, input.eventType, deduplicationKey].join('\u001f'),
      )
      .digest('hex');
    return `notification:${digest}`;
  }
}
