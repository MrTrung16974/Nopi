import { describe, expect, it } from 'vitest';
import { checkSubmission, displayStatus, nextStatus } from './status.js';

const due = new Date('2026-11-25T13:00:00Z'); // 20:00 VN
const before = new Date('2026-11-25T10:00:00Z');
const after = new Date('2026-11-25T15:00:00Z');

describe('máy trạng thái bài', () => {
  it('Chưa làm → nộp → Đã nộp → chấm → Đã chấm', () => {
    expect(nextStatus('assigned', { type: 'submit' })).toEqual({ ok: true, value: 'submitted' });
    expect(nextStatus('submitted', { type: 'grade' })).toEqual({ ok: true, value: 'graded' });
  });

  it('cô yêu cầu làm lại rồi em nộp lại', () => {
    expect(nextStatus('submitted', { type: 'request_redo' })).toMatchObject({ value: 'returned' });
    expect(nextStatus('returned', { type: 'submit' })).toMatchObject({ value: 'submitted' });
  });

  it('không chấm được bài chưa nộp, không nộp đè bài đã chấm', () => {
    expect(nextStatus('assigned', { type: 'grade' }).ok).toBe(false);
    expect(nextStatus('graded', { type: 'submit' }).ok).toBe(false);
  });

  it('nộp muộn: được nếu cô cho phép, gắn nhãn Nộp muộn', () => {
    expect(checkSubmission('assigned', { now: before, dueAt: due, allowLate: false })).toEqual({
      ok: true,
      value: { status: 'submitted', isLate: false },
    });
    expect(checkSubmission('assigned', { now: after, dueAt: due, allowLate: true })).toMatchObject({
      value: { isLate: true },
    });
    expect(checkSubmission('assigned', { now: after, dueAt: due, allowLate: false })).toMatchObject({
      ok: false,
      error: 'past_due_not_allowed',
    });
  });

  it('bài làm lại luôn nộp được kể cả quá hạn', () => {
    expect(checkSubmission('returned', { now: after, dueAt: due, allowLate: false }).ok).toBe(true);
  });

  it('quá hạn chỉ hiện đỏ với phụ huynh, giáo viên; học sinh vẫn thấy "Chưa làm"', () => {
    expect(displayStatus('assigned', due, after, 'student')).toBe('assigned');
    expect(displayStatus('assigned', due, after, 'guardian')).toBe('overdue');
    expect(displayStatus('assigned', due, after, 'teacher')).toBe('overdue');
    expect(displayStatus('submitted', due, after, 'teacher')).toBe('submitted');
  });
});
