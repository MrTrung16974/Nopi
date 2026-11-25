import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { AppError } from '../http/app-error.js';
import type { Actor, StudentActor, UserActor } from './actor.js';

export const IS_PUBLIC = Symbol('IS_PUBLIC');
/** Endpoint không cần đăng nhập (đăng nhập, OTP, health…). Mặc định mọi endpoint đều cần. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

type ActorRequest = { actor?: Actor };

/** Lấy Actor của request. */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const actor = ctx.switchToHttp().getRequest<ActorRequest>().actor;
  if (!actor) throw new AppError('unauthenticated', 'Bạn cần đăng nhập');
  return actor;
});

/** Chỉ người lớn (phụ huynh, giáo viên, quản trị) được gọi. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): UserActor => {
  const actor = ctx.switchToHttp().getRequest<ActorRequest>().actor;
  if (!actor) throw new AppError('unauthenticated', 'Bạn cần đăng nhập');
  if (actor.kind !== 'user') throw new AppError('forbidden', 'Chức năng này dành cho bố mẹ hoặc thầy cô');
  return actor;
});

/** Chỉ phiên học sinh được gọi. */
export const CurrentStudent = createParamDecorator((_: unknown, ctx: ExecutionContext): StudentActor => {
  const actor = ctx.switchToHttp().getRequest<ActorRequest>().actor;
  if (!actor) throw new AppError('unauthenticated', 'Bạn cần đăng nhập');
  if (actor.kind !== 'student') throw new AppError('forbidden', 'Chức năng này dành cho học sinh');
  return actor;
});
