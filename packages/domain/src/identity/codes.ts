/**
 * Sinh mã cho người dùng gõ tay/in ra. Nhận nguồn ngẫu nhiên từ ngoài vào (crypto ở server)
 * để domain không phụ thuộc môi trường và test được.
 */
export type RandomInt = (maxExclusive: number) => number;

/** Bỏ ký tự dễ nhầm: 0/O, 1/I/L, 2/Z, 5/S, 8/B */
export const FRIENDLY_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';

const pick = (alphabet: string, len: number, rand: RandomInt) =>
  Array.from({ length: len }, () => alphabet[rand(alphabet.length)]).join('');

/** Mã học sinh: 8 chữ số, không bắt đầu bằng 0 — học sinh lớp 4–9 gõ cùng PIN. */
export const generateStudentCode = (rand: RandomInt) => `${1 + rand(9)}${pick('0123456789', 7, rand)}`;

/** Mã lớp 6 ký tự giáo viên gửi phụ huynh qua Zalo. */
export const generateJoinCode = (rand: RandomInt) => pick(FRIENDLY_ALPHABET, 6, rand);

/** Mã trên thẻ đăng nhập / phiếu mời: 10 ký tự, hiển thị thành 3 nhóm. */
export const generateCardCode = (rand: RandomInt) => pick(FRIENDLY_ALPHABET, 10, rand);

/** "ACDEFGHJKM" → "ACD-EFG-HJKM" để in và đọc cho dễ */
export const formatCardCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6)}`;

/** Người dùng gõ có thể thường/hoa, có gạch, có khoảng trắng — đưa về dạng chuẩn. */
export const normalizeCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** OTP 6 chữ số. */
export const generateOtp = (rand: RandomInt) => pick('0123456789', 6, rand);

export type PinProblem = 'format' | 'too_simple';

/** PIN 6 số, chặn PIN quá dễ đoán (000000, 123456, 654321, 112233…). */
export function checkPin(pin: string): PinProblem | null {
  if (!/^\d{6}$/.test(pin)) return 'format';
  const d = [...pin].map(Number);
  const allSame = d.every((x) => x === d[0]);
  const step = d[1]! - d[0]!;
  const sequential = Math.abs(step) === 1 && d.every((x, i) => i === 0 || x - d[i - 1]! === step);
  const pairs = /^(\d)\1(\d)\2(\d)\3$/.test(pin);
  const repeated = /^(\d{2})\1\1$|^(\d{3})\2$/.test(pin);
  return allSame || sequential || pairs || repeated ? 'too_simple' : null;
}

export const PIN_PROBLEM_MESSAGES: Record<PinProblem, string> = {
  format: 'Mã PIN gồm đúng 6 chữ số',
  too_simple: 'Mã PIN dễ đoán quá, chọn dãy số khác nhé',
};
