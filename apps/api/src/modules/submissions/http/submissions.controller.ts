import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { evaluateSchema, submitSchema, uploadRequestSchema } from '@nopi/contracts';
import type { z } from 'zod';
import { CurrentActor, ZodPipe, type Actor } from '../../../platform/index.js';
import { SubmissionsService } from '../application/submissions.service.js';

@Controller()
export class SubmissionsController {
  constructor(private readonly subs: SubmissionsService) {}

  // ----- Học sinh / phụ huynh (nộp hộ) -----
  @Get('student-assignments/:id')
  detail(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.subs.detail(actor, id);
  }

  @Post('student-assignments/:id/uploads')
  upload(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(uploadRequestSchema)) b: z.infer<typeof uploadRequestSchema>) {
    return this.subs.upload(actor, id, b);
  }

  /** "Gửi cho cô" */
  @Post('student-assignments/:id/submissions')
  @HttpCode(200)
  submit(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(submitSchema)) b: z.infer<typeof submitSchema>) {
    return this.subs.submit(actor, id, b);
  }

  // ----- Giáo viên -----
  @Get('assignments/:id/submissions')
  grading(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.subs.gradingList(actor, id);
  }

  @Put('submissions/:id/evaluation')
  evaluate(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(evaluateSchema)) b: z.infer<typeof evaluateSchema>) {
    return this.subs.evaluate(actor, id, b);
  }

  @Post('submissions/:id/comment-uploads')
  commentUpload(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(uploadRequestSchema)) b: z.infer<typeof uploadRequestSchema>) {
    return this.subs.commentUpload(actor, id, b);
  }
}
