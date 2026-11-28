import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  addSchoolAdminSchema,
  adminSchoolQuerySchema,
  updateSchoolSchema,
  createAcademicYearSchema,
  createClassSchema,
  createSchoolSchema,
  createTeacherSchema,
  updateSpaceSettingsSchema,
} from '@nopi/contracts';
import type { Grade } from '@nopi/domain';
import type { z } from 'zod';
import { CurrentActor, CurrentUser, ZodPipe, type Actor, type UserActor } from '../../../platform/index.js';
import { AdminSchoolsService } from '../application/admin-schools.service.js';
import { SchoolsService } from '../application/schools.service.js';
import { SpaceSettingsService } from '../application/space-settings.service.js';
import { TeachingService } from '../application/teaching.service.js';

@Controller()
export class SchoolsController {
  constructor(
    private readonly schools: SchoolsService,
    private readonly teaching: TeachingService,
    private readonly settings: SpaceSettingsService,
    private readonly adminSchools: AdminSchoolsService,
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

  // ----- Quản trị hệ thống -----
  @Get('admin/schools')
  listSchools(@CurrentActor() actor: Actor, @Query(new ZodPipe(adminSchoolQuerySchema)) q: z.infer<typeof adminSchoolQuerySchema>) {
    return this.adminSchools.list(actor, q);
  }

  @Get('admin/schools/:schoolId')
  getSchool(@CurrentActor() actor: Actor, @Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.adminSchools.get(actor, schoolId);
  }

  @Patch('admin/schools/:schoolId')
  updateSchool(@CurrentActor() actor: Actor, @Param('schoolId', ParseUUIDPipe) schoolId: string, @Body(new ZodPipe(updateSchoolSchema)) b: z.infer<typeof updateSchoolSchema>) {
    return this.adminSchools.update(actor, schoolId, b);
  }

  @Post('admin/schools/:schoolId/admins')
  addSchoolAdmin(@CurrentActor() actor: Actor, @Param('schoolId', ParseUUIDPipe) schoolId: string, @Body(new ZodPipe(addSchoolAdminSchema)) b: z.infer<typeof addSchoolAdminSchema>) {
    return this.adminSchools.addAdmin(actor, schoolId, b);
  }

  @Delete('admin/schools/:schoolId/admins/:userId')
  removeSchoolAdmin(@CurrentActor() actor: Actor, @Param('schoolId', ParseUUIDPipe) schoolId: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.adminSchools.removeAdmin(actor, schoolId, userId);
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
