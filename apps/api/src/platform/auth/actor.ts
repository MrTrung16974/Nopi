/**
 * "Ai đang gọi API". Mọi use case nhận Actor để PolicyService/AccessService quyết định quyền.
 * - user: người lớn (phụ huynh, giáo viên, quản trị) — vai trò cụ thể tra theo từng trường
 * - student: phiên học sinh (máy bố mẹ, thẻ QR, PIN)
 */
export type Actor =
  | { kind: 'user'; userId: string; sessionId: string; isSystemAdmin: boolean }
  | { kind: 'student'; studentId: string; sessionId: string };

export type UserActor = Extract<Actor, { kind: 'user' }>;
export type StudentActor = Extract<Actor, { kind: 'student' }>;
