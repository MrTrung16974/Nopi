import { Logger } from '@nestjs/common';
import { maskVnPhone } from '@nopi/domain';

/**
 * Cổng gửi OTP. Mỗi nhà cung cấp (Zalo ZNS, SMS brandname…) là một adapter.
 * Thêm nhà cung cấp = viết class implements OtpSender + đăng ký trong createOtpSender().
 */
export interface OtpSender {
  readonly channel: string;
  send(phoneE164: string, code: string): Promise<void>;
}
export const OTP_SENDER = Symbol('OTP_SENDER');

/** Dev: in mã ra log server, không tốn tiền. KHÔNG dùng ở production. */
export class ConsoleOtpSender implements OtpSender {
  readonly channel = 'console';
  private readonly logger = new Logger('OTP');
  async send(phone: string, code: string) {
    this.logger.warn(`[DEV] Mã OTP cho ${maskVnPhone(phone)}: ${code}`);
  }
}

/** Test: giữ lại mã đã gửi để test đọc. */
export class FakeOtpSender implements OtpSender {
  readonly channel = 'fake';
  readonly sent: { phone: string; code: string }[] = [];
  failNext = false;
  async send(phone: string, code: string) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('fake failure');
    }
    this.sent.push({ phone, code });
  }
  lastCodeFor(phone: string) {
    return [...this.sent].reverse().find((s) => s.phone === phone)?.code;
  }
}

/** Gửi qua kênh đầu tiên; lỗi thì tự chuyển kênh sau (Zalo ZNS rẻ hơn → SMS dự phòng). */
export class FallbackOtpSender implements OtpSender {
  private readonly logger = new Logger('OTP');
  channel: string;
  constructor(private readonly senders: OtpSender[]) {
    if (senders.length === 0) throw new Error('Cần ít nhất một kênh gửi OTP');
    this.channel = senders[0]!.channel;
  }
  async send(phone: string, code: string) {
    let lastError: unknown;
    for (const s of this.senders) {
      try {
        await s.send(phone, code);
        this.channel = s.channel;
        return;
      } catch (err) {
        lastError = err;
        this.logger.warn(`Gửi OTP qua ${s.channel} lỗi, thử kênh tiếp theo: ${String(err)}`);
      }
    }
    throw lastError;
  }
}

export function createOtpSender(channels: string[]): OtpSender {
  const senders = channels.map((c): OtpSender => {
    switch (c) {
      case 'console':
        return new ConsoleOtpSender();
      // 'zalo' (Zalo ZNS) và 'sms' (SMS brandname) cần hợp đồng + thông tin xác thực của nhà cung cấp.
      default:
        throw new Error(`Chưa có adapter gửi OTP cho kênh "${c}"`);
    }
  });
  return new FallbackOtpSender(senders);
}
