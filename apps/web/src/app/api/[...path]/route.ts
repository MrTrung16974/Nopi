import { NextResponse, type NextRequest } from 'next/server';

/**
 * BFF: trình duyệt gọi /api/* (cùng origin) → chuyển tiếp tới API.
 * Phiên NGƯỜI LỚN nằm trong cookie httpOnly (JS trên trang không đọc được → giảm rủi ro XSS lấy token):
 * - Phản hồi đăng nhập/refresh: cất accessToken/refreshToken vào cookie, trả về trình duyệt giá trị giả COOKIE.
 * - Yêu cầu không có header Authorization: gắn access token từ cookie; API báo 401 thì tự refresh một lần rồi gửi lại.
 * Phiên học sinh (refresh token "s.") đi nguyên như cũ.
 */
const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const AT = 'nopi_at';
const RT = 'nopi_rt';
const COOKIE_TOKEN = '__cookie__'; // trùng với lib/client.ts (route handler không được export hằng khác)
const secure = process.env.NODE_ENV === 'production';
const AUTH_PATHS = [/^\/v1\/auth\/otp\/verify$/, /^\/v1\/auth\/google$/, /^\/v1\/auth\/password$/, /^\/v1\/auth\/refresh$/, /^\/v1\/auth\/qr-login\/[^/]+\/poll$/];

type Tokens = { accessToken: string; refreshToken: string; expiresIn?: number };

function setTokens(res: NextResponse, t: Tokens) {
  res.cookies.set(AT, t.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/api', maxAge: t.expiresIn ?? 900 });
  res.cookies.set(RT, t.refreshToken, { httpOnly: true, sameSite: 'lax', secure, path: '/api', maxAge: 90 * 86400 });
}
function clearTokens(res: NextResponse) {
  res.cookies.set(AT, '', { path: '/api', maxAge: 0 });
  res.cookies.set(RT, '', { path: '/api', maxAge: 0 });
}

/** Tìm cặp token người lớn trong JSON (đăng nhập trả thẳng; QR trả trong "auth"). */
function findTokens(json: unknown): { holder: Record<string, unknown>; tokens: Tokens } | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (typeof o.accessToken === 'string' && typeof o.refreshToken === 'string' && o.refreshToken.startsWith('u.')) {
    return { holder: o, tokens: { accessToken: o.accessToken, refreshToken: o.refreshToken, expiresIn: typeof o.expiresIn === 'number' ? o.expiresIn : undefined } };
  }
  return findTokens(o.auth);
}

async function forward(req: NextRequest, path: string, body: ArrayBuffer | undefined, token: string | undefined) {
  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('cookie');
  headers.delete('content-length');
  if (headers.get('authorization') === `Bearer ${COOKIE_TOKEN}`) headers.delete('authorization');
  if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${API}${path}${req.nextUrl.search}`, { method: req.method, headers, body, redirect: 'manual' });
}

/**
 * Trang mở nhiều yêu cầu cùng lúc khi access token vừa hết hạn → tất cả cùng refresh bằng MỘT refresh token.
 * Token xoay vòng nên chỉ lần đầu thành công → gộp: các yêu cầu cùng refresh token dùng chung kết quả trong 30 giây.
 */
const inflight = new Map<string, { at: number; p: Promise<Tokens | null> }>();
function refreshWith(rt: string): Promise<Tokens | null> {
  const now = Date.now();
  for (const [k, v] of inflight) if (now - v.at > 30_000) inflight.delete(k);
  const hit = inflight.get(rt);
  if (hit) return hit.p;
  const p = fetch(`${API}/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) })
    .then(async (r) => (r.ok ? ((await r.json()) as Tokens) : null))
    .catch(() => null);
  inflight.set(rt, { at: now, p });
  return p;
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const path = `/${(await ctx.params).path.join('/')}`;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
  const cookieAt = req.cookies.get(AT)?.value;
  const cookieRt = req.cookies.get(RT)?.value;
  const usesCookie = !req.headers.has('authorization') || req.headers.get('authorization') === `Bearer ${COOKIE_TOKEN}`;

  // Refresh do trình duyệt gọi với giá trị giả → thay bằng refresh token trong cookie
  if (path === '/v1/auth/refresh' && body) {
    try {
      const j = JSON.parse(new TextDecoder().decode(body)) as { refreshToken?: string };
      if (j.refreshToken === COOKIE_TOKEN) {
        const t = cookieRt ? await refreshWith(cookieRt) : null;
        if (!t) {
          const res = NextResponse.json({ error: { code: 'unauthenticated', message: 'Bạn cần đăng nhập lại' } }, { status: 401 });
          clearTokens(res);
          return res;
        }
        const res = NextResponse.json({ ...t, accessToken: COOKIE_TOKEN, refreshToken: COOKIE_TOKEN });
        setTokens(res, t);
        return res;
      }
    } catch {
      /* để API báo lỗi */
    }
  }

  let upstream = await forward(req, path, body, usesCookie ? cookieAt : undefined);
  let renewed: Tokens | null = null;
  if (upstream.status === 401 && usesCookie && cookieRt && !path.startsWith('/v1/auth/')) {
    renewed = await refreshWith(cookieRt);
    if (renewed) upstream = await forward(req, path, body, renewed.accessToken);
  }

  const type = upstream.headers.get('content-type') ?? '';
  let res: NextResponse;
  if (type.includes('application/json') && AUTH_PATHS.some((re) => re.test(path))) {
    const json: unknown = await upstream.json().catch(() => null);
    const found = upstream.ok ? findTokens(json) : null;
    if (found) {
      found.holder.accessToken = COOKIE_TOKEN;
      found.holder.refreshToken = COOKIE_TOKEN;
    }
    res = NextResponse.json(json, { status: upstream.status });
    if (found) setTokens(res, found.tokens);
    if (!upstream.ok && path === '/v1/auth/refresh') clearTokens(res);
  } else {
    const headers = new Headers();
    for (const h of ['content-type', 'content-disposition', 'cache-control', 'retry-after']) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    res = new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), { status: upstream.status, headers });
  }
  if (renewed) setTokens(res, renewed);
  if (path === '/v1/auth/logout') clearTokens(res);
  return res;
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const dynamic = 'force-dynamic';
