/**
 * Phiên bản điều khoản & chính sách xử lý dữ liệu trẻ em (Luật BVDLCN 2025).
 * Đổi nội dung điều khoản = tăng phiên bản; phụ huynh phải đồng ý lại trước khi dùng tiếp.
 */
export const CURRENT_POLICY_VERSION = '2026-11-20';

/** Thời hạn các loại phiên / mã (giây). Đổi ở một chỗ. */
export const TTL = {
  otp: 5 * 60,
  otpSendWindow: 60 * 60,
  accessToken: 15 * 60,
  adultSession: 90 * 24 * 3600,
  studentSession: 365 * 24 * 3600,
  loginCard: 365 * 24 * 3600,
  guardianInvite: 60 * 24 * 3600,
  qrWebLogin: 2 * 60,
} as const;

export const LIMITS = {
  otpSendsPerWindow: 5,
  otpVerifyAttempts: 5,
  pinFailuresBeforeLock: 5,
  pinLockSeconds: 15 * 60,
} as const;
