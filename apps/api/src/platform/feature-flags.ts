import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database } from '@nopi/db';
import { and, eq, isNull, or } from 'drizzle-orm';
import { DB } from './database.js';

export type FeatureKey = 'mascot' | 'scan' | 'billing' | 'zalo_notifications' | 'family_space';

/** Cờ theo không gian (school_id) ghi đè cờ toàn hệ thống. Không có dòng nào = tắt. */
@Injectable()
export class FeatureFlags {
  constructor(@Inject(DB) private readonly db: Database) {}

  async isEnabled(key: FeatureKey, schoolId?: string): Promise<boolean> {
    const f = schema.featureFlags;
    const rows = await this.db
      .select({ schoolId: f.schoolId, enabled: f.enabled })
      .from(f)
      .where(and(eq(f.key, key), schoolId ? or(isNull(f.schoolId), eq(f.schoolId, schoolId)) : isNull(f.schoolId)));
    const specific = rows.find((r) => r.schoolId !== null);
    return (specific ?? rows[0])?.enabled ?? false;
  }
}
