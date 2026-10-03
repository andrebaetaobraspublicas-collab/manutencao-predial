import { validateEnvironment } from './env.validation';

const base = { DATABASE_URL: 'mysql://local:local@localhost/isolated_test', JWT_ACCESS_SECRET: 'local-only-secret-long-enough-123456', ORCAPRO_ENABLED: 'true' };
describe('OrçaPro billing environment isolation', () => {
  it('requires an explicit mode and matching secret prefix when configured', () => {
    expect(() => validateEnvironment({ ...base, ORCAPRO_STRIPE_SECRET_KEY: 'sk_test_local' })).toThrow('ORCAPRO_STRIPE_MODE');
    expect(() => validateEnvironment({ ...base, ORCAPRO_STRIPE_SECRET_KEY: 'sk_test_local', ORCAPRO_STRIPE_MODE: 'LIVE' })).toThrow('não corresponde');
    expect(() => validateEnvironment({ ...base, ORCAPRO_STRIPE_SECRET_KEY: 'rk_live_local', ORCAPRO_STRIPE_MODE: 'TEST' })).toThrow('não corresponde');
    expect(validateEnvironment({ ...base, ORCAPRO_STRIPE_SECRET_KEY: 'sk_test_local', ORCAPRO_STRIPE_MODE: 'TEST' })).toBeDefined();
    expect(validateEnvironment({ ...base, ORCAPRO_STRIPE_SECRET_KEY: 'rk_live_local', ORCAPRO_STRIPE_MODE: 'LIVE' })).toBeDefined();
    expect(validateEnvironment(base)).toBeDefined();
  });
  it('requires mode for legacy Stripe fallback only when OrçaPro is enabled', () => {
    expect(() => validateEnvironment({ ...base, STRIPE_SECRET_KEY: 'sk_test_local' })).toThrow('ORCAPRO_STRIPE_MODE');
    expect(validateEnvironment({ ...base, ORCAPRO_ENABLED: 'false', STRIPE_SECRET_KEY: 'sk_test_local' })).toBeDefined();
  });
  it('allows only a configured HTTPS marketing return without embedded credentials', () => {
    for (const value of ['javascript:alert(1)', 'http://orcaproobras.com.br/', 'https://user:password@orcaproobras.com.br/', 'invalid']) expect(() => validateEnvironment({ ...base, ORCAPRO_MARKETING_URL: value })).toThrow('HTTPS');
    expect(validateEnvironment({ ...base, ORCAPRO_MARKETING_URL: 'https://orcaproobras.com.br/' })).toBeDefined();
  });
  it('accepts an optional dedicated Stripe portal configuration identifier', () => {
    expect(validateEnvironment({ ...base, ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID: '' })).toBeDefined();
    expect(validateEnvironment({ ...base, ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_orcapro123' })).toBeDefined();
    for (const value of ['default', 'bpc_', 'bpc_other/id', 'https://billing.stripe.com']) expect(() => validateEnvironment({ ...base, ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID: value })).toThrow('bpc_');
  });
});
