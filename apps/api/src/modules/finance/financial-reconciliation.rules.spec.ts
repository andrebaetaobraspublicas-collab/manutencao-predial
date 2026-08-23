import { buildFinancialReconciliation } from './financial-reconciliation.rules';

const consistent = {
  originalValue: 1_000,
  amendmentValue: 100,
  adjustmentValue: 50,
  apostilleValue: 0,
  storedCurrentValue: 1_150,
  contractBudget: { status: 'ACTIVE', total: 1_150 },
  officialWorkOrderBudgets: 700,
  finalExecutedBudgets: 500,
  storedMeasuredValue: 400,
  approvedMeasurements: 400,
  measurementItemsMismatchCount: 0,
  storedPaidValue: 250,
  paidMeasurements: 250,
  committedNet: 800,
  liquidatedCommitments: 400,
  paidCommitments: 250,
};

describe('conciliação financeira contratual', () => {
  it('considera consistente uma cadeia financeira fechada', () => {
    const result = buildFinancialReconciliation(consistent);
    expect(result.status).toBe('CONSISTENT');
    expect(result.checks).toHaveLength(0);
    expect(result.values.unmeasuredBalance).toBe(750);
  });

  it('bloqueia planilha que excede o valor atual do contrato', () => {
    const result = buildFinancialReconciliation({
      ...consistent,
      contractBudget: { status: 'DRAFT', total: 15_000 },
    });
    expect(result.status).toBe('CRITICAL');
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CONTRACT_BUDGET_EXCEEDS_CONTRACT', difference: 13_850 }),
    ]));
  });

  it('detecta divergências entre medição, empenho e pagamento', () => {
    const result = buildFinancialReconciliation({
      ...consistent,
      storedMeasuredValue: 550,
      storedPaidValue: 350,
      committedNet: 300,
      liquidatedCommitments: 450,
      paidCommitments: 425,
    });
    expect(result.status).toBe('CRITICAL');
    expect(result.checks.map((check) => check.code)).toEqual(expect.arrayContaining([
      'MEASURED_VALUE_MISMATCH',
      'LIQUIDATION_EXCEEDS_COMMITMENTS',
      'PAYMENT_TRACEABILITY_MISMATCH',
      'PAID_VALUE_MISMATCH',
    ]));
  });
});
