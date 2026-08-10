import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extension } from 'mime-types';
import {
  AttachmentKind,
  AuditAction,
  ContractStatus,
  MeasurementStatus,
  MembershipRole,
  MembershipStatus,
  NotificationEventType,
  OperationalCatalogKind,
  PendencyStatus,
  Prisma,
  WorkOrderOrigin,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveUploadRoot,
  sanitizeUploadOriginalName,
} from '../../common/files/upload-storage';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { NotificationOutboxService } from '../notifications/notification-outbox.service';
import { OperationsService } from '../operations/operations.service';
import { AddCommentDto } from './dto/add-comment.dto';
import { AddPendencyDto } from './dto/add-pendency.dto';
import { CloseWorkOrderDto } from './dto/close-work-order.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { ListWorkOrdersQuery } from './dto/list-work-orders.query';
import { ResolvePendencyDto } from './dto/resolve-pendency.dto';
import { ReopenWorkOrderDto } from './dto/reopen-work-order.dto';
import { RespondChecklistDto } from './dto/respond-checklist.dto';
import { SubmitSatisfactionDto } from './dto/submit-satisfaction.dto';
import { TransitionWorkOrderDto } from './dto/transition-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import {
  canTransition,
  OPEN_WORK_ORDER_STATUSES,
  TERMINAL_WORK_ORDER_STATUSES,
} from './work-order-state-machine';

const WORK_ORDER_EXECUTION_ROLES = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER,
  MembershipRole.CONTRACT_INSPECTOR,
  MembershipRole.OPERATOR,
] as const;

const WORK_ORDER_INCLUDE = {
  building: { select: { id: true, code: true, name: true, city: true, state: true } },
  supplier: { select: { id: true, legalName: true, tradeName: true } },
  requester: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  category: true,
  specialty: true,
  environment: true,
  cause: true,
  slaPolicy: { include: { calendar: true } },
  contracts: {
    include: {
      contract: {
        select: {
          id: true,
          code: true,
          object: true,
          status: true,
          startDate: true,
          endDate: true,
          deletedAt: true,
        },
      },
    },
  },
  pendencies: {
    where: { status: PendencyStatus.OPEN },
    orderBy: { createdAt: 'desc' as const },
  },
  _count: {
    select: {
      attachments: { where: { deletedAt: null } },
      statusHistory: true,
    },
  },
} satisfies Prisma.WorkOrderInclude;

type CompletionContext = {
  id: string;
  number: string;
  title: string;
  status: WorkOrderStatus;
  requesterUserId: string;
  assignedToUserId: string | null;
  categoryId: string | null;
  hasOpenPendency: boolean;
  solution: string | null;
  finalCost: unknown;
  approvedCost: unknown;
  acceptedByUserId: string | null;
  acceptanceNote: string | null;
  measurementEligible: boolean;
  operationalCriteriaSnapshot: Prisma.JsonValue;
  category: {
    requirePhotoBefore: boolean;
    requirePhotoDuring: boolean;
    requirePhotoAfter: boolean;
    requireChecklist: boolean;
    requireFinalCost: boolean;
    requireAcceptance: boolean;
  } | null;
  attachments: Array<{ kind: AttachmentKind }>;
  checklistItems: Array<{
    id: string;
    label: string;
    required: boolean;
    templateItem: { categoryId: string } | null;
    responses: Array<{ checked: boolean }>;
  }>;
  contracts: Array<{
    isPrimary: boolean;
    contract: {
      status: ContractStatus;
      startDate: Date;
      endDate: Date;
      deletedAt: Date | null;
    };
  }>;
  measurementItems: Array<{ measurement: { status: MeasurementStatus } }>;
};

type WorkOrderNotificationInput = {
  tenantId: string;
  workOrderId: string;
  number: string;
  recipientUserIds: Array<string | null | undefined>;
  eventType: NotificationEventType;
  deduplicationKey: string;
  title: string;
  message: string;
};

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly operations: OperationsService,
    private readonly notificationOutbox: NotificationOutboxService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    actorRole: MembershipRole,
    dto: CreateWorkOrderDto,
  ) {
    if (actorRole === MembershipRole.REQUESTER) {
      const attemptsPrivilegedAssignment =
        (dto.requesterUserId && dto.requesterUserId !== actorUserId) ||
        dto.assignedToUserId ||
        dto.supplierId ||
        dto.contractIds?.length ||
        dto.estimatedCost !== undefined ||
        (dto.origin && dto.origin !== WorkOrderOrigin.USER_REQUEST);
      if (attemptsPrivilegedAssignment) {
        throw new ForbiddenException(
          'Demandantes podem informar a necessidade, mas não atribuir fornecedor, contrato, executor ou custo.',
        );
      }
    }

    const requesterUserId =
      actorRole === MembershipRole.REQUESTER ? actorUserId : dto.requesterUserId ?? actorUserId;
    const defaultCategory = dto.categoryId
      ? null
      : await this.prisma.operationalCatalogItem.findFirst({
          where: {
            tenantId,
            kind: OperationalCatalogKind.CATEGORY,
            code: 'GERAL',
            active: true,
            deletedAt: null,
          },
        });
    const categoryId = dto.categoryId ?? defaultCategory?.id;
    await this.operations.validateWorkOrderClassification(tenantId, {
      categoryId,
      specialtyId: dto.specialtyId,
      environmentId: dto.environmentId,
      causeId: dto.causeId,
    });
    await this.validateReferences(tenantId, dto, requesterUserId);

    const contractRows = dto.contractIds?.length
      ? await this.prisma.contract.findMany({
          where: { id: { in: dto.contractIds }, tenantId, deletedAt: null },
          select: { id: true, supplierId: true },
        })
      : [];
    const contractById = new Map(contractRows.map((contract) => [contract.id, contract]));
    const contracts = (dto.contractIds ?? []).map((contractId) => contractById.get(contractId)!);
    const primaryContract = contracts[0];
    if (dto.supplierId && primaryContract && dto.supplierId !== primaryContract.supplierId) {
      throw new BadRequestException(
        'O fornecedor informado deve coincidir com o fornecedor do contrato principal.',
      );
    }

    const selectedCategory = categoryId
      ? await this.prisma.operationalCatalogItem.findFirst({
          where: {
            id: categoryId,
            tenantId,
            kind: OperationalCatalogKind.CATEGORY,
            active: true,
            deletedAt: null,
          },
          select: {
            id: true,
            code: true,
            name: true,
            defaultPriority: true,
            requirePhotoBefore: true,
            requirePhotoDuring: true,
            requirePhotoAfter: true,
            requireChecklist: true,
            requireFinalCost: true,
            requireAcceptance: true,
          },
        })
      : null;
    const priority = dto.priority ?? selectedCategory?.defaultPriority ?? WorkOrderPriority.NORMAL;
    const openedAt = new Date();
    const sla = await this.operations.calculateSla(tenantId, {
      startAt: openedAt,
      priority,
      contractId: primaryContract?.id,
      categoryId,
    });
    const year = openedAt.getUTCFullYear();

    return this.prisma.$transaction(async (tx) => {
      const sequence = await tx.tenantSequence.upsert({
        where: { tenantId_key: { tenantId, key: `WORK_ORDER:${year}` } },
        create: { tenantId, key: `WORK_ORDER:${year}`, currentValue: 1 },
        update: { currentValue: { increment: 1 } },
      });

      const number = `OS-${year}-${String(sequence.currentValue).padStart(6, '0')}`;
      const workOrder = await tx.workOrder.create({
        data: {
          tenantId,
          number,
          buildingId: dto.buildingId,
          requesterUserId,
          assignedToUserId: dto.assignedToUserId,
          createdByUserId: actorUserId,
          supplierId: dto.supplierId ?? contracts[0]?.supplierId,
          categoryId,
          specialtyId: dto.specialtyId,
          environmentId: dto.environmentId,
          causeId: dto.causeId,
          slaPolicyId: sla.policy.id,
          title: dto.title.trim(),
          description: dto.description.trim(),
          locationDetail: dto.locationDetail?.trim(),
          origin: dto.origin,
          priority,
          openedAt,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          slaResponseDeadline: sla.responseDeadline,
          slaResolutionDeadline: sla.resolutionDeadline,
          slaResolutionWarningAt: sla.resolutionWarningAt,
          slaSnapshot: this.buildSlaSnapshot(sla),
          operationalCriteriaSnapshot: selectedCategory
            ? this.buildOperationalCriteriaSnapshot(selectedCategory)
            : undefined,
          estimatedCost: dto.estimatedCost,
          contracts: contracts.length
            ? {
                create: contracts.map((contract, index) => ({
                  contractId: contract.id,
                  isPrimary: index === 0,
                })),
              }
            : undefined,
          statusHistory: {
            create: {
              changedByUserId: actorUserId,
              fromStatus: null,
              toStatus: WorkOrderStatus.OPEN,
              note: 'Ordem de serviço criada.',
            },
          },
        },
        include: WORK_ORDER_INCLUDE,
      });

      if (categoryId) {
        await this.operations.instantiateChecklist(tenantId, workOrder.id, categoryId, tx);
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.CREATE,
          entityType: 'WorkOrder',
          entityId: workOrder.id,
          afterData: { number: workOrder.number, status: workOrder.status },
        },
      });

      await this.enqueueWorkOrderEvent(tx, {
        tenantId,
        workOrderId: workOrder.id,
        number: workOrder.number,
        recipientUserIds: [requesterUserId, dto.assignedToUserId],
        eventType: NotificationEventType.WORK_ORDER_CREATED,
        deduplicationKey: `work-order:${workOrder.id}:created`,
        title: `OS ${workOrder.number} criada`,
        message: workOrder.title,
      });
      if (dto.assignedToUserId) {
        await this.enqueueWorkOrderEvent(tx, {
          tenantId,
          workOrderId: workOrder.id,
          number: workOrder.number,
          recipientUserIds: [dto.assignedToUserId],
          eventType: NotificationEventType.WORK_ORDER_ASSIGNED,
          deduplicationKey: `work-order:${workOrder.id}:assigned:${dto.assignedToUserId}:created`,
          title: `OS ${workOrder.number} atribuída a você`,
          message: workOrder.title,
        });
      }

      return workOrder;
    });
  }

  async listForUser(user: AuthenticatedUser, query: ListWorkOrdersQuery) {
    if (user.role !== MembershipRole.REQUESTER) {
      return this.list(user.tenantId, query);
    }

    const ownQuery = Object.assign(new ListWorkOrdersQuery(), query, {
      requesterUserId: user.userId,
    });
    return this.list(user.tenantId, ownQuery);
  }

  async list(tenantId: string, query: ListWorkOrdersQuery) {
    const where = this.buildListWhere(tenantId, query);

    const skip = (query.page - 1) * query.pageSize;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.findMany({
        where,
        include: WORK_ORDER_INCLUDE,
        orderBy: [{ openedAt: 'asc' }],
        skip,
        take: query.pageSize,
      }),
    ]);

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async listForReport(
    tenantId: string,
    query: ListWorkOrdersQuery,
    limit = 5_000,
  ) {
    const where = this.buildListWhere(tenantId, query);
    const safeLimit = Math.min(Math.max(limit, 1), 5_000);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.findMany({
        where,
        include: WORK_ORDER_INCLUDE,
        orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
        take: safeLimit,
      }),
    ]);
    return { items, total, truncated: total > items.length };
  }

  private buildListWhere(
    tenantId: string,
    query: ListWorkOrdersQuery,
    now = new Date(),
  ): Prisma.WorkOrderWhereInput {
    if (
      query.ageMinDays !== undefined &&
      query.ageMaxDays !== undefined &&
      query.ageMinDays > query.ageMaxDays
    ) {
      throw new BadRequestException(
        'A idade mínima do backlog não pode superar a idade máxima.',
      );
    }

    const where: Prisma.WorkOrderWhereInput = {
      tenantId,
      deletedAt: null,
      status: query.status,
      priority: query.priority,
      buildingId: query.buildingId,
      supplierId: query.supplierId,
      requesterUserId: query.requesterUserId,
      assignedToUserId: query.assignedToUserId,
      categoryId: query.categoryId,
      hasOpenPendency: query.hasOpenPendency,
    };

    if (query.contractId) {
      where.contracts = {
        some: {
          contractId: query.contractId,
          contract: { tenantId, deletedAt: null },
        },
      };
    }

    if (query.backlogOnly) where.status = { in: OPEN_WORK_ORDER_STATUSES };
    if (query.overdue) {
      where.status = { in: OPEN_WORK_ORDER_STATUSES };
      where.slaResolutionDeadline = { lt: now };
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { number: { contains: search } },
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (
      query.openedFrom ||
      query.openedTo ||
      query.ageMinDays !== undefined ||
      query.ageMaxDays !== undefined
    ) {
      const dayMs = 24 * 60 * 60_000;
      const ageMinimumDate =
        query.ageMaxDays !== undefined
          ? new Date(now.getTime() - (query.ageMaxDays + 1) * dayMs)
          : undefined;
      const ageMaximumDate =
        query.ageMinDays !== undefined
          ? new Date(now.getTime() - query.ageMinDays * dayMs)
          : undefined;
      const openedFrom = query.openedFrom ? new Date(query.openedFrom) : undefined;
      const openedTo = query.openedTo ? new Date(query.openedTo) : undefined;
      where.openedAt = {
        gte:
          openedFrom && ageMinimumDate
            ? new Date(Math.max(openedFrom.getTime(), ageMinimumDate.getTime()))
            : openedFrom ?? ageMinimumDate,
        lte:
          openedTo && ageMaximumDate
            ? new Date(Math.min(openedTo.getTime(), ageMaximumDate.getTime()))
            : openedTo ?? ageMaximumDate,
      };
    }
    return where;
  }

  async getForUser(user: AuthenticatedUser, id: string) {
    const workOrder = await this.get(user.tenantId, id);
    this.assertCanReadWorkOrder(user.role, user.userId, workOrder.requesterUserId);
    return workOrder;
  }

  async get(tenantId: string, id: string) {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        ...WORK_ORDER_INCLUDE,
        pendencies: { orderBy: { createdAt: 'desc' } },
        attachments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        comments: {
          include: {
            author: { select: { id: true, name: true, email: true } },
            mentions: {
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        checklistItems: {
          include: {
            templateItem: { select: { categoryId: true } },
            responses: {
              include: { respondedBy: { select: { id: true, name: true } } },
              orderBy: { revision: 'desc' },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        reopenings: {
          include: { reopenedBy: { select: { id: true, name: true } } },
          orderBy: { reopenedAt: 'desc' },
        },
        acceptedBy: { select: { id: true, name: true, email: true } },
        statusHistory: {
          include: { changedBy: { select: { id: true, name: true } } },
          orderBy: { changedAt: 'desc' },
        },
        budgets: { include: { items: true }, orderBy: { stage: 'asc' } },
        measurementItems: {
          select: { measurement: { select: { status: true } } },
        },
        satisfaction: true,
      },
    });

    if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
    return {
      ...workOrder,
      closeReadiness: this.evaluateCloseReadiness(workOrder),
    };
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateWorkOrderDto,
  ) {
    const current = await this.getBase(tenantId, id);
    if (TERMINAL_WORK_ORDER_STATUSES.includes(current.status)) {
      throw new BadRequestException('OS encerrada ou cancelada não pode ser editada.');
    }
    if (current.status === WorkOrderStatus.COMPLETED) {
      throw new BadRequestException(
        'Uma OS concluída deve ser fechada ou reaberta antes de receber alterações.',
      );
    }

    const classificationChanged =
      dto.categoryId !== undefined ||
      dto.specialtyId !== undefined ||
      dto.environmentId !== undefined ||
      dto.causeId !== undefined;
    if (classificationChanged) {
      await this.operations.validateWorkOrderClassification(tenantId, {
        categoryId: dto.categoryId ?? current.categoryId ?? undefined,
        specialtyId: dto.specialtyId ?? current.specialtyId ?? undefined,
        environmentId: dto.environmentId ?? current.environmentId ?? undefined,
        causeId: dto.causeId ?? current.causeId ?? undefined,
      });
    }

    const currentContractLinks = await this.prisma.workOrderContract.findMany({
      where: { workOrderId: id, workOrder: { tenantId } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { contractId: true, isPrimary: true },
    });
    const effectiveContractIds =
      dto.contractIds ?? currentContractLinks.map((link) => link.contractId);
    const contractRows = effectiveContractIds.length
      ? await this.prisma.contract.findMany({
          where: { id: { in: effectiveContractIds }, tenantId, deletedAt: null },
          select: { id: true, supplierId: true },
        })
      : [];
    const contractById = new Map(contractRows.map((contract) => [contract.id, contract]));
    const orderedContracts = effectiveContractIds.map((contractId) => contractById.get(contractId)!);
    const effectiveSupplierId =
      dto.supplierId !== undefined
        ? dto.supplierId
        : dto.contractIds !== undefined
          ? orderedContracts[0]?.supplierId ?? null
          : current.supplierId;
    if (effectiveSupplierId && orderedContracts[0] && effectiveSupplierId !== orderedContracts[0].supplierId) {
      throw new BadRequestException(
        'O fornecedor informado deve coincidir com o fornecedor do contrato principal.',
      );
    }

    await this.validateReferences(
      tenantId,
      {
        buildingId: dto.buildingId ?? current.buildingId,
        supplierId: effectiveSupplierId ?? undefined,
        assignedToUserId: dto.assignedToUserId ?? current.assignedToUserId ?? undefined,
        contractIds: effectiveContractIds,
      },
      dto.requesterUserId ?? current.requesterUserId,
    );

    const currentPrimaryContract = currentContractLinks.find((link) => link.isPrimary);
    const effectivePrimaryContractId =
      dto.contractIds !== undefined ? dto.contractIds[0] : currentPrimaryContract?.contractId;
    const effectiveCategoryId = dto.categoryId ?? current.categoryId ?? undefined;
    const effectiveCategory =
      dto.categoryId !== undefined && effectiveCategoryId
        ? await this.prisma.operationalCatalogItem.findFirst({
            where: {
              id: effectiveCategoryId,
              tenantId,
              kind: OperationalCatalogKind.CATEGORY,
              active: true,
              deletedAt: null,
            },
            select: {
              id: true,
              code: true,
              name: true,
              requirePhotoBefore: true,
              requirePhotoDuring: true,
              requirePhotoAfter: true,
              requireChecklist: true,
              requireFinalCost: true,
              requireAcceptance: true,
            },
          })
        : null;
    const shouldRecalculateSla =
      dto.priority !== undefined || dto.categoryId !== undefined || dto.contractIds !== undefined;
    const recalculatedSla = shouldRecalculateSla
      ? await this.operations.calculateSla(tenantId, {
          startAt: current.openedAt,
          priority: dto.priority ?? current.priority,
          contractId: effectivePrimaryContractId,
          categoryId: effectiveCategoryId,
        })
      : null;

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM WorkOrder WHERE id = ${id} AND tenantId = ${tenantId} FOR UPDATE`;
      const locked = await tx.workOrder.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: { status: true, updatedAt: true },
      });
      if (!locked) throw new NotFoundException('Ordem de serviço não encontrada.');
      if (
        locked.status !== current.status ||
        locked.updatedAt.getTime() !== current.updatedAt.getTime()
      ) {
        throw new ConflictException('A OS foi alterada por outro usuário. Atualize e tente novamente.');
      }
      if (
        TERMINAL_WORK_ORDER_STATUSES.includes(locked.status) ||
        locked.status === WorkOrderStatus.COMPLETED
      ) {
        throw new BadRequestException('A OS não pode mais ser editada no estado atual.');
      }

      if (dto.contractIds) {
        await tx.workOrderContract.deleteMany({ where: { workOrderId: id } });
      }

      const updated = await tx.workOrder.update({
        where: { id },
        data: {
          buildingId: dto.buildingId,
          requesterUserId: dto.requesterUserId,
          assignedToUserId: dto.assignedToUserId,
          supplierId: effectiveSupplierId,
          categoryId: dto.categoryId,
          specialtyId: dto.specialtyId,
          environmentId: dto.environmentId,
          causeId: dto.causeId,
          slaPolicyId: recalculatedSla?.policy.id,
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          locationDetail: dto.locationDetail?.trim(),
          origin: dto.origin,
          priority: dto.priority,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          estimatedCost: dto.estimatedCost,
          approvedCost: dto.approvedCost,
          finalCost: dto.finalCost,
          slaResponseDeadline: recalculatedSla?.responseDeadline,
          slaResolutionDeadline: recalculatedSla?.resolutionDeadline,
          slaResolutionWarningAt: recalculatedSla?.resolutionWarningAt,
          slaSnapshot: recalculatedSla ? this.buildSlaSnapshot(recalculatedSla) : undefined,
          operationalCriteriaSnapshot: effectiveCategory
            ? this.buildOperationalCriteriaSnapshot(effectiveCategory)
            : undefined,
          contracts: dto.contractIds !== undefined && orderedContracts.length
            ? {
                create: orderedContracts.map((contract, index) => ({
                  contractId: contract.id,
                  isPrimary: index === 0,
                })),
              }
            : undefined,
        },
        include: WORK_ORDER_INCLUDE,
      });

      if (dto.categoryId && dto.categoryId !== current.categoryId) {
        await this.instantiateMissingChecklist(tx, tenantId, id, dto.categoryId);
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.UPDATE,
          entityType: 'WorkOrder',
          entityId: id,
          beforeData: {
            title: current.title,
            priority: current.priority,
            slaPolicyId: current.slaPolicyId,
            slaResponseDeadline: current.slaResponseDeadline?.toISOString() ?? null,
            slaResolutionDeadline: current.slaResolutionDeadline?.toISOString() ?? null,
            slaResolutionWarningAt: current.slaResolutionWarningAt?.toISOString() ?? null,
            slaSnapshot: current.slaSnapshot,
          },
          afterData: {
            title: updated.title,
            priority: updated.priority,
            slaPolicyId: updated.slaPolicyId,
            slaResponseDeadline: updated.slaResponseDeadline?.toISOString() ?? null,
            slaResolutionDeadline: updated.slaResolutionDeadline?.toISOString() ?? null,
            slaResolutionWarningAt: updated.slaResolutionWarningAt?.toISOString() ?? null,
            slaSnapshot: updated.slaSnapshot,
          },
        },
      });
      if (dto.assignedToUserId && dto.assignedToUserId !== current.assignedToUserId) {
        await this.enqueueWorkOrderEvent(tx, {
          tenantId,
          workOrderId: id,
          number: updated.number,
          recipientUserIds: [dto.assignedToUserId, updated.requesterUserId],
          eventType: NotificationEventType.WORK_ORDER_ASSIGNED,
          deduplicationKey: `work-order:${id}:assigned:${dto.assignedToUserId}:${updated.updatedAt.toISOString()}`,
          title: `OS ${updated.number} atribuída`,
          message: updated.title,
        });
      }
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async archive(tenantId: string, actorUserId: string, id: string) {
    const current = await this.getBase(tenantId, id);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM WorkOrder WHERE id = ${id} AND tenantId = ${tenantId} FOR UPDATE`;
      const archived = await tx.workOrder.update({
        where: { id },
        data: {
          status: WorkOrderStatus.CANCELED,
          canceledAt: current.canceledAt ?? now,
          deletedAt: now,
          hasOpenPendency: false,
          measurementEligible: false,
        },
      });
      await tx.workOrderPendency.updateMany({
        where: { tenantId, workOrderId: id, status: 'OPEN' },
        data: { status: 'CANCELED', resolvedAt: now },
      });
      await tx.workOrderStatusHistory.create({ data: {
        workOrderId: id, changedByUserId: actorUserId,
        fromStatus: current.status, toStatus: WorkOrderStatus.CANCELED,
        note: 'Registro excluído pelo usuário; histórico preservado.',
      } });
      await tx.auditLog.create({ data: {
        tenantId, actorUserId, action: AuditAction.DELETE,
        entityType: 'WorkOrder', entityId: id,
        beforeData: { number: current.number, status: current.status },
        afterData: { archived: true, status: WorkOrderStatus.CANCELED },
      } });
      return archived;
    });
  }

  async transition(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: TransitionWorkOrderDto,
  ) {
    const workOrder = await this.getBase(tenantId, id);
    if (dto.toStatus === WorkOrderStatus.PENDING) {
      throw new BadRequestException(
        'Use o fluxo de pendências para informar motivo, responsável e prazo.',
      );
    }
    if (dto.toStatus === WorkOrderStatus.CLOSED) {
      throw new BadRequestException(
        'Use o fluxo de fechamento para registrar aceite, custo final e elegibilidade de medição.',
      );
    }
    if (workOrder.hasOpenPendency && dto.toStatus !== WorkOrderStatus.CANCELED) {
      throw new BadRequestException('Resolva as pendências abertas antes de alterar o status da OS.');
    }
    if (dto.toStatus === WorkOrderStatus.ASSIGNED && !workOrder.assignedToUserId) {
      throw new BadRequestException('Defina o responsável pela execução antes de atribuir a OS.');
    }
    if (!canTransition(workOrder.status, dto.toStatus)) {
      throw new BadRequestException(
        `Transição de ${workOrder.status} para ${dto.toStatus} não é permitida.`,
      );
    }

    if (dto.toStatus === WorkOrderStatus.COMPLETED) {
      if (!dto.solution?.trim()) {
        throw new BadRequestException('Descreva a solução executada antes de concluir a OS.');
      }
    }

    const now = new Date();
    const timestamps: Prisma.WorkOrderUpdateManyMutationInput = {};
    if (dto.toStatus === WorkOrderStatus.TRIAGED) timestamps.triagedAt = now;
    if (dto.toStatus === WorkOrderStatus.ASSIGNED) timestamps.assignedAt = now;
    if (dto.toStatus === WorkOrderStatus.IN_PROGRESS && !workOrder.startedAt) {
      timestamps.startedAt = now;
    }
    if (dto.toStatus === WorkOrderStatus.COMPLETED) timestamps.completedAt = now;
    if (dto.toStatus === WorkOrderStatus.CANCELED) timestamps.canceledAt = now;

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM WorkOrder WHERE id = ${id} AND tenantId = ${tenantId} FOR UPDATE`;
      const locked = await tx.workOrder.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!locked) throw new NotFoundException('Ordem de serviço não encontrada.');
      if (
        locked.status !== workOrder.status ||
        locked.updatedAt.getTime() !== workOrder.updatedAt.getTime()
      ) {
        throw new ConflictException('A OS foi alterada por outro usuário. Atualize e tente novamente.');
      }
      if (locked.hasOpenPendency && dto.toStatus !== WorkOrderStatus.CANCELED) {
        throw new BadRequestException('Resolva as pendências abertas antes de alterar o status da OS.');
      }
      if (dto.toStatus === WorkOrderStatus.COMPLETED) {
        const completionContext = await this.getCompletionContext(tenantId, id, tx);
        const blockers = this.evaluateOperationalRequirements(completionContext, dto.solution);
        if (blockers.length) {
          throw new BadRequestException({
            message: 'A OS ainda não atende aos critérios obrigatórios de conclusão.',
            blockers,
          });
        }
      }

      if (dto.toStatus === WorkOrderStatus.CANCELED && locked.hasOpenPendency) {
        await tx.workOrderPendency.updateMany({
          where: { tenantId, workOrderId: id, status: PendencyStatus.OPEN },
          data: {
            status: PendencyStatus.CANCELED,
            resolvedAt: now,
            resolution: dto.note?.trim() || 'Pendência encerrada pelo cancelamento da OS.',
          },
        });
      }

      const changed = await tx.workOrder.updateMany({
        where: { id, tenantId, status: locked.status, updatedAt: locked.updatedAt },
        data: {
          status: dto.toStatus,
          hasOpenPendency:
            dto.toStatus === WorkOrderStatus.CANCELED ? false : undefined,
          solution:
            dto.toStatus === WorkOrderStatus.COMPLETED ? dto.solution?.trim() : undefined,
          ...timestamps,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('A OS foi alterada por outro usuário. Atualize e tente novamente.');
      }
      const updated = await tx.workOrder.findUniqueOrThrow({
        where: { id },
        include: WORK_ORDER_INCLUDE,
      });

      await tx.workOrderStatusHistory.create({
        data: {
          workOrderId: id,
          changedByUserId: actorUserId,
          fromStatus: locked.status,
          toStatus: dto.toStatus,
          note: dto.note,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.STATUS_CHANGE,
          entityType: 'WorkOrder',
          entityId: id,
          beforeData: { status: locked.status },
          afterData: { status: dto.toStatus, note: dto.note },
        },
      });
      await this.enqueueWorkOrderEvent(tx, {
        tenantId,
        workOrderId: id,
        number: updated.number,
        recipientUserIds: [updated.requesterUserId, updated.assignedToUserId],
        eventType: NotificationEventType.WORK_ORDER_STATUS_CHANGED,
        deduplicationKey: `work-order:${id}:status:${locked.status}:${dto.toStatus}:${now.toISOString()}`,
        title: `OS ${updated.number}: ${dto.toStatus}`,
        message: dto.note?.trim() || `Status alterado de ${locked.status} para ${dto.toStatus}.`,
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async addComment(
    tenantId: string,
    actorUserId: string,
    actorRole: MembershipRole,
    workOrderId: string,
    dto: AddCommentDto,
  ) {
    const workOrder = await this.getBase(tenantId, workOrderId);
    this.assertCanReadWorkOrder(actorRole, actorUserId, workOrder.requesterUserId);

    const mentionUserIds = [...new Set(dto.mentionUserIds ?? [])].filter(
      (userId) => userId !== actorUserId,
    );
    if (mentionUserIds.length) {
      const now = new Date();
      const mentionMemberships = await this.prisma.tenantMembership.findMany({
        where: {
          tenantId,
          userId: { in: mentionUserIds },
          status: MembershipStatus.ACTIVE,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          user: { status: 'ACTIVE', deletedAt: null },
        },
        select: { userId: true, role: true },
      });
      const validMentionIds = new Set(
        mentionMemberships
          .filter(
            (membership) =>
              membership.role !== MembershipRole.REQUESTER ||
              membership.userId === workOrder.requesterUserId,
          )
          .map((membership) => membership.userId),
      );
      if (mentionUserIds.some((userId) => !validMentionIds.has(userId))) {
        throw new BadRequestException(
          'Uma ou mais menções não podem acessar esta OS ou estão inativas.',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.workOrderComment.create({
        data: {
          tenantId,
          workOrderId,
          authorUserId: actorUserId,
          body: dto.body.trim(),
          mentions: mentionUserIds.length
            ? { create: mentionUserIds.map((userId) => ({ userId })) }
            : undefined,
        },
        include: {
          author: { select: { id: true, name: true, email: true } },
          mentions: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.CREATE,
          entityType: 'WorkOrderComment',
          entityId: comment.id,
          afterData: { workOrderId, mentionUserIds },
        },
      });

      await this.enqueueWorkOrderEvent(tx, {
        tenantId,
        workOrderId,
        number: workOrder.number,
        recipientUserIds: mentionUserIds,
        eventType: NotificationEventType.WORK_ORDER_COMMENT_MENTION,
        deduplicationKey: `work-order-comment:${comment.id}:mention`,
        title: `Você foi mencionado na OS ${workOrder.number}`,
        message: comment.body,
      });
      return comment;
    });
  }

  async respondChecklist(
    tenantId: string,
    actorUserId: string,
    workOrderId: string,
    itemId: string,
    dto: RespondChecklistDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM WorkOrder WHERE id = ${workOrderId} AND tenantId = ${tenantId} FOR UPDATE`;
      const locked = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId, deletedAt: null },
        select: { status: true },
      });
      if (!locked) throw new NotFoundException('Ordem de serviço não encontrada.');
      if (
        TERMINAL_WORK_ORDER_STATUSES.includes(locked.status) ||
        locked.status === WorkOrderStatus.COMPLETED
      ) {
        throw new BadRequestException('O checklist de uma OS encerrada não pode ser alterado.');
      }
      const item = await tx.workOrderChecklistItem.findFirst({
        where: { id: itemId, workOrderId, tenantId },
        select: { id: true },
      });
      if (!item) throw new NotFoundException('Item de checklist não encontrado.');
      const latestResponse = await tx.workOrderChecklistResponse.findFirst({
        where: { checklistItemId: itemId },
        orderBy: { revision: 'desc' },
        select: { revision: true },
      });

      const response = await tx.workOrderChecklistResponse.create({
        data: {
          checklistItemId: itemId,
          respondedByUserId: actorUserId,
          revision: (latestResponse?.revision ?? 0) + 1,
          checked: dto.checked,
          note: dto.note?.trim(),
        },
        include: { respondedBy: { select: { id: true, name: true } } },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.CREATE,
          entityType: 'WorkOrderChecklistResponse',
          entityId: response.id,
          afterData: { workOrderId, checklistItemId: itemId, checked: response.checked },
        },
      });
      return response;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async close(
    tenantId: string,
    actorUserId: string,
    workOrderId: string,
    dto: CloseWorkOrderDto,
  ) {
    const acceptedByUserId = actorUserId;
    await this.ensureUserBelongsToTenant(tenantId, acceptedByUserId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Serializa o fechamento com mudanças de pendência, checklist e anexos
      // que também dependem da linha pai por chave estrangeira.
      await tx.$queryRaw`SELECT id FROM WorkOrder WHERE id = ${workOrderId} AND tenantId = ${tenantId} FOR UPDATE`;
      const context = await this.getCompletionContext(tenantId, workOrderId, tx);
      if (context.status !== WorkOrderStatus.COMPLETED) {
        throw new BadRequestException('Somente uma OS concluída pode ser fechada.');
      }
      const readiness = this.evaluateCloseReadiness({
        ...context,
        finalCost: dto.finalCost ?? context.finalCost,
        acceptedByUserId,
        acceptanceNote: dto.acceptanceNote ?? context.acceptanceNote,
        measurementEligible: dto.measurementEligible,
      });
      if (!readiness.ready) {
        throw new BadRequestException({
          message: 'A OS ainda não atende aos critérios obrigatórios de fechamento.',
          blockers: readiness.blockers,
        });
      }

      const closed = await tx.workOrder.updateMany({
        where: { id: workOrderId, tenantId, status: WorkOrderStatus.COMPLETED },
        data: {
          status: WorkOrderStatus.CLOSED,
          closedAt: now,
          acceptedAt: now,
          acceptedByUserId,
          acceptanceNote: dto.acceptanceNote?.trim(),
          finalCost: dto.finalCost,
          measurementEligible: dto.measurementEligible,
        },
      });
      if (closed.count !== 1) {
        throw new ConflictException('A OS foi alterada por outro usuário. Atualize e tente novamente.');
      }
      const updated = await tx.workOrder.findUniqueOrThrow({
        where: { id: workOrderId },
        include: WORK_ORDER_INCLUDE,
      });
      const history = await tx.workOrderStatusHistory.create({
        data: {
          workOrderId,
          changedByUserId: actorUserId,
          fromStatus: WorkOrderStatus.COMPLETED,
          toStatus: WorkOrderStatus.CLOSED,
          note: dto.acceptanceNote?.trim() || 'Serviço aceito e OS fechada.',
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.STATUS_CHANGE,
          entityType: 'WorkOrder',
          entityId: workOrderId,
          beforeData: { status: WorkOrderStatus.COMPLETED },
          afterData: {
            status: WorkOrderStatus.CLOSED,
            acceptedByUserId,
            finalCost: Number(dto.finalCost ?? context.finalCost) || null,
            measurementEligible: dto.measurementEligible,
            readinessChecks: readiness.checks,
            operationalCriteriaSnapshot: context.operationalCriteriaSnapshot,
          },
        },
      });
      await this.enqueueWorkOrderEvent(tx, {
        tenantId,
        workOrderId,
        number: updated.number,
        recipientUserIds: [updated.requesterUserId, updated.assignedToUserId],
        eventType: NotificationEventType.WORK_ORDER_STATUS_CHANGED,
        deduplicationKey: `work-order:${workOrderId}:closed:${history.id}`,
        title: `OS ${updated.number} fechada`,
        message: dto.acceptanceNote?.trim() || 'O serviço foi aceito e a OS foi fechada.',
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reopen(
    tenantId: string,
    actorUserId: string,
    workOrderId: string,
    dto: ReopenWorkOrderDto,
  ) {
    const workOrder = await this.getBase(tenantId, workOrderId);
    if (
      workOrder.status !== WorkOrderStatus.COMPLETED &&
      workOrder.status !== WorkOrderStatus.CLOSED
    ) {
      throw new BadRequestException('Somente uma OS concluída ou fechada pode ser reaberta.');
    }

    const now = new Date();
    const referenceDate = workOrder.closedAt ?? workOrder.completedAt;
    const within30Days = Boolean(
      referenceDate && now.getTime() - referenceDate.getTime() <= 30 * 24 * 60 * 60 * 1000,
    );
    const primaryContract = await this.prisma.workOrderContract.findFirst({
      where: { workOrderId, isPrimary: true, workOrder: { tenantId } },
      select: { contractId: true },
    });
    const sla = await this.operations.calculateSla(tenantId, {
      startAt: now,
      priority: workOrder.priority,
      contractId: primaryContract?.contractId,
      categoryId: workOrder.categoryId ?? undefined,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM WorkOrder WHERE id = ${workOrderId} AND tenantId = ${tenantId} FOR UPDATE`;
      const locked = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId, deletedAt: null },
      });
      if (!locked) throw new NotFoundException('Ordem de serviço não encontrada.');
      if (
        locked.status !== workOrder.status ||
        locked.reopenCount !== workOrder.reopenCount ||
        locked.updatedAt.getTime() !== workOrder.updatedAt.getTime()
      ) {
        throw new ConflictException('A OS foi alterada por outro usuário. Atualize e tente novamente.');
      }
      if (
        locked.status !== WorkOrderStatus.COMPLETED &&
        locked.status !== WorkOrderStatus.CLOSED
      ) {
        throw new BadRequestException('Somente uma OS concluída ou fechada pode ser reaberta.');
      }
      const activeMeasurement = await tx.measurementItem.findFirst({
        where: {
          workOrderId,
          measurement: {
            tenantId,
            status: { not: MeasurementStatus.REJECTED },
          },
        },
        select: { id: true },
      });
      if (activeMeasurement) {
        throw new ConflictException(
          'A OS está vinculada a uma medição não rejeitada e exige estorno financeiro antes da reabertura.',
        );
      }

      const previousSatisfaction = await tx.satisfactionResponse.findUnique({
        where: { workOrderId },
        select: {
          id: true,
          respondedByUserId: true,
          score: true,
          npsScore: true,
          comment: true,
          respondedAt: true,
        },
      });
      const previousSatisfactionSnapshot = previousSatisfaction
        ? {
            id: previousSatisfaction.id,
            respondedByUserId: previousSatisfaction.respondedByUserId,
            score: previousSatisfaction.score,
            npsScore: previousSatisfaction.npsScore,
            comment: previousSatisfaction.comment,
            respondedAt: previousSatisfaction.respondedAt.toISOString(),
          }
        : undefined;

      const reopened = await tx.workOrder.updateMany({
        where: {
          id: workOrderId,
          tenantId,
          status: locked.status,
          reopenCount: locked.reopenCount,
          updatedAt: locked.updatedAt,
        },
        data: {
          status: WorkOrderStatus.IN_PROGRESS,
          completedAt: null,
          closedAt: null,
          acceptedAt: null,
          acceptedByUserId: null,
          acceptanceNote: null,
          solution: null,
          finalCost: null,
          measurementEligible: false,
          reopenedAt: now,
          reopenCount: { increment: 1 },
          slaPolicyId: sla.policy.id,
          slaResponseDeadline: sla.responseDeadline,
          slaResolutionDeadline: sla.resolutionDeadline,
          slaResolutionWarningAt: sla.resolutionWarningAt,
          slaSnapshot: this.buildSlaSnapshot(sla),
        },
      });
      if (reopened.count !== 1) {
        throw new ConflictException('A OS foi alterada por outro usuário. Atualize e tente novamente.');
      }
      const reopening = await tx.workOrderReopening.create({
        data: {
          tenantId,
          workOrderId,
          reopenedByUserId: actorUserId,
          previousStatus: locked.status,
          reason: dto.reason.trim(),
          previousClosedAt: locked.closedAt,
          previousSolution: locked.solution,
          previousFinalCost: locked.finalCost,
          previousAcceptanceNote: locked.acceptanceNote,
          previousAcceptedAt: locked.acceptedAt,
          previousAcceptedByUserId: locked.acceptedByUserId,
          previousMeasurementEligible: locked.measurementEligible,
          previousSlaPolicyId: locked.slaPolicyId,
          previousSlaResponseDeadline: locked.slaResponseDeadline,
          previousSlaResolutionDeadline: locked.slaResolutionDeadline,
          previousSlaResolutionWarningAt: locked.slaResolutionWarningAt,
          previousSlaSnapshot: locked.slaSnapshot ?? undefined,
          previousSatisfactionSnapshot,
          within30Days,
          reopenedAt: now,
        },
      });
      if (previousSatisfaction) {
        await tx.satisfactionResponse.delete({ where: { workOrderId } });
      }
      const updated = await tx.workOrder.findUniqueOrThrow({
        where: { id: workOrderId },
        include: WORK_ORDER_INCLUDE,
      });
      await tx.workOrderStatusHistory.create({
        data: {
          workOrderId,
          changedByUserId: actorUserId,
          fromStatus: locked.status,
          toStatus: WorkOrderStatus.IN_PROGRESS,
          note: `Reabertura: ${dto.reason.trim()}`,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.STATUS_CHANGE,
          entityType: 'WorkOrder',
          entityId: workOrderId,
          beforeData: {
            status: locked.status,
            closedAt: locked.closedAt,
            acceptedByUserId: locked.acceptedByUserId,
            slaPolicyId: locked.slaPolicyId,
            slaResponseDeadline: locked.slaResponseDeadline?.toISOString() ?? null,
            slaResolutionDeadline: locked.slaResolutionDeadline?.toISOString() ?? null,
            slaResolutionWarningAt: locked.slaResolutionWarningAt?.toISOString() ?? null,
            slaSnapshot: locked.slaSnapshot,
            satisfaction: previousSatisfactionSnapshot,
          },
          afterData: {
            status: WorkOrderStatus.IN_PROGRESS,
            reason: reopening.reason,
            reopenCount: updated.reopenCount,
            within30Days,
            satisfactionClearedForNewCycle: Boolean(previousSatisfaction),
          },
        },
      });
      await this.enqueueWorkOrderEvent(tx, {
        tenantId,
        workOrderId,
        number: updated.number,
        recipientUserIds: [updated.requesterUserId, updated.assignedToUserId],
        eventType: NotificationEventType.WORK_ORDER_STATUS_CHANGED,
        deduplicationKey: `work-order:${workOrderId}:reopened:${reopening.id}`,
        title: `OS ${updated.number} reaberta`,
        message: reopening.reason,
      });
      return { ...updated, reopening };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async addPendency(
    tenantId: string,
    actorUserId: string,
    workOrderId: string,
    dto: AddPendencyDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM WorkOrder WHERE id = ${workOrderId} AND tenantId = ${tenantId} FOR UPDATE`;
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId, deletedAt: null },
        select: {
          status: true,
          number: true,
          requesterUserId: true,
          assignedToUserId: true,
        },
      });
      if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
      if (
        TERMINAL_WORK_ORDER_STATUSES.includes(workOrder.status) ||
        (workOrder.status !== WorkOrderStatus.PENDING &&
          !canTransition(workOrder.status, WorkOrderStatus.PENDING))
      ) {
        throw new BadRequestException('O estado atual da OS não admite o registro de pendência.');
      }
      if (dto.responsibleUserId) {
        await this.ensureUserCanParticipateInWorkOrder(
          tenantId,
          dto.responsibleUserId,
          workOrder.requesterUserId,
          [...WORK_ORDER_EXECUTION_ROLES, MembershipRole.REQUESTER],
          tx,
        );
      }

      const originalOpenPendency =
        workOrder.status === WorkOrderStatus.PENDING
          ? await tx.workOrderPendency.findFirst({
              where: { tenantId, workOrderId, status: PendencyStatus.OPEN },
              orderBy: { createdAt: 'asc' },
              select: { previousStatus: true },
            })
          : null;
      const previousStatus =
        originalOpenPendency?.previousStatus ??
        (workOrder.status === WorkOrderStatus.PENDING
          ? WorkOrderStatus.IN_PROGRESS
          : workOrder.status);

      const pendency = await tx.workOrderPendency.create({
        data: {
          tenantId,
          workOrderId,
          responsibleUserId: dto.responsibleUserId,
          previousStatus,
          reason: dto.reason.trim(),
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        },
      });

      await tx.workOrder.update({
        where: { id: workOrderId },
        data: { status: WorkOrderStatus.PENDING, hasOpenPendency: true },
      });

      if (workOrder.status !== WorkOrderStatus.PENDING) {
        await tx.workOrderStatusHistory.create({
          data: {
            workOrderId,
            changedByUserId: actorUserId,
            fromStatus: workOrder.status,
            toStatus: WorkOrderStatus.PENDING,
            note: dto.reason,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.CREATE,
          entityType: 'WorkOrderPendency',
          entityId: pendency.id,
          afterData: {
            workOrderId,
            reason: pendency.reason,
            dueAt: pendency.dueAt?.toISOString() ?? null,
          },
        },
      });
      await this.enqueueWorkOrderEvent(tx, {
        tenantId,
        workOrderId,
        number: workOrder.number,
        recipientUserIds: [
          workOrder.requesterUserId,
          workOrder.assignedToUserId,
          dto.responsibleUserId,
        ],
        eventType: NotificationEventType.WORK_ORDER_PENDENCY_CREATED,
        deduplicationKey: `work-order-pendency:${pendency.id}:created`,
        title: `Pendência na OS ${workOrder.number}`,
        message: pendency.reason,
      });
      return pendency;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async resolvePendency(
    tenantId: string,
    actorUserId: string,
    workOrderId: string,
    pendencyId: string,
    dto: ResolvePendencyDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM WorkOrder WHERE id = ${workOrderId} AND tenantId = ${tenantId} FOR UPDATE`;
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId, deletedAt: null },
        select: {
          status: true,
          number: true,
          requesterUserId: true,
          assignedToUserId: true,
        },
      });
      if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
      const pendency = await tx.workOrderPendency.findFirst({
        where: {
          id: pendencyId,
          workOrderId,
          tenantId,
          status: PendencyStatus.OPEN,
        },
      });
      if (!pendency) throw new NotFoundException('Pendência aberta não encontrada.');

      const changed = await tx.workOrderPendency.updateMany({
        where: { id: pendencyId, workOrderId, tenantId, status: PendencyStatus.OPEN },
        data: {
          status: PendencyStatus.RESOLVED,
          resolvedAt: new Date(),
          resolution: dto.resolution.trim(),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('A pendência já foi alterada. Atualize e tente novamente.');
      }
      const resolved = await tx.workOrderPendency.findUniqueOrThrow({
        where: { id: pendencyId },
      });

      const remaining = await tx.workOrderPendency.count({
        where: { workOrderId, tenantId, status: PendencyStatus.OPEN },
      });

      if (remaining === 0) {
        const restoredStatus =
          pendency.previousStatus === WorkOrderStatus.PENDING
            ? WorkOrderStatus.IN_PROGRESS
            : pendency.previousStatus;
        await tx.workOrder.update({
          where: { id: workOrderId },
          data: { hasOpenPendency: false, status: restoredStatus },
        });
        await tx.workOrderStatusHistory.create({
          data: {
            workOrderId,
            changedByUserId: actorUserId,
            fromStatus: WorkOrderStatus.PENDING,
            toStatus: restoredStatus,
            note: `Pendência resolvida: ${dto.resolution}`,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.UPDATE,
          entityType: 'WorkOrderPendency',
          entityId: pendencyId,
          afterData: { status: PendencyStatus.RESOLVED, resolution: resolved.resolution },
        },
      });
      await this.enqueueWorkOrderEvent(tx, {
        tenantId,
        workOrderId,
        number: workOrder.number,
        recipientUserIds: [
          workOrder.requesterUserId,
          workOrder.assignedToUserId,
          pendency.responsibleUserId,
        ],
        eventType: NotificationEventType.WORK_ORDER_PENDENCY_RESOLVED,
        deduplicationKey: `work-order-pendency:${pendencyId}:resolved`,
        title: `Pendência resolvida na OS ${workOrder.number}`,
        message: dto.resolution.trim(),
      });
      return resolved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async submitSatisfaction(
    tenantId: string,
    actorUserId: string,
    workOrderId: string,
    dto: SubmitSatisfactionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM WorkOrder WHERE id = ${workOrderId} AND tenantId = ${tenantId} FOR UPDATE`;
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId, deletedAt: null },
        select: { requesterUserId: true, status: true },
      });
      if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
      if (workOrder.requesterUserId !== actorUserId) {
        throw new ForbiddenException('Somente o demandante da OS pode registrar a avaliação.');
      }
      if (
        workOrder.status !== WorkOrderStatus.COMPLETED &&
        workOrder.status !== WorkOrderStatus.CLOSED
      ) {
        throw new BadRequestException('A avaliação somente pode ser enviada após a conclusão.');
      }

      const response = await tx.satisfactionResponse.upsert({
        where: { workOrderId },
        create: {
          workOrderId,
          respondedByUserId: actorUserId,
          score: dto.score,
          npsScore: dto.npsScore,
          comment: dto.comment?.trim(),
        },
        update: {
          respondedByUserId: actorUserId,
          score: dto.score,
          npsScore: dto.npsScore,
          comment: dto.comment?.trim(),
          respondedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.UPDATE,
          entityType: 'SatisfactionResponse',
          entityId: response.id,
          afterData: { workOrderId, score: response.score, npsScore: response.npsScore },
        },
      });
      return response;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async uploadAttachment(
    tenantId: string,
    actorUserId: string,
    actorRole: MembershipRole,
    workOrderId: string,
    kind: AttachmentKind,
    file?: Express.Multer.File,
  ) {
    const workOrder = await this.getBase(tenantId, workOrderId);
    this.assertCanReadWorkOrder(actorRole, actorUserId, workOrder.requesterUserId);
    if (TERMINAL_WORK_ORDER_STATUSES.includes(workOrder.status)) {
      throw new BadRequestException('Uma OS encerrada não pode receber novos anexos.');
    }
    if (!file) throw new BadRequestException('Arquivo não enviado.');
    if (!Object.values(AttachmentKind).includes(kind)) {
      throw new BadRequestException('Tipo de anexo inválido.');
    }
    if (
      actorRole === MembershipRole.REQUESTER &&
      kind !== AttachmentKind.PHOTO_BEFORE &&
      kind !== AttachmentKind.OTHER_DOCUMENT
    ) {
      throw new ForbiddenException(
        'Demandantes podem anexar somente a evidência inicial ou documento complementar.',
      );
    }

    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    const isPdf = file.mimetype === 'application/pdf';
    if (!isImage && !isPdf) {
      throw new BadRequestException('Somente imagens JPG/PNG/WebP e arquivos PDF são aceitos.');
    }
    if (!this.hasExpectedSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('O conteúdo do arquivo não corresponde ao tipo informado.');
    }
    if (kind === AttachmentKind.INVOICE_PDF && !isPdf) {
      throw new BadRequestException('Nota fiscal deve ser enviada em PDF.');
    }
    if (kind.startsWith('PHOTO_') && !isImage) {
      throw new BadRequestException('Anexo fotográfico deve ser uma imagem.');
    }

    const root = resolveUploadRoot(this.config.get<string>('UPLOAD_ROOT'));
    const relativeDir = path.join(tenantId, 'work-orders', workOrderId);
    const absoluteDir = this.resolveInsideRoot(root, relativeDir);

    await mkdir(absoluteDir, { recursive: true });
    const ext = extension(file.mimetype) || 'bin';
    const fileName = `${randomUUID()}.${ext}`;
    const storageKey = path.join(relativeDir, fileName).replaceAll(path.sep, '/');
    const absolutePath = path.join(absoluteDir, fileName);
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM WorkOrder WHERE id = ${workOrderId} AND tenantId = ${tenantId} FOR UPDATE`;
        const locked = await tx.workOrder.findFirst({
          where: { id: workOrderId, tenantId, deletedAt: null },
          select: { status: true, requesterUserId: true },
        });
        if (!locked) throw new NotFoundException('Ordem de serviço não encontrada.');
        this.assertCanReadWorkOrder(actorRole, actorUserId, locked.requesterUserId);
        if (TERMINAL_WORK_ORDER_STATUSES.includes(locked.status)) {
          throw new ConflictException(
            'A OS foi encerrada enquanto o arquivo era enviado. Atualize e tente novamente.',
          );
        }

        const attachment = await tx.workOrderAttachment.create({
          data: {
            tenantId,
            workOrderId,
            uploadedByUserId: actorUserId,
            kind,
            storageKey,
            fileName,
            originalName: sanitizeUploadOriginalName(file.originalname),
            mimeType: file.mimetype,
            sizeBytes: BigInt(file.size),
            sha256: createHash('sha256').update(file.buffer).digest('hex'),
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: AuditAction.CREATE,
            entityType: 'WorkOrderAttachment',
            entityId: attachment.id,
            afterData: { workOrderId, kind, originalName: attachment.originalName },
          },
        });
        return attachment;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  async resolveAttachmentForDownload(
    tenantId: string,
    actorUserId: string,
    actorRole: MembershipRole,
    workOrderId: string,
    attachmentId: string,
  ) {
    const workOrder = await this.getBase(tenantId, workOrderId);
    this.assertCanReadWorkOrder(actorRole, actorUserId, workOrder.requesterUserId);

    const attachment = await this.prisma.workOrderAttachment.findFirst({
      where: {
        id: attachmentId,
        workOrderId,
        tenantId,
        deletedAt: null,
        workOrder: { tenantId, deletedAt: null },
      },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado.');

    const root = resolveUploadRoot(this.config.get<string>('UPLOAD_ROOT'));
    const absolutePath = this.resolveInsideRoot(root, attachment.storageKey);

    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException('Arquivo físico não localizado.');
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: AuditAction.DOWNLOAD,
        entityType: 'WorkOrderAttachment',
        entityId: attachment.id,
        afterData: { workOrderId, originalName: attachment.originalName },
      },
    });

    return { attachment, absolutePath };
  }

  private async getBase(tenantId: string, id: string) {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
    return workOrder;
  }

  private async getCompletionContext(
    tenantId: string,
    workOrderId: string,
    database: Pick<Prisma.TransactionClient, 'workOrder'> = this.prisma,
  ): Promise<CompletionContext> {
    const workOrder = await database.workOrder.findFirst({
      where: { id: workOrderId, tenantId, deletedAt: null },
      include: {
        category: {
          select: {
            requirePhotoBefore: true,
            requirePhotoDuring: true,
            requirePhotoAfter: true,
            requireChecklist: true,
            requireFinalCost: true,
            requireAcceptance: true,
          },
        },
        attachments: {
          where: { deletedAt: null },
          select: { kind: true },
        },
        checklistItems: {
          select: {
            id: true,
            label: true,
            required: true,
            templateItem: { select: { categoryId: true } },
            responses: {
              select: { checked: true },
              orderBy: { revision: 'desc' },
              take: 1,
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        contracts: {
          select: {
            isPrimary: true,
            contract: {
              select: {
                status: true,
                startDate: true,
                endDate: true,
                deletedAt: true,
              },
            },
          },
        },
        measurementItems: {
          select: { measurement: { select: { status: true } } },
        },
      },
    });
    if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
    return workOrder;
  }

  private evaluateOperationalRequirements(
    context: CompletionContext,
    solutionOverride?: string,
  ): string[] {
    const blockers: string[] = [];
    const criteria = this.operationalCriteria(context);
    const solution = solutionOverride ?? context.solution;
    if (!solution?.trim()) blockers.push('Informe a solução executada.');
    if (context.hasOpenPendency) blockers.push('Resolva todas as pendências abertas.');

    const relevantChecklist = context.checklistItems.filter(
      (item) => !item.templateItem || item.templateItem.categoryId === context.categoryId,
    );
    if (criteria?.requireChecklist && relevantChecklist.length === 0) {
      blockers.push('A categoria exige checklist, mas não possui itens instanciados na OS.');
    }
    for (const item of relevantChecklist) {
      if (item.required && item.responses[0]?.checked !== true) {
        blockers.push(`Conclua o item obrigatório do checklist: ${item.label}.`);
      }
    }

    const evidenceKinds = new Set(context.attachments.map((attachment) => attachment.kind));
    if (
      criteria?.requirePhotoBefore &&
      !evidenceKinds.has(AttachmentKind.PHOTO_BEFORE)
    ) {
      blockers.push('Anexe a evidência fotográfica de antes do serviço.');
    }
    if (
      criteria?.requirePhotoDuring &&
      !evidenceKinds.has(AttachmentKind.PHOTO_DURING)
    ) {
      blockers.push('Anexe a evidência fotográfica durante o serviço.');
    }
    if (
      criteria?.requirePhotoAfter &&
      !evidenceKinds.has(AttachmentKind.PHOTO_AFTER)
    ) {
      blockers.push('Anexe a evidência fotográfica de depois do serviço.');
    }
    return blockers;
  }

  private evaluateCloseReadiness(context: CompletionContext) {
    const blockers = this.evaluateOperationalRequirements(context);
    const criteria = this.operationalCriteria(context);
    if (context.status !== WorkOrderStatus.COMPLETED) {
      blockers.unshift('A OS precisa estar concluída antes do fechamento.');
    }

    const hasFinalCost = Number(context.finalCost) > 0;
    if (criteria?.requireFinalCost && !hasFinalCost) {
      blockers.push('Informe o custo final exigido pela categoria.');
    }
    if (criteria?.requireAcceptance && !context.acceptedByUserId) {
      blockers.push('Registre o responsável pelo aceite do serviço.');
    }

    const primaryContract = context.contracts.find((contract) => contract.isPrimary)?.contract;
    const hasPrimaryContract = Boolean(primaryContract);
    const now = new Date();
    const contractEligible = Boolean(
      primaryContract &&
        !primaryContract.deletedAt &&
        (primaryContract.status === ContractStatus.ACTIVE ||
          primaryContract.status === ContractStatus.EXPIRING) &&
        primaryContract.startDate <= now &&
        primaryContract.endDate >= now,
    );
    const approvedCost = Number(context.approvedCost);
    const costApproved =
      Number.isFinite(approvedCost) && approvedCost > 0 && hasFinalCost && Number(context.finalCost) <= approvedCost;
    const alreadyInActiveMeasurement = (context.measurementItems ?? []).some(
      (item) => item.measurement.status !== MeasurementStatus.REJECTED,
    );
    if (context.measurementEligible && !hasPrimaryContract) {
      blockers.push('Uma OS elegível para medição deve possuir contrato principal.');
    }
    if (context.measurementEligible && hasPrimaryContract && !contractEligible) {
      blockers.push(
        'O contrato principal deve estar ativo ou em vencimento e vigente na data do fechamento.',
      );
    }
    if (context.measurementEligible && !hasFinalCost) {
      blockers.push('Uma OS elegível para medição deve possuir custo final.');
    }
    if (context.measurementEligible && hasFinalCost && !costApproved) {
      blockers.push(
        'O custo final deve possuir aprovação e não pode superar o custo aprovado.',
      );
    }
    if (context.measurementEligible && alreadyInActiveMeasurement) {
      blockers.push('A OS já está vinculada a uma medição não rejeitada.');
    }

    return {
      ready: blockers.length === 0,
      blockers,
      checks: {
        statusCompleted: context.status === WorkOrderStatus.COMPLETED,
        noOpenPendency: !context.hasOpenPendency,
        solutionProvided: Boolean(context.solution?.trim()),
        finalCostProvided: hasFinalCost,
        acceptanceRecorded: Boolean(context.acceptedByUserId),
        primaryContractLinked: hasPrimaryContract,
        contractEligible,
        costApproved,
        notAlreadyMeasured: !alreadyInActiveMeasurement,
      },
    };
  }

  private operationalCriteria(context: CompletionContext) {
    const snapshot = context.operationalCriteriaSnapshot;
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
      const value = snapshot as Record<string, Prisma.JsonValue>;
      const hasSnapshotFlags = [
        'requirePhotoBefore',
        'requirePhotoDuring',
        'requirePhotoAfter',
        'requireChecklist',
        'requireFinalCost',
        'requireAcceptance',
      ].every((key) => key in value);
      if (hasSnapshotFlags) {
        return {
          requirePhotoBefore: snapshotBoolean(value.requirePhotoBefore),
          requirePhotoDuring: snapshotBoolean(value.requirePhotoDuring),
          requirePhotoAfter: snapshotBoolean(value.requirePhotoAfter),
          requireChecklist: snapshotBoolean(value.requireChecklist),
          requireFinalCost: snapshotBoolean(value.requireFinalCost),
          requireAcceptance: snapshotBoolean(value.requireAcceptance),
        };
      }
    }
    return context.category;
  }

  private buildOperationalCriteriaSnapshot(category: {
    id: string;
    code: string;
    name: string;
    requirePhotoBefore: boolean;
    requirePhotoDuring: boolean;
    requirePhotoAfter: boolean;
    requireChecklist: boolean;
    requireFinalCost: boolean;
    requireAcceptance: boolean;
  }): Prisma.InputJsonValue {
    return {
      categoryId: category.id,
      categoryCode: category.code,
      categoryName: category.name,
      requirePhotoBefore: category.requirePhotoBefore,
      requirePhotoDuring: category.requirePhotoDuring,
      requirePhotoAfter: category.requirePhotoAfter,
      requireChecklist: category.requireChecklist,
      requireFinalCost: category.requireFinalCost,
      requireAcceptance: category.requireAcceptance,
      capturedAt: new Date().toISOString(),
    };
  }

  private buildSlaSnapshot(
    sla: Awaited<ReturnType<OperationsService['calculateSla']>>,
  ): Prisma.InputJsonValue {
    return {
      policy: { ...sla.policy },
      calendar: { ...sla.calendar },
      startAt: sla.startAt.toISOString(),
      responseDeadline: sla.responseDeadline.toISOString(),
      resolutionDeadline: sla.resolutionDeadline.toISOString(),
      resolutionWarningAt: sla.resolutionWarningAt.toISOString(),
      capturedAt: new Date().toISOString(),
    };
  }

  private instantiateMissingChecklist(
    tx: Prisma.TransactionClient,
    tenantId: string,
    workOrderId: string,
    categoryId: string,
  ) {
    return this.operations.instantiateChecklist(tenantId, workOrderId, categoryId, tx);
  }

  private async enqueueWorkOrderEvent(
    tx: Prisma.TransactionClient,
    input: WorkOrderNotificationInput,
  ) {
    const recipientUserIds = [...new Set(input.recipientUserIds.filter(Boolean) as string[])];
    if (input.eventType !== NotificationEventType.WORK_ORDER_COMMENT_MENTION) {
      const [context, supervisors] = await Promise.all([
        tx.workOrder.findFirst({
          where: { id: input.workOrderId, tenantId: input.tenantId, deletedAt: null },
          select: {
            requesterUserId: true,
            building: { select: { managerUserId: true } },
            contracts: {
              where: { isPrimary: true },
              take: 1,
              select: {
                contract: { select: { managerUserId: true, inspectorUserId: true } },
              },
            },
          },
        }),
        tx.tenantMembership.findMany({
          where: {
            tenantId: input.tenantId,
            status: MembershipStatus.ACTIVE,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            role: {
              in: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER],
            },
            user: { status: 'ACTIVE', deletedAt: null },
          },
          select: { userId: true },
        }),
      ]);
      recipientUserIds.push(
        ...supervisors.map((membership) => membership.userId),
        ...(context
          ? [
              context.building.managerUserId,
              context.contracts[0]?.contract.managerUserId,
              context.contracts[0]?.contract.inspectorUserId,
            ].filter((value): value is string => Boolean(value))
          : []),
      );
      const candidateIds = [...new Set(recipientUserIds)];
      const activeRecipients = candidateIds.length
        ? await tx.tenantMembership.findMany({
            where: {
              tenantId: input.tenantId,
              userId: { in: candidateIds },
              status: MembershipStatus.ACTIVE,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              user: { status: 'ACTIVE', deletedAt: null },
            },
            select: { userId: true, role: true },
          })
        : [];
      const authorizedIds = new Set(
        activeRecipients
          .filter(
            (membership) =>
              membership.role !== MembershipRole.REQUESTER ||
              membership.userId === context?.requesterUserId,
          )
          .map((membership) => membership.userId),
      );
      recipientUserIds.splice(
        0,
        recipientUserIds.length,
        ...candidateIds.filter((userId) => authorizedIds.has(userId)),
      );
    }
    return this.notificationOutbox.enqueueMany(
      tx,
      [...new Set(recipientUserIds)].map((recipientUserId) => ({
        tenantId: input.tenantId,
        recipientUserId,
        eventType: input.eventType,
        deduplicationKey: input.deduplicationKey,
        title: input.title,
        message: input.message,
        workOrderId: input.workOrderId,
        actionUrl: `/ordens-servico/detalhe?id=${input.workOrderId}`,
      })),
    );
  }

  private async validateReferences(
    tenantId: string,
    dto: Pick<
      CreateWorkOrderDto,
      'buildingId' | 'supplierId' | 'assignedToUserId' | 'contractIds'
    >,
    requesterUserId: string,
  ) {
    const [building, supplier, contracts] = await Promise.all([
      this.prisma.building.findFirst({
        where: { id: dto.buildingId, tenantId, deletedAt: null },
        select: { id: true },
      }),
      dto.supplierId
        ? this.prisma.supplier.findFirst({
            where: { id: dto.supplierId, tenantId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve(null),
      dto.contractIds?.length
        ? this.prisma.contract.findMany({
            where: { id: { in: dto.contractIds }, tenantId, deletedAt: null },
            select: {
              id: true,
              buildings: {
                where: { buildingId: dto.buildingId },
                select: { buildingId: true },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    if (!building) throw new BadRequestException('Edificação inválida para esta organização.');
    if (dto.supplierId && !supplier) {
      throw new BadRequestException('Fornecedor inválido para esta organização.');
    }
    if (dto.contractIds && contracts.length !== dto.contractIds.length) {
      throw new BadRequestException('Um ou mais contratos são inválidos para esta organização.');
    }
    if (contracts.some((contract) => contract.buildings.length === 0)) {
      throw new BadRequestException(
        'Um ou mais contratos não abrangem a edificação selecionada.',
      );
    }

    await this.ensureUserBelongsToTenant(tenantId, requesterUserId);
    if (dto.assignedToUserId) {
      await this.ensureUserCanParticipateInWorkOrder(
        tenantId,
        dto.assignedToUserId,
        requesterUserId,
        WORK_ORDER_EXECUTION_ROLES,
      );
    }
  }

  private async ensureUserCanParticipateInWorkOrder(
    tenantId: string,
    userId: string,
    requesterUserId: string,
    allowedRoles: readonly MembershipRole[],
    database: Pick<Prisma.TransactionClient, 'tenantMembership'> = this.prisma,
  ): Promise<void> {
    const now = new Date();
    const membership = await database.tenantMembership.findFirst({
      where: {
        tenantId,
        userId,
        status: MembershipStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        user: { status: 'ACTIVE', deletedAt: null },
      },
      select: { role: true },
    });
    if (
      !membership ||
      !allowedRoles.includes(membership.role) ||
      (membership.role === MembershipRole.REQUESTER && userId !== requesterUserId)
    ) {
      throw new BadRequestException(
        'O usuário selecionado não possui papel ativo compatível com esta OS.',
      );
    }
  }

  private async ensureUserBelongsToTenant(tenantId: string, userId: string) {
    const now = new Date();
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        userId,
        status: MembershipStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        user: { status: 'ACTIVE', deletedAt: null },
      },
      select: { id: true },
    });
    if (!membership) throw new BadRequestException('Usuário não pertence à organização.');
  }

  private assertCanReadWorkOrder(
    role: MembershipRole,
    userId: string,
    requesterUserId: string,
  ): void {
    if (role === MembershipRole.REQUESTER && requesterUserId !== userId) {
      // Retorna 404 em consultas de objeto para não revelar a existência de OS de outro usuário.
      throw new NotFoundException('Ordem de serviço não encontrada.');
    }
  }

  private resolveInsideRoot(root: string, relativePath: string): string {
    const absolutePath = path.resolve(root, relativePath);
    const relative = path.relative(root, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException('Caminho de arquivo inválido.');
    }
    return absolutePath;
  }

  private hasExpectedSignature(buffer: Buffer, mimeType: string): boolean {
    if (mimeType === 'application/pdf') {
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    }
    if (mimeType === 'image/jpeg') {
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/png') {
      return (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    }
    if (mimeType === 'image/webp') {
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  }
}

function snapshotBoolean(value: Prisma.JsonValue | undefined): boolean {
  return value === true || value === 1 || value === 'true';
}
