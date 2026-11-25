import { importResultSchema } from '@nopi/contracts';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, randomPhone, setupSchool, startTestApp, type TestApp } from './helpers.js';

async function xlsx(rows: (string | Date | null)[][], opts: { titleRows?: string[] } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DS');
  for (const t of opts.titleRows ?? []) ws.addRow([t]);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('nhập danh sách từ Excel', () => {
  let t: TestApp;
  beforeAll(async () => (t = await startTestApp()));
  afterAll(() => t.close());

  it('tải file mẫu: đúng cột, có sheet hướng dẫn', async () => {
    const s = await setupSchool(t);
    const res = await s.A.get('/imports/templates/students.xlsx');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Học sinh', 'Hướng dẫn']);
    expect(wb.worksheets[0]!.getRow(1).values).toEqual([undefined, 'Họ và tên', 'Tên gọi ở nhà', 'Ngày sinh (dd/mm/yyyy)', 'Lớp']);
  });

  it('học sinh: báo lỗi từng dòng bằng tiếng Việt, có lỗi thì không ghi gì', async () => {
    const s = await setupSchool(t);
    const url = `/schools/${s.school.id}/imports/students?academicYearId=${s.year.id}`;
    // Có dòng tiêu đề phụ phía trên, cột viết hoa/không dấu khác mẫu — vẫn nhận ra
    const file = await xlsx(
      [
        ['STT', 'HỌ VÀ TÊN', 'Ngay sinh', 'Lớp'],
        ['1', 'nguyễn ngọc  bống', '05/09/2019', '1a'],
        ['2', '', '01/01/2019', '1A'],
        ['3', 'Trần Minh Khôi', '31/02/2019', '1A'],
        ['4', 'Lê Gia Hân', '12/12/2016', '9Z'],
        ['5', 'Nguyễn Ngọc Bống', '5/9/2019', '1A'],
        [null, null, null, null],
      ],
      { titleRows: ['TRƯỜNG TIỂU HỌC TEST — DANH SÁCH HỌC SINH'] },
    );
    const res = await s.A.upload(url, file);
    expect(res.statusCode).toBe(201);
    const r = importResultSchema.parse(res.json());
    expect(r).toMatchObject({ dryRun: true, total: 5, valid: 1, created: 0 });
    expect(r.errors).toEqual([
      { row: 4, column: 'Họ và tên', message: 'Thiếu họ tên' },
      { row: 5, column: 'Ngày sinh', message: 'Ngày sinh chưa đúng, ghi dạng 05/09/2019' },
      { row: 6, column: 'Lớp', message: 'Chưa có lớp "9Z" trong năm học này' },
      { row: 7, message: 'Trùng với dòng 3 (cùng tên, ngày sinh, lớp)' },
    ]);
    // Có lỗi thì kể cả dryRun=false cũng không ghi
    const commit = importResultSchema.parse((await s.A.upload(`${url}&dryRun=false`, file)).json());
    expect(commit.created).toBe(0);
    expect((await s.A.get(`/classes/${s.classes['1A']!.id}/students`)).json()).toEqual([]);
  });

  it('học sinh: file đúng → chạy thử, ghi thật, tải lại lần nữa thì báo đã có', async () => {
    const s = await setupSchool(t);
    const url = `/schools/${s.school.id}/imports/students?academicYearId=${s.year.id}`;
    const file = await xlsx([
      ['Họ và tên', 'Tên gọi ở nhà', 'Ngày sinh', 'Lớp'],
      ['nguyễn ngọc bống', 'Bống', new Date(Date.UTC(2019, 8, 5)), '1A'],
      ['Trần Minh Khôi', null, '20/11/2016', '4A'],
      ['Lê Gia Hân', null, null, '4 A'],
    ]);
    expect(importResultSchema.parse((await s.A.upload(url, file)).json())).toMatchObject({ dryRun: true, valid: 3, errors: [] });
    expect(importResultSchema.parse((await s.A.upload(`${url}&dryRun=false`, file)).json())).toMatchObject({ dryRun: false, created: 3 });

    const c1 = (await s.A.get(`/classes/${s.classes['1A']!.id}/students`)).json();
    expect(c1).toEqual([
      expect.objectContaining({ fullName: 'Nguyễn Ngọc Bống', nickname: 'Bống', birthDate: '2019-09-05', studentCode: expect.stringMatching(/^[1-9]\d{7}$/), guardianCount: 0, hasPin: false }),
    ]);
    const c4 = (await s.A.get(`/classes/${s.classes['4A']!.id}/students`)).json();
    expect(c4.map((x: { fullName: string }) => x.fullName)).toEqual(['Lê Gia Hân', 'Trần Minh Khôi']); // sắp theo tên

    const again = importResultSchema.parse((await s.A.upload(url, file)).json());
    expect(again.errors.map((e) => e.message)).toEqual([
      'Nguyễn Ngọc Bống đã có trong lớp 1A',
      'Trần Minh Khôi đã có trong lớp 4A',
      'Lê Gia Hân đã có trong lớp 4A',
    ]);
  });

  it('file sai: thiếu cột, không phải Excel, không gửi file', async () => {
    const s = await setupSchool(t);
    const url = `/schools/${s.school.id}/imports/students?academicYearId=${s.year.id}`;
    const noClass = await s.A.upload(url, await xlsx([['Họ và tên'], ['An']]));
    expect(noClass.json().error.message).toBe('File thiếu cột: Lớp. Vui lòng dùng file mẫu');
    const notExcel = await s.A.upload(url, Buffer.from('xin chao'), 'ds.xlsx');
    expect(notExcel.json().error.message).toBe('Không đọc được file. Vui lòng dùng file Excel (.xlsx) theo mẫu');
    const csv = await s.A.upload(url, Buffer.from('a,b'), 'ds.csv');
    expect(csv.statusCode).toBe(400);
    expect((await s.A.post(url, {})).json().error.message).toBe('Vui lòng chọn file Excel để tải lên');
  });

  it('giáo viên: SĐT sai/trùng báo lỗi; ghi thật tạo tài khoản được mời, không tạo trùng', async () => {
    const s = await setupSchool(t);
    const url = `/schools/${s.school.id}/imports/teachers`;
    const p1 = randomPhone();
    const p2 = randomPhone();
    const bad = await xlsx([
      ['Họ và tên', 'Số điện thoại', 'Email'],
      ['Trần Thị Lan', p1, ''],
      ['Lê Văn Nam', '12345', ''],
      ['Phạm Thu', p1.replace(/(\d{4})/, '$1 '), 'khong-phai-email'],
    ]);
    expect(importResultSchema.parse((await s.A.upload(url, bad)).json()).errors).toEqual([
      { row: 3, column: 'Số điện thoại', message: 'Số điện thoại chưa đúng, ví dụ 0912 345 678' },
      { row: 4, column: 'Số điện thoại', message: 'Trùng số điện thoại với dòng 2' },
      { row: 4, column: 'Email', message: 'Email chưa đúng' },
    ]);

    const good = await xlsx([
      ['Họ và tên', 'SĐT'],
      ['trần thị lan', p1],
      ['Lê Văn Nam', p2],
    ]);
    expect(importResultSchema.parse((await s.A.upload(`${url}?dryRun=false`, good)).json())).toMatchObject({ created: 2 });
    expect(importResultSchema.parse((await s.A.upload(`${url}?dryRun=false`, good)).json())).toMatchObject({ created: 0, errors: [] });
    const teachers = (await s.A.get(`/schools/${s.school.id}/teachers`)).json();
    expect(teachers.filter((x: { status: string }) => x.status === 'invited').map((x: { fullName: string }) => x.fullName)).toEqual(['Lê Văn Nam', 'Trần Thị Lan']);
  });

  it('chỉ quản trị trường được nhập', async () => {
    const s = await setupSchool(t);
    const teacherPhone = randomPhone();
    await s.A.post(`/schools/${s.school.id}/teachers`, { fullName: 'Cô Lan', phone: teacherPhone });
    const { loginByPhone } = await import('./helpers.js');
    const teacher = await loginByPhone(t, teacherPhone);
    const res = await api(t, teacher.accessToken).upload(`/schools/${s.school.id}/imports/teachers`, await xlsx([['Họ và tên', 'SĐT']]));
    expect(res.statusCode).toBe(403);
  });
});
