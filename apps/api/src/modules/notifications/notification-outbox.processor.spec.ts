import { ConfigService } from '@nestjs/config';
import {
  MembershipRole,
  NotificationEventType,
  NotificationOutboxStatus,
  type NotificationOutbox,
} from '../../generated/prisma/client';
import { MailDeliveryError, MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationOutboxProcessor } from './notification-outbox.processor';
import {
  type EnqueueNotificationInput,
  NotificationOutboxService,
} from './notification-outbox.service';

describe('NotificationOutboxProcessor', () => {
  it('varre SLA e contratos por tenant e gera chaves determinísticas', async () => {
    const deadline = new Date(Date.now() + 3 * 24 * 60 * 60_000);
    const warningAt = new Date(Date.now() - 60_000);
    const endDate = new Date(Date.now() + 10 * 24 * 60 * 60_000);
    const findWorkOrders = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'work-order-1',
          number: 'OS-2026-000001',
          title: 'Reparo urgente',
          requesterUserId: 'requester-1',
          assignedToUserId: null,
          slaResolutionDeadline: deadline,
          slaResolutionWarningAt: warningAt,
          building: { managerUserId: null },
          contracts: [],
        },
      ])
      .mockResolvedValueOnce([]);
    const prisma = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'tenant-a', timezone: 'America/Sao_Paulo' },
        ]),
      },
      tenantMembership: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'manager-1' }]),
      },
      workOrder: { findMany: findWorkOrders },
      contract: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'contract-1',
            code: 'CT-001',
            object: 'Manutenção predial',
            endDate,
            managerUserId: 'manager-1',
            inspectorUserId: null,
          },
        ]),
      },
    } as unknown as PrismaService;
    const queued: EnqueueNotificationInput[] = [];
    const enqueueMany = jest.fn().mockImplementation(
      async (_client: unknown, inputs: EnqueueNotificationInput[]) => {
        queued.push(...inputs);
        return inputs.map((_, index) => ({ id: `event-${index}` }));
      },
    );
    const outbox = { enqueueMany } as unknown as NotificationOutboxService;
    const processor = new NotificationOutboxProcessor(
      prisma,
      {} as MailService,
      new ConfigService({ NODE_ENV: 'test' }),
      outbox,
    );

    await processor.scanOperationalAlerts();

    expect(findWorkOrders).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a' }) }),
    );
    expect(queued).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: 'tenant-a',
          eventType: NotificationEventType.WORK_ORDER_SLA_WARNING,
          deduplicationKey: `work-order:work-order-1:sla-warning:${deadline.toISOString()}`,
        }),
        expect.objectContaining({
          tenantId: 'tenant-a',
          eventType: NotificationEventType.CONTRACT_EXPIRING,
          deduplicationKey: `contract:contract-1:expiring:${endDate.toISOString()}:30`,
        }),
      ]),
    );
  });

  it('agenda retentativa exponencial quando o provedor tem falha transitória', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      tenantMembership: {
        findFirst: jest.fn().mockResolvedValue({
          user: { name: 'Usuário', email: 'usuario@example.test' },
        }),
      },
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      notification: { upsert: jest.fn().mockResolvedValue({}) },
      notificationOutbox: { updateMany },
    } as unknown as PrismaService;
    const mail = {
      sendEmail: jest
        .fn()
        .mockRejectedValue(new MailDeliveryError('Limite temporário', true, 429)),
    } as unknown as MailService;
    const processor = new NotificationOutboxProcessor(
      prisma,
      mail,
      new ConfigService({
        NODE_ENV: 'test',
        WEB_BASE_URL: 'https://www.gestaodepredios.com.br',
        NOTIFICATION_RETRY_BASE_MS: 1_000,
      }),
      {} as NotificationOutboxService,
    );
    const event = {
      id: 'event-1',
      tenantId: 'tenant-a',
      recipientUserId: 'user-a',
      eventKey: 'notification:event-1',
      eventType: NotificationEventType.WORK_ORDER_CREATED,
      payload: { title: 'Nova OS', message: 'Uma OS foi criada.' },
      status: NotificationOutboxStatus.PROCESSING,
      attempts: 1,
      availableAt: new Date(),
      processedAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies NotificationOutbox;
    const startedAt = Date.now();

    await (
      processor as unknown as { processClaimed(value: NotificationOutbox): Promise<void> }
    ).processClaimed(event);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-1', status: NotificationOutboxStatus.PROCESSING },
        data: expect.objectContaining({
          status: NotificationOutboxStatus.FAILED,
          attempts: 1,
          availableAt: expect.any(Date),
        }),
      }),
    );
    const retryAt = updateMany.mock.calls[0][0].data.availableAt as Date;
    expect(retryAt.getTime()).toBeGreaterThanOrEqual(startedAt + 1_000);
  });

  it('descarta alerta de contrato se o destinatário foi rebaixado para demandante', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      tenantMembership: {
        findFirst: jest.fn().mockResolvedValue({
          userId: 'requester-a',
          role: MembershipRole.REQUESTER,
          user: { name: 'Demandante', email: 'requester@example.test' },
        }),
      },
      notificationPreference: { findUnique: jest.fn() },
      notification: { upsert: jest.fn() },
      notificationOutbox: { updateMany },
    } as unknown as PrismaService;
    const mail = { sendEmail: jest.fn() } as unknown as MailService;
    const processor = new NotificationOutboxProcessor(
      prisma,
      mail,
      new ConfigService({ NODE_ENV: 'test' }),
      {} as NotificationOutboxService,
    );
    const event = {
      id: 'contract-event-1',
      tenantId: 'tenant-a',
      recipientUserId: 'requester-a',
      eventKey: 'contract:contract-a:expiring',
      eventType: NotificationEventType.CONTRACT_EXPIRING,
      payload: {
        title: 'Contrato próximo do vencimento',
        message: 'O contrato vence em breve.',
        actionUrl: '/contratos',
      },
      status: NotificationOutboxStatus.PROCESSING,
      attempts: 1,
      availableAt: new Date(),
      processedAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies NotificationOutbox;

    await (
      processor as unknown as { processClaimed(value: NotificationOutbox): Promise<void> }
    ).processClaimed(event);

    expect(prisma.notification.upsert).not.toHaveBeenCalled();
    expect(mail.sendEmail).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: event.id, status: NotificationOutboxStatus.PROCESSING },
      data: expect.objectContaining({
        status: NotificationOutboxStatus.SENT,
        processedAt: expect.any(Date),
        lastError: expect.stringContaining('sem acesso a contratos'),
      }),
    });
  });
});
