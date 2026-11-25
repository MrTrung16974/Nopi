import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

/**
 * Cổng kho media chuẩn S3. App tải thẳng lên kho bằng URL ký sẵn — file không đi qua API.
 * Đổi nhà cung cấp (MinIO dev, kho S3 tại Việt Nam ở production) chỉ là đổi cấu hình.
 */
export interface ObjectStorage {
  presignPut(key: string, contentType: string, contentLength: number, expiresIn: number): Promise<string>;
  createMultipart(key: string, contentType: string): Promise<string>;
  presignPart(key: string, uploadId: string, partNumber: number, expiresIn: number): Promise<string>;
  listParts(key: string, uploadId: string): Promise<{ partNumber: number; etag: string; size: number }[]>;
  completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void>;
  /** Huỷ lượt tải theo phần bỏ dở (giải phóng các phần đã lên kho). */
  abortMultipart(key: string, uploadId: string): Promise<void>;
  /** downloadName: trình duyệt tải về với tên này (Content-Disposition: attachment). */
  presignGet(key: string, expiresIn: number, downloadName?: string): Promise<string>;
  /** Kích thước object, null nếu chưa có. */
  head(key: string): Promise<{ size: number; contentType?: string } | null>;
  download(key: string, toPath: string): Promise<void>;
  upload(key: string, fromPath: string, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface S3Options {
  endpoint: string;
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  /** Client riêng để ký URL bằng địa chỉ máy người dùng truy cập được (vd. IP LAN). */
  private readonly signer: S3Client;

  constructor(private readonly o: S3Options) {
    const base = { region: o.region, forcePathStyle: true, credentials: { accessKeyId: o.accessKey, secretAccessKey: o.secretKey } };
    this.client = new S3Client({ ...base, endpoint: o.endpoint });
    this.signer = new S3Client({ ...base, endpoint: o.publicEndpoint ?? o.endpoint });
  }

  async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.o.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.o.bucket }));
    }
  }

  presignPut(key: string, contentType: string, contentLength: number, expiresIn: number) {
    return getSignedUrl(this.signer, new PutObjectCommand({ Bucket: this.o.bucket, Key: key, ContentType: contentType, ContentLength: contentLength }), {
      expiresIn,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  }

  async createMultipart(key: string, contentType: string) {
    const r = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.o.bucket, Key: key, ContentType: contentType }));
    return r.UploadId!;
  }

  presignPart(key: string, uploadId: string, partNumber: number, expiresIn: number) {
    return getSignedUrl(this.signer, new UploadPartCommand({ Bucket: this.o.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn });
  }

  async listParts(key: string, uploadId: string) {
    const r = await this.client.send(new ListPartsCommand({ Bucket: this.o.bucket, Key: key, UploadId: uploadId }));
    return (r.Parts ?? []).map((p) => ({ partNumber: p.PartNumber!, etag: p.ETag!, size: p.Size ?? 0 }));
  }

  async abortMultipart(key: string, uploadId: string) {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.o.bucket, Key: key, UploadId: uploadId }));
  }

  async completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.o.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
      }),
    );
  }

  presignGet(key: string, expiresIn: number, downloadName?: string) {
    const disposition = downloadName ? `attachment; filename="${downloadName.replace(/[^\w.-]/g, '_')}"` : undefined;
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.o.bucket, Key: key, ResponseContentDisposition: disposition }), { expiresIn });
  }

  async head(key: string) {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.o.bucket, Key: key }));
      return { size: r.ContentLength ?? 0, contentType: r.ContentType };
    } catch {
      return null;
    }
  }

  async download(key: string, toPath: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.o.bucket, Key: key }));
    await pipeline(r.Body as Readable, createWriteStream(toPath));
  }

  async upload(key: string, fromPath: string, contentType: string) {
    const { size } = await import('node:fs/promises').then((fs) => fs.stat(fromPath));
    await this.client.send(new PutObjectCommand({ Bucket: this.o.bucket, Key: key, Body: createReadStream(fromPath), ContentType: contentType, ContentLength: size }));
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.o.bucket, Key: key }));
  }
}
