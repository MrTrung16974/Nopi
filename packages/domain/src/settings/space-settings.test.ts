import { describe, expect, it } from 'vitest';
import { deleteAfter, resolveSpaceSettings } from './space-settings.js';

describe('cài đặt không gian', () => {
  it('settings rỗng → mặc định đầy đủ', () => {
    const s = resolveSpaceSettings({});
    expect(s.maxVideoSeconds).toBe(1800);
    expect(s.retentionDays.video).toBe(365);
    expect(s.quietHours).toEqual({ start: '21:00', end: '06:30' });
  });

  it('chỉ ghi đè khoá được đặt', () => {
    const s = resolveSpaceSettings({ retentionDays: { video: 90 } });
    expect(s.retentionDays).toMatchObject({ video: 90, photo: 1095 });
  });

  it('không cho vượt trần 30 phút', () => {
    expect(() => resolveSpaceSettings({ maxVideoSeconds: 3600 })).toThrow();
  });

  it('mặc định video không vượt mức trần của trường', () => {
    expect(resolveSpaceSettings({ maxVideoSeconds: 60 }).defaultVideoSeconds).toBe(60);
  });

  it('tính ngày tự xoá', () => {
    const s = resolveSpaceSettings({ retentionDays: { video: 30 } });
    expect(deleteAfter('video', new Date('2026-11-01T00:00:00Z'), s).toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });
});
