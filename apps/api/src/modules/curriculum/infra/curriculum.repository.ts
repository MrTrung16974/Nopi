import { Inject, Injectable } from '@nestjs/common';
import type { GradeSubjectDto } from '@nopi/contracts';
import { schema, type Database } from '@nopi/db';
import { asc, eq } from 'drizzle-orm';
import { DB } from '../../../platform/index.js';

// Mô-đun curriculum chỉ đọc các bảng nó sở hữu: subjects, grade_subjects, comment_templates…
const { subjects, gradeSubjects } = schema;

@Injectable()
export class CurriculumRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async allSubjects() {
    return this.db
      .select({ id: subjects.id, code: subjects.code, shortName: subjects.shortName, color: subjects.color, icon: subjects.icon })
      .from(subjects);
  }

  async findSubjectsOfGrade(grade: number): Promise<GradeSubjectDto[]> {
    const rows = await this.db
      .select({
        id: subjects.id,
        code: subjects.code,
        name: subjects.name,
        shortName: subjects.shortName,
        groupCode: subjects.groupCode,
        icon: subjects.icon,
        color: subjects.color,
        isOptional: gradeSubjects.isOptional,
        gradingScheme: gradeSubjects.gradingScheme,
        sortOrder: gradeSubjects.sortOrder,
      })
      .from(gradeSubjects)
      .innerJoin(subjects, eq(subjects.id, gradeSubjects.subjectId))
      .where(eq(gradeSubjects.grade, grade))
      .orderBy(asc(gradeSubjects.sortOrder));
    return rows as GradeSubjectDto[];
  }
}
