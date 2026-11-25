import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../platform/index.js';
import { StudentWorkService } from '../../assignments/public-api.js';
import { CurriculumService } from '../../curriculum/public-api.js';
import { UserDirectory } from '../../identity/public-api.js';
import { TeachingReader } from '../../org/public-api.js';
import { vnRange } from './report-kit.js';

export interface StatRow {
  classId: string;
  className: string;
  grade: number;
  subjectId: number;
  subjectName: string;
  teacherName: string | null;
  assignments: number;
  expected: number;
  submitted: number;
  late: number;
  rate: number | null;
}

/**
 * Tỉ lệ nộp bài theo lớp × môn của một năm học (màn quản trị + báo cáo toàn trường).
 * "Đến hạn" = bài đã qua hạn tính đến lúc xem; bài chưa đến hạn không kéo tỉ lệ xuống.
 */
@Injectable()
export class SchoolStatsService {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly teaching: TeachingReader,
    private readonly work: StudentWorkService,
    private readonly curriculum: CurriculumService,
    private readonly users: UserDirectory,
  ) {}

  async compute(schoolId: string, academicYearId: string, from: string, to: string): Promise<StatRow[]> {
    const now = this.clock.now();
    const classes = await this.teaching.classesOfYear(schoolId, academicYearId);
    const tas = (await Promise.all(classes.map((c) => this.teaching.forClass(c.id)))).flat();
    const { start, end } = vnRange(from, to);
    const data = await this.work.reportData({ teachingAssignmentIds: tas.map((t) => t.id), from: start, to: end });
    const [subjects, teachers] = await Promise.all([
      this.curriculum.subjectsById([...new Set(tas.map((t) => t.subjectId))]),
      this.users.findByIds([...new Set(tas.filter((t) => t.isCurrent).map((t) => t.teacherId))]),
    ]);
    const teacherName = new Map(teachers.map((u) => [u.id, u.fullName]));
    const taById = new Map(tas.map((t) => [t.id, t]));
    const dueById = new Map(data.assignments.map((a) => [a.id, a]));

    const rows = new Map<string, StatRow>();
    const keyOf = (classId: string, subjectId: number) => `${classId}:${subjectId}`;
    for (const c of classes) {
      for (const t of tas.filter((x) => x.classId === c.id)) {
        const k = keyOf(c.id, t.subjectId);
        const row = rows.get(k) ?? {
          classId: c.id,
          className: c.name,
          grade: c.grade,
          subjectId: t.subjectId,
          subjectName: subjects.get(t.subjectId)?.shortName ?? `Môn ${t.subjectId}`,
          teacherName: null,
          assignments: 0,
          expected: 0,
          submitted: 0,
          late: 0,
          rate: null,
        };
        if (t.isCurrent) row.teacherName = teacherName.get(t.teacherId) ?? null;
        rows.set(k, row);
      }
    }
    for (const a of data.assignments) {
      const ta = a.teachingAssignmentId ? taById.get(a.teachingAssignmentId) : undefined;
      const row = ta && rows.get(keyOf(ta.classId, ta.subjectId));
      if (row) row.assignments++;
    }
    for (const sa of data.studentAssignments) {
      const a = dueById.get(sa.assignmentId);
      const ta = a?.teachingAssignmentId ? taById.get(a.teachingAssignmentId) : undefined;
      const row = ta && rows.get(keyOf(ta.classId, ta.subjectId));
      if (!row || !a || a.dueAt > now) continue;
      row.expected++;
      if (sa.lastSubmittedAt) row.submitted++;
      if (sa.isLate) row.late++;
    }
    return [...rows.values()]
      .map((r) => ({ ...r, rate: r.expected ? Math.round((r.submitted / r.expected) * 1000) / 1000 : null }))
      .sort((a, b) => a.grade - b.grade || a.className.localeCompare(b.className, 'vi') || a.subjectId - b.subjectId);
  }
}
