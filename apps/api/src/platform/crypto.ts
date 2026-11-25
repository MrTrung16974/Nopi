import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { RandomInt } from '@nopi/domain';

/** Nguồn ngẫu nhiên an toàn cho các hàm sinh mã trong @nopi/domain. */
export const secureRandomInt: RandomInt = (max) => randomInt(max);

/** Token ngẫu nhiên cho refresh token, phiên QR… (base64url, 32 byte) */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Hash một chiều cho token/mã lưu trong CSDL (token có entropy cao nên SHA-256 là đủ). */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
