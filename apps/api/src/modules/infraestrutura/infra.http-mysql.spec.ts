import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { InfraDatabase } from './infra-db';
import { InfraAccess, InfraGuard } from './infra.guard';
import { InfraService } from './infra.service';
import { InfraController } from './infra.controller';
import { sha } from './infra-domain';

const supplied = process.env.INFRA_TEST_DATABASE_URL;
const suite = supplied ? describe : describe.skip;
type Actor = { key: string; principal: AuthenticatedUser; csrf?: string };

/** HTTP harness injects trusted authenticated principals; MySQL/services/guards are real. */
suite('Infraestrutura HTTP/MySQL — autorização, histórico e conflito', () => {
  let app: NestExpressApplication;
  let db: InfraDatabase;
  let service: InfraService;
  let a: Actor, b: Actor, c: Actor, d: Actor, admin: Actor;
  const actors = new Map<string, Actor>();
  let refCounter = Math.floor(Math.random() * 60_000);
  const origin = 'https://www.gestaodepredios.com.br';

  async function actor(tenantId: string, role: 'ADMIN'|'USER', userId: string = randomUUID()): Promise<Actor> {
    const result = { key: randomUUID(), principal: { userId, tenantId, membershipId: randomUUID(), tenantSlug: 'synthetic-org', name: 'Fixture', email: `${userId}@example.invalid`, role: 'OWNER' } as AuthenticatedUser };
    await db.query('INSERT INTO InfraUser(id,external_user_id,tenant_id,name,email,role,status) VALUES(?,?,?,?,?,?,\'ACTIVE\')', [randomUUID(), userId, tenantId, 'Fixture', result.principal.email, role]);
    actors.set(result.key, result);
    return result;
  }
  function send(who: Actor, method: string, path: string) {
    const test = (request(app.getHttpServer()) as unknown as Record<string, (url: string) => request.Test>)[method]!(path);
    test.set('X-Test-Actor', who.key).set('Origin', origin).set('Cookie', `gp_access=central-${who.key}${who.csrf ? `; infra_csrf=${who.csrf}` : ''}`);
    if (who.csrf) test.set('X-Infra-CSRF', who.csrf);
    return test;
  }
  async function cycle() {
    const id = randomUUID(), index = refCounter++;
    const ref = `${1000 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
    const raw = { meta: { uf: 'SP', ref }, comps: [{ code: '1234567', description: 'Fixture global' }], prices: { SP: { SD: 42 } } };
    const encoded = JSON.stringify(raw), hash = sha(encoded);
    await db.query('INSERT INTO InfraCycle(id,uf,ref,status,import_status,imported_by,content_hash,raw_size,expected_chunks) VALUES(?,\'SP\',?,\'PUBLISHED\',\'PASSED\',?,?,?,1)', [id, ref, admin.principal.userId, hash, Buffer.byteLength(encoded)]);
    await db.query('INSERT INTO InfraCycleSnapshot(cycle_id,gz_blob,etag) VALUES(?,?,?)', [id, gzipSync(encoded), hash]);
    await db.query('INSERT INTO InfraCycleComposition(cycle_id,code,description,unit,data) VALUES(?,\'1234567\',\'Fixture global\',\'m3\',?)', [id, JSON.stringify({ code: '1234567', children: [] })]);
    return { id, raw, hash };
  }
  async function project(cycleId: string, who = a) {
    const response = await send(who, 'post', '/api/v1/infraestrutura/projects').send({ cycleId, name: 'Projeto privado', uf: 'SP', regime: 'SD', data: { bdi: 0.22, root: { children: [{ id: 'line-1', code: '1234567', q: 2 }] } } }).expect(201);
    return response.body as { id: string; data: Record<string, unknown>; version: number; name: string };
  }

  beforeAll(async () => {
    const target = new URL(supplied!);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/^\/infra_[a-z0-9_]*test_[a-z0-9_]+$/.test(target.pathname)) throw new Error('A suíte exige MySQL local exclusivo infra_*test_*.');
    const config = new ConfigService({ INFRA_ENABLED: 'true', INFRA_DATABASE_URL: supplied, COOKIE_SECURE: 'false', CORS_ORIGINS: origin, JWT_ACCESS_SECRET: 'synthetic-integration-test-only-secret' });
    db = new InfraDatabase(config);
    const migration = (await readFile(join(__dirname, '../../../infraestrutura-migrations/001_infraestrutura.sql'), 'utf8')).replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ');
    for (const sql of migration.split(';').map(value => value.trim()).filter(Boolean)) await db.query(sql);
    // Local fixture databases may have been created during development before
    // this additional field; this is test-fixture reconciliation, never a deploy migration.
    const erasureColumn = await db.query<unknown[]>('SHOW COLUMNS FROM InfraUser LIKE \'erasure_requested_at\'');
    if (!erasureColumn.length) await db.query('ALTER TABLE InfraUser ADD COLUMN erasure_requested_at DATETIME(3) NULL');
    const module = await Test.createTestingModule({ controllers: [InfraController], providers: [InfraService, InfraAccess, InfraGuard, { provide: ConfigService, useValue: config }, { provide: InfraDatabase, useValue: db }, { provide: PrismaService, useValue: {} }] }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.useBodyParser('json', { limit: '22mb' });
    app.use(cookieParser());
    app.use((req: { headers: Record<string, string>; user?: AuthenticatedUser }, _res: unknown, next: () => void) => { req.user = actors.get(req.headers['x-test-actor'])?.principal; next(); });
    app.setGlobalPrefix('api/v1');
    await app.init();
    service = module.get(InfraService);
    const tenantX = randomUUID(), tenantY = randomUUID();
    a = await actor(tenantX, 'USER'); b = await actor(tenantX, 'USER'); c = await actor(tenantY, 'USER'); d = await actor(tenantY, 'USER', a.principal.userId); admin = await actor(tenantX, 'ADMIN');
    for (const who of [a, b, c, d, admin]) {
      const session = await send(who, 'get', '/api/v1/infraestrutura/access').expect(200);
      who.csrf = session.body.csrfToken;
    }
  }, 60_000);
  afterAll(async () => { if (app) await app.close(); else if (db) await db.onModuleDestroy(); });

  test('todos os métodos admin reais retornam403 para usuário autenticado', async () => {
    const methods: Record<number, string> = { [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post', [RequestMethod.PUT]: 'put', [RequestMethod.PATCH]: 'patch', [RequestMethod.DELETE]: 'delete' };
    const routes = Object.getOwnPropertyNames(InfraController.prototype).filter(name => name !== 'constructor').map(name => (InfraController.prototype as unknown as Record<string, Function>)[name]!).filter(fn => String(Reflect.getMetadata(PATH_METADATA, fn) || '').startsWith('admin/'));
    expect(routes.length).toBeGreaterThanOrEqual(10);
    for (const fn of routes) {
      const path = String(Reflect.getMetadata(PATH_METADATA, fn)).replace(/:[A-Za-z]+/g, randomUUID());
      await send(a, methods[Reflect.getMetadata(METHOD_METADATA, fn)]!, `/api/v1/infraestrutura/${path}`).send({}).expect(403);
    }
  });

  test('projeto/versões/mutações são privados mesmo na mesma organização', async () => {
    const base = await cycle(), own = await project(base.id);
    for (const who of [b, c, d]) {
      const list = await send(who, 'get', '/api/v1/infraestrutura/projects').expect(200);
      expect(list.body.items.some((item: { id: string }) => item.id === own.id)).toBe(false);
      await send(who, 'get', `/api/v1/infraestrutura/projects/${own.id}`).expect(404);
      await send(who, 'get', `/api/v1/infraestrutura/projects/${own.id}/versions`).expect(404);
      await send(who, 'put', `/api/v1/infraestrutura/projects/${own.id}`).send({ version: 1, data: { bdi: 999 } }).expect(404);
      await send(who, 'post', `/api/v1/infraestrutura/projects/${own.id}/duplicate`).send({}).expect(404);
      await send(who, 'post', `/api/v1/infraestrutura/projects/${own.id}/restore/1`).send({ version: 1 }).expect(404);
      await send(who, 'delete', `/api/v1/infraestrutura/projects/${own.id}`).send({ version: 1 }).expect(404);
    }
    const unchanged = await send(a, 'get', `/api/v1/infraestrutura/projects/${own.id}`).expect(200);
    expect(unchanged.body.version).toBe(1);
    expect(unchanged.body.data.bdi).toBe(0.22);
  });

  test('UF do projeto deve corresponder ao ciclo sem reutilizar preço de outra UF', async () => {
    const base = await cycle();
    await send(a, 'post', '/api/v1/infraestrutura/projects').send({ cycleId: base.id, name: 'Contexto inválido', uf: 'RJ', regime: 'SD', data: { bdi: 0.2 } }).expect(400);
    const own = await project(base.id);
    await send(a, 'put', `/api/v1/infraestrutura/projects/${own.id}`).send({ version: 1, uf: 'RJ', data: { ...own.data, uf: 'RJ', bdi: 0.25 } }).expect(400);
    const unchanged = await send(a, 'get', `/api/v1/infraestrutura/projects/${own.id}`).expect(200);
    expect(unchanged.body.version).toBe(1);
    expect(unchanged.body.uf).toBe('SP');
    expect(unchanged.body.data.bdi).toBe(0.22);
  });

  test('duas gravações concorrentes produzem200+409 e um único histórico novo', async () => {
    const base = await cycle(), own = await project(base.id);
    const responses = await Promise.all([send(a, 'put', `/api/v1/infraestrutura/projects/${own.id}`).send({ version: 1, data: { bdi: 0.2, marker: 'A' } }), send(a, 'put', `/api/v1/infraestrutura/projects/${own.id}`).send({ version: 1, data: { bdi: 0.3, marker: 'B' } })]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const conflict = responses.find(response => response.status === 409)!;
    expect(conflict.body.currentVersion).toBe(2);
    const versions = await send(a, 'get', `/api/v1/infraestrutura/projects/${own.id}/versions`).expect(200);
    expect(versions.body.items.map((item: { version: number }) => item.version)).toEqual([2, 1]);
    const restore = await send(a, 'post', `/api/v1/infraestrutura/projects/${own.id}/restore/1`).send({ version: 2 }).expect(201);
    expect(restore.body.version).toBe(3);
    expect(restore.body.data.bdi).toBe(0.22);
  });

  test('cadastro próprio não vaza nem altera catálogo global/snapshot', async () => {
    const base = await cycle();
    const before = await service.snapshot(a.principal, base.id);
    const code = `CP-${randomUUID()}`;
    await send(a, 'post', '/api/v1/infraestrutura/me/compositions').send({ code, data: { description: 'Minha cópia', originalCode: '1234567', children: [{ code: 'own', q: 0.1 }] } }).expect(201);
    const own = await send(a, 'get', '/api/v1/infraestrutura/me/compositions').expect(200);
    expect(own.body.items.some((item: { code: string }) => item.code === code)).toBe(true);
    for (const who of [b, c, d]) {
      const other = await send(who, 'get', '/api/v1/infraestrutura/me/compositions').expect(200);
      expect(other.body.items.some((item: { code: string }) => item.code === code)).toBe(false);
    }
    const after = await service.snapshot(a.principal, base.id);
    expect(after.etag).toBe(base.hash);
    expect(after.gzip.equals(before.gzip)).toBe(true);
    const snapshot = await send(a, 'get', `/api/v1/infraestrutura/cycles/${base.id}/snapshot`).expect(200);
    expect(snapshot.headers.etag).toBe(`"${base.hash}"`);
    expect(snapshot.body).toEqual(base.raw);
    await send(a, 'get', `/api/v1/infraestrutura/cycles/${base.id}/snapshot`).set('If-None-Match', `"${base.hash}"`).expect(304);
  });

  test('importação HTTP confere cada fragmento gzip/hash e não publica antes do worker', async () => {
    const index = refCounter++;
    const ref = `${1000 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
    const raw = Buffer.from(JSON.stringify({ meta: { uf: 'SP', ref }, description: 'Referência com aço, revisão e ação', payload: 'á'.repeat(40) }), 'utf8');
    // Split bytes in the middle of multibyte text: transport must concatenate
    // the original bytes before decoding, never decode isolated fragments.
    const start = raw.indexOf(Buffer.from('á'.repeat(40))) + 1;
    const fragments = [raw.subarray(0, start), raw.subarray(start, start + 21), raw.subarray(start + 21)];
    const created = await send(admin, 'post', '/api/v1/infraestrutura/admin/cycles').send({ uf: 'SP', ref, expectedChunks: fragments.length, expectedBytes: raw.length, contentHash: sha(raw) }).expect(201);
    const id = created.body.id;
    const url = `/api/v1/infraestrutura/admin/cycles/${id}`;
    const chunk = (seq: number, bytes = fragments[seq]!) => ({ index: seq, encoding: 'gzip', dataBase64: gzipSync(bytes).toString('base64'), sha256: sha(bytes) });
    await send(admin, 'post', `${url}/chunks`).send({ ...chunk(0), sha256: '0'.repeat(64) }).expect(400);
    await send(admin, 'post', `${url}/chunks`).send({ ...chunk(0), dataBase64: gzipSync(Buffer.alloc(2 * 1024 * 1024 + 1)).toString('base64'), sha256: sha(Buffer.alloc(2 * 1024 * 1024 + 1)) }).expect(400);
    expect(await db.query('SELECT seq FROM InfraCycleChunk WHERE cycle_id=?', [id])).toHaveLength(0);
    await send(admin, 'post', `${url}/chunks`).send(chunk(0)).expect(201);
    const retry = await send(admin, 'post', `${url}/chunks`).send(chunk(0)).expect(201);
    expect(retry.body.reused).toBe(true);
    await send(admin, 'post', `${url}/chunks`).send(chunk(0, Buffer.from('outro lote'))).expect(409);
    await send(admin, 'post', `${url}/finalize`).send({}).expect(400);
    await send(admin, 'post', `${url}/chunks`).send(chunk(2)).expect(201);
    await send(admin, 'post', `${url}/chunks`).send(chunk(1)).expect(201);
    await send(admin, 'post', `${url}/finalize`).send({}).expect(201);
    const stored = await db.query<Array<{ data: Buffer }>>('SELECT data FROM InfraCycleChunk WHERE cycle_id=? ORDER BY seq', [id]);
    expect(Buffer.concat(stored.map(row => row.data)).equals(raw)).toBe(true);
    const status = await db.query<Array<{ status: string; import_status: string }>>('SELECT status,import_status FROM InfraCycle WHERE id=?', [id]);
    expect(status[0]).toMatchObject({ status: 'DRAFT', import_status: 'QUEUED' });
    await send(admin, 'post', `${url}/publish`).send({}).expect(409);
    await send(admin, 'post', `${url}/chunks`).send(chunk(0)).expect(409);
    await send(a, 'get', `/api/v1/infraestrutura/cycles/${id}/snapshot`).expect(404);
    const publicCycles = await send(a, 'get', '/api/v1/infraestrutura/cycles').expect(200);
    expect(publicCycles.body.items.some((item: { id: string }) => item.id === id)).toBe(false);
    expect(publicCycles.body.items.every((item: { rawSize: unknown }) => typeof item.rawSize === 'number')).toBe(true);
    const privateCycles = await send(admin, 'get', '/api/v1/infraestrutura/admin/cycles').expect(200);
    const imported = privateCycles.body.items.find((item: { id: string }) => item.id === id);
    expect(imported.rawSize).toBe(raw.length);
    expect(imported.validation.status).toBe('QUEUED');
  });

  test('20MB completos passam no envelope HTTP; data maior é rejeitado sem salvar', async () => {
    const base = await cycle(), own = await project(base.id);
    const empty = { ...own.data, note: '' };
    const maximum = 20 * 1024 * 1024;
    const data = { ...empty, note: 'a'.repeat(maximum - Buffer.byteLength(JSON.stringify(empty))) };
    expect(Buffer.byteLength(JSON.stringify(data))).toBe(maximum);
    const saved = await send(a, 'put', `/api/v1/infraestrutura/projects/${own.id}`).send({ version: 1, data }).expect(200);
    expect(saved.body.version).toBe(2);
    await send(a, 'put', `/api/v1/infraestrutura/projects/${own.id}`).send({ version: 2, data: { ...data, note: `${data.note}a` } }).expect(400);
    const rows = await db.query<Array<{ version: number }>>('SELECT version FROM InfraProject WHERE id=?', [own.id]);
    expect(rows[0]!.version).toBe(2);
  }, 60_000);

  test('ciclo arquivado serve o dono histórico e exclusão em uso é bloqueada', async () => {
    const base = await cycle();
    await project(base.id);
    await send(admin, 'post', `/api/v1/infraestrutura/admin/cycles/${base.id}/archive`).send({}).expect(201);
    await send(a, 'get', `/api/v1/infraestrutura/cycles/${base.id}/snapshot`).expect(200);
    await send(b, 'get', `/api/v1/infraestrutura/cycles/${base.id}/snapshot`).expect(404);
    await send(a, 'post', '/api/v1/infraestrutura/projects').send({ cycleId: base.id, name: 'Não pode usar arquivo', data: {} }).expect(404);
    await send(admin, 'delete', `/api/v1/infraestrutura/admin/cycles/${base.id}`).send({}).expect(409);
  });

  test('restaurar histórico privado volta à referência arquivada após mudança de ciclo', async () => {
    const original = await cycle(), replacement = await cycle(), own = await project(original.id);
    // The synthetic catalog does not contain the complete motor fixture. Only
    // establish the post-migration cycle binding; save/history/restore are real.
    await db.query('UPDATE InfraProject SET cycle_id=? WHERE id=?', [replacement.id, own.id]);
    const changed = await send(a, 'put', `/api/v1/infraestrutura/projects/${own.id}`).send({ version: 1, data: { ...own.data, bdi: 0.29 } }).expect(200);
    expect(changed.body.cycleId).toBe(replacement.id);
    await send(admin, 'post', `/api/v1/infraestrutura/admin/cycles/${original.id}/archive`).send({}).expect(201);
    for (const who of [b, c, d]) await send(who, 'post', `/api/v1/infraestrutura/projects/${own.id}/restore/1`).send({ version: 2 }).expect(404);
    const restored = await send(a, 'post', `/api/v1/infraestrutura/projects/${own.id}/restore/1`).send({ version: 2 }).expect(201);
    expect(restored.body.cycleId).toBe(original.id);
    expect(restored.body.version).toBe(3);
    expect(restored.body.data.bdi).toBe(0.22);
    await send(a, 'post', `/api/v1/infraestrutura/projects/${own.id}/restore/1`).send({ version: 2 }).expect(409);
    const archived = await send(a, 'get', `/api/v1/infraestrutura/cycles/${original.id}/snapshot`).expect(200);
    expect(archived.headers.etag).toBe(`"${original.hash}"`);
    await send(b, 'get', `/api/v1/infraestrutura/cycles/${original.id}/snapshot`).expect(404);
    const returnToNew = await send(a, 'post', `/api/v1/infraestrutura/projects/${own.id}/restore/2`).send({ version: 3 }).expect(201);
    expect(returnToNew.body.cycleId).toBe(replacement.id);
    expect(returnToNew.body.version).toBe(4);
    expect(returnToNew.body.data.bdi).toBe(0.29);
  });

  test('arquivo LGPD inclui lixeira e histórico sem dados de colegas ou segredos', async () => {
    const who = await actor(a.principal.tenantId, 'USER');
    who.csrf = (await send(who, 'get', '/api/v1/infraestrutura/access').expect(200)).body.csrfToken;
    const base = await cycle(), own = await project(base.id, who), peer = await project(base.id, b);
    await send(who, 'put', `/api/v1/infraestrutura/projects/${own.id}`).send({ version: 1, data: { bdi: 0.25, note: 'Dados exportáveis' } }).expect(200);
    await send(who, 'delete', `/api/v1/infraestrutura/projects/${own.id}`).send({ version: 2 }).expect(200);
    const code = `CP-${randomUUID()}`;
    await send(who, 'post', '/api/v1/infraestrutura/me/compositions').send({ code, data: { description: 'Minha cópia excluída' } }).expect(201);
    await send(who, 'delete', `/api/v1/infraestrutura/me/compositions/${code}`).send({ revision: 1 }).expect(200);
    const response = await send(who, 'get', '/api/v1/infraestrutura/me/export/archive').buffer(true).parse((res: any, done: (error: Error | null, body: any) => void) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('error', (error: Error) => done(error, undefined));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    }).expect(200);
    const text = gunzipSync(response.body as Buffer).toString('utf8');
    const archive = JSON.parse(text);
    expect(archive.projects).toHaveLength(1);
    expect(archive.projects[0].id).toBe(own.id);
    expect(archive.projects[0].deletedAt).toBeTruthy();
    expect(archive.projectVersions.map((version: { version: number }) => version.version)).toEqual([1, 2]);
    expect(archive.ownRecords[0].code).toBe(code);
    expect(archive.ownRecords[0].deleted_at).toBeTruthy();
    expect(text).not.toContain(peer.id);
    expect(text).not.toMatch(/passwordHash|gp_access|JWT_ACCESS_SECRET|DATABASE_URL/);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  test('expurgo LGPD elimina somente pedidos vencidos e preserva catálogo e outro tenant do mesmo usuário', async () => {
    const commonId = randomUUID();
    const due = await actor(a.principal.tenantId, 'USER', commonId), peer = await actor(c.principal.tenantId, 'USER', commonId), future = await actor(a.principal.tenantId, 'USER');
    for (const who of [due, peer, future]) who.csrf = (await send(who, 'get', '/api/v1/infraestrutura/access').expect(200)).body.csrfToken;
    const base = await cycle();
    const dueProject = await project(base.id, due), peerProject = await project(base.id, peer), futureProject = await project(base.id, future);
    const peerAuditId = randomUUID();
    await db.query('INSERT INTO InfraAudit(id,tenant_id,user_id,action,entity,entity_id,payload) VALUES(?,?,?,\'fixture.peer.keep\',\'user\',?,?)', [peerAuditId, peer.principal.tenantId, peer.principal.userId, commonId, JSON.stringify({ personal: 'peer-preserve', customerTenantId: peer.principal.tenantId })]);
    await send(due, 'delete', '/api/v1/infraestrutura/me/data').send({ confirm: 'EXCLUIR MEUS DADOS' }).expect(200);
    await send(future, 'delete', '/api/v1/infraestrutura/me/data').send({ confirm: 'EXCLUIR MEUS DADOS' }).expect(200);
    await db.query('UPDATE InfraUser SET erasure_requested_at=? WHERE external_user_id=? AND tenant_id=?', [new Date(Date.now() - 31 * 86400000), due.principal.userId, due.principal.tenantId]);
    await db.query('UPDATE InfraUser SET erasure_requested_at=? WHERE external_user_id=? AND tenant_id=?', [new Date(Date.now() - 5 * 86400000), future.principal.userId, future.principal.tenantId]);
    const staleBucket = sha(`stale-${randomUUID()}`), blockedBucket = sha(`blocked-${randomUUID()}`), recentBucket = sha(`recent-${randomUUID()}`);
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000), oneDayAgo = new Date(Date.now() - 86400000);
    for (const fixture of [{ key: staleBucket, seen: eightDaysAgo, block: null }, { key: blockedBucket, seen: eightDaysAgo, block: new Date(Date.now() + 3600000) }, { key: recentBucket, seen: oneDayAgo, block: null }]) {
      await db.query('INSERT INTO InfraLoginAttempt(bucket_key,window_started_at,attempts,failures,blocked_until,last_seen_at) VALUES(?,?,1,1,?,?)', [fixture.key, fixture.seen, fixture.block, fixture.seen]);
    }
    const cli = await promisify(execFile)(process.execPath, [join(__dirname, '../../../scripts/infraestrutura-purge.mjs')], { cwd: join(__dirname, '../../..'), windowsHide: true, env: { ...process.env, INFRA_ENV_FILE: '', INFRA_ENABLED: 'true', INFRA_DATABASE_URL: supplied!, DATABASE_URL: 'mysql://unused:unused@127.0.0.1:3308/identity_not_opened', INFRA_DELETED_DATA_RETENTION_DAYS: '30' } });
    expect(JSON.parse(cli.stdout).erasedProfiles).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(cli.stdout).expiredLoginBuckets).toBeGreaterThanOrEqual(1);
    const retainedBuckets = await db.query<Array<{ bucket_key: string }>>('SELECT bucket_key FROM InfraLoginAttempt WHERE bucket_key IN (?,?,?)', [staleBucket, blockedBucket, recentBucket]);
    expect(retainedBuckets.map(row => row.bucket_key).sort()).toEqual([blockedBucket, recentBucket].sort());
    expect(await db.query('SELECT id FROM InfraUser WHERE external_user_id=? AND tenant_id=?', [commonId, due.principal.tenantId])).toHaveLength(0);
    expect(await db.query('SELECT id FROM InfraProject WHERE id=?', [dueProject.id])).toHaveLength(0);
    expect(await db.query('SELECT project_id FROM InfraProjectVersion WHERE project_id=?', [dueProject.id])).toHaveLength(0);
    expect(await db.query('SELECT id FROM InfraProject WHERE id IN (?,?)', [peerProject.id, futureProject.id])).toHaveLength(2);
    const peerAudit = await db.query<Array<{ entity_id: string; payload: unknown }>>('SELECT entity_id,payload FROM InfraAudit WHERE id=?', [peerAuditId]);
    expect(peerAudit[0]!.entity_id).toBe(commonId);
    expect(typeof peerAudit[0]!.payload === 'string' ? JSON.parse(peerAudit[0]!.payload) : peerAudit[0]!.payload).toEqual({ personal: 'peer-preserve', customerTenantId: peer.principal.tenantId });
    expect((await service.snapshot(peer.principal, base.id)).etag).toBe(base.hash);
    await send(due, 'get', '/api/v1/infraestrutura/projects').expect(403);
  }, 30_000);
});
