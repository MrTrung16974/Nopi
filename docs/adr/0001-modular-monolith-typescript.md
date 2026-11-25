# ADR 0001 — Modular monolith TypeScript trong một monorepo

- Trạng thái: Chấp nhận · 24/11/2026

## Bối cảnh
Đội nhỏ, Phase 01 cần ra nhanh nhưng phải mở rộng được (bài giảng, trắc nghiệm, chat, AI…).

## Quyết định
- Monorepo pnpm + Turborepo; TypeScript từ app tới server.
- Backend NestJS là **một** ứng dụng chia mô-đun (`apps/api/src/modules/*`). Worker là app riêng `apps/worker` nhưng nạp cùng `AppModule` (API export qua `apps/api/src/index.ts`), nên dùng chung nghiệp vụ và handler sự kiện.
- Mỗi mô-đun chỉ lộ `public-api.ts`. Luật `boundaries/dependencies` (eslint-plugin-boundaries v7, cấu hình ở `packages/config/eslint.config.js`) chặn import vào bên trong mô-đun khác và chặn `platform/` phụ thuộc mô-đun nghiệp vụ. CI fail nếu vi phạm.
- Mô-đun báo cho nhau bằng sự kiện qua bảng `outbox` (ghi cùng transaction), handler đánh dấu `@OnDomainEvent`, giao ít nhất một lần → handler phải idempotent.

## Hệ quả
- Tách một mô-đun thành service riêng về sau: ranh giới và giao tiếp bằng sự kiện đã có sẵn.
- Không được đọc bảng của mô-đun khác "cho nhanh" — phải gọi service qua public-api.
