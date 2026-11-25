import { Inject, Injectable } from '@nestjs/common';
import type { CreateReportInput } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { AppError, CLOCK, type Clock, type UserActor } from '../../../platform/index.js';
import { StudentWorkService } from '../../assignments/public-api.js';
import { CurriculumService } from '../../curriculum/public-api.js';
import { GuardianService, StudentDirectory } from '../../identity/public-api.js';
import { AccessService, TeachingReader } from '../../org/public-api.js';
import { SubmissionsService } from '../../submissions/public-api.js';
import type { ExportJobRow, ReportDefinition } from '../application/report-definition.js';
import { slug, type ReportDoc } from '../application/report-doc.js';
import { percent, resultCell, statusLabel, vnDate, vnDateTime, vnRange } from '../application/report-kit.js';

/**
 * Báo cáo một học sinh (họp phụ huynh): từng bài theo môn + nhận xét, và tổng hợp theo môn.
 * Phụ huynh: mọi môn (kể cả "Bố mẹ giao"). Thầy cô: chỉ các lớp–môn mình phụ trách (chủ nhiệm/quản trị: cả lớp).
 */
@Injectable()
export class StudentReport implements ReportDefinition {
  readonly id = 'student' as const;

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: AccessService,
    private readonly guardians: GuardianService,
    private readonly teaching: TeachingReader,
    private readonly work: StudentWorkService,
    private readonly submissions: SubmissionsService,
    private readonly students: StudentDirectory,
    private readonly curriculum: CurriculumService,
  ) {}

  async authorize(actor: UserActor, input: CreateReportInput) {
    const studentId = input.studentId!;
    await this.access.requireStudentManager(actor, studentId);
    const classes = await this.access.currentClassesOf(studentId);
    const kinds = await this.teaching.schoolKinds(classes.map((c) => c.schoolId));
    const home = classes.find((c) => kinds.get(c.schoolId) === 'school') ?? classes[0];
    if (!home) throw new AppError('validation_failed', 'Em chưa vào lớp nào nên chưa có gì để báo cáo');
    if (actor.isSystemAdmin || (await this.guardians.isGuardian(actor.userId, studentId))) {
      return { schoolId: home.schoolId, studentId, subjectId: input.subjectId, params: { audience: 'guardian' } };
    }
    // Thầy cô: gom các lớp–môn được xem
    const taIds: string[] = [];
    for (const cls of classes) {
      const roles = await this.access.rolesIn(actor.userId, cls.schoolId);
      const tas = await this.teaching.forClass(cls.id);
      const all = roles.includes('admin') || cls.homeroomTeacherId === actor.userId;
      taIds.push(...tas.filter((t) => all || t.teacherId === actor.userId).map((t) => t.id));
    }
    return { schoolId: home.schoolId, studentId, subjectId: input.subjectId, params: { audience: 'teacher', taIds } };
  }

  async build(job: ExportJobRow): Promise<ReportDoc> {
    const now = this.clock.now();
    const student = await this.students.get(job.studentId!);
    const allowed = (job.params as { taIds?: string[] } | null)?.taIds;
    const { start, end } = vnRange(job.fromDate!, job.toDate!);
    const data = await this.work.reportData({ studentId: student.id, from: start, to: end });
    const tas = new Map((await this.teaching.getMany([...new Set(data.assignments.map((a) => a.teachingAssignmentId).filter((x): x is string => Boolean(x)))])).map((t) => [t.id, t]));
    const list = data.assignments
      .map((a) => ({ a, ta: a.teachingAssignmentId ? tas.get(a.teachingAssignmentId) : undefined }))
      .filter(({ ta }) => ta && (!allowed || allowed.includes(ta.id)) && (!job.subjectId || ta.subjectId === job.subjectId));
    const [subjects, kinds] = await Promise.all([
      this.curriculum.subjectsById([...new Set(list.map(({ ta }) => ta!.subjectId))]),
      this.teaching.schoolKinds([...new Set(list.map(({ a }) => a.schoolId))]),
    ]);
    const saByAssignment = new Map(data.studentAssignments.map((s) => [s.assignmentId, s]));
    const evals = await this.submissions.latestEvaluations(data.studentAssignments.map((s) => s.id));
    const subjectLabel = (ta: { subjectId: number; schoolId: string }) =>
      `${subjects.get(ta.subjectId)?.shortName ?? `Môn ${ta.subjectId}`}${kinds.get(ta.schoolId) === 'family' ? ` (${vi.parentAssignedLabel})` : ''}`;

    const detail = list
      .sort((x, y) => subjectLabel(x.ta!).localeCompare(subjectLabel(y.ta!), 'vi') || x.a.dueAt.getTime() - y.a.dueAt.getTime())
      .map(({ a, ta }, i) => {
        const sa = saByAssignment.get(a.id)!;
        const e = evals.get(sa.id);
        const result = resultCell(sa, e, a.dueAt, now);
        return [
          i + 1,
          subjectLabel(ta!),
          a.title,
          vnDate(a.dueAt),
          sa.lastSubmittedAt ? `${vnDateTime(sa.lastSubmittedAt)}${sa.isLate ? ' (muộn)' : ''}` : '',
          statusLabel(sa, a.dueAt, now),
          sa.status === 'graded' ? result : '',
          e?.comment ?? '',
        ];
      });

    const bySubject = new Map<string, { total: number; handedIn: number; due: number; dueIn: number; late: number }>();
    for (const { a, ta } of list) {
      const sa = saByAssignment.get(a.id)!;
      const k = subjectLabel(ta!);
      const s = bySubject.get(k) ?? { total: 0, handedIn: 0, due: 0, dueIn: 0, late: 0 };
      s.total++;
      if (sa.lastSubmittedAt) s.handedIn++;
      if (a.dueAt <= now) {
        s.due++;
        if (sa.lastSubmittedAt) s.dueIn++;
      }
      if (sa.isLate) s.late++;
      bySubject.set(k, s);
    }
    const className = (await this.access.currentClassesOf(student.id)).find((c) => c.schoolId === job.schoolId)?.name;
    const intro = [
      `Báo cáo học tập — ${student.fullName}${className ? ` (lớp ${className})` : ''}`,
      `Từ ${vnDate(job.fromDate!)} đến ${vnDate(job.toDate!)}`,
      `Xuất lúc ${vnDateTime(now)}`,
    ];
    return {
      title: `Báo cáo học tập ${student.fullName}`,
      fileBase: slug(`bao-cao-${student.fullName}-${job.fromDate}-${job.toDate}`),
      sheets: [
        {
          name: 'Tổng hợp',
          intro,
          columns: [
            { header: 'Môn', width: 22 },
            { header: 'Đã nộp / được giao', width: 12 },
            { header: 'Nộp muộn', width: 9 },
            { header: 'Tỉ lệ nộp (bài đã đến hạn)', width: 12 },
          ],
          rows: [...bySubject.entries()].map(([k, s]) => [k, `${s.handedIn}/${s.total}`, s.late, percent(s.dueIn, s.due)]),
        },
        {
          name: 'Chi tiết từng bài',
          intro: [intro[0]!],
          columns: [
            { header: 'STT', width: 5 },
            { header: 'Môn', width: 14 },
            { header: 'Bài', width: 26 },
            { header: 'Hạn nộp', width: 11 },
            { header: 'Nộp lúc', width: 16 },
            { header: 'Trạng thái', width: 11 },
            { header: 'Đánh giá', width: 13 },
            { header: 'Nhận xét của thầy cô', width: 40 },
          ],
          rows: detail,
        },
      ],
    };
  }
}
