import { z } from 'zod';

// Thông báo lỗi kiểm tra dữ liệu bằng tiếng Việt cho mọi nơi dùng contracts (API, app, web)
z.config(z.locales.vi());

export * from './common.js';
export * from './health.js';
export * from './curriculum.js';
export * from './identity.js';
export * from './org.js';
export * from './media.js';
export * from './scan.js';
export * from './assignments.js';
export * from './notifications.js';
export * from './billing.js';
export * from './reports.js';
