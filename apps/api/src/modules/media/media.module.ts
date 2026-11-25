import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../platform/index.js';
import { OrgModule } from '../org/public-api.js';
import { MediaJobs } from './application/media-jobs.js';
import { MediaService } from './application/media.service.js';
import { MediaController } from './http/media.controller.js';
import { FfmpegProcessor, MEDIA_PROCESSOR } from './ports/media-processor.js';
import { OBJECT_STORAGE, S3ObjectStorage } from './ports/object-storage.js';

@Module({
  imports: [OrgModule],
  controllers: [MediaController],
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [APP_CONFIG],
      useFactory: async (c: AppConfig) => {
        const s = new S3ObjectStorage({
          endpoint: c.S3_ENDPOINT,
          publicEndpoint: c.S3_PUBLIC_ENDPOINT,
          region: c.S3_REGION,
          bucket: c.S3_BUCKET,
          accessKey: c.S3_ACCESS_KEY,
          secretKey: c.S3_SECRET_KEY,
        });
        if (c.S3_CREATE_BUCKET) await s.ensureBucket();
        return s;
      },
    },
    { provide: MEDIA_PROCESSOR, useValue: new FfmpegProcessor() },
    MediaService,
    MediaJobs,
  ],
  exports: [MediaService, MediaJobs],
})
export class MediaModule {}
