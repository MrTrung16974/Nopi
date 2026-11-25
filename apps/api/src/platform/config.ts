import { z } from 'zod';

/** Toàn bộ biến môi trường được kiểm tra một lần lúc khởi động; thiếu/sai thì dừng ngay. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.url(),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),
  REDIS_URL: z.url(),
  /** Kho media chuẩn S3 (dev: MinIO). */
  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  /** Địa chỉ máy điện thoại/trình duyệt dùng để tải lên/xem (vd. IP LAN khi thử trên máy thật). Mặc định = S3_ENDPOINT */
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('ap-southeast-1'),
  S3_BUCKET: z.string().default('nopi-media'),
  S3_ACCESS_KEY: z.string().default('nopi'),
  S3_SECRET_KEY: z.string().default('nopi-dev-secret'),
  /** Dev: tự tạo bucket nếu chưa có */
  S3_CREATE_BUCKET: z.stringbool().default(false),
  OUTBOX_POLL_MS: z.coerce.number().int().default(1000),
  /** Khoá ký JWT (HS256). Ít nhất 32 ký tự; production lấy từ secret manager. */
  JWT_SECRET: z.string().min(32),
  /** Client ID OAuth của app iOS/Android/web, cách nhau bằng dấu phẩy */
  GOOGLE_CLIENT_IDS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  /** Gửi thông báo đẩy: 'console' (dev, in ra log) | 'expo' (Expo Push Service) */
  PUSH_PROVIDER: z.enum(['console', 'expo']).default('console'),
  /** Tuỳ chọn: bật "Enhanced Security" trên Expo thì cần access token */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** Tin Zalo ZNS cho phụ huynh chưa cài app: 'none' | 'console' (dev). Adapter thật cần hợp đồng ZNS. */
  ZALO_NOTIFY_PROVIDER: z.enum(['none', 'console']).default('console'),
  /** Địa chỉ công khai của API (trang thanh toán thử, URL quay về từ cổng thanh toán) */
  API_PUBLIC_URL: z.url().default('http://localhost:3000'),
  /** Cổng thanh toán web được bật, cách nhau bằng dấu phẩy: 'fake' (dev) | 'momo' | 'zalopay' | 'vnpay'. Mặc định: không bật. */
  PAYMENT_PROVIDERS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  /** Khoá ký bản tin của cổng thanh toán giả lập (dev) */
  PAYMENT_FAKE_SECRET: z.string().default('dev-only-fake-payment-secret'),
  /** Xác minh giao dịch App Store / Google Play: 'none' | 'fake' (dev). Adapter thật cần khoá của cửa hàng. */
  STORE_VERIFIER: z.enum(['none', 'fake']).default('none'),
  /** Đọc đề từ ảnh: 'none' | 'fake' (dev, trả đề mẫu) | 'claude' (Anthropic API — cần ANTHROPIC_API_KEY hoặc `ant auth login`) */
  SCAN_ENGINE: z.enum(['none', 'fake', 'claude']).default('none'),
  /** Kênh gửi OTP theo thứ tự ưu tiên: 'console' (dev) | 'zalo' | 'sms' */
  OTP_CHANNELS: z
    .string()
    .default('console')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  /** Origin được gọi API từ trình duyệt (web giáo viên, Expo Web), cách nhau bằng dấu phẩy */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3200,http://localhost:8081')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
});

export type AppConfig = z.infer<typeof envSchema>;
export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (parsed.success && parsed.data.NODE_ENV === 'production') {
    // Không bao giờ chạy production với cổng thanh toán / xác minh cửa hàng giả lập (= mua gói miễn phí)
    if (parsed.data.PAYMENT_PROVIDERS.includes('fake') || parsed.data.STORE_VERIFIER === 'fake') {
      throw new Error('Cấu hình không hợp lệ: production không được bật cổng thanh toán/xác minh giả lập');
    }
  }
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
