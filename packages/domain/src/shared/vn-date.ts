/**
 * Đọc ngày kiểu Việt Nam trong file Excel: "05/09/2019", "5/9/2019", "2019-09-05",
 * hoặc ô kiểu Date của Excel. Trả về 'YYYY-MM-DD' hoặc null nếu không hợp lệ.
 */
export function parseVnDate(input: unknown): string | null {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    // Excel lưu ngày không có giờ → lấy theo UTC để không lệch ngày
    return input.toISOString().slice(0, 10);
  }
  if (typeof input !== 'string') return null;
  const s = input.trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (match) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Chuẩn hoá họ tên: bỏ khoảng trắng thừa, viết hoa chữ cái đầu mỗi từ. "nguyễn  văn an" → "Nguyễn Văn An" */
export function normalizePersonName(input: string): string {
  return input
    .normalize('NFC')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toLocaleUpperCase('vi') + w.slice(1).toLocaleLowerCase('vi'))
    .join(' ');
}
