export type ReconciliationSeverity = 'CRITICAL' | 'WARNING';
export type ReconciliationStatus = 'CONSISTENT' | 'WARNING' | 'CRITICAL';

export type ReconciliationCheck = {
  code: string;
  severity: ReconciliationSeverity;
  area: 'CONTRACT' | 'BUDGET' | 'WORK_ORDER' | 'MEASUREMENT' | 'COMMITMENT' | 'PAYMENT';
  message: string;
  expected?: number;
  actual?: number;
  difference?: number;
};

export type FinancialReconciliationInput = {
  originalValue: number;
  amendmentValue: number;
  adjustmentValue: number;
  apostilleValue: number;
  storedCurrentValue: number;
  contractBudget: null | { status: string; total: number };
  officialWorkOrderBudgets: number;
  finalExecutedBudgets: number;
  storedMeasuredValue: number;
  approvedMeasurements: number;
  measurementItemsMismatchCount: number;
  storedPaidValue: number;
  paidMeasurements: number;
  committedNet: number;
  liquidatedCommitments: number;
  paidCommitments: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const different = (left: number, right: number) => Math.abs(money(left) - money(right)) > 0.01;

export function measurementNetMatchesItems(input: {
  netAmount: number;
  itemNetAmounts: number[];
  performanceDeductions: number;
  bonuses: number;
}) {
  const itemNetTotal = input.itemNetAmounts.reduce((total, value) => total + value, 0);
  const expectedNet = itemNetTotal - input.performanceDeductions + input.bonuses;
  return !different(expectedNet, input.netAmount);
}

export function buildFinancialReconciliation(input: FinancialReconciliationInput) {
  const calculatedCurrentValue = money(
    input.originalValue + input.amendmentValue + input.adjustmentValue + input.apostilleValue,
  );
  const currentValue = money(input.storedCurrentValue);
  const checks: ReconciliationCheck[] = [];
  const add = (
    code: string,
    severity: ReconciliationSeverity,
    area: ReconciliationCheck['area'],
    message: string,
    expected?: number,
    actual?: number,
  ) => checks.push({
    code,
    severity,
    area,
    message,
    expected: expected === undefined ? undefined : money(expected),
    actual: actual === undefined ? undefined : money(actual),
    difference: expected === undefined || actual === undefined ? undefined : money(actual - expected),
  });

  if (different(calculatedCurrentValue, currentValue)) {
    add('CURRENT_VALUE_COMPONENT_MISMATCH', 'CRITICAL', 'CONTRACT',
      'O valor atual armazenado não corresponde ao valor original somado aos instrumentos financeiros ativos.',
      calculatedCurrentValue, currentValue);
  }

  if (!input.contractBudget) {
    add('CONTRACT_BUDGET_MISSING', 'WARNING', 'BUDGET',
      'O contrato ainda não possui planilha orçamentária cadastrada.');
  } else {
    const budgetTotal = money(input.contractBudget.total);
    if (budgetTotal > currentValue + 0.01) {
      add('CONTRACT_BUDGET_EXCEEDS_CONTRACT', 'CRITICAL', 'BUDGET',
        'A planilha orçamentária excede o valor contratual atual e não pode ser ativada.',
        currentValue, budgetTotal);
    } else if (input.contractBudget.status === 'ACTIVE' && different(currentValue, budgetTotal)) {
      add('ACTIVE_BUDGET_NOT_EQUAL_CONTRACT', 'CRITICAL', 'BUDGET',
        'A planilha ativa deve fechar exatamente com o valor contratual atual.', currentValue, budgetTotal);
    } else if (input.contractBudget.status === 'DRAFT' && different(currentValue, budgetTotal)) {
      add('DRAFT_BUDGET_NOT_RECONCILED', 'WARNING', 'BUDGET',
        'A planilha em elaboração ainda não fecha com o valor contratual atual.', currentValue, budgetTotal);
    }
  }

  const operationalCeiling = input.contractBudget?.status === 'ACTIVE'
    ? money(input.contractBudget.total)
    : currentValue;
  if (input.officialWorkOrderBudgets > operationalCeiling + 0.01) {
    add('WORK_ORDER_BUDGETS_EXCEED_CEILING', 'CRITICAL', 'WORK_ORDER',
      'A soma dos orçamentos oficiais das ordens de serviço excede o limite disponível do contrato.',
      operationalCeiling, input.officialWorkOrderBudgets);
  }
  if (input.finalExecutedBudgets > currentValue + 0.01) {
    add('FINAL_BUDGETS_EXCEED_CONTRACT', 'CRITICAL', 'WORK_ORDER',
      'A execução final consolidada das ordens de serviço excede o valor contratual atual.',
      currentValue, input.finalExecutedBudgets);
  }

  if (different(input.storedMeasuredValue, input.approvedMeasurements)) {
    add('MEASURED_VALUE_MISMATCH', 'CRITICAL', 'MEASUREMENT',
      'O total medido do contrato diverge da soma das medições aprovadas, liquidadas e pagas.',
      input.approvedMeasurements, input.storedMeasuredValue);
  }
  if (input.approvedMeasurements > currentValue + 0.01) {
    add('MEASUREMENTS_EXCEED_CONTRACT', 'CRITICAL', 'MEASUREMENT',
      'As medições aprovadas excedem o valor contratual atual.', currentValue, input.approvedMeasurements);
  }
  if (input.finalExecutedBudgets > 0 && input.approvedMeasurements > input.finalExecutedBudgets + 0.01) {
    add('MEASUREMENTS_EXCEED_FINAL_EXECUTION', 'CRITICAL', 'MEASUREMENT',
      'As medições excedem os orçamentos finais executados das ordens de serviço.',
      input.finalExecutedBudgets, input.approvedMeasurements);
  }
  if (input.measurementItemsMismatchCount > 0) {
    add('MEASUREMENT_ITEM_TOTAL_MISMATCH', 'CRITICAL', 'MEASUREMENT',
      `${input.measurementItemsMismatchCount} medição(ões) possui(em) total diferente da soma de seus itens.`);
  }

  if (input.committedNet > currentValue + 0.01) {
    add('COMMITMENTS_EXCEED_CONTRACT', 'CRITICAL', 'COMMITMENT',
      'O total líquido empenhado excede o valor contratual atual.', currentValue, input.committedNet);
  }
  if (input.liquidatedCommitments > input.committedNet + 0.01) {
    add('LIQUIDATION_EXCEEDS_COMMITMENTS', 'CRITICAL', 'COMMITMENT',
      'O valor liquidado excede o total líquido empenhado.', input.committedNet, input.liquidatedCommitments);
  }
  if (input.paidCommitments > input.liquidatedCommitments + 0.01) {
    add('PAYMENT_EXCEEDS_LIQUIDATION', 'CRITICAL', 'PAYMENT',
      'O valor pago excede o valor liquidado.', input.liquidatedCommitments, input.paidCommitments);
  }
  if (different(input.storedPaidValue, input.paidMeasurements)) {
    add('PAID_VALUE_MISMATCH', 'CRITICAL', 'PAYMENT',
      'O valor pago armazenado no contrato diverge das medições pagas.',
      input.paidMeasurements, input.storedPaidValue);
  }
  if (input.paidMeasurements > input.approvedMeasurements + 0.01) {
    add('PAYMENTS_EXCEED_MEASUREMENTS', 'CRITICAL', 'PAYMENT',
      'Os pagamentos excedem as medições aprovadas.', input.approvedMeasurements, input.paidMeasurements);
  }
  if (different(input.paidCommitments, input.paidMeasurements)) {
    add('PAYMENT_TRACEABILITY_MISMATCH', 'CRITICAL', 'PAYMENT',
      'Os pagamentos registrados nos empenhos divergem das medições pagas.',
      input.paidMeasurements, input.paidCommitments);
  }

  const criticalCount = checks.filter((check) => check.severity === 'CRITICAL').length;
  const warningCount = checks.filter((check) => check.severity === 'WARNING').length;
  const status: ReconciliationStatus = criticalCount > 0 ? 'CRITICAL'
    : warningCount > 0 ? 'WARNING' : 'CONSISTENT';

  return {
    status,
    criticalCount,
    warningCount,
    checks,
    values: {
      originalValue: money(input.originalValue),
      amendmentValue: money(input.amendmentValue),
      adjustmentValue: money(input.adjustmentValue),
      apostilleValue: money(input.apostilleValue),
      calculatedCurrentValue,
      storedCurrentValue: currentValue,
      contractBudgetTotal: input.contractBudget ? money(input.contractBudget.total) : null,
      budgetVariance: input.contractBudget ? money(input.contractBudget.total - currentValue) : null,
      officialWorkOrderBudgets: money(input.officialWorkOrderBudgets),
      finalExecutedBudgets: money(input.finalExecutedBudgets),
      approvedMeasurements: money(input.approvedMeasurements),
      paidMeasurements: money(input.paidMeasurements),
      committedNet: money(input.committedNet),
      liquidatedCommitments: money(input.liquidatedCommitments),
      paidCommitments: money(input.paidCommitments),
      unmeasuredBalance: money(currentValue - input.approvedMeasurements),
      uncommittedBalance: money(currentValue - input.committedNet),
    },
  };
}
