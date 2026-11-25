import { fromVn, vnParts } from '../time/vn-time.js';

export type PlanPeriod = 'month' | 'year' | 'school_year';

/**
 * Gia hạn quyền dùng: tính từ ngày hết hạn hiện tại nếu còn hạn (mua sớm không mất ngày),
 * từ bây giờ nếu đã hết hạn. Hợp đồng năm học: tới hết 31/5 của năm học (giờ VN).
 */
export function extendPeriod(currentEnd: Date | null, now: Date, period: PlanPeriod): Date {
  const base = currentEnd && currentEnd > now ? currentEnd : now;
  const p = vnParts(base);
  if (period === 'month') return fromVn(p.year, p.month + 1, p.day, p.hour, p.minute);
  if (period === 'year') return fromVn(p.year + 1, p.month, p.day, p.hour, p.minute);
  // Năm học kết thúc 31/5: tháng 6–12 → 31/5 năm sau; tháng 1–5 → 31/5 năm nay
  const endYear = p.month >= 5 ? p.year + 1 : p.year;
  return fromVn(endYear, 4, 31, 23, 59);
}

export const TRIAL_DAYS = 7;
export const trialEnd = (now: Date) => new Date(now.getTime() + TRIAL_DAYS * 24 * 3600_000);

/** Quyền của nhiều gói đang hiệu lực: true thắng false, số lấy lớn nhất. */
export function mergeFeatures(list: Record<string, boolean | number>[]): Record<string, boolean | number> {
  const out: Record<string, boolean | number> = {};
  for (const f of list) {
    for (const [k, v] of Object.entries(f)) {
      const cur = out[k];
      if (typeof v === 'boolean') out[k] = Boolean(cur) || v;
      else out[k] = Math.max(typeof cur === 'number' ? cur : 0, v);
    }
  }
  return out;
}

/** Năm học hiện tại cho không gian gia đình: 1/8 → 31/7 năm sau. */
export function familyAcademicYear(now: Date) {
  const p = vnParts(now);
  const start = p.month >= 7 ? p.year : p.year - 1;
  return { name: `${start}-${start + 1}`, startsOn: `${start}-08-01`, endsOn: `${start + 1}-07-31` };
}
