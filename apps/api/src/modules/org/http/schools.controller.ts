import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createAcademicYearSchema,
  createClassSchema,
  createSchoolSchema,
  createTeacherSchema,
  updateSpaceSettingsSchema,
} from '@nopi/contracts';
import type { Grade } from '@nopi/domain';
import type { z } from 'zod';
import { CurrentActor, CurrentUser, ZodPipe, type Actor, type UserActor } from '../../../platform/index.js';
import { SchoolsService } from '../application/schools.service.js';
import { SpaceSettingsService } from '../application/space-settings.service.js';
import { TeachingService } from '../application/teaching.service.js';

@Controller()
export class SchoolsController {
  constructor(
    private readonly schools: SchoolsService,
    private readonly teaching: TeachingService,
    private readonly settings: SpaceSettingsService,
  ) {}

  @Get('schools/:schoolId/settings')
  getSettings(@CurrentActor() actor: Actor, @Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.settings.view(actor, schoolId);
  }

  /** Giờ yên lặng, giờ gửi tổng hợp cho giáo viên, lượt quét đề/ngày, trần video, thời hạn lưu media. */
  @Patch('schools/:schoolId/settings')
  updateSettings(
    @CurrentActor() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body(new ZodPipe(updateSpaceSettingsSchema)) b: z.infer<typeof updateSpaceSettingsSchema>,
  ) {
    return this.settings.update(actor, schoolId, b);
  }

  @Post('admin/schools')
  createSchool(@CurrentActor() actor: Actor, @Body(new ZodPipe(createSchoolSchema)) b: z.infer<typeof createSchoolSchema>) {
    return this.schools.createSchool(actor, b);
  }

  /** Các trường/không gian của tôi và vai trò ở từng nơi (để app chọn "bộ mặt"). */
  @Get('me/schools')
  mySchools(@CurrentUser() actor: UserActor) {
    return this.schools.mySchools(actor);
  }

  @Post('schools/:schoolId/academic-years')
  createYear(
    @CurrentActor() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body(new ZodPipe(createAcademicYearSchema)) b: z.infer<typeof createAcademicYearSchema>,
  ) {
    return this.schools.createAcademicYear(actor, schoolId, b);
  }

  @Get('schools/:schoolId/academic-years')
  listYears(@CurrentActor() actor: Actor, @Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.schools.listAcademicYears(actor, schoolId);
  }

  @Post('schools/:schoolId/classes')
  createClass(
    @CurrentActor() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body(new ZodPipe(createClassSchema)) b: z.infer<typeof createClassSchema>,
  ) {
    return this.schools.createClass(actor, schoolId, { ...b, grade: b.grade as Grade });
  }

  @Get('schools/:schoolId/classes')
  listClasses(
    @CurrentActor() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('academicYearId', ParseUUIDPipe) academicYearId: string,
  ) {
    return this.schools.listClasses(actor, schoolId, academicYearId);
  }

  @Post('schools/:schoolId/teachers')
  async addTeacher(
    @CurrentActor() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body(new ZodPipe(createTeacherSchema)) b: z.infer<typeof createTeacherSchema>,
  ) {
    await this.schools.addTeacher(actor, schoolId, b);
    return (await this.schools.listTeachers(actor, schoolId)).find((t) => t.phone === b.phone);
  }

  @Get('schools/:schoolId/teachers')
  listTeachers(@CurrentActor() actor: Actor, @Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.schools.listTeachers(actor, schoolId);
  }

  @Get('schools/:schoolId/academic-years/:yearId/teaching-grid')
  grid(
    @CurrentActor() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('yearId', ParseUUIDPipe) yearId: string,
  ) {
    return this.teaching.grid(actor, schoolId, yearId);
  }
}
