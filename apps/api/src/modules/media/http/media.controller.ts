import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { completeUploadSchema } from '@nopi/contracts';
import type { z } from 'zod';
import { CurrentActor, ZodPipe, type Actor } from '../../../platform/index.js';
import { ownerOf } from '../application/media-owner.js';
import { MediaService } from '../application/media.service.js';

/**
 * Chỉ các thao tác của người đã tải file lên. Xin URL tải lên thì đi qua mô-đun dùng file
 * (nộp bài, đề bài, nhận xét…) để mô-đun đó kiểm tra quyền.
 */
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post(':mediaId/complete')
  @HttpCode(200)
  complete(
    @CurrentActor() actor: Actor,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body(new ZodPipe(completeUploadSchema)) b: z.infer<typeof completeUploadSchema>,
  ) {
    return this.media.complete(mediaId, ownerOf(actor), b.parts);
  }

  /** Tải tiếp sau khi rớt mạng (video lớn tải theo phần). */
  @Get(':mediaId/multipart')
  multipart(@CurrentActor() actor: Actor, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.media.multipartStatus(mediaId, ownerOf(actor));
  }
}
