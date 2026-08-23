import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  BudgetStage,
  BudgetStatus,
  CommitmentMovementType,
  MeasurementStatus,
  Prisma,
  WorkOrderStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KpisService } from '../kpis/kpis.service';
import {
  CreateCommitmentDto,
  CreateCommitmentMovementDto,
  ConsolidateMeasurementDto,
  CreateMeasurementDto,
  TransitionMeasurementDto,
  UpdateCommitmentDto,
  UpdateMeasurementDto,
} from './dto/finance.dto';
import { assertCommitmentMovementBalance, canTransitionMeasurement } from './finance-rules';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService, private readonly kpis: KpisService) {}

  listCommitments(tenantId: string) {
    return this.prisma.commitment.findMany({
      where: { tenantId, canceledAt: null },
      orderBy: [{ fiscalYear: 'desc' }, { issueDate: 'desc' }],
      include: { contract: { select: { id: true, code: true, object: true } }, movements: true },
    });
  }

  async createCommitment(tenantId: string, actorUserId: string, dto: CreateCommitmentDto) {
    const contract = await this.prisma.contract.findFirst({ where: { id: dto.contractId, tenantId, deletedAt: null } });
    if (!contract) throw new BadRequestException('Contrato inválido para a organização.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Contract WHERE id = ${dto.contractId} AND tenantId = ${tenantId} FOR UPDATE`;
      await this.assertContractCommitmentCeiling(tx, tenantId, dto.contractId, new Prisma.Decimal(dto.originalValue));
      const commitment = await tx.commitment.create({ data: {
        tenantId, contractId: dto.contractId, createdByUserId: actorUserId,
        number: dto.number.trim().toUpperCase(), fiscalYear: dto.fiscalYear,
        issueDate: new Date(dto.issueDate), originalValue: dto.originalValue, notes: dto.notes,
        movements: { create: { tenantId, createdByUserId: actorUserId,
          type: CommitmentMovementType.ISSUE, amount: dto.originalValue,
          occurredAt: new Date(dto.issueDate), notes: 'Emissão inicial do empenho.' } },
      }, include: { contract: true, movements: true } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'Commitment', commitment.id,
        { number: commitment.number, originalValue: commitment.originalValue.toString() });
      return commitment;
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe empenho com este número no exercício.');
      }
      throw error;
    });
  }

  async updateCommitment(tenantId: string, actorUserId: string, id: string, dto: UpdateCommitmentDto) {
    const current = await this.prisma.commitment.findFirst({ where: { id, tenantId, canceledAt: null }, include: { movements: true } });
    if (!current) throw new NotFoundException('Empenho não encontrado.');
    if (current.movements.some((movement) => movement.type !== CommitmentMovementType.ISSUE)) {
      throw new BadRequestException('Empenho movimentado não pode ter os dados financeiros editados; registre reforço ou anulação.');
    }
    if (dto.contractId) {
      const contract = await this.prisma.contract.findFirst({ where: { id: dto.contractId, tenantId, deletedAt: null }, select: { id: true } });
      if (!contract) throw new BadRequestException('Contrato inválido para a organização.');
    }
    return this.prisma.$transaction(async (tx) => {
      const targetContractId = dto.contractId ?? current.contractId;
      const contractIdsToLock = [...new Set([current.contractId, targetContractId])].sort();
      for (const contractId of contractIdsToLock) {
        await tx.$queryRaw`SELECT id FROM Contract WHERE id = ${contractId} AND tenantId = ${tenantId} FOR UPDATE`;
      }
      const proposedOriginalValue = new Prisma.Decimal(dto.originalValue ?? current.originalValue);
      if (targetContractId !== current.contractId) {
        await this.assertContractCommitmentCeiling(tx, tenantId, targetContractId, proposedOriginalValue);
      } else {
        const increase = proposedOriginalValue.minus(current.originalValue);
        if (increase.greaterThan(0)) {
          await this.assertContractCommitmentCeiling(tx, tenantId, targetContractId, increase);
        }
      }
      const updated = await tx.commitment.update({ where: { id }, data: {
        contractId: dto.contractId, number: dto.number?.trim().toUpperCase(), fiscalYear: dto.fiscalYear,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined, originalValue: dto.originalValue, notes: dto.notes,
      }, include: { contract: true, movements: true } });
      if (dto.originalValue !== undefined || dto.issueDate) {
        await tx.commitmentMovement.update({ where: { id: current.movements[0].id }, data: {
          amount: dto.originalValue, occurredAt: dto.issueDate ? new Date(dto.issueDate) : undefined,
        } });
      }
      await this.audit(tx, tenantId, actorUserId, AuditAction.UPDATE, 'Commitment', id,
        { number: updated.number, originalValue: updated.originalValue.toString() });
      return updated;
    });
  }

  async archiveCommitment(tenantId: string, actorUserId: string, id: string) {
    const current = await this.prisma.commitment.findFirst({ where: { id, tenantId, canceledAt: null }, include: { movements: true } });
    if (!current) throw new NotFoundException('Empenho não encontrado.');
    if (current.movements.some((movement) =>
      movement.type === CommitmentMovementType.LIQUIDATION || movement.type === CommitmentMovementType.PAYMENT)) {
      throw new BadRequestException('Empenho liquidado ou pago deve ser estornado pelo fluxo financeiro antes da exclusão.');
    }
    const available = current.movements.reduce((total, movement) =>
      movement.type === CommitmentMovementType.CANCELLATION ? total.minus(movement.amount) : total.plus(movement.amount), new Prisma.Decimal(0));
    return this.prisma.$transaction(async (tx) => {
      if (available.greaterThan(0)) await tx.commitmentMovement.create({ data: {
        tenantId, commitmentId: id, createdByUserId: actorUserId, type: CommitmentMovementType.CANCELLATION,
        amount: available, occurredAt: new Date(), notes: 'Anulação automática por exclusão lógica do empenho.',
      } });
      const archived = await tx.commitment.update({ where: { id }, data: { canceledAt: new Date() } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.DELETE, 'Commitment', id,
        { number: current.number, archived: true, cancellationAmount: available.toString() });
      return archived;
    });
  }

  async addCommitmentMovement(tenantId: string, actorUserId: string, id: string,
    dto: CreateCommitmentMovementDto) {
    if (dto.type === CommitmentMovementType.ISSUE) {
      throw new BadRequestException('A emissão é criada junto com o empenho.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Commitment WHERE id = ${id} AND tenantId = ${tenantId} FOR UPDATE`;
      const commitment = await tx.commitment.findFirst({ where: { id, tenantId }, include: { movements: true } });
      if (!commitment) throw new NotFoundException('Empenho não encontrado.');
      if (commitment.canceledAt) throw new BadRequestException('Empenho cancelado não aceita movimentações.');
      if (dto.type === CommitmentMovementType.REINFORCEMENT) {
        await tx.$queryRaw`SELECT id FROM Contract WHERE id = ${commitment.contractId} AND tenantId = ${tenantId} FOR UPDATE`;
        await this.assertContractCommitmentCeiling(tx, tenantId, commitment.contractId, new Prisma.Decimal(dto.amount));
      }
      assertCommitmentMovementBalance(commitment.movements, dto.type, new Prisma.Decimal(dto.amount));
      const movement = await tx.commitmentMovement.create({ data: {
        tenantId, commitmentId: id, createdByUserId: actorUserId, type: dto.type,
        amount: dto.amount, occurredAt: new Date(dto.occurredAt),
        documentRef: dto.documentRef, notes: dto.notes,
      } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.UPDATE, 'Commitment', id,
        { movementId: movement.id, type: movement.type, amount: movement.amount.toString() });
      return movement;
    });
  }

  listMeasurements(tenantId: string) {
    return this.prisma.measurement.findMany({
      where: { tenantId, status: { not: MeasurementStatus.CANCELED } }, orderBy: { createdAt: 'desc' },
      include: { contract: { select: { id: true, code: true, object: true } }, commitment: { select: { id: true, number: true } }, _count: { select: { items: true } } },
    });
  }

  async getMeasurement(tenantId: string, id: string) {
    const item = await this.prisma.measurement.findFirst({
      where: { id, tenantId }, include: { contract: true, commitment: true,
        createdBy: { select: { id: true, name: true } }, reviewedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        items: { include: { workOrder: { select: { id: true, number: true, title: true, status: true } } } },
        commitmentMovements: true, kpiAdjustments: { include: { contractKpi: { include: { definition: true } }, kpiMeasurement: true } } },
    });
    if (!item) throw new NotFoundException('Medição não encontrada.');
    return item;
  }

  async updateMeasurement(tenantId: string, actorUserId: string, id: string, dto: UpdateMeasurementDto) {
    const current = await this.prisma.measurement.findFirst({ where: { id, tenantId }, include: { contract: true } });
    if (!current) throw new NotFoundException('Medição não encontrada.');
    if (current.status !== MeasurementStatus.DRAFT && current.status !== MeasurementStatus.REJECTED) {
      throw new BadRequestException('Somente medições em rascunho ou rejeitadas podem ser editadas.');
    }
    if (dto.commitmentId) {
      const commitment = await this.prisma.commitment.findFirst({ where: { id: dto.commitmentId, tenantId, contractId: current.contractId, canceledAt: null }, select: { id: true } });
      if (!commitment) throw new BadRequestException('Empenho inválido para este contrato.');
    }
    const updated = await this.prisma.measurement.update({ where: { id }, data: {
      commitmentId: dto.commitmentId, number: dto.number?.trim().toUpperCase(),
      referenceMonth: dto.referenceMonth, notes: dto.notes, version: { increment: 1 },
    }, include: { contract: true, commitment: true, _count: { select: { items: true } } } });
    await this.prisma.auditLog.create({ data: { tenantId, actorUserId, action: AuditAction.UPDATE,
      entityType: 'Measurement', entityId: id, afterData: { number: updated.number, referenceMonth: updated.referenceMonth } } });
    return updated;
  }

  async archiveMeasurement(tenantId: string, actorUserId: string, id: string) {
    const current = await this.prisma.measurement.findFirst({ where: { id, tenantId } });
    if (!current) throw new NotFoundException('Medição não encontrada.');
    const removableStatuses = new Set<MeasurementStatus>([
      MeasurementStatus.DRAFT,
      MeasurementStatus.SUBMITTED,
      MeasurementStatus.UNDER_REVIEW,
      MeasurementStatus.REJECTED,
    ]);
    if (!removableStatuses.has(current.status)) {
      throw new BadRequestException('Medição aprovada, liquidada ou paga deve ser estornada pelo fluxo financeiro antes da exclusão.');
    }
    const archived = await this.prisma.measurement.update({ where: { id }, data: {
      status: MeasurementStatus.CANCELED, canceledAt: new Date(), version: { increment: 1 },
      decisionNote: 'Exclusão lógica solicitada pelo usuário.',
    } });
    await this.prisma.auditLog.create({ data: { tenantId, actorUserId, action: AuditAction.DELETE,
      entityType: 'Measurement', entityId: id, beforeData: { status: current.status, number: current.number },
      afterData: { status: MeasurementStatus.CANCELED, archived: true } } });
    return archived;
  }

  async createMeasurement(tenantId: string, actorUserId: string, dto: CreateMeasurementDto) {
    const ids = [...new Set(dto.items.map((item) => item.workOrderId))];
    if (ids.length !== dto.items.length) throw new BadRequestException('A OS não pode ser repetida na medição.');
    const [contract, commitment, workOrders, alreadyMeasured] = await Promise.all([
      this.prisma.contract.findFirst({ where: { id: dto.contractId, tenantId, deletedAt: null } }),
      dto.commitmentId ? this.prisma.commitment.findFirst({ where: { id: dto.commitmentId, tenantId, contractId: dto.contractId, canceledAt: null } }) : null,
      this.prisma.workOrder.findMany({ where: { id: { in: ids }, tenantId, deletedAt: null,
        status: { in: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CLOSED] }, measurementEligible: true,
        contracts: { some: { contractId: dto.contractId } } },
        select: { id: true, number: true, title: true, finalCost: true, approvedCost: true, updatedAt: true,
          budgets: { where: { stage: BudgetStage.FINAL_EXECUTED, status: BudgetStatus.APPROVED },
            select: { id: true, total: true, version: true }, take: 1 } } }),
      this.prisma.measurementItem.findMany({ where: { tenantId, workOrderId: { in: ids },
        measurement: { status: { notIn: [MeasurementStatus.REJECTED, MeasurementStatus.CANCELED] } } }, select: { workOrderId: true } }),
    ]);
    if (!contract) throw new BadRequestException('Contrato inválido para a organização.');
    if (dto.commitmentId && !commitment) throw new BadRequestException('Empenho inválido para este contrato.');
    if (workOrders.length !== ids.length) throw new BadRequestException('Uma ou mais OS não estão concluídas, elegíveis ou vinculadas ao contrato.');
    if (alreadyMeasured.length) throw new ConflictException('Uma ou mais OS já integram medição ativa.');
    const byId = new Map(workOrders.map((item) => [item.id, item]));
    const values = dto.items.map((item) => {
      const amount = new Prisma.Decimal(item.amount);
      const deduction = new Prisma.Decimal(item.deductionAmount ?? 0);
      if (deduction.greaterThan(amount)) throw new BadRequestException('A dedução não pode superar o valor do item.');
      const workOrder = byId.get(item.workOrderId)!;
      const finalBudget = workOrder.budgets[0];
      const executionBasis = finalBudget?.total ?? workOrder.finalCost ?? workOrder.approvedCost;
      if (!executionBasis || amount.greaterThan(executionBasis)) {
        throw new BadRequestException(`O valor medido da OS ${workOrder.number} excede o custo executado/aprovado.`);
      }
      return { ...item, amount, deduction, net: amount.minus(deduction), workOrder, finalBudget };
    });
    const gross = values.reduce((total, item) => total.plus(item.amount), new Prisma.Decimal(0));
    const deductions = values.reduce((total, item) => total.plus(item.deduction), new Prisma.Decimal(0));
    const created = await this.prisma.$transaction(async (tx) => {
      for (const workOrderId of ids) {
        await tx.$queryRaw`SELECT id FROM WorkOrder WHERE id = ${workOrderId} AND tenantId = ${tenantId} FOR UPDATE`;
      }
      const concurrentMeasurement = await tx.measurementItem.findFirst({ where: { tenantId,
        workOrderId: { in: ids }, measurement: { status: { notIn: [MeasurementStatus.REJECTED, MeasurementStatus.CANCELED] } } } });
      if (concurrentMeasurement) throw new ConflictException('Uma ou mais OS acabaram de ser incluídas em outra medição.');
      const measurement = await tx.measurement.create({ data: {
        tenantId, contractId: dto.contractId, commitmentId: dto.commitmentId,
        createdByUserId: actorUserId, number: dto.number.trim().toUpperCase(),
        referenceMonth: dto.referenceMonth, grossAmount: gross, deductions,
        netAmount: gross.minus(deductions), notes: dto.notes,
        items: { create: values.map((item) => ({ tenantId, workOrderId: item.workOrderId, budgetId: item.finalBudget?.id,
          description: item.description, amount: item.amount, deductionAmount: item.deduction,
          netAmount: item.net, snapshot: { number: item.workOrder.number, title: item.workOrder.title,
            finalCost: item.workOrder.finalCost?.toString() ?? null,
            approvedCost: item.workOrder.approvedCost?.toString() ?? null,
            updatedAt: item.workOrder.updatedAt.toISOString(), finalBudgetId: item.finalBudget?.id ?? null,
            finalBudgetVersion: item.finalBudget?.version ?? null } })) },
      }, include: { contract: true, items: { include: { workOrder: true } } } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'Measurement', measurement.id,
        { number: measurement.number, netAmount: measurement.netAmount.toString() });
      return measurement;
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe uma medição com este número no contrato.');
      }
      throw error;
    });
    const configured = await this.prisma.contractKpi.count({ where: { tenantId, contractId: dto.contractId, active: true, deletedAt: null } });
    if (configured) {
      await this.kpis.calculateContractPerformance(tenantId, actorUserId, dto.contractId, {
        referenceMonth: dto.referenceMonth, financialMeasurementId: created.id,
      });
      return this.getMeasurement(tenantId, created.id);
    }
    return created;
  }

  async consolidateFinalBudgets(tenantId: string, actorUserId: string, dto: ConsolidateMeasurementDto) {
    const start = new Date(`${dto.referenceMonth}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const workOrders = await this.prisma.workOrder.findMany({ where: {
      tenantId, deletedAt: null, status: { in: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CLOSED] },
      measurementEligible: true, contracts: { some: { contractId: dto.contractId } },
      OR: [{ completedAt: { gte: start, lt: end } }, { closedAt: { gte: start, lt: end } }],
      budgets: { some: { stage: BudgetStage.FINAL_EXECUTED, status: BudgetStatus.APPROVED } },
      measurementItems: { none: { measurement: { status: { notIn: [MeasurementStatus.REJECTED, MeasurementStatus.CANCELED] } } } },
    }, include: { budgets: { where: { stage: BudgetStage.FINAL_EXECUTED, status: BudgetStatus.APPROVED }, take: 1 } },
      orderBy: [{ completedAt: 'asc' }, { number: 'asc' }] });
    if (!workOrders.length) throw new BadRequestException('Nenhuma OS concluída na competência possui orçamento final aprovado e está livre para medição.');
    return this.createMeasurement(tenantId, actorUserId, { contractId: dto.contractId,
      commitmentId: dto.commitmentId, number: dto.number, referenceMonth: dto.referenceMonth,
      notes: dto.notes ?? 'Consolidação automática dos orçamentos finais executados da competência.',
      items: workOrders.map((workOrder) => ({ workOrderId: workOrder.id,
        amount: workOrder.budgets[0].total.toNumber(), description: `Orçamento final executado — ${workOrder.number}` })) });
  }

  async transitionMeasurement(tenantId: string, actorUserId: string, id: string, dto: TransitionMeasurementDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Measurement WHERE id = ${id} AND tenantId = ${tenantId} FOR UPDATE`;
      const current = await tx.measurement.findFirst({ where: { id, tenantId }, include: { commitment: { include: { movements: true } } } });
      if (!current) throw new NotFoundException('Medição não encontrada.');
      if (current.version !== dto.version) throw new ConflictException('A medição foi alterada; atualize a tela e tente novamente.');
      if (!canTransitionMeasurement(current.status, dto.status)) throw new BadRequestException(`Transição ${current.status} → ${dto.status} não permitida.`);
      if ((dto.status === MeasurementStatus.REJECTED || dto.status === MeasurementStatus.CANCELED) && !dto.note) {
        throw new BadRequestException('Informe a justificativa da decisão.');
      }
      const now = new Date();
      const data: Prisma.MeasurementUpdateInput = { status: dto.status, version: { increment: 1 }, decisionNote: dto.note,
        submittedAt: dto.status === MeasurementStatus.SUBMITTED ? now : undefined,
        reviewedAt: dto.status === MeasurementStatus.APPROVED || dto.status === MeasurementStatus.REJECTED ? now : undefined,
        reviewedBy: dto.status === MeasurementStatus.APPROVED || dto.status === MeasurementStatus.REJECTED ? { connect: { id: actorUserId } } : undefined,
        approvedAt: dto.status === MeasurementStatus.APPROVED ? now : undefined,
        approvedBy: dto.status === MeasurementStatus.APPROVED ? { connect: { id: actorUserId } } : undefined,
        liquidatedAt: dto.status === MeasurementStatus.LIQUIDATED ? now : undefined,
        paidAt: dto.status === MeasurementStatus.PAID ? now : undefined,
        canceledAt: dto.status === MeasurementStatus.CANCELED ? now : undefined };
      if (dto.status === MeasurementStatus.APPROVED) {
        const contract = await tx.contract.findFirst({ where: { id: current.contractId, tenantId }, select: { currentValue: true, measuredValue: true } });
        if (!contract || contract.measuredValue.plus(current.netAmount).greaterThan(contract.currentValue)) {
          throw new BadRequestException('A aprovação excede o saldo vigente do contrato.');
        }
        await tx.contract.update({ where: { id: current.contractId }, data: { measuredValue: { increment: current.netAmount } } });
      }
      if ((dto.status === MeasurementStatus.LIQUIDATED || dto.status === MeasurementStatus.PAID) && current.commitment) {
        const movementType = dto.status === MeasurementStatus.LIQUIDATED ? CommitmentMovementType.LIQUIDATION : CommitmentMovementType.PAYMENT;
        assertCommitmentMovementBalance(current.commitment.movements, movementType, current.netAmount);
        await tx.commitmentMovement.create({ data: { tenantId, commitmentId: current.commitment.id,
          measurementId: current.id, createdByUserId: actorUserId, type: movementType,
          amount: current.netAmount, occurredAt: now, documentRef: current.number } });
      }
      if (dto.status === MeasurementStatus.PAID) {
        await tx.contract.update({ where: { id: current.contractId }, data: { paidValue: { increment: current.netAmount } } });
      }
      const updated = await tx.measurement.update({ where: { id }, data, include: { contract: true, commitment: true, items: true } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.STATUS_CHANGE, 'Measurement', id,
        { from: current.status, to: dto.status, version: updated.version, note: dto.note });
      return updated;
    });
  }

  private audit(tx: Prisma.TransactionClient, tenantId: string, actorUserId: string,
    action: AuditAction, entityType: string, entityId: string, afterData: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { tenantId, actorUserId, action, entityType, entityId, afterData } });
  }

  private async assertContractCommitmentCeiling(
    tx: Prisma.TransactionClient,
    tenantId: string,
    contractId: string,
    additionalAmount: Prisma.Decimal,
  ) {
    const [contract, commitments] = await Promise.all([
      tx.contract.findFirst({ where: { id: contractId, tenantId, deletedAt: null }, select: { code: true, currentValue: true } }),
      tx.commitment.findMany({
        where: { tenantId, contractId, canceledAt: null },
        select: { movements: { select: { type: true, amount: true } } },
      }),
    ]);
    if (!contract) throw new BadRequestException('Contrato inválido para a organização.');
    const committed = commitments.flatMap((item) => item.movements).reduce((total, movement) => {
      if (movement.type === CommitmentMovementType.CANCELLATION) return total.minus(movement.amount);
      if (movement.type === CommitmentMovementType.ISSUE || movement.type === CommitmentMovementType.REINFORCEMENT) {
        return total.plus(movement.amount);
      }
      return total;
    }, new Prisma.Decimal(0));
    if (committed.plus(additionalAmount).greaterThan(contract.currentValue)) {
      throw new BadRequestException(
        `O empenho excede o saldo contratual de ${contract.code}. `
        + `Valor atual: ${contract.currentValue.toFixed(2)}; já empenhado: ${committed.toFixed(2)}; `
        + `novo valor: ${additionalAmount.toFixed(2)}.`,
      );
    }
  }
}
