/**
 * Giá trị trạng thái dùng text + CHECK thay vì ENUM của Postgres: thêm giá trị mới chỉ cần
 * một migration đổi CHECK, không vướng hạn chế ALTER TYPE ... ADD VALUE trong transaction.
 */
export { STUDENT_ASSIGNMENT_STATUSES, GRADING_SCHEME_IDS, MEDIA_KINDS } from '@nopi/domain';

export const USER_STATUSES = ['invited', 'active', 'locked'] as const;
export const AUTH_PROVIDERS = ['phone', 'google', 'password'] as const;
export const SPACE_KINDS = ['school', 'family'] as const;
export const MEMBER_ROLES = ['admin', 'teacher', 'guardian_owner'] as const;
export const ENROLLMENT_STATUSES = ['active', 'transferred', 'left'] as const;
export const MEDIA_STATUSES = ['uploading', 'processing', 'ready', 'failed', 'deleted'] as const;
export const ASSIGNMENT_STATUSES = ['draft', 'scheduled', 'published', 'closed'] as const;
export const ASSIGNMENT_SOURCES = ['manual', 'scan', 'template', 'copy'] as const;
export const ASSIGNMENT_KINDS = ['homework', 'practice'] as const;
export const ITEM_TYPES = ['open', 'multiple_choice', 'fill_blank', 'read_aloud'] as const;
export const EVALUATION_LEVELS = [
  'HOAN_THANH_TOT',
  'HOAN_THANH',
  'CHUA_HOAN_THANH',
  'DAT',
  'CHUA_DAT',
] as const;
export const JOB_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export const NOTIFICATION_CHANNELS = ['push', 'zalo', 'sms'] as const;
export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const;
export const PLAN_BUYERS = ['family', 'school'] as const;
export const PLAN_PERIODS = ['month', 'year', 'school_year'] as const;
export const SUBSCRIPTION_CHANNELS = ['apple', 'google', 'web', 'contract'] as const;
export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'grace', 'canceled', 'expired'] as const;
export const PAYMENT_STATUSES = ['pending', 'paid', 'refunded', 'failed'] as const;

/** Trạng thái trường: locked = tạm khoá (hết hợp đồng…): nhân sự trường không thao tác được, dữ liệu giữ nguyên. */
export const SCHOOL_STATUSES = ['active', 'locked'] as const;
