import { Injectable } from '@nestjs/common';
import { JobQueue, OnDomainEvent, QUEUES, type DomainEvent } from '../../../platform/index.js';
import { MediaUploaded, MediaService } from './media.service.js';

/** Nối sự kiện "đã tải lên" với hàng đợi xử lý media; worker gọi run(). */
@Injectable()
export class MediaJobs {
  constructor(
    private readonly queue: JobQueue,
    private readonly media: MediaService,
  ) {}

  @OnDomainEvent(MediaUploaded.type)
  async onUploaded(e: DomainEvent) {
    const { mediaId } = e.payload as { mediaId: string };
    // jobId = mediaId: sự kiện được giao lại cũng không tạo việc trùng
    await this.queue.add(QUEUES.media, 'process', { mediaId }, { jobId: `process-${mediaId}` });
  }

  async run(jobName: string, data: { mediaId?: string }) {
    if (jobName === 'process' && data.mediaId) await this.media.process(data.mediaId);
    if (jobName === 'delete-expired') {
      await this.media.deleteExpired();
      await this.media.deleteAbandonedUploads();
    }
  }
}
