import { Inject, Injectable } from '@nestjs/common';
import { TTL } from '@nopi/domain';
import type { Redis } from 'ioredis';
import { AppError, randomToken, REDIS, sha256 } from '../../../platform/index.js';
import { AuthService } from './auth.service.js';

interface PendingLogin {
  pollSecretHash: string;
  status: 'pending' | 'approved';
  userId?: string;
}

/**
 * Đăng nhập web bằng cách quét QR từ app (giống Zalo Web):
 * web tạo phiên chờ → hiện QR → app (đã đăng nhập) quét và duyệt → web hỏi lại thì nhận token.
 * pollSecret chỉ trình duyệt đã tạo mới biết, nên người khác chụp QR cũng không lấy được token.
 */
@Injectable()
export class QrWebLoginService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly auth: AuthService,
  ) {}

  private key = (id: string) => `qrl:${id}`;

  async start() {
    const loginId = randomToken(16);
    const pollSecret = randomToken();
    const data: PendingLogin = { pollSecretHash: sha256(pollSecret), status: 'pending' };
    await this.redis.set(this.key(loginId), JSON.stringify(data), 'EX', TTL.qrWebLogin);
    return { loginId, pollSecret, qrPayload: `nopi://qr-login/${loginId}`, expiresIn: TTL.qrWebLogin };
  }

  private async load(loginId: string) {
    const raw = await this.redis.get(this.key(loginId));
    if (!raw) throw new AppError('not_found', 'Mã QR đã hết hạn, vui lòng tải lại trang để lấy mã mới');
    return JSON.parse(raw) as PendingLogin;
  }

  async approve(loginId: string, userId: string) {
    const data = await this.load(loginId);
    if (data.status !== 'pending') throw new AppError('conflict', 'Mã QR này đã được dùng');
    const ttl = await this.redis.ttl(this.key(loginId));
    await this.redis.set(this.key(loginId), JSON.stringify({ ...data, status: 'approved', userId }), 'EX', Math.max(ttl, 5));
  }

  async poll(loginId: string, pollSecret: string) {
    const data = await this.load(loginId);
    if (data.pollSecretHash !== sha256(pollSecret)) throw new AppError('forbidden', 'Không có quyền');
    if (data.status === 'pending') return { status: 'pending' as const };
    // Chỉ cấp token một lần
    const deleted = await this.redis.del(this.key(loginId));
    if (deleted === 0) throw new AppError('conflict', 'Mã QR này đã được dùng');
    return { status: 'approved' as const, auth: await this.auth.issueForQrWeb(data.userId!) };
  }
}
