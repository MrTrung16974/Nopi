import { z } from 'zod';

export const NOTIFICATION_TEMPLATES = [
  'assignment_published',
  'due_reminder',
  'teacher_commented',
  'redo_requested',
  'remind_missing',
  'teacher_digest',
  'report_ready',
  'media_expiring',
  'plan_expiring',
] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

/** Dữ liệu kèm thông báo để app mở đúng màn khi bấm vào. */
export const notificationDataSchema = z.object({
  studentAssignmentId: z.uuid().optional(),
  studentId: z.uuid().optional(),
  assignmentId: z.uuid().optional(),
  reportId: z.uuid().optional(),
});

export const notificationSchema = z.object({
  id: z.uuid(),
  template: z.enum(NOTIFICATION_TEMPLATES),
  title: z.string(),
  body: z.string(),
  data: notificationDataSchema,
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

export const inboxSchema = z.object({ items: z.array(notificationSchema), unread: z.number().int() });

export const registerDeviceSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  /** Mã nhận thông báo đẩy (Expo push token) */
  pushToken: z.string().min(10).max(300),
  appVersion: z.string().max(40).optional(),
});

export const markReadSchema = z.object({ ids: z.array(z.uuid()).max(200).optional(), all: z.boolean().optional() });

export const remindResultSchema = z.object({ reminded: z.number().int() });

/** Loại thông báo người dùng được tắt (thông báo quan trọng như "cần làm lại", báo cáo, sắp xoá ảnh thì luôn bật). */
export const MUTABLE_TEMPLATES = ['assignment_published', 'due_reminder', 'teacher_commented', 'teacher_digest'] as const;
export const notificationSettingsSchema = z.object({ muted: z.array(z.enum(MUTABLE_TEMPLATES)).max(MUTABLE_TEMPLATES.length) });
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
