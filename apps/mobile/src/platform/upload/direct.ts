import { mediaViewSchema, uploadTicketSchema } from '@nopi/contracts';
import { api } from '../api';
import { queueTransport } from './adapters';

/** Tải ngay một file nhỏ (giáo viên ghi âm nhận xét) — không qua hàng đợi. Trả về mediaId. */
export async function uploadNow(
  path: string,
  file: { localUri: string; kind: 'audio' | 'photo'; mimeType: string; sizeBytes: number; durationS?: number },
  opts: { as?: 'adult' | 'student'; extraBody?: Record<string, unknown> } = {},
) {
  const as = opts.as ?? 'adult';
  const ticket = await api(path, { method: 'POST', as, body: { kind: file.kind, mimeType: file.mimeType, sizeBytes: file.sizeBytes, durationS: file.durationS, ...opts.extraBody }, schema: uploadTicketSchema });
  if (ticket.method !== 'put') throw new Error('File quá lớn');
  await queueTransport.putFile(file, ticket.url, ticket.headers);
  await api(`/media/${ticket.mediaId}/complete`, { method: 'POST', as, body: {}, schema: mediaViewSchema });
  return ticket.mediaId;
}
