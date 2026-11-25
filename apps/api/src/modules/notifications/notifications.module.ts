import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../platform/index.js';
import { AssignmentsModule } from '../assignments/public-api.js';
import { BillingModule } from '../billing/public-api.js';
import { IdentityModule } from '../identity/public-api.js';
import { OrgModule } from '../org/public-api.js';
import { SubmissionsModule } from '../submissions/public-api.js';
import { NotificationTriggers } from './application/notification-triggers.js';
import { NotificationService } from './application/notification.service.js';
import { NotificationsController } from './http/notifications.controller.js';
import { ConsolePushSender, ExpoPushSender, PUSH_SENDER } from './ports/push-sender.js';
import { ConsoleZaloSender, ZALO_SENDER } from './ports/zalo-sender.js';

@Module({
  imports: [AssignmentsModule, SubmissionsModule, IdentityModule, OrgModule, BillingModule],
  controllers: [NotificationsController],
  providers: [
    { provide: PUSH_SENDER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => (c.PUSH_PROVIDER === 'expo' ? new ExpoPushSender(c.EXPO_ACCESS_TOKEN) : new ConsolePushSender()) },
    { provide: ZALO_SENDER, useValue: new ConsoleZaloSender() },
    NotificationService,
    NotificationTriggers,
  ],
  exports: [NotificationService, NotificationTriggers],
})
export class NotificationsModule {}
