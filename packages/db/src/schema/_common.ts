import { sql } from 'drizzle-orm';
import { customType, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/** Khoá chính UUID v7 (sắp theo thời gian) — chỉ mục tốt hơn và phân trang theo con trỏ dễ. */
export const pk = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/** Kiểu citext cho email (không phân biệt hoa thường). Cần extension citext. */
export const citext = customType<{ data: string }>({ dataType: () => 'citext' });

/** Tạo CHECK "cột IN (...)" từ danh sách giá trị TS — một nguồn sự thật cho trạng thái. */
export const inList = (column: AnyPgColumn, values: readonly string[]) =>
  sql`${column} IN ${sql.raw(`(${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')})`)}`;
