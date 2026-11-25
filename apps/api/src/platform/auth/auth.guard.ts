import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../http/app-error.js';
import type { Actor } from './actor.js';
import { IS_PUBLIC } from './decorators.js';
import { TokenService } from './token.service.js';

/** Guard toàn cục: mọi endpoint cần access token, trừ khi gắn @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; actor?: Actor }>();
    const header = req.headers.authorization;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (header?.startsWith('Bearer ')) {
      try {
        req.actor = await this.tokens.verifyAccess(header.slice(7));
      } catch (err) {
        if (!isPublic) throw err;
      }
    }
    if (!isPublic && !req.actor) throw new AppError('unauthenticated', 'Bạn cần đăng nhập');
    return true;
  }
}
