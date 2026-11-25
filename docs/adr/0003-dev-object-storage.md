# ADR 0003 — MinIO làm object storage cho môi trường dev

- Trạng thái: Chấp nhận · 24/11/2026

## Bối cảnh
Image `minio/minio` không còn kéo được công khai từ Docker Hub/Quay.

## Quyết định
Dev dùng MinIO qua image `cgr.dev/chainguard/minio` (bản build của Chainguard, vẫn cập nhật theo bản phát hành MinIO), cổng S3 9000, console 9001. Code chỉ nói chuyện qua interface `ObjectStorage` (API chuẩn S3), nên staging/production dùng kho lưu trữ chuẩn S3 đặt tại Việt Nam mà không đổi nghiệp vụ.

## Phương án dự phòng
Nếu image Chainguard ngừng cung cấp: `bitnamilegacy/minio` (đã lưu trữ, không còn cập nhật) hoặc SeaweedFS (`chrislusf/seaweedfs`, cổng S3 8333).
