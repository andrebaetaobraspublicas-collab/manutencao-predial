import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { IssuedSession } from './auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.constants';

export function sessionCookieOptions(config: ConfigService): CookieOptions {
  return { httpOnly: true, secure: String(config.get('COOKIE_SECURE') ?? 'false') === 'true', sameSite: 'lax', domain: config.get<string>('COOKIE_DOMAIN') || undefined, path: '/' };
}

export function writeSessionCookies(response: Response, session: IssuedSession, config: ConfigService): void {
  response.cookie(ACCESS_COOKIE, session.accessToken, { ...sessionCookieOptions(config), maxAge: 15 * 60 * 1000 });
  response.cookie(REFRESH_COOKIE, session.refreshToken, { ...sessionCookieOptions(config), maxAge: session.refreshExpiresAt.getTime() - Date.now() });
}
