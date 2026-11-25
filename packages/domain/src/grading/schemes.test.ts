import { describe, expect, it } from 'vitest';
import { completionLevelScheme, gradingSchemes, parseEvaluation, score10Scheme } from './schemes.js';
import { Registry } from '../shared/registry.js';

describe('thang đánh giá', () => {
  it('đăng ký đủ 3 thang theo TT27 / TT22', () => {
    expect(gradingSchemes.ids().sort()).toEqual(['completion_level', 'pass_fail', 'score_10']);
  });

  it('điểm 0–10 theo bước 0,25', () => {
    expect(parseEvaluation('score_10', { score: 8.75 }, false).success).toBe(true);
    expect(parseEvaluation('score_10', { score: 8.3 }, false).success).toBe(false);
    expect(parseEvaluation('score_10', { score: 10.25 }, false).success).toBe(false);
  });

  it('thiếu mức/điểm thì không lưu được, trừ khi yêu cầu làm lại', () => {
    expect(parseEvaluation('completion_level', { comment: 'Tốt' }, false).success).toBe(false);
    expect(parseEvaluation('completion_level', { comment: 'Viết lại câu 2 nhé' }, true).success).toBe(true);
  });

  it('tiểu học: học sinh không thấy mức, chỉ thấy nhận xét + sticker', () => {
    const view = completionLevelScheme.studentView(
      { level: 'HOAN_THANH_TOT', comment: 'Con đọc to, rõ ràng', sticker: 'gioi-lam' },
      'primary',
    );
    expect(view).toEqual({ label: null, comment: 'Con đọc to, rõ ràng', sticker: 'gioi-lam' });
    expect(completionLevelScheme.exportCell({ level: 'HOAN_THANH_TOT' })).toBe('Hoàn thành tốt');
  });

  it('điểm hiển thị kiểu Việt Nam', () => {
    expect(score10Scheme.studentView({ score: 8.5 }, 'lower_secondary').label).toBe('8,5');
  });

  it('registry chặn đăng ký trùng', () => {
    const r = new Registry<{ id: string }>('x').register({ id: 'a' });
    expect(() => r.register({ id: 'a' })).toThrow();
  });
});
