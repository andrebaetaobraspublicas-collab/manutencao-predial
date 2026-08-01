import {
  BadRequestException,
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
  MembershipRole,
  MembershipStatus,
  PendencyStatus,
  Prisma,
  WorkOrderOrigin,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AddPendencyDto } from './dto/add-pendency.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { ListWorkOrdersQuery } from './dto/list-work-orders.query';
import { ResolvePendencyDto } from './dto/resolve-pendency.dto';
import { SubmitSatisfactionDto } from './dto/submit-satisfaction.dto';
import { TransitionWorkOrderDto } from './dto/transition-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import {
  canTransition,
  OPEN_WORK_ORDER_STATUSES,
  TERMINAL_WORK_ORDER_STATUSES,
} from './work-order-state-machine';

const WORK_ORDER_INCLUDE = {
  building: { select: { id: true, code: true, name: true, city: true, state: true } },
  supplier: { select: { id: true, legalName: true, tradeName: true } },
  requester: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  contracts: {
    include: {
      contract: { select: { id: true, code: true, object: true, status: true } },
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

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

    const priority = dto.priority ?? WorkOrderPriority.NORMAL;
    const openedAt = new Date();
    const { responseDeadline, resolutionDeadline } = this.calculateSla(priority, openedAt);
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
          title: dto.title.trim(),
          description: dto.description.trim(),
          locationDetail: dto.locationDetail?.trim(),
          origin: dto.origin,
          priority,
          openedAt,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          slaResponseDeadline: responseDeadline,
          slaResolutionDeadline: resolutionDeadline,
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
    const where: Prisma.WorkOrderWhereInput = {
      tenantId,
      deletedAt: null,
      status: query.status,
      priority: query.priority,
      buildingId: query.buildingId,
      supplierId: query.supplierId,
      requesterUserId: query.requesterUserId,
      hasOpenPendency: query.hasOpenPendency,
    };

    if (query.backlogOnly) where.status = { in: OPEN_WORK_ORDER_STATUSES };
    if (query.overdue) {
      where.status = { in: OPEN_WORK_ORDER_STATUSES };
      where.slaResolutionDeadline = { lt: new Date() };
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { number: { contains: search } },
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (query.openedFrom || query.openedTo) {
      where.openedAt = {
        gte: query.openedFrom ? new Date(query.openedFrom) : undefined,
        lte: query.openedTo ? new Date(query.openedTo) : undefined,
      };
    }

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
        statusHistory: {
          include: { changedBy: { select: { id: true, name: true } } },
          orderBy: { changedAt: 'desc' },
        },
        budget: { include: { items: true } },
        satisfaction: true,
      },
    });

    if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
    return workOrder;
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

    if (dto.buildingId || dto.supplierId || dto.requesterUserId || dto.assignedToUserId || dto.contractIds) {
      await this.validateReferences(
        tenantId,
        {
          buildingId: dto.buildingId ?? current.buildingId,
          supplierId: dto.supplierId ?? current.supplierId ?? undefined,
          assignedToUserId: dto.assignedToUserId ?? current.assignedToUserId ?? undefined,
          contractIds: dto.contractIds,
        },
        dto.requesterUserId ?? current.requesterUserId,
      );
    }

    const contractRows = dto.contractIds?.length
      ? await this.prisma.contract.findMany({
          where: { id: { in: dto.contractIds }, tenantId, deletedAt: null },
          select: { id: true, supplierId: true },
        })
      : [];
    const contractById = new Map(contractRows.map((contract) => [contract.id, contract]));
    const orderedContracts = (dto.contractIds ?? []).map((contractId) => contractById.get(contractId)!);
    if (
      dto.contractIds?.length &&
      dto.supplierId &&
      orderedContracts[0] &&
      dto.supplierId !== orderedContracts[0].supplierId
    ) {
      throw new BadRequestException(
        'O fornecedor informado deve coincidir com o fornecedor do contrato principal.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.contractIds) {
        await tx.workOrderContract.deleteMany({ where: { workOrderId: id } });
      }

      const updated = await tx.workOrder.update({
        where: { id },
        data: {
          buildingId: dto.buildingId,
          requesterUserId: dto.requesterUserId,
          assignedToUserId: dto.assignedToUserId,
          supplierId: dto.supplierId,
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          locationDetail: dto.locationDetail?.trim(),
          origin: dto.origin,
          priority: dto.priority,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          estimatedCost: dto.estimatedCost,
          approvedCost: dto.approvedCost,
          finalCost: dto.finalCost,
          contracts: orderedContracts.length
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

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.UPDATE,
          entityType: 'WorkOrder',
          entityId: id,
          beforeData: { title: current.title, priority: current.priority },
          afterData: { title: updated.title, priority: updated.priority },
        },
      });
      return updated;
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
    if (workOrder.hasOpenPendency && dto.toStatus !== WorkOrderStatus.CANCELED) {
      throw new BadRequestException('Resolva as pendências abertas antes de alterar o status da OS.');
    }
    if (!canTransition(workOrder.status, dto.toStatus)) {
      throw new BadRequestException(
        `Transição de ${workOrder.status} para ${dto.toStatus} não é permitida.`,
      );
    }

    const now = new Date();
    const timestamps: Prisma.WorkOrderUpdateInput = {};
    if (dto.toStatus === WorkOrderStatus.TRIAGED) timestamps.triagedAt = now;
    if (dto.toStatus === WorkOrderStatus.ASSIGNED) timestamps.assignedAt = now;
    if (dto.toStatus === WorkOrderStatus.IN_PROGRESS && !workOrder.startedAt) {
      timestamps.startedAt = now;
    }
    if (dto.toStatus === WorkOrderStatus.COMPLETED) timestamps.completedAt = now;
    if (dto.toStatus === WorkOrderStatus.CLOSED) timestamps.closedAt = now;
    if (dto.toStatus === WorkOrderStatus.CANCELED) timestamps.canceledAt = now;

    return this.prisma.$transaction(async (tx) => {
      if (dto.toStatus === WorkOrderStatus.CANCELED && workOrder.hasOpenPendency) {
        await tx.workOrderPendency.updateMany({
          where: { tenantId, workOrderId: id, status: PendencyStatus.OPEN },
          data: {
            status: PendencyStatus.CANCELED,
            resolvedAt: now,
            resolution: dto.note?.trim() || 'Pendência encerrada pelo cancelamento da OS.',
          },
        });
      }

      const updated = await tx.workOrder.update({
        where: { id },
        data: {
          status: dto.toStatus,
          hasOpenPendency:
            dto.toStatus === WorkOrderStatus.CANCELED ? false : undefined,
          finalCost: dto.finalCost,
          ...timestamps,
        },
        include: WORK_ORDER_INCLUDE,
      });

      await tx.workOrderStatusHistory.create({
        data: {
          workOrderId: id,
          changedByUserId: actorUserId,
          fromStatus: workOrder.status,
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
          beforeData: { status: workOrder.status },
          afterData: { status: dto.toStatus, note: dto.note },
        },
      });
      return updated;
    });
  }

  async addPendency(
    tenantId: string,
    actorUserId: string,
    workOrderId: string,
    dto: AddPendencyDto,
  ) {
    const workOrder = await this.getBase(tenantId, workOrderId);
    if (
      TERMINAL_WORK_ORDER_STATUSES.includes(workOrder.status) ||
      (workOrder.status !== WorkOrderStatus.PENDING &&
        !canTransition(workOrder.status, WorkOrderStatus.PENDING))
    ) {
      throw new BadRequestException('O estado atual da OS não admite o registro de pendência.');
    }
    if (dto.responsibleUserId) {
      await this.ensureUserBelongsToTenant(tenantId, dto.responsibleUserId);
    }

    return this.prisma.$transaction(async (tx) => {
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
      return pendency;
    });
  }

  async resolvePendency(
    tenantId: string,
    actorUserId: string,
    workOrderId: string,
    pendencyId: string,
    dto: ResolvePendencyDto,
  ) {
    const pendency = await this.prisma.workOrderPendency.findFirst({
      where: {
        id: pendencyId,
        workOrderId,
        tenantId,
        status: PendencyStatus.OPEN,
      },
    });
    if (!pendency) throw new NotFoundException('Pendência aberta não encontrada.');

    return this.prisma.$transaction(async (tx) => {
      const resolved = await tx.workOrderPendency.update({
        where: { id: pendencyId },
        data: {
          status: PendencyStatus.RESOLVED,
          resolvedAt: new Date(),
          resolution: dto.resolution.trim(),
        },
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
      return resolved;
    });
  }

  async submitSatisfaction(
    tenantId: string,
    actorUserId: string,
    workOrderId: string,
    dto: SubmitSatisfactionDto,
  ) {
    const workOrder = await this.getBase(tenantId, workOrderId);
    if (workOrder.requesterUserId !== actorUserId) {
      throw new ForbiddenException('Somente o demandante da OS pode registrar a avaliação.');
    }
    if (
      workOrder.status !== WorkOrderStatus.COMPLETED &&
      workOrder.status !== WorkOrderStatus.CLOSED
    ) {
      throw new BadRequestException('A avaliação somente pode ser enviada após a conclusão.');
    }

    return this.prisma.$transaction(async (tx) => {
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
    });
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

    const root = path.resolve(this.config.get<string>('UPLOAD_ROOT') ?? './uploads');
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
        const attachment = await tx.workOrderAttachment.create({
          data: {
            tenantId,
            workOrderId,
            uploadedByUserId: actorUserId,
            kind,
            storageKey,
            fileName,
            originalName: path
              .basename(file.originalname)
              .replace(/[\r\n\0]/g, '_')
              .slice(0, 255),
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
      });
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

    const root = path.resolve(this.config.get<string>('UPLOAD_ROOT') ?? './uploads');
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
            select: { id: true },
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

    await this.ensureUserBelongsToTenant(tenantId, requesterUserId);
    if (dto.assignedToUserId) await this.ensureUserBelongsToTenant(tenantId, dto.assignedToUserId);
  }

  private async ensureUserBelongsToTenant(tenantId: string, userId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId, userId, status: MembershipStatus.ACTIVE },
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

  private calculateSla(priority: WorkOrderPriority, openedAt: Date) {
    const hours: Record<WorkOrderPriority, { response: number; resolution: number }> = {
      LOW: { response: 24, resolution: 120 },
      NORMAL: { response: 8, resolution: 72 },
      HIGH: { response: 4, resolution: 24 },
      URGENT: { response: 1, resolution: 8 },
      CRITICAL: { response: 0.25, resolution: 4 },
    };
    const rule = hours[priority];
    return {
      responseDeadline: new Date(openedAt.getTime() + rule.response * 60 * 60 * 1000),
      resolutionDeadline: new Date(openedAt.getTime() + rule.resolution * 60 * 60 * 1000),
    };
  }
}
