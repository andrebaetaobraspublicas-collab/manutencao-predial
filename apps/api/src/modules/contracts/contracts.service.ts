import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdjustmentType,
  AmendmentType,
  AuditAction,
  MembershipRole,
  MembershipStatus,
  Prisma,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import {
  CreateContractAdjustmentDto,
  CreateContractAmendmentDto,
  CreateContractPenaltyDto,
  CreateContractSubcontractDto,
} from './dto/contract-events.dto';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, actorUserId: string, dto: CreateContractDto) {
    const normalizedCode = dto.code.trim().toUpperCase();
    const [duplicate, supplier, buildings] = await Promise.all([
      this.prisma.contract.findFirst({
        where: { tenantId, code: normalizedCode, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, tenantId, deletedAt: null },
        select: { id: true },
      }),
      dto.buildingIds?.length
        ? this.prisma.building.findMany({
            where: { id: { in: dto.buildingIds }, tenantId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    if (duplicate) throw new ConflictException('Já existe contrato com esse código.');
    if (!supplier) throw new BadRequestException('Fornecedor não pertence à organização.');
    if (dto.buildingIds && buildings.length !== dto.buildingIds.length) {
      throw new BadRequestException('Uma ou mais edificações não pertencem à organização.');
    }
    await this.ensureUsersBelongToTenant(tenantId, [dto.managerUserId, dto.inspectorUserId]);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) throw new BadRequestException('A data final deve ser posterior à inicial.');

    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          tenantId,
          supplierId: dto.supplierId,
          code: normalizedCode,
          administrativeProcess: dto.administrativeProcess?.trim(),
          object: dto.object.trim(),
          type: dto.type,
          status: dto.status ?? 'ACTIVE',
          startDate,
          endDate,
          originalValue: dto.originalValue,
          currentValue: dto.originalValue,
          managerUserId: dto.managerUserId,
          inspectorUserId: dto.inspectorUserId,
          notes: dto.notes,
          buildings: dto.buildingIds?.length
            ? { create: dto.buildingIds.map((buildingId) => ({ buildingId })) }
            : undefined,
        },
        include: { supplier: true, buildings: { include: { building: true } } },
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'Contract', contract.id, {
        code: contract.code, originalValue: contract.originalValue.toString(), currentValue: contract.currentValue.toString(),
      });
      return contract;
    });
  }

  list(tenantId: string) {
    return this.prisma.contract.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { endDate: 'asc' }],
      include: {
        supplier: { select: { id: true, legalName: true, tradeName: true } },
        buildings: { include: { building: { select: { id: true, code: true, name: true } } } },
        _count: { select: { workOrders: true, measurements: true, amendments: true, adjustments: true,
          subcontractors: true, penalties: true, commitments: true } },
      },
    });
  }

  async get(tenantId: string, id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        supplier: true,
        buildings: { include: { building: true } },
        amendments: { orderBy: { createdAt: 'desc' } },
        adjustments: { orderBy: { createdAt: 'desc' } },
        subcontractors: { orderBy: { createdAt: 'desc' }, include: { supplier: true } },
        penalties: { orderBy: { appliedAt: 'desc' } },
        commitments: { include: { movements: true } },
        measurements: { orderBy: { referenceMonth: 'desc' } },
        workOrders: {
          include: { workOrder: { select: { id: true, number: true, title: true, status: true } } },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contrato não encontrado.');
    return contract;
  }

  async update(tenantId: string, actorUserId: string, id: string, dto: UpdateContractDto) {
    const current = await this.get(tenantId, id);

    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, tenantId, deletedAt: null },
      });
      if (!supplier) throw new BadRequestException('Fornecedor inválido para esta organização.');
    }

    if (dto.buildingIds) {
      const count = await this.prisma.building.count({
        where: { id: { in: dto.buildingIds }, tenantId, deletedAt: null },
      });
      if (count !== dto.buildingIds.length) {
        throw new BadRequestException('Uma ou mais edificações são inválidas.');
      }
    }

    await this.ensureUsersBelongToTenant(tenantId, [dto.managerUserId, dto.inspectorUserId]);

    const startDate = dto.startDate ? new Date(dto.startDate) : current.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : current.endDate;
    if (endDate <= startDate) {
      throw new BadRequestException('A data final deve ser posterior à inicial.');
    }

    const normalizedCode = dto.code?.trim().toUpperCase();
    if (normalizedCode && normalizedCode !== current.code) {
      const duplicate = await this.prisma.contract.findFirst({
        where: { tenantId, code: normalizedCode, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Já existe contrato com esse código.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.buildingIds) {
        await tx.contractBuilding.deleteMany({ where: { contractId: id } });
      }

      const updated = await tx.contract.update({
        where: { id },
        data: {
          supplierId: dto.supplierId,
          code: normalizedCode,
          administrativeProcess: dto.administrativeProcess,
          object: dto.object,
          type: dto.type,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          originalValue: dto.originalValue,
          managerUserId: dto.managerUserId,
          inspectorUserId: dto.inspectorUserId,
          notes: dto.notes,
          buildings: dto.buildingIds?.length
            ? { create: dto.buildingIds.map((buildingId) => ({ buildingId })) }
            : undefined,
        },
        include: { supplier: true, buildings: { include: { building: true } } },
      });
      await this.recomputeFinancials(tx, tenantId, id);
      await this.audit(tx, tenantId, actorUserId, AuditAction.UPDATE, 'Contract', id, {
        code: updated.code, originalValue: updated.originalValue.toString(),
      });
      return tx.contract.findUniqueOrThrow({ where: { id }, include: { supplier: true,
        buildings: { include: { building: true } } } });
    });
  }

  async addAmendment(tenantId: string, actorUserId: string, contractId: string, dto: CreateContractAmendmentDto) {
    const contract = await this.get(tenantId, contractId);
    if (dto.type === AmendmentType.TERM_EXTENSION && !dto.endDateAfter) {
      throw new BadRequestException('A prorrogação exige a nova data final de vigência.');
    }
    if ((dto.type === AmendmentType.VALUE_INCREASE || dto.type === AmendmentType.VALUE_DECREASE) && dto.valueChange === undefined) {
      throw new BadRequestException('O termo de valor exige o acréscimo ou a supressão financeira.');
    }
    if (dto.type === AmendmentType.VALUE_INCREASE && (dto.valueChange ?? 0) <= 0) {
      throw new BadRequestException('O acréscimo deve possuir valor positivo.');
    }
    if (dto.type === AmendmentType.VALUE_DECREASE && (dto.valueChange ?? 0) >= 0) {
      throw new BadRequestException('A supressão deve possuir valor negativo.');
    }
    const endDateAfter = dto.endDateAfter ? new Date(dto.endDateAfter) : undefined;
    if (dto.type === AmendmentType.TERM_EXTENSION && endDateAfter && endDateAfter <= contract.endDate) {
      throw new BadRequestException('A prorrogação deve ampliar a vigência final atual do contrato.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Contract WHERE id = ${contractId} AND tenantId = ${tenantId} FOR UPDATE`;
      const amendment = await tx.contractAmendment.create({ data: {
        tenantId, contractId, number: dto.number.trim(), type: dto.type,
        description: dto.description.trim(), signedAt: dto.signedAt ? new Date(dto.signedAt) : undefined,
        effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
        endDateBefore: endDateAfter ? contract.endDate : undefined, endDateAfter, valueChange: dto.valueChange,
      } });
      await this.recomputeFinancials(tx, tenantId, contractId);
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'ContractAmendment', amendment.id,
        { contractId, number: amendment.number, type: amendment.type, valueChange: amendment.valueChange?.toString() ?? null });
      return amendment;
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe termo de aditamento com esse número no contrato.');
      }
      throw error;
    });
  }

  async addAdjustment(tenantId: string, actorUserId: string, contractId: string, dto: CreateContractAdjustmentDto) {
    await this.get(tenantId, contractId);
    if (!Number.isFinite(dto.amount) || dto.amount === 0) {
      throw new BadRequestException('Informe o impacto financeiro do reajuste ou da repactuação.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Contract WHERE id = ${contractId} AND tenantId = ${tenantId} FOR UPDATE`;
      const adjustment = await tx.contractAdjustment.create({ data: {
        tenantId, contractId, type: dto.type, referencePeriod: dto.referencePeriod.trim(),
        requestDate: dto.requestDate ? new Date(dto.requestDate) : undefined,
        approvalDate: new Date(dto.approvalDate), percentage: dto.percentage, amount: dto.amount,
        indexName: dto.indexName?.trim(), notes: dto.notes?.trim(),
      } });
      await this.recomputeFinancials(tx, tenantId, contractId);
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'ContractAdjustment', adjustment.id,
        { contractId, type: adjustment.type, amount: adjustment.amount?.toString() ?? null });
      return adjustment;
    });
  }

  async addSubcontract(tenantId: string, actorUserId: string, contractId: string, dto: CreateContractSubcontractDto) {
    await this.get(tenantId, contractId);
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, tenantId, deletedAt: null }, select: { id: true } });
      if (!supplier) throw new BadRequestException('Subcontratada não pertence à organização.');
    }
    if (dto.startDate && dto.endDate && new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw new BadRequestException('A data final da subcontratação deve ser posterior à inicial.');
    }
    return this.prisma.$transaction(async (tx) => {
      const subcontract = await tx.contractSubcontract.create({ data: {
        tenantId, contractId, supplierId: dto.supplierId, subcontractorName: dto.subcontractorName.trim(),
        subcontractorTaxId: dto.subcontractorTaxId?.trim(), scope: dto.scope.trim(), amount: dto.amount,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined, approvedAt: new Date(dto.approvedAt),
        authorizationCase: dto.authorizationCase.trim(),
      } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'ContractSubcontract', subcontract.id,
        { contractId, supplierId: dto.supplierId ?? null, authorizationCase: subcontract.authorizationCase });
      return subcontract;
    });
  }

  async addPenalty(tenantId: string, actorUserId: string, contractId: string, dto: CreateContractPenaltyDto) {
    const contract = await this.get(tenantId, contractId);
    return this.prisma.$transaction(async (tx) => {
      const penalty = await tx.contractPenalty.create({ data: {
        tenantId, contractId, supplierId: contract.supplierId, registeredByUserId: actorUserId,
        type: dto.type, administrativeCase: dto.administrativeCase?.trim(), description: dto.description.trim(),
        amount: dto.amount, appliedAt: new Date(dto.appliedAt), startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'ContractPenalty', penalty.id,
        { contractId, supplierId: contract.supplierId, type: penalty.type });
      return penalty;
    });
  }

  private async recomputeFinancials(tx: Prisma.TransactionClient, tenantId: string, contractId: string) {
    const contract = await tx.contract.findFirstOrThrow({ where: { id: contractId, tenantId, deletedAt: null }, select: { originalValue: true, endDate: true } });
    const [amendments, adjustments] = await Promise.all([
      tx.contractAmendment.findMany({ where: { tenantId, contractId, status: 'ACTIVE', canceledAt: null }, select: { valueChange: true, endDateAfter: true } }),
      tx.contractAdjustment.findMany({ where: { tenantId, contractId, status: 'ACTIVE', canceledAt: null }, select: { amount: true } }),
    ]);
    const currentValue = [...amendments.map((item) => item.valueChange), ...adjustments.map((item) => item.amount)]
      .reduce<Prisma.Decimal>((total, value) => value ? total.plus(value) : total,
        new Prisma.Decimal(contract.originalValue));
    const endDate = amendments.reduce((latest, item) => item.endDateAfter && item.endDateAfter > latest ? item.endDateAfter : latest, contract.endDate);
    await tx.contract.update({ where: { id: contractId }, data: { currentValue, endDate } });
  }

  private audit(tx: Prisma.TransactionClient, tenantId: string, actorUserId: string,
    action: AuditAction, entityType: string, entityId: string, afterData: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { tenantId, actorUserId, action, entityType, entityId, afterData } });
  }

  private async ensureUsersBelongToTenant(
    tenantId: string,
    userIds: Array<string | undefined>,
  ): Promise<void> {
    const ids = [...new Set(userIds.filter((value): value is string => Boolean(value)))];
    if (!ids.length) return;

    const now = new Date();
    const memberships = await this.prisma.tenantMembership.findMany({
      where: {
        tenantId,
        userId: { in: ids },
        status: MembershipStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        role: {
          in: [
            MembershipRole.OWNER,
            MembershipRole.ADMIN,
            MembershipRole.MANAGER,
            MembershipRole.CONTRACT_MANAGER,
            MembershipRole.CONTRACT_INSPECTOR,
          ],
        },
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
      select: { userId: true },
    });
    if (new Set(memberships.map((membership) => membership.userId)).size !== ids.length) {
      throw new BadRequestException(
        'Gestor ou fiscal não possui papel gerencial ativo na organização.',
      );
    }
  }
}
