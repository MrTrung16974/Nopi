import { describe, expect, it } from 'vitest';
import { validateSubmissionMedia } from './limits.js';

const rules = { allowedKinds: ['photo', 'audio'] as const, maxPhotos: 2, maxMediaSeconds: 180 };

describe('giới hạn bài nộp', () => {
  it('hợp lệ', () => {
    expect(validateSubmissionMedia(rules, [{ kind: 'photo' }, { kind: 'audio', durationSeconds: 90 }]).ok).toBe(true);
  });
  it('báo lỗi bằng tiếng Việt dễ hiểu', () => {
    expect(validateSubmissionMedia(rules, [])).toMatchObject({ error: 'empty' });
    expect(validateSubmissionMedia(rules, [{ kind: 'video', durationSeconds: 5 }])).toMatchObject({ error: 'kind_not_allowed' });
    expect(validateSubmissionMedia(rules, [{ kind: 'photo' }, { kind: 'photo' }, { kind: 'photo' }])).toMatchObject({ error: 'too_many_photos' });
    expect(validateSubmissionMedia(rules, [{ kind: 'audio', durationSeconds: 200 }])).toMatchObject({
      error: 'too_long',
      message: 'Bài dài quá, cô chỉ nhận tối đa 3 phút',
    });
  });
});
