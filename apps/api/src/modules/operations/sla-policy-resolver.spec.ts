import { ConflictException, NotFoundException } from '@nestjs/common';
import { selectSlaPolicy } from './sla-policy-resolver';

const policy = (id: string, contractId: string | null, categoryId: string | null) => ({
  id,
  contractId,
  categoryId,
});

describe('precedência das políticas de SLA', () => {
  const policies = [
    policy('tenant', null, null),
    policy('category', null, 'category-a'),
    policy('contract', 'contract-a', null),
    policy('contract-category', 'contract-a', 'category-a'),
  ];

  it('prioriza contrato + categoria, contrato, categoria e tenant nessa ordem', () => {
    expect(
      selectSlaPolicy(policies, { contractId: 'contract-a', categoryId: 'category-a' }).id,
    ).toBe('contract-category');
    expect(selectSlaPolicy(policies, { contractId: 'contract-a' }).id).toBe('contract');
    expect(selectSlaPolicy(policies, { categoryId: 'category-a' }).id).toBe('category');
    expect(selectSlaPolicy(policies, {}).id).toBe('tenant');
  });

  it('não usa uma política de outro contrato ou categoria', () => {
    expect(
      selectSlaPolicy(policies, { contractId: 'contract-b', categoryId: 'category-b' }).id,
    ).toBe('tenant');
  });

  it('rejeita duas políticas ativas no mesmo nível de precedência', () => {
    expect(() =>
      selectSlaPolicy([policy('a', null, null), policy('b', null, null)], {}),
    ).toThrow(ConflictException);
  });

  it('informa configuração ausente quando não há fallback do tenant', () => {
    expect(() =>
      selectSlaPolicy([policy('other', 'contract-b', null)], { contractId: 'contract-a' }),
    ).toThrow(NotFoundException);
  });
});
