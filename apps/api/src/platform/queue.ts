import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker, type JobsOptions, type Processor } from 'bullmq';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from './config.js';

/** Tên các hàng đợi việc nền. Thêm loại việc mới = thêm tên ở đây + đăng ký xử lý trong apps/worker. */
export const QUEUES = {
  media: 'media', // xử lý ảnh/video/ghi âm sau khi tải lên
  scan: 'scan', // AI đọc đề từ ảnh
  reports: 'reports', // xuất báo cáo Excel/PDF
  schedule: 'schedule', // việc định kỳ: giao bài hẹn giờ, xoá media hết hạn…
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * Hàng đợi BullMQ. API chỉ thêm việc; apps/worker gọi process() để nhận việc.
 * Mỗi việc cần idempotent: có thể được chạy lại khi lỗi.
 */
@Injectable()
export class JobQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(JobQueue.name);
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];
  private connection?: Redis;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private conn() {
    // BullMQ yêu cầu maxRetriesPerRequest = null cho kết nối dùng chung với worker
    this.connection ??= new Redis(this.config.REDIS_URL, { maxRetriesPerRequest: null });
    return this.connection;
  }

  queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.conn(), defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
      this.queues.set(name, q);
    }
    return q;
  }

  async add(name: QueueName, jobName: string, data: object, opts: JobsOptions = {}) {
    await this.queue(name).add(jobName, data, opts);
  }

  /** Chỉ apps/worker gọi. */
  process(name: QueueName, handler: Processor, concurrency = 2) {
    const w = new Worker(name, handler, { connection: this.conn(), concurrency });
    w.on('failed', (job, err) => this.logger.warn(`Việc ${name}/${job?.name} #${job?.id} lỗi: ${err.message}`));
    this.workers.push(w);
    return w;
  }

  async onApplicationShutdown() {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection?.quit().catch(() => undefined);
  }
}
