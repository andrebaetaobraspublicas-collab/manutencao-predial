import { ConfigService } from '@nestjs/config';
import { ForbiddenException, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { InfraDatabase } from './infra-db';
import { InfraLoginSecurity } from './infra-login-security';

const supplied = process.env.INFRA_TEST_DATABASE_URL;
const suite = supplied ? describe : describe.skip;

suite('Infraestrutura login — isolamento e concorrência MySQL real', () => {
  let db: InfraDatabase;
  let security: InfraLoginSecurity;
  let config: ConfigService;
  beforeAll(async () => {
    const target = new URL(supplied!);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/^\/infra_[a-z0-9_]*test_[a-z0-9_]+$/.test(target.pathname)) throw new Error('A suíte exige banco MySQL local exclusivo com nome infra_*test_*.');
    config = new ConfigService({ INFRA_ENABLED: 'true', INFRA_DATABASE_URL: supplied, CORS_ORIGINS: 'https://www.gestaodepredios.com.br', COOKIE_SECURE: 'true', JWT_ACCESS_SECRET: 'synthetic-test-only-secret-not-used-by-production' });
    db = new InfraDatabase(config);
    await db.query('CREATE TABLE IF NOT EXISTS InfraLoginAttempt (bucket_key CHAR(64) PRIMARY KEY,window_started_at DATETIME(3) NOT NULL,attempts INT UNSIGNED NOT NULL DEFAULT 0,failures INT UNSIGNED NOT NULL DEFAULT 0,blocked_until DATETIME(3) NULL,last_seen_at DATETIME(3) NOT NULL,INDEX(last_seen_at)) ENGINE=InnoDB');
    security = new InfraLoginSecurity(db, config);
  });
  afterAll(async () => { if (db) await db.onModuleDestroy(); });

  test('Origin, HTTPS e CSRF devem ser verificados antes de qualquer tentativa', () => {
    const token = 'a'.repeat(64);
    const valid = { secure: true, headers: { origin: 'https://www.gestaodepredios.com.br', 'x-infra-login-csrf': token }, cookies: { infra_login_csrf: token } } as unknown as Request;
    expect(() => security.requireCsrf(valid)).not.toThrow();
    expect(() => security.requireCsrf({ ...valid, headers: { ...valid.headers, origin: 'https://attacker.example' } } as Request)).toThrow(ForbiddenException);
    expect(() => security.requireCsrf({ ...valid, secure: false } as Request)).toThrow(ForbiddenException);
    expect(() => security.requireCsrf({ ...valid, cookies: {} } as Request)).toThrow(ForbiddenException);
    expect(() => security.requireCsrf({ ...valid, headers: { ...valid.headers, 'x-infra-login-csrf': 'b'.repeat(64) } } as unknown as Request)).toThrow(ForbiddenException);
  });

  test('seis requisições simultâneas permitem exatamente cinco por minuto', async () => {
    const marker = randomUUID();
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => security.consume(`${marker}@example.invalid`, `198.18.0.${marker}`)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(5);
    const rejected = results.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(HttpException);
    expect(rejected[0]!.reason.getStatus()).toBe(429);
  });

  test('email normalizado limita tentativas distribuídas em vários IPs', async () => {
    const marker = randomUUID();
    for (let i = 0; i < 5; i++) await security.consume(` ${marker.toUpperCase()}@EXAMPLE.INVALID `, `198.18.1.${i}-${marker}`);
    await expect(security.consume(`${marker}@example.invalid`, `198.18.2.9-${marker}`)).rejects.toMatchObject({ status: 429 });
  });

  test('IP limita tentativas de contas diferentes', async () => {
    const marker = randomUUID();
    for (let i = 0; i < 5; i++) await security.consume(`${marker}-${i}@example.invalid`, `198.18.3.7-${marker}`);
    await expect(security.consume(`${marker}-other@example.invalid`, `198.18.3.7-${marker}`)).rejects.toMatchObject({ status: 429 });
  });

  test('cinco falhas bloqueiam por 15 minutos e sobreviveriam a outro processo', async () => {
    const marker = randomUUID();
    let keys: string[] = [];
    for (let i = 0; i < 5; i++) { keys = await security.consume(`${marker}@example.invalid`, `198.18.4.1-${marker}`); await security.finish(keys, false); }
    const otherInstance = new InfraLoginSecurity(db, config);
    // Old rate window does not release a persisted temporary block.
    await db.query('UPDATE InfraLoginAttempt SET window_started_at=? WHERE bucket_key IN (?,?)', [new Date(Date.now() - 120_000), ...keys]);
    await expect(otherInstance.consume(`${marker}@example.invalid`, `198.18.4.1-${marker}`)).rejects.toMatchObject({ status: 429 });
    const rows = await db.query<Array<{ blocked_until: Date; failures: number }>>('SELECT blocked_until,failures FROM InfraLoginAttempt WHERE bucket_key IN (?,?)', keys);
    expect(rows.every(row => row.blocked_until.getTime() > Date.now() + 13 * 60_000 && row.failures === 5)).toBe(true);
    await db.query('UPDATE InfraLoginAttempt SET blocked_until=? WHERE bucket_key IN (?,?)', [new Date(Date.now() - 1000), ...keys]);
    await expect(otherInstance.consume(`${marker}@example.invalid`, `198.18.4.1-${marker}`)).resolves.toHaveLength(2);
  });

  test('sucesso zera falhas, mas não repõe a cota de cinco tentativas', async () => {
    const marker = randomUUID();
    for (let i = 0; i < 5; i++) { const keys = await security.consume(`${marker}@example.invalid`, `198.18.5.1-${marker}`); await security.finish(keys, true); }
    await expect(security.consume(`${marker}@example.invalid`, `198.18.5.1-${marker}`)).rejects.toMatchObject({ status: 429 });
  });

  test('gravação e leitura dos prazos permanecem UTC mesmo com Node em horário de Brasília', async () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    try {
      const marker = randomUUID(); let keys: string[] = [];
      for (let i = 0; i < 5; i++) { keys = await security.consume(`${marker}@example.invalid`, `198.18.6.1-${marker}`); await security.finish(keys, false); }
      const rows = await db.query<Array<{ blocked_until: Date; storedBlock: string; storedSeen: string }>>("SELECT blocked_until,DATE_FORMAT(blocked_until,'%Y-%m-%d %H:%i:%s.%f') AS storedBlock,DATE_FORMAT(last_seen_at,'%Y-%m-%d %H:%i:%s.%f') AS storedSeen FROM InfraLoginAttempt WHERE bucket_key IN (?,?)", keys);
      const utc = (value: string) => new Date(`${value.replace(' ', 'T').slice(0, 23)}Z`).getTime();
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(utc(row.storedBlock)).toBeGreaterThan(Date.now() + 13 * 60_000);
        expect(utc(row.storedBlock)).toBeLessThan(Date.now() + 16 * 60_000);
        expect(Math.abs(utc(row.storedSeen) - Date.now())).toBeLessThan(5000);
        expect(row.blocked_until.getTime()).toBe(utc(row.storedBlock));
      }
    } finally { if (previousTimezone === undefined) delete process.env.TZ; else process.env.TZ = previousTimezone; }
  });
});
