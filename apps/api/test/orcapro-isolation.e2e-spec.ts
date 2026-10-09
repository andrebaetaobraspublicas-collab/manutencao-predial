import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { sinapiWorkbookFixture } from '../src/modules/orcapro/sinapi-workbook.fixture';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'test-only-orcapro-password-2026';
type Agent = ReturnType<typeof request.agent>;
type Identity = { agent: Agent; userId: string; tenantId: string; tenantSlug: string };

function rawBase(month: string, multiplier = 1) {
  return { v: 1, fonte: 'SINAPI', ref: `${month}/2036`, emissao: '', ufs: ['SP', 'DF'], cidades: ['', ''],
    encargos: {}, grupos: ['Concreto de teste'], ct: [''], cls: ['MATERIAL', 'MAO DE OBRA'], un: ['KG', 'H', 'M3'],
    ins: { c: [991001, 991002], k: [0, 1], d: ['Material de teste', 'Operário de teste'], u: [0, 1], o: [0, 0],
      p: [[100 * multiplier, 200 * multiplier], [1000 * multiplier, 1500 * multiplier]],
      lab: { '991002': { CD: [800 * multiplier, 1200 * multiplier], SE: [600 * multiplier, 900 * multiplier] } } },
    comp: { c: [991003], g: [0], d: ['Concreto — referência de teste automatizado'], u: [2], s: [0], it: [[[991001, 2], [991002, 0.5]]] } };
}

describe('OrçaPro — MySQL, referências e isolamento HTTP', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let a: Identity; let b: Identity; let sameTenant: Agent;
  let ref1: string; let ref2: string; let projectId: string;
  let revision = 1;
  const previous = new Map<string, string | undefined>();
  const environment = ['ORCAPRO_ENABLED', 'ORCAPRO_ADMIN_USER_IDS', 'ORCAPRO_TENANT_IDS', 'CORS_ORIGINS', 'COOKIE_DOMAIN', 'COOKIE_SECURE', 'NOTIFICATION_WORKER_ENABLED'];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL || !/test|restore|staging/i.test(new URL(process.env.DATABASE_URL).pathname)) {
      throw new Error('Os testes OrçaPro exigem MySQL isolado com nome test, restore ou staging.');
    }
    for (const name of environment) previous.set(name, process.env[name]);
    process.env.ORCAPRO_ENABLED = 'true'; process.env.ORCAPRO_ADMIN_USER_IDS = '';
    process.env.ORCAPRO_TENANT_IDS = ''; process.env.CORS_ORIGINS = ORIGIN;
    process.env.COOKIE_DOMAIN = ''; process.env.COOKIE_SECURE = 'false';
    process.env.NOTIFICATION_WORKER_ENABLED = 'false';
    process.env.JWT_ACCESS_SECRET ??= 'orcapro-e2e-secret-with-at-least-thirty-two-characters';
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser()); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    const lastFixture = await prisma.orcaproReference.aggregate({ where: { year: 2036, month: { in: [1, 2] } }, _max: { revision: true } });
    revision = (lastFixture._max.revision ?? 0) + 1;
    a = await createIdentity('a'); b = await createIdentity('b');
    const email = `orcapro-same-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { name: 'Outro usuário do tenant', email, passwordHash: await hash(PASSWORD, 12), status: 'ACTIVE' } });
    await prisma.tenantMembership.create({ data: { userId: user.id, tenantId: a.tenantId, status: 'ACTIVE', role: 'OWNER' } });
    sameTenant = request.agent(app.getHttpServer());
    await sameTenant.post('/api/v1/auth/login').send({ tenantSlug: a.tenantSlug, email, password: PASSWORD }).expect(200);
    app.get(ConfigService).set('ORCAPRO_ADMIN_USER_IDS', a.userId);
  });

  afterAll(async () => {
    await app?.close();
    for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  });

  async function createIdentity(suffix: string): Promise<Identity> {
    const agent = request.agent(app.getHttpServer()); const key = randomUUID().slice(0, 12);
    const tenantSlug = `orcapro-${suffix}-${key}`;
    const response = await agent.post('/api/v1/auth/register-tenant').send({ tenantName: `OrçaPro ${suffix}`, tenantSlug, ownerName: `Teste ${suffix}`, email: `${tenantSlug}@example.test`, password: PASSWORD }).expect(201);
    return { agent, tenantSlug, userId: response.body.user.userId, tenantId: response.body.user.tenantId };
  }

  it('mantém login/manutenção e distingue ADMIN SINAPI de OWNER de tenant', async () => {
    const accessA = await a.agent.get('/api/v1/orcapro/access').expect(200);
    const accessB = await b.agent.get('/api/v1/orcapro/access').expect(200);
    expect(accessA.body.role).toBe('ADMIN'); expect(accessB.body.role).toBe('USER');
    await b.agent.get('/api/v1/orcapro/admin/references').expect(403);
    await b.agent.post('/api/v1/orcapro/admin/imports').set('Origin', ORIGIN).send({ raw: rawBase('01'), sourceName: 'test.json' }).expect(403);
    await a.agent.get('/api/v1/auth/me').expect(200);
    await a.agent.get('/api/v1/work-orders').expect(200);
  });

  it('rejeita mutações com Origin não autorizado', async () => {
    await a.agent.post('/api/v1/orcapro/admin/imports').set('Origin', 'https://untrusted.example').send({ raw: rawBase('01'), sourceName: 'test.json' }).expect(403);
  });

  it('importa e publica duas referências sem substituir a primeira', async () => {
    const first = await a.agent.post('/api/v1/orcapro/admin/imports').set('Origin', ORIGIN).send({ raw: rawBase('01'), sourceName: 'orcapro-test-01.json', revision }).expect(201);
    ref1 = first.body.referenceId ?? first.body.reference?.id ?? first.body.id;
    expect(ref1).toBeTruthy();
    await a.agent.post(`/api/v1/orcapro/admin/references/${ref1}/validate`).set('Origin', ORIGIN).send({}).expect(201);
    await a.agent.post(`/api/v1/orcapro/admin/references/${ref1}/publish`).set('Origin', ORIGIN).send({}).expect(201);
    await a.agent.put('/api/v1/orcapro/admin/default-reference').set('Origin', ORIGIN).send({ referenceId: ref1 }).expect(200);
    const second = await a.agent.post('/api/v1/orcapro/admin/imports').set('Origin', ORIGIN).send({ raw: rawBase('02', 2), sourceName: 'orcapro-test-02.json', revision }).expect(201);
    ref2 = second.body.referenceId ?? second.body.reference?.id ?? second.body.id;
    await a.agent.post(`/api/v1/orcapro/admin/references/${ref2}/validate`).set('Origin', ORIGIN).send({}).expect(201);
    await a.agent.post(`/api/v1/orcapro/admin/references/${ref2}/publish`).set('Origin', ORIGIN).send({}).expect(201);
    const refs = await b.agent.get('/api/v1/orcapro/references').expect(200);
    expect(refs.body.items.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining([ref1, ref2]));
  });

  it('recalcula o mesmo analítico por referência, UF e regime', async () => {
    const result = async (referenceId: string, uf: string, regime: string) => {
      const response = await b.agent.get('/api/v1/orcapro/catalog/compositions/991003').query({ referenceId, uf, regime }).expect(200);
      return response.body.costCents ?? response.body.cost?.cents ?? response.body.cost;
    };
    expect(String(await result(ref1, 'SP', 'SD'))).toBe('700');
    expect(String(await result(ref1, 'DF', 'SD'))).toBe('1150');
    expect(String(await result(ref1, 'SP', 'CD'))).toBe('600');
    expect(String(await result(ref2, 'SP', 'SD'))).toBe('1400');
  });

  it('fixa a referência do projeto e bloqueia acesso entre tenants e usuários do mesmo tenant', async () => {
    const created = await b.agent.post('/api/v1/orcapro/projects').set('Origin', ORIGIN).send({ name: 'Projeto privado', uf: 'SP', regime: 'SD', referenceId: ref1 }).expect(201);
    projectId = created.body.id;
    await a.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(404);
    const sameTenantProject = await a.agent.post('/api/v1/orcapro/projects').set('Origin', ORIGIN).send({ name: 'Projeto pessoal A', uf: 'SP', regime: 'SD', referenceId: ref1 }).expect(201);
    await sameTenant.get(`/api/v1/orcapro/projects/${sameTenantProject.body.id}`).expect(404);
    await sameTenant.get(`/api/v1/orcapro/projects/${sameTenantProject.body.id}/context`).expect(404);
    await a.agent.put('/api/v1/orcapro/admin/default-reference').set('Origin', ORIGIN).send({ referenceId: ref2 }).expect(200);
    const old = await b.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(200);
    expect(old.body.referenceId).toBe(ref1);
    const next = await b.agent.post('/api/v1/orcapro/projects').set('Origin', ORIGIN).send({ name: 'Novo usa padrão', uf: 'SP', regime: 'SD' }).expect(201);
    expect(next.body.referenceId).toBe(ref2);
  });

  it('não sobrescreve salvamento concorrente e não grava catálogo oficial no projeto', async () => {
    const loaded = await b.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(200);
    const body = { expectedVersion: loaded.body.version, data: loaded.body.data, name: 'Nome atualizado' };
    await b.agent.put(`/api/v1/orcapro/projects/${projectId}`).set('Origin', ORIGIN).send(body).expect(200);
    await b.agent.put(`/api/v1/orcapro/projects/${projectId}`).set('Origin', ORIGIN).send(body).expect(409);
    const updated = await b.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(200);
    await b.agent.put(`/api/v1/orcapro/projects/${projectId}`).set('Origin', ORIGIN).send({ expectedVersion: updated.body.version, data: { ...updated.body.data, base: rawBase('01') } }).expect(400);
  });

  it('a cópia própria mantém proveniência e não altera a composição oficial', async () => {
    const original = await b.agent.get('/api/v1/orcapro/catalog/compositions/991003').query({ referenceId: ref1, uf: 'SP', regime: 'SD' }).expect(200);
    const copied = await b.agent.post('/api/v1/orcapro/custom-compositions/from-sinapi/991003').set('Origin', ORIGIN).send({ referenceId: ref1 }).expect(201);
    expect(copied.body.originCode).toBe('991003'); expect(copied.body.originReferenceId).toBe(ref1);
    expect(copied.body.code).toMatch(/^CP-/);
    const unchanged = await b.agent.get('/api/v1/orcapro/catalog/compositions/991003').query({ referenceId: ref1, uf: 'SP', regime: 'SD' }).expect(200);
    expect(unchanged.body).toEqual(original.body);
  });

  it('não permite reescrever referência publicada nem publica importação inválida', async () => {
    await a.agent.post(`/api/v1/orcapro/admin/references/${ref1}/validate`).set('Origin', ORIGIN).send({}).expect(409);
    await a.agent.post(`/api/v1/orcapro/admin/references/${ref1}/publish`).set('Origin', ORIGIN).send({}).expect(409);
    const before = await prisma.orcaproReference.count();
    const malformed = rawBase('03'); malformed.comp.it = [[[-991003, 1]]];
    await a.agent.post('/api/v1/orcapro/admin/imports').set('Origin', ORIGIN).send({ raw: malformed, sourceName: 'circular-test.json', revision }).expect(400);
    expect(await prisma.orcaproReference.count()).toBe(before);
  });

  it('versiona restauração e exportação sem aceitar IDs de outros proprietários', async () => {
    const loaded = await b.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(200);
    const versions = await b.agent.get(`/api/v1/orcapro/projects/${projectId}/versions`).expect(200);
    expect(versions.body.map((v: { version: number }) => v.version)).toEqual(expect.arrayContaining([1, loaded.body.version]));
    await a.agent.get(`/api/v1/orcapro/projects/${projectId}/versions`).expect(404);
    await a.agent.get(`/api/v1/orcapro/projects/${projectId}/export`).expect(404);
    const restored = await b.agent.post(`/api/v1/orcapro/projects/${projectId}/restore`).set('Origin', ORIGIN).send({ version: 1, expectedVersion: loaded.body.version }).expect(201);
    expect(restored.body.version).toBe(loaded.body.version + 1); expect(restored.body.referenceId).toBe(ref1);
    const exported = await b.agent.get(`/api/v1/orcapro/projects/${projectId}/export`).expect(200);
    expect(exported.body.referenceId).toBe(ref1); expect(exported.body.project.base).toBeUndefined();
  });

  it('clona template global em documentos privados sem modificar o exemplo', async () => {
    const data = { id: 'template', name: 'Exemplo teste', uf: 'SP', rg: 'SD', bdi: 0.25, links: [], catalog: { inputs: [], compositions: [] }, root: { id: 'root', kind: 'stage', name: 'Obra', children: [{ id: 'service', kind: 'item', code: 991003, resourceType: 'C', qty: 1 }] } };
    const template = await prisma.orcaproTemplate.create({ data: { code: `test-${randomUUID()}`, name: 'Exemplo teste', referenceId: ref1, uf: 'SP', regime: 'SD', data } });
    const one = await a.agent.post(`/api/v1/orcapro/templates/${template.id}/clone`).set('Origin', ORIGIN).send({}).expect(201);
    const two = await b.agent.post(`/api/v1/orcapro/templates/${template.id}/clone`).set('Origin', ORIGIN).send({}).expect(201);
    expect(one.body.id).not.toBe(two.body.id); expect(one.body.templateId).toBe(template.id);
    expect(one.body.ownerUserId).toBe(a.userId); expect(two.body.ownerUserId).toBe(b.userId);
    await a.agent.get(`/api/v1/orcapro/projects/${two.body.id}`).expect(404);
    const changed = { ...two.body.data, name: 'Meu exemplo privado' };
    await b.agent.put(`/api/v1/orcapro/projects/${two.body.id}`).set('Origin', ORIGIN).send({ expectedVersion: two.body.version, name: changed.name, data: changed }).expect(200);
    expect((await prisma.orcaproTemplate.findUniqueOrThrow({ where: { id: template.id } })).data).toEqual(data);
  });

  it('primeira entrada simultânea cria um único exemplo privado sem copiar SINAPI', async () => {
    const template = await prisma.orcaproTemplate.upsert({
      where: { code: 'EDIFICIO_4_PAVIMENTOS' }, update: {},
      create: { code: 'EDIFICIO_4_PAVIMENTOS', name: 'Edifício inicial de teste', referenceId: ref1, uf: 'SP', regime: 'SD',
        data: { bdi: 0.25, links: [], catalog: { inputs: [], compositions: [] }, root: { id: 'root', kind: 'stage', name: 'Obra', children: [] } } },
    });
    const responses = await Promise.all([1, 2, 3].map(() => sameTenant.post('/api/v1/orcapro/workspace/open').set('Origin', ORIGIN).send({}).expect(201)));
    expect(new Set(responses.map(r => r.body.id)).size).toBe(1);
    expect((await sameTenant.get('/api/v1/orcapro/projects').expect(200)).body).toHaveLength(1);
    const project = await sameTenant.get(`/api/v1/orcapro/projects/${responses[0].body.id}`).expect(200);
    expect(project.body.templateId).toBe(template.id);
    expect(project.body.referenceId).toBe(template.referenceId);
    expect(project.body.data.base).toBeUndefined();
    expect(project.body.version).toBe(1);
    await a.agent.get(`/api/v1/orcapro/projects/${project.body.id}`).expect(404);
    await b.agent.get(`/api/v1/orcapro/projects/${project.body.id}`).expect(404);
  });

  it('retoma o mais recente do proprietário sem alterar documento, referência ou versões', async () => {
    const current = await b.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(200);
    const updated = await b.agent.put(`/api/v1/orcapro/projects/${projectId}`).set('Origin', ORIGIN).send({ expectedVersion: current.body.version, data: current.body.data }).expect(200);
    const before = await b.agent.get(`/api/v1/orcapro/projects/${projectId}/versions`).expect(200);
    const count = await prisma.orcaproProject.count();
    const opened = await b.agent.post('/api/v1/orcapro/workspace/open').set('Origin', ORIGIN).send({}).expect(201);
    expect(opened.body).toEqual({ id: projectId });
    expect((await b.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(200)).body).toEqual(updated.body);
    expect((await b.agent.get(`/api/v1/orcapro/projects/${projectId}/versions`).expect(200)).body).toEqual(before.body);
    expect(await prisma.orcaproProject.count()).toBe(count);
    expect(updated.body.referenceId).toBe(ref1);
  });

  it('entrada direta ignora arquivados e exige sessão e Origin válido', async () => {
    await request(app.getHttpServer()).post('/api/v1/orcapro/workspace/open').set('Origin', ORIGIN).send({}).expect(401);
    await b.agent.post('/api/v1/orcapro/workspace/open').set('Origin', 'https://untrusted.example').send({}).expect(403);
    const recent = await b.agent.post('/api/v1/orcapro/projects').set('Origin', ORIGIN).send({ name: 'Arquivado não é entrada', uf: 'SP', regime: 'SD', referenceId: ref2 }).expect(201);
    await b.agent.delete(`/api/v1/orcapro/projects/${recent.body.id}`).set('Origin', ORIGIN).send({ expectedVersion: recent.body.version }).expect(200);
    expect((await b.agent.post('/api/v1/orcapro/workspace/open').set('Origin', ORIGIN).send({}).expect(201)).body.id).toBe(projectId);
  });

  it('desativa só o OrçaPro sem revogar sessão ou manutenção do usuário', async () => {
    await b.agent.patch(`/api/v1/orcapro/admin/users/${a.userId}/access`).set('Origin', ORIGIN).send({ enabled: false }).expect(403);
    await a.agent.patch(`/api/v1/orcapro/admin/users/${b.userId}/access`).set('Origin', ORIGIN).send({ enabled: false }).expect(200);
    await b.agent.get('/api/v1/orcapro/access').expect(403);
    await b.agent.post('/api/v1/orcapro/workspace/open').set('Origin', ORIGIN).send({}).expect(403);
    await b.agent.get('/api/v1/auth/me').expect(200);
    await b.agent.get('/api/v1/work-orders').expect(200);
    await a.agent.patch(`/api/v1/orcapro/admin/users/${b.userId}/access`).set('Origin', ORIGIN).send({ enabled: true }).expect(200);
    await b.agent.get('/api/v1/orcapro/access').expect(200);
    await a.agent.patch(`/api/v1/orcapro/admin/users/${a.userId}/access`).set('Origin', ORIGIN).send({ enabled: false }).expect(400);
  });

  it('arquiva e recupera somente orçamento próprio com controle de versão', async () => {
    const current = await b.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(200);
    await b.agent.delete(`/api/v1/orcapro/projects/${projectId}`).set('Origin', ORIGIN).send({ expectedVersion: current.body.version }).expect(200);
    await b.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(404);
    const archived = await b.agent.get('/api/v1/orcapro/projects').query({ archived: true }).expect(200);
    const row = archived.body.find((p: { id: string }) => p.id === projectId);
    expect(row).toBeTruthy();
    await a.agent.post(`/api/v1/orcapro/projects/${projectId}/unarchive`).set('Origin', ORIGIN).send({ expectedVersion: row.version }).expect(404);
    await b.agent.post(`/api/v1/orcapro/projects/${projectId}/unarchive`).set('Origin', ORIGIN).send({ expectedVersion: row.version }).expect(201);
    await b.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(200);
  });

  it('cria e reproduz riscos HTTP com custo unitário fracionário sem mudar o orçamento',async()=>{
    const created=await b.agent.post('/api/v1/orcapro/projects').set('Origin',ORIGIN).send({name:'Riscos com frações de centavo',referenceId:ref1,uf:'SP',regime:'SD',data:{bdi:0.25,root:{id:'root',kind:'stage',name:'Obra',children:[{id:'fractional',kind:'item',code:991003,resourceType:'C',qty:2.75,custo:1.23456}]}}}).expect(201);
    const path=`/api/v1/orcapro/projects/${created.body.id}/risks`;
    const made=await b.agent.post(path).set('Origin',ORIGIN).send({expectedVersion:created.body.version,name:'Análise fracionária'}).expect(201);
    let project=made.body.project;
    const analysis=project.data.risks.analyses[0],route=path+'/'+made.body.riskId;
    expect(analysis.snapshot.baseCents).toBe('340');
    expect(Number(analysis.snapshot.rows[0].unitCostCents)).toBeCloseTo(123.456,8);
    expect(project.data.root.children[0].custo).toBe(1.23456);
    const cfg=analysis.config;cfg.iterations=1000;cfg.variables[0]={...cfg.variables[0],min:10,mode:10,max:10,distribution:'fixo'};
    const configured=await b.agent.put(route).set('Origin',ORIGIN).send({expectedVersion:project.version,config:cfg}).expect(200);project=configured.body.project;
    const simulated=await b.agent.post(route+'/simulate').set('Origin',ORIGIN).send({expectedVersion:project.version}).expect(201);project=simulated.body.project;
    expect(project.data.risks.analyses[0].result.contingencyCents).toBe('34');
    const preview=await b.agent.post(route+'/bdi-preview').set('Origin',ORIGIN).send({expectedVersion:project.version,method:'param',mode:'replace'}).expect(201);
    expect(preview.body.rate).toBe('0.1000000000');
  });

  it('importa XLSX com progresso real, conserva o relatório e protege a comparação administrativa', async () => {
    const file = await sinapiWorkbookFixture();
    const route = '/api/v1/orcapro/admin/imports/file/stream';
    await b.agent.post(route).set('Origin', ORIGIN).attach('file', file, 'SINAPI_Referência_2036_09.xlsx').expect(403);
    await a.agent.post(route).set('Origin', 'https://untrusted.example').attach('file', file, 'SINAPI_Referência_2036_09.xlsx').expect(403);
    const prior = await b.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(200);
    const streamed = await a.agent.post(route).set('Origin', ORIGIN).field('revision', String(revision)).field('baselineReferenceId', ref1).attach('file', file, 'SINAPI_Referência_2036_09.xlsx').buffer(true).parse((response, done) => {
      let text = ''; response.on('data', (chunk: Buffer) => { text += chunk.toString('utf8'); }); response.on('end', () => done(null, text));
    }).expect(200);
    const events = String(streamed.body).trim().split('\n').map(line => JSON.parse(line));
    expect(events.find(event => event.type === 'error')).toBeUndefined();
    const progress = events.filter(event => event.type === 'progress');
    expect(progress.at(-1).percent).toBe(100); expect(progress.map(event => event.percent)).toEqual(progress.map(event => event.percent).sort((a,b) => a - b));
    const result = events.at(-1).result;
    expect(result.reference.status).toBe('DRAFT'); expect(result.report.sourceValidation).toMatchObject({ total: 2, ok: 2 });
    expect(result.report.comparison.baseline.id).toBe(ref1);
    const path = `/api/v1/orcapro/admin/references/${result.reference.id}/import-report`;
    await b.agent.get(path).expect(403); await b.agent.get(path + '.csv').expect(403);
    const report = await a.agent.get(path).query({ kind: 'C', pageSize: 1 }).expect(200);
    expect(report.body.items).toHaveLength(1); expect(report.body.report.comparison).not.toHaveProperty('items');
    expect((await a.agent.get(path + '.csv').expect(200)).text).toContain('Cadastro anterior');
    expect((await b.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(200)).body).toEqual(prior.body);
    await a.agent.post('/api/v1/orcapro/admin/imports').set('Origin', ORIGIN).send({ raw: rawBase('09'), sourceName: 'duplicate.json', revision }).expect(409);
    const refused = await a.agent.post('/api/v1/orcapro/admin/imports/stream').set('Origin', ORIGIN).send({ raw: rawBase('09'), sourceName: 'duplicate.json', revision }).expect(200);
    expect(refused.text).toContain('"type":"error","status":409'); expect(refused.text).not.toContain('"type":"result"');
    expect(await prisma.orcaproReference.count({ where: { year: 2036, month: 9, revision } })).toBe(1);
  });

  it('relata aba ausente com erro de formato e libera nova importação após a falha', async () => {
    const file = await sinapiWorkbookFixture('10/2036', ['Faltante','CSD','Analítico']);
    const route = '/api/v1/orcapro/admin/imports/file';
    const before = await prisma.orcaproReference.count();
    const response = await a.agent.post(route).set('Origin', ORIGIN).field('revision', String(revision)).attach('file', file, 'incomplete.xlsx').expect(400);
    expect(response.body.message).toContain('Aba obrigatória');
    expect(await prisma.orcaproReference.count()).toBe(before);
    // A second request reaches the parser rather than a stale concurrency lock.
    await a.agent.post(route).set('Origin', ORIGIN).field('revision', String(revision)).attach('file', file, 'incomplete.xlsx').expect(400);
  });

  it('versiona riscos privados, simula e recalcula BDI sem aceitar taxas do cliente',async()=>{
    const created=await b.agent.post('/api/v1/orcapro/projects').set('Origin',ORIGIN).send({name:'Riscos HTTP',referenceId:ref1,uf:'SP',regime:'SD',data:{bdi:0.25,bdi2:0.1,root:{id:'root',kind:'stage',name:'Obra',children:[{id:'service',kind:'item',code:991003,resourceType:'C',qty:1}]}}}).expect(201);
    let project=created.body;const path=`/api/v1/orcapro/projects/${project.id}/risks`;
    await request(app.getHttpServer()).post(path).set('Origin',ORIGIN).send({expectedVersion:1,name:'Risco'}).expect(401);
    await a.agent.post(path).set('Origin',ORIGIN).send({expectedVersion:1,name:'Risco'}).expect(404);
    const made=await b.agent.post(path).set('Origin',ORIGIN).send({expectedVersion:1,name:'Análise P80'}).expect(201);project=made.body.project;const riskId=made.body.riskId,route=path+'/'+riskId;
    expect(project.data.risks.analyses[0].snapshot.baseCents).toBe('700');
    await b.agent.post(path).set('Origin',ORIGIN).send({expectedVersion:1,name:'Conflito'}).expect(409);
    await a.agent.post(route+'/simulate').set('Origin',ORIGIN).send({expectedVersion:project.version}).expect(404);
    await b.agent.post(route+'/simulate').set('Origin','https://untrusted.example').send({expectedVersion:project.version}).expect(403);
    await b.agent.post(route+'/simulate').set('Origin',ORIGIN).send({expectedVersion:project.version,tenantId:a.tenantId}).expect(400);
    const cfg=project.data.risks.analyses[0].config;cfg.iterations=1000;cfg.variables[0]={...cfg.variables[0],min:10,mode:10,max:10,distribution:'fixo'};
    const own=await a.agent.post('/api/v1/orcapro/projects').set('Origin',ORIGIN).send({name:'Mesmo tenant riscos',referenceId:ref1,uf:'SP',regime:'SD',data:created.body.data}).expect(201);
    await sameTenant.post(`/api/v1/orcapro/projects/${own.body.id}/risks`).set('Origin',ORIGIN).send({expectedVersion:own.body.version,name:'Negado'}).expect(404);
    const configured=await b.agent.put(route).set('Origin',ORIGIN).send({expectedVersion:project.version,config:cfg}).expect(200);project=configured.body.project;
    const sim=await b.agent.post(route+'/simulate').set('Origin',ORIGIN).send({expectedVersion:project.version}).expect(201);project=sim.body.project;
    expect(project.data.risks.analyses[0].result.contingencyCents).toBe('70');expect(Number(project.data.risks.analyses[0].result.rate)).toBe(0.1);
    const forged=structuredClone(project.data);forged.risks.analyses[0].result.rate='5';
    await b.agent.put(`/api/v1/orcapro/projects/${project.id}`).set('Origin',ORIGIN).send({expectedVersion:project.version,data:forged}).expect(400);
    const {loadLegacyRuntime}=await import('../src/modules/orcapro/legacy/legacy-runtime');
    const runtime=loadLegacyRuntime(),computed=runtime.calculateProject(rawBase('01'),project.data);
    for(const method of ['param','exato','simples']){
      const preview=await b.agent.post(route+'/bdi-preview').set('Origin',ORIGIN).send({expectedVersion:project.version,method,mode:'replace'}).expect(201);
      const bdi=runtime.OP.bdiui,c=bdi.defaultsFor(computed.model.tot);c[method][method==='exato'?'risco':'r']=0.1;
      expect(preview.body.newBdi).toBe(bdi.valorAplicado(c,bdi.M[method].calc(c).bdi));expect(preview.body.rate).toBe('0.1000000000');
    }
    await b.agent.post(route+'/bdi-apply').set('Origin',ORIGIN).send({expectedVersion:project.version,method:'param',mode:'replace'}).expect(400);
    const applied=await b.agent.post(route+'/bdi-apply').set('Origin',ORIGIN).send({expectedVersion:project.version,method:'param',mode:'replace',reason:'Riscos alocados ao contratado; P80'}).expect(201);project=applied.body.project;
    expect(project.data.bdiCfg.param.r).toBe(0.1);expect(project.data.bdi2).toBe(0.1);expect(project.data.risks.analyses[0].applications).toHaveLength(1);
    expect(await prisma.orcaproAudit.count({where:{tenantId:b.tenantId,entityId:project.id,action:'risk.bdi.apply'}})).toBe(1);
    await b.agent.post(route+'/bdi-preview').set('Origin',ORIGIN).send({expectedVersion:project.version,method:'param',mode:'add'}).expect(409);
    await b.agent.post(route+'/bdi-preview').set('Origin',ORIGIN).send({expectedVersion:project.version,method:'param',mode:'add',confirmDoubleCounting:true}).expect(201);
    const changed=structuredClone(project.data);changed.root.children[0].qty=2;
    const saved=await b.agent.put(`/api/v1/orcapro/projects/${project.id}`).set('Origin',ORIGIN).send({expectedVersion:project.version,data:changed}).expect(200);project=saved.body;
    await b.agent.post(route+'/bdi-preview').set('Origin',ORIGIN).send({expectedVersion:project.version,method:'param',mode:'replace'}).expect(409);
    const historic=await b.agent.post(route+'/simulate').set('Origin',ORIGIN).send({expectedVersion:project.version}).expect(201);
    expect(historic.body.project.data.risks.analyses[0].result.contingencyCents).toBe('70');
    const cloned=await b.agent.post('/api/v1/orcapro/projects').set('Origin',ORIGIN).send({name:'Cópia sem fotografia órfã',referenceId:ref1,uf:'SP',regime:'SD',data:historic.body.project.data}).expect(201);
    expect(cloned.body.data.risks).toBeUndefined();
  });
});
