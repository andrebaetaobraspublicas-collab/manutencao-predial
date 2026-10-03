import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import Stripe from 'stripe';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrcaproStripeService } from '../src/modules/orcapro/orcapro-stripe.service';

const origin = 'http://localhost:3000';
const password = 'Local-SaaS-Test-2026!88';
const newPassword = 'Local-SaaS-New-2026!99';
const secret = 'whsec_local_test_only';
type Agent = ReturnType<typeof request.agent>;
type Identity = { userId: string; tenantId: string; slug: string; email: string; agent: Agent };

describe('OrçaPro SaaS — gestão global e licença por usuário em MySQL', () => {
  let app: INestApplication; let prisma: PrismaService; let admin: Identity; let other: Identity; let customer: Identity; let neighbor: Identity;
  let planId: string; let projectId: string; let referenceId: string; let stripeService: OrcaproStripeService;
  let remote: Stripe.Subscription; let checkoutMetadata: Record<string, string> = {};
  const key = randomUUID().replaceAll('-', '');
  const old = new Map<string, string | undefined>();
  const env = ['ORCAPRO_ENABLED', 'ORCAPRO_ADMIN_USER_IDS', 'ORCAPRO_TENANT_IDS', 'CORS_ORIGINS', 'COOKIE_DOMAIN', 'COOKIE_SECURE', 'NOTIFICATION_WORKER_ENABLED', 'ORCAPRO_STRIPE_SECRET_KEY', 'ORCAPRO_STRIPE_WEBHOOK_SECRET', 'ORCAPRO_STRIPE_MODE', 'ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID'];
  const sdk = new Stripe('sk_test_local_only');
  const retrieveSubscription = jest.fn(async () => remote);
  const createCheckout = jest.fn(async (params: Stripe.Checkout.SessionCreateParams) => { checkoutMetadata = params.metadata as Record<string, string>; return { id: `cs_test_${key}`, url: 'https://checkout.stripe.com/c/pay/test', status: 'open' }; });
  const createCustomer = jest.fn(async () => ({ id: `cus_${key}` }));
  const createPortal = jest.fn(async () => ({ livemode: false, url: 'https://billing.stripe.com/p/session/test' }));
  const retrievePortalConfiguration = jest.fn(async () => ({ id: `bpc_${key}`, active: true, livemode: false }));
  const retrievePrice = jest.fn(async () => ({ livemode: false, active: true, currency: 'brl', unit_amount: 9900, recurring: { interval: 'month', interval_count: 1 } }));
  const updateSubscription = jest.fn(async (_id: string, params: { cancel_at_period_end: boolean }) => ({ ...remote, cancel_at_period_end: params.cancel_at_period_end }));

  async function login(identity: Identity, pass = password) {
    identity.agent = request.agent(app.getHttpServer());
    return identity.agent.post('/api/v1/auth/login').send({ tenantSlug: identity.slug, email: identity.email, password: pass });
  }
  async function register(suffix: string): Promise<Identity> {
    const slug = `saas-${suffix}-${key.slice(0, 12)}`; const email = `${slug}@example.test`; const agent = request.agent(app.getHttpServer());
    const response = await agent.post('/api/v1/auth/register-tenant').send({ tenantName: `SaaS teste ${suffix}`, tenantSlug: slug, ownerName: `Teste ${suffix}`, email, password }).expect(201);
    return { slug, email, agent, userId: response.body.user.userId, tenantId: response.body.user.tenantId };
  }
  async function createCustomerAccount(suffix: string, organization = true): Promise<Identity> {
    const email = `saas-customer-${suffix}-${key}@example.test`; const slug = `saas-customer-${suffix}-${key.slice(0, 12)}`;
    const response = await admin.agent.post('/api/v1/orcapro/admin/saas/users').set('Origin', origin).send({ name: `Cliente ${suffix}`, email, password, ...(organization ? { organizationName: `Cliente ${suffix}`, organizationSlug: slug } : {}) }).expect(201);
    const tenantSlug = response.body.organizationSlug;
    const membership = await prisma.tenantMembership.findFirstOrThrow({ where: { userId: response.body.id } });
    const identity = { userId: response.body.id, tenantId: membership.tenantId, slug: tenantSlug, email, agent: request.agent(app.getHttpServer()) };
    expect((await login(identity)).status).toBe(200);
    return identity;
  }
  async function signed(event: Record<string, unknown>, signature?: string) {
    const payload = JSON.stringify(event);
    return request(app.getHttpServer()).post('/api/v1/orcapro/billing/webhooks/stripe').set('Content-Type', 'application/json').set('stripe-signature', signature ?? sdk.webhooks.generateTestHeaderString({ payload, secret })).send(payload);
  }
  function event(id: string, status = 'past_due') {
    return { id: `evt_${key}_${id}`, object: 'event', livemode: false, type: 'customer.subscription.updated', data: { object: { ...remote, status } } };
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL || !/test|restore|staging/i.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('MySQL isolado obrigatório.');
    for (const name of env) old.set(name, process.env[name]);
    Object.assign(process.env, { ORCAPRO_ENABLED: 'true', ORCAPRO_ADMIN_USER_IDS: '', ORCAPRO_TENANT_IDS: '', CORS_ORIGINS: origin, COOKIE_DOMAIN: '', COOKIE_SECURE: 'false', NOTIFICATION_WORKER_ENABLED: 'false', ORCAPRO_STRIPE_SECRET_KEY: 'sk_test_local_only', ORCAPRO_STRIPE_WEBHOOK_SECRET: secret, ORCAPRO_STRIPE_MODE: 'TEST', ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID: '' });
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true }); app.use(cookieParser()); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService); admin = await register('admin'); other = await register('owner');
    app.get(ConfigService).set('ORCAPRO_ADMIN_USER_IDS', admin.userId);
    referenceId = (await prisma.orcaproReference.create({ data: { year: 2037, month: 12, revision: parseInt(key.slice(0, 7), 16), label: 'Referência vazia de teste SaaS', status: 'PUBLISHED', sourceChecksum: '0'.repeat(64), sourceName: 'synthetic-saas-test', importedByUserId: admin.userId, publishedAt: new Date(), metadata: { ufs: ['SP'] } } })).id;
    stripeService = app.get(OrcaproStripeService);
    Object.defineProperty(stripeService, 'stripe', { value: { webhooks: sdk.webhooks, prices: { retrieve: retrievePrice }, customers: { create: createCustomer }, checkout: { sessions: { create: createCheckout, retrieve: jest.fn(async () => ({ status: 'open', url: 'https://checkout.stripe.com/c/pay/test' })) } }, subscriptions: { retrieve: retrieveSubscription, update: updateSubscription }, billingPortal: { configurations: { retrieve: retrievePortalConfiguration }, sessions: { create: createPortal } } } });
  });
  afterAll(async () => { await app?.close(); for (const [name, value] of old) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

  it('protege diretório global e cadastro contra OWNER, anônimo, Origin e tenantId arbitrário', async () => {
    await request(app.getHttpServer()).get('/api/v1/orcapro/admin/saas/users').expect(401);
    await other.agent.get('/api/v1/orcapro/admin/saas/users').expect(403);
    await other.agent.post('/api/v1/orcapro/admin/saas/users').set('Origin', origin).send({ name: 'Intruso', email: 'intruso@example.test', password }).expect(403);
    await admin.agent.post('/api/v1/orcapro/admin/saas/users').set('Origin', 'https://invalid.example').send({ name: 'Intruso', email: 'intruso@example.test', password }).expect(403);
    await admin.agent.post('/api/v1/orcapro/admin/saas/users').set('Origin', origin).send({ name: 'Intruso', email: 'intruso@example.test', password, tenantId: other.tenantId }).expect(400);
  });
  it('cria acesso exclusivo ao OrçaPro com teste individual, sem preço ou plano inventado', async () => {
    customer = await createCustomerAccount('one'); neighbor = await createCustomerAccount('two', false);
    const membership = await prisma.tenantMembership.findFirstOrThrow({ where: { userId: customer.userId } });
    expect(membership.maintenanceAccess).toBe(false); expect(membership.role).toBe('REQUESTER');
    const sub = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } });
    expect(sub.status).toBe('TRIALING'); expect(sub.planId).toBeNull(); expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
    await customer.agent.get('/api/v1/orcapro/projects').expect(200); await customer.agent.get('/api/v1/work-orders').expect(403);
    await other.agent.get('/api/v1/work-orders').expect(200);
    const rows = await admin.agent.get('/api/v1/orcapro/admin/saas/users').query({ search: customer.email }).expect(200);
    expect(rows.body.items[0].passwordHash).toBeUndefined(); expect(rows.body.items[0].accessAllowed).toBe(true);
  });
  it('cadastra planos decimais e impede duplicação ou atualização perdida', async () => {
    const body = { code: `P${key.toUpperCase()}`, name: 'Plano de teste', billingInterval: 'MONTH', priceBrl: '99.00', stripePriceId: `price_${key}`, active: true };
    const response = await admin.agent.post('/api/v1/orcapro/admin/saas/plans').set('Origin', origin).send(body).expect(201);
    planId = response.body.id; expect(response.body.priceBrl).toBe('99');
    await admin.agent.post('/api/v1/orcapro/admin/saas/plans').set('Origin', origin).send(body).expect(409);
    await admin.agent.put(`/api/v1/orcapro/admin/saas/plans/${planId}`).set('Origin', origin).send({ ...body, expectedVersion: 1 }).expect(200);
    await admin.agent.put(`/api/v1/orcapro/admin/saas/plans/${planId}`).set('Origin', origin).send({ ...body, expectedVersion: 1 }).expect(409);
  });
  it('vencimento bloqueia apenas licença individual e permite renovar na área de assinatura', async () => {
    await prisma.orcaproSubscription.update({ where: { userId: customer.userId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await customer.agent.get('/api/v1/orcapro/projects').expect(403); await customer.agent.get('/api/v1/orcapro/billing').expect(200);
    await neighbor.agent.get('/api/v1/orcapro/projects').expect(200);
    const sub = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } });
    const body = { status: 'ACTIVE', planId, expectedVersion: sub.version, currentPeriodEnd: new Date(Date.now() + 60 * 86400000).toISOString(), reason: 'Pagamento manual confirmado no teste' };
    await other.agent.put(`/api/v1/orcapro/admin/saas/users/${customer.userId}/subscription`).set('Origin', origin).send(body).expect(403);
    await admin.agent.put(`/api/v1/orcapro/admin/saas/users/${customer.userId}/subscription`).set('Origin', origin).send(body).expect(200);
    await admin.agent.put(`/api/v1/orcapro/admin/saas/users/${customer.userId}/subscription`).set('Origin', origin).send(body).expect(409);
    const current = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } });
    const concurrent = await Promise.all([1, 2].map(() => admin.agent.put(`/api/v1/orcapro/admin/saas/users/${customer.userId}/subscription`).set('Origin', origin).send({ ...body, expectedVersion: current.version })));
    expect(concurrent.map(r => r.status).sort()).toEqual([200, 409]);
    await customer.agent.get('/api/v1/orcapro/projects').expect(200); expect(createCheckout).not.toHaveBeenCalled();
    const own = await customer.agent.get('/api/v1/orcapro/billing').expect(200); expect(own.body.subscription.userId).toBe(customer.userId);
    await customer.agent.get('/api/v1/orcapro/billing').query({ userId: neighbor.userId }).expect(200).then(r => expect(r.body.subscription.userId).toBe(customer.userId));
  });
  it('cadastro da manutenção não contorna cobrança individual nem renova teste ao ganhar outro vínculo', async () => {
    const grant = await prisma.orcaproUserAccess.findUniqueOrThrow({ where: { userId: other.userId } }); expect(grant.managed).toBe(true);
    const sub = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: other.userId } });
    await prisma.orcaproSubscription.update({ where: { userId: other.userId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await other.agent.get('/api/v1/orcapro/projects').expect(403); await other.agent.get('/api/v1/work-orders').expect(200);
    await prisma.orcaproSubscription.update({ where: { userId: other.userId }, data: { currentPeriodEnd: sub.currentPeriodEnd } });
  });
  it('preserva orçamentos e manutenção na exclusão recuperável e protege administradores globais', async () => {
    const created = await other.agent.post('/api/v1/orcapro/projects').set('Origin', origin).send({ name: 'Preservado após exclusão', referenceId, uf: 'SP', regime: 'SD' }).expect(201); projectId = created.body.id;
    await admin.agent.patch(`/api/v1/orcapro/admin/saas/users/${admin.userId}/status`).set('Origin', origin).send({ status: 'DELETED' }).expect(400);
    await admin.agent.post(`/api/v1/orcapro/admin/saas/users/${admin.userId}/password`).set('Origin', origin).send({ newPassword }).expect(400);
    await admin.agent.patch(`/api/v1/orcapro/admin/saas/users/${other.userId}/status`).set('Origin', origin).send({ status: 'DELETED' }).expect(200);
    await other.agent.get('/api/v1/auth/me').expect(401); expect((await login(other)).status).toBe(200);
    await other.agent.get('/api/v1/work-orders').expect(200); await other.agent.get('/api/v1/orcapro/projects').expect(403);
    expect(await prisma.orcaproProject.findUnique({ where: { id: projectId } })).toBeTruthy(); expect((await prisma.user.findUniqueOrThrow({ where: { id: other.userId } })).deletedAt).toBeNull();
    await admin.agent.patch(`/api/v1/orcapro/admin/saas/users/${other.userId}/status`).set('Origin', origin).send({ status: 'ACTIVE' }).expect(200);
    expect((await login(other)).status).toBe(200); await other.agent.get(`/api/v1/orcapro/projects/${projectId}`).expect(200);
  });
  it('senha revoga JWT e refresh em todas organizações sem registrar senha ou hash', async () => {
    const extra = await prisma.tenantMembership.create({ data: { userId: customer.userId, tenantId: admin.tenantId, role: 'REQUESTER', status: 'ACTIVE', maintenanceAccess: false } });
    const before = await prisma.tenantMembership.findMany({ where: { userId: customer.userId } });
    await admin.agent.post(`/api/v1/orcapro/admin/saas/users/${customer.userId}/password`).set('Origin', origin).send({ newPassword }).expect(201);
    await customer.agent.get('/api/v1/auth/me').expect(401); await customer.agent.post('/api/v1/auth/refresh').set('Origin', origin).expect(401);
    expect((await login(customer)).status).toBe(401); expect((await login(customer, newPassword)).status).toBe(200);
    for (const membership of await prisma.tenantMembership.findMany({ where: { userId: customer.userId } })) expect(membership.sessionVersion).toBe(before.find(m => m.id === membership.id)!.sessionVersion + 1);
    expect(await prisma.refreshSession.count({ where: { userId: customer.userId, revokedAt: null, membershipId: extra.id } })).toBe(0);
    const audit = await prisma.orcaproAudit.findFirstOrThrow({ where: { entityId: customer.userId, action: 'saas.user.password' } });
    expect(JSON.stringify(audit.metadata)).not.toContain(newPassword); expect(JSON.stringify(audit.metadata)).not.toContain('passwordHash');
  });
  it('cancelamento da manutenção não impede OrçaPro contratado; suspensão organizacional bloqueia tudo', async () => {
    await prisma.tenant.update({ where: { id: customer.tenantId }, data: { status: 'CANCELED' } });
    expect((await login(customer, newPassword)).status).toBe(200); await customer.agent.get('/api/v1/orcapro/projects').expect(200); await customer.agent.get('/api/v1/work-orders').expect(403);
    await customer.agent.post('/api/v1/auth/refresh').set('Origin', origin).expect(200);
    await prisma.tenant.update({ where: { id: customer.tenantId }, data: { status: 'SUSPENDED' } });
    await customer.agent.get('/api/v1/orcapro/projects').expect(401); expect((await login(customer, newPassword)).status).toBe(401);
    await prisma.tenant.update({ where: { id: customer.tenantId }, data: { status: 'ACTIVE' } }); expect((await login(customer, newPassword)).status).toBe(200);
  });
  it('checkout concorrente gera apenas uma contratação por usuário e valida preço Stripe', async () => {
    retrievePrice.mockResolvedValueOnce({ livemode: false, active: true, currency: 'usd', unit_amount: 9900, recurring: { interval: 'month', interval_count: 1 } });
    await customer.agent.post('/api/v1/orcapro/billing/checkout').set('Origin', origin).send({ planId }).expect(400);
    const responses = await Promise.all([1, 2].map(() => customer.agent.post('/api/v1/orcapro/billing/checkout').set('Origin', origin).send({ planId }).expect(201)));
    expect(responses[0].body.url).toBe(responses[1].body.url); expect(createCheckout).toHaveBeenCalledTimes(1); expect(createCustomer).toHaveBeenCalledTimes(1);
    const row = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } });
    expect(checkoutMetadata.userId).toBe(customer.userId); expect(checkoutMetadata.activationVersion).toBe(String(row.version));
    const pendingPlan = await prisma.orcaproPlan.findUniqueOrThrow({ where: { id: planId } });
    await admin.agent.put(`/api/v1/orcapro/admin/saas/plans/${planId}`).set('Origin', origin).send({ code: pendingPlan.code, name: pendingPlan.name, billingInterval: 'MONTH', priceBrl: '109.00', active: true, stripePriceId: pendingPlan.stripePriceId, expectedVersion: pendingPlan.version }).expect(409);
    remote = { id: `sub_${key}`, livemode: false, customer: row.stripeCustomerId!, metadata: checkoutMetadata, status: 'active', cancel_at_period_end: false, items: { data: [{ current_period_start: Math.floor(Date.now() / 1000), current_period_end: Math.floor(Date.now() / 1000) + 864000, price: { id: `price_${key}` } }] } } as unknown as Stripe.Subscription;
  });
  it('webhook verifica assinatura, ativa fonte Stripe, deduplica e usa estado atual em eventos atrasados', async () => {
    const tenantBefore = await prisma.tenant.findUniqueOrThrow({ where: { id: customer.tenantId } });
    const evt = event('first'); const before = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } });
    expect((await signed(evt, 'bad')).status).toBe(400); expect((await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } })).version).toBe(before.version);
    expect((await signed(evt)).status).toBe(201); const updated = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } });
    expect(updated.billingSource).toBe('STRIPE'); expect(updated.status).toBe('ACTIVE'); expect(updated.stripeCheckoutId).toBeNull();
    expect((await signed(evt)).status).toBe(201); expect((await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } })).version).toBe(updated.version);
    expect((await signed(event('late', 'canceled'))).status).toBe(201); expect((await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } })).status).toBe('ACTIVE');
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: customer.tenantId } })).status).toBe(tenantBefore.status);
  });
  it('controle manual prevalece sobre webhook; retomar Stripe e cancelamento exigem versão e auditoria', async () => {
    let sub = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } });
    await admin.agent.put(`/api/v1/orcapro/admin/saas/users/${customer.userId}/subscription`).set('Origin', origin).send({ status: 'MANUAL_CONTRACT', planId, expectedVersion: sub.version, reason: 'Contrato negociado e registrado' }).expect(200);
    remote = { ...remote, status: 'past_due' }; expect((await signed(event('manual'))).status).toBe(201);
    sub = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } }); expect(sub.status).toBe('MANUAL_CONTRACT'); expect(sub.stripeStatus).toBe('past_due'); expect(updateSubscription).not.toHaveBeenCalled();
    await customer.agent.get('/api/v1/orcapro/projects').expect(200);
    app.get(ConfigService).set('ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID', `bpc_${key}`);
    await customer.agent.post('/api/v1/orcapro/billing/portal').set('Origin', origin).send({}).expect(201);
    expect(retrievePortalConfiguration).toHaveBeenCalledWith(`bpc_${key}`);
    expect(createPortal).toHaveBeenCalledWith({ customer: sub.stripeCustomerId, return_url: expect.stringContaining('/orcapro/assinatura'), configuration: `bpc_${key}` });
    await neighbor.agent.post('/api/v1/orcapro/billing/portal').set('Origin', origin).send({}).expect(400);
    await other.agent.post(`/api/v1/orcapro/admin/saas/subscriptions/${sub.id}/stripe`).set('Origin', origin).send({ action: 'SYNC', expectedVersion: sub.version }).expect(403);
    await admin.agent.post(`/api/v1/orcapro/admin/saas/subscriptions/${sub.id}/stripe`).set('Origin', origin).send({ action: 'SYNC', expectedVersion: sub.version - 1 }).expect(409);
    await admin.agent.post(`/api/v1/orcapro/admin/saas/subscriptions/${sub.id}/stripe`).set('Origin', origin).send({ action: 'SYNC', expectedVersion: sub.version }).expect(201);
    await customer.agent.get('/api/v1/orcapro/projects').expect(403); await customer.agent.get('/api/v1/orcapro/billing').expect(200);
    sub = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: customer.userId } });
    await admin.agent.post(`/api/v1/orcapro/admin/saas/subscriptions/${sub.id}/stripe`).set('Origin', origin).send({ action: 'CANCEL_AT_PERIOD_END', expectedVersion: sub.version }).expect(201);
    expect(updateSubscription).toHaveBeenCalledWith(remote.id, { cancel_at_period_end: true }, { idempotencyKey: expect.any(String) });
  });
});
