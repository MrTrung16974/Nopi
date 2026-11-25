import { Controller, Get, Param } from '@nestjs/common';
import { gradeParamsSchema, type GradeSubjectsResponse } from '@nopi/contracts';
import type { Grade } from '@nopi/domain';
import { Public, ZodPipe } from '../../../platform/index.js';
import { CurriculumService } from '../application/curriculum.service.js';

// Danh mục môn là dữ liệu công khai (không chứa thông tin cá nhân)
@Public()
@Controller('curriculum')
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  /** Bộ môn của một khối, đúng thứ tự ô trên trang chủ. */
  @Get('grades/:grade/subjects')
  subjectsOfGrade(
    @Param(new ZodPipe(gradeParamsSchema)) params: { grade: number },
  ): Promise<GradeSubjectsResponse> {
    return this.curriculum.subjectsOfGrade(params.grade as Grade);
  }
}
