import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './platform/config.js';
import { OutboxRelay } from './platform/events/outbox-relay.js';

/**
 * Worker: cùng codebase với API (dùng chung mô-đun, handler sự kiện), khác entrypoint.
 * M0: chuyển sự kiện outbox → handler. M2+: thêm consumer BullMQ cho media, quét đề, xuất báo cáo.
 */
const config = loadConfig();
const app = await NestFactory.createApplicationContext(AppModule.forRoot(config));
app.enableShutdownHooks();
const relay = app.get(OutboxRelay);
const logger = new Logger('Worker');
let stopping = false;
process.on('SIGTERM', () => (stopping = true));
process.on('SIGINT', () => (stopping = true));

logger.log('Worker đã chạy');
while (!stopping) {
  try {
    const { processed } = await relay.relayBatch();
    if (processed === 0) await new Promise((r) => setTimeout(r, config.OUTBOX_POLL_MS));
  } catch (err) {
    logger.error(err);
    await new Promise((r) => setTimeout(r, config.OUTBOX_POLL_MS * 5));
  }
}
await app.close();
