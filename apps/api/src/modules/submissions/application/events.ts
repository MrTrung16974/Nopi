import { defineEvent } from '../../../platform/index.js';

/** Em đã nộp bài (bản tổng hợp 20:00 cho giáo viên, Chép Con thêm giọt nước…). */
export const SubmissionCreated = defineEvent<{
  submissionId: string;
  studentAssignmentId: string;
  assignmentId: string;
  studentId: string;
  attemptNo: number;
  isLate: boolean;
  byGuardian: boolean;
}>()('SubmissionCreated');

/** Cô đã chấm / yêu cầu làm lại (thông báo cho phụ huynh, học sinh). */
export const EvaluationSaved = defineEvent<{
  evaluationId: string;
  submissionId: string;
  studentAssignmentId: string;
  assignmentId: string;
  studentId: string;
  requiresRedo: boolean;
  isUpdate: boolean;
}>()('EvaluationSaved');
