import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { schema, type Database } from '@nopi/db';
import { eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/platform/config.js';
import { DB } from '../src/platform/database.js';
import { defineEvent, type EventOf } from '../src/platform/events/domain-event.js';
import { EventDispatcher } from '../src/platform/events/event-dispatcher.js';
import { OnDomainEvent } from '../src/platform/events/on-domain-event.js';
import { OutboxRelay } from '../src/platform/events/outbox-relay.js';
import { OutboxService } from '../src/platform/events/outbox.service.js';
import { PlatformModule } from '../src/platform/platform.module.js';

const SubmissionCreated = defineEvent<{ studentId: string }>()('Test.SubmissionCreated');
const Flaky = defineEvent<{ n: number }>()('Test.Flaky');

@Injectable()
class FakeNotifier {
  received: string[] = [];
  flakyCalls = 0;

  @OnDomainEvent(SubmissionCreated.type)
  onSubmission(e: EventOf<typeof SubmissionCreated>) {
    this.received.push(e.payload.studentId);
  }

  @OnDomainEvent(Flaky.type)
  onFlaky() {
    this.flakyCalls++;
    if (this.flakyCalls === 1) throw new Error('Zalo tạm lỗi');
  }
}

@Module({ providers: [FakeNotifier] })
class FakeNotificationsModule {}

describe('outbox + sự kiện nghiệp vụ', () => {
  let db: Database;
  let outbox: OutboxService;
  let relay: OutboxRelay;
  let notifier: FakeNotifier;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [PlatformModule.forRoot(loadConfig()), FakeNotificationsModule],
    }).compile();
    mod.useLogger(false);
    const app = await mod.init();
    close = () => app.close();
    db = app.get(DB);
    outbox = app.get(OutboxService);
    relay = app.get(OutboxRelay);
    notifier = app.get(FakeNotifier);
    expect(app.get(EventDispatcher).handlersFor(SubmissionCreated.type)).toEqual(['FakeNotifier.onSubmission']);
    // Bỏ qua sự kiện còn tồn của các file test khác (dùng chung DB test) để lượt relay chỉ thấy sự kiện của file này
    await db.update(schema.outbox).set({ publishedAt: new Date() }).where(isNull(schema.outbox.publishedAt));
  });
  afterAll(() => close());

  it('sự kiện ghi trong transaction bị rollback thì không bao giờ được gửi', async () => {
    await db
      .transaction(async (tx) => {
        await outbox.append(SubmissionCreated.create('sa-1', { studentId: 'rolled-back' }), tx);
        throw new Error('rollback');
      })
      .catch(() => {});
    await outbox.append(SubmissionCreated.create('sa-2', { studentId: 'committed' }));

    await relay.relayBatch();
    expect(notifier.received).toEqual(['committed']);
  });

  it('handler lỗi → thử lại ở lượt sau, rồi đánh dấu đã xử lý', async () => {
    await outbox.append(Flaky.create('x', { n: 1 }));
    expect(await relay.relayBatch()).toEqual({ processed: 0, failed: 1 });
    expect(await relay.relayBatch()).toEqual({ processed: 1, failed: 0 });

    const [row] = await db.select().from(schema.outbox).where(eq(schema.outbox.eventType, Flaky.type));
    expect(row).toMatchObject({ attempts: 1, lastError: 'Zalo tạm lỗi' });
    expect(row!.publishedAt).toBeInstanceOf(Date);
    expect(await relay.relayBatch()).toEqual({ processed: 0, failed: 0 });
  });
});
