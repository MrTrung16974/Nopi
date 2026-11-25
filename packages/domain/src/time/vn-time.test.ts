import { describe, expect, it } from 'vitest';
import { defaultDueAt, isQuietTime, nextSendableTime, reminderAt } from './vn-time.js';

describe('giờ Việt Nam', () => {
  it('hạn mặc định là 20:00 ngày mai theo giờ VN, kể cả khi đã qua nửa đêm UTC', () => {
    // 07:30 ngày 25/11 giờ VN = 00:30 UTC
    expect(defaultDueAt(new Date('2026-11-25T00:30:00Z')).toISOString()).toBe('2026-11-26T13:00:00.000Z');
    // 23:30 ngày 24/11 giờ VN = 16:30 UTC ngày 24
    expect(defaultDueAt(new Date('2026-11-24T16:30:00Z')).toISOString()).toBe('2026-11-25T13:00:00.000Z');
  });

  it('nhắc lúc 18:00 hôm trước hạn, qua cả ranh giới tháng', () => {
    expect(reminderAt(new Date('2026-12-01T13:00:00Z')).toISOString()).toBe('2026-11-30T11:00:00.000Z');
  });

  it('giờ yên lặng 21:00–06:30', () => {
    expect(isQuietTime(new Date('2026-11-25T13:59:00Z'))).toBe(false); // 20:59
    expect(isQuietTime(new Date('2026-11-25T14:00:00Z'))).toBe(true); // 21:00
    expect(isQuietTime(new Date('2026-11-25T23:29:00Z'))).toBe(true); // 06:29 hôm sau
    expect(isQuietTime(new Date('2026-11-25T23:30:00Z'))).toBe(false); // 06:30
  });

  it('tin trong giờ yên lặng bị dời tới 06:30', () => {
    expect(nextSendableTime(new Date('2026-11-25T15:00:00Z')).toISOString()).toBe('2026-11-25T23:30:00.000Z');
    expect(nextSendableTime(new Date('2026-11-25T20:00:00Z')).toISOString()).toBe('2026-11-25T23:30:00.000Z');
    const day = new Date('2026-11-25T05:00:00Z');
    expect(nextSendableTime(day)).toBe(day);
  });
});
