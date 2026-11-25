import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createAssignmentSchema, uploadRequestSchema } from '@nopi/contracts';
import type { z } from 'zod';
import { CurrentActor, CurrentStudent, ZodPipe, type Actor, type StudentActor } from '../../../platform/index.js';
import { AssignmentsService } from '../application/assignments.service.js';
import { StudentWorkService } from '../application/student-work.service.js';

@Controller()
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly work: StudentWorkService,
  ) {}

  // ----- Giáo viên (hoặc bố mẹ trong không gian gia đình) -----
  @Post('assignments')
  create(@CurrentActor() actor: Actor, @Body(new ZodPipe(createAssignmentSchema)) b: z.infer<typeof createAssignmentSchema>) {
    return this.assignments.create(actor, b);
  }

  @Get('assignments/:id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.getForTeacher(actor, id);
  }

  @Get('teaching/:teachingAssignmentId/assignments')
  listForTeaching(@CurrentActor() actor: Actor, @Param('teachingAssignmentId', ParseUUIDPipe) id: string) {
    return this.assignments.listForTeaching(actor, id);
  }

  /** Ghi âm đọc đề / ảnh đề đính kèm trước khi giao. */
  @Post('teaching/:teachingAssignmentId/uploads')
  instructionsUpload(
    @CurrentActor() actor: Actor,
    @Param('teachingAssignmentId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(uploadRequestSchema)) b: z.infer<typeof uploadRequestSchema>,
  ) {
    return this.assignments.instructionsUpload(actor, id, b);
  }

  @Get('teacher/overview')
  overview(@CurrentActor() actor: Actor) {
    return this.assignments.overview(actor);
  }

  // ----- Học sinh / phụ huynh -----
  @Get('student/assignments')
  mine(@CurrentStudent() actor: StudentActor) {
    return this.work.list(actor, actor.studentId);
  }

  /** Bài tự luyện: em tự đánh dấu "Đã xong". */
  @Post('student/practice/:id/done')
  @HttpCode(204)
  async practiceDone(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    await this.work.markPracticeDone(actor, id);
  }

  @Get('me/children/:studentId/assignments')
  childAssignments(@CurrentActor() actor: Actor, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.work.list(actor, studentId);
  }
}
