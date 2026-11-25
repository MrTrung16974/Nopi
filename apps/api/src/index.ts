/**
 * Phần của API mà apps/worker dùng lại: cùng mô-đun nghiệp vụ, cùng handler sự kiện,
 * nên worker không phải viết lại nghiệp vụ. Thêm export ở đây khi worker cần thêm.
 */
export { AppModule, FEATURE_MODULES } from './app.module.js';
export { loadConfig, type AppConfig } from './platform/config.js';
export { OutboxRelay } from './platform/events/outbox-relay.js';
export { JobQueue, QUEUES } from './platform/queue.js';
export { MediaJobs } from './modules/media/public-api.js';
export { AssignmentsService } from './modules/assignments/public-api.js';
export { NotificationService, NotificationTriggers } from './modules/notifications/public-api.js';
export { ScanService } from './modules/scan/public-api.js';
export { ReportsService } from './modules/reporting/public-api.js';
