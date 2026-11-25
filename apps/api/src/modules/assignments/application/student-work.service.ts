import { Inject, Injectable } from '@nestjs/common';
import type { StudentAssignmentItem } from '@nopi/contracts';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import { displayStatus, nextStatus, type Audience, type StatusEvent, type StudentAssignmentStatus } from '@nopi/domain';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { AppError, CLOCK, DB, type Actor, type Clock } from '../../../platform/index.js';
import { CurriculumService } from '../../curriculum/public-api.js';
import { GuardianService } from '../../identity/public-api.js';
import { TeachingReader } from '../../org/public-api.js';

const { assignments, studentAssignments, assignmentItems } = schema;
export type StudentAssignmentRow = typeof studentAssignments.$inferSelect;
export type AssignmentRow = typeof assignments.$inferSelect;

/**
 * Bài của từng em (student_assignments): danh sách cho học sinh/phụ huynh, kiểm tra quyền,
 * và chuyển trạng thái (chỉ đi qua máy trạng thái trong @nopi/domain).
 * Mô-đun submissions dùng service này để nộp/chấm — không sửa bảng trực tiếp.
 */
@Injectable()
export class StudentWorkService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly teaching: TeachingReader,
    private readonly curriculum: CurriculumService,
    private readonly guardians: GuardianService,
  ) {}

  /** Học sinh đó, hoặc phụ huynh của em. Trả về vai trò để hiển thị đúng (học sinh không thấy "quá hạn"). */
  async requireStudentOrGuardian(actor: Actor, studentId: string): Promise<'student' | 'guardian'> {
    if (actor.kind === 'student' && actor.studentId === studentId) return 'student';
    if (actor.kind === 'user' && (await this.guardians.isGuardian(actor.userId, studentId))) return 'guardian';
    throw new AppError('forbidden', 'Bạn không xem được bài của học sinh này');
  }

  async getContext(studentAssignmentId: string, tx: DbOrTx = this.db) {
    const [row] = await tx
      .select({ sa: studentAssignments, a: assignments })
      .from(studentAssignments)
      .innerJoin(assignments, eq(assignments.id, studentAssignments.assignmentId))
      .where(eq(studentAssignments.id, studentAssignmentId));
    if (!row) throw new AppError('not_found', 'Không tìm thấy bài');
    // Bài tự luyện (lớp 6–9 tự quét) không có phân công giáo viên
    const ta = row.a.teachingAssignmentId ? await this.teaching.get(row.a.teachingAssignmentId) : null;
    return { sa: row.sa, assignment: row.a, ta };
  }

  /** Khoá dòng bài của em trong transaction (nộp/chấm cùng lúc không giẫm lên nhau). */
  async lock(studentAssignmentId: string, tx: DbOrTx) {
    const [sa] = await tx.select().from(studentAssignments).where(eq(studentAssignments.id, studentAssignmentId)).for('update');
    if (!sa) throw new AppError('not_found', 'Không tìm thấy bài');
    return sa;
  }

  /** Chuyển trạng thái theo máy trạng thái; sai luồng thì báo lỗi dễ hiểu. */
  async transition(sa: StudentAssignmentRow, event: StatusEvent, tx: DbOrTx, extra: Partial<StudentAssignmentRow> = {}) {
    const next = nextStatus(sa.status as StudentAssignmentStatus, event);
    if (!next.ok) {
      const msg: Record<StatusEvent['type'], string> = {
        submit: 'Bài này cô đã chấm rồi, không nộp lại được',
        grade: 'Bài này chưa có bài nộp mới để chấm',
        request_redo: 'Bài này chưa có bài nộp mới để yêu cầu làm lại',
      };
      throw new AppError('conflict', msg[event.type]);
    }
    await tx
      .update(studentAssignments)
      .set({ status: next.value, updatedAt: this.clock.now(), ...extra })
      .where(eq(studentAssignments.id, sa.id));
    return next.value;
  }

  /** studentId → student_assignment id của một bài. */
  async saIdsFor(assignmentId: string): Promise<Map<string, string>> {
    const rows = await this.db.select({ id: studentAssignments.id, studentId: studentAssignments.studentId }).from(studentAssignments).where(eq(studentAssignments.assignmentId, assignmentId));
    return new Map(rows.map((r) => [r.studentId, r.id]));
  }

  /**
   * Dữ liệu báo cáo: các bài (giao cho lớp–môn, đã giao, hạn trong khoảng) và bài của từng em.
   * Chỉ bài giáo viên/bố mẹ giao (không gồm bài tự luyện).
   */
  async reportData(input: { teachingAssignmentIds?: string[]; studentId?: string; from: Date; to: Date }) {
    const conds = [eq(assignments.status, 'published'), eq(assignments.kind, 'homework'), gte(assignments.dueAt, input.from), lt(assignments.dueAt, input.to)];
    if (input.teachingAssignmentIds) {
      if (input.teachingAssignmentIds.length === 0) return { assignments: [], studentAssignments: [] };
      conds.push(inArray(assignments.teachingAssignmentId, input.teachingAssignmentIds));
    }
    if (input.studentId) conds.push(eq(studentAssignments.studentId, input.studentId));
    const rows = await this.db
      .select({ sa: studentAssignments, a: assignments })
      .from(studentAssignments)
      .innerJoin(assignments, eq(assignments.id, studentAssignments.assignmentId))
      .where(and(...conds));
    const byId = new Map(rows.map((r) => [r.a.id, r.a]));
    return {
      assignments: [...byId.values()].sort((x, y) => x.dueAt.getTime() - y.dueAt.getTime()),
      studentAssignments: rows.map((r) => r.sa),
    };
  }

  /** Các câu trong đề, theo thứ tự. */
  async itemsOf(assignmentId: string) {
    return this.db.select().from(assignmentItems).where(eq(assignmentItems.assignmentId, assignmentId)).orderBy(assignmentItems.position);
  }

  /** Học sinh tự đánh dấu "Đã xong" bài tự luyện. */
  async markPracticeDone(actor: Actor, studentAssignmentId: string) {
    const { sa, assignment } = await this.getContext(studentAssignmentId);
    if (actor.kind !== 'student' || actor.studentId !== sa.studentId || assignment.kind !== 'practice') {
      throw new AppError('forbidden', 'Chỉ em tự đánh dấu bài tự luyện của mình');
    }
    await this.db.transaction(async (tx) => {
      const locked = await this.lock(sa.id, tx);
      if (locked.status === 'submitted') return;
      await this.transition(locked, { type: 'submit' }, tx, { lastSubmittedAt: this.clock.now() });
    });
  }

  /** Bài chưa nộp (chưa làm / đang làm lại) có hạn trong khoảng [from, to) — để nhắc 18:00 hôm trước hạn. */
  async pendingDueBetween(from: Date, to: Date) {
    return this.db
      .select({ saId: studentAssignments.id, studentId: studentAssignments.studentId, assignmentId: assignments.id })
      .from(studentAssignments)
      .innerJoin(assignments, eq(assignments.id, studentAssignments.assignmentId))
      .where(
        and(
          eq(assignments.status, 'published'),
          eq(assignments.kind, 'homework'),
          inArray(studentAssignments.status, ['assigned', 'returned']),
          gte(assignments.dueAt, from),
          lt(assignments.dueAt, to),
        ),
      );
  }

  /** Các em chưa nộp một bài (để giáo viên bấm "Nhắc các em chưa nộp"). */
  async notSubmitted(assignmentId: string) {
    return this.db
      .select({ saId: studentAssignments.id, studentId: studentAssignments.studentId })
      .from(studentAssignments)
      .where(and(eq(studentAssignments.assignmentId, assignmentId), inArray(studentAssignments.status, ['assigned', 'returned'])));
  }

  /** Bài của em (đã giao), việc cần làm lên trước theo hạn nộp. */
  async list(actor: Actor, studentId: string): Promise<StudentAssignmentItem[]> {
    const audience: Audience = await this.requireStudentOrGuardian(actor, studentId);
    const rows = await this.db
      .select({ sa: studentAssignments, a: assignments })
      .from(studentAssignments)
      .innerJoin(assignments, eq(assignments.id, studentAssignments.assignmentId))
      .where(and(eq(studentAssignments.studentId, studentId), inArray(assignments.status, ['published', 'closed'])))
      .limit(300);
    return this.toItems(rows, audience);
  }

  async toItems(rows: { sa: StudentAssignmentRow; a: AssignmentRow }[], audience: Audience): Promise<StudentAssignmentItem[]> {
    const tas = new Map((await this.teaching.getMany([...new Set(rows.map((r) => r.a.teachingAssignmentId).filter((x): x is string => Boolean(x)))])).map((t) => [t.id, t]));
    const subjectIdOf = (a: AssignmentRow) => (a.teachingAssignmentId ? tas.get(a.teachingAssignmentId)!.subjectId : a.practiceSubjectId!);
    const subjects = await this.curriculum.subjectsById(rows.map((r) => subjectIdOf(r.a)));
    const kinds = await this.teaching.schoolKinds([...new Set(rows.map((r) => r.a.schoolId))]);
    const now = this.clock.now();
    const todo = (s: string) => s === 'assigned' || s === 'returned';
    return rows
      .map(({ sa, a }) => ({
        id: sa.id,
        assignmentId: a.id,
        title: a.title,
        subject: subjects.get(subjectIdOf(a))!,
        status: displayStatus(sa.status as StudentAssignmentStatus, a.dueAt, now, audience),
        dueAt: a.dueAt.toISOString(),
        isLate: sa.isLate,
        fromFamily: a.kind === 'homework' && kinds.get(a.schoolId) === 'family',
        isPractice: a.kind === 'practice',
        lastSubmittedAt: sa.lastSubmittedAt?.toISOString() ?? null,
      }))
      .sort((x, y) => {
        const tx = todo(x.status) || x.status === 'overdue';
        const ty = todo(y.status) || y.status === 'overdue';
        if (tx !== ty) return tx ? -1 : 1;
        return tx ? x.dueAt.localeCompare(y.dueAt) : (y.lastSubmittedAt ?? '').localeCompare(x.lastSubmittedAt ?? '');
      });
  }
}
