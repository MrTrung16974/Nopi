import { describe, expect, it } from 'vitest';
import { gradingSchemes } from '@nopi/domain';
import { SUBJECTS } from './curriculum-gdpt-2018.js';

describe('danh mục GDPT 2018', () => {
  it('mã môn không trùng', () => {
    const codes = SUBJECTS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('khối nào cũng có môn, và mọi thang đều đã đăng ký', () => {
    for (let g = 1; g <= 9; g++) {
      expect(SUBJECTS.filter((s) => s.grades[g]).length).toBeGreaterThan(5);
    }
    for (const s of SUBJECTS) for (const cfg of Object.values(s.grades)) expect(gradingSchemes.has(cfg!.scheme)).toBe(true);
  });

  it('tiểu học chỉ dùng thang mức hoàn thành (TT 27/2020)', () => {
    for (const s of SUBJECTS) for (let g = 1; g <= 5; g++) if (s.grades[g]) expect(s.grades[g]!.scheme).toBe('completion_level');
  });

  it('có Hoạt động trải nghiệm ở cả hai cấp; lớp 1 học Tiếng Anh tự chọn', () => {
    expect(SUBJECTS.find((s) => s.code === 'HDTN')?.grades[1]).toBeDefined();
    expect(SUBJECTS.find((s) => s.code === 'HDTN_HN')?.grades[9]).toBeDefined();
    expect(SUBJECTS.find((s) => s.code === 'NGOAI_NGU_1')?.grades[1]?.optional).toBe(true);
    expect(SUBJECTS.find((s) => s.code === 'NGOAI_NGU_1')?.grades[3]?.optional).toBeFalsy();
  });
});
