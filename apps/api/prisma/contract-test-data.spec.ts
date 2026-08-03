import { CONTRACT_TEST_DATA_EXPECTED } from './contract-test-data';

describe('carteira contratual fictícia', () => {
  it('mantém volume suficiente e reconcilia os três estágios de orçamento', () => {
    expect(CONTRACT_TEST_DATA_EXPECTED.contracts).toBeGreaterThanOrEqual(5);
    expect(CONTRACT_TEST_DATA_EXPECTED.amendments).toBeGreaterThanOrEqual(8);
    expect(CONTRACT_TEST_DATA_EXPECTED.adjustments).toBeGreaterThanOrEqual(7);
    expect(CONTRACT_TEST_DATA_EXPECTED.subcontracts).toBeGreaterThanOrEqual(5);
    expect(CONTRACT_TEST_DATA_EXPECTED.measurements).toBe(
      CONTRACT_TEST_DATA_EXPECTED.financialWorkOrders,
    );
    expect(CONTRACT_TEST_DATA_EXPECTED.budgets).toBe(
      CONTRACT_TEST_DATA_EXPECTED.financialWorkOrders * 3,
    );
    expect(CONTRACT_TEST_DATA_EXPECTED.budgetItems).toBe(
      CONTRACT_TEST_DATA_EXPECTED.budgets * 2,
    );
  });
});
