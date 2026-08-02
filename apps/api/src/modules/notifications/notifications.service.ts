import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  NotificationEventType,
  NotificationOutboxStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListNotificationsQuery } from './dto/list-notifications.query';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

const EVENT_TYPES = Object.values(NotificationEventType);

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    userId: string,
    role: MembershipRole,
    query: ListNotificationsQuery,
  ) {
    const where = {
      ...this.accessibleWhere(tenantId, userId, role),
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const skip = (query.page - 1) * query.pageSize;

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { ...this.accessibleWhere(tenantId, userId, role), readAt: null },
      }),
    ]);

    return {
      items,
      unreadCount,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  unreadCount(tenantId: string, userId: string, role: MembershipRole) {
    return this.prisma.notification
      .count({
        where: { ...this.accessibleWhere(tenantId, userId, role), readAt: null },
      })
      .then((count) => ({ count }));
  }

  async markRead(tenantId: string, userId: string, role: MembershipRole, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { ...this.accessibleWhere(tenantId, userId, role), id },
    });
    if (!notification) throw new NotFoundException('Notificação não encontrada.');
    if (notification.readAt) return notification;

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(tenantId: string, userId: string, role: MembershipRole) {
    const result = await this.prisma.notification.updateMany({
      where: { ...this.accessibleWhere(tenantId, userId, role), readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async getPreferences(tenantId: string, userId: string) {
    const stored = await this.prisma.notificationPreference.findMany({
      where: { tenantId, userId },
    });
    const byEvent = new Map(stored.map((preference) => [preference.eventType, preference]));

    return EVENT_TYPES.map((eventType) => {
      const preference = byEvent.get(eventType);
      return {
        eventType,
        inAppEnabled: preference?.inAppEnabled ?? true,
        emailEnabled: preference?.emailEnabled ?? true,
      };
    });
  }

  async updatePreferences(
    tenantId: string,
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const uniqueEvents = new Set(dto.preferences.map((preference) => preference.eventType));
    if (uniqueEvents.size !== dto.preferences.length) {
      throw new BadRequestException('Cada tipo de evento deve aparecer apenas uma vez.');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const preference of dto.preferences) {
        await tx.notificationPreference.upsert({
          where: {
            tenantId_userId_eventType: {
              tenantId,
              userId,
              eventType: preference.eventType,
            },
          },
          create: { tenantId, userId, ...preference },
          update: {
            inAppEnabled: preference.inAppEnabled,
            emailEnabled: preference.emailEnabled,
          },
        });
      }
    });

    return this.getPreferences(tenantId, userId);
  }

  async outboxMetrics(tenantId: string, maxAttempts: number) {
    const [pending, processing, retrying, terminalFailed, oldest] = await Promise.all([
      this.prisma.notificationOutbox.count({
        where: { tenantId, status: NotificationOutboxStatus.PENDING },
      }),
      this.prisma.notificationOutbox.count({
        where: { tenantId, status: NotificationOutboxStatus.PROCESSING },
      }),
      this.prisma.notificationOutbox.count({
        where: {
          tenantId,
          status: NotificationOutboxStatus.FAILED,
          attempts: { lt: maxAttempts },
        },
      }),
      this.prisma.notificationOutbox.count({
        where: {
          tenantId,
          status: NotificationOutboxStatus.FAILED,
          attempts: { gte: maxAttempts },
        },
      }),
      this.prisma.notificationOutbox.findFirst({
        where: {
          tenantId,
          status: {
            in: [NotificationOutboxStatus.PENDING, NotificationOutboxStatus.FAILED],
          },
        },
        orderBy: { availableAt: 'asc' },
        select: { availableAt: true },
      }),
    ]);

    return {
      pending,
      processing,
      retrying,
      terminalFailed,
      oldestAvailableAt: oldest?.availableAt ?? null,
    };
  }

  private accessibleWhere(
    tenantId: string,
    userId: string,
    role: MembershipRole,
  ): Prisma.NotificationWhereInput {
    const where: Prisma.NotificationWhereInput = { tenantId, userId };
    if (role !== MembershipRole.REQUESTER) return where;

    return {
      ...where,
      workOrderId: { not: null },
      workOrder: {
        is: {
          tenantId,
          requesterUserId: userId,
          deletedAt: null,
        },
      },
    };
  }
}
