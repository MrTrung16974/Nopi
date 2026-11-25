import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { assignTeacherSchema, createStudentSchema, setPinSchema, studentIdsSchema } from '@nopi/contracts';
import type { z } from 'zod';
import { CurrentActor, ZodPipe, type Actor } from '../../../platform/index.js';
import { RosterService } from '../application/roster.service.js';
import { TeachingService } from '../application/teaching.service.js';

@Controller()
export class ClassesController {
  constructor(
    private readonly roster: RosterService,
    private readonly teaching: TeachingService,
  ) {}

  @Get('classes/:classId/students')
  students(@CurrentActor() actor: Actor, @Param('classId', ParseUUIDPipe) classId: string) {
    return this.roster.listStudents(actor, classId);
  }

  @Post('classes/:classId/students')
  addStudent(
    @CurrentActor() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body(new ZodPipe(createStudentSchema)) b: z.infer<typeof createStudentSchema>,
  ) {
    return this.roster.addStudent(actor, classId, b);
  }

  /** In thẻ QR đăng nhập (cả lớp, hoặc vài em khi "Cấp lại"). */
  @Post('classes/:classId/login-cards')
  @HttpCode(200)
  loginCards(
    @CurrentActor() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body(new ZodPipe(studentIdsSchema)) b: z.infer<typeof studentIdsSchema>,
  ) {
    return this.roster.issueLoginCards(actor, classId, b.studentIds);
  }

  /** In phiếu mời phụ huynh. */
  @Post('classes/:classId/guardian-invites')
  @HttpCode(200)
  invites(
    @CurrentActor() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body(new ZodPipe(studentIdsSchema)) b: z.infer<typeof studentIdsSchema>,
  ) {
    return this.roster.issueGuardianInvites(actor, classId, b.studentIds);
  }

  @Put('students/:studentId/pin')
  @HttpCode(204)
  async setPin(
    @CurrentActor() actor: Actor,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(new ZodPipe(setPinSchema)) b: z.infer<typeof setPinSchema>,
  ) {
    await this.roster.setPin(actor, studentId, b.pin);
  }

  // ----- Phân công giảng dạy -----
  @Get('classes/:classId/teaching')
  getTeaching(@CurrentActor() actor: Actor, @Param('classId', ParseUUIDPipe) classId: string) {
    return this.teaching.getClassTeaching(actor, classId);
  }

  @Put('classes/:classId/teaching/:subjectId')
  async assign(
    @CurrentActor() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseIntPipe) subjectId: number,
    @Body(new ZodPipe(assignTeacherSchema)) b: z.infer<typeof assignTeacherSchema>,
  ) {
    await this.teaching.assign(actor, classId, subjectId, b.teacherId);
    return this.teaching.getClassTeaching(actor, classId);
  }

  @Delete('classes/:classId/teaching/:subjectId')
  async unassign(
    @CurrentActor() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseIntPipe) subjectId: number,
  ) {
    await this.teaching.assign(actor, classId, subjectId, null);
    return this.teaching.getClassTeaching(actor, classId);
  }

  /** "Nhận tất cả môn của lớp" cho giáo viên chủ nhiệm. */
  @Post('classes/:classId/teaching/claim-all')
  @HttpCode(200)
  async claimAll(
    @CurrentActor() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body(new ZodPipe(assignTeacherSchema)) b: z.infer<typeof assignTeacherSchema>,
  ) {
    const r = await this.teaching.claimAll(actor, classId, b.teacherId);
    return { ...r, teaching: await this.teaching.getClassTeaching(actor, classId) };
  }
}
