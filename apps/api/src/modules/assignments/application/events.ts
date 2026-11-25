import { defineEvent } from '../../../platform/index.js';

/** Bài đã giao tới học sinh (thông báo "bài mới", nhắc 18:00 hôm trước hạn…). */
export const AssignmentPublished = defineEvent<{
  assignmentId: string;
  classId: string;
  subjectId: number;
  title: string;
  dueAt: string;
  studentIds: string[];
}>()('AssignmentPublished');
