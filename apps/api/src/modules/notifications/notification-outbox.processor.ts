import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContractStatus,
  MembershipRole,
  MembershipStatus,
  NotificationEventType,
  NotificationOutboxStatus,
  type NotificationOutbox,
  TenantStatus,
  UserStatus,
  WorkOrderStatus,
} from '../../generated/prisma/client';
import { MailDeliveryError, MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InvalidNotificationPayloadError,
  parseNotificationPayload,
} from './notification-payload';
import { NotificationOutboxService } from './notification-outbox.service';

export type NotificationWorkerSnapshot = {
  enabled: boolean;
  running: boolean;
  emailConfigured: boolean;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  processed: number;
  failed: number;
  lastScanAt: Date | null;
  scannedEvents: number;
};

const ALERT_SUPERVISOR_ROLES: MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
];

const CONTRACT_READ_ROLES: MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER,
  MembershipRole.CONTRACT_INSPECTOR,
  MembershipRole.OPERATOR,
  MembershipRole.AUDITOR,
];

const SLA_ACTIVE_STATUSES = [
  WorkOrderStatus.OPEN,
  WorkOrderStatus.TRIAGED,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PENDING,
  WorkOrderStatus.WAITING_APPROVAL,
];

@Injectable()
export class NotificationOutboxProcessor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationOutboxProcessor.name);
  private readonly enabled: boolean;
  readonly maxAttempts: number;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly staleAfterMs: number;
  private readonly scanIntervalMs: number;
  private timer?: NodeJS.Timeout;
  private shuttingDown = false;
  private running = false;
  private currentRun?: Promise<number>;
  private lastRunAt: Date | null = null;
  private lastSuccessAt: Date | null = null;
  private lastErrorAt: Date | null = null;
  private processed = 0;
  private failed = 0;
  private lastScanAt: Date | null = null;
  private scannedEvents = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly outbox: NotificationOutboxService,
  ) {
    this.enabled = this.booleanConfig(
      'NOTIFICATION_WORKER_ENABLED',
      this.config.get<string>('NODE_ENV') !== 'test',
    );
    this.maxAttempts = this.numberConfig('NOTIFICATION_MAX_ATTEMPTS', 6, 1, 20);
    this.intervalMs = this.numberConfig('NOTIFICATION_POLL_INTERVAL_MS', 5_000, 1_000, 60_000);
    this.batchSize = this.numberConfig('NOTIFICATION_BATCH_SIZE', 10, 1, 100);
    this.staleAfterMs = this.numberConfig(
      'NOTIFICATION_PROCESSING_STALE_MS',
      5 * 60_000,
      30_000,
      60 * 60_000,
    );
    this.scanIntervalMs = this.numberConfig(
      'NOTIFICATION_ALERT_SCAN_INTERVAL_MS',
      60_000,
      30_000,
      60 * 60_000,
    );
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Processador da outbox de notificações desabilitado.');
      return;
    }
    this.schedule(1_000);
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.timer) clearTimeout(this.timer);
    await this.currentRun?.catch(() => undefined);
  }

  snapshot(): NotificationWorkerSnapshot {
    return {
      enabled: this.enabled,
      running: this.running,
      emailConfigured: this.mail.isConfigured(),
      lastRunAt: this.lastRunAt,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      processed: this.processed,
      failed: this.failed,
      lastScanAt: this.lastScanAt,
      scannedEvents: this.scannedEvents,
    };
  }

  processBatch(): Promise<number> {
    if (this.currentRun) return this.currentRun;
    this.currentRun = this.runBatch().finally(() => {
      this.currentRun = undefined;
    });
    return this.currentRun;
  }

  private async runBatch(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    this.lastRunAt = new Date();
    let handled = 0;

    try {
      await this.scanAlertsIfDue();
      for (let index = 0; index < this.batchSize && !this.shuttingDown; index += 1) {
        const event = await this.claimNext();
        if (!event) break;
        handled += 1;
        await this.processClaimed(event);
      }
      this.lastSuccessAt = new Date();
      return handled;
    } catch (error) {
      this.lastErrorAt = new Date();
      this.logger.error(
        this.logData('notification_worker_batch_failed', {
          error: this.errorMessage(error),
        }),
      );
      throw error;
    } finally {
      this.running = false;
    }
  }

  async scanOperationalAlerts(): Promise<number> {
    const now = new Date();
    const tenants = await this.prisma.tenant.findMany({
      where: {
        status: { in: [TenantStatus.TRIAL, TenantStatus.ACTIVE, TenantStatus.PAST_DUE] },
        deletedAt: null,
      },
      select: { id: true, timezone: true },
    });

    let generated = 0;
    for (const tenant of tenants) {
      generated += await this.scanTenantAlerts(tenant.id, tenant.timezone, now);
    }
    this.lastScanAt = now;
    this.scannedEvents += generated;
    if (generated > 0) {
      this.logger.log(
        this.logData('notification_alert_scan_completed', {
          tenants: tenants.length,
          generated,
        }),
      );
    }
    return generated;
  }

  private async scanAlertsIfDue(): Promise<void> {
    if (this.lastScanAt && Date.now() - this.lastScanAt.getTime() < this.scanIntervalMs) return;
    try {
      await this.scanOperationalAlerts();
    } catch (error) {
      this.lastErrorAt = new Date();
      this.logger.error(
        this.logData('notification_alert_scan_failed', {
          error: this.errorMessage(error),
        }),
      );
    }
  }

  private async scanTenantAlerts(
    tenantId: string,
    timeZone: string,
    now: Date,
  ): Promise<number> {
    const activeMemberships = await this.prisma.tenantMembership.findMany({
      where: {
        tenantId,
        status: MembershipStatus.ACTIVE,
        role: { in: ALERT_SUPERVISOR_ROLES },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
      select: { userId: true },
    });
    const supervisorIds = activeMemberships.map((membership) => membership.userId);
    const defaultWarningMinutes = this.numberConfig(
      'NOTIFICATION_SLA_WARNING_MINUTES',
      120,
      5,
      7 * 24 * 60,
    );
    const maximumWarningMinutes = this.numberConfig(
      'NOTIFICATION_SLA_MAX_WARNING_MINUTES',
      7 * 24 * 60,
      defaultWarningMinutes,
      30 * 24 * 60,
    );
    const warningUntil = new Date(now.getTime() + maximumWarningMinutes * 60_000);
    const lookbackDays = this.numberConfig('NOTIFICATION_SLA_LOOKBACK_DAYS', 30, 1, 365);
    const breachedSince = new Date(now.getTime() - lookbackDays * 24 * 60 * 60_000);

    const [warningWorkOrders, breachedWorkOrders] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: SLA_ACTIVE_STATUSES },
          slaResolutionDeadline: { gt: now },
          OR: [
            { slaResolutionWarningAt: { lte: now } },
            {
              slaResolutionWarningAt: null,
              slaResolutionDeadline: { lte: warningUntil },
            },
          ],
        },
        select: this.slaWorkOrderSelect(),
      }),
      this.prisma.workOrder.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: SLA_ACTIVE_STATUSES },
          slaResolutionDeadline: { gt: breachedSince, lte: now },
        },
        select: this.slaWorkOrderSelect(),
      }),
    ]);

    let generated = 0;
    for (const workOrder of warningWorkOrders) {
      const deadline = workOrder.slaResolutionDeadline;
      if (!deadline) continue;
      const warningMinutes =
        this.warningMinutesFromSnapshot(workOrder.slaSnapshot) ??
        workOrder.slaPolicy?.warningMinutesBefore ??
        defaultWarningMinutes;
      const warningStartsAt =
        workOrder.slaResolutionWarningAt ??
        this.warningAtFromSnapshot(workOrder.slaSnapshot) ??
        new Date(deadline.getTime() - warningMinutes * 60_000);
      if (warningStartsAt > now) continue;
      const recipients = this.workOrderRecipients(workOrder, supervisorIds);
      generated += (
        await this.outbox.enqueueMany(
          this.prisma,
          recipients.map((recipientUserId) => ({
            tenantId,
            recipientUserId,
            eventType: NotificationEventType.WORK_ORDER_SLA_WARNING,
            deduplicationKey: `work-order:${workOrder.id}:sla-warning:${deadline.toISOString()}`,
            title: `SLA próximo do vencimento — ${workOrder.number}`,
            message: `A ordem de serviço "${workOrder.title}" vence em ${this.formatDateTime(deadline, timeZone)}.`,
            actionUrl: `/ordens-servico/detalhe?id=${encodeURIComponent(workOrder.id)}`,
            workOrderId: workOrder.id,
          })),
        )
      ).length;
    }

    for (const workOrder of breachedWorkOrders) {
      const deadline = workOrder.slaResolutionDeadline;
      if (!deadline) continue;
      const recipients = this.workOrderRecipients(workOrder, supervisorIds);
      generated += (
        await this.outbox.enqueueMany(
          this.prisma,
          recipients.map((recipientUserId) => ({
            tenantId,
            recipientUserId,
            eventType: NotificationEventType.WORK_ORDER_SLA_BREACHED,
            deduplicationKey: `work-order:${workOrder.id}:sla-breached:${deadline.toISOString()}`,
            title: `SLA vencido — ${workOrder.number}`,
            message: `A ordem de serviço "${workOrder.title}" ultrapassou o prazo de resolução.`,
            actionUrl: `/ordens-servico/detalhe?id=${encodeURIComponent(workOrder.id)}`,
            workOrderId: workOrder.id,
          })),
        )
      ).length;
    }

    const contractWindowDays = this.numberConfig(
      'NOTIFICATION_CONTRACT_EXPIRING_DAYS',
      30,
      1,
      365,
    );
    const contractWindowEnd = new Date(now.getTime() + contractWindowDays * 24 * 60 * 60_000);
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
        endDate: { gt: now, lte: contractWindowEnd },
      },
      select: {
        id: true,
        code: true,
        object: true,
        endDate: true,
        managerUserId: true,
        inspectorUserId: true,
      },
    });
    const linkedContractRecipientIds = this.uniqueIds(
      contracts.flatMap((contract) => [contract.managerUserId, contract.inspectorUserId]),
    );
    const authorizedContractMemberships = linkedContractRecipientIds.length
      ? await this.prisma.tenantMembership.findMany({
          where: {
            tenantId,
            userId: { in: linkedContractRecipientIds },
            status: MembershipStatus.ACTIVE,
            role: { in: CONTRACT_READ_ROLES },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            user: { status: UserStatus.ACTIVE, deletedAt: null },
          },
          select: { userId: true },
        })
      : [];
    const authorizedContractRecipientIds = new Set([
      ...supervisorIds,
      ...authorizedContractMemberships.map((membership) => membership.userId),
    ]);

    for (const contract of contracts) {
      const recipients = this.uniqueIds([
        ...supervisorIds,
        contract.managerUserId,
        contract.inspectorUserId,
      ]).filter((userId) => authorizedContractRecipientIds.has(userId));
      generated += (
        await this.outbox.enqueueMany(
          this.prisma,
          recipients.map((recipientUserId) => ({
            tenantId,
            recipientUserId,
            eventType: NotificationEventType.CONTRACT_EXPIRING,
            deduplicationKey: `contract:${contract.id}:expiring:${contract.endDate.toISOString()}:${contractWindowDays}`,
            title: `Contrato próximo do vencimento — ${contract.code}`,
            message: `O contrato "${this.truncate(contract.object, 500)}" termina em ${this.formatDate(contract.endDate, timeZone)}.`,
            actionUrl: '/contratos',
          })),
        )
      ).length;
    }

    return generated;
  }

  private slaWorkOrderSelect() {
    return {
      id: true,
      number: true,
      title: true,
      requesterUserId: true,
      assignedToUserId: true,
      slaResolutionDeadline: true,
      slaResolutionWarningAt: true,
      slaSnapshot: true,
      slaPolicy: { select: { warningMinutesBefore: true } },
      building: { select: { managerUserId: true } },
      contracts: {
        where: { isPrimary: true },
        take: 1,
        select: {
          contract: {
            select: { managerUserId: true, inspectorUserId: true },
          },
        },
      },
    } as const;
  }

  private workOrderRecipients(
    workOrder: {
      requesterUserId: string;
      assignedToUserId: string | null;
      building: { managerUserId: string | null };
      contracts: Array<{
        contract: { managerUserId: string | null; inspectorUserId: string | null };
      }>;
    },
    supervisorIds: string[],
  ): string[] {
    const primaryContract = workOrder.contracts[0]?.contract;
    return this.uniqueIds([
      ...supervisorIds,
      workOrder.requesterUserId,
      workOrder.assignedToUserId,
      workOrder.building.managerUserId,
      primaryContract?.managerUserId,
      primaryContract?.inspectorUserId,
    ]);
  }

  private uniqueIds(values: Array<string | null | undefined>): string[] {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
  }

  private formatDateTime(value: Date, timeZone: string): string {
    try {
      return value.toLocaleString('pt-BR', { timeZone });
    } catch {
      return value.toISOString();
    }
  }

  private formatDate(value: Date, timeZone: string): string {
    try {
      return value.toLocaleDateString('pt-BR', { timeZone });
    } catch {
      return value.toISOString().slice(0, 10);
    }
  }

  private truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
  }

  private warningMinutesFromSnapshot(value: unknown): number | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const policy = (value as Record<string, unknown>).policy;
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return undefined;
    const minutes = Number((policy as Record<string, unknown>).warningMinutesBefore);
    return Number.isInteger(minutes) && minutes >= 0 ? minutes : undefined;
  }

  private warningAtFromSnapshot(value: unknown): Date | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const raw = (value as Record<string, unknown>).resolutionWarningAt;
    if (typeof raw !== 'string') return undefined;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private async claimNext(): Promise<NotificationOutbox | null> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - this.staleAfterMs);
    const candidates = await this.prisma.notificationOutbox.findMany({
      where: {
        availableAt: { lte: now },
        OR: [
          {
            status: {
              in: [NotificationOutboxStatus.PENDING, NotificationOutboxStatus.FAILED],
            },
            attempts: { lt: this.maxAttempts },
          },
          {
            status: NotificationOutboxStatus.PROCESSING,
            updatedAt: { lt: staleBefore },
            attempts: { lt: this.maxAttempts + 1 },
          },
        ],
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      take: Math.min(this.batchSize * 2, 100),
    });

    for (const candidate of candidates) {
      const claimed = await this.prisma.notificationOutbox.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          updatedAt: candidate.updatedAt,
        },
        data: {
          status: NotificationOutboxStatus.PROCESSING,
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      if (claimed.count !== 1) continue;

      return this.prisma.notificationOutbox.findUnique({ where: { id: candidate.id } });
    }

    return null;
  }

  private async processClaimed(event: NotificationOutbox): Promise<void> {
    try {
      const payload = parseNotificationPayload(event.payload);
      const now = new Date();
      const membership = await this.prisma.tenantMembership.findFirst({
        where: {
          tenantId: event.tenantId,
          userId: event.recipientUserId,
          status: MembershipStatus.ACTIVE,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          user: { status: UserStatus.ACTIVE, deletedAt: null },
        },
        include: { user: { select: { name: true, email: true } } },
      });

      if (!membership) {
        await this.complete(event.id, 'Destinatário sem vínculo ativo; evento ignorado.');
        this.logger.log(
          this.logData('notification_skipped_inactive_recipient', {
            eventId: event.id,
            tenantId: event.tenantId,
            eventType: event.eventType,
          }),
        );
        return;
      }

      if (
        event.eventType === NotificationEventType.CONTRACT_EXPIRING &&
        !CONTRACT_READ_ROLES.includes(membership.role)
      ) {
        await this.complete(event.id, 'Destinatário sem acesso a contratos; evento ignorado.');
        this.logger.log(
          this.logData('notification_skipped_unauthorized_recipient', {
            eventId: event.id,
            tenantId: event.tenantId,
            eventType: event.eventType,
          }),
        );
        return;
      }

      if (payload.workOrderId) {
        const workOrder = await this.prisma.workOrder.findFirst({
          where: { id: payload.workOrderId, tenantId: event.tenantId, deletedAt: null },
          select: { id: true, requesterUserId: true },
        });
        if (!workOrder) {
          throw new InvalidNotificationPayloadError(
            'A ordem de serviço da notificação não pertence ao tenant do evento.',
          );
        }
        if (
          membership.role === MembershipRole.REQUESTER &&
          membership.userId !== workOrder.requesterUserId
        ) {
          await this.complete(event.id, 'Destinatário sem acesso à OS; evento ignorado.');
          this.logger.log(
            this.logData('notification_skipped_unauthorized_recipient', {
              eventId: event.id,
              tenantId: event.tenantId,
              eventType: event.eventType,
            }),
          );
          return;
        }
      }

      const preference = await this.prisma.notificationPreference.findUnique({
        where: {
          tenantId_userId_eventType: {
            tenantId: event.tenantId,
            userId: event.recipientUserId,
            eventType: event.eventType,
          },
        },
      });
      const inAppEnabled = preference?.inAppEnabled ?? true;
      const emailEnabled = preference?.emailEnabled ?? true;

      if (inAppEnabled) {
        // O ID compartilhado torna a criação da caixa interna idempotente
        // mesmo se o processo cair depois desta etapa e antes de concluir a outbox.
        await this.prisma.notification.upsert({
          where: { id: event.id },
          create: {
            id: event.id,
            tenantId: event.tenantId,
            userId: event.recipientUserId,
            workOrderId: payload.workOrderId,
            eventType: event.eventType,
            title: payload.title,
            message: payload.message,
            actionUrl: payload.actionUrl,
          },
          update: {},
        });
      }

      let completionNote: string | undefined;
      if (emailEnabled && !this.mail.isAvailable()) {
        if (!inAppEnabled) {
          throw new MailDeliveryError(
            'O canal de e-mail está habilitado, mas o provedor não está configurado.',
            false,
          );
        }
        completionNote =
          'Notificação interna entregue; canal de e-mail indisponível nesta instalação.';
        this.logger.warn(
          this.logData('notification_email_channel_unavailable', {
            eventId: event.id,
            tenantId: event.tenantId,
            eventType: event.eventType,
          }),
        );
      } else if (emailEnabled) {
        const absoluteActionUrl = payload.actionUrl
          ? new URL(payload.actionUrl, this.webBaseUrl()).toString()
          : undefined;
        await this.mail.sendEmail({
          to: membership.user.email,
          subject: payload.title,
          heading: payload.title,
          message: payload.message,
          actionLabel: absoluteActionUrl ? 'Ver no Gestão de Prédios' : undefined,
          actionUrl: absoluteActionUrl,
          idempotencyKey: `notification/${event.id}`,
        });
      }

      await this.complete(event.id, completionNote);
      this.processed += 1;
      this.logger.log(
        this.logData('notification_delivered', {
          eventId: event.id,
          tenantId: event.tenantId,
          eventType: event.eventType,
          attempt: event.attempts,
          inAppEnabled,
          emailEnabled,
          emailDelivered: emailEnabled && this.mail.isAvailable(),
        }),
      );
    } catch (error) {
      this.failed += 1;
      const retryable = this.isRetryable(error);
      await this.fail(event, error, retryable);
    }
  }

  private async complete(id: string, note?: string): Promise<void> {
    await this.prisma.notificationOutbox.updateMany({
      where: { id, status: NotificationOutboxStatus.PROCESSING },
      data: {
        status: NotificationOutboxStatus.SENT,
        processedAt: new Date(),
        lastError: note?.slice(0, 2_000) ?? null,
      },
    });
  }

  private async fail(
    event: NotificationOutbox,
    error: unknown,
    retryable: boolean,
  ): Promise<void> {
    const terminal = !retryable || event.attempts >= this.maxAttempts;
    const attempts = terminal && event.attempts < this.maxAttempts
      ? this.maxAttempts
      : event.attempts;
    const availableAt = terminal
      ? new Date()
      : new Date(Date.now() + this.retryDelayMs(event.attempts));
    const lastError = this.errorMessage(error).slice(0, 2_000);

    await this.prisma.notificationOutbox.updateMany({
      where: { id: event.id, status: NotificationOutboxStatus.PROCESSING },
      data: {
        status: NotificationOutboxStatus.FAILED,
        attempts,
        availableAt,
        lastError,
      },
    });

    const data = this.logData(terminal ? 'notification_delivery_terminal_failure' : 'notification_delivery_retry', {
      eventId: event.id,
      tenantId: event.tenantId,
      eventType: event.eventType,
      attempt: event.attempts,
      nextAttemptAt: terminal ? null : availableAt.toISOString(),
      error: lastError,
    });
    if (terminal) this.logger.error(data);
    else this.logger.warn(data);
  }

  private retryDelayMs(attempt: number): number {
    const base = this.numberConfig('NOTIFICATION_RETRY_BASE_MS', 30_000, 1_000, 10 * 60_000);
    const capped = Math.min(base * 2 ** Math.max(0, attempt - 1), 60 * 60_000);
    const jitter = Math.floor(capped * 0.2 * Math.random());
    return capped + jitter;
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof InvalidNotificationPayloadError) return false;
    if (error instanceof MailDeliveryError) return error.retryable;
    return true;
  }

  private schedule(delayMs: number): void {
    if (this.shuttingDown) return;
    this.timer = setTimeout(() => {
      void this.processBatch()
        .catch(() => undefined)
        .finally(() => this.schedule(this.intervalMs));
    }, delayMs);
    this.timer.unref();
  }

  private webBaseUrl(): string {
    const configured = this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
    return `${configured.replace(/\/$/, '')}/`;
  }

  private booleanConfig(name: string, fallback: boolean): boolean {
    const value = this.config.get(name);
    if (value === undefined || value === null || value === '') return fallback;
    return String(value).toLowerCase() === 'true' || String(value) === '1';
  }

  private numberConfig(name: string, fallback: number, min: number, max: number): number {
    const configured = Number(this.config.get(name) ?? fallback);
    return Number.isFinite(configured) ? Math.min(max, Math.max(min, configured)) : fallback;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Erro desconhecido';
  }

  private logData(event: string, data: Record<string, unknown>): string {
    return JSON.stringify({ event, ...data });
  }
}
