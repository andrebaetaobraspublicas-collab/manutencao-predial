import { ForbiddenException, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { InfraDatabase } from './infra-db';

export const INFRA_LOGIN_CSRF_COOKIE = 'infra_login_csrf';
export const INFRA_LOGIN_CSRF_HEADER = 'x-infra-login-csrf';
const WINDOW_MS = 60_000;
const BLOCK_MS = 15 * 60_000;
const LIMIT = 5;

type AttemptRow = { bucket_key: string; window_started_at: Date; attempts: number; failures: number; blocked_until: Date | null };

/** Dedicated protection for Infraestrutura login; never changes existing product logins. */
@Injectable()
export class InfraLoginSecurity {
  constructor(private readonly db: InfraDatabase, private readonly config: ConfigService) {}

  requireOrigin(request: Request): void {
    if (this.config.get<string>('INFRA_ENABLED') !== 'true') throw new ServiceUnavailableException('OrçaPro Infraestrutura não está habilitado neste ambiente.');
    const allowed = (this.config.get<string>('CORS_ORIGINS') || 'http://localhost:3000').split(',').map(value => value.trim()).filter(Boolean);
    if (typeof request.headers.origin !== 'string' || !allowed.includes(request.headers.origin)) throw new ForbiddenException('Origem não autorizada para esta operação.');
    if (this.config.get<string>('COOKIE_SECURE') === 'true' && !request.secure) throw new ForbiddenException('HTTPS é obrigatório para esta operação.');
  }

  requireCsrf(request: Request): void {
    this.requireOrigin(request);
    const cookie: unknown = request.cookies?.[INFRA_LOGIN_CSRF_COOKIE];
    const header = request.headers[INFRA_LOGIN_CSRF_HEADER];
    if (typeof cookie !== 'string' || typeof header !== 'string' || !/^[a-f0-9]{64}$/.test(cookie) || !/^[a-f0-9]{64}$/.test(header) || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) throw new ForbiddenException('Atualize a página para iniciar uma sessão protegida.');
  }

  private bucketKeys(email: string, ip: string): string[] {
    const secret = this.config.get<string>('INFRA_RATE_LIMIT_SECRET') || this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    return [`email:${email.trim().toLowerCase()}`, `ip:${ip || 'unknown'}`].map(value => createHmac('sha256', secret).update(`infra-login-v1:${value}`).digest('hex')).sort();
  }

  async consume(email: string, ip: string): Promise<string[]> {
    const keys = this.bucketKeys(email, ip);
    const now = new Date();
    let limited = false;
    await this.db.transaction(async db => {
      for (const key of keys) {
        // Upsert obtains an exclusive row lock. INSERT IGNORE would obtain a
        // shared duplicate-key lock and can deadlock when concurrent requests
        // then upgrade it to SELECT FOR UPDATE.
        await db.query('INSERT INTO InfraLoginAttempt (bucket_key,window_started_at,attempts,failures,blocked_until,last_seen_at) VALUES (?,?,0,0,NULL,?) ON DUPLICATE KEY UPDATE bucket_key=VALUES(bucket_key)', [key, now, now]);
        const rows = await db.query<AttemptRow[]>('SELECT bucket_key,window_started_at,attempts,failures,blocked_until FROM InfraLoginAttempt WHERE bucket_key=? FOR UPDATE', [key]);
        const row = rows[0]!;
        if (row.blocked_until && row.blocked_until.getTime() > now.getTime()) { limited = true; continue; }
        let attempts = Number(row.attempts);
        let failures = Number(row.failures);
        let started = row.window_started_at;
        if (row.blocked_until || now.getTime() - started.getTime() >= WINDOW_MS) { attempts = 0; started = now; if (row.blocked_until) failures = 0; }
        if (attempts >= LIMIT) { limited = true; continue; }
        await db.query('UPDATE InfraLoginAttempt SET window_started_at=?,attempts=?,failures=?,blocked_until=NULL,last_seen_at=? WHERE bucket_key=?', [started, attempts + 1, failures, now, key]);
      }
    });
    if (limited) throw new HttpException('Muitas tentativas. Aguarde antes de entrar novamente.', HttpStatus.TOO_MANY_REQUESTS);
    return keys;
  }

  async finish(keys: string[], succeeded: boolean): Promise<void> {
    const now = new Date();
    await this.db.transaction(async db => {
      for (const key of [...keys].sort()) {
        const rows = await db.query<AttemptRow[]>('SELECT bucket_key,window_started_at,attempts,failures,blocked_until FROM InfraLoginAttempt WHERE bucket_key=? FOR UPDATE', [key]);
        const row = rows[0];
        if (!row) continue;
        if (succeeded) {
          // A success cannot release a lock produced by another concurrent attempt.
          if (!row.blocked_until || row.blocked_until.getTime() <= now.getTime()) await db.query('UPDATE InfraLoginAttempt SET failures=0,last_seen_at=? WHERE bucket_key=?', [now, key]);
        } else {
          const failures = Number(row.failures) + 1;
          const block = failures >= LIMIT ? new Date(now.getTime() + BLOCK_MS) : row.blocked_until;
          await db.query('UPDATE InfraLoginAttempt SET failures=?,blocked_until=?,last_seen_at=? WHERE bucket_key=?', [failures, block, now, key]);
        }
      }
    });
  }
}
