'use client';
import { authTokensSchema, errorResponseSchema, type UserProfileDto } from '@nopi/contracts';
import type { z } from 'zod';

/**
 * Gọi API từ trình duyệt qua /api (route handler BFF của Next → API, cùng origin nên không cần CORS).
 * Token người lớn nằm trong cookie httpOnly do BFF quản lý; localStorage chỉ giữ hồ sơ người dùng
 * (accessToken/refreshToken là giá trị giả "__cookie__"). Phiên cũ còn token thật vẫn chạy và tự chuyển ở lần refresh.
 */
export const COOKIE_TOKEN = '__cookie__';
const KEY = 'nopi.web.session';

export interface WebSession {
  accessToken: string;
  refreshToken: string;
  user: UserProfileDto;
}

export const webSession = {
  get(): WebSession | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as WebSession) : null;
    } catch {
      return null;
    }
  },
  set(s: WebSession | null) {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  },
};

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly details?: { path: string; message: string }[]) {
    super(message);
  }
  get friendly() {
    return this.details?.[0]?.message ?? this.message;
  }
}

async function send(path: string, init: RequestInit, auth: boolean) {
  const s = auth ? webSession.get() : null;
  const headers = new Headers(init.headers);
  if (s && s.accessToken !== COOKIE_TOKEN) headers.set('authorization', `Bearer ${s.accessToken}`);
  try {
    return await fetch(`/api/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError('network', 'Mất kết nối, vui lòng kiểm tra mạng');
  }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const s = webSession.get();
  if (!s) return false;
  refreshing ??= (async () => {
    const res = await send('/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) }, false);
    if (!res.ok) {
      webSession.set(null);
      return false;
    }
    webSession.set({ ...s, ...authTokensSchema.parse(await res.json()) });
    return true;
  })().finally(() => (refreshing = null));
  return refreshing;
}

export async function call<T extends z.ZodType = z.ZodUnknown>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData; schema?: T; auth?: boolean } = {},
): Promise<z.infer<T>> {
  const { method = 'GET', body, form, schema, auth = true } = opts;
  const init: RequestInit = { method };
  if (form) init.body = form;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  let res = await send(path, init, auth);
  if (res.status === 401 && auth && (await refresh())) res = await send(path, init, auth);
  if (res.status === 401 && auth) {
    webSession.set(null);
    if (typeof window !== 'undefined' && !location.pathname.startsWith('/dang-nhap')) location.href = '/dang-nhap';
  }
  if (res.status === 204) return undefined as z.infer<T>;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = errorResponseSchema.safeParse(json);
    throw new ApiError(e.data?.error.code ?? 'internal', e.data?.error.message ?? 'Có lỗi xảy ra', e.data?.error.details);
  }
  return (schema ? schema.parse(json) : json) as z.infer<T>;
}

/** Tải file (mẫu Excel) kèm token. */
export async function download(path: string, filename: string) {
  const res = await send(path, {}, true);
  if (!res.ok) throw new ApiError('internal', 'Không tải được file');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.friendly : e instanceof Error ? e.message : String(e));
