import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  googleLoginSchema,
  otpRequestSchema,
  otpVerifySchema,
  passwordLoginSchema,
  qrLoginPollSchema,
  refreshSchema,
  studentCardLoginSchema,
  studentPinLoginSchema,
} from '@nopi/contracts';
import type { z } from 'zod';
import { CurrentActor, CurrentUser, Public, ZodPipe, type Actor, type UserActor } from '../../../platform/index.js';
import { AuthService } from '../application/auth.service.js';
import { OtpService } from '../application/otp.service.js';
import { QrWebLoginService } from '../application/qr-web-login.service.js';
import { SessionsService } from '../application/sessions.service.js';
import { StudentCredentialsService } from '../application/student-credentials.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly qr: QrWebLoginService,
    private readonly studentCreds: StudentCredentialsService,
  ) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body(new ZodPipe(otpRequestSchema)) b: z.infer<typeof otpRequestSchema>) {
    return this.otp.request(b.phone);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body(new ZodPipe(otpVerifySchema)) b: z.infer<typeof otpVerifySchema>) {
    return this.auth.loginWithOtp(b.phone, b.code);
  }

  @Public()
  @Post('google')
  @HttpCode(200)
  google(@Body(new ZodPipe(googleLoginSchema)) b: z.infer<typeof googleLoginSchema>) {
    return this.auth.loginWithGoogle(b.idToken);
  }

  @Public()
  @Post('password')
  @HttpCode(200)
  password(@Body(new ZodPipe(passwordLoginSchema)) b: z.infer<typeof passwordLoginSchema>) {
    return this.auth.loginWithPassword(b.login, b.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshSchema)) b: z.infer<typeof refreshSchema>) {
    return this.sessions.refresh(b.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentActor() actor: Actor) {
    if (actor.kind === 'user') await this.sessions.revokeUserSession(actor.sessionId);
    else await this.sessions.revokeStudentSession(actor.sessionId);
  }

  // ----- Học sinh -----
  @Public()
  @Post('student/card')
  @HttpCode(200)
  studentCard(@Body(new ZodPipe(studentCardLoginSchema)) b: z.infer<typeof studentCardLoginSchema>) {
    return this.studentCreds.loginWithCard(b.code);
  }

  @Public()
  @Post('student/pin')
  @HttpCode(200)
  studentPin(@Body(new ZodPipe(studentPinLoginSchema)) b: z.infer<typeof studentPinLoginSchema>) {
    return this.studentCreds.loginWithPin(b.studentCode, b.pin);
  }

  // ----- Đăng nhập web bằng QR -----
  @Public()
  @Post('qr-login')
  @HttpCode(200)
  qrStart() {
    return this.qr.start();
  }

  @Post('qr-login/:loginId/approve')
  @HttpCode(204)
  async qrApprove(@Param('loginId') loginId: string, @CurrentUser() user: UserActor) {
    await this.qr.approve(loginId, user.userId);
  }

  @Public()
  @Post('qr-login/:loginId/poll')
  @HttpCode(200)
  qrPoll(@Param('loginId') loginId: string, @Body(new ZodPipe(qrLoginPollSchema)) b: z.infer<typeof qrLoginPollSchema>) {
    return this.qr.poll(loginId, b.pollSecret);
  }
}
