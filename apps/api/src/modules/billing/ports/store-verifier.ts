export interface StoreTransaction {
  /** originalTransactionId (Apple) / purchaseToken (Google) — một thuê bao xuyên suốt các lần gia hạn */
  externalId: string;
  productId: string;
  expiresAt: Date;
  autoRenew: boolean;
  /** Mã lần thu tiền này (đối soát) */
  transactionId: string;
  amountVnd: number;
}

/**
 * Cổng xác minh giao dịch trong app. Adapter thật:
 * - Apple: kiểm JWS của StoreKit 2 / App Store Server API, nhận App Store Server Notifications v2
 * - Google: Google Play Developer API (purchases.subscriptionsv2), Real-time developer notifications (Pub/Sub)
 * cần khoá của cửa hàng nên chưa làm; dev/test dùng bản giả.
 */
export interface StoreVerifier {
  verify(platform: 'apple' | 'google', productId: string, token: string): Promise<StoreTransaction>;
  /** Đọc thông báo gia hạn/huỷ cửa hàng gửi về (đã kiểm chữ ký). */
  decodeNotification(platform: 'apple' | 'google', body: unknown): Promise<{ externalId: string; expiresAt: Date; autoRenew: boolean; canceled: boolean } | null>;
}
export const STORE_VERIFIER = Symbol('STORE_VERIFIER');

/** Chưa cấu hình cửa hàng. */
export class DisabledStoreVerifier implements StoreVerifier {
  async verify(): Promise<StoreTransaction> {
    throw new Error('Chưa cấu hình xác minh giao dịch cửa hàng');
  }
  async decodeNotification() {
    return null;
  }
}

/** Dev/test: token "fake|<externalId>|<ngày hết hạn ISO>|<transactionId>". */
export class FakeStoreVerifier implements StoreVerifier {
  async verify(_platform: 'apple' | 'google', productId: string, token: string): Promise<StoreTransaction> {
    const [prefix, externalId, expires, transactionId] = token.split('|');
    if (prefix !== 'fake' || !externalId || !expires || !transactionId) throw new Error('Giao dịch không hợp lệ');
    return { externalId, productId, expiresAt: new Date(expires), autoRenew: true, transactionId, amountVnd: 49_000 };
  }
  async decodeNotification(_platform: 'apple' | 'google', body: unknown) {
    const b = body as { externalId?: string; expiresAt?: string; canceled?: boolean };
    if (!b?.externalId || !b.expiresAt) return null;
    return { externalId: b.externalId, expiresAt: new Date(b.expiresAt), autoRenew: !b.canceled, canceled: Boolean(b.canceled) };
  }
}
