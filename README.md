# Nopi — Giao bài & nộp bài

Hệ thống e-learning cho Tiểu học & THCS. Vòng lặp lõi: **giáo viên giao bài → học sinh chụp ảnh / quay video / ghi âm để nộp → giáo viên nhận xét, chấm**.

- Thiết kế: `Thiết kế hệ thống E-learning Tiểu học & THCS — Phase 01.docx`
- Kế hoạch code & lộ trình: [`docs/ke-hoach-code-phase-01.md`](docs/ke-hoach-code-phase-01.md)
- Quyết định kiến trúc: [`docs/adr/`](docs/adr)

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `apps/api` | NestJS (Fastify) — REST `/v1` · cổng 3000 |
| `apps/worker` | Worker chạy nền — nạp lại mô-đun của `apps/api` (dùng chung nghiệp vụ, handler sự kiện) |
| `apps/web` | Next.js — giáo viên (màn hình lớn), quản trị trường · cổng 3200 |
| `apps/mobile` | Expo + Expo Router — học sinh (Nhí/Teen), phụ huynh, giáo viên; chạy cả web |
| `packages/domain` | Luật nghiệp vụ thuần: trạng thái bài, thang đánh giá, giờ VN, giờ yên lặng, giới hạn nộp |
| `packages/contracts` | Hợp đồng API bằng Zod, dùng chung API ↔ app ↔ web (lỗi kiểm tra bằng tiếng Việt) |
| `packages/db` | Lược đồ PostgreSQL (Drizzle), migration, seed danh mục môn GDPT 2018 |
| `packages/ui` | Design tokens 3 chế độ: `nhi`, `teen`, `adult` + màu trạng thái đạt WCAG AA |
| `packages/copy` | Câu chữ tiếng Việt đời thường |
| `packages/upload-queue` | Hàng đợi nộp bài chịu mạng yếu (lưu tiến độ từng bước, tự thử lại) |
| `packages/config` | tsconfig, ESLint (gồm luật ranh giới mô-đun bằng eslint-plugin-boundaries) |

## Chạy lần đầu

Yêu cầu: Node 24 (`nvm use`), pnpm 10, Docker, **ffmpeg** (worker xử lý video/ghi âm; macOS: `brew install ffmpeg`).

```bash
pnpm install
cp .env.example .env
pnpm db:up            # Postgres 17, Redis, MinIO (S3 :9000, console :9001)
pnpm build            # build các package dùng chung
pnpm db:migrate
pnpm db:seed          # danh mục môn theo khối, câu nhận xét mẫu, mẫu bài
pnpm --filter @nopi/api grant-system-admin 0912345678 "Họ tên"   # quản trị hệ thống đầu tiên
```

Thử app trên **điện thoại thật**: đặt `EXPO_PUBLIC_API_URL=http://<IP LAN>:3000` (app) và `S3_PUBLIC_ENDPOINT=http://<IP LAN>:9000` (API) để điện thoại tải ảnh/video thẳng lên MinIO.

Thông báo đẩy ở dev in ra log của worker (`PUSH_PROVIDER=console`); đặt `PUSH_PROVIDER=expo` và thêm `extra.eas.projectId` vào `apps/mobile/app.json` để gửi thật qua Expo Push.

Web gọi API qua `/api/*` — route handler BFF của Next (`apps/web/src/app/api/[...path]/route.ts`) chuyển tiếp tới `API_URL` (đọc lúc chạy) và giữ phiên người lớn trong cookie httpOnly.

Ở dev, mã OTP **in ra log của API** (`OTP_CHANNELS=console`) thay vì gửi tin nhắn.

Luồng thử nhanh: quản trị hệ thống đăng nhập → tạo trường kèm SĐT quản trị trường (API `POST /v1/admin/schools`) → quản trị trường vào web `http://localhost:3200` → tạo năm học, lớp, giáo viên, phân công, nhập Excel → vào lớp, in phiếu mời → phụ huynh mở app, «Thêm con» bằng mã trên phiếu → «Cho con học».

## Phát triển

```bash
pnpm --filter @nopi/api dev        # API http://localhost:3000/v1  (health: /health)
pnpm --filter @nopi/web dev        # Web http://localhost:3200
pnpm --filter @nopi/mobile start   # Expo (nhấn w để mở web, a cho Android)
pnpm --filter @nopi/worker dev     # worker: sự kiện outbox, xử lý media (ffmpeg), quét đề, xuất báo cáo, giao bài hẹn giờ, xoá media hết hạn

pnpm --filter @nopi/api loadtest   # kiểm thử tải giờ cao điểm (API_URL=…, DURATION, CONNECTIONS; chỉ dev/staging)

pnpm test        # toàn bộ test (test API dùng DB riêng nopi_test, tự tạo)
pnpm lint        # gồm kiểm tra ranh giới mô-đun
pnpm typecheck
```

Đổi lược đồ CSDL: sửa `packages/db/src/schema/*` → `pnpm --filter @nopi/db generate` → commit file trong `packages/db/drizzle/`. CI chặn nếu quên sinh migration.

## Quy ước mở rộng

- **Mô-đun backend mới**: tạo `apps/api/src/modules/<ten>/` theo mẫu `curriculum` (`http/`, `application/`, `infra/`, `public-api.ts`), thêm vào `FEATURE_MODULES` trong `app.module.ts`. Chỉ dùng bảng mình sở hữu.
- **Mô-đun cần phản ứng với việc ở mô-đun khác**: nghe sự kiện bằng `@OnDomainEvent(...)`, không gọi ngược. Phát sự kiện bằng `OutboxService.append(event, tx)` trong cùng transaction.
- **Nhà cung cấp bên ngoài** (OTP, push, lưu trữ, AI, thanh toán): định nghĩa interface trong mô-đun, viết adapter + adapter `Fake` cho test.
- **Thang đánh giá / kiểu câu / loại báo cáo mới**: `register()` vào registry trong `packages/domain`.
- **Loại báo cáo mới**: viết class `ReportDefinition` (`authorize` + `build` → `ReportDoc`) trong `apps/api/src/modules/reporting/definitions/`, thêm vào `DEFINITIONS`; Excel/PDF có sẵn.
- **Câu chữ giao diện**: thêm vào `packages/copy`, không viết chuỗi trực tiếp trong component.
- **Kích thước, màu, font**: đọc từ `useTheme()` / `themeFor(mode)`, không viết cứng.
