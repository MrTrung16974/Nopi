/** Kết quả nghiệp vụ không ném lỗi: dùng cho luật kiểm tra để UI hiển thị lý do bằng tiếng Việt. */
export type Result<T, E extends string = string> =
  | { ok: true; value: T }
  | { ok: false; error: E; message: string };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const fail = <E extends string>(error: E, message: string): Result<never, E> => ({
  ok: false,
  error,
  message,
});
