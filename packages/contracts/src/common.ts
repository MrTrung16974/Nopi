import { z } from 'zod';

export const API_VERSION = 'v1';

export const idSchema = z.uuid();

/** Phân trang theo con trỏ (id UUID v7 sắp theo thời gian). */
export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

/**
 * Mã lỗi ổn định cho client. message luôn là tiếng Việt đời thường, nói rõ cách sửa;
 * client hiển thị message, còn code dùng để rẽ nhánh logic.
 */
export const ERROR_CODES = [
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'feature_not_in_plan',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    requestId: z.string().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
