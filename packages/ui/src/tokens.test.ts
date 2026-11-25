import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';
import { statusStyle, themes } from './tokens.js';

describe('design tokens', () => {
  it('màu trạng thái đạt WCAG AA (≥ 4.5)', () => {
    for (const [status, s] of Object.entries(statusStyle)) {
      expect(contrastRatio(s.fg, s.bg), status).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('chữ chính trên nền đạt AA ở mọi chế độ', () => {
    for (const t of Object.values(themes)) {
      expect(contrastRatio(t.color.text, t.color.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.color.onPrimary, t.color.primary)).toBeGreaterThanOrEqual(3); // chữ đậm, cỡ lớn trên nút
    }
  });

  it('chế độ Nhí: chữ 20pt, nút ≥ 2cm, tối đa 3 lựa chọn, có Chép Con', () => {
    expect(themes.nhi.font.body).toBe(20);
    expect(themes.nhi.touch.primary).toBeGreaterThanOrEqual(76);
    expect(themes.nhi.maxChoicesPerScreen).toBe(3);
    expect(themes.nhi.showMascot).toBe(true);
    expect(themes.teen.showMascot).toBe(false);
  });

  it('mọi chế độ nút tối thiểu 48dp', () => {
    for (const t of Object.values(themes)) expect(t.touch.min).toBeGreaterThanOrEqual(48);
  });
});
