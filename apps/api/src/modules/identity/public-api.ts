// Thứ duy nhất mô-đun khác được import từ identity.
export { IdentityModule } from './identity.module.js';
export { UserDirectory } from './application/user-directory.js';
export { StudentDirectory, type NewStudent } from './application/student-directory.js';
export { GuardianService } from './application/guardian.service.js';
export { StudentCredentialsService, type IssuedCode } from './application/student-credentials.service.js';
// Cổng ra ngoài — để test/cấu hình thay adapter
export { OTP_SENDER, FakeOtpSender, type OtpSender } from './ports/otp-sender.js';
export { GOOGLE_VERIFIER, FakeGoogleVerifier, type GoogleVerifier } from './ports/google-verifier.js';
