import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule, AssignmentsService, JobQueue, loadConfig, MediaJobs, NotificationService, NotificationTriggers, OutboxRelay, QUEUES, ReportsService, ScanService } from '@nopi/api';

/**
 * Worker: app riêng, nạp cùng AppModule với API (dùng chung mô-đun và handler sự kiện).
 * - Chuyển sự kiện outbox → handler (vd. MediaUploaded → xếp việc xử lý media)
 * - Hàng đợi "media": chuẩn hoá video/ghi âm, ảnh thu nhỏ, đo thời lượng (ffmpeg)
 * - Hàng đợi "scan": AI đọc đề từ ảnh trang sách/phiếu bài tập
 * - Hàng đợi "reports": xuất báo cáo Excel/PDF
 * - Hàng đợi "schedule": giao bài hẹn giờ (mỗi phút), gửi thông báo (30 giây), nhắc bài 18:00,
 *   tổng hợp cho giáo viên (giờ theo từng trường, mặc định 20:00), xoá media hết hạn lưu 02:00, 09:00 báo trước media sắp xoá (7 ngày) và gói gia đình sắp hết (3 ngày) (giờ Việt Nam)
 */
const config = loadConfig();
const app = await NestFactory.createApplicationContext(AppModule.forRoot(config));
app.enableShutdownHooks();
const logger = new Logger('Worker');
const queue = app.get(JobQueue);
const mediaJobs = app.get(MediaJobs);
const assignments = app.get(AssignmentsService);
const notifications = app.get(NotificationService);
const triggers = app.get(NotificationTriggers);

queue.process(QUEUES.media, (job) => mediaJobs.run(job.name, job.data), 2);
const scan = app.get(ScanService);
// AI đọc đề: lỗi tạm thì BullMQ thử lại (tối đa 3 lần), hết lượt thì báo lỗi cho người quét
queue.process(QUEUES.scan, (job) => scan.run(job.data.scanJobId, job.attemptsMade + 1, job.opts.attempts ?? 1), 2);
const reports = app.get(ReportsService);
queue.process(QUEUES.reports, (job) => reports.run(job.data.exportJobId, job.attemptsMade + 1, job.opts.attempts ?? 1), 1);
queue.process(
  QUEUES.schedule,
  async (job) => {
    if (job.name === 'publish-due') await assignments.publishDue();
    if (job.name === 'delete-expired') await mediaJobs.run('delete-expired', {});
    if (job.name === 'notifications-dispatch') await notifications.dispatchDue();
    if (job.name === 'due-reminders') await triggers.dueReminders();
    if (job.name === 'teacher-digest') await triggers.teacherDigests();
    if (job.name === 'media-expiring') {
      await triggers.mediaExpiringWarnings();
      await triggers.planExpiringWarnings();
    }
  },
  1,
);
const schedule = queue.queue(QUEUES.schedule);
await schedule.upsertJobScheduler('publish-due', { every: 60_000 }, { name: 'publish-due' });
await schedule.upsertJobScheduler('delete-expired', { pattern: '0 2 * * *', tz: 'Asia/Ho_Chi_Minh' }, { name: 'delete-expired' });
await schedule.upsertJobScheduler('notifications-dispatch', { every: 30_000 }, { name: 'notifications-dispatch' });
await schedule.upsertJobScheduler('due-reminders', { pattern: '0 18 * * *', tz: 'Asia/Ho_Chi_Minh' }, { name: 'due-reminders' });
await schedule.upsertJobScheduler('media-expiring', { pattern: '0 9 * * *', tz: 'Asia/Ho_Chi_Minh' }, { name: 'media-expiring' });
// Mỗi giờ tròn; mỗi trường tự chọn giờ gửi (cài đặt teacherDigestTime, mặc định 20:00)
await schedule.upsertJobScheduler('teacher-digest', { pattern: '0 * * * *', tz: 'Asia/Ho_Chi_Minh' }, { name: 'teacher-digest' });

const relay = app.get(OutboxRelay);
let stopping = false;
process.on('SIGTERM', () => (stopping = true));
process.on('SIGINT', () => (stopping = true));

logger.log('Worker đã chạy');
while (!stopping) {
  try {
    const { processed } = await relay.relayBatch();
    if (processed === 0) await new Promise((r) => setTimeout(r, config.OUTBOX_POLL_MS));
  } catch (err) {
    logger.error(err);
    await new Promise((r) => setTimeout(r, config.OUTBOX_POLL_MS * 5));
  }
}
await app.close();
