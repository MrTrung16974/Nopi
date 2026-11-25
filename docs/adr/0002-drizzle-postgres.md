# ADR 0002 — PostgreSQL + Drizzle ORM, trạng thái dạng text + CHECK

- Trạng thái: Chấp nhận · 24/11/2026

## Quyết định
- Drizzle ORM (lược đồ viết bằng TS trong `packages/db/src/schema`, migration SQL sinh bằng drizzle-kit, commit vào `packages/db/drizzle`). Lý do: hỗ trợ tốt chỉ mục có điều kiện, CHECK, `NULLS NOT DISTINCT`, SQL rõ ràng; gần SQL nên dễ bật Row-Level Security.
- Khoá chính UUID v7 sinh ở ứng dụng (sắp theo thời gian).
- Trạng thái dùng `text` + `CHECK` sinh từ hằng số TS (`inList`) thay vì `ENUM` của Postgres — thêm giá trị chỉ là đổi CHECK.
- Mọi bảng nghiệp vụ có `school_id` (trường hoặc gia đình) để lọc tenant và bật RLS ở M6.
- Ngày (`date`) giữ dạng chuỗi `YYYY-MM-DD` để không lệch múi giờ.

## Thay thế đã cân nhắc
Prisma (yếu với partial index / RLS), Kysely (ổn nhưng phải tự quản lý lược đồ).
