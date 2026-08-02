import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { ListNotificationsQuery } from './dto/list-notifications.query';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationOutboxProcessor } from './notification-outbox.processor';
import { NotificationsService } from './notifications.service';

@ApiTags('Notificações')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly processor: NotificationOutboxProcessor,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista as notificações do usuário no tenant atual' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQuery,
  ) {
    return this.notifications.list(user.tenantId, user.userId, user.role, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Retorna o total de notificações não lidas' })
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user.tenantId, user.userId, user.role);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Lista as preferências, incluindo os valores padrão' })
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.getPreferences(user.tenantId, user.userId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Atualiza preferências de notificação por evento' })
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(user.tenantId, user.userId, dto);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marca todas as notificações do contexto atual como lidas' })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.tenantId, user.userId, user.role);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @Get('outbox/metrics')
  @ApiOperation({ summary: 'Exibe a saúde da entrega de notificações do tenant' })
  async outboxMetrics(@CurrentUser() user: AuthenticatedUser) {
    const worker = this.processor.snapshot();
    return {
      ...(await this.notifications.outboxMetrics(
        user.tenantId,
        this.processor.maxAttempts,
      )),
      // Contadores do processo agregam todos os tenants e, por isso, não são
      // expostos a um administrador de organização.
      worker: { enabled: worker.enabled, running: worker.running },
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marca uma notificação do usuário como lida' })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(user.tenantId, user.userId, user.role, id);
  }
}
