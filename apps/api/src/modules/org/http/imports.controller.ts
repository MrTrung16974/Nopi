import { Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentActor, type Actor } from '../../../platform/index.js';
import { ImportService } from '../application/import.service.js';
import { readXlsxUpload, XLSX_MIME } from './upload.js';

const isDryRun = (v?: string) => v !== 'false' && v !== '0';

@Controller()
export class ImportsController {
  constructor(private readonly imports: ImportService) {}

  @Get('imports/templates/students.xlsx')
  @Header('Content-Type', XLSX_MIME)
  @Header('Content-Disposition', 'attachment; filename="mau-danh-sach-hoc-sinh.xlsx"')
  studentTemplate() {
    return this.imports.studentTemplate();
  }

  @Get('imports/templates/teachers.xlsx')
  @Header('Content-Type', XLSX_MIME)
  @Header('Content-Disposition', 'attachment; filename="mau-danh-sach-giao-vien.xlsx"')
  teacherTemplate() {
    return this.imports.teacherTemplate();
  }

  /** Mặc định chỉ kiểm tra (dryRun). Gửi ?dryRun=false để ghi thật. */
  @Post('schools/:schoolId/imports/students')
  async students(
    @CurrentActor() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Query('dryRun') dryRun: string | undefined,
    @Req() req: FastifyRequest,
  ) {
    const file = await readXlsxUpload(req);
    return this.imports.importStudents(actor, schoolId, academicYearId, file, isDryRun(dryRun));
  }

  @Post('schools/:schoolId/imports/teachers')
  async teachers(
    @CurrentActor() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('dryRun') dryRun: string | undefined,
    @Req() req: FastifyRequest,
  ) {
    const file = await readXlsxUpload(req);
    return this.imports.importTeachers(actor, schoolId, file, isDryRun(dryRun));
  }
}
