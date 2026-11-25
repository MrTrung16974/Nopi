import { Inject, Injectable } from '@nestjs/common';
import type { AttemptDto, EvaluateInput, GradingRow, MediaView, StudentAssignmentDetail, UploadRequest } from '@nopi/contracts';
import { schema, type Database } from '@nopi/db';
import {
  checkSubmission,
  displayStatus,
  gradingSchemes,
  parseEvaluation,
  stageOfGrade,
  validateSubmissionMedia,
  type GradingSchemeId,
  type StickerId,
  type StudentAssignmentStatus,
  type SubmissionMediaKind,
} from '@nopi/domain';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { AppError, AuditLog, CLOCK, DB, OutboxService, RateLimiter, type Actor, type Clock } from '../../../platform/index.js';
import { StudentWorkService } from '../../assignments/public-api.js';
import { StudentDirectory } from '../../identity/public-api.js';
import { MediaService, ownerOf } from '../../media/public-api.js';
import { TeachingReader } from '../../org/public-api.js';
import { EvaluationSaved, SubmissionCreated } from './events.js';

const { submissions, submissionMedia, evaluations, studentAssignments } = schema;
type EvaluationRow = typeof evaluations.$inferSelect;

const STATUS_ORDER: Record<string, number> = { submitted: 0, returned: 1, overdue: 2, assigned: 3, graded: 4 };

@Injectable()
export class SubmissionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly work: StudentWorkService,
    private readonly media: MediaService,
    private readonly teaching: TeachingReader,
    private readonly students: StudentDirectory,
    private readonly outbox: OutboxService,
    private readonly audit: AuditLog,
    private readonly limiter: RateLimiter,
  ) {}

  // ================= Học sinh / phụ huynh =================

  /** Xin URL tải ảnh/video/ghi âm cho bài của em (học sinh hoặc phụ huynh nộp hộ). */
  async upload(actor: Actor, studentAssignmentId: string, req: UploadRequest) {
    const { sa, assignment } = await this.work.getContext(studentAssignmentId);
    await this.work.requireStudentOrGuardian(actor, sa.studentId);
    if (assignment.kind === 'practice') throw new AppError('validation_failed', 'Bài tự luyện không cần nộp — làm xong em bấm "Đã xong" nhé');
    if (!assignment.submissionKinds.includes(req.kind)) throw new AppError('validation_failed', 'Bài này cô không yêu cầu nộp kiểu này');
    if ((req.kind === 'video' || req.kind === 'audio') && req.durationS !== undefined && req.durationS > assignment.maxMediaSeconds + 2) {
      throw new AppError('validation_failed', `Bài dài quá, cô chỉ nhận tối đa ${Math.round((assignment.maxMediaSeconds / 60) * 10) / 10} phút`);
    }
    return this.media.createUpload(ownerOf(actor), assignment.schoolId, req);
  }

  /** "Gửi cho cô": tạo lần nộp mới, chuyển trạng thái, phát sự kiện — tất cả trong một transaction. */
  async submit(actor: Actor, studentAssignmentId: string, input: { mediaIds: string[]; note?: string }): Promise<StudentAssignmentDetail> {
    const { sa: saBefore, assignment } = await this.work.getContext(studentAssignmentId);
    const role = await this.work.requireStudentOrGuardian(actor, saBefore.studentId);
    if (assignment.kind === 'practice') throw new AppError('validation_failed', 'Bài tự luyện không cần nộp — làm xong em bấm "Đã xong" nhé');

    const ids = [...new Set(input.mediaIds)];
    const rows = await this.media.getMany(ids);
    const owner = ownerOf(actor);
    for (const id of ids) {
      const m = rows.find((r) => r.id === id);
      const mine = m && (owner.kind === 'user' ? m.uploadedBy === owner.userId : m.uploadedByStudentId === owner.studentId);
      if (!m || !mine || m.schoolId !== assignment.schoolId) throw new AppError('validation_failed', 'Có file không hợp lệ, con chụp/ghi lại nhé');
      if (m.status === 'uploading') throw new AppError('validation_failed', 'Bài chưa tải lên xong, đợi một chút nhé');
      if (m.status === 'failed' || m.status === 'deleted') throw new AppError('validation_failed', 'Có file bị lỗi, con chụp/ghi lại nhé');
    }
    const used = await this.db
      .select({ mediaId: submissionMedia.mediaId, submissionId: submissionMedia.submissionId, saId: submissions.studentAssignmentId })
      .from(submissionMedia)
      .innerJoin(submissions, eq(submissions.id, submissionMedia.submissionId))
      .where(inArray(submissionMedia.mediaId, ids));
    if (used.length) {
      // App gửi lại vì mất phản hồi lần trước (mạng yếu): đúng bộ file của một lần nộp đã có → trả kết quả cũ
      const sameSubmission = new Set(used.map((u) => u.submissionId)).size === 1 && used[0]!.saId === studentAssignmentId;
      if (sameSubmission && used.length === ids.length) {
        const [{ n } = { n: 0 }] = await this.db
          .select({ n: sql<number>`count(*)::int` })
          .from(submissionMedia)
          .where(eq(submissionMedia.submissionId, used[0]!.submissionId));
        const [latest] = await this.db
          .select({ id: submissions.id })
          .from(submissions)
          .where(eq(submissions.studentAssignmentId, studentAssignmentId))
          .orderBy(desc(submissions.attemptNo))
          .limit(1);
        const [evaluated] = await this.db.select({ id: evaluations.id }).from(evaluations).where(eq(evaluations.submissionId, used[0]!.submissionId));
        // Chỉ coi là gửi lặp khi đó là lần nộp mới nhất và cô chưa chấm
        if (n === ids.length && latest?.id === used[0]!.submissionId && !evaluated) return this.detail(actor, studentAssignmentId);
      }
      throw new AppError('validation_failed', 'Có file đã nộp ở lần trước, con chụp/ghi lại nhé');
    }

    const rules = validateSubmissionMedia(
      { allowedKinds: assignment.submissionKinds as SubmissionMediaKind[], maxPhotos: assignment.maxPhotos, maxMediaSeconds: assignment.maxMediaSeconds },
      ids.map((id) => {
        const m = rows.find((r) => r.id === id)!;
        return { kind: m.kind as SubmissionMediaKind, durationSeconds: m.durationS ?? undefined };
      }),
    );
    if (!rules.ok) throw new AppError('validation_failed', rules.message);

    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      const sa = await this.work.lock(studentAssignmentId, tx);
      const check = checkSubmission(sa.status as StudentAssignmentStatus, { now, dueAt: assignment.dueAt, allowLate: assignment.allowLate });
      if (!check.ok) {
        throw new AppError(check.error === 'past_due_not_allowed' ? 'validation_failed' : 'conflict', check.error === 'invalid_transition' ? 'Bài này cô đã chấm rồi, không nộp lại được' : check.message);
      }
      const [{ max } = { max: 0 }] = await tx
        .select({ max: sql<number>`coalesce(max(${submissions.attemptNo}), 0)::int` })
        .from(submissions)
        .where(eq(submissions.studentAssignmentId, sa.id));
      const [sub] = await tx
        .insert(submissions)
        .values({
          schoolId: assignment.schoolId,
          studentAssignmentId: sa.id,
          attemptNo: max + 1,
          submittedByGuardian: role === 'guardian' && actor.kind === 'user' ? actor.userId : null,
          note: input.note ?? null,
          isLate: check.value.isLate,
          submittedAt: now,
        })
        .returning();
      await tx.insert(submissionMedia).values(ids.map((mediaId, position) => ({ submissionId: sub!.id, mediaId, position })));
      await this.work.transition(sa, { type: 'submit' }, tx, { lastSubmittedAt: now, isLate: check.value.isLate });
      await this.outbox.append(
        SubmissionCreated.create(
          sub!.id,
          { submissionId: sub!.id, studentAssignmentId: sa.id, assignmentId: assignment.id, studentId: sa.studentId, attemptNo: sub!.attemptNo, isLate: check.value.isLate, byGuardian: role === 'guardian' },
          assignment.schoolId,
        ),
        tx,
      );
    });
    return this.detail(actor, studentAssignmentId);
  }

  private async attempts(saIds: string[], opts: { latestOnly?: boolean } = {}) {
    if (saIds.length === 0) return { bySa: new Map<string, (AttemptDto & { evaluation: EvaluationRow | null })[]>(), views: new Map<string, MediaView>() };
    const subs = await this.db
      .select()
      .from(submissions)
      .where(inArray(submissions.studentAssignmentId, saIds))
      .orderBy(desc(submissions.attemptNo));
    const picked = opts.latestOnly ? subs.filter((s, i) => subs.findIndex((x) => x.studentAssignmentId === s.studentAssignmentId) === i) : subs;
    const subIds = picked.map((s) => s.id);
    const links = subIds.length
      ? await this.db.select().from(submissionMedia).where(inArray(submissionMedia.submissionId, subIds)).orderBy(asc(submissionMedia.position))
      : [];
    const evals = subIds.length ? await this.db.select().from(evaluations).where(inArray(evaluations.submissionId, subIds)) : [];
    const views = await this.media.views([...links.map((l) => l.mediaId), ...evals.map((e) => e.commentAudioId).filter((x): x is string => Boolean(x))]);
    const bySa = new Map<string, (AttemptDto & { evaluation: EvaluationRow | null })[]>();
    for (const s of picked) {
      const list = bySa.get(s.studentAssignmentId) ?? [];
      list.push({
        id: s.id,
        attemptNo: s.attemptNo,
        submittedAt: s.submittedAt.toISOString(),
        isLate: s.isLate,
        byGuardian: s.submittedByGuardian !== null,
        note: s.note,
        media: links.filter((l) => l.submissionId === s.id).map((l) => views.get(l.mediaId)).filter((v): v is MediaView => Boolean(v)),
        evaluation: evals.find((e) => e.submissionId === s.id) ?? null,
      });
      bySa.set(s.studentAssignmentId, list);
    }
    return { bySa, views };
  }

  private evalInput(e: EvaluationRow) {
    return { level: e.level ?? undefined, score: e.score ?? undefined, comment: e.comment ?? undefined, sticker: (e.sticker as StickerId | null) ?? undefined };
  }

  /** Chi tiết bài cho học sinh/phụ huynh: đề, các lần nộp, nhận xét của cô (đúng quy định hiển thị theo cấp học). */
  async detail(actor: Actor, studentAssignmentId: string): Promise<StudentAssignmentDetail> {
    const { sa, assignment, ta } = await this.work.getContext(studentAssignmentId);
    const role = await this.work.requireStudentOrGuardian(actor, sa.studentId);
    if (assignment.status !== 'published' && assignment.status !== 'closed') throw new AppError('not_found', 'Không tìm thấy bài');
    const [item] = await this.work.toItems([{ sa, a: assignment }], role);
    const { bySa, views } = await this.attempts([sa.id]);
    const list = bySa.get(sa.id) ?? [];
    const evaluated = list.find((a) => a.evaluation);
    const extraMedia = await this.media.views([...(assignment.instructionsAudioId ? [assignment.instructionsAudioId] : []), ...(assignment.originalMediaIds ?? [])]);
    const audio = assignment.instructionsAudioId ? (extraMedia.get(assignment.instructionsAudioId) ?? null) : null;
    const items = (await this.work.itemsOf(assignment.id)).map((it) => ({
      position: it.position,
      itemType: it.itemType as 'open' | 'multiple_choice' | 'fill_blank' | 'read_aloud',
      promptText: it.promptText ?? '',
      promptLatex: it.promptLatex,
      options: (it.options as string[] | null) ?? null,
      aiConfidence: it.aiConfidence,
    }));
    let feedback: StudentAssignmentDetail['feedback'] = null;
    if (evaluated?.evaluation) {
      const e = evaluated.evaluation;
      const view = e.requiresRedo
        ? { label: null, comment: e.comment ?? undefined, sticker: (e.sticker as StickerId | null) ?? undefined }
        : gradingSchemes.get(e.scheme).studentView(this.evalInput(e), ta ? stageOfGrade(ta.class.grade) : 'lower_secondary');
      feedback = {
        label: view.label,
        comment: view.comment ?? null,
        commentAudio: e.commentAudioId ? (views.get(e.commentAudioId) ?? null) : null,
        sticker: (view.sticker as StickerId | undefined) ?? null,
        requiresRedo: e.requiresRedo,
        at: e.updatedAt.toISOString(),
      };
    }
    const status = sa.status as StudentAssignmentStatus;
    const canSubmit =
      assignment.kind !== 'practice' && status !== 'graded' && (status === 'returned' || assignment.allowLate || this.clock.now() <= assignment.dueAt);
    return {
      ...item!,
      instructions: assignment.instructions,
      instructionsAudio: audio,
      items,
      originals: (assignment.originalMediaIds ?? []).map((id) => extraMedia.get(id)).filter((v): v is MediaView => Boolean(v)),
      submissionKinds: assignment.submissionKinds as StudentAssignmentDetail['submissionKinds'],
      maxPhotos: assignment.maxPhotos,
      maxMediaSeconds: assignment.maxMediaSeconds,
      canSubmit,
      attempts: list.map(({ evaluation: _e, ...a }) => a),
      feedback,
    };
  }

  /** Nhận xét mới nhất của từng bài (cho báo cáo): mức/điểm theo đúng thang, nhận xét, thời điểm. */
  async latestEvaluations(studentAssignmentIds: string[]) {
    const out = new Map<string, { scheme: string; level: string | null; score: number | null; comment: string | null; requiresRedo: boolean; at: Date }>();
    if (studentAssignmentIds.length === 0) return out;
    const rows = await this.db
      .select({ saId: submissions.studentAssignmentId, e: evaluations })
      .from(evaluations)
      .innerJoin(submissions, eq(submissions.id, evaluations.submissionId))
      .where(inArray(submissions.studentAssignmentId, studentAssignmentIds))
      .orderBy(desc(evaluations.updatedAt));
    for (const r of rows) if (!out.has(r.saId)) out.set(r.saId, { scheme: r.e.scheme, level: r.e.level, score: r.e.score, comment: r.e.comment, requiresRedo: r.e.requiresRedo, at: r.e.updatedAt });
    return out;
  }

  /** Ảnh/video bài nộp sẽ bị xoá đúng ngày này (để báo trước phụ huynh). */
  async expiringOn(date: string) {
    return this.db
      .select({ studentId: studentAssignments.studentId, schoolId: studentAssignments.schoolId, count: sql<number>`count(distinct ${schema.mediaFiles.id})::int` })
      .from(schema.mediaFiles)
      .innerJoin(submissionMedia, eq(submissionMedia.mediaId, schema.mediaFiles.id))
      .innerJoin(submissions, eq(submissions.id, submissionMedia.submissionId))
      .innerJoin(studentAssignments, eq(studentAssignments.id, submissions.studentAssignmentId))
      .where(and(eq(schema.mediaFiles.deleteAfter, date), eq(schema.mediaFiles.status, 'ready')))
      .groupBy(studentAssignments.studentId, studentAssignments.schoolId);
  }

  // ================= Giáo viên =================

  private toTeacherEval(e: EvaluationRow, views: Map<string, MediaView>) {
    return {
      id: e.id,
      scheme: e.scheme as GradingSchemeId,
      level: e.level,
      score: e.score,
      comment: e.comment,
      commentAudio: e.commentAudioId ? (views.get(e.commentAudioId) ?? null) : null,
      sticker: (e.sticker as StickerId | null) ?? null,
      requiresRedo: e.requiresRedo,
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  /** Lưới chấm: mỗi em một thẻ (bài nộp mới nhất + nhận xét), "Chờ chấm" lên đầu. */
  async gradingList(actor: Actor, assignmentId: string): Promise<GradingRow[]> {
    const [a] = await this.db.select().from(schema.assignments).where(eq(schema.assignments.id, assignmentId));
    if (!a?.teachingAssignmentId) throw new AppError('not_found', 'Không tìm thấy bài');
    await this.teaching.requireCanGrade(actor, await this.teaching.get(a.teachingAssignmentId));
    // Nhật ký "ai đã xem bài nộp": mỗi người × mỗi bài ghi tối đa 1 lần/giờ (mở lại lưới chấm không làm đầy nhật ký)
    const viewer = actor.kind === 'user' ? actor.userId : actor.studentId;
    if ((await this.limiter.hit(`audit:sub-view:${viewer}:${assignmentId}`, 1, 3600)).allowed) {
      await this.audit.record({ actor, action: 'submission.view', targetType: 'assignment', targetId: assignmentId, schoolId: a.schoolId, metadata: { title: a.title } });
    }
    const sas = await this.db.select().from(studentAssignments).where(eq(studentAssignments.assignmentId, assignmentId));
    const names = await this.students.namesOf(sas.map((s) => s.studentId));
    const { bySa, views } = await this.attempts(sas.map((s) => s.id), { latestOnly: true });
    const now = this.clock.now();
    return sas
      .map((sa) => {
        const latest = bySa.get(sa.id)?.[0] ?? null;
        const { evaluation, ...attempt } = latest ?? { evaluation: null };
        return {
          studentAssignmentId: sa.id,
          student: names.get(sa.studentId)!,
          status: displayStatus(sa.status as StudentAssignmentStatus, a.dueAt, now, 'teacher'),
          isLate: sa.isLate,
          latest: latest ? (attempt as AttemptDto) : null,
          evaluation: evaluation ? this.toTeacherEval(evaluation, views) : null,
        };
      })
      .sort((x, y) => STATUS_ORDER[x.status]! - STATUS_ORDER[y.status]! || lastName(x.student.fullName).localeCompare(lastName(y.student.fullName), 'vi'));
  }

  private async loadSubmissionForTeacher(actor: Actor, submissionId: string) {
    const [sub] = await this.db.select().from(submissions).where(eq(submissions.id, submissionId));
    if (!sub) throw new AppError('not_found', 'Không tìm thấy bài nộp');
    const ctx = await this.work.getContext(sub.studentAssignmentId);
    if (!ctx.ta) throw new AppError('forbidden', 'Bài tự luyện không có giáo viên chấm');
    await this.teaching.requireCanGrade(actor, ctx.ta);
    return { sub, ...ctx };
  }

  /** Cô ghi âm nhận xét: xin URL tải lên. */
  async commentUpload(actor: Actor, submissionId: string, req: UploadRequest) {
    const { assignment } = await this.loadSubmissionForTeacher(actor, submissionId);
    if (req.kind !== 'audio') throw new AppError('validation_failed', 'Nhận xét bằng giọng nói là file ghi âm');
    return this.media.createUpload(ownerOf(actor), assignment.schoolId, req);
  }

  /**
   * Chấm / nhận xét / yêu cầu làm lại. Kiểm tra theo thang của bài (registry thang đánh giá).
   * Sửa lại nhận xét đã chấm thì cập nhật và ghi nhật ký.
   */
  async evaluate(actor: Actor, submissionId: string, input: EvaluateInput): Promise<GradingRow> {
    if (actor.kind !== 'user') throw new AppError('forbidden', 'Chức năng dành cho thầy cô');
    const { sub, sa: saBefore, assignment } = await this.loadSubmissionForTeacher(actor, submissionId);
    const [latest] = await this.db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.studentAssignmentId, saBefore.id))
      .orderBy(desc(submissions.attemptNo))
      .limit(1);
    if (latest?.id !== sub.id) throw new AppError('conflict', 'Em đã nộp lại bài mới, cô chấm bài mới nhất nhé');

    const scheme = assignment.gradingScheme as GradingSchemeId;
    const { requiresRedo, commentAudioId, ...rest } = input;
    if (!requiresRedo && scheme !== 'score_10' && input.level) {
      const allowed = scheme === 'pass_fail' ? ['DAT', 'CHUA_DAT'] : ['HOAN_THANH_TOT', 'HOAN_THANH', 'CHUA_HOAN_THANH'];
      if (!allowed.includes(input.level)) throw new AppError('validation_failed', 'Mức đánh giá không đúng thang của bài');
    }
    const parsed = parseEvaluation(scheme, rest, requiresRedo);
    if (!parsed.success) {
      const need = scheme === 'score_10' ? 'Nhập điểm (0–10, bước 0,25)' : 'Chọn mức đánh giá';
      throw new AppError('validation_failed', requiresRedo ? 'Thông tin chưa hợp lệ' : need, parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
    if (commentAudioId) {
      const [m] = await this.media.getMany([commentAudioId]);
      if (!m || m.uploadedBy !== actor.userId || m.kind !== 'audio') throw new AppError('validation_failed', 'File nhận xét không hợp lệ');
    }
    const v = parsed.data as { level?: string; score?: number; comment?: string; sticker?: string };
    const values = {
      scheme,
      level: requiresRedo || scheme === 'score_10' ? null : (v.level ?? null),
      score: requiresRedo || scheme !== 'score_10' ? null : (v.score ?? null),
      comment: v.comment ?? null,
      commentAudioId: commentAudioId ?? null,
      sticker: v.sticker ?? null,
      requiresRedo,
    };

    await this.db.transaction(async (tx) => {
      const sa = await this.work.lock(saBefore.id, tx);
      const [existing] = await tx.select().from(evaluations).where(eq(evaluations.submissionId, sub.id)).for('update');
      let evaluationId: string;
      if (existing) {
        if (existing.requiresRedo !== requiresRedo) {
          throw new AppError('conflict', requiresRedo ? 'Bài đã chấm, không chuyển sang làm lại được' : 'Em đang làm lại bài, đợi em nộp bài mới nhé');
        }
        await tx.update(evaluations).set({ ...values, teacherId: actor.userId, updatedAt: this.clock.now() }).where(eq(evaluations.id, existing.id));
        evaluationId = existing.id;
        await this.audit.record({ actor, action: 'evaluation.update', targetType: 'evaluation', targetId: existing.id, studentId: sa.studentId, schoolId: assignment.schoolId, metadata: { before: { level: existing.level, score: existing.score } } }, tx);
      } else {
        const [e] = await tx.insert(evaluations).values({ ...values, schoolId: assignment.schoolId, submissionId: sub.id, teacherId: actor.userId }).returning();
        evaluationId = e!.id;
        await this.work.transition(sa, { type: requiresRedo ? 'request_redo' : 'grade' }, tx);
      }
      await this.outbox.append(
        EvaluationSaved.create(
          evaluationId,
          { evaluationId, submissionId: sub.id, studentAssignmentId: sa.id, assignmentId: assignment.id, studentId: sa.studentId, requiresRedo, isUpdate: Boolean(existing) },
          assignment.schoolId,
        ),
        tx,
      );
    });
    const rows = await this.gradingList(actor, assignment.id);
    return rows.find((r) => r.studentAssignmentId === saBefore.id)!;
  }
}

const lastName = (full: string) => full.trim().split(/\s+/).pop() ?? full;

