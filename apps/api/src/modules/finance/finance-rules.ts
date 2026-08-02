import { BadRequestException } from '@nestjs/common';
import { CommitmentMovementType, MeasurementStatus, Prisma } from '../../generated/prisma/client';

const TRANSITIONS: Record<MeasurementStatus, MeasurementStatus[]> = {
  DRAFT: [MeasurementStatus.SUBMITTED, MeasurementStatus.CANCELED],
  SUBMITTED: [MeasurementStatus.UNDER_REVIEW, MeasurementStatus.CANCELED],
  UNDER_REVIEW: [MeasurementStatus.APPROVED, MeasurementStatus.REJECTED],
  APPROVED: [MeasurementStatus.LIQUIDATED],
  REJECTED: [MeasurementStatus.DRAFT],
  LIQUIDATED: [MeasurementStatus.PAID],
  PAID: [], CANCELED: [],
};

export function canTransitionMeasurement(from: MeasurementStatus, to: MeasurementStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertCommitmentMovementBalance(
  movements: Array<{ type: CommitmentMovementType; amount: Prisma.Decimal }>,
  type: CommitmentMovementType,
  amount: Prisma.Decimal,
): void {
  const sum = (types: CommitmentMovementType[]) => movements.filter((item) => types.includes(item.type))
    .reduce((total, item) => total.plus(item.amount), new Prisma.Decimal(0));
  const issued = sum([CommitmentMovementType.ISSUE, CommitmentMovementType.REINFORCEMENT]);
  const canceled = sum([CommitmentMovementType.CANCELLATION]);
  const liquidated = sum([CommitmentMovementType.LIQUIDATION]);
  const paid = sum([CommitmentMovementType.PAYMENT]);
  if (type === CommitmentMovementType.CANCELLATION && amount.greaterThan(issued.minus(canceled).minus(liquidated))) {
    throw new BadRequestException('Cancelamento excede o saldo não liquidado do empenho.');
  }
  if (type === CommitmentMovementType.LIQUIDATION && amount.greaterThan(issued.minus(canceled).minus(liquidated))) {
    throw new BadRequestException('Liquidação excede o saldo disponível do empenho.');
  }
  if (type === CommitmentMovementType.PAYMENT && amount.greaterThan(liquidated.minus(paid))) {
    throw new BadRequestException('Pagamento excede o saldo liquidado do empenho.');
  }
}

