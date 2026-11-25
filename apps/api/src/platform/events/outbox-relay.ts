import { Inject, Injectable, Logger } from '@nestjs/common';
import { schema, type Database } from '@nopi/db';
import { eq, sql } from 'drizzle-orm';
import { DB } from '../database.js';
import { EventDispatcher } from './event-dispatcher.js';

const MAX_ATTEMPTS = 10;

/**
 * Chạy trong worker: lấy sự kiện chưa xử lý (SKIP LOCKED để chạy nhiều worker song song),
 * gọi handler, đánh dấu đã xử lý. Lỗi thì tăng attempts, quá MAX_ATTEMPTS thì bỏ qua để người xem.
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly dispatcher: EventDispatcher,
  ) {}

  async relayBatch(limit = 100): Promise<{ processed: number; failed: number }> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.outbox)
        .where(sql`${schema.outbox.publishedAt} IS NULL AND ${schema.outbox.attempts} < ${MAX_ATTEMPTS}`)
        .orderBy(schema.outbox.id)
        .limit(limit)
        .for('update', { skipLocked: true });

      let failed = 0;
      for (const row of rows) {
        try {
          await this.dispatcher.dispatch({
            type: row.eventType,
            aggregateId: row.aggregateId,
            schoolId: row.schoolId,
            payload: row.payload,
          });
          await tx.update(schema.outbox).set({ publishedAt: new Date() }).where(eq(schema.outbox.id, row.id));
        } catch (err) {
          failed++;
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Sự kiện #${row.id} ${row.eventType} lỗi: ${message}`);
          await tx
            .update(schema.outbox)
            .set({ attempts: sql`${schema.outbox.attempts} + 1`, lastError: message })
            .where(eq(schema.outbox.id, row.id));
        }
      }
      return { processed: rows.length - failed, failed };
    });
  }
}
