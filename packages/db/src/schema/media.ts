// Mô-đun sở hữu: media — file trong object storage, tải thẳng từ app bằng URL ký sẵn
import { sql } from 'drizzle-orm';
import { bigint, check, date, index, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, inList, pk } from './_common.js';
import { MEDIA_KINDS, MEDIA_STATUSES } from './enums.js';
import { students, users } from './identity.js';
import { schools } from './org.js';

export const mediaFiles = pgTable(
  'media_files',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    kind: text().notNull(),
    storageKey: text().notNull().unique(),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }),
    durationS: numeric({ precision: 6, scale: 1, mode: 'number' }),
    thumbnailKey: text(),
    /** Mã phiên tải theo từng phần (video lớn) khi đang tải; xoá khi hoàn tất */
    uploadId: text(),
    status: text().notNull().default('uploading'),
    uploadedBy: uuid().references(() => users.id), // người lớn tải lên (giáo viên, phụ huynh nộp hộ)
    uploadedByStudentId: uuid().references(() => students.id), // học sinh tự tải lên
    deleteAfter: date(), // tính lúc tải lên theo SpaceSettings.retentionDays
    createdAt: createdAt(),
  },
  (t) => [
    check('media_files_kind_chk', inList(t.kind, MEDIA_KINDS)),
    check('media_files_status_chk', inList(t.status, MEDIA_STATUSES)),
    check('media_files_owner_chk', sql`${t.uploadedBy} IS NOT NULL OR ${t.uploadedByStudentId} IS NOT NULL`),
    index('media_files_retention_idx').on(t.deleteAfter),
  ],
);
