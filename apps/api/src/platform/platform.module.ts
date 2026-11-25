import { Global, Module, type DynamicModule } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { CLOCK, systemClock, type Clock } from './clock.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { DatabaseLifecycle, databaseProviders } from './database.js';
import { EventDispatcher } from './events/event-dispatcher.js';
import { OutboxRelay } from './events/outbox-relay.js';
import { OutboxService } from './events/outbox.service.js';
import { FeatureFlags } from './feature-flags.js';
import { AuditLog } from './audit.js';
import { AuthGuard } from './auth/auth.guard.js';
import { TokenService } from './auth/token.service.js';
import { RateLimiter } from './rate-limiter.js';
import { RedisLifecycle, redisProvider } from './redis.js';
import { APP_GUARD } from '@nestjs/core';
import { JobQueue } from './queue.js';

/** Hạ tầng dùng chung cho mọi mô-đun. Không chứa nghiệp vụ. */
@Global()
@Module({})
export class PlatformModule {
  static forRoot(config: AppConfig, opts: { clock?: Clock } = {}): DynamicModule {
    const providers = [
      { provide: APP_CONFIG, useValue: config },
      { provide: CLOCK, useValue: opts.clock ?? systemClock },
      ...databaseProviders,
      DatabaseLifecycle,
      OutboxService,
      EventDispatcher,
      OutboxRelay,
      FeatureFlags,
      redisProvider,
      RedisLifecycle,
      RateLimiter,
      TokenService,
      AuditLog,
      JobQueue,
    ];
    return {
      module: PlatformModule,
      imports: [DiscoveryModule],
      providers: [...providers, { provide: APP_GUARD, useClass: AuthGuard }],
      exports: providers.filter((p) => p !== DatabaseLifecycle && p !== RedisLifecycle),
    };
  }
}
