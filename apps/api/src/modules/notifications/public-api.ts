// Thứ duy nhất mô-đun khác được import từ notifications.
export { NotificationsModule } from './notifications.module.js';
export { NotificationService, type Recipient } from './application/notification.service.js';
export { NotificationTriggers } from './application/notification-triggers.js';
export { PUSH_SENDER, FakePushSender, ExpoPushSender, type PushSender } from './ports/push-sender.js';
export { ZALO_SENDER, FakeZaloSender, type ZaloSender } from './ports/zalo-sender.js';
