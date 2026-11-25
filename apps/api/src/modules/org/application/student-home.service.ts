import { Inject, Injectable } from '@nestjs/common';
import type { StudentHome } from '@nopi/contracts';
import { schema, type Database } from '@nopi/db';
import type { Grade } from '@nopi/domain';
import { and, inArray, isNull } from 'drizzle-orm';
import { DB } from '../../../platform/index.js';
import { CurriculumService } from '../../curriculum/public-api.js';
import { StudentDirectory } from '../../identity/public-api.js';
import { AccessService } from './access.service.js';

const { schools, teachingAssignments } = schema;

/**
 * Dữ liệu trang chủ học sinh. Chỉ hiện môn đã có giáo viên được phân công
 * (tránh ô trống bấm vào không có gì), đúng thứ tự chương trình.
 */
@Injectable()
export class StudentHomeService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: AccessService,
    private readonly students: StudentDirectory,
    private readonly curriculum: CurriculumService,
  ) {}

  async home(studentId: string): Promise<StudentHome> {
    const s = await this.students.get(studentId);
    const classes = await this.access.currentClassesOf(studentId);
    const schoolRows = classes.length
      ? await this.db.select().from(schools).where(inArray(schools.id, classes.map((c) => c.schoolId)))
      : [];
    const assigned = classes.length
      ? await this.db
          .select({ classId: teachingAssignments.classId, subjectId: teachingAssignments.subjectId })
          .from(teachingAssignments)
          .where(and(inArray(teachingAssignments.classId, classes.map((c) => c.id)), isNull(teachingAssignments.validTo)))
      : [];

    const result = await Promise.all(
      classes.map(async (c) => {
        const school = schoolRows.find((x) => x.id === c.schoolId)!;
        const { subjects } = await this.curriculum.subjectsOfGrade(c.grade as Grade);
        const taught = new Set(assigned.filter((a) => a.classId === c.id).map((a) => a.subjectId));
        return {
          id: c.id,
          name: c.name,
          grade: c.grade as Grade,
          schoolName: school.name,
          schoolKind: school.kind as 'school' | 'family',
          subjects: subjects
            .filter((x) => taught.has(x.id))
            .map((x) => ({ id: x.id, code: x.code, shortName: x.shortName, icon: x.icon, color: x.color })),
        };
      }),
    );
    // Lớp ở trường lên trước, không gian gia đình sau
    result.sort((a, b) => (a.schoolKind === b.schoolKind ? 0 : a.schoolKind === 'school' ? -1 : 1));
    return {
      student: { id: s.id, fullName: s.fullName, nickname: s.nickname, avatarKey: s.avatarKey },
      grade: result.length ? (Math.max(...result.map((c) => c.grade)) as Grade) : null,
      classes: result,
    };
  }
}
