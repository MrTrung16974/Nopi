# Nopi — Kế hoạch code Phase 01

> Dựa trên tài liệu "Thiết kế hệ thống E-learning Tiểu học & THCS — Phase 01" (20/11/2026).
> Mục tiêu của kế hoạch này: làm trọn vòng lặp **giao → nộp → chấm** cho Phase 01, nhưng dựng khung sao cho Phase sau (bài giảng, trắc nghiệm tự chấm, chat, AI gợi ý nhận xét, đồng bộ phần mềm quản lý trường, Chép Con vượt vũ môn…) **chỉ cần thêm mô-đun, không phải sửa lõi**.

---

## 1. Nguyên tắc kiến trúc để dễ mở rộng

| # | Nguyên tắc | Áp dụng cụ thể trong Nopi |
|---|---|---|
| 1 | **Modular monolith, ranh giới cứng** | Mỗi mô-đun NestJS có thư mục riêng, chỉ export một `public-api.ts`. Cấm import chéo vào bên trong mô-đun khác và cấm đọc bảng của mô-đun khác (kiểm bằng `eslint-plugin-boundaries` / `dependency-cruiser` trong CI). Khi cần tách thành service riêng thì ranh giới đã có sẵn. |
| 2 | **Giao tiếp giữa mô-đun bằng sự kiện (domain events) + outbox** | `SubmissionCreated`, `EvaluationSaved`, `AssignmentPublished`… ghi vào bảng `outbox` cùng transaction, worker đẩy sang BullMQ. Thông báo, báo cáo, và sau này gamification Chép Con, AI gợi ý nhận xét chỉ việc **đăng ký nghe sự kiện**, không sửa mô-đun Bài tập/Chấm. |
| 3 | **Ports & Adapters cho mọi bên thứ ba** | Interface `OtpSender`, `PushSender`, `ObjectStorage`, `ScanEngine`, `PaymentProvider`, `ReportRenderer`. Adapter: Zalo ZNS, SMS, FCM, S3-VN, VLM, FPT/Viettel OCR, Apple, Google, MoMo, ZaloPay, VNPay… Đổi nhà cung cấp = viết adapter mới + đổi config, không đụng nghiệp vụ. Có adapter `Fake*` cho dev/test. |
| 4 | **Registry/Strategy thay cho `if/switch` rải rác** | Thang đánh giá (`completion_level`, `pass_fail`, `score_10`), kiểu nộp (`photo/video/audio/document`), kiểu câu (`open/multiple_choice/fill_blank/read_aloud`), loại báo cáo, mẫu bài — mỗi loại là một class đăng ký vào registry. Phase 2 thêm "trắc nghiệm tự chấm" = thêm một `ItemType` có `autoGrade()`. |
| 5 | **Dữ liệu thay vì code** | Danh mục môn theo khối (`subjects`, `grade_subjects`), câu nhận xét mẫu, mẫu bài, gói (`plans.features`), cài đặt trường/gia đình (`schools.settings`) đều là dữ liệu + seed. Không viết cứng tên môn, giá, quota trong code. |
| 6 | **Quyền dùng (entitlement) và quyền truy cập (authorization) tập trung** | `entitlements.can(spaceId, 'scan')` đọc từ `subscriptions` + `plans.features` — code không bao giờ so `plan_id`. Phân quyền dữ liệu qua một `PolicyService` duy nhất (kiểu CASL): `can(actor, 'grade', submission)`. |
| 7 | **Một nguồn sự thật cho kiểu dữ liệu** | Zod schema trong `packages/contracts` → sinh kiểu TS cho app/web/API + sinh OpenAPI. Máy trạng thái bài tập và luật chấm nằm trong `packages/domain` (thuần TS, không IO), dùng chung app và server. |
| 8 | **Đa "không gian" (tenant) ngay từ đầu** | Trường và gia đình đều là `schools` (`kind = school/family`). Mọi bảng nghiệp vụ có `school_id` (kể cả denormalize) để lọc truy vấn và bật Row-Level Security về sau. |
| 9 | **Giao diện theo "chế độ", không theo màn** | Design tokens cho 3 chế độ: `nhi`, `teen`, `adult`. Cùng một component (`PrimaryButton`, `SubjectTile`, `StatusBadge`) đổi cỡ/màu theo chế độ. Thêm chế độ mới = thêm bộ token. |
| 10 | **Feature flag + config theo môi trường** | Chép Con, quét đề, thanh toán, Zalo… bật/tắt theo trường hoặc theo % người dùng để thử dần. |

---

## 2. Cấu trúc repo (monorepo pnpm + Turborepo)

```
nopi/
├─ apps/
│  ├─ api/                 # NestJS — REST /v1, OpenAPI
│  ├─ worker/              # Nạp lại mô-đun của api, entrypoint riêng: outbox, BullMQ, FFmpeg, scan, export, cron
│  ├─ mobile/              # Expo (React Native) + Expo Web: học sinh, phụ huynh, giáo viên
│  └─ web/                 # Next.js: giáo viên (màn hình lớn), quản trị trường, quản trị hệ thống
├─ packages/
│  ├─ contracts/           # Zod schema request/response, mã lỗi, sinh OpenAPI + API client có kiểu
│  ├─ domain/              # Luật thuần: máy trạng thái bài, thang đánh giá, hạn nộp, giờ yên lặng, quota
│  ├─ db/                  # Schema (Drizzle), migration SQL, seed (môn GDPT 2018, nhận xét mẫu, gói)
│  ├─ ui/                  # Design tokens (nhi/teen/adult), component dùng chung app + web
│  ├─ copy/                # Toàn bộ câu chữ tiếng Việt ("Nộp bài", "Cô đã chấm"…), không rải trong code
│  ├─ upload-queue/        # Hàng đợi tải lên offline, nén, multipart, tự gửi lại (dùng cho mobile + web)
│  └─ config/              # tsconfig, eslint (gồm luật ranh giới mô-đun), prettier
├─ infra/                  # Docker compose dev, Dockerfile, IaC, cấu hình CI
└─ docs/
   ├─ adr/                 # Architecture Decision Records — mỗi quyết định lớn 1 file
   └─ ke-hoach-code-phase-01.md
```

**Vì sao `worker` dùng chung mô-đun với `api`:** dùng chung mô-đun và repository, chỉ khác entrypoint. Khi tải ảnh/video tăng thì scale riêng worker mà không phải tách code.

---

## 3. Mô-đun backend (bounded context)

Mỗi mô-đun có cấu trúc giống nhau:

```
modules/<ten>/
├─ public-api.ts          # Thứ duy nhất mô-đun khác được import
├─ <ten>.module.ts
├─ http/                  # controller, map DTO từ packages/contracts
├─ application/           # use case: CreateAssignment, SubmitWork, SaveEvaluation…
├─ domain/                # entity, value object, event (hoặc tái dùng packages/domain)
├─ infra/                 # repository (Drizzle), adapter bên thứ ba
└─ __tests__/
```

| Mô-đun | Bảng sở hữu | Ghi chú mở rộng |
|---|---|---|
| **identity** | users, auth_identities, students, guardians, student_login_cards, student_sessions, devices | Đăng nhập là các `AuthStrategy` (otp, google, password, student_avatar, student_qr, student_pin, qr_web_login). Thêm Apple ID / Google Workspace for Education = thêm strategy. |
| **org** | schools, school_members, academic_years, classes, enrollments, teaching_assignments | Nhập Excel qua `ImportPipeline` (parse → validate từng dòng → preview lỗi tiếng Việt → commit). Phase sau đồng bộ API với phần mềm quản lý trường = thêm `ImportSource` mới. |
| **curriculum** | subjects, grade_subjects, comment_templates, assignment_templates | Chỉ dữ liệu + seed; có API đọc có cache. |
| **assignments** | assignments, assignment_items, student_assignments | Sở hữu máy trạng thái `assigned → submitted → graded / returned`. Phát sự kiện. |
| **submissions** | submissions, submission_media | Kiểm tra kiểu nộp, giới hạn ảnh/giây theo assignment + settings. |
| **grading** | evaluations | Dùng `GradingSchemeRegistry`. |
| **media** | media_files | URL ký sẵn, multipart, xử lý FFmpeg, chính sách lưu trữ / tự xoá. |
| **scan** | scan_jobs | `ScanEngine` (VLM chính, OCR dự phòng), cache theo `image_hash`, quota qua entitlements. |
| **notifications** | notifications, notification_preferences | Kênh là adapter (push, zalo, sms). Có bộ gom tổng hợp 20:00, giờ yên lặng 21:00–6:30, nhắc 18:00. |
| **reporting** | export_jobs | `ReportDefinition` (class, student) × `ReportRenderer` (xlsx, pdf) — thêm báo cáo/định dạng không sửa cái cũ. |
| **billing** | plans, subscriptions, payments | `PaymentProvider` cho apple/google/momo/zalopay/vnpay/contract; webhook idempotent theo `(provider, provider_ref)`. Xuất `EntitlementService`. |
| **audit** | audit_logs | Interceptor ghi tự động khi đọc/sửa dữ liệu học sinh. |
| **platform** (dùng chung) | outbox, feature_flags | Event bus, outbox relay, feature flag, clock (múi giờ Asia/Ho_Chi_Minh). |

**Phân quyền:** mọi use case nhận `Actor` (user người lớn với vai trò trong từng `school`, hoặc phiên học sinh). `PolicyService` trả lời "ai được làm gì với bản ghi nào"; repository có helper `scopedTo(actor)` để lọc sẵn theo phân công/quan hệ phụ huynh. Bật thêm RLS của PostgreSQL ở M6 như lớp phòng thủ thứ hai.

---

## 4. Điều chỉnh lược đồ CSDL nên làm ngay (để khỏi migration đau sau này)

Lược đồ trong tài liệu thiết kế đã tốt; các điểm dưới đây giúp mở rộng dễ hơn:

1. **Giao một bài cho nhiều lớp (4A, 4B, 4C):** `assignments` đang gắn với 1 `teaching_assignment`. Thêm bảng `assignment_batches` (hoặc cột `batch_id`) để tạo mỗi lớp một assignment nhưng sửa/xem chung một lần.
2. **Đổi giáo viên giữa năm:** `UNIQUE (class_id, subject_id)` + sửa `teacher_id` sẽ làm bài cũ "đổi chủ". Thêm `valid_from`, `valid_to` và chỉ mục duy nhất có điều kiện `WHERE valid_to IS NULL`; bài cũ giữ `created_by`.
3. **`school_id` trên mọi bảng nghiệp vụ** (student_assignments, submissions, evaluations, media_files, notifications…) — để lọc tenant, RLS, xoá dữ liệu theo trường và chia partition về sau.
4. **Phụ huynh trong Không gian gia đình:** thêm role `'guardian_owner'` vào `school_members` thay vì dùng tạm `'teacher'`, để phân biệt quyền và giao diện.
5. **`schools.settings` có kiểu và phiên bản:** định nghĩa bằng Zod (`SchoolSettingsV1`), lưu `settings_version`; khi đọc thì merge với mặc định hệ thống. Thêm cài đặt mới không cần migration.
6. **Bảng `outbox`** (id, aggregate, event_type, payload jsonb, created_at, published_at) cho sự kiện tin cậy.
7. **UUID v7** (sắp theo thời gian) thay `gen_random_uuid()` cho bảng ghi nhiều (submissions, media_files, notifications) — chỉ mục tốt hơn, phân trang theo con trỏ dễ.
8. **Trạng thái dạng `text + CHECK` thay vì `ENUM`** cho những gì sẽ còn thêm giá trị (`sa_status`, `media_kind`, `grading_scheme`) — thêm giá trị ENUM trong Postgres phiền khi chạy trong transaction; hoặc giữ ENUM nhưng thống nhất quy trình migration.
9. **`evaluations.submission_id UNIQUE`**: giữ, nhưng thêm `updated_at` + lưu lịch sử sửa điểm vào audit để chấm lại không mất dấu.
10. **Chép Con (Phase sau):** không thêm bảng bây giờ; chỉ đảm bảo sự kiện `SubmissionCreated` có đủ dữ liệu để sau này mô-đun `gamification` tự tính giọt nước.

---

## 5. Frontend

### 5.1 Mobile (Expo) — một app, ba bộ mặt

```
apps/mobile/src/
├─ app/                      # expo-router
│  ├─ (auth)/                # OTP, Google, mật khẩu, QR mời phụ huynh
│  ├─ (student-nhi)/         # 3 tab: Nhà · Bài đã nộp · Sticker
│  ├─ (student-teen)/        # 4 tab: Việc cần làm · Môn học · Thông báo · Tôi
│  ├─ (guardian)/            # Con của tôi · Giao bài cho con · Thông báo · Tài khoản
│  └─ (teacher)/             # Hôm nay · Lớp của tôi · Chấm bài · Tài khoản
├─ features/                 # theo nghiệp vụ, không theo loại file
│  ├─ assignment-create/
│  ├─ submit-work/           # camera, ghi âm, quay video, xem lại, gửi
│  ├─ grading/
│  ├─ scan/
│  ├─ parent-gate/
│  ├─ billing/               # chỉ mount trong (guardian), sau cổng phụ huynh
│  └─ mascot/                # Chép Con — sau feature flag, chỉ trong chế độ nhi
├─ platform/                 # api client, auth store, push, upload-queue, flags
└─ theme/                    # nhận mode → token từ packages/ui
```

- **Chuyển vai trò** = chuyển route group + theme; một người nhiều vai trò dùng chung phiên.
- **State:** TanStack Query cho dữ liệu server (cache, offline read), Zustand nhỏ cho phiên/chế độ.
- **Media:** `expo-camera`, `expo-av`/`expo-audio`, nén ảnh 1.600 px, video 720p, audio mono trước khi đưa vào `upload-queue`.
- **Quét đề:** ML Kit Document Scanner / VisionKit qua module native (Expo config plugin), ML Kit Text Recognition để xem trước offline.
- **Thanh toán:** StoreKit 2 / Play Billing (hoặc RevenueCat SDK) bọc trong `features/billing`, không lộ ra chế độ Nhí/Teen.

### 5.2 Web (Next.js) — giáo viên & quản trị

- Màn chấm chia đôi + phím tắt; bảng tổng hợp học sinh × bài; quản trị: năm học & lớp, nhập Excel, phân công (lưới lớp × môn), báo cáo, nhật ký truy cập.
- Dùng chung `packages/ui`, `packages/contracts`, `packages/copy`.
- Phụ huynh/học sinh trên web dùng **Expo Web** (cùng mã app) — không làm giao diện thứ hai.

---

## 6. Lộ trình theo mốc (mỗi mốc ~2–3 tuần, team 4–6 người)

Song song với mọi mốc: **luồng thiết kế UX** làm prototype và thử với ≥5 học sinh lớp 1–2 + 5 giáo viên **trước** khi mốc đó code giao diện (nguyên tắc 10 của tài liệu).

### M0 — Nền móng ✅ (24/11/2026)

> Đã xong: monorepo, CI, luật ranh giới mô-đun (eslint-plugin-boundaries v7), lược đồ đủ 34 bảng + migration, seed GDPT 2018, `packages/domain` (trạng thái bài, 3 thang, giờ VN, giờ yên lặng, cài đặt không gian, giới hạn nộp), `contracts` (lỗi tiếng Việt), `ui` tokens, `copy`, API (platform + outbox/sự kiện + mô-đun mẫu `curriculum`), `apps/worker`, web Next.js và app Expo xem trước trang chủ theo khối. Dev dùng MinIO qua image Chainguard vì `minio/minio` không còn kéo được (ADR 0003). Chưa làm: sinh OpenAPI tự động, Sentry, Dockerfile production.

- Monorepo, CI (lint, typecheck, test, luật ranh giới mô-đun), Docker compose (Postgres, Redis, MinIO).
- `packages/db`: migration đầu tiên, seed môn GDPT 2018 cả 9 khối + thang mặc định TT27/TT22.
- `packages/contracts`, sinh OpenAPI + client; `packages/domain` với máy trạng thái bài + test.
- Khung NestJS: config, logger, Sentry, outbox + event bus, feature flags, `PolicyService` rỗng, health check.
- Khung Expo + Next.js, design tokens 3 chế độ, font Be Vietnam Pro/Nunito.
- ADR: ORM, nhà cung cấp hạ tầng tại VN, chiến lược phân quyền.

### M1 — Danh tính & tổ chức ✅ (25/11/2026)

> Đã xong — API: OTP (Redis, 5 lần gửi/giờ, 5 lần nhập sai, kênh gửi dạng adapter có dự phòng), Google, mật khẩu argon2id, refresh token xoay vòng, đăng nhập web bằng QR; trường/năm học/lớp/giáo viên, phân công lớp × môn có lịch sử, "nhận tất cả môn", nhập Excel học sinh/giáo viên (kiểm tra cả file, lỗi từng dòng, không ghi dở dang, file mẫu); phiếu mời phụ huynh + đồng ý điều khoản (có phiên bản), "Cho con học", thu hồi phiên của con, thẻ QR cá nhân (cấp lại vô hiệu thẻ cũ), mã HS + PIN (chỉ lớp 4–9, chặn PIN dễ đoán, khoá 15 phút sau 5 lần sai), trang chủ học sinh. App: đăng nhập OTP, thêm con (quét QR/gõ mã), cho con học, trang chủ Nhí/Teen, cổng phụ huynh, học sinh tự đăng nhập (thẻ/PIN), duyệt đăng nhập web. Web: đăng nhập QR/OTP, quản lý trường, phân công, nhập Excel, in thẻ & phiếu mời. Đã chạy thử toàn luồng trên Chrome thật.
>
> Chưa làm / nợ kỹ thuật: adapter Zalo ZNS & SMS thật (cần hợp đồng + khoá của nhà cung cấp), phụ huynh tự xin vào lớp bằng mã lớp (cần màn duyệt của giáo viên), đăng nhập máy dùng chung ở trường (chạm ảnh + 2 hình), font Nunito/Be Vietnam Pro trên app, khoá tài khoản giáo viên, phiên học sinh trên web (`dang-nhap-hoc-sinh`) vẫn lưu ở localStorage. ~~Web lưu phiên ở localStorage~~ → đã chuyển sang cookie httpOnly qua BFF; ~~phát hiện dùng lại refresh token~~ → đã làm (xem phần bổ sung).

- OTP (adapter Zalo ZNS + SMS dự phòng + Fake), giới hạn 5 lần/giờ bằng Redis; Google Sign-In; mật khẩu (argon2id).
- Quản trị: năm học, lớp, nhập Excel học sinh/giáo viên (báo lỗi từng dòng), phân công lớp × môn (kiểm tra môn thuộc khối).
- Phiếu mời phụ huynh (QR + mã), liên kết con, đồng ý điều khoản (lưu `policy_version`).
- Học sinh: chạm ảnh trên máy bố mẹ, thẻ QR cá nhân (cấp lại vô hiệu mã cũ), mã HS + PIN, phiên dài hạn thu hồi được, cổng phụ huynh.
- Web đăng nhập bằng quét QR từ app.

### M2 — Vòng lặp lõi: giao → nộp → chấm ✅ (25/11/2026)

> Đã xong — API: mô-đun media (URL ký sẵn, tải theo phần có tải tiếp, worker ffmpeg chuẩn hoá video 720p/ghi âm M4A + ảnh thu nhỏ + đo thời lượng thật, thời hạn lưu theo cài đặt trường, xoá hằng đêm), assignments (giao nhiều lớp một lần, chọn vài em, hẹn giờ giao mỗi phút, mặc định hạn 20:00 ngày mai và thang theo TT27/TT22, trang "Hôm nay"), submissions (nộp có kiểm tra cách nộp/số ảnh/thời lượng/hạn, nộp muộn, phụ huynh nộp hộ, nộp idempotent khi mạng chập chờn, chấm theo registry thang, yêu cầu làm lại, sửa nhận xét có nhật ký, nhận xét bằng giọng nói), câu nhận xét mẫu & mẫu bài; `packages/upload-queue` (hàng đợi lưu tiến độ từng bước, thử lại có giãn cách). App: trang chủ có số bài + "Làm ngay", bài theo môn, màn làm bài (loa đọc đề, chụp ảnh nén 1.600px, quay video 720p, ghi âm mono, xem lại, "Gửi cho cô"), xem nhận xét/sticker, phụ huynh xem bài & nộp hộ, giáo viên "Hôm nay"/giao bài 3 bước/lưới bài nộp/chấm liên tục. Web: lớp đang dạy, giao bài (có hẹn giờ), chấm chia đôi có phím tắt. Đã chạy thử toàn vòng lặp trên Chrome (camera & micro giả).
>
> Chưa làm / cần thử thêm: quay video, tải theo phần và phát video **trên điện thoại thật** (mới thử trên web + test API), quay video trên web (chỉ có trên điện thoại), lưu mẫu riêng trên giao diện, giao lại bài cũ trên app (~~web~~ đã có nút «Giao lại»), cô ghi âm đọc đề trên giao diện (API đã có), sticker vẽ Chép Con (đang dùng emoji), tab dưới cho từng "bộ mặt". ~~Báo lỗi khi media xử lý thất bại~~ → đã hiện cảnh báo ở màn chấm (web + app).

- Giao bài 3 bước, nhiều lớp (batch), mẫu bài, sao chép bài cũ, hẹn giờ giao (job `publish_at`).
- Trang chủ học sinh Nhí/Teen theo khối, thẻ "Hôm nay con có N bài".
- Media: URL ký sẵn, multipart, `upload-queue` offline, worker FFmpeg (thumbnail, chuẩn hoá 720p, kiểm thời lượng).
- Nộp bài ảnh/ghi âm/video, phụ huynh nộp hộ, nộp lại, nộp muộn.
- Chấm: lưới thẻ, chế độ chấm liên tục, 3 thang qua registry, câu nhận xét mẫu, nhận xét giọng nói, sticker, yêu cầu làm lại.
- **Kết thúc M2 là bản pilot nội bộ được** (chưa có thông báo đẩy, dùng làm mới màn hình).

### M3 — Thông báo ✅ (25/11/2026)

> Đã xong — mô-đun notifications: mỗi thông báo là một dòng (cũng là hộp thư), worker gửi theo lô mỗi 30 giây: đẩy về app (Expo Push Service, lô 100, tự xoá mã máy đã gỡ app) → phụ huynh không có app thì tin Zalo → không thì chỉ lưu hộp thư; dịch vụ đẩy lỗi thì thử lại giãn cách (tối đa 5 lần); chống gửi trùng bằng khoá dedupe (sự kiện giao lại không tạo tin trùng). Gửi khi: bài mới, cô đã chấm, cô nhờ làm lại (sửa nhận xét thì không báo lại); 18:00 nhắc bài hạn ngày mai chưa nộp; 20:00 một bản tổng hợp cho mỗi giáo viên ("1A: 27/30 em đã nộp Tiếng Việt"); nút "Nhắc các em chưa nộp" (mỗi bài 2 giờ một lần). Giờ yên lặng 21:00–6:30 theo cài đặt trường (bản tổng hợp cho giáo viên không bị chặn). App: đăng ký thông báo đẩy (người lớn; học sinh chỉ khi dùng máy riêng), bấm thông báo mở đúng bài, hộp thư có số chưa đọc. Web: nút nhắc trên màn chấm.
>
> Chưa làm / cần cấu hình: **EAS projectId** + chứng chỉ APNs/FCM trong Expo để thông báo đẩy chạy trên điện thoại thật (chưa thử trên máy thật), adapter Zalo ZNS thật (cần hợp đồng + mẫu tin được duyệt — hiện in ra log), ~~giờ gửi tổng hợp theo trường, bật/tắt từng loại thông báo, hộp thư trên web~~ → đã làm (xem phần bổ sung). Lưu ý: nội dung thông báo đẩy đi qua máy chủ Expo — chỉ chứa tên môn/tên bài; nếu cần thì thay bằng adapter FCM/APNs trực tiếp.

- FCM + Zalo ZNS cho phụ huynh chưa cài app; bảng `devices`.
- Nghe sự kiện: bài mới, cô đã chấm, làm lại; cron nhắc 18:00 hôm trước hạn; tổng hợp 20:00 cho giáo viên; nút "Nhắc các em chưa nộp".
- Giờ yên lặng 21:00–6:30 (luật nằm trong `packages/domain`, có test).

### M4 — Không gian gia đình & thanh toán ✅ (25/11/2026)

> Đã xong — Không gian gia đình: một gia đình là một "trường" nhỏ (kind=family), mỗi con một lớp, bố mẹ (guardian_owner) được phân công các môn chính của khối → giao/nộp/chấm/thông báo dùng lại nguyên hệ thống; tự thêm các con đang học ở trường, thêm con chưa vào trường dùng Nopi (tạo hồ sơ + liên kết); trang chủ của con gộp bài trường + "Bố mẹ giao" (một ô mỗi môn). Billing (không phụ thuộc mô-đun nghiệp vụ): EntitlementService là nơi duy nhất trả lời quyền dùng (gộp quyền các gói còn hạn), dùng thử 7 ngày mỗi người một lần, hết hạn thì chặn giao bài mới nhưng giữ bài cũ/nhận xét; mua trên web qua cổng thanh toán (bản tin IPN kiểm chữ ký, đối chiếu số tiền, idempotent theo mã giao dịch, mua sớm cộng nối tiếp kỳ hạn kể cả sau dùng thử); xác minh mua trong app + thông báo gia hạn/huỷ từ cửa hàng (qua cổng StoreVerifier); hợp đồng trường do quản trị hệ thống mở (tới 31/5). Cổng thanh toán GIẢ LẬP (ký HMAC-SHA256, có trang thanh toán thử) để chạy trọn luồng ở dev; mặc định không bật, production bật cổng giả là dừng ngay lúc khởi động. App: thẻ Không gian gia đình (dùng thử, trạng thái, giao bài cho con, thêm con) — không có giá/nút mua/link ra web (quy định App Store 3.1.1, Google Play). Web: trang Gia đình có mua/gia hạn gói. Đã chạy thử toàn luồng trên Chrome.
>
> Chưa làm / cần tài khoản thật: adapter MoMo, ZaloPay, VNPay (cần tài khoản merchant + khoá ký + sandbox), adapter xác minh App Store (StoreKit 2 JWS / App Store Server API + Notifications v2) và Google Play (Developer API + RTDN), **mua trong app** (cần thư viện in-app purchase + dev build — hiện trong app chưa có cách gia hạn khi hết hạn), giá thật (đang là giá tạm), hoá đơn điện tử, quyền theo gói cho thời hạn lưu media. ~~Nhắc "sắp hết hạn"~~ → đã làm (gói gia đình/dùng thử, báo trước 3 ngày).

- Tạo `school kind=family`, phụ huynh là `guardian_owner`, môn tự sinh theo khối của con; trang chủ gộp bài trường + "Bố mẹ giao".
- Billing: plans, subscriptions, payments; Apple (App Store Server API + notifications), Google (Play Developer API + RTDN), MoMo/ZaloPay/VNPay (IPN có chữ ký); kênh contract cho trường.
- `EntitlementService` + dùng thử 7 ngày, hết hạn thì khoá tính năng trả phí nhưng giữ dữ liệu.

### M5 — Quét đề ✅ (25/11/2026)

> Đã xong — mô-đun scan: ảnh trang đề tải thẳng lên kho như ảnh bài nộp → việc quét (hàng đợi `scan`, worker) → cổng `ScanEngine`: bộ chuyển Claude (`claude-opus-5-5`, ảnh base64, structured outputs ép đúng schema JSON, `fallbacks: "default"` khi bị từ chối nhầm, lời nhắc chỉ CHÉP đề — không giải, bỏ đáp án viết sẵn, LaTeX cho công thức, độ chắc chắn từng câu) + bản giả cho dev/test; lỗi tạm thì thử lại (3 lần), lỗi dừng hẳn thì báo rõ. Ảnh trùng trang đã quét trong cùng trường/gia đình → dùng lại kết quả ngay, không gọi AI, không tốn lượt; lượt quét/ngày = mức cao hơn giữa cài đặt trường và quyền theo gói. Giao bài kèm từng câu (`assignment_items`) + ảnh gốc; học sinh lớp 6–9 tự quét → bài tự luyện riêng (không gửi giáo viên, không thông báo, tự đánh dấu "Đã xong"); lớp 1–5 không có nút quét. Web giáo viên: quét → soát (ảnh gốc trên, câu dưới, tô vàng chỗ AI chưa chắc, sửa/bỏ/đổi thứ tự/đổi kiểu câu) → giao, gợi ý cách nộp theo kiểu câu. App: màn quét dùng chung (chụp tới 5 trang ~2000px → đọc → soát) cho giáo viên/bố mẹ giao bài và học sinh tự luyện; màn làm bài hiện từng câu + ảnh gốc. Đã chạy thử trên Chrome (web + app, camera giả).
>
> Chưa làm / cần quyết định: **bài thử ~100 trang thật để chọn nhà cung cấp** (mới có bộ chuyển Claude, chưa gọi API thật — cần khoá API và đồng ý về chi phí); bộ chuyển OCR tiếng Việt trong nước làm dự phòng; trình quét tài liệu trên máy (ML Kit / VisionKit: cắt mép, làm phẳng — cần dev build); khoanh vùng một phần trang; ảnh minh hoạ cắt riêng (`promptMediaId`); hiển thị công thức LaTeX; quét đề trên app giáo viên chưa thử bằng camera thật.

- Bài thử ~100 trang của 9 khối để chọn nhà cung cấp AI (đo dấu, tách câu, thời gian, giá) → ADR.
- `scan_jobs` + worker gọi `ScanEngine` (VLM → JSON schema cố định, OCR dự phòng), cache theo hash, quota theo gói.
- Màn soát: ảnh gốc trên, câu dưới, tô vàng chỗ `ai_confidence` thấp; luôn đính ảnh gốc.
- Ba luồng: giáo viên giao, phụ huynh giao, học sinh 6–9 tự luyện (`kind=practice`).

### M6 — Báo cáo, lưu trữ, cứng hoá & ra mắt ✅ (25/11/2026)

> Đã xong — mô-đun reporting: `ReportRegistry` (báo cáo lớp / học sinh / toàn trường; thêm loại = thêm một definition) dựng `ReportDoc` trung lập → renderer Excel (exceljs) hoặc PDF (pdfkit, A4 ngang, font Be Vietnam Pro nhúng kèm, lặp dòng tiêu đề mỗi trang). `POST /v1/reports` kiểm quyền rồi lưu phạm vi đã kiểm vào `export_jobs` → hàng đợi `reports` (worker) → file lên kho, link tải có chữ ký 15 phút, lấy được trong 24 giờ (`GET /v1/reports/:id`), file tự xoá sau 2 ngày; người yêu cầu nhận thông báo "Báo cáo đã sẵn sàng". Quyền: quản trị/chủ nhiệm xem cả lớp, giáo viên bộ môn chỉ môn mình dạy, phụ huynh chỉ con mình, báo cáo toàn trường chỉ quản trị. Màn quản trị "Báo cáo tỉ lệ nộp" (lớp × môn, chỉ tính bài đã đến hạn) và "Nhật ký truy cập" (lọc theo loại việc, phân trang); `audit_logs` chỉ ghi thêm (trigger chặn sửa/xoá), xuất báo cáo và xem nhật ký đều được ghi. Việc 09:00 báo trước 7 ngày cho phụ huynh khi ảnh/video bài của con sắp bị xoá. Web: nút Tải Excel/PDF ở trang lớp, trang lớp–môn; app phụ huynh: "Tải báo cáo tháng này (PDF)" + màn mở báo cáo từ thông báo. Kiểm thử tải `pnpm --filter @nopi/api loadtest` (autocannon, 4 đường giờ cao điểm, ngưỡng p99): máy dev 50 kết nối → 1.000–2.000 req/s, p99 39–65 ms, 0 lỗi. RLS: quyết định hoãn, xem ADR 0004.
>
> Chưa làm / cần quyết định: bật RLS (ADR 0004); rà soát pháp lý Luật BVDLCN 2025 và luồng phụ huynh yêu cầu xoá / xuất toàn bộ dữ liệu của con; ~~ghi audit khi giáo viên xem bài nộp~~, ~~dọn media "uploading" bỏ dở~~ → đã làm; kiểm thử tải trên hạ tầng staging thật + Android tầm thấp; chuẩn bị App Review; Chép Con qua feature flag.

**Bổ sung sau M6 (25/11/2026)** — các việc không cần tài khoản bên ngoài: phát hiện dùng lại refresh token (token đã xoay mà bị dùng lại sau 30 giây ân hạn → thu hồi cả phiên + ghi nhật ký `auth.refresh.reuse`); web người lớn dùng BFF (`apps/web/src/app/api/[...path]/route.ts`) giữ token trong cookie httpOnly, tự refresh và gộp các lượt refresh đồng thời; API `GET/PATCH /v1/schools/:id/settings` + tab «Cài đặt» cho quản trị (giờ yên lặng, giờ gửi tổng hợp — job chạy mỗi giờ, trần video, lượt quét, thời hạn lưu); `GET/PUT /v1/me/notification-settings` (tắt 4 loại không bắt buộc — vẫn vào hộp thư) trên web (trang 🔔 Thông báo) và app; nhắc gói gia đình/dùng thử sắp hết hạn; dọn lượt tải lên bỏ dở quá 7 ngày; nhật ký `submission.view` khi mở lưới chấm (tối đa 1 lần/giờ mỗi bài); cảnh báo media xử lý lỗi; «Giao lại» bài cũ trên web; `docker-compose.yml` thêm `SCAN_ENGINE`/`ANTHROPIC_API_KEY`.

- Export Excel/PDF chạy nền, link hết hạn 24 giờ; báo cáo tỉ lệ nộp cho quản trị.
- Cron tự xoá media theo `delete_after`, báo trước cho phụ huynh.
- Audit log, RLS Postgres, rà soát Luật BVDLCN 2025 (quyền xoá, xuất dữ liệu của con).
- Kiểm thử tải giờ cao điểm 19:00–22:00, thử trên Android tầm thấp, chuẩn bị App Review (mục 3.1 guideline).
- Chép Con (nếu kịp) bật bằng feature flag cho trường thử.

---

## 7. Chất lượng & quy trình

| Lớp | Cách kiểm thử |
|---|---|
| `packages/domain` | Unit test đầy đủ (máy trạng thái, thang chấm, hạn nộp, giờ yên lặng, quota) — đây là luật dễ sai nhất và dùng chung mọi nơi. |
| API | Integration test với Postgres thật (Testcontainers), adapter Fake; test phân quyền cho từng use case ("giáo viên môn khác không đọc được bài"). |
| Contract | CI so OpenAPI mới với bản trên nhánh chính, chặn thay đổi phá vỡ khi chưa tăng version. |
| Mobile | Maestro e2e cho luồng chính: phụ huynh quét phiếu mời → con nộp bài ảnh → cô chấm. Chạy trên emulator Android cấu hình thấp. |
| Web | Playwright cho nhập Excel, phân công, chấm, xuất báo cáo. |

- Conventional Commits, PR nhỏ, review bắt buộc; ADR cho mọi quyết định khó đảo ngược.
- Hai môi trường staging/production; EAS Build + OTA update có kênh riêng cho staging.
- Giám sát: Sentry (app + server), cảnh báo khi tỉ lệ tải lên lỗi tăng, dashboard hàng đợi BullMQ.

---

## 8. Ví dụ điểm mở rộng (để team hình dung)

```ts
// packages/domain/grading/registry.ts
export interface GradingScheme<TInput> {
  id: 'completion_level' | 'pass_fail' | 'score_10' | (string & {});
  inputSchema: z.ZodType<TInput>;              // dùng cho cả form app và validate API
  studentView(input: TInput): StudentFeedback; // tiểu học: chỉ thấy nhận xét + sticker
  exportCell(input: TInput): string | number;  // cột Excel
}
export const gradingSchemes = new Registry<GradingScheme<any>>();
```

```ts
// modules/notifications — nghe sự kiện, không bị mô-đun grading gọi trực tiếp
@OnDomainEvent('EvaluationSaved')
async handle(e: EvaluationSaved) {
  await this.scheduler.enqueueForGuardians(e.studentId, {
    template: e.requiresRedo ? 'redo_requested' : 'teacher_commented',
    respectQuietHours: true,
  });
}
```

```ts
// Thêm nhà cung cấp OTP mới = 1 file adapter + 1 dòng config
export interface OtpSender { send(phone: E164, code: string): Promise<SendResult>; }
providers: [{ provide: OTP_SENDERS, useFactory: (c) => [new ZaloZnsSender(c), new SmsBrandnameSender(c)] }]
```

---

## 9. Cần chốt trước khi bắt đầu M0

1. **Quy mô team** và số tuần cho Phase 01 (lộ trình trên giả định 4–6 dev, ~14–18 tuần).
2. **ORM:** đề xuất Drizzle (hỗ trợ chỉ mục có điều kiện, CHECK, migration SQL rõ ràng) — thay thế: Prisma (dễ dùng hơn nhưng yếu với partial index/RLS) hoặc Kysely.
3. **Hạ tầng tại Việt Nam:** Viettel IDC / VNG Cloud / FPT Cloud / BizFly — ảnh hưởng adapter `ObjectStorage` và CDN.
4. **RevenueCat hay tự tích hợp Apple/Google.**
5. **Nhà cung cấp AI quét đề** — chốt sau bài thử ở M5, nhưng nên ký thoả thuận không lưu/không huấn luyện dữ liệu sớm.
