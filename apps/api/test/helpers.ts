import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { schema, type Database } from '@nopi/db';
import { eq } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { configureApp, createFastifyAdapter } from '../src/bootstrap.js';
import { FakeGoogleVerifier, FakeOtpSender, GOOGLE_VERIFIER, OTP_SENDER } from '../src/modules/identity/public-api.js';
import { FakePushSender, FakeZaloSender, PUSH_SENDER, ZALO_SENDER } from '../src/modules/notifications/public-api.js';
import { FakeScanEngine, SCAN_ENGINE } from '../src/modules/scan/public-api.js';
import type { Clock } from '../src/platform/clock.js';
import { loadConfig } from '../src/platform/config.js';
import { DB } from '../src/platform/database.js';

export interface TestApp {
  app: NestFastifyApplication;
  db: Database;
  otp: FakeOtpSender;
  push: FakePushSender;
  zalo: FakeZaloSender;
  scanEngine: FakeScanEngine;
  close(): Promise<void>;
}

/** App đầy đủ như production, chỉ thay adapter ra bên ngoài bằng bản giả (OTP, Google). */
export async function startTestApp(opts: { clock?: Clock } = {}): Promise<TestApp> {
  // (clock giả để thử hẹn giờ/nộp muộn)
  const config = loadConfig();
  const otp = new FakeOtpSender();
  const push = new FakePushSender();
  const zalo = new FakeZaloSender();
  const scanEngine = new FakeScanEngine();
  const mod = await Test.createTestingModule({ imports: [AppModule.forRoot(config, opts)] })
    .overrideProvider(OTP_SENDER)
    .useValue(otp)
    .overrideProvider(PUSH_SENDER)
    .useValue(push)
    .overrideProvider(ZALO_SENDER)
    .useValue(zalo)
    .overrideProvider(SCAN_ENGINE)
    .useValue(scanEngine)
    .overrideProvider(GOOGLE_VERIFIER)
    .useValue(new FakeGoogleVerifier())
    .compile();
  mod.useLogger(false);
  const app = mod.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false });
  await configureApp(app, config);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, db: app.get(DB), otp, push, zalo, scanEngine, close: () => app.close() };
}

/** SĐT ngẫu nhiên hợp lệ để các test không đụng nhau (giới hạn OTP tính theo SĐT). */
export const randomPhone = () => `09${String(randomInt(10_000_000, 99_999_999))}`;
export const e164 = (local: string) => `+84${local.slice(1)}`;

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Gọi API kèm token. */
export function api(t: TestApp, token?: string) {
  const call = (method: Method, url: string, payload?: unknown) =>
    t.app.inject({
      method,
      url: `/v1${url}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, body: unknown = {}) => call('POST', url, body),
    put: (url: string, body: unknown = {}) => call('PUT', url, body),
    patch: (url: string, body: unknown = {}) => call('PATCH', url, body),
    delete: (url: string) => call('DELETE', url),
    upload: (url: string, file: Buffer, filename = 'ds.xlsx') => {
      const boundary = `----nopi${randomInt(1e9)}`;
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
            'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n',
        ),
        file,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      return t.app.inject({
        method: 'POST',
        url: `/v1${url}`,
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
        payload: body,
      });
    },
  };
}

/** Đăng nhập bằng OTP (mã lấy từ FakeOtpSender). */
export async function loginByPhone(t: TestApp, phone: string) {
  const req = await api(t).post('/auth/otp/request', { phone });
  if (req.statusCode !== 200) throw new Error(`otp request ${req.statusCode} ${req.body}`);
  const code = t.otp.lastCodeFor(e164(phone))!;
  const res = await api(t).post('/auth/otp/verify', { phone, code });
  if (res.statusCode !== 200) throw new Error(`otp verify ${res.statusCode} ${res.body}`);
  return res.json() as { accessToken: string; refreshToken: string; user: { id: string }; isNewUser: boolean };
}

/** Tạo quản trị hệ thống: đăng nhập OTP, bật cờ trong CSDL, đăng nhập lại để token mang cờ. */
export async function systemAdmin(t: TestApp) {
  const phone = randomPhone();
  const first = await loginByPhone(t, phone);
  await t.db.update(schema.users).set({ isSystemAdmin: true, fullName: 'Quản trị hệ thống' }).where(eq(schema.users.id, first.user.id));
  return loginByPhone(t, phone);
}

/** Dựng nhanh một trường có quản trị, năm học, các lớp, giáo viên. */
export async function setupSchool(t: TestApp, opts: { classes?: { grade: number; name: string }[] } = {}) {
  const sa = await systemAdmin(t);
  const adminPhone = randomPhone();
  const school = (await api(t, sa.accessToken).post('/admin/schools', { name: `TH Test ${randomInt(1e6)}`, admin: { fullName: 'Hiệu Trưởng', phone: adminPhone } })).json();
  const admin = await loginByPhone(t, adminPhone);
  const A = api(t, admin.accessToken);
  const year = (await A.post(`/schools/${school.id}/academic-years`, { name: '2026-2027', startsOn: '2026-09-05', endsOn: '2027-05-31' })).json();
  const classes: Record<string, { id: string; grade: number; name: string }> = {};
  for (const c of opts.classes ?? [{ grade: 1, name: '1A' }, { grade: 4, name: '4A' }]) {
    const res = await A.post(`/schools/${school.id}/classes`, { academicYearId: year.id, ...c });
    if (res.statusCode !== 201) throw new Error(`class ${res.statusCode} ${res.body}`);
    classes[c.name] = res.json();
  }
  return { sa, school, admin, adminPhone, year, classes, A };
}

export async function addTeacher(t: TestApp, A: ReturnType<typeof api>, schoolId: string, fullName = 'Cô Lan') {
  const phone = randomPhone();
  const res = await A.post(`/schools/${schoolId}/teachers`, { fullName, phone });
  if (res.statusCode !== 201) throw new Error(`teacher ${res.statusCode} ${res.body}`);
  const login = await loginByPhone(t, phone);
  return { id: res.json().id as string, phone, token: login.accessToken };
}
