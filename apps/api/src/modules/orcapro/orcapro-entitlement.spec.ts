import { subscriptionAllowsAccess } from './orcapro-entitlement';

describe('Licença individual OrçaPro', () => {
  it('preserva contas anteriores e exige licença para contas novas gerenciadas', () => {
    expect(subscriptionAllowsAccess(null, false)).toBe(true);
    expect(subscriptionAllowsAccess(null, true)).toBe(false);
  });
  it.each(['ACTIVE', 'MANUAL_CONTRACT'])('aceita %s sem vencimento ou dentro do período, rejeita vencida', status => {
    expect(subscriptionAllowsAccess({ status, currentPeriodEnd: null }, true)).toBe(true);
    expect(subscriptionAllowsAccess({ status, currentPeriodEnd: new Date(Date.now() + 60000) }, true)).toBe(true);
    expect(subscriptionAllowsAccess({ status, currentPeriodEnd: new Date(Date.now() - 60000) }, false)).toBe(false);
  });
  it('teste exige fim definido e futuro', () => {
    expect(subscriptionAllowsAccess({ status: 'TRIALING', currentPeriodEnd: null }, true)).toBe(false);
    expect(subscriptionAllowsAccess({ status: 'TRIALING', currentPeriodEnd: new Date(Date.now() + 60000) }, true)).toBe(true);
  });
  it.each(['CANCELED', 'UNPAID', 'PAST_DUE', 'UNKNOWN'])('rejeita %s mesmo com validade futura', status => {
    expect(subscriptionAllowsAccess({ status, currentPeriodEnd: new Date(Date.now() + 60000) }, false)).toBe(false);
  });
});
