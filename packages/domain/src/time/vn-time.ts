/**
 * Giờ Việt Nam (UTC+7, không có giờ mùa hè) — mọi mặc định "20:00 ngày mai", "18:00 hôm trước hạn",
 * "giờ yên lặng 21:00–6:30" đều tính theo giờ VN dù server chạy múi giờ nào.
 */
export const VN_OFFSET_MINUTES = 7 * 60;
const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;

/** Các thành phần ngày giờ theo giờ VN. */
export function vnParts(d: Date) {
  const shifted = new Date(d.getTime() + VN_OFFSET_MINUTES * MS_PER_MIN);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** Tạo Date từ ngày giờ VN. */
export function fromVn(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month, day, hour, minute) - VN_OFFSET_MINUTES * MS_PER_MIN);
}

/** Hạn nộp mặc định: 20:00 ngày mai (giờ VN). */
export function defaultDueAt(now: Date): Date {
  const p = vnParts(now);
  return fromVn(p.year, p.month, p.day + 1, 20, 0);
}

/** Thời điểm nhắc: 18:00 ngày hôm trước hạn (giờ VN). */
export function reminderAt(dueAt: Date): Date {
  const p = vnParts(dueAt);
  return fromVn(p.year, p.month, p.day - 1, 18, 0);
}

export interface QuietHours {
  /** "HH:mm" */
  start: string;
  end: string;
}
export const DEFAULT_QUIET_HOURS: QuietHours = { start: '21:00', end: '06:30' };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function isQuietTime(now: Date, quiet: QuietHours = DEFAULT_QUIET_HOURS): boolean {
  const p = vnParts(now);
  const t = p.hour * 60 + p.minute;
  const s = toMinutes(quiet.start);
  const e = toMinutes(quiet.end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

/** Nếu đang giờ yên lặng thì dời tới lúc hết giờ yên lặng; ngược lại giữ nguyên. */
export function nextSendableTime(now: Date, quiet: QuietHours = DEFAULT_QUIET_HOURS): Date {
  if (!isQuietTime(now, quiet)) return now;
  const p = vnParts(now);
  const e = toMinutes(quiet.end);
  let candidate = fromVn(p.year, p.month, p.day, Math.floor(e / 60), e % 60);
  if (candidate.getTime() <= now.getTime()) candidate = new Date(candidate.getTime() + MS_PER_DAY);
  return candidate;
}
