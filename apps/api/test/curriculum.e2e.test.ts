import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { errorResponseSchema, gradeSubjectsResponseSchema } from '@nopi/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './helpers.js';

describe('API danh mục môn', () => {
  let t: TestApp;
  let app: NestFastifyApplication;
  beforeAll(async () => {
    t = await startTestApp();
    app = t.app;
  });
  afterAll(() => t.close());

  it('GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', checks: { database: 'up' } });
  });

  it('lớp 1: đúng bộ môn tiểu học, đúng thứ tự, đúng hợp đồng', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/curriculum/grades/1/subjects' });
    expect(res.statusCode).toBe(200);
    const body = gradeSubjectsResponseSchema.parse(res.json());
    expect(body.stage).toBe('primary');
    expect(body.subjects.map((s) => s.code)).toEqual([
      'TIENG_VIET', 'TOAN', 'NGOAI_NGU_1', 'DAO_DUC', 'TN_XH', 'GDTC', 'AM_NHAC', 'MI_THUAT', 'HDTN', 'TIENG_DTTS',
    ]);
    expect(body.subjects.every((s) => s.gradingScheme === 'completion_level')).toBe(true);
  });

  it('lớp 8: thang theo TT22 — Toán chấm điểm, Thể dục Đạt/Chưa đạt', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/curriculum/grades/8/subjects' });
    const body = gradeSubjectsResponseSchema.parse(res.json());
    const scheme = (code: string) => body.subjects.find((s) => s.code === code)?.gradingScheme;
    expect(scheme('TOAN')).toBe('score_10');
    expect(scheme('GDTC')).toBe('pass_fail');
  });

  it('khối không hợp lệ → lỗi tiếng Việt đúng định dạng', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/curriculum/grades/10/subjects' });
    expect(res.statusCode).toBe(400);
    const body = errorResponseSchema.parse(res.json());
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.message).toBe('Thông tin chưa hợp lệ, vui lòng kiểm tra lại');
    expect(body.error.requestId).toBeTruthy();
  });

  it('đường dẫn không tồn tại → not_found', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/khong-co' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });
});

describe('CORS', () => {
  let t: TestApp;
  let app: NestFastifyApplication;
  beforeAll(async () => {
    t = await startTestApp();
    app = t.app;
  });
  afterAll(() => t.close());

  it('cho phép origin trong cấu hình, không cho origin lạ', async () => {
    const ok = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://localhost:8081' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    const bad = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://evil.example' } });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight cho phép PUT/PATCH/DELETE kèm token (app chạy trên web gọi khác origin)', async () => {
    const res = await t.app.inject({
      method: 'OPTIONS',
      url: '/v1/me',
      headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'PATCH', 'access-control-request-headers': 'authorization,content-type' },
    });
    expect(res.statusCode).toBe(204);
    for (const m of ['PUT', 'PATCH', 'DELETE']) expect(res.headers['access-control-allow-methods']).toContain(m);
  });
});
