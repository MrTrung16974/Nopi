import { gradingSchemes, fromVn, vnParts } from '@nopi/domain';
import type { Cell } from './report-doc.js';

/** "2026-11-01" → mốc 00:00 giờ VN của ngày đó. */
export function vnDayStart(iso: string, addDays = 0) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return fromVn(y, m - 1, d + addDays, 0, 0);
}

/** Khoảng [from 00:00, to+1 00:00) giờ VN — "đến hết ngày to". */
export const vnRange = (from: string, to: string) => ({ start: vnDayStart(from), end: vnDayStart(to, 1) });

const pad = (n: number) => String(n).padStart(2, '0');
export function vnDate(d: Date | string) {
  if (typeof d === 'string') {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }
  const p = vnParts(d);
  return `${pad(p.day)}/${pad(p.month + 1)}/${p.year}`;
}
export function vnDateTime(d: Date) {
  const p = vnParts(d);
  return `${pad(p.hour)}:${pad(p.minute)} ${vnDate(d)}`;
}
export const percent = (num: number, den: number) => (den === 0 ? '—' : `${Math.round((num / den) * 100)}%`);

export interface EvalLite {
  scheme: string;
  level: string | null;
  score: number | null;
  comment: string | null;
  requiresRedo: boolean;
}
export interface SaLite {
  id: string;
  status: string;
  isLate: boolean;
  lastSubmittedAt: Date | null;
}

/** Ô kết quả của một em với một bài: mức/điểm theo thang (registry), hoặc trạng thái. */
export function resultCell(sa: SaLite | undefined, e: EvalLite | undefined, dueAt: Date, now: Date): Cell {
  if (!sa) return '';
  if (sa.status === 'graded' && e && !e.requiresRedo && gradingSchemes.has(e.scheme)) {
    return gradingSchemes.get(e.scheme).exportCell({ level: e.level, score: e.score });
  }
  if (sa.status === 'returned') return 'Làm lại';
  if (sa.lastSubmittedAt) return sa.isLate ? 'Nộp muộn' : 'Đã nộp';
  return dueAt <= now ? 'Chưa nộp' : 'Chưa đến hạn';
}

/** Trạng thái dạng chữ cho báo cáo học sinh. */
export function statusLabel(sa: SaLite, dueAt: Date, now: Date) {
  if (sa.status === 'graded') return 'Đã chấm';
  if (sa.status === 'returned') return 'Cần làm lại';
  if (sa.status === 'submitted') return 'Chờ chấm';
  return dueAt <= now ? 'Chưa nộp' : 'Chưa đến hạn';
}

/** Danh sách lớp kiểu trường VN: xếp theo tên (chữ cuối), rồi họ đệm. */
export function byVnName<T extends { fullName: string }>(a: T, b: T) {
  const last = (s: string) => s.trim().split(/\s+/).pop() ?? s;
  return last(a.fullName).localeCompare(last(b.fullName), 'vi') || a.fullName.localeCompare(b.fullName, 'vi');
}
