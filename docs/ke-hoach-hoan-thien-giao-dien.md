# Kế hoạch hoàn thiện giao diện & phân quyền (sau M6)

- Trạng thái: **Đề xuất — chờ duyệt, chưa code** · 25/11/2026
- Cơ sở: rà toàn bộ 13 trang web (`apps/web/src/app`) và 26 màn app (`apps/mobile/src/app`), đối chiếu với API `/v1`.

---

## 1. Hiện trạng

### 1.1 Web (`apps/web`)

| Trang | Dành cho | Dữ liệu | Vấn đề chính |
|---|---|---|---|
| `/` | Người lớn | Thật | Phụ huynh gia đình thấy chữ "Lớp đang dạy / Chờ chấm" của giáo viên |
| `/dang-nhap` | Công khai | Thật (QR, OTP) | Có link sang `/hoc-sinh?demo=` |
| `/dang-nhap-hoc-sinh` | Học sinh | Thật | Đăng nhập xong lại chuyển vào trang demo |
| `/hoc-sinh` | Học sinh | **Demo 100%** | Bỏ qua phiên đăng nhập, nộp bài chỉ đổi trạng thái trên trình duyệt |
| `/truong/[id]` | Quản trị/giáo viên trường | Thật | Chỉ **thêm** được, không sửa/xoá; giáo viên thấy cả lớp không dạy |
| `/lop/[id]` | Chủ nhiệm/quản trị | Thật | Cấp lại thẻ không hỏi xác nhận (cả lớp bị đăng xuất); trang cụt |
| `/day/[taId]` | Giáo viên | Thật | Không có link quay lại lớp; không kiểm hạn nộp |
| `/bai/[id]` | Giáo viên | Thật | **Ô điểm trống lưu thành 0**; phím Enter lưu nhầm; vỡ bố cục trên máy tính bảng |
| `/mon-hoc` | Công khai | Thật | Không có khung Shell, nút dẫn về demo |
| `/gia-dinh` | Phụ huynh | Thật | **`provider: 'fake'` viết cứng** → production không thanh toán được |
| `/thong-bao` | Người lớn | Thật | Chỉ thông báo tổng hợp có link, các thông báo khác không bấm được |
| *(không có)* | **Quản trị hệ thống** | — | Không có trang; chỉ có `POST /v1/admin/schools`, không có API liệt kê trường |

Lỗi chung của web:
- Chỉ chặn ở trình duyệt: `Shell` chỉ kiểm có phiên trong localStorage, không kiểm vai trò.
- Menu giống nhau cho mọi vai trò: menu "Học sinh" dẫn về demo, menu "Môn 1–9" dẫn sang trang không có khung Shell.
- Không có breadcrumb.
- Menu tràn ngang trên điện thoại.

### 1.2 App (`apps/mobile`)

- **Không có dữ liệu demo.** Mọi màn đều gọi API thật, và mọi link đều trỏ tới màn có thật.
- Không có điều hướng theo vai trò: giáo viên đăng nhập xong vào trang phụ huynh ("Thêm con", "chưa có con", mời dùng thử gói gia đình).
- Không chặn theo phiên:
  - Refresh token lỗi thì phiên bị xoá, nhưng màn hình vẫn đứng nguyên.
  - Trên web, khi máy đang ở chế độ "Cho con học", gõ `/giao-vien` lên thanh địa chỉ là vượt qua ParentGate.
- Đăng xuất không xoá cache React Query: người dùng sau trên cùng máy thấy dữ liệu của người trước. Hàng đợi tải lên vẫn chạy bằng token của người mới.
- Màn chấm (`giao-vien/cham`):
  - Ô điểm trống lưu thành 0.
  - Danh sách chờ chấm có thể bỏ sót học sinh khi tải lại.
  - Lưu xong lưới chấm không tự cập nhật.
- Hàng đợi tải lên:
  - Lỗi 401 hoặc file đã mất thì thử lại mãi mãi, màn hình hiện "Đang gửi…" không dứt.
  - Trên web, `blob:` URL mất sau khi tải lại trang, nên lưu offline thực chất không hoạt động.
  - Không dọn file tạm.
- Chưa có chọn ảnh từ thư viện. Trên Expo Web, camera dùng camera sau, mà laptop không có camera sau.

### 1.3 API còn thiếu cho một trường dùng thật

| Đối tượng | Hiện có | Thiếu |
|---|---|---|
| Trường | Tạo | Liệt kê, sửa, khoá; gán thêm quản trị trường |
| Thành viên trường | Thêm giáo viên, nhập Excel | Khoá/cho nghỉ, sửa thông tin, **cấp/thu quyền `admin`** (hiện không có cách có quản trị trường thứ 2) |
| Năm học | Tạo | Sửa, đặt năm hiện tại, lưu trữ |
| Lớp | Tạo | Sửa tên, **đổi chủ nhiệm**, lưu trữ, lên lớp năm sau |
| Học sinh | Thêm, nhập Excel, đặt PIN, cấp thẻ | Sửa, **cho nghỉ**, **chuyển lớp**, xem/gỡ phụ huynh liên kết |
| Bài giao | Tạo, giao lại | **Sửa, huỷ, gia hạn, huỷ bài hẹn giờ** |

Lỗi phân quyền: `requireClassStaff` (`apps/api/src/modules/org/application/access.service.ts:79`) cho mọi `guardian_owner` quản lý mọi lớp, nhưng không giới hạn ở trường `kind=family`.

---

## 2. Mô hình phân quyền mục tiêu

| Vai trò | Phạm vi | Trang chính (web) | Trang chính (app) |
|---|---|---|---|
| Quản trị hệ thống | Mọi trường | **`/quan-tri`** (mới): danh sách trường, tạo/khoá trường, gán quản trị trường, hợp đồng | — |
| Quản trị trường (`admin`) | Một trường | `/truong/[id]`: năm học, lớp, giáo viên & vai trò, học sinh, phân công, nhập, báo cáo, nhật ký, cài đặt | Trang giáo viên |
| Chủ nhiệm | Lớp mình | `/lop/[id]`: học sinh, thẻ, phiếu mời, PIN, chuyển lớp (đề xuất) | Trang giáo viên |
| Giáo viên bộ môn | Lớp–môn được phân công | `/day/[taId]`, `/bai/[id]` | `/giao-vien` |
| Phụ huynh | Con mình | `/gia-dinh`, `/thong-bao` | `/phu-huynh` |
| Phụ huynh chủ "không gian gia đình" (`guardian_owner`) | Chỉ trường `kind=family` của mình | `/gia-dinh`, `/day/[taId]` | `/phu-huynh`, `/giao-vien` |
| Học sinh | Bài của mình | `/hoc-sinh` (**thật**) | `/hoc-sinh` |

Nguyên tắc:
- **API là nơi chặn quyền thật.** Giao diện chỉ ẩn những thứ không được làm, để người dùng không gặp lỗi 403.
- Web có `GET /v1/me` trả `isSystemAdmin` cùng vai trò ở từng trường. Menu và route guard dựa trên thông tin đó.

---

## 3. Lộ trình đề xuất (theo thứ tự)

### Giai đoạn A — Sửa lỗi nguy hiểm (nhỏ, làm trước)

> **Đã xong (25/11/2026).** Chốt theo phương án đề xuất ở mục 4.
> - `parseScoreInput` (domain) dùng chung cho web và app.
> - `rolesIn` bỏ `guardian_owner` ở trường không phải `kind=family`.
> - API mới `GET /v1/billing/payment-methods`.
> - Hỏi xác nhận khi cấp thẻ/phiếu, khi đổi hoặc bỏ phân công; đặt PIN bằng form.
> - Phím tắt màn chấm web.
> - App:
>   - `SessionWatcher` xoá cache khi đổi tài khoản và về màn gốc khi mất phiên.
>   - Màn lỗi của học sinh có nút thoát qua Cổng phụ huynh.
>   - Ẩn nút "Đã xong" bài luyện tập với phụ huynh.
>   - Màn chấm chốt danh sách chờ, lưu xong làm mới lưới chấm.
> - Hàng đợi tải lên: `unauthenticated` và `file_missing` dừng hẳn và báo; mỗi việc gắn `ownerId`.
>
> Test: domain 61, upload-queue 8, API 86 đều đạt. Thêm test cho `guardian_owner` (đã thử gỡ bản sửa để chắc test bắt được lỗi) và cho `payment-methods`.
1. Ô điểm trống không được lưu thành 0. Kiểm thang 0–10, bước 0,25 ở client (`web bai/[id]:74`, `mobile cham/[id]:88`) **và** ở `evaluateSchema`.
2. `requireClassStaff`: chỉ cho `guardian_owner` khi trường có `kind=family`. Thêm test phân quyền.
3. Bỏ `provider: 'fake'` viết cứng ở `gia-dinh:58`, lấy danh sách cổng thanh toán từ API.
4. Hỏi xác nhận trước khi cấp lại thẻ, phiếu mời cả lớp và đổi phân công. Đặt PIN bằng form thay cho `window.prompt`.
5. Phím tắt màn chấm web: Enter/R chỉ chạy khi con trỏ không nằm trên một nút.
6. App:
   - Đăng xuất thì xoá cache React Query và huỷ hàng đợi tải lên của người cũ.
   - Phiên bị xoá thì tự chuyển về màn đăng nhập.
   - Màn lỗi của học sinh có nút thoát.
   - Ẩn nút "Đã xong" bài luyện tập với phụ huynh.
7. Hàng đợi tải lên: lỗi 401 hoặc file mất thì dừng và báo lỗi thay vì thử lại mãi.

### Giai đoạn B — Cổng học sinh web dùng dữ liệu thật

> **Đã xong (25/11/2026).**
> - `apps/web/src/lib/student-api.ts`: gọi API bằng phiên học sinh, tự refresh token. Phiên hết thì về `/dang-nhap-hoc-sinh`.
> - Ánh xạ `/student/me` và `/student/assignments` sang dữ liệu của Cổng Học sinh. Mở bài thì nạp đề, cách nộp, nhận xét, ảnh đề gốc, lời dặn ghi âm.
> - Nộp bài: tải lên kho (một lần, hoặc theo phần với file lớn), rồi `complete` và `submissions`. Gửi lại sau lỗi thì file đã lên kho không phải tải lại.
> - Chọn nhiều ảnh, có giới hạn `maxPhotos`. Ghi âm đúng loại file (webm hoặc mp4 trên Safari). Bài tự luyện có nút "Con làm xong rồi".
> - `/trai-nghiem?che-do=nhi|teen` là bản demo. Link cũ `/hoc-sinh?demo=` tự chuyển sang đây. Bỏ menu "Học sinh (demo)" của người lớn.
> - Ô mã thẻ nhận cả chuỗi `nopi://student-card/…` từ đầu đọc QR cắm USB; Enter là đăng nhập.
> - Đã thử đầu-cuối bằng Chrome headless trên Docker: đăng nhập thẻ → trang chủ thật → mở bài → chọn ảnh → gửi → DB có bài `submitted`, không có lỗi JS.
>
> Còn lại:
> - Sticker ở tab "Sticker của con" lấy bằng cách nạp chi tiết tối đa 30 bài đã chấm. Nên thêm `sticker` vào API danh sách bài để bỏ các lần gọi này.
> - Nộp bài trên web chưa có hàng đợi offline như app (tải lại trang giữa chừng thì phải chọn lại ảnh).
- `/hoc-sinh`:
  - Không có phiên học sinh thì chuyển về `/dang-nhap-hoc-sinh`.
  - Có phiên thì gọi `GET /student/me`, `GET /student/assignments` và `GET /student-assignments/:id`, rồi nộp bài qua `uploads` + `submissions` (dùng lại cách tải lên của app).
- Bản demo chuyển sang `/trai-nghiem?che-do=nhi|teen`, có dải ghi rõ "Bản trải nghiệm". Link ở trang đăng nhập và `/mon-hoc` trỏ về đây.
- Đăng xuất học sinh thì về `/dang-nhap-hoc-sinh`, không về trang đăng nhập người lớn.
- Ghi chú: giao diện Nhí/Teen giữ nguyên, chỉ thay nguồn dữ liệu (`StudentPortalData` ánh xạ từ API).

### Giai đoạn C — Trang quản trị hệ thống `/quan-tri`

> **Đã xong (25/11/2026).**
> - Migration `0013_school_status` thêm `schools.status` (`active` | `locked`).
> - API mới, chỉ quản trị hệ thống dùng được, mọi thay đổi ghi `audit_logs`:
>   - `GET /admin/schools?q=&status=&page=`
>   - `GET` và `PATCH /admin/schools/:id` (đổi tên, khoá/mở)
>   - `POST /admin/schools/:id/admins`
>   - `DELETE /admin/schools/:id/admins/:userId` (không gỡ được quản trị cuối cùng)
> - **Khoá trường** chặn ở chỗ kiểm quyền trung tâm (`AccessService.rolesIn`, `requireSchoolActive`, `TeachingReader.requireCanAssign/Grade`):
>   - Quản trị và giáo viên của trường không giao bài, chấm bài hay quản lý lớp được.
>   - Học sinh và phụ huynh vẫn xem được bài cũ; dữ liệu giữ nguyên.
>   - Quản trị hệ thống vẫn vào hỗ trợ được.
> - Web:
>   - `/quan-tri`: tìm, lọc, phân trang, tạo trường kèm quản trị.
>   - `/quan-tri/[id]`: đổi tên, khoá/mở, thêm/gỡ quản trị, mở gói theo số hợp đồng.
>   - Menu "Quản trị hệ thống" chỉ hiện với quản trị hệ thống.
> - Test e2e `admin-schools.e2e.test.ts` (3 ca). Đã bấm thử trọn luồng bằng Chrome headless trên Docker.
>
> Còn lại (đưa vào giai đoạn E):
> - Trường bị khoá vẫn hiện trong "Trường của tôi" của nhân sự; vào trang trường thì chỉ thấy lỗi 403 ("Trường đang tạm khoá…") ở từng tab. Nên trả `status` trong `/me/schools` và hiện một thông báo rõ ràng.
> - Việc chạy nền (nhắc bài 18:00, tổng hợp 20:00) vẫn chạy với các bài đang mở của trường bị khoá.
- API mới (mô-đun `org`, chỉ quản trị hệ thống):
  - `GET /admin/schools` (tìm kiếm, phân trang)
  - `GET /admin/schools/:id`
  - `PATCH /admin/schools/:id` (tên, khoá/mở)
  - `POST /admin/schools/:id/admins`, `DELETE /admin/schools/:id/admins/:userId`
- Web có 2 màn:
  - Danh sách trường: số lớp, số học sinh, trạng thái hợp đồng.
  - Chi tiết trường: thông tin, quản trị trường, hợp đồng (dùng lại `POST /admin/schools/:id/subscriptions`).
- Mọi thao tác ghi `audit_logs`.

### Giai đoạn D — Quản trị trường đầy đủ (API + web)
1. **Thành viên:**
   - Khoá/mở giáo viên.
   - Sửa tên, SĐT.
   - Cấp/thu quyền `admin`, không cho thu quyền của quản trị cuối cùng.
   - Tab «Giáo viên» thêm cột thao tác.
2. **Năm học:** đặt năm hiện tại, lưu trữ.
3. **Lớp:** sửa tên, đổi chủ nhiệm, lưu trữ lớp (không xoá cứng, vì còn bài nộp và nhận xét).
4. **Học sinh:**
   - Sửa thông tin.
   - Cho nghỉ (soft: thu thẻ và phiên đăng nhập, giữ lịch sử).
   - Chuyển lớp: kết thúc `enrollment` cũ, tạo `enrollment` mới. Bài cũ giữ ở lớp cũ.
   - Xem phụ huynh đã liên kết.
5. **Bài giao:**
   - Sửa tiêu đề, hướng dẫn, hạn nộp.
   - Gia hạn.
   - Huỷ bài hẹn giờ hoặc bài chưa có em nộp.
   - Thông báo cho học sinh khi đổi hạn.
6. Giáo viên bộ môn chỉ thấy các lớp mình dạy trong `/truong/[id]`.

### Giai đoạn E — Điều hướng theo vai trò
- **Web:**
  - Menu `Shell` dựng từ `GET /me`: Quản trị hệ thống / Trường của tôi / Lớp đang dạy / Gia đình / Thông báo.
  - Bỏ menu "Học sinh (demo)".
  - Thêm breadcrumb `Trường › Lớp › Môn › Bài` cho `/lop`, `/day`, `/bai`.
  - Thông báo bài nộp, làm lại… có link tới đúng `/bai/[id]`.
  - Menu gọn trên điện thoại.
- **App:**
  - Màn `index` chọn trang chủ theo vai trò: giáo viên vào `/giao-vien` (có đăng xuất và hộp thư), phụ huynh vào `/phu-huynh`. Người có cả hai vai trò thì có nút chuyển.
  - "Giao bài mới" cho chọn môn khi giáo viên dạy nhiều môn.

### Giai đoạn F — API đã có nhưng chưa có giao diện, và chất lượng app
- **Web:**
  - Hồ sơ cá nhân, đổi mật khẩu.
  - Phụ huynh liên kết con bằng mã mời, đồng ý (consent), xem/thu hồi các máy con đang đăng nhập.
  - Quản lý mẫu nhận xét.
  - Nhận xét bằng giọng nói.
  - Đính kèm ảnh/ghi âm khi giao bài.
- **App:**
  - Chọn ảnh từ thư viện (`expo-image-picker`).
  - Trên web: cho chọn file thay camera, ẩn nút quay video.
  - Lưu bản nháp ảnh xuống đĩa.
  - Dọn file tạm.
  - Xin quyền camera bị từ chối thì mở Cài đặt.
  - Sửa vòng `giao-bai ⇄ quet-de` (đang tạo 2 màn giao bài chồng nhau).
  - Hạn "tối nay" sau 21:00 không được rơi vào quá khứ.

---

## 4. Cần chốt trước khi code

1. **Bản demo học sinh**:
   - (a) chuyển sang `/trai-nghiem`, `/hoc-sinh` chỉ còn dữ liệu thật (đề xuất); hay
   - (b) bỏ hẳn demo.
2. **Học sinh nghỉ hoặc chuyển trường**: chỉ "cho nghỉ" (giữ dữ liệu theo thời hạn lưu) hay cần xoá hẳn? Liên quan Luật BVDLCN.
3. **Sửa bài đã giao** khi đã có em nộp:
   - (a) chỉ cho gia hạn và sửa hướng dẫn (đề xuất); hay
   - (b) cho sửa mọi thứ.
4. **Ai được cấp quyền quản trị trường**:
   - (a) quản trị hệ thống và quản trị trường hiện tại (đề xuất); hay
   - (b) chỉ quản trị hệ thống.
5. **Thứ tự giai đoạn**: A → B → C → D → E → F, hay ưu tiên C/D (quản trị) trước B (học sinh web)?

Mỗi giai đoạn làm thành một nhánh/PR riêng, kèm test phân quyền cho mọi API mới.
