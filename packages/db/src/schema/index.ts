/**
 * Toàn bộ lược đồ (để drizzle-kit sinh migration). Trong API, mỗi mô-đun chỉ được
 * dùng bảng mình sở hữu — chú thích "Mô-đun sở hữu" ở đầu mỗi file.
 */
export * from './identity.js';
export * from './org.js';
export * from './curriculum.js';
export * from './media.js';
export * from './assignments.js';
export * from './submissions.js';
export * from './jobs.js';
export * from './billing.js';
export * from './platform.js';
