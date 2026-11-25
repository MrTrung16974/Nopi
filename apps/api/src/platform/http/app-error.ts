import type { ErrorCode } from '@nopi/contracts';

const STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  feature_not_in_plan: 402,
  rate_limited: 429,
  internal: 500,
};

/**
 * Lỗi nghiệp vụ. message là tiếng Việt đời thường, nói rõ cách sửa — client hiển thị nguyên văn.
 * Ví dụ: throw new AppError('not_found', 'Không tìm thấy lớp này, cô kiểm tra lại mã lớp nhé')
 */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.status = STATUS[code];
  }
}
