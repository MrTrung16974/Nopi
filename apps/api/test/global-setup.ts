import { createDb, runMigrations, seedReferenceData } from '@nopi/db';
import postgres from 'postgres';

/**
 * Tạo DB test sạch (nopi_test) trên Postgres dev, chạy migration + seed.
 * CI dùng service Postgres của GitHub Actions với cùng cách làm.
 */
export default async function setup() {
  const baseUrl = process.env.DATABASE_URL ?? 'postgres://nopi:nopi@localhost:5432/nopi';
  const testUrl = new URL(baseUrl);
  testUrl.pathname = '/nopi_test';

  const admin = postgres(baseUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe('DROP DATABASE IF EXISTS nopi_test WITH (FORCE)');
  await admin.unsafe('CREATE DATABASE nopi_test');
  await admin.end();

  await runMigrations(testUrl.toString());
  const { db, close } = createDb(testUrl.toString(), { max: 1 });
  await seedReferenceData(db);
  await close();

  process.env.DATABASE_URL = testUrl.toString();
  // Redis DB 15 riêng cho test, xoá sạch mỗi lần chạy
  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  redisUrl.pathname = '/15';
  process.env.REDIS_URL = redisUrl.toString();
  const { Redis } = await import('ioredis');
  const redis = new Redis(process.env.REDIS_URL);
  await redis.flushdb();
  await redis.quit();
  process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-1234';
  process.env.OTP_CHANNELS = 'console';
  // Bucket MinIO riêng cho test (tự tạo)
  process.env.S3_BUCKET = 'nopi-test';
  process.env.S3_CREATE_BUCKET = 'true';
  // Cổng thanh toán / xác minh cửa hàng giả lập (chỉ dev/test)
  process.env.PAYMENT_PROVIDERS = 'fake';
  process.env.STORE_VERIFIER = 'fake';
  process.env.SCAN_ENGINE = 'fake';
  process.env.NODE_ENV = 'test';
}
