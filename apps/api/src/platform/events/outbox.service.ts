import { Inject, Injectable } from '@nestjs/common';
import { schema, type DbOrTx } from '@nopi/db';
import { DB } from '../database.js';
import type { DomainEvent } from './domain-event.js';

/**
 * Ghi sự kiện vào outbox. LUÔN truyền tx của use case để sự kiện và dữ liệu
 * cùng commit hoặc cùng rollback — không bao giờ có thông báo cho bài chưa lưu.
 */
@Injectable()
export class OutboxService {
  constructor(@Inject(DB) private readonly db: DbOrTx) {}

  async append(events: DomainEvent | DomainEvent[], tx: DbOrTx = this.db) {
    const list = Array.isArray(events) ? events : [events];
    if (list.length === 0) return;
    await tx.insert(schema.outbox).values(
      list.map((e) => ({
        eventType: e.type,
        aggregateId: e.aggregateId,
        schoolId: e.schoolId ?? null,
        payload: e.payload as object,
      })),
    );
  }
}
