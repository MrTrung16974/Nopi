import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createPracticeSchema, createScanJobSchema, scanUploadSchema } from '@nopi/contracts';
import type { z } from 'zod';
import { CurrentActor, ZodPipe, type Actor } from '../../../platform/index.js';
import { ScanService } from '../application/scan.service.js';

@Controller()
export class ScanController {
  constructor(private readonly scan: ScanService) {}

  /** Xin URL tải ảnh trang đề. */
  @Post('scan/uploads')
  upload(@CurrentActor() actor: Actor, @Body(new ZodPipe(scanUploadSchema)) b: z.infer<typeof scanUploadSchema>) {
    return this.scan.upload(actor, b);
  }

  @Post('scan-jobs')
  create(@CurrentActor() actor: Actor, @Body(new ZodPipe(createScanJobSchema)) b: z.infer<typeof createScanJobSchema>) {
    return this.scan.createJob(actor, b);
  }

  @Get('scan-jobs/:id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.scan.getJob(actor, id);
  }

  /** Học sinh lớp 6–9: lưu đề đã quét thành bài tự luyện. */
  @Post('student/practice')
  practice(@CurrentActor() actor: Actor, @Body(new ZodPipe(createPracticeSchema)) b: z.infer<typeof createPracticeSchema>) {
    return this.scan.createPractice(actor, b);
  }
}
