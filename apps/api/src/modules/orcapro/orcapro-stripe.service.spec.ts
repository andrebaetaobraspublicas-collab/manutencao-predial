import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrcaproAccess } from './orcapro.guard';
import { OrcaproStripeService } from './orcapro-stripe.service';

describe('OrçaPro dedicated customer portal', () => {
  const user = { userId: 'isolated-user' } as AuthenticatedUser;
  const configuration = 'bpc_orcaproTest';
  const web = 'https://sistema.orcaproobras.com.br';
  function setup(portalId: string | undefined = configuration) {
    const config = new ConfigService({ ORCAPRO_STRIPE_SECRET_KEY: 'sk_test_local_only', ORCAPRO_STRIPE_MODE: 'TEST', WEB_BASE_URL: web, ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID: portalId });
    const prisma = { orcaproSubscription: { findUnique: jest.fn(async () => ({ stripeCustomerId: 'cus_own' })) } };
    const retrieve = jest.fn(async () => ({ id: configuration, active: true, livemode: false }));
    const create = jest.fn(async () => ({ url: 'https://billing.stripe.com/p/session/test', livemode: false }));
    const service = new OrcaproStripeService(prisma as unknown as PrismaService, config, {} as OrcaproAccess);
    Object.defineProperty(service, 'stripe', { value: { billingPortal: { configurations: { retrieve }, sessions: { create } } } });
    return { service, prisma, retrieve, create, config };
  }
  it('checks the configured mode and uses the dedicated configuration for the authenticated customer', async () => {
    const { service, prisma, retrieve, create } = setup();
    await expect(service.portal(user)).resolves.toEqual({ url: 'https://billing.stripe.com/p/session/test' });
    expect(prisma.orcaproSubscription.findUnique).toHaveBeenCalledWith({ where: { userId: user.userId } });
    expect(retrieve).toHaveBeenCalledWith(configuration);
    expect(create).toHaveBeenCalledWith({ customer: 'cus_own', return_url: `${web}/orcapro/assinatura`, configuration });
  });
  it('keeps the account default compatible when the optional configuration is absent', async () => {
    const { service, retrieve, create, config } = setup();
    config.set('ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID', '');
    await service.portal(user);
    expect(retrieve).not.toHaveBeenCalled();
    expect(create.mock.calls[0]).toEqual([{ customer: 'cus_own', return_url: `${web}/orcapro/assinatura` }]);
  });
  it('rejects a configuration from the other environment before creating a session', async () => {
    const { service, retrieve, create } = setup();
    retrieve.mockResolvedValueOnce({ id: configuration, active: true, livemode: true });
    await expect(service.portal(user)).rejects.toThrow('outro modo');
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects an inactive configuration before creating a session', async () => {
    const { service, retrieve, create } = setup();
    retrieve.mockResolvedValueOnce({ id: configuration, active: false, livemode: false });
    await expect(service.portal(user)).rejects.toThrow('desativada');
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects a returned portal session from the other environment', async () => {
    const { service, create } = setup();
    create.mockResolvedValueOnce({ url: 'https://billing.stripe.com/p/session/test', livemode: true });
    await expect(service.portal(user)).rejects.toThrow('outro modo');
  });
});
