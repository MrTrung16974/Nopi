import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/** Cổng xác minh Google ID token (Google Sign-In / OpenID Connect). */
export interface GoogleVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}
export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER');

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export class JoseGoogleVerifier implements GoogleVerifier {
  constructor(private readonly clientIds: string[]) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (this.clientIds.length === 0) throw new Error('Chưa cấu hình GOOGLE_CLIENT_IDS');
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: this.clientIds,
    });
    return {
      sub: payload.sub!,
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  }
}

/** Test: token dạng "google:<sub>:<email>:<name>" */
export class FakeGoogleVerifier implements GoogleVerifier {
  async verify(idToken: string): Promise<GoogleIdentity> {
    const [prefix, sub, email, name] = idToken.split(':');
    if (prefix !== 'google' || !sub) throw new Error('invalid');
    return { sub, email: email || null, emailVerified: Boolean(email), name: name || null };
  }
}
