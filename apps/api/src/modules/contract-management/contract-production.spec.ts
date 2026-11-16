import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe-gestao';
import { contractEnvironment, contractProduction } from './contract-environment';
import { readonlyPrisma, assertReadQuery } from './contract-readonly';
import { baseSubscriptionActive, ContractSources } from './contract-sources';
import { ContractBillingService } from './contract-billing.service';

jest.mock('stripe-gestao', () => ({ __esModule: true, default: jest.fn() }));
const production = { GESTAO_ENABLED: 'true', GESTAO_STANDALONE: 'true', WEB_BASE_URL: 'https://www.orcaprogestaocontratual.com.br', GESTAO_STRIPE_MODE: 'live', GESTAO_STRIPE_SECRET_KEY: 'rk_live_fixture', GESTAO_STRIPE_PRICE_ID: 'price_gc_month', GESTAO_STRIPE_WEBHOOK_SECRET: 'whsec_fixture' };
const user: any = { userId: 'user-a', tenantId: 'tenant-a', email: 'a@example.invalid', name: 'A' };
describe('Gestão production isolation and subscription prerequisite', () => {
  beforeEach(() => jest.clearAllMocks());
  it('requires standalone mode and the dedicated HTTPS host', () => {
    expect(contractProduction(new ConfigService(production))).toBe(true);
    for (const WEB_BASE_URL of ['https://sistema.orcaproobras.com.br', 'https://orcaproinfra.com.br', 'https://gestaodepredios.com.br', 'http://orcaprogestaocontratual.com.br']) expect(contractEnvironment(new ConfigService({ ...production, WEB_BASE_URL }))).toBe(false);
    expect(contractEnvironment(new ConfigService({ ...production, GESTAO_STANDALONE: 'false' }))).toBe(false);
  });
  it('accepts current paid/manual subscriptions but rejects absent, expired and trial access', () => {
    const future = new Date(Date.now() + 86400000);
    expect(baseSubscriptionActive({ status: 'ACTIVE', billingSource: 'STRIPE', currentPeriodEnd: future })).toBe(true);
    expect(baseSubscriptionActive({ status: 'MANUAL_CONTRACT', billingSource: 'MANUAL' })).toBe(true);
    for (const row of [null, { status: 'TRIALING', currentPeriodEnd: future }, { status: 'PAST_DUE' }, { status: 'ACTIVE', billingSource: 'STRIPE' }, { status: 'ACTIVE', currentPeriodEnd: new Date(0) }]) expect(baseSubscriptionActive(row)).toBe(false);
  });
  it('blocks source model writes, arbitrary SQL and transactional writes', async () => {
    const original = { user: { findUnique: jest.fn(async () => ({ id: 'source' })), update: jest.fn() }, $executeRawUnsafe: jest.fn(), $transaction: jest.fn(), $disconnect: jest.fn() };
    const client = readonlyPrisma(original);
    await expect(client.user.findUnique()).resolves.toEqual({ id: 'source' });
    expect(() => client.user.update()).toThrow(ForbiddenException);
    expect(() => client.$executeRawUnsafe()).toThrow(ForbiddenException);
    expect(() => client.$transaction()).toThrow(ForbiddenException);
    for (const sql of ['UPDATE InfraProject SET version=1', 'SELECT 1; DELETE FROM User', 'SELECT * FROM User FOR UPDATE', "SELECT passwordHash INTO OUTFILE '/tmp/leak' FROM User", 'SELECT GET_LOCK(?,1)']) expect(() => assertReadQuery(sql)).toThrow(ForbiddenException);
    expect(() => assertReadQuery('SELECT * FROM InfraProject WHERE id=? AND tenant_id=? AND user_id=?')).not.toThrow();
    expect(original.user.update).not.toHaveBeenCalled(); expect(original.$executeRawUnsafe).not.toHaveBeenCalled();
  });
  it('never overwrites a local identity during source login', async () => {
    const primary: any = { user: { findUnique: jest.fn(async () => ({ id: 'local' })) }, $transaction: jest.fn() };
    const service = new ContractSources(new ConfigService(), {} as any, primary);
    (service as any).candidate = jest.fn();
    await service.prepareLogin('a@example.invalid', 'secret');
    expect((service as any).candidate).not.toHaveBeenCalled(); expect(primary.$transaction).not.toHaveBeenCalled();
  });
  it('refuses first-account creation without an active base subscription', async () => {
    const primary: any = { user: { findUnique: jest.fn(async () => null) }, $transaction: jest.fn() };
    const service = new ContractSources(new ConfigService(), {} as any, primary);
    (service as any).candidate = jest.fn(async () => ({ entitled: false }));
    await expect(service.prepareLogin('a@example.invalid', 'secret')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(primary.$transaction).not.toHaveBeenCalled();
  });
  it('scopes eligibility to the local tenant and user, accepts either product and fails closed', async () => {
    const db: any = { query: jest.fn(async () => [{ product: 'ORCAPRO', source_user_id: 'a', source_tenant_id: 'source-a' }, { product: 'INFRA', source_user_id: 'b', source_tenant_id: 'source-b' }]) };
    const service = new ContractSources(new ConfigService(), db, {} as any);
    (service as any).candidate = jest.fn(async (product: string) => ({ entitled: product === 'INFRA' }));
    expect(await service.eligibility(user)).toMatchObject({ eligible: true, products: ['INFRA'] });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('tenant_id=? AND user_id=?'), ['tenant-a', 'user-a']);
    (service as any).candidate.mockRejectedValue(new Error('offline'));
    expect(await service.eligibility(user)).toMatchObject({ eligible: false, unavailable: true });
  });
  it('rejects a direct checkout without a base licence before any Stripe mutation', async () => {
    const db: any = { enabled: () => true, query: jest.fn() }, sources: any = { eligibility: jest.fn(async () => ({ eligible: false, message: 'Base necessária' })) };
    const billing = new ContractBillingService(db, new ConfigService(production), undefined, sources);
    await expect(billing.checkout(user, '0b363b17-876a-42a7-8e86-988e6359bced')).rejects.toBeInstanceOf(ForbiddenException);
    expect(Stripe).not.toHaveBeenCalled(); expect(db.query).not.toHaveBeenCalled();
  });
  it('requires a source adapter in production and refuses test webhooks', async () => {
    const db: any = { enabled: () => true, query: jest.fn(async () => []) };
    const billing = new ContractBillingService(db, new ConfigService(production));
    expect(await billing.access(user)).toMatchObject({ testMode: false, canCheckout: false, prerequisite: { eligible: false } });
    db.query.mockClear();
    (Stripe as any).mockImplementation(() => ({ webhooks: { constructEvent: () => ({ livemode: false }) } }));
    await expect(billing.webhook(Buffer.from('{}'), 'sig')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });
});
