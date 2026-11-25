import { authTokensSchema, errorResponseSchema } from '@nopi/contracts';
import type { z } from 'zod';
import { session } from './session';

/**
 * Địa chỉ API. Máy ảo Android dùng http://10.0.2.2:3000; máy thật dùng IP LAN của máy dev.
 * Đặt trong .env của app: EXPO_PUBLIC_API_URL=...
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
  /** Lỗi kiểm tra từng ô (vd. "Mã PIN dễ đoán quá…") nếu có, không thì thông báo chung. */
  get friendly() {
    return this.details?.[0]?.message ?? this.message;
  }
}

export type As = 'adult' | 'student' | 'none';

interface Options<T extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  as?: As;
  schema?: T;
}

async function raw(path: string, method: string, body: unknown, token?: string) {
  try {
    return await fetch(`${API_URL}/v1${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('network', 'Mạng đang yếu, đợi một chút rồi thử lại nhé');
  }
}

const refreshing = new Map<string, Promise<boolean>>();

/** Đổi refresh token; nhiều request cùng hết hạn thì chỉ refresh một lần. */
async function refresh(role: 'adult' | 'student'): Promise<boolean> {
  const current = role === 'adult' ? session.get().adult : session.get().student;
  if (!current) return false;
  const existing = refreshing.get(role);
  if (existing) return existing;
  const p = (async () => {
    const res = await raw('/auth/refresh', 'POST', { refreshToken: current.refreshToken });
    if (!res.ok) {
      if (role === 'adult') await session.setAdult(null);
      else await session.setStudent(null);
      return false;
    }
    await session.updateTokens(role, authTokensSchema.parse(await res.json()));
    return true;
  })().finally(() => refreshing.delete(role));
  refreshing.set(role, p);
  return p;
}

/** Gọi API theo vai (người lớn/học sinh), tự làm mới token khi hết hạn, kiểm tra response bằng schema. */
export async function api<T extends z.ZodType = z.ZodUnknown>(path: string, opts: Options<T> = {}): Promise<z.infer<T>> {
  const { method = 'GET', body, as = 'adult', schema } = opts;
  const token = () =>
    as === 'adult' ? session.get().adult?.accessToken : as === 'student' ? session.get().student?.accessToken : undefined;

  let res = await raw(path, method, body, token());
  if (res.status === 401 && as !== 'none' && (await refresh(as))) {
    res = await raw(path, method, body, token());
  }
  if (res.status === 204) return undefined as z.infer<T>;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = errorResponseSchema.safeParse(json);
    throw new ApiError(
      err.data?.error.code ?? 'internal',
      err.data?.error.message ?? 'Có lỗi xảy ra, vui lòng thử lại',
      res.status,
      err.data?.error.details,
    );
  }
  return (schema ? schema.parse(json) : json) as z.infer<T>;
}

/** Giữ tương thích với code M0 */
export const apiGet = <T extends z.ZodType>(path: string, schema: T) => api(path, { schema, as: 'none' });
