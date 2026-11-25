import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from './config.js';

export const REDIS = Symbol('REDIS');

export const redisProvider = {
  provide: REDIS,
  inject: [APP_CONFIG],
  useFactory: (c: AppConfig) => new Redis(c.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false }),
};

@Injectable()
export class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onApplicationShutdown() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
