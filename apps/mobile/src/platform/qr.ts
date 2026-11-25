import { normalizeCode } from '@nopi/domain';

/** Nội dung mã QR do Nopi in ra (khớp với API: guardian-invites, login-cards, qr-login). */
export type NopiQr =
  | { kind: 'invite'; code: string }
  | { kind: 'student-card'; code: string }
  | { kind: 'qr-login'; loginId: string };

export function parseNopiQr(data: string): NopiQr | null {
  const m = data.trim().match(/^nopi:\/\/(invite|student-card|qr-login)\/([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  if (m[1] === 'qr-login') return { kind: 'qr-login', loginId: m[2]! };
  return { kind: m[1] as 'invite' | 'student-card', code: normalizeCode(m[2]!) };
}
