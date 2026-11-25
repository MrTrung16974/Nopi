import { errorResponseSchema } from '@nopi/contracts';
import type { z } from 'zod';

const BASE = process.env.API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Gọi API phía server và kiểm tra response bằng schema trong @nopi/contracts. */
export async function apiGet<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate: 300 } });
  const json: unknown = await res.json();
  if (!res.ok) {
    const err = errorResponseSchema.safeParse(json);
    throw new ApiError(err.data?.error.code ?? 'internal', err.data?.error.message ?? 'Có lỗi xảy ra');
  }
  return schema.parse(json);
}
