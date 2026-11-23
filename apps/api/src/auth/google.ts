import { HttpException, Injectable } from '@nestjs/common';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import type { GoogleProfile } from './auth.service';

export const googleConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'not-configured',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'not-configured',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(_access: string, _refresh: string, profile: Profile): GoogleProfile {
    const e = profile.emails?.[0] as { value: string; verified?: boolean | string } | undefined;
    return {
      id: profile.id,
      email: e?.value,
      emailVerified: e?.verified === true || e?.verified === 'true' || (profile._json as any)?.email_verified === true,
      name: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
    };
  }
}

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  canActivate(ctx: import('@nestjs/common').ExecutionContext) {
    if (!googleConfigured()) throw new HttpException({ code: 'GOOGLE_NOT_CONFIGURED', message: 'Google sign-in is not configured' }, 501);
    return super.canActivate(ctx);
  }
}
