import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  claimInviteSchema,
  consentSchema,
  setPasswordSchema,
  updateProfileSchema,
  type MeResponse,
} from '@nopi/contracts';
import type { z } from 'zod';
import { CurrentUser, ZodPipe, type UserActor } from '../../../platform/index.js';
import { AuthService } from '../application/auth.service.js';
import { GuardianService } from '../application/guardian.service.js';
import { toProfile, UserDirectory } from '../application/user-directory.js';

/** Tài khoản người lớn đang đăng nhập + các việc phụ huynh làm cho con. */
@Controller('me')
export class MeController {
  constructor(
    private readonly directory: UserDirectory,
    private readonly auth: AuthService,
    private readonly guardians: GuardianService,
  ) {}

  @Get()
  async me(@CurrentUser() actor: UserActor): Promise<MeResponse> {
    const user = await this.directory.get(actor.userId);
    return { ...toProfile(user), children: await this.guardians.listChildren(actor.userId) };
  }

  @Patch()
  updateProfile(@CurrentUser() actor: UserActor, @Body(new ZodPipe(updateProfileSchema)) b: z.infer<typeof updateProfileSchema>) {
    return this.auth.updateProfile(actor.userId, b.fullName);
  }

  @Put('password')
  @HttpCode(204)
  async setPassword(@CurrentUser() actor: UserActor, @Body(new ZodPipe(setPasswordSchema)) b: z.infer<typeof setPasswordSchema>) {
    await this.auth.setPassword(actor.userId, b.password);
  }

  // ----- Con của tôi -----
  @Post('children/claim')
  @HttpCode(200)
  claim(@CurrentUser() actor: UserActor, @Body(new ZodPipe(claimInviteSchema)) b: z.infer<typeof claimInviteSchema>) {
    return this.guardians.claimInvite(actor, b.code, b.relationship);
  }

  @Post('children/:studentId/consent')
  @HttpCode(204)
  async consent(
    @CurrentUser() actor: UserActor,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(new ZodPipe(consentSchema)) _b: z.infer<typeof consentSchema>,
  ) {
    await this.guardians.consent(actor, studentId);
  }

  /** "Cho con học" — mở chế độ học sinh trên máy bố mẹ. */
  @Post('children/:studentId/session')
  @HttpCode(200)
  startChild(@CurrentUser() actor: UserActor, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.guardians.startChildSession(actor, studentId);
  }

  @Get('children/:studentId/sessions')
  childSessions(@CurrentUser() actor: UserActor, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.guardians.listChildSessions(actor, studentId);
  }

  @Delete('children/:studentId/sessions/:sessionId')
  @HttpCode(204)
  async revokeChild(
    @CurrentUser() actor: UserActor,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    await this.guardians.revokeChildSession(actor, studentId, sessionId);
  }
}
