import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AssignmentItemInput, CreateAssignmentInput, TeacherAssignment, TeacherOverview, UploadRequest } from '@nopi/contracts';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import { defaultDueAt, type Grade, type GradingSchemeId } from '@nopi/domain';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { AppError, AuditLog, CLOCK, DB, OutboxService, type Actor, type Clock } from '../../../platform/index.js';
import { CurriculumService } from '../../curriculum/public-api.js';
import { MediaService, ownerOf } from '../../media/public-api.js';
import { EntitlementService } from '../../billing/public-api.js';
import { SpaceSettingsService, TeachingReader, type TeachingRef } from '../../org/public-api.js';
import { AssignmentPublished } from './events.js';

const { assignments, assignmentBatches, studentAssignments, assignmentItems } = schema;
type AssignmentRow = typeof assignments.$inferSelect;

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly teaching: TeachingReader,
    private readonly curriculum: CurriculumService,
    private readonly settings: SpaceSettingsService,
    private readonly media: MediaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditLog,
    private readonly entitlements: EntitlementService,
  ) {}

  /** Cô ghi âm đọc đề trước khi giao: xin URL tải lên trong phạm vi lớp–môn mình dạy. */
  async instructionsUpload(actor: Actor, teachingAssignmentId: string, req: UploadRequest) {
    const ta = await this.teaching.get(teachingAssignmentId);
    await this.teaching.requireCanAssign(actor, ta);
    if (req.kind !== 'audio' && req.kind !== 'photo' && req.kind !== 'document') {
      throw new AppError('validation_failed', 'Đề bài đính kèm ghi âm, ảnh hoặc PDF');
    }
    return this.media.createUpload(ownerOf(actor), ta.schoolId, req);
  }

  /**
   * Giao bài cho một hoặc nhiều lớp. Mỗi lớp một bài (chung một batch), mặc định hạn 20:00 ngày mai,
   * thang đánh giá mặc định theo môn/khối. publishAt ở tương lai = hẹn giờ giao (worker giao đúng giờ).
   */
  async create(actor: Actor, input: CreateAssignmentInput) {
    if (actor.kind !== 'user') throw new AppError('forbidden', 'Chỉ thầy cô hoặc bố mẹ được giao bài');
    const tas = await this.teaching.getMany([...new Set(input.teachingAssignmentIds)]);
    if (tas.length !== new Set(input.teachingAssignmentIds).size) throw new AppError('not_found', 'Không tìm thấy lớp–môn đã chọn');
    for (const ta of tas) await this.teaching.requireCanAssign(actor, ta);
    const schoolIds = [...new Set(tas.map((t) => t.schoolId))];
    if (schoolIds.length > 1) throw new AppError('validation_failed', 'Chỉ giao cùng lúc cho các lớp trong một trường');
    const schoolId = schoolIds[0]!;
    // Không gian gia đình: giao bài mới cần gói còn hạn (bài cũ, nhận xét vẫn giữ nguyên)
    if ((await this.teaching.schoolKinds([schoolId])).get(schoolId) === 'family') await this.entitlements.require(schoolId, 'family_space');

    const now = this.clock.now();
    const publishAt = input.publishAt ? new Date(input.publishAt) : now;
    const dueAt = input.dueAt ? new Date(input.dueAt) : defaultDueAt(publishAt);
    if (dueAt <= publishAt) throw new AppError('validation_failed', 'Hạn nộp phải sau thời điểm giao bài');
    const settings = await this.settings.get(schoolId);
    const wantsMedia = input.submissionKinds.some((k) => k === 'video' || k === 'audio');
    if (wantsMedia && input.maxMediaSeconds > settings.maxVideoSeconds) {
      throw new AppError('validation_failed', `Trường/gia đình đặt giới hạn video tối đa ${Math.round(settings.maxVideoSeconds / 60)} phút`);
    }
    if (input.instructionsAudioId) {
      const [m] = await this.media.getMany([input.instructionsAudioId]);
      if (!m || m.uploadedBy !== actor.userId || m.schoolId !== schoolId) throw new AppError('validation_failed', 'File đọc đề không hợp lệ');
    }
    if (input.originalMediaIds?.length) {
      const media = await this.media.getMany(input.originalMediaIds);
      const ok = media.length === new Set(input.originalMediaIds).size && media.every((m) => m.uploadedBy === actor.userId && m.schoolId === schoolId && m.kind === 'photo');
      if (!ok) throw new AppError('validation_failed', 'Ảnh gốc của đề không hợp lệ');
    }
    if (input.studentIds) {
      const inClass = new Set(await this.teaching.activeStudentIds(tas[0]!.classId));
      if (input.studentIds.some((id) => !inClass.has(id))) throw new AppError('validation_failed', 'Có học sinh không thuộc lớp này');
    }

    const created = await this.db.transaction(async (tx) => {
      const [batch] = await tx.insert(assignmentBatches).values({ schoolId, createdBy: actor.userId }).returning();
      const rows: AssignmentRow[] = [];
      for (const ta of tas) {
        const scheme: GradingSchemeId =
          input.gradingScheme ?? (await this.curriculum.defaultGradingScheme(ta.class.grade as Grade, ta.subjectId)) ?? 'completion_level';
        const [a] = await tx
          .insert(assignments)
          .values({
            schoolId,
            batchId: batch!.id,
            teachingAssignmentId: ta.id,
            kind: 'homework',
            source: input.source,
            title: input.title,
            instructions: input.instructions ?? null,
            instructionsAudioId: input.instructionsAudioId ?? null,
            submissionKinds: input.submissionKinds,
            maxPhotos: input.maxPhotos,
            maxMediaSeconds: input.maxMediaSeconds,
            gradingScheme: scheme,
            publishAt,
            dueAt,
            allowLate: input.allowLate,
            recipientStudentIds: input.studentIds ?? null,
            originalMediaIds: input.originalMediaIds ?? null,
            status: publishAt <= now ? 'published' : 'scheduled',
            createdBy: actor.userId,
          })
          .returning();
        if (input.items?.length) await this.insertItems(a!.id, input.items, tx);
        if (a!.status === 'published') await this.publishInTx(a!, ta, tx);
        rows.push(a!);
      }
      await this.audit.record({ actor, action: 'assignment.create', targetType: 'assignment_batch', targetId: batch!.id, schoolId, metadata: { count: rows.length } }, tx);
      return rows;
    });
    return Promise.all(created.map((a) => this.toTeacherDto(a)));
  }

  private async insertItems(assignmentId: string, items: AssignmentItemInput[], tx: DbOrTx) {
    await tx.insert(assignmentItems).values(
      items.map((it, i) => ({
        assignmentId,
        position: i + 1,
        itemType: it.itemType,
        promptText: it.promptText,
        promptLatex: it.promptLatex ?? null,
        options: it.options ?? null,
        aiConfidence: it.aiConfidence ?? null,
      })),
    );
  }

  /**
   * Học sinh lớp 6–9 lưu bài tự luyện từ ảnh tự quét: bài riêng của em, không gửi giáo viên,
   * em tự đánh dấu "Đã xong". Hạn mặc định 7 ngày (chỉ để sắp xếp).
   */
  async createPractice(actor: Actor, input: { schoolId: string; subjectId: number; grade: Grade; title: string; items: AssignmentItemInput[]; originalMediaIds: string[] }) {
    if (actor.kind !== 'student') throw new AppError('forbidden', 'Bài tự luyện dành cho học sinh');
    if (!(await this.curriculum.isSubjectInGrade(input.grade, input.subjectId))) throw new AppError('validation_failed', `Môn này không có trong chương trình lớp ${input.grade}`);
    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      const [a] = await tx
        .insert(assignments)
        .values({
          schoolId: input.schoolId,
          ownerStudentId: actor.studentId,
          practiceSubjectId: input.subjectId,
          kind: 'practice',
          source: 'scan',
          title: input.title,
          submissionKinds: ['photo'],
          gradingScheme: 'completion_level',
          originalMediaIds: input.originalMediaIds,
          publishAt: now,
          dueAt: new Date(now.getTime() + 7 * 24 * 3600_000),
          status: 'published',
        })
        .returning();
      await this.insertItems(a!.id, input.items, tx);
      const [sa] = await tx.insert(studentAssignments).values({ schoolId: input.schoolId, assignmentId: a!.id, studentId: actor.studentId }).returning();
      return { studentAssignmentId: sa!.id };
    });
  }

  /** Tạo bài cho từng em (đang học trong lớp tại thời điểm giao) + phát sự kiện. */
  private async publishInTx(a: AssignmentRow, ta: TeachingRef, tx: DbOrTx) {
    const active = await this.teaching.activeStudentIds(ta.classId);
    const recipients = a.recipientStudentIds ? active.filter((id) => a.recipientStudentIds!.includes(id)) : active;
    if (recipients.length) {
      await tx
        .insert(studentAssignments)
        .values(recipients.map((studentId) => ({ schoolId: a.schoolId, assignmentId: a.id, studentId })))
        .onConflictDoNothing();
    }
    await this.outbox.append(
      AssignmentPublished.create(a.id, { assignmentId: a.id, classId: ta.classId, subjectId: ta.subjectId, title: a.title, dueAt: a.dueAt.toISOString(), studentIds: recipients }, a.schoolId),
      tx,
    );
  }

  /** Worker gọi mỗi phút: giao các bài hẹn giờ đã tới giờ. Chạy chồng nhau vẫn an toàn. */
  async publishDue(): Promise<number> {
    const due = await this.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.status, 'scheduled'), lte(assignments.publishAt, this.clock.now())))
      .limit(200);
    let n = 0;
    for (const a of due) {
      const ta = await this.teaching.get(a.teachingAssignmentId!);
      const ok = await this.db.transaction(async (tx) => {
        const [locked] = await tx
          .update(assignments)
          .set({ status: 'published' })
          .where(and(eq(assignments.id, a.id), eq(assignments.status, 'scheduled')))
          .returning();
        if (!locked) return false;
        await this.publishInTx(locked, ta, tx);
        return true;
      });
      if (ok) n++;
    }
    if (n) this.logger.log(`Đã giao ${n} bài hẹn giờ`);
    return n;
  }

  // ---------------- Giáo viên xem ----------------
  async loadForTeacher(actor: Actor, assignmentId: string) {
    const [a] = await this.db.select().from(assignments).where(eq(assignments.id, assignmentId));
    if (!a || !a.teachingAssignmentId) throw new AppError('not_found', 'Không tìm thấy bài');
    const ta = await this.teaching.get(a.teachingAssignmentId);
    await this.teaching.requireCanGrade(actor, ta);
    return { assignment: a, ta };
  }

  private async stats(ids: string[]) {
    const out = new Map<string, TeacherAssignment['stats']>();
    if (ids.length === 0) return out;
    const rows = await this.db
      .select({
        assignmentId: studentAssignments.assignmentId,
        status: studentAssignments.status,
        late: sql<number>`count(*) filter (where ${studentAssignments.isLate})::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(studentAssignments)
      .where(inArray(studentAssignments.assignmentId, ids))
      .groupBy(studentAssignments.assignmentId, studentAssignments.status);
    for (const id of ids) out.set(id, { total: 0, notSubmitted: 0, submitted: 0, returned: 0, graded: 0, late: 0 });
    for (const r of rows) {
      const s = out.get(r.assignmentId)!;
      s.total += r.n;
      s.late += r.late;
      if (r.status === 'assigned') s.notSubmitted += r.n;
      else if (r.status === 'submitted') s.submitted += r.n;
      else if (r.status === 'returned') s.returned += r.n;
      else if (r.status === 'graded') s.graded += r.n;
    }
    return out;
  }

  private async toTeacherDtos(rows: AssignmentRow[]): Promise<TeacherAssignment[]> {
    const tas = new Map((await this.teaching.getMany([...new Set(rows.map((r) => r.teachingAssignmentId!))])).map((t) => [t.id, t]));
    const subjects = await this.curriculum.subjectsById([...tas.values()].map((t) => t.subjectId));
    const stats = await this.stats(rows.map((r) => r.id));
    const audio = await this.media.views(rows.map((r) => r.instructionsAudioId).filter((x): x is string => Boolean(x)));
    return rows.map((a) => {
      const ta = tas.get(a.teachingAssignmentId!)!;
      return {
        id: a.id,
        batchId: a.batchId,
        teachingAssignmentId: ta.id,
        title: a.title,
        instructions: a.instructions,
        instructionsAudio: a.instructionsAudioId ? (audio.get(a.instructionsAudioId) ?? null) : null,
        submissionKinds: a.submissionKinds as TeacherAssignment['submissionKinds'],
        maxPhotos: a.maxPhotos,
        maxMediaSeconds: a.maxMediaSeconds,
        gradingScheme: a.gradingScheme as GradingSchemeId,
        publishAt: a.publishAt.toISOString(),
        dueAt: a.dueAt.toISOString(),
        allowLate: a.allowLate,
        status: a.status as TeacherAssignment['status'],
        class: ta.class,
        subject: subjects.get(ta.subjectId)!,
        stats: stats.get(a.id)!,
      };
    });
  }

  private async toTeacherDto(a: AssignmentRow) {
    return (await this.toTeacherDtos([a]))[0]!;
  }

  async getForTeacher(actor: Actor, assignmentId: string) {
    const { assignment } = await this.loadForTeacher(actor, assignmentId);
    return this.toTeacherDto(assignment);
  }

  /** Bài của một lớp–môn, mới nhất trước. */
  async listForTeaching(actor: Actor, teachingAssignmentId: string) {
    const ta = await this.teaching.get(teachingAssignmentId);
    await this.teaching.requireCanGrade(actor, ta);
    const rows = await this.db
      .select()
      .from(assignments)
      .where(eq(assignments.teachingAssignmentId, teachingAssignmentId))
      .orderBy(desc(assignments.publishAt))
      .limit(100);
    return this.toTeacherDtos(rows);
  }

  /** Thông tin ngắn của các bài (tên, hạn, môn, lớp) — dùng cho nội dung thông báo. */
  async briefs(ids: string[]) {
    if (ids.length === 0) return new Map<string, { id: string; title: string; dueAt: Date; schoolId: string; subject: string; className: string }>();
    const rows = await this.db.select().from(assignments).where(inArray(assignments.id, ids));
    const tas = new Map((await this.teaching.getMany([...new Set(rows.map((r) => r.teachingAssignmentId!))])).map((t) => [t.id, t]));
    const subjects = await this.curriculum.subjectsById([...tas.values()].map((t) => t.subjectId));
    return new Map(
      rows.map((a) => {
        const ta = tas.get(a.teachingAssignmentId!)!;
        return [a.id, { id: a.id, title: a.title, dueAt: a.dueAt, schoolId: a.schoolId, subject: subjects.get(ta.subjectId)?.shortName ?? '', className: ta.class.name }];
      }),
    );
  }

  /**
   * Số liệu bản tổng hợp 20:00 của một giáo viên: các bài đang mở hoặc hết hạn từ đầu ngày,
   * "4A: 27/30 em đã nộp Toán".
   */
  async digestLines(teacherId: string, since: Date) {
    const tas = await this.teaching.currentFor(teacherId);
    if (tas.length === 0) return [];
    const subjects = await this.curriculum.subjectsById(tas.map((t) => t.subjectId));
    const rows = await this.db
      .select()
      .from(assignments)
      .where(and(inArray(assignments.teachingAssignmentId, tas.map((t) => t.id)), eq(assignments.status, 'published'), gte(assignments.dueAt, since)));
    const stats = await this.stats(rows.map((r) => r.id));
    return rows
      .map((a) => {
        const ta = tas.find((t) => t.id === a.teachingAssignmentId)!;
        const s = stats.get(a.id)!;
        return { assignmentId: a.id, cls: ta.class.name, subject: subjects.get(ta.subjectId)?.shortName ?? '', done: s.total - s.notSubmitted, total: s.total, dueAt: a.dueAt };
      })
      .filter((l) => l.total > 0)
      .sort((x, y) => x.cls.localeCompare(y.cls) || x.subject.localeCompare(y.subject, 'vi'));
  }

  /** Trang "Hôm nay" của giáo viên: cần chấm bao nhiêu bài, các lớp–môn đang dạy. */
  async overview(actor: Actor): Promise<TeacherOverview> {
    if (actor.kind !== 'user') throw new AppError('forbidden', 'Chức năng dành cho thầy cô');
    const tas = await this.teaching.currentFor(actor.userId);
    if (tas.length === 0) return { toGrade: 0, teaching: [] };
    const subjects = await this.curriculum.subjectsById(tas.map((t) => t.subjectId));
    const counts = await this.teaching.studentCounts(tas.map((t) => t.classId));
    const now = this.clock.now();
    const rows = await this.db
      .select({
        taId: assignments.teachingAssignmentId,
        open: sql<number>`count(distinct ${assignments.id}) filter (where ${assignments.dueAt} > ${now.toISOString()}::timestamptz)::int`,
        toGrade: sql<number>`count(${studentAssignments.id}) filter (where ${studentAssignments.status} = 'submitted')::int`,
      })
      .from(assignments)
      .leftJoin(studentAssignments, eq(studentAssignments.assignmentId, assignments.id))
      .where(and(inArray(assignments.teachingAssignmentId, tas.map((t) => t.id)), eq(assignments.status, 'published')))
      .groupBy(assignments.teachingAssignmentId);
    const byTa = new Map(rows.map((r) => [r.taId, r]));
    const teaching = tas
      .map((t) => ({
        teachingAssignmentId: t.id,
        class: t.class,
        subject: subjects.get(t.subjectId)!,
        studentCount: counts.get(t.classId) ?? 0,
        openAssignments: byTa.get(t.id)?.open ?? 0,
        toGrade: byTa.get(t.id)?.toGrade ?? 0,
      }))
      .sort((a, b) => a.class.grade - b.class.grade || a.class.name.localeCompare(b.class.name) || a.subject.shortName.localeCompare(b.subject.shortName, 'vi'));
    return { toGrade: teaching.reduce((n, t) => n + t.toGrade, 0), teaching };
  }
}
