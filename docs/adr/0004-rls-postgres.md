# ADR 0004 — RLS của PostgreSQL: lớp phòng thủ thứ hai, chưa bật ở Phase 01

- Trạng thái: Đề xuất (chưa triển khai) · 25/11/2026

## Bối cảnh
Kế hoạch ban đầu muốn bật Row-Level Security ở M6 như lớp phòng thủ thứ hai sau `AccessService`/`TeachingReader`.
Hiện mọi truy vấn đi qua một role ứng dụng duy nhất; quyền được kiểm ở tầng ứng dụng tại MỘT chỗ (`AccessService`, `TeachingReader.requireCan*`, `ReportDefinition.authorize`) và có test phân quyền cho từng use case ("giáo viên môn khác không xem được", "phụ huynh không xuất báo cáo của em khác"…).

Bật RLS đúng cách cần:
1. Mỗi request mở transaction và `SET LOCAL app.school_ids = …, app.user_id = …` (Drizzle + pool `postgres` → phải bọc mọi truy vấn trong transaction, kể cả đọc).
2. Policy theo `school_id` cho ~25 bảng; bảng không có `school_id` trực tiếp (submissions, evaluations, submission_media) phải JOIN ngược lên — chậm và dễ sai.
3. Role riêng cho worker/migration (`BYPASSRLS`) vì việc nền chạy xuyên trường (nhắc bài 18:00, xoá media, xuất báo cáo).
4. Phiên học sinh và không gian gia đình (một người là `guardian_owner` của "trường" riêng) làm policy phức tạp hơn mô hình "một tenant".

## Quyết định
Phase 01 **không** bật RLS. Thay vào đó:
- Giữ quy tắc "chỉ mô-đun sở hữu đọc bảng của mình", kiểm bằng eslint-plugin-boundaries.
- Mọi đường đọc dữ liệu học sinh đi qua service có kiểm quyền; báo cáo chạy nền lưu **phạm vi đã kiểm quyền** (`export_jobs.params.taIds`) để worker không mở rộng phạm vi.
- `audit_logs` chỉ ghi thêm (trigger chặn UPDATE/DELETE, migration `0010`), có màn xem cho quản trị trường; xuất báo cáo và xem nhật ký đều được ghi.

## Lộ trình khi bật (Phase 2, khi có nhiều trường / yêu cầu kiểm định)
1. Tách role: `nopi_app` (NOBYPASSRLS) cho API, `nopi_worker` + `nopi_migrator` (BYPASSRLS).
2. Interceptor NestJS mở transaction + `SET LOCAL` theo `Actor` (danh sách school_id được phép, user_id).
3. Bật RLS từ các bảng "gốc" có `school_id` (classes, enrollments, assignments, student_assignments, media_files, export_jobs, notifications, audit_logs) với policy `school_id = ANY(current_setting('app.school_ids')::uuid[])`; chạy song song kiểm tra tầng ứng dụng.
4. Thêm `school_id` (phi chuẩn hoá) vào submissions/evaluations trước khi bật cho các bảng đó, tránh policy JOIN.
5. Bộ test phân quyền hiện có chạy lại với role `nopi_app` để bắt policy thiếu.

## Hệ quả
- Một lỗi kiểm quyền ở tầng ứng dụng vẫn có thể lộ dữ liệu giữa các trường — giảm thiểu bằng test phân quyền và nhật ký truy cập.
- Không tốn chi phí transaction cho mọi truy vấn đọc ở giai đoạn đầu.
