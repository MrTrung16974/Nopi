import { Inject, Injectable } from '@nestjs/common';
import { TTL } from '@nopi/domain';
import { jwtVerify, SignJWT, errors as joseErrors } from 'jose';
import { CLOCK, type Clock } from '../clock.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { AppError } from '../http/app-error.js';
import type { Actor } from './actor.js';

const ISSUER = 'nopi';

/** Access token JWT ngắn hạn (15 phút). Refresh token là chuỗi ngẫu nhiên lưu hash trong CSDL. */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(config.JWT_SECRET);
  }

  async signAccess(actor: Actor): Promise<{ accessToken: string; expiresIn: number }> {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const claims =
      actor.kind === 'user'
        ? { knd: 'u', sid: actor.sessionId, sa: actor.isSystemAdmin || undefined }
        : { knd: 's', sid: actor.sessionId };
    const accessToken = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setSubject(actor.kind === 'user' ? actor.userId : actor.studentId)
      .setIssuedAt(now)
      .setExpirationTime(now + TTL.accessToken)
      .sign(this.key);
    return { accessToken, expiresIn: TTL.accessToken };
  }

  async verifyAccess(token: string): Promise<Actor> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: ['HS256'],
        currentDate: this.clock.now(),
      });
      const sub = payload.sub!;
      const sid = payload.sid as string;
      if (payload.knd === 'u') return { kind: 'user', userId: sub, sessionId: sid, isSystemAdmin: payload.sa === true };
      if (payload.knd === 's') return { kind: 'student', studentId: sub, sessionId: sid };
      throw new Error('unknown kind');
    } catch (err) {
      const expired = err instanceof joseErrors.JWTExpired;
      throw new AppError('unauthenticated', expired ? 'Phiên đăng nhập đã hết hạn' : 'Bạn cần đăng nhập lại');
    }
  }
}
