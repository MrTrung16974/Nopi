import { describe, expect, it } from 'vitest';
import { friendlyDue, vi } from './vi.js';

const now = new Date('2026-11-25T03:00:00Z'); // 10:00 thứ Tư 25/11 giờ VN

describe('câu chữ', () => {
  it('hạn nộp đời thường', () => {
    expect(friendlyDue(new Date('2026-11-25T13:00:00Z'), now)).toBe('Hạn: tối nay');
    expect(friendlyDue(new Date('2026-11-26T13:00:00Z'), now)).toBe('Hạn: tối mai');
    expect(friendlyDue(new Date('2026-11-27T13:00:00Z'), now)).toBe('Hạn: thứ Sáu');
    expect(friendlyDue(new Date('2026-11-29T13:00:00Z'), now)).toBe('Hạn: Chủ nhật');
    expect(friendlyDue(new Date('2026-12-10T13:00:00Z'), now)).toBe('Hạn: 10/12');
  });

  it('học sinh không thấy chữ "quá hạn"', () => {
    expect(vi.status.student.overdue).not.toMatch(/quá hạn/i);
  });

  it('không dùng từ tiếng Anh kỹ thuật', () => {
    const texts: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') texts.push(v.toLowerCase());
      else if (typeof v === 'function') {
        // Gọi thử với vài kiểu tham số (số, chuỗi, object, mảng) để lấy câu chữ ra kiểm tra
        const sample = { child: 'Bống', subject: 'Toán', title: 'Bài 1', due: 'tối mai', cls: '4A', done: 1, total: 2 };
        for (const args of [[3, 'x', 1, 2], [sample], [[sample]]]) {
          try {
            const out = v(...args);
            walk(typeof out === 'object' ? out : String(out));
            break;
          } catch {
            /* thử kiểu tham số khác */
          }
        }
      }
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(vi);
    for (const w of ['submit', 'upload', 'dashboard']) for (const t of texts) expect(t).not.toContain(w);
  });
});
