import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extension } from 'mime-types';
import {
  AdjustmentType,
  AmendmentType,
  AuditAction,
  ContractDossierAttachmentEntity,
  MembershipRole,
  MembershipStatus,
  Prisma,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveUploadRoot,
  sanitizeUploadOriginalName,
} from '../../common/files/upload-storage';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import {
  CreateContractAdjustmentDto,
  CreateContractAmendmentDto,
  CreateContractPenaltyDto,
  CreateContractSubcontractDto,
} from './dto/contract-events.dto';
import {
  CreateConstructionDiaryDto,
  CreateContractApostilleDto,
  CreateContractCommunicationClaimDto,
  CreateContractGuaranteeDto,
  CreateContractInspectionTeamMemberDto,
  CreateContractReceiptDto,
} from './dto/contract-governance.dto';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

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
          executionRegime: dto.executionRegime ?? 'GLOBAL_PRICE',
          nature: dto.nature ?? 'CONTINUOUS',
          status: dto.status ?? 'ACTIVE',
          startDate,
          endDate,
          originalValue: dto.originalValue,
          currentValue: dto.originalValue,
          adjustmentBaseDate: dto.adjustmentBaseDate ? new Date(dto.adjustmentBaseDate) : undefined,
          adjustmentIndex: dto.adjustmentIndex?.trim(),
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
          subcontractors: true, penalties: true, commitments: true, inspectionTeam: true,
          guarantees: true, apostilles: true, receipts: true, constructionDiaries: true,
          communications: true } },
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
        inspectionTeam: {
          where: { deletedAt: null },
          orderBy: [{ isPrimary: 'desc' }, { startsAt: 'desc' }],
          include: { inspector: true },
        },
        guarantees: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { analystInspector: { select: { id: true, name: true } } },
        },
        apostilles: { where: { deletedAt: null }, orderBy: { date: 'desc' } },
        receipts: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { responsibleInspector: { select: { id: true, name: true } } },
        },
        constructionDiaries: {
          where: { deletedAt: null },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          include: {
            responsibleInspector: { select: { id: true, name: true } },
            workOrder: { select: { id: true, number: true, title: true } },
          },
        },
        communications: {
          where: { deletedAt: null },
          orderBy: { protocolDate: 'desc' },
          include: { responsibleInspector: { select: { id: true, name: true } } },
        },
        dossierAttachments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true, entityType: true, entityId: true, kind: true, originalName: true,
            mimeType: true, sizeBytes: true, createdAt: true },
        },
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
          executionRegime: dto.executionRegime,
          nature: dto.nature,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          originalValue: dto.originalValue,
          adjustmentBaseDate: dto.adjustmentBaseDate ? new Date(dto.adjustmentBaseDate) : undefined,
          adjustmentIndex: dto.adjustmentIndex?.trim(),
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

  async archive(tenantId: string, actorUserId: string, id: string) {
    const current = await this.get(tenantId, id);
    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.contract.update({
        where: { id },
        data: { status: 'TERMINATED', deletedAt: new Date() },
      });
      await tx.slaPolicy.updateMany({
        where: { tenantId, contractId: id, active: true },
        data: { active: false },
      });
      await tx.maintenancePlan.updateMany({
        where: { tenantId, contractId: id, active: true },
        data: { active: false, suspendedAt: new Date() },
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.DELETE, 'Contract', id, {
        code: current.code,
        archived: true,
        preservedWorkOrders: current.workOrders.length,
        preservedMeasurements: current.measurements.length,
        preservedCommitments: current.commitments.length,
      });
      return archived;
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

  async addInspectionTeamMember(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    dto: CreateContractInspectionTeamMemberDto,
  ) {
    await Promise.all([
      this.get(tenantId, contractId),
      this.ensureInspectorBelongsToTenant(tenantId, dto.inspectorProfileId),
    ]);
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : undefined;
    if (endsAt && endsAt < startsAt) {
      throw new BadRequestException('O fim da designação não pode ser anterior ao início.');
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.contractInspectionTeamMember.updateMany({
          where: { tenantId, contractId, role: dto.role, isPrimary: true, deletedAt: null },
          data: { isPrimary: false },
        });
      }
      const assignment = await tx.contractInspectionTeamMember.create({ data: {
        tenantId,
        contractId,
        inspectorProfileId: dto.inspectorProfileId,
        assignedByUserId: actorUserId,
        role: dto.role,
        designationAct: dto.designationAct.trim(),
        startsAt,
        endsAt,
        isPrimary: dto.isPrimary ?? false,
        notes: dto.notes?.trim(),
      } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE,
        'ContractInspectionTeamMember', assignment.id, {
          contractId,
          inspectorProfileId: assignment.inspectorProfileId,
          role: assignment.role,
          designationAct: assignment.designationAct,
        });
      return assignment;
    });
  }

  async addGuarantee(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    dto: CreateContractGuaranteeDto,
  ) {
    const contract = await this.get(tenantId, contractId);
    await Promise.all([
      this.ensureInspectorBelongsToTenant(tenantId, dto.analystInspectorId),
      this.ensureUsersBelongToTenant(tenantId, [dto.analystUserId]),
    ]);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('O fim da vigência da garantia deve ser posterior ao início.');
    }
    const guaranteedValue = dto.guaranteedValue ?? Number(
      new Prisma.Decimal(contract.currentValue).mul(dto.contractPercentage).div(100).toFixed(2),
    );
    if (guaranteedValue <= 0) {
      throw new BadRequestException('O valor garantido deve ser maior que zero.');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const guarantee = await tx.contractGuarantee.create({ data: {
          tenantId,
          contractId,
          createdByUserId: actorUserId,
          analystUserId: dto.analystUserId,
          analystInspectorId: dto.analystInspectorId,
          number: dto.number.trim(),
          modality: dto.modality,
          guarantorName: dto.guarantorName?.trim(),
          guarantorTaxId: dto.guarantorTaxId?.trim(),
          contractPercentage: dto.contractPercentage,
          guaranteedValue,
          minimumPercentage: dto.minimumPercentage,
          issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
          startsAt,
          endsAt,
          status: dto.status,
          workflow: dto.workflow.trim(),
          executionValue: dto.executionValue ?? 0,
          recoveredValue: dto.recoveredValue ?? 0,
          releasedAt: dto.releasedAt ? new Date(dto.releasedAt) : undefined,
          coverages: dto.coverages?.trim(),
          history: dto.history?.trim(),
        } });
        await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE,
          'ContractGuarantee', guarantee.id, {
            contractId,
            number: guarantee.number,
            status: guarantee.status,
            guaranteedValue: guarantee.guaranteedValue.toString(),
          });
        return guarantee;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe garantia com esse número no contrato.');
      }
      throw error;
    }
  }

  async addApostille(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    dto: CreateContractApostilleDto,
  ) {
    await this.get(tenantId, contractId);
    const financialTypes = new Set(['PRICE_ADJUSTMENT', 'REPACTUATION', 'MONETARY_UPDATE']);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Contract WHERE id = ${contractId} AND tenantId = ${tenantId} FOR UPDATE`;
        const locked = await tx.contract.findFirstOrThrow({
          where: { id: contractId, tenantId, deletedAt: null },
          select: { currentValue: true },
        });
        const valueBefore = new Prisma.Decimal(locked.currentValue);
        let valueChange = new Prisma.Decimal(dto.valueChange ?? 0);
        if (financialTypes.has(dto.type) && dto.valueChange === undefined && dto.percentage !== undefined) {
          valueChange = valueBefore.mul(dto.percentage).div(100).toDecimalPlaces(2);
        }
        if (!financialTypes.has(dto.type)) valueChange = new Prisma.Decimal(0);
        if (financialTypes.has(dto.type) && valueChange.isZero()) {
          throw new BadRequestException('Informe o percentual ou o impacto financeiro do apostilamento.');
        }
        const valueAfter = valueBefore.plus(valueChange);
        if (valueAfter.isNegative()) {
          throw new BadRequestException('O apostilamento não pode tornar o valor contratual negativo.');
        }
        const apostille = await tx.contractApostille.create({ data: {
          tenantId,
          contractId,
          createdByUserId: actorUserId,
          number: dto.number.trim(),
          type: dto.type,
          date: new Date(dto.date),
          indexName: dto.indexName?.trim(),
          percentage: dto.percentage,
          valueBefore,
          valueChange,
          valueAfter,
          calculationMemo: dto.calculationMemo?.trim(),
          justification: dto.justification.trim(),
        } });
        await this.recomputeFinancials(tx, tenantId, contractId);
        await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE,
          'ContractApostille', apostille.id, {
            contractId,
            number: apostille.number,
            type: apostille.type,
            valueChange: apostille.valueChange.toString(),
          });
        return apostille;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe apostilamento com esse número no contrato.');
      }
      throw error;
    }
  }

  async addReceipt(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    dto: CreateContractReceiptDto,
  ) {
    await Promise.all([
      this.get(tenantId, contractId),
      this.ensureInspectorBelongsToTenant(tenantId, dto.responsibleInspectorId),
    ]);
    const observationStartsAt = dto.observationStartsAt ? new Date(dto.observationStartsAt) : undefined;
    const observationEndsAt = dto.observationEndsAt ? new Date(dto.observationEndsAt) : undefined;
    if (observationStartsAt && observationEndsAt && observationEndsAt < observationStartsAt) {
      throw new BadRequestException('O fim da observação não pode ser anterior ao início.');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const receipt = await tx.contractReceipt.create({ data: {
          tenantId,
          contractId,
          createdByUserId: actorUserId,
          responsibleInspectorId: dto.responsibleInspectorId,
          number: dto.number.trim(),
          type: dto.type,
          objectCategory: dto.objectCategory.trim(),
          requestProtocol: dto.requestProtocol?.trim(),
          protocolAt: dto.protocolAt ? new Date(dto.protocolAt) : undefined,
          inspectionDate: dto.inspectionDate ? new Date(dto.inspectionDate) : undefined,
          status: dto.status,
          provisionalRequired: dto.provisionalRequired,
          decision: dto.decision,
          commissionOrdinance: dto.commissionOrdinance?.trim(),
          quorum: dto.quorum?.trim(),
          contractorDocuments: dto.contractorDocuments?.trim(),
          inspectionsAndTests: dto.inspectionsAndTests?.trim(),
          observationStartsAt,
          observationEndsAt,
          technicalWarrantyEndsAt: dto.technicalWarrantyEndsAt ? new Date(dto.technicalWarrantyEndsAt) : undefined,
          occurrences: dto.occurrences?.trim(),
          consolidatedOpinion: dto.consolidatedOpinion.trim(),
          competentAuthority: dto.competentAuthority?.trim(),
          pendingItems: dto.pendingItems as Prisma.InputJsonValue | undefined,
        } });
        await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE,
          'ContractReceipt', receipt.id, {
            contractId,
            number: receipt.number,
            type: receipt.type,
            status: receipt.status,
          });
        return receipt;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe recebimento com esse número no contrato.');
      }
      throw error;
    }
  }

  async addConstructionDiary(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    dto: CreateConstructionDiaryDto,
  ) {
    await Promise.all([
      this.get(tenantId, contractId),
      this.ensureInspectorBelongsToTenant(tenantId, dto.responsibleInspectorId),
    ]);
    if (dto.workOrderId) {
      const link = await this.prisma.workOrderContract.findFirst({
        where: { contractId, workOrderId: dto.workOrderId, contract: { tenantId, deletedAt: null } },
        select: { id: true },
      });
      if (!link) throw new BadRequestException('A ordem de serviço não está vinculada ao contrato.');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const diary = await tx.constructionDiary.create({ data: {
          tenantId,
          contractId,
          workOrderId: dto.workOrderId,
          createdByUserId: actorUserId,
          responsibleInspectorId: dto.responsibleInspectorId,
          number: dto.number.trim(),
          date: new Date(dto.date),
          openedAt: dto.openedAt ? new Date(dto.openedAt) : undefined,
          closedAt: dto.closedAt ? new Date(dto.closedAt) : undefined,
          operationalSituation: dto.operationalSituation.trim(),
          weather: dto.weather?.trim(),
          temperatureCelsius: dto.temperatureCelsius,
          precipitationMm: dto.precipitationMm,
          status: dto.status,
          workFront: dto.workFront?.trim(),
          ownWorkforce: dto.ownWorkforce ?? 0,
          outsourcedWorkforce: dto.outsourcedWorkforce ?? 0,
          servicesPerformed: dto.servicesPerformed?.trim(),
          servicesInProgress: dto.servicesInProgress?.trim(),
          servicesCompleted: dto.servicesCompleted?.trim(),
          equipmentMobilized: dto.equipmentMobilized?.trim(),
          equipmentDemobilized: dto.equipmentDemobilized?.trim(),
          materialsReceived: dto.materialsReceived?.trim(),
          testsAndQualityControl: dto.testsAndQualityControl?.trim(),
          occurrencesAndRisks: dto.occurrencesAndRisks?.trim(),
          contractualImpact: dto.contractualImpact?.trim(),
          formalCommunications: dto.formalCommunications?.trim(),
          inspectionDirections: dto.inspectionDirections?.trim(),
          notes: dto.notes?.trim(),
        } });
        await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE,
          'ConstructionDiary', diary.id, {
            contractId,
            number: diary.number,
            date: diary.date.toISOString(),
            status: diary.status,
          });
        return diary;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe diário com esse número no contrato.');
      }
      throw error;
    }
  }

  async addCommunicationClaim(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    dto: CreateContractCommunicationClaimDto,
  ) {
    await Promise.all([
      this.get(tenantId, contractId),
      this.ensureInspectorBelongsToTenant(tenantId, dto.responsibleInspectorId),
    ]);
    const protocolDate = new Date(dto.protocolDate);
    const standardDecisionDays = dto.standardDecisionDays ?? 30;
    const decisionDeadline = dto.decisionDeadline
      ? new Date(dto.decisionDeadline)
      : new Date(protocolDate.getTime() + standardDecisionDays * 86_400_000);
    if (dto.extensionApproved && !dto.extensionJustification?.trim()) {
      throw new BadRequestException('A prorrogação de prazo exige justificativa.');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const communication = await tx.contractCommunicationClaim.create({ data: {
          tenantId,
          contractId,
          createdByUserId: actorUserId,
          responsibleInspectorId: dto.responsibleInspectorId,
          number: dto.number.trim(),
          type: dto.type.trim(),
          protocolDate,
          sender: dto.sender.trim(),
          recipient: dto.recipient.trim(),
          priority: dto.priority,
          currentStatus: dto.currentStatus.trim(),
          claimNature: dto.claimNature?.trim(),
          workflowStage: dto.workflowStage.trim(),
          instructionStartsAt: dto.instructionStartsAt ? new Date(dto.instructionStartsAt) : undefined,
          instructionEndsAt: dto.instructionEndsAt ? new Date(dto.instructionEndsAt) : undefined,
          standardDecisionDays,
          decisionDeadline,
          extensionApproved: dto.extensionApproved ?? false,
          extensionJustification: dto.extensionJustification?.trim(),
          technicalDeadline: dto.technicalDeadline ? new Date(dto.technicalDeadline) : undefined,
          inspectionDeadline: dto.inspectionDeadline ? new Date(dto.inspectionDeadline) : undefined,
          legalDeadline: dto.legalDeadline ? new Date(dto.legalDeadline) : undefined,
          appealDeadline: dto.appealDeadline ? new Date(dto.appealDeadline) : undefined,
          subject: dto.subject.trim(),
          detailedDescription: dto.detailedDescription.trim(),
          technicalOpinion: dto.technicalOpinion?.trim(),
          inspectionOpinion: dto.inspectionOpinion?.trim(),
          legalOpinion: dto.legalOpinion?.trim(),
          decision: dto.decision?.trim(),
          forwardedModule: dto.forwardedModule?.trim(),
        } });
        await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE,
          'ContractCommunicationClaim', communication.id, {
            contractId,
            number: communication.number,
            type: communication.type,
            status: communication.currentStatus,
            decisionDeadline: communication.decisionDeadline?.toISOString() ?? null,
          });
        return communication;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe comunicação ou pleito com esse número no contrato.');
      }
      throw error;
    }
  }

  async archiveGovernanceEntry(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    kind: string,
    entryId: string,
  ) {
    await this.get(tenantId, contractId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      let affected = 0;
      let entityType = '';
      switch (kind) {
        case 'amendments':
          entityType = 'ContractAmendment';
          affected = (await tx.contractAmendment.updateMany({
            where: { id: entryId, tenantId, contractId, canceledAt: null },
            data: { canceledAt: now, status: 'CANCELED' },
          })).count;
          if (affected) await this.recomputeFinancials(tx, tenantId, contractId);
          break;
        case 'adjustments':
          entityType = 'ContractAdjustment';
          affected = (await tx.contractAdjustment.updateMany({
            where: { id: entryId, tenantId, contractId, canceledAt: null },
            data: { canceledAt: now, status: 'CANCELED' },
          })).count;
          if (affected) await this.recomputeFinancials(tx, tenantId, contractId);
          break;
        case 'subcontracts':
          entityType = 'ContractSubcontract';
          affected = (await tx.contractSubcontract.updateMany({
            where: { id: entryId, tenantId, contractId, canceledAt: null },
            data: { canceledAt: now, status: 'CANCELED' },
          })).count;
          break;
        case 'penalties':
          entityType = 'ContractPenalty';
          affected = (await tx.contractPenalty.updateMany({
            where: { id: entryId, tenantId, contractId, status: { not: 'CANCELED' } },
            data: { status: 'CANCELED' },
          })).count;
          break;
        case 'inspection-team':
          entityType = 'ContractInspectionTeamMember';
          affected = (await tx.contractInspectionTeamMember.updateMany({
            where: { id: entryId, tenantId, contractId, deletedAt: null },
            data: { deletedAt: now, endsAt: now },
          })).count;
          break;
        case 'guarantees':
          entityType = 'ContractGuarantee';
          affected = (await tx.contractGuarantee.updateMany({
            where: { id: entryId, tenantId, contractId, deletedAt: null },
            data: { deletedAt: now },
          })).count;
          break;
        case 'apostilles':
          entityType = 'ContractApostille';
          affected = (await tx.contractApostille.updateMany({
            where: { id: entryId, tenantId, contractId, deletedAt: null },
            data: { deletedAt: now, status: 'CANCELED' },
          })).count;
          if (affected) await this.recomputeFinancials(tx, tenantId, contractId);
          break;
        case 'receipts':
          entityType = 'ContractReceipt';
          affected = (await tx.contractReceipt.updateMany({
            where: { id: entryId, tenantId, contractId, deletedAt: null },
            data: { deletedAt: now },
          })).count;
          break;
        case 'construction-diaries':
          entityType = 'ConstructionDiary';
          affected = (await tx.constructionDiary.updateMany({
            where: { id: entryId, tenantId, contractId, deletedAt: null },
            data: { deletedAt: now },
          })).count;
          break;
        case 'communications':
          entityType = 'ContractCommunicationClaim';
          affected = (await tx.contractCommunicationClaim.updateMany({
            where: { id: entryId, tenantId, contractId, deletedAt: null },
            data: { deletedAt: now },
          })).count;
          break;
        default:
          throw new BadRequestException('Tipo de registro contratual inválido.');
      }
      if (!affected) throw new NotFoundException('Registro contratual não encontrado.');
      await this.audit(tx, tenantId, actorUserId, AuditAction.DELETE, entityType, entryId, {
        contractId,
        archived: true,
      });
      return { id: entryId, archived: true };
    });
  }

  async uploadDossierAttachment(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    entityType: ContractDossierAttachmentEntity,
    entityId: string | undefined,
    kind: string,
    file?: Express.Multer.File,
  ) {
    await this.get(tenantId, contractId);
    if (!file) throw new BadRequestException('Arquivo não enviado.');
    if (!Object.values(ContractDossierAttachmentEntity).includes(entityType)) {
      throw new BadRequestException('Tipo de vínculo do anexo inválido.');
    }
    if (!kind?.trim()) throw new BadRequestException('Informe a classificação do documento.');
    await this.ensureDossierEntity(tenantId, contractId, entityType, entityId);

    const acceptedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!acceptedMimeTypes.includes(file.mimetype) || !this.hasExpectedSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('Somente PDF e imagens JPG/PNG/WebP válidos são aceitos.');
    }
    const root = resolveUploadRoot(this.config.get<string>('UPLOAD_ROOT'));
    const relativeDir = path.join(tenantId, 'contracts', contractId);
    const absoluteDir = this.resolveInsideRoot(root, relativeDir);
    await mkdir(absoluteDir, { recursive: true });
    const fileName = `${randomUUID()}.${extension(file.mimetype) || 'bin'}`;
    const storageKey = path.join(relativeDir, fileName).replaceAll(path.sep, '/');
    const absolutePath = path.join(absoluteDir, fileName);
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.contract.findFirst({
          where: { id: contractId, tenantId, deletedAt: null },
          select: { id: true },
        });
        if (!locked) throw new ConflictException('O contrato não está mais disponível.');
        const attachment = await tx.contractDossierAttachment.create({ data: {
          tenantId,
          contractId,
          uploadedByUserId: actorUserId,
          entityType,
          entityId: entityId || undefined,
          kind: kind.trim().slice(0, 80),
          storageKey,
          fileName,
          originalName: sanitizeUploadOriginalName(file.originalname),
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
        } });
        await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE,
          'ContractDossierAttachment', attachment.id, {
            contractId,
            entityType,
            entityId: entityId ?? null,
            kind: attachment.kind,
            originalName: attachment.originalName,
          });
        return attachment;
      });
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  async resolveDossierAttachmentForDownload(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    attachmentId: string,
  ) {
    await this.get(tenantId, contractId);
    const attachment = await this.prisma.contractDossierAttachment.findFirst({
      where: { id: attachmentId, tenantId, contractId, deletedAt: null },
    });
    if (!attachment) throw new NotFoundException('Documento contratual não encontrado.');
    const root = resolveUploadRoot(this.config.get<string>('UPLOAD_ROOT'));
    const absolutePath = this.resolveInsideRoot(root, attachment.storageKey);
    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException('Arquivo físico não localizado.');
    }
    await this.prisma.auditLog.create({ data: {
      tenantId,
      actorUserId,
      action: AuditAction.DOWNLOAD,
      entityType: 'ContractDossierAttachment',
      entityId: attachment.id,
      afterData: { contractId, originalName: attachment.originalName },
    } });
    return { attachment, absolutePath };
  }

  async archiveDossierAttachment(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    attachmentId: string,
  ) {
    await this.get(tenantId, contractId);
    const current = await this.prisma.contractDossierAttachment.findFirst({
      where: { id: attachmentId, tenantId, contractId, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Documento contratual não encontrado.');
    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.contractDossierAttachment.update({
        where: { id: attachmentId },
        data: { deletedAt: new Date() },
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.DELETE,
        'ContractDossierAttachment', attachmentId, {
          contractId,
          archived: true,
          originalName: current.originalName,
        });
      return archived;
    });
  }

  private async recomputeFinancials(tx: Prisma.TransactionClient, tenantId: string, contractId: string) {
    const contract = await tx.contract.findFirstOrThrow({ where: { id: contractId, tenantId, deletedAt: null }, select: { originalValue: true, endDate: true } });
    const [amendments, adjustments, apostilles] = await Promise.all([
      tx.contractAmendment.findMany({ where: { tenantId, contractId, status: 'ACTIVE', canceledAt: null }, select: { valueChange: true, endDateAfter: true } }),
      tx.contractAdjustment.findMany({ where: { tenantId, contractId, status: 'ACTIVE', canceledAt: null }, select: { amount: true } }),
      tx.contractApostille.findMany({ where: { tenantId, contractId, status: 'ACTIVE', deletedAt: null }, select: { valueChange: true } }),
    ]);
    const currentValue = [...amendments.map((item) => item.valueChange), ...adjustments.map((item) => item.amount),
      ...apostilles.map((item) => item.valueChange)]
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

  private async ensureInspectorBelongsToTenant(tenantId: string, inspectorProfileId?: string) {
    if (!inspectorProfileId) return;
    const inspector = await this.prisma.inspectorProfile.findFirst({
      where: { id: inspectorProfileId, tenantId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!inspector) throw new BadRequestException('Fiscal não pertence à organização ou está inativo.');
  }

  private async ensureDossierEntity(
    tenantId: string,
    contractId: string,
    entityType: ContractDossierAttachmentEntity,
    entityId?: string,
  ) {
    if (entityType === ContractDossierAttachmentEntity.CONTRACT) return;
    if (!entityId) throw new BadRequestException('Informe o registro ao qual o documento pertence.');
    const base = { id: entityId, tenantId, contractId, deletedAt: null };
    let exists = false;
    if (entityType === ContractDossierAttachmentEntity.GUARANTEE) {
      exists = Boolean(await this.prisma.contractGuarantee.findFirst({ where: base, select: { id: true } }));
    } else if (entityType === ContractDossierAttachmentEntity.APOSTILLE) {
      exists = Boolean(await this.prisma.contractApostille.findFirst({ where: base, select: { id: true } }));
    } else if (entityType === ContractDossierAttachmentEntity.RECEIPT) {
      exists = Boolean(await this.prisma.contractReceipt.findFirst({ where: base, select: { id: true } }));
    } else if (entityType === ContractDossierAttachmentEntity.CONSTRUCTION_DIARY) {
      exists = Boolean(await this.prisma.constructionDiary.findFirst({ where: base, select: { id: true } }));
    } else if (entityType === ContractDossierAttachmentEntity.COMMUNICATION_CLAIM) {
      exists = Boolean(await this.prisma.contractCommunicationClaim.findFirst({ where: base, select: { id: true } }));
    }
    if (!exists) throw new BadRequestException('O registro vinculado ao documento não pertence ao contrato.');
  }

  private resolveInsideRoot(root: string, relativePath: string) {
    const absolutePath = path.resolve(root, relativePath);
    const relative = path.relative(root, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException('Caminho de arquivo inválido.');
    }
    return absolutePath;
  }

  private hasExpectedSignature(buffer: Buffer, mimeType: string) {
    if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    if (mimeType === 'image/jpeg') {
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/png') {
      return buffer.length >= 8 && buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    }
    if (mimeType === 'image/webp') {
      return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
  }
}
