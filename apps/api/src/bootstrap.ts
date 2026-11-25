import 'reflect-metadata';
import multipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { API_VERSION } from '@nopi/contracts';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module.js';
import type { Clock } from './platform/clock.js';
import type { AppConfig } from './platform/config.js';
import { ErrorFilter } from './platform/http/error.filter.js';

export const createFastifyAdapter = () => new FastifyAdapter({ genReqId: () => randomUUID(), trustProxy: true });

/** Cấu hình chung cho app thật và app trong test — để test chạy đúng như production. */
export async function configureApp(app: NestFastifyApplication, config: AppConfig) {
  app.setGlobalPrefix(API_VERSION, { exclude: ['health'] });
  app.useGlobalFilters(new ErrorFilter());
  app.enableCors({
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type'],
    maxAge: 600,
  });
  // Tải file Excel nhập danh sách (tối đa 5 MB, 1 file)
  await app.register(multipart as never, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  app.enableShutdownHooks();
  return app;
}

export async function createApp(
  config: AppConfig,
  opts: { clock?: Clock; logger?: false } = {},
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config, opts),
    createFastifyAdapter(),
    opts.logger === false ? { logger: false } : {},
  );
  return configureApp(app, config);
}
