import { Logger } from '@nestjs/common';

/**
 * Cổng gửi tin Zalo (ZNS) cho phụ huynh chưa cài app. ZNS chỉ gửi theo MẪU đã được Zalo duyệt,
 * nên tham số là mã mẫu + dữ liệu điền vào mẫu. Adapter thật cần hợp đồng ZNS + OA + mẫu đã duyệt.
 */
export interface ZaloSender {
  send(phoneE164: string, template: string, params: Record<string, string>): Promise<void>;
}
export const ZALO_SENDER = Symbol('ZALO_SENDER');

export class ConsoleZaloSender implements ZaloSender {
  private readonly logger = new Logger('Zalo');
  async send(phone: string, template: string, params: Record<string, string>) {
    this.logger.log(`[DEV] ZNS ${template} → ${phone.slice(0, 6)}***: ${JSON.stringify(params)}`);
  }
}

export class FakeZaloSender implements ZaloSender {
  readonly sent: { phone: string; template: string; params: Record<string, string> }[] = [];
  async send(phone: string, template: string, params: Record<string, string>) {
    this.sent.push({ phone, template, params });
  }
}
