import { createHmac, timingSafeEqual } from 'node:crypto';

export interface GatewayOrder {
  id: string;
  amountVnd: number;
  description: string;
}

export interface IpnResult {
  orderId: string;
  /** Mã giao dịch của cổng — khoá idempotent */
  providerRef: string;
  amountVnd: number;
  success: boolean;
  raw: Record<string, unknown>;
}

/**
 * Cổng thanh toán web trong nước (MoMo, ZaloPay, VNPay…). Mỗi cổng một adapter:
 * tạo URL thanh toán và kiểm tra CHỮ KÝ của bản tin IPN cổng gửi về. Không tin dữ liệu chưa kiểm chữ ký.
 */
export interface WebPaymentGateway {
  readonly id: string;
  createPayUrl(order: GatewayOrder, returnUrl: string): Promise<string>;
  /** Kiểm chữ ký + đọc bản tin IPN. Sai chữ ký → ném lỗi. */
  parseIpn(body: Record<string, unknown>): IpnResult;
}
export const WEB_GATEWAYS = Symbol('WEB_GATEWAYS');

export const hmacSha256 = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex');
export const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

/**
 * Cổng GIẢ LẬP cho dev/test: có trang "thanh toán thử" và bản tin IPN ký HMAC-SHA256 như cổng thật,
 * để chạy trọn luồng mua gói mà không cần tài khoản merchant. Cấm bật ở production (kiểm lúc khởi động).
 */
export class FakeGateway implements WebPaymentGateway {
  readonly id = 'fake';
  constructor(
    private readonly secret: string,
    private readonly apiPublicUrl: string,
  ) {}

  static fields = ['orderId', 'transId', 'amount', 'resultCode'] as const;

  sign(data: { orderId: string; transId: string; amount: number; resultCode: number }) {
    return hmacSha256(this.secret, FakeGateway.fields.map((f) => `${f}=${data[f]}`).join('&'));
  }

  async createPayUrl(order: GatewayOrder, returnUrl: string) {
    return `${this.apiPublicUrl}/v1/billing/fake/checkout/${order.id}?returnUrl=${encodeURIComponent(returnUrl)}`;
  }

  parseIpn(body: Record<string, unknown>): IpnResult {
    const data = { orderId: String(body.orderId ?? ''), transId: String(body.transId ?? ''), amount: Number(body.amount), resultCode: Number(body.resultCode) };
    if (!safeEqualHex(String(body.signature ?? ''), this.sign(data))) throw new Error('Sai chữ ký');
    return { orderId: data.orderId, providerRef: data.transId, amountVnd: data.amount, success: data.resultCode === 0, raw: body };
  }
}
