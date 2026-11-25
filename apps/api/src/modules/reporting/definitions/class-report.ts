import { Inject, Injectable } from '@nestjs/common';
import type { CreateReportInput } from '@nopi/contracts';
import { AppError, CLOCK, type Clock, type UserActor } from '../../../platform/index.js';
import { StudentWorkService } from '../../assignments/public-api.js';
import { CurriculumService } from '../../curriculum/public-api.js';
import { StudentDirectory } from '../../identity/public-api.js';
import { AccessService, TeachingReader } from '../../org/public-api.js';
import { SubmissionsService } from '../../submissions/public-api.js';
import type { ExportJobRow, ReportDefinition } from '../application/report-definition.js';
import { slug, type ReportDoc, type ReportSheet } from '../application/report-doc.js';
import { byVnName, percent, resultCell, vnDate, vnDateTime, vnRange } from '../application/report-kit.js';

/**
 * Báo cáo lớp: mỗi môn một sheet, mỗi dòng một em, mỗi cột một bài (mức/điểm theo thang hoặc trạng thái nộp).
 * Quản trị / chủ nhiệm xem mọi môn; giáo viên bộ môn chỉ xem môn mình dạy.
 */
@Injectable()
export class ClassReport implements ReportDefinition {
  readonly id = 'class' as const;

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: AccessService,
    private readonly teaching: TeachingReader,
    private readonly work: StudentWorkService,
    private readonly submissions: SubmissionsService,
    private readonly students: StudentDirectory,
    private readonly curriculum: CurriculumService,
  ) {}

  async authorize(actor: UserActor, input: CreateReportInput) {
    const { cls } = await this.access.requireClassStaff(actor, input.classId!);
    const roles = actor.isSystemAdmin ? [] : await this.access.rolesIn(actor.userId, cls.schoolId);
    const seesAll = actor.isSystemAdmin || roles.includes('admin') || roles.includes('guardian_owner') || cls.homeroomTeacherId === actor.userId;
    let taIds: string[] | undefined;
    if (!seesAll) {
      taIds = (await this.teaching.forClass(cls.id)).filter((t) => t.teacherId === actor.userId).map((t) => t.id);
      if (taIds.length === 0) throw new AppError('forbidden', 'Bạn không dạy môn nào ở lớp này');
    }
    return { schoolId: cls.schoolId, classId: cls.id, subjectId: input.subjectId, params: taIds ? { taIds } : {} };
  }

  async build(job: ExportJobRow): Promise<ReportDoc> {
    const now = this.clock.now();
    const cls = await this.access.loadClass(job.classId!);
    const allowed = (job.params as { taIds?: string[] } | null)?.taIds;
    const tas = (await this.teaching.forClass(cls.id)).filter((t) => (!allowed || allowed.includes(t.id)) && (!job.subjectId || t.subjectId === job.subjectId));
    const { start, end } = vnRange(job.fromDate!, job.toDate!);
    const data = await this.work.reportData({ teachingAssignmentIds: tas.map((t) => t.id), from: start, to: end });
    const evals = await this.submissions.latestEvaluations(data.studentAssignments.map((s) => s.id));
    const active = new Set(await this.teaching.activeStudentIds(cls.id));
    const studentIds = new Set([...active, ...data.studentAssignments.map((s) => s.studentId)]);
    const names = await this.students.namesOf([...studentIds]);
    const roster = [...names.values()].sort(byVnName);
    const subjects = await this.curriculum.subjectsById([...new Set(tas.map((t) => t.subjectId))]);
    const saOf = new Map(data.studentAssignments.map((s) => [`${s.assignmentId}:${s.studentId}`, s]));
    const range = `Từ ${vnDate(job.fromDate!)} đến ${vnDate(job.toDate!)}`;

    const sheets: ReportSheet[] = [];
    for (const subjectId of [...new Set(tas.map((t) => t.subjectId))].sort((a, b) => a - b)) {
      const subjectName = subjects.get(subjectId)?.shortName ?? `Môn ${subjectId}`;
      const taIds = new Set(tas.filter((t) => t.subjectId === subjectId).map((t) => t.id));
      const list = data.assignments.filter((a) => a.teachingAssignmentId && taIds.has(a.teachingAssignmentId));
      const rows = roster
        .map((s) => {
          const sas = list.map((a) => saOf.get(`${a.id}:${s.id}`));
          // Em đã chuyển lớp chỉ hiện ở môn có bài của em
          if (!active.has(s.id) && !sas.some(Boolean)) return null;
          const given = sas.filter(Boolean).length;
          const handedIn = sas.filter((x) => x?.lastSubmittedAt).length;
          // Tỉ lệ chỉ tính bài đã đến hạn (bài chưa đến hạn không kéo tỉ lệ xuống)
          const due = list.filter((a, i) => sas[i] && a.dueAt <= now).length;
          const dueIn = list.filter((a, i) => sas[i]?.lastSubmittedAt && a.dueAt <= now).length;
          const late = sas.filter((x) => x?.isLate).length;
          return [s.fullName, ...list.map((a, i) => resultCell(sas[i], sas[i] && evals.get(sas[i]!.id), a.dueAt, now)), `${handedIn}/${given}`, late, percent(dueIn, due)];
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map((r, i) => [i + 1, ...r]);
      sheets.push({
        name: subjects.get(subjectId)?.shortName ?? subjectName,
        intro: [`Báo cáo lớp ${cls.name} — ${subjectName}`, range, list.length ? `${list.length} bài · ${roster.length} học sinh` : 'Không có bài nào đến hạn trong khoảng này'],
        columns: [
          { header: 'STT', width: 5 },
          { header: 'Họ và tên', width: 24 },
          ...list.map((a) => ({ header: `${a.title} (hạn ${vnDate(a.dueAt).slice(0, 5)})`, width: 14 })),
          { header: 'Đã nộp / được giao', width: 11 },
          { header: 'Nộp muộn', width: 8 },
          { header: 'Tỉ lệ nộp (bài đã đến hạn)', width: 11 },
        ],
        rows,
      });
    }
    if (sheets.length === 0) sheets.push({ name: 'Lớp', intro: [`Báo cáo lớp ${cls.name}`, range, 'Lớp chưa có môn nào được phân công'], columns: [{ header: 'Ghi chú', width: 40 }], rows: [] });
    sheets[0]!.intro!.push(`Xuất lúc ${vnDateTime(now)}`);
    const subjectPart = job.subjectId && sheets.length === 1 ? ` ${sheets[0]!.name}` : '';
    return { title: `Báo cáo lớp ${cls.name}${subjectPart}`, fileBase: slug(`bao-cao-lop-${cls.name}${subjectPart}-${job.fromDate}-${job.toDate}`), sheets };
  }
}
