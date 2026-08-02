import { Module } from '@nestjs/common';
import { NotificationOutboxProcessor } from './notification-outbox.processor';
import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationOutboxService,
    NotificationOutboxProcessor,
  ],
  exports: [NotificationOutboxService],
})
export class NotificationsModule {}
