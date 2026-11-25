import { fail, ok, type Result } from '../shared/result.js';

/**
 * Trạng thái bài của từng học sinh (bảng student_assignments).
 * assigned = Chưa làm · submitted = Đã nộp · returned = Làm lại · graded = Đã chấm
 */
export const STUDENT_ASSIGNMENT_STATUSES = ['assigned', 'submitted', 'returned', 'graded'] as const;
export type StudentAssignmentStatus = (typeof STUDENT_ASSIGNMENT_STATUSES)[number];

export type StatusEvent =
  | { type: 'submit' }
  | { type: 'grade' }
  | { type: 'request_redo' };

export type TransitionError = 'invalid_transition' | 'past_due_not_allowed';

export interface SubmitContext {
  now: Date;
  dueAt: Date;
  allowLate: boolean;
}

const transitions: Record<StudentAssignmentStatus, Partial<Record<StatusEvent['type'], StudentAssignmentStatus>>> = {
  assigned: { submit: 'submitted' },
  // Nộp lại khi chưa chấm vẫn ở trạng thái "Đã nộp" (tạo lần nộp mới)
  submitted: { submit: 'submitted', grade: 'graded', request_redo: 'returned' },
  returned: { submit: 'submitted' },
  graded: {},
};

export function nextStatus(
  current: StudentAssignmentStatus,
  event: StatusEvent,
): Result<StudentAssignmentStatus, TransitionError> {
  const next = transitions[current][event.type];
  if (!next) {
    return fail('invalid_transition', `Không thể "${event.type}" khi bài đang ở trạng thái "${current}"`);
  }
  return ok(next);
}

/** Kiểm tra nộp bài theo hạn: trả về có bị đánh dấu "Nộp muộn" hay không. */
export function checkSubmission(
  current: StudentAssignmentStatus,
  ctx: SubmitContext,
): Result<{ status: StudentAssignmentStatus; isLate: boolean }, TransitionError> {
  const next = nextStatus(current, { type: 'submit' });
  if (!next.ok) return next;
  const isLate = ctx.now.getTime() > ctx.dueAt.getTime();
  // Bài cô yêu cầu làm lại thì luôn được nộp, kể cả quá hạn.
  if (isLate && !ctx.allowLate && current !== 'returned') {
    return fail('past_due_not_allowed', 'Đã quá hạn nộp và cô chưa cho phép nộp muộn');
  }
  return ok({ status: next.value, isLate });
}

export type Audience = 'student' | 'guardian' | 'teacher';

/** Trạng thái hiển thị. "overdue" chỉ hiện với giáo viên và phụ huynh — học sinh không bị dọa. */
export type DisplayStatus = StudentAssignmentStatus | 'overdue';

export function displayStatus(
  status: StudentAssignmentStatus,
  dueAt: Date,
  now: Date,
  audience: Audience,
): DisplayStatus {
  const overdue = status === 'assigned' && now.getTime() > dueAt.getTime();
  return overdue && audience !== 'student' ? 'overdue' : status;
}
