import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, type Database, type DbHandle } from '@nopi/db';
import { APP_CONFIG, type AppConfig } from './config.js';

export const DB_HANDLE = Symbol('DB_HANDLE');
/** Token để tiêm Database: `@Inject(DB) private readonly db: Database` */
export const DB = Symbol('DB');

export const databaseProviders = [
  {
    provide: DB_HANDLE,
    inject: [APP_CONFIG],
    useFactory: (c: AppConfig): DbHandle => createDb(c.DATABASE_URL, { max: c.DATABASE_POOL_MAX }),
  },
  { provide: DB, inject: [DB_HANDLE], useFactory: (h: DbHandle): Database => h.db },
];

@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: DbHandle) {}
  async onApplicationShutdown() {
    await this.handle.close();
  }
}
