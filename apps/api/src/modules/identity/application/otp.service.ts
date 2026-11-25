import { Inject, Injectable } from '@nestjs/common';
import { generateOtp, LIMITS, maskVnPhone, TTL } from '@nopi/domain';
import type { Redis } from 'ioredis';
import { timingSafeEqual } from 'node:crypto';
import { AppError, RateLimiter, REDIS, secureRandomInt, sha256 } from '../../../platform/index.js';
import { OTP_SENDER, type OtpSender } from '../ports/otp-sender.js';

interface StoredOtp {
  hash: string;
  attempts: number;
}

/** OTP 6 số, hết hạn sau 5 phút, tối đa 5 lần gửi mỗi giờ và 5 lần nhập sai cho một SĐT. */
@Injectable()
export class OtpService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
    private readonly limiter: RateLimiter,
  ) {}

  private key = (phone: string) => `otp:${phone}`;

  async request(phone: string) {
    const rl = await this.limiter.hit(`otp-send:${phone}`, LIMITS.otpSendsPerWindow, TTL.otpSendWindow);
    if (!rl.allowed) {
      const minutes = Math.ceil(rl.retryAfterSeconds / 60);
      throw new AppError('rate_limited', `Bạn đã lấy mã nhiều lần, vui lòng thử lại sau ${minutes} phút`);
    }
    const code = generateOtp(secureRandomInt);
    const stored: StoredOtp = { hash: sha256(`${phone}:${code}`), attempts: 0 };
    await this.redis.set(this.key(phone), JSON.stringify(stored), 'EX', TTL.otp);
    try {
      await this.sender.send(phone, code);
    } catch {
      await this.redis.del(this.key(phone));
      throw new AppError('internal', 'Chưa gửi được mã, vui lòng thử lại sau ít phút');
    }
    return { expiresIn: TTL.otp, channel: this.sender.channel, maskedPhone: maskVnPhone(phone) };
  }

  /** Đúng thì xoá mã (chỉ dùng được một lần). Sai thì tăng số lần sai. */
  async verify(phone: string, code: string): Promise<void> {
    const raw = await this.redis.get(this.key(phone));
    if (!raw) throw new AppError('validation_failed', 'Mã đã hết hạn, vui lòng lấy mã mới');
    const stored = JSON.parse(raw) as StoredOtp;
    const a = Buffer.from(stored.hash);
    const b = Buffer.from(sha256(`${phone}:${code}`));
    if (a.length === b.length && timingSafeEqual(a, b)) {
      await this.redis.del(this.key(phone));
      return;
    }
    stored.attempts += 1;
    if (stored.attempts >= LIMITS.otpVerifyAttempts) {
      await this.redis.del(this.key(phone));
      throw new AppError('rate_limited', 'Bạn đã nhập sai nhiều lần, vui lòng lấy mã mới');
    }
    const ttl = await this.redis.ttl(this.key(phone));
    await this.redis.set(this.key(phone), JSON.stringify(stored), 'EX', Math.max(ttl, 1));
    const left = LIMITS.otpVerifyAttempts - stored.attempts;
    throw new AppError('validation_failed', `Mã chưa đúng, bạn còn ${left} lần thử`);
  }
}
