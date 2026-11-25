import { describe, expect, it } from 'vitest';
import { checkPin, formatCardCode, generateCardCode, generateStudentCode, normalizeCode } from './codes.js';
import { formatVnPhone, maskVnPhone, normalizeVnPhone } from './phone.js';
import { normalizePersonName, parseVnDate } from '../shared/vn-date.js';

describe('SĐT Việt Nam', () => {
  it.each([
    ['0912345678', '+84912345678'],
    ['0912 345 678', '+84912345678'],
    ['0912.345.678', '+84912345678'],
    ['+84 912345678', '+84912345678'],
    ['84387654321', '+84387654321'],
  ])('%s → %s', (input, out) => expect(normalizeVnPhone(input)).toBe(out));

  it.each(['091234567', '02812345678', '0112345678', 'abc', '+1 4155552671'])('từ chối %s', (input) =>
    expect(normalizeVnPhone(input)).toBeNull(),
  );

  it('hiển thị và che số', () => {
    expect(formatVnPhone('+84912345678')).toBe('0912 345 678');
    expect(maskVnPhone('+84912345678')).toBe('0912 *** 678');
  });
});

describe('mã', () => {
  const seq = (values: number[]) => {
    let i = 0;
    return (max: number) => values[i++ % values.length]! % max;
  };

  it('mã học sinh 8 số, không bắt đầu bằng 0', () => {
    const c = generateStudentCode(seq([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(c).toMatch(/^[1-9]\d{7}$/);
  });

  it('mã thẻ không có ký tự dễ nhầm, gõ kiểu gì cũng nhận', () => {
    const code = generateCardCode(() => 0);
    expect(code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{10}$/);
    expect(normalizeCode(formatCardCode(code).toLowerCase())).toBe(code);
    expect(normalizeCode(' acd-efg hjkm ')).toBe('ACDEFGHJKM');
  });

  it.each([
    ['482915', null],
    ['12345', 'format'],
    ['12a456', 'format'],
    ['000000', 'too_simple'],
    ['123456', 'too_simple'],
    ['987654', 'too_simple'],
    ['112233', 'too_simple'],
    ['121212', 'too_simple'],
    ['123123', 'too_simple'],
  ])('PIN %s → %s', (pin, problem) => expect(checkPin(pin)).toBe(problem));
});

describe('dữ liệu nhập từ Excel', () => {
  it.each([
    ['05/09/2019', '2019-09-05'],
    ['5/9/2019', '2019-09-05'],
    ['05-09-2019', '2019-09-05'],
    ['2019-09-05', '2019-09-05'],
    ['31/02/2019', null],
    ['2019/09/05', null],
    ['', null],
  ])('ngày %s → %s', (input, out) => expect(parseVnDate(input)).toBe(out));

  it('ô kiểu Date của Excel', () => {
    expect(parseVnDate(new Date(Date.UTC(2019, 8, 5)))).toBe('2019-09-05');
  });

  it('chuẩn hoá họ tên tiếng Việt', () => {
    expect(normalizePersonName('  nguyễn   văn an ')).toBe('Nguyễn Văn An');
    expect(normalizePersonName('ĐẶNG THỊ ÁNH')).toBe('Đặng Thị Ánh');
  });
});
