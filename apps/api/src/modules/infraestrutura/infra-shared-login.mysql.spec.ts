import 'reflect-metadata';
import { Body, Controller, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createHmac, randomUUID } from 'node:crypto';
import { InfraDatabase } from './infra-db';
import { InfraLoginSecurity } from './infra-login-security';
import { InfraSharedLoginInterceptor } from './infra-shared-login.interceptor';

const supplied = process.env.INFRA_TEST_DATABASE_URL;
const suite = supplied ? describe : describe.skip;
let handled = 0;
function authenticate(body: { password?: string }) { handled++; if (body.password === 'fixture-success') return { ok: true }; throw new UnauthorizedException('Fixture invalid password'); }

@Controller('auth')
class SharedAuthFixture {
  @Post('login') @HttpCode(200) login(@Body() body: { password?: string }) { return authenticate(body); }
  @Post('orcapro/login') @HttpCode(200) orcapro(@Body() body: { password?: string }) { return authenticate(body); }
  @Post('refresh') @HttpCode(200) refresh() { handled++; return { ok: true }; }
}
@Controller('orcapro/auth')
class AliasAuthFixture {
  @Post('login') @HttpCode(200) login(@Body() body: { password?: string }) { return authenticate(body); }
}
@Controller('infraestrutura/auth')
class DedicatedAuthFixture {
  constructor(private readonly security: InfraLoginSecurity) {}
  @Post('login') @HttpCode(200)
  async login(@Body() body: { email: string; password?: string }, @Req() req: Request) {
    this.security.requireCsrf(req);
    const keys = await this.security.consume(body.email, req.ip!);
    try { const result = authenticate(body); await this.security.finish(keys, true); return result; }
    catch (error) { await this.security.finish(keys, false); throw error; }
  }
}

/** Stub password verification; real HTTP interceptor, CSRF, counters and MySQL. */
suite('Login compartilhado — quota HTTP persistente da Infraestrutura', () => {
  let app: NestExpressApplication, db: InfraDatabase, config: ConfigService, secret: string;
  const origin = 'https://www.gestaodepredios.com.br', ip = '198.18.7.10', email = 'synthetic-shared@example.invalid';
  const aliases = ['/auth/login', '/auth/orcapro/login', '/orcapro/auth/login', '/AUTH/LOGIN/?source=fixture', '/infraestrutura/auth/login'];
  const keys = () => [`email:${email}`, `ip:${ip}`].map(value => createHmac('sha256', secret).update(`infra-login-v1:${value}`).digest('hex'));
  const send = (route: string, password = 'fixture-wrong', selectedEmail = email) => request(app.getHttpServer()).post(`/api/v1${route}`).set('Origin', origin).set('X-Forwarded-For', ip).set('Cookie', `infra_login_csrf=${'a'.repeat(64)}`).set('X-Infra-Login-CSRF', 'a'.repeat(64)).send({ email: selectedEmail, password });
  const rows = () => db.query<Array<{ attempts: number; failures: number; blocked_until: Date | null }>>('SELECT attempts,failures,blocked_until FROM InfraLoginAttempt WHERE bucket_key IN (?,?)', keys());

  beforeEach(async () => {
    const target = new URL(supplied!);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/^\/infra_[a-z0-9_]*test_[a-z0-9_]+$/.test(target.pathname)) throw new Error('A suíte exige banco MySQL sintético local infra_*test_*.');
    secret = `synthetic-shared-login-${randomUUID()}`; handled = 0;
    config = new ConfigService({ INFRA_ENABLED: 'true', COOKIE_SECURE: 'false', CORS_ORIGINS: origin, INFRA_RATE_LIMIT_SECRET: secret });
    db = new InfraDatabase(new ConfigService({ INFRA_ENABLED: 'true', INFRA_DATABASE_URL: supplied }));
    await db.query('CREATE TABLE IF NOT EXISTS InfraLoginAttempt (bucket_key CHAR(64) PRIMARY KEY,window_started_at DATETIME(3) NOT NULL,attempts INT UNSIGNED NOT NULL DEFAULT 0,failures INT UNSIGNED NOT NULL DEFAULT 0,blocked_until DATETIME(3) NULL,last_seen_at DATETIME(3) NOT NULL,INDEX(last_seen_at)) ENGINE=InnoDB');
    const module = await Test.createTestingModule({ controllers: [SharedAuthFixture, AliasAuthFixture, DedicatedAuthFixture], providers: [InfraLoginSecurity, { provide: InfraDatabase, useValue: db }, { provide: ConfigService, useValue: config }, { provide: APP_INTERCEPTOR, useClass: InfraSharedLoginInterceptor }] }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', true); app.use(cookieParser()); app.setGlobalPrefix('api/v1'); await app.init();
  });
  afterEach(async () => { if (app) await app.close(); else if (db) await db.onModuleDestroy(); });

  test('alternar rotas e aliases mantém cinco tentativas e bloqueio por 15 minutos', async () => {
    for (const route of aliases) await send(route, 'fixture-wrong', ` ${email.toUpperCase()} `).expect(401);
    expect(handled).toBe(5);
    for (const route of aliases) await send(route).expect(429);
    expect(handled).toBe(5);
    const persisted = await rows();
    expect(persisted).toHaveLength(2);
    expect(persisted.every(row => row.attempts === 5 && row.failures === 5 && row.blocked_until!.getTime() > Date.now() + 13 * 60_000)).toBe(true);
  });

  test('login dedicado usa os mesmos buckets sem contar cada requisição duas vezes', async () => {
    for (let i = 0; i < 5; i++) await send('/infraestrutura/auth/login').expect(401);
    expect(handled).toBe(5);
    await send('/auth/login').expect(429);
    expect((await rows()).every(row => row.attempts === 5)).toBe(true);
  });

  test('sucesso em outra rota zera falhas mas não repõe a quota da janela', async () => {
    for (let i = 0; i < 4; i++) await send(aliases[i]!).expect(401);
    await send('/auth/orcapro/login', 'fixture-success').expect(200);
    expect((await rows()).every(row => row.attempts === 5 && row.failures === 0 && row.blocked_until === null)).toBe(true);
    await send('/auth/login', 'fixture-success').expect(429);
  });

  test('origem proibida e e-mail inválido são recusados antes de consultar a senha', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', 'https://attacker.invalid').set('X-Forwarded-For', ip).send({ email, password: 'fixture-success' }).expect(403);
    await send('/auth/orcapro/login', 'fixture-success', 'invalid-email').expect(400);
    expect(handled).toBe(0); expect(await rows()).toHaveLength(0);
  });

  test('feature desabilitada preserva login anterior sem Origin nem acesso ao banco Infra', async () => {
    config.set('INFRA_ENABLED', 'false');
    for (let i = 0; i < 8; i++) await request(app.getHttpServer()).post(`/api/v1${aliases[i % 3]}`).set('X-Forwarded-For', ip).send({ email, password: 'fixture-wrong' }).expect(401);
    expect(handled).toBe(8); expect(await rows()).toHaveLength(0);
  });

  test('renovação da sessão mantém o comportamento anterior e não consome quota de login', async () => {
    for (let i = 0; i < 8; i++) await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('X-Forwarded-For', ip).send({}).expect(200);
    expect(handled).toBe(8); expect(await rows()).toHaveLength(0);
  });
});
