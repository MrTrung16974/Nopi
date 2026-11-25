/**
 * Chuẩn hoá SĐT di động Việt Nam về dạng E.164 (+84xxxxxxxxx).
 * Nhận: "0912 345 678", "0912.345.678", "+84 912345678", "84912345678".
 * Đầu số di động hợp lệ: 03, 05, 07, 08, 09.
 */
export function normalizeVnPhone(input: string): string | null {
  const digits = input.replace(/[\s.\-()]/g, '');
  let national: string;
  if (/^\+84\d{9}$/.test(digits)) national = digits.slice(3);
  else if (/^84\d{9}$/.test(digits)) national = digits.slice(2);
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  else return null;
  if (!/^[35789]\d{8}$/.test(national)) return null;
  return `+84${national}`;
}

/** Hiển thị SĐT cho người dùng: +84912345678 → 0912 345 678 */
export function formatVnPhone(e164: string): string {
  const n = `0${e164.replace(/^\+84/, '')}`;
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
}

/** Che bớt SĐT trong thông báo: 0912 *** 678 */
export function maskVnPhone(e164: string): string {
  const f = formatVnPhone(e164);
  return `${f.slice(0, 4)} *** ${f.slice(-3)}`;
}
