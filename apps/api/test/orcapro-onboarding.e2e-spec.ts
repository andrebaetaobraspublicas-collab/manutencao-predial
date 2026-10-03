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
const password = 'Local-Online-Test-2026!';
const secret = 'whsec_local_onboarding_only';
const marketing = 'https://orcaproobras.com.br/';
type Agent = ReturnType<typeof request.agent>;
type Account = { userId: string; tenantId: string; email: string; agent: Agent };

describe('OrçaPro online onboarding — MySQL, pending payment and isolated billing', () => {
  let app: INestApplication; let prisma: PrismaService; let planId: string; let referenceId: string;
  const key = randomUUID().replaceAll('-', ''); const old = new Map<string, string | undefined>();
  const names = ['ORCAPRO_ENABLED', 'ORCAPRO_ONLY', 'ORCAPRO_ADMIN_USER_IDS', 'CORS_ORIGINS', 'COOKIE_DOMAIN', 'COOKIE_SECURE', 'NOTIFICATION_WORKER_ENABLED', 'ORCAPRO_STRIPE_SECRET_KEY', 'ORCAPRO_STRIPE_WEBHOOK_SECRET', 'ORCAPRO_STRIPE_MODE', 'ORCAPRO_MARKETING_URL'];
  const sdk = new Stripe('sk_test_local_only');
  const remoteById = new Map<string, Stripe.Subscription>();
  const metadataByUser = new Map<string, Record<string, string>>();
  let address = 1;
  const options = () => ({ Origin: origin, 'X-Forwarded-For': `192.0.2.${address++ % 250 + 1}` });
  const price = { livemode: false, active: true, currency: 'brl', unit_amount: 9900, recurring: { interval: 'month', interval_count: 1 } };
  const retrievePrice = jest.fn(async () => price);
  const createCheckout = jest.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
    const metadata = params.metadata as Record<string, string>; metadataByUser.set(metadata.userId, metadata);
    return { id: `cs_test_${metadata.userId.replaceAll('-', '')}`, url: 'https://checkout.stripe.com/c/pay/local-only', status: 'open' };
  });
  const expireCheckout = jest.fn(async () => ({ status: 'expired' }));
  const createCustomer = jest.fn(async (params: Stripe.CustomerCreateParams) => ({ id: `cus_${String((params.metadata as Record<string, string>)?.userId).replaceAll('-', '')}` }));

  async function register(suffix: string): Promise<Account> {
    const email = `${suffix}-${key}@example.test`; const agent = request.agent(app.getHttpServer());
    const result = await agent.post('/api/v1/orcapro/billing/public/register').set(options()).send({ name: `Online ${suffix}`, email, password, planId }).expect(201);
    expect(result.body.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/local-only');
    return { email, agent, userId: result.body.user.userId, tenantId: result.body.tenant.id };
  }
  function deliver(event: Record<string, unknown>, signature?: string) {
    const payload = JSON.stringify(event);
    return request(app.getHttpServer()).post('/api/v1/orcapro/billing/webhooks/stripe').set('Content-Type', 'application/json').set('stripe-signature', signature ?? sdk.webhooks.generateTestHeaderString({ payload, secret })).send(payload);
  }
  async function activate(account: Account, suffix: string) {
    const row = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: account.userId } });
    const remote = { id: `sub_${account.userId.replaceAll('-', '')}`, livemode: false, customer: row.stripeCustomerId!, metadata: metadataByUser.get(account.userId)!, status: 'active', cancel_at_period_end: false, items: { data: [{ current_period_start: Math.floor(Date.now() / 1000), current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, price: { id: `price_${key}` } }] } } as unknown as Stripe.Subscription;
    remoteById.set(remote.id, remote);
    const event = { id: `evt_${key}_${suffix}`, livemode: false, type: 'checkout.session.completed', data: { object: { mode: 'subscription', metadata: remote.metadata, subscription: remote.id } } };
    await deliver(event).expect(201);
    return { row, remote, event };
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL || !/test|restore|staging/i.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('MySQL isolado obrigatório.');
    for (const name of names) old.set(name, process.env[name]);
    Object.assign(process.env, { ORCAPRO_ENABLED: 'true', ORCAPRO_ONLY: 'false', ORCAPRO_ADMIN_USER_IDS: '', CORS_ORIGINS: origin, COOKIE_DOMAIN: '', COOKIE_SECURE: 'false', NOTIFICATION_WORKER_ENABLED: 'false', ORCAPRO_STRIPE_SECRET_KEY: 'sk_test_local_only', ORCAPRO_STRIPE_WEBHOOK_SECRET: secret, ORCAPRO_STRIPE_MODE: 'TEST', ORCAPRO_MARKETING_URL: marketing });
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ rawBody: true }); app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.use(cookieParser()); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init(); prisma = app.get(PrismaService);
    const stripe = app.get(OrcaproStripeService);
    Object.defineProperty(stripe, 'stripe', { value: { webhooks: sdk.webhooks, prices: { retrieve: retrievePrice }, customers: { create: createCustomer }, checkout: { sessions: { create: createCheckout, expire: expireCheckout, retrieve: jest.fn(async () => ({ status: 'open', url: 'https://checkout.stripe.com/c/pay/local-only' })) } }, subscriptions: { retrieve: jest.fn(async (id: string) => remoteById.get(id)) } } });
    planId = (await prisma.orcaproPlan.create({ data: { code: `ONLINE_${key}`, name: `Online test ${key}`, priceBrl: '99.00', billingInterval: 'MONTH', stripePriceId: `price_${key}` } })).id;
  });
  afterAll(async () => { await app?.close(); for (const [name, value] of old) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

  it('lists only active online plans with a safe public contract', async () => {
    const manual = await prisma.orcaproPlan.create({ data: { code: `MANUAL_${key}`, name: 'Manual test', priceBrl: '99.00', billingInterval: 'MONTH' } });
    const inactive = await prisma.orcaproPlan.create({ data: { code: `HIDDEN_${key}`, name: 'Inactive test', priceBrl: '99.00', billingInterval: 'MONTH', stripePriceId: `price_hidden${key}`, active: false } });
    const result = await request(app.getHttpServer()).get('/api/v1/orcapro/billing/public/plans').expect(200);
    expect(result.body.plans.find((p: { id: string }) => p.id === planId)).toMatchObject({ billingInterval: 'MONTH', priceBrl: '99' });
    expect(result.body.plans.some((p: { id: string }) => [manual.id, inactive.id].includes(p.id))).toBe(false);
    expect(JSON.stringify(result.body)).not.toContain(`price_${key}`); expect(result.body.integration.mode).toBe('TEST');
    expect(JSON.stringify(result.body)).not.toContain('secret');
  });
  it('creates a private unpaid account without granting maintenance or a trial', async () => {
    const account = await register('pending');
    const membership = await prisma.tenantMembership.findFirstOrThrow({ where: { userId: account.userId } });
    const row = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: account.userId } });
    expect(membership.maintenanceAccess).toBe(false); expect(membership.role).toBe('REQUESTER');
    expect(row.status).toBe('UNPAID'); expect(row.currentPeriodEnd).toBeNull(); expect(row.billingSource).toBe('STRIPE');
    expect(await prisma.tenantSubscription.count({ where: { tenantId: account.tenantId } })).toBe(0);
    await account.agent.get('/api/v1/orcapro/projects').expect(403); await account.agent.get('/api/v1/work-orders').expect(403); await account.agent.get('/api/v1/orcapro/billing').expect(200);
    const params = createCheckout.mock.calls.find(([p]) => p.metadata?.userId === account.userId)![0];
    expect(params.cancel_url).toBe(marketing); expect(params.success_url).toContain('/orcapro/assinatura?checkout=success');
    const audit = await prisma.orcaproAudit.findFirstOrThrow({ where: { entityId: account.userId, action: 'saas.user.self-register' } });
    expect(JSON.stringify(audit.metadata)).not.toContain(password);
  });
  it('rejects unknown fields, untrusted origins and unavailable or wrong-mode prices before registering', async () => {
    const body = { name: 'Rejected account', email: `rejected-${key}@example.test`, password, planId };
    await request(app.getHttpServer()).post('/api/v1/orcapro/billing/public/register').set(options()).send({ ...body, tenantId: randomUUID() }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/orcapro/billing/public/register').set('Origin', 'https://evil.example').send(body).expect(403);
    retrievePrice.mockResolvedValueOnce({ ...price, livemode: true });
    await request(app.getHttpServer()).post('/api/v1/orcapro/billing/public/register').set(options()).send(body).expect(400);
    expect(await prisma.user.findUnique({ where: { email: body.email } })).toBeNull();
    await prisma.orcaproPlan.update({ where: { id: planId }, data: { active: false } });
    await request(app.getHttpServer()).post('/api/v1/orcapro/billing/public/register').set(options()).send(body).expect(400);
    await prisma.orcaproPlan.update({ where: { id: planId }, data: { active: true } });
  });
  it('serializes concurrent registration of the same identity without orphan organizations', async () => {
    const body = { name: `Concurrent ${key}`, email: `concurrent-${key}@example.test`, password, planId };
    const result = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post('/api/v1/orcapro/billing/public/register').set(options()).send(body)));
    expect(result.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count({ where: { email: body.email } })).toBe(1); expect(await prisma.tenant.count({ where: { name: body.name } })).toBe(1);
    expect(result.find(r => r.status === 409)!.body.message).toContain('Entre');
  });
  it('preserves a resumable unpaid session if Checkout fails after account creation', async () => {
    createCheckout.mockRejectedValueOnce(new Error('Synthetic unavailable Stripe'));
    const email = `resume-${key}@example.test`; const agent = request.agent(app.getHttpServer());
    const result = await agent.post('/api/v1/orcapro/billing/public/register').set(options()).send({ name: 'Resume test', email, password, planId }).expect(201);
    expect(result.body.checkoutUrl).toBeNull(); expect(result.body.checkoutError).toContain('Minha assinatura');
    expect(String(result.headers['set-cookie'])).toContain('HttpOnly');
    await agent.get('/api/v1/orcapro/billing').expect(200); await agent.get('/api/v1/orcapro/projects').expect(403);
    const row = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: result.body.user.userId } }); expect(row.status).toBe('UNPAID');
    const resumed = request.agent(app.getHttpServer());
    await resumed.post('/api/v1/auth/orcapro/login').set(options()).send({ email, password }).expect(200);
    await resumed.post('/api/v1/orcapro/billing/checkout').set('Origin', origin).send({ planId }).expect(201);
  });
  it('expires only an unpaid pending Checkout when the user explicitly selects another plan', async () => {
    const account = await register('change-plan');
    const before = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: account.userId } });
    const alternative = await prisma.orcaproPlan.create({ data: { code: `ALT_${key}`, name: 'Alternative online test', priceBrl: '99.00', billingInterval: 'MONTH', stripePriceId: `price_alt${key}` } });
    await account.agent.post('/api/v1/orcapro/billing/checkout').set('Origin', origin).send({ planId: alternative.id }).expect(201);
    expect(expireCheckout).toHaveBeenCalledWith(before.stripeCheckoutId, {}, { idempotencyKey: expect.any(String) });
    const current = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: account.userId } });
    expect(current.stripeCheckoutPriceId).toBe(alternative.stripePriceId); expect(current.status).toBe('UNPAID'); expect(current.stripeSubscriptionId).toBeNull();
    expect(createCheckout.mock.calls.filter(([p]) => p.metadata?.userId === account.userId).at(-1)![0].line_items![0].price).toBe(alternative.stripePriceId);
  });
  it('email login pins the licence tenant even when another membership exists; suspension prevents fallback', async () => {
    const account = await register('tenant-selection');
    const other = await prisma.tenant.create({ data: { name: 'Alternative test tenant', slug: `other-${key}`, status: 'ACTIVE' } });
    await prisma.tenantMembership.create({ data: { userId: account.userId, tenantId: other.id, role: 'OWNER', maintenanceAccess: true, createdAt: new Date(0) } });
    const logged = await request(app.getHttpServer()).post('/api/v1/auth/orcapro/login').set(options()).send({ email: account.email.toUpperCase(), password }).expect(200);
    expect(logged.body.user.tenantId).toBe(account.tenantId); expect(logged.body.user.maintenanceAccess).toBe(false);
    await request(app.getHttpServer()).post('/api/v1/auth/orcapro/login').set(options()).send({ email: account.email, password, tenantId: other.id }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/orcapro/login').set(options()).send({ email: account.email, password: 'wrong' }).expect(401);
    await prisma.tenant.update({ where: { id: account.tenantId }, data: { status: 'SUSPENDED' } });
    await request(app.getHttpServer()).post('/api/v1/auth/orcapro/login').set(options()).send({ email: account.email, password }).expect(401);
  });
  it('grants access only after a verified same-mode webhook and keeps private budgets isolated', async () => {
    const first = await register('paid-first'); const second = await register('paid-second');
    const row = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: first.userId } });
    const event = { id: `evt_${key}_crossmode`, livemode: true, type: 'customer.subscription.updated', data: { object: { id: 'sub_wrong', metadata: metadataByUser.get(first.userId) } } };
    await deliver(event).expect(400); expect((await prisma.orcaproSubscription.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(row.version);
    await deliver({ ...event, livemode: false }, 'invalid-signature').expect(400);
    const activated = await activate(first, 'paidfirst'); await activate(second, 'paidsecond');
    const version = (await prisma.orcaproSubscription.findUniqueOrThrow({ where: { id: row.id } })).version;
    await deliver(activated.event).expect(201); expect((await prisma.orcaproSubscription.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(version);
    referenceId = (await prisma.orcaproReference.create({ data: { year: 2039, month: 1, revision: parseInt(key.slice(0, 7), 16), label: 'Synthetic online reference', status: 'PUBLISHED', sourceChecksum: '0'.repeat(64), sourceName: 'synthetic-onboarding-test', importedByUserId: first.userId, publishedAt: new Date(), metadata: { ufs: ['SP'] } } })).id;
    const created = await first.agent.post('/api/v1/orcapro/projects').set('Origin', origin).send({ name: 'Private paid project', referenceId, uf: 'SP', regime: 'SD' }).expect(201);
    await second.agent.get(`/api/v1/orcapro/projects/${created.body.id}`).expect(404);
    await first.agent.get('/api/v1/work-orders').expect(403);
    const current = await prisma.orcaproSubscription.findUniqueOrThrow({ where: { id: row.id } });
    const remote = { ...activated.remote, livemode: true }; remoteById.set(remote.id, remote);
    await deliver({ ...activated.event, id: `evt_${key}_remoteWrongMode` }).expect(400);
    expect((await prisma.orcaproSubscription.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(current.version);
  });
  it('handles payment failure and recovery from current subscription state without changing maintenance', async () => {
    const account = await register('invoice'); const { remote } = await activate(account, 'invoiceactivate');
    remoteById.set(remote.id, { ...remote, status: 'past_due' });
    const data = { object: { parent: { subscription_details: { subscription: remote.id } } } };
    await deliver({ id: `evt_${key}_failed`, livemode: false, type: 'invoice.payment_failed', data }).expect(201);
    await account.agent.get('/api/v1/orcapro/projects').expect(403); await account.agent.get('/api/v1/orcapro/billing').expect(200);
    remoteById.set(remote.id, remote);
    await deliver({ id: `evt_${key}_paid`, livemode: false, type: 'invoice.paid', data }).expect(201);
    await account.agent.get('/api/v1/orcapro/projects').expect(200);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: account.tenantId } })).status).toBe('ACTIVE');
    expect(await prisma.tenantSubscription.count({ where: { tenantId: account.tenantId } })).toBe(0);
  });
  it('fails closed when billing configuration is incomplete but keeps public account rejection clear', async () => {
    const config = app.get(ConfigService); config.set('ORCAPRO_STRIPE_WEBHOOK_SECRET', ''); config.set('STRIPE_WEBHOOK_SECRET', '');
    const result = await request(app.getHttpServer()).get('/api/v1/orcapro/billing/public/plans').expect(200); expect(result.body.plans).toEqual([]);
    const email = `notconfigured-${key}@example.test`;
    await request(app.getHttpServer()).post('/api/v1/orcapro/billing/public/register').set(options()).send({ name: 'Not configured', email, password, planId }).expect(503);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    config.set('ORCAPRO_STRIPE_WEBHOOK_SECRET', secret);
  });
  it('blocks maintenance self-registration bypass in commercial OrçaPro mode and preserves the development trial route', async () => {
    const config = app.get(ConfigService);
    const email = `maintenance-bypass-${key}@example.test`;
    const body = { tenantName: 'Development maintenance trial', tenantSlug: `bypass-${key}`, ownerName: 'Development owner', email, password };
    config.set('ORCAPRO_ONLY', 'true');
    try {
      await request(app.getHttpServer()).post('/api/v1/auth/register-tenant').send(body).expect(403);
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
      expect(await prisma.tenant.findUnique({ where: { slug: body.tenantSlug } })).toBeNull();
    } finally { config.set('ORCAPRO_ONLY', 'false'); }
    const created = await request(app.getHttpServer()).post('/api/v1/auth/register-tenant').send(body).expect(201);
    const membership = await prisma.tenantMembership.findFirstOrThrow({ where: { userId: created.body.user.userId } });
    expect(membership.maintenanceAccess).toBe(true);
    expect((await prisma.orcaproSubscription.findUniqueOrThrow({ where: { userId: created.body.user.userId } })).status).toBe('TRIALING');
  });
});
