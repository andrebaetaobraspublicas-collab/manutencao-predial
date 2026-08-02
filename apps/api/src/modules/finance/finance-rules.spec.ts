import { BadRequestException } from '@nestjs/common';
import { CommitmentMovementType, MeasurementStatus, Prisma } from '../../generated/prisma/client';
import { assertCommitmentMovementBalance, canTransitionMeasurement } from './finance-rules';

describe('regras financeiras', () => {
  it('permite apenas a sequência auditável da medição', () => {
    expect(canTransitionMeasurement(MeasurementStatus.DRAFT, MeasurementStatus.SUBMITTED)).toBe(true);
    expect(canTransitionMeasurement(MeasurementStatus.APPROVED, MeasurementStatus.PAID)).toBe(false);
    expect(canTransitionMeasurement(MeasurementStatus.LIQUIDATED, MeasurementStatus.PAID)).toBe(true);
  });

  it('impede liquidar acima do saldo empenhado', () => {
    const ledger = [{ type: CommitmentMovementType.ISSUE, amount: new Prisma.Decimal(100) }];
    expect(() => assertCommitmentMovementBalance(ledger, CommitmentMovementType.LIQUIDATION, new Prisma.Decimal(101)))
      .toThrow(BadRequestException);
  });

  it('impede pagar acima do valor liquidado', () => {
    const ledger = [
      { type: CommitmentMovementType.ISSUE, amount: new Prisma.Decimal(100) },
      { type: CommitmentMovementType.LIQUIDATION, amount: new Prisma.Decimal(60) },
      { type: CommitmentMovementType.PAYMENT, amount: new Prisma.Decimal(20) },
    ];
    expect(() => assertCommitmentMovementBalance(ledger, CommitmentMovementType.PAYMENT, new Prisma.Decimal(41)))
      .toThrow(BadRequestException);
    expect(() => assertCommitmentMovementBalance(ledger, CommitmentMovementType.PAYMENT, new Prisma.Decimal(40)))
      .not.toThrow();
  });
});

