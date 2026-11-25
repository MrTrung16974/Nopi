import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@nopi/contracts';
import type { Database } from '@nopi/db';
import { sql } from 'drizzle-orm';
import { Public } from './auth/decorators.js';
import { DB } from './database.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const database = await this.db
      .execute(sql`select 1`)
      .then(() => 'up' as const)
      .catch(() => 'down' as const);
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '0.0.0',
      checks: { database },
    };
  }
}
