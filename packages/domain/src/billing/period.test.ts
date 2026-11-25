import { describe, expect, it } from 'vitest';
import { extendPeriod, familyAcademicYear, mergeFeatures, trialEnd } from './period.js';

const now = new Date('2026-11-25T03:00:00Z'); // 10:00 25/11 VN

describe('kỳ hạn gói', () => {
  it('gia hạn tháng/năm tính từ hôm nay nếu đã hết hạn', () => {
    expect(extendPeriod(null, now, 'month').toISOString()).toBe('2026-12-25T03:00:00.000Z');
    expect(extendPeriod(new Date('2026-01-01T00:00:00Z'), now, 'year').toISOString()).toBe('2027-11-25T03:00:00.000Z');
  });

  it('mua sớm khi còn hạn thì cộng nối tiếp, không mất ngày', () => {
    expect(extendPeriod(new Date('2026-12-10T03:00:00Z'), now, 'month').toISOString()).toBe('2027-01-10T03:00:00.000Z');
  });

  it('cuối tháng: 31/1 + 1 tháng = 3/3 (theo lịch, không lùi ngày)', () => {
    const jan31 = new Date('2027-01-31T03:00:00Z');
    expect(extendPeriod(jan31, new Date('2027-01-01T00:00:00Z'), 'month').toISOString()).toBe('2027-03-03T03:00:00.000Z');
  });

  it('hợp đồng năm học tới hết 31/5', () => {
    expect(extendPeriod(null, now, 'school_year').toISOString()).toBe('2027-05-31T16:59:00.000Z');
    expect(extendPeriod(null, new Date('2027-03-01T00:00:00Z'), 'school_year').toISOString()).toBe('2027-05-31T16:59:00.000Z');
  });

  it('dùng thử 7 ngày; gộp quyền nhiều gói', () => {
    expect(trialEnd(now).toISOString()).toBe('2026-12-02T03:00:00.000Z');
    expect(mergeFeatures([{ family_space: true, scan_quota_per_day: 10 }, { family_space: false, scan_quota_per_day: 30 }])).toEqual({ family_space: true, scan_quota_per_day: 30 });
  });

  it('năm học của không gian gia đình', () => {
    expect(familyAcademicYear(now)).toEqual({ name: '2026-2027', startsOn: '2026-08-01', endsOn: '2027-07-31' });
    expect(familyAcademicYear(new Date('2027-03-01T00:00:00Z')).name).toBe('2026-2027');
  });
});
