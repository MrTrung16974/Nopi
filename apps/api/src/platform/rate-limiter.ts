import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from './redis.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Đếm theo cửa sổ cố định trong Redis: dùng cho gửi OTP, nhập sai PIN, đăng nhập sai… */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const k = `rl:${key}`;
    const [[, count], [, ttl]] = (await this.redis.multi().incr(k).ttl(k).exec()) as [
      [unknown, number],
      [unknown, number],
    ];
    if (ttl < 0) await this.redis.expire(k, windowSeconds);
    const retry = ttl < 0 ? windowSeconds : ttl;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds: retry };
  }

  /** Chỉ xem, không tăng đếm. */
  async peek(key: string, limit: number): Promise<RateLimitResult> {
    const k = `rl:${key}`;
    const [count, ttl] = await Promise.all([this.redis.get(k), this.redis.ttl(k)]);
    const n = Number(count ?? 0);
    return { allowed: n < limit, remaining: Math.max(0, limit - n), retryAfterSeconds: Math.max(0, ttl) };
  }

  async reset(key: string) {
    await this.redis.del(`rl:${key}`);
  }
}
