import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = PostgresJsDatabase<typeof schema>;
/** Kiểu transaction, để use case nhận "db hoặc tx" như nhau. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbOrTx = Database | Tx;

export interface DbHandle {
  db: Database;
  close(): Promise<void>;
}

export function createDb(url: string, opts: { max?: number } = {}): DbHandle {
  const sql = postgres(url, {
    max: opts.max ?? 10,
    // Ngày (date) giữ dạng chuỗi 'YYYY-MM-DD' để không lệch múi giờ
    types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } },
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema, casing: 'snake_case' });
  return { db, close: () => sql.end({ timeout: 5 }) };
}
