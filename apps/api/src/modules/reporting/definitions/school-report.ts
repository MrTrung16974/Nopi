import { Inject, Injectable } from '@nestjs/common';
import type { CreateReportInput } from '@nopi/contracts';
import { CLOCK, type Clock, type UserActor } from '../../../platform/index.js';
import { AccessService, TeachingReader } from '../../org/public-api.js';
import type { ExportJobRow, ReportDefinition } from '../application/report-definition.js';
import { slug, type ReportDoc } from '../application/report-doc.js';
import { percent, vnDate, vnDateTime } from '../application/report-kit.js';
import { SchoolStatsService } from '../application/school-stats.service.js';

/** Báo cáo toàn trường: tỉ lệ nộp bài theo lớp × môn và theo lớp (chỉ quản trị trường). */
@Injectable()
export class SchoolReport implements ReportDefinition {
  readonly id = 'school' as const;

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: AccessService,
    private readonly teaching: TeachingReader,
    private readonly stats: SchoolStatsService,
  ) {}

  async authorize(actor: UserActor, input: CreateReportInput) {
    await this.access.requireSchoolRole(actor, input.schoolId!, ['admin']);
    await this.teaching.academicYear(input.schoolId!, input.academicYearId!);
    return { schoolId: input.schoolId!, params: { academicYearId: input.academicYearId } };
  }

  async build(job: ExportJobRow): Promise<ReportDoc> {
    const { academicYearId } = job.params as { academicYearId: string };
    const [schoolName, year, rows] = await Promise.all([
      this.teaching.schoolName(job.schoolId),
      this.teaching.academicYear(job.schoolId, academicYearId),
      this.stats.compute(job.schoolId, academicYearId, job.fromDate!, job.toDate!),
    ]);
    const intro = [`Tỉ lệ nộp bài — ${schoolName}`, `Năm học ${year.name} · từ ${vnDate(job.fromDate!)} đến ${vnDate(job.toDate!)}`, `Xuất lúc ${vnDateTime(this.clock.now())}`];
    const byClass = new Map<string, { name: string; assignments: number; expected: number; submitted: number; late: number }>();
    for (const r of rows) {
      const c = byClass.get(r.classId) ?? { name: r.className, assignments: 0, expected: 0, submitted: 0, late: 0 };
      c.assignments += r.assignments;
      c.expected += r.expected;
      c.submitted += r.submitted;
      c.late += r.late;
      byClass.set(r.classId, c);
    }
    return {
      title: `Tỉ lệ nộp bài ${schoolName}`,
      fileBase: slug(`ti-le-nop-bai-${year.name}-${job.fromDate}-${job.toDate}`),
      sheets: [
        {
          name: 'Theo lớp',
          intro,
          columns: [
            { header: 'Lớp', width: 10 },
            { header: 'Số bài', width: 9 },
            { header: 'Lượt đến hạn', width: 11 },
            { header: 'Đã nộp', width: 9 },
            { header: 'Nộp muộn', width: 9 },
            { header: 'Tỉ lệ nộp', width: 9 },
          ],
          rows: [...byClass.values()].map((c) => [c.name, c.assignments, c.expected, c.submitted, c.late, percent(c.submitted, c.expected)]),
        },
        {
          name: 'Theo lớp và môn',
          intro: [intro[0]!],
          columns: [
            { header: 'Lớp', width: 8 },
            { header: 'Môn', width: 16 },
            { header: 'Giáo viên', width: 22 },
            { header: 'Số bài', width: 8 },
            { header: 'Lượt đến hạn', width: 10 },
            { header: 'Đã nộp', width: 8 },
            { header: 'Nộp muộn', width: 8 },
            { header: 'Tỉ lệ nộp', width: 8 },
          ],
          rows: rows.map((r) => [r.className, r.subjectName, r.teacherName ?? '', r.assignments, r.expected, r.submitted, r.late, percent(r.submitted, r.expected)]),
        },
      ],
    };
  }
}
