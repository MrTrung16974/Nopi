import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, ZodPipe, type UserActor } from '../../../platform/index.js';
import { TemplatesService } from '../application/templates.service.js';

const optInt = z.coerce.number().int().positive().optional();
const listQuery = z.object({ subjectId: optInt, stage: z.enum(['primary', 'lower_secondary']).optional() });
const addComment = z.object({ text: z.string().trim().min(2).max(300), subjectId: z.number().int().optional() });

@Controller()
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get('comment-templates')
  comments(@CurrentUser() actor: UserActor, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.templates.comments(actor, q);
  }

  /** Cô lưu câu nhận xét hay dùng của riêng mình. */
  @Post('comment-templates')
  add(@CurrentUser() actor: UserActor, @Body(new ZodPipe(addComment)) b: z.infer<typeof addComment>) {
    return this.templates.addComment(actor, b.text, b.subjectId);
  }

  @Delete('comment-templates/:id')
  @HttpCode(204)
  async remove(@CurrentUser() actor: UserActor, @Param('id', ParseUUIDPipe) id: string) {
    await this.templates.deleteComment(actor, id);
  }

  @Get('assignment-templates')
  assignmentTemplates(@CurrentUser() actor: UserActor, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.templates.assignmentTemplates(actor, q.subjectId);
  }
}
