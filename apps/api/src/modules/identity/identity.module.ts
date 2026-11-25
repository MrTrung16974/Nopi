import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../platform/index.js';
import { AuthService } from './application/auth.service.js';
import { GuardianService } from './application/guardian.service.js';
import { OtpService } from './application/otp.service.js';
import { QrWebLoginService } from './application/qr-web-login.service.js';
import { SessionsService } from './application/sessions.service.js';
import { StudentCredentialsService } from './application/student-credentials.service.js';
import { StudentDirectory } from './application/student-directory.js';
import { UserDirectory } from './application/user-directory.js';
import { AuthController } from './http/auth.controller.js';
import { MeController } from './http/me.controller.js';
import { GOOGLE_VERIFIER, JoseGoogleVerifier } from './ports/google-verifier.js';
import { createOtpSender, OTP_SENDER } from './ports/otp-sender.js';

@Module({
  controllers: [AuthController, MeController],
  providers: [
    { provide: OTP_SENDER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => createOtpSender(c.OTP_CHANNELS) },
    { provide: GOOGLE_VERIFIER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => new JoseGoogleVerifier(c.GOOGLE_CLIENT_IDS) },
    OtpService,
    SessionsService,
    UserDirectory,
    AuthService,
    QrWebLoginService,
    StudentDirectory,
    GuardianService,
    StudentCredentialsService,
  ],
  exports: [UserDirectory, StudentDirectory, GuardianService, StudentCredentialsService],
})
export class IdentityModule {}
