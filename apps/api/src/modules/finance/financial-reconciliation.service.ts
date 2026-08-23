import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BudgetStage,
  BudgetStatus,
  CommitmentMovementType,
  MeasurementStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildFinancialReconciliation } from './financial-reconciliation.rules';

@Injectable()
export class FinancialReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async portfolio(tenantId: string) {
    const contracts = await this.loadContracts(tenantId);
    const items = contracts.map((contract) => this.reconcile(contract));
    const issueCountsByCode = items.flatMap((item) => item.checks).reduce<Record<string, number>>((counts, check) => {
      counts[check.code] = (counts[check.code] ?? 0) + 1;
      return counts;
    }, {});
    return {
      status: items.some((item) => item.status === 'CRITICAL') ? 'CRITICAL'
        : items.some((item) => item.status === 'WARNING') ? 'WARNING' : 'CONSISTENT',
      contracts: items,
      summary: {
        totalContracts: items.length,
        consistentContracts: items.filter((item) => item.status === 'CONSISTENT').length,
        warningContracts: items.filter((item) => item.status === 'WARNING').length,
        criticalContracts: items.filter((item) => item.status === 'CRITICAL').length,
        criticalIssues: items.reduce((sum, item) => sum + item.criticalCount, 0),
        warnings: items.reduce((sum, item) => sum + item.warningCount, 0),
        issueCountsByCode,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async contract(tenantId: string, contractId: string) {
    const contracts = await this.loadContracts(tenantId, contractId);
    if (!contracts[0]) throw new NotFoundException('Contrato não encontrado.');
    return this.reconcile(contracts[0]);
  }

  private loadContracts(tenantId: string, contractId?: string) {
    return this.prisma.contract.findMany({
      where: { tenantId, deletedAt: null, ...(contractId ? { id: contractId } : {}) },
      orderBy: { code: 'asc' },
      include: {
        amendments: { where: { status: 'ACTIVE', canceledAt: null }, select: { valueChange: true } },
        adjustments: { where: { status: 'ACTIVE', canceledAt: null }, select: { amount: true } },
        apostilles: { where: { status: 'ACTIVE', deletedAt: null }, select: { valueChange: true } },
        budget: { where: { deletedAt: null }, select: { id: true, status: true, total: true, version: true, title: true } },
        commitments: {
          where: { canceledAt: null },
          select: { id: true, movements: { select: { type: true, amount: true } } },
        },
        measurements: {
          where: { status: { not: MeasurementStatus.CANCELED } },
          select: { status: true, netAmount: true, items: { select: { netAmount: true } } },
        },
        workOrders: {
          select: {
            workOrder: {
              select: {
                id: true,
                budgets: {
                  where: { status: BudgetStatus.APPROVED },
                  select: { stage: true, total: true },
                },
              },
            },
          },
        },
      },
    });
  }

  private reconcile(contract: Awaited<ReturnType<FinancialReconciliationService['loadContracts']>>[number]) {
    const sum = (values: Array<{ toNumber(): number } | null>) => values.reduce(
      (total, value) => total + (value?.toNumber() ?? 0), 0,
    );
    const movementTotal = (type: CommitmentMovementType) => contract.commitments.reduce(
      (total, commitment) => total + commitment.movements
        .filter((movement) => movement.type === type)
        .reduce((movementSum, movement) => movementSum + movement.amount.toNumber(), 0),
      0,
    );
    const officialStatuses = new Set<MeasurementStatus>([
      MeasurementStatus.APPROVED,
      MeasurementStatus.LIQUIDATED,
      MeasurementStatus.PAID,
    ]);
    const paidStatuses = new Set<MeasurementStatus>([MeasurementStatus.PAID]);
    const approvedMeasurements = contract.measurements
      .filter((measurement) => officialStatuses.has(measurement.status))
      .reduce((total, measurement) => total + measurement.netAmount.toNumber(), 0);
    const paidMeasurements = contract.measurements
      .filter((measurement) => paidStatuses.has(measurement.status))
      .reduce((total, measurement) => total + measurement.netAmount.toNumber(), 0);
    const measurementItemsMismatchCount = contract.measurements.filter((measurement) => {
      const itemTotal = measurement.items.reduce((total, item) => total + item.netAmount.toNumber(), 0);
      return Math.abs(itemTotal - measurement.netAmount.toNumber()) > 0.01;
    }).length;

    const stagePriority: Record<BudgetStage, number> = {
      [BudgetStage.PLANNED]: 1,
      [BudgetStage.APPROVED]: 2,
      [BudgetStage.FINAL_EXECUTED]: 3,
    };
    let officialWorkOrderBudgets = 0;
    let finalExecutedBudgets = 0;
    for (const link of contract.workOrders) {
      const budgets = [...link.workOrder.budgets].sort((left, right) => stagePriority[right.stage] - stagePriority[left.stage]);
      officialWorkOrderBudgets += budgets[0]?.total.toNumber() ?? 0;
      finalExecutedBudgets += budgets.find((budget) => budget.stage === BudgetStage.FINAL_EXECUTED)?.total.toNumber() ?? 0;
    }

    const issued = movementTotal(CommitmentMovementType.ISSUE);
    const reinforced = movementTotal(CommitmentMovementType.REINFORCEMENT);
    const canceled = movementTotal(CommitmentMovementType.CANCELLATION);
    const result = buildFinancialReconciliation({
      originalValue: contract.originalValue.toNumber(),
      amendmentValue: sum(contract.amendments.map((item) => item.valueChange)),
      adjustmentValue: sum(contract.adjustments.map((item) => item.amount)),
      apostilleValue: sum(contract.apostilles.map((item) => item.valueChange)),
      storedCurrentValue: contract.currentValue.toNumber(),
      contractBudget: contract.budget ? { status: contract.budget.status, total: contract.budget.total.toNumber() } : null,
      officialWorkOrderBudgets,
      finalExecutedBudgets,
      storedMeasuredValue: contract.measuredValue.toNumber(),
      approvedMeasurements,
      measurementItemsMismatchCount,
      storedPaidValue: contract.paidValue.toNumber(),
      paidMeasurements,
      committedNet: issued + reinforced - canceled,
      liquidatedCommitments: movementTotal(CommitmentMovementType.LIQUIDATION),
      paidCommitments: movementTotal(CommitmentMovementType.PAYMENT),
    });
    return {
      contract: { id: contract.id, code: contract.code, object: contract.object, status: contract.status },
      budget: contract.budget,
      ...result,
    };
  }
}
