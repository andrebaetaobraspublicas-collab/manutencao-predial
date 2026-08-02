import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditAction, BudgetItemKind, BudgetStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportSinapiCatalogDto, SaveBudgetDto, TransitionBudgetDto } from './dto/budgets.dto';

const TRANSITIONS: Record<BudgetStatus, BudgetStatus[]> = {
  DRAFT: [BudgetStatus.SUBMITTED, BudgetStatus.CANCELED],
  SUBMITTED: [BudgetStatus.APPROVED, BudgetStatus.REJECTED, BudgetStatus.CANCELED],
  REJECTED: [BudgetStatus.DRAFT, BudgetStatus.CANCELED],
  APPROVED: [], CANCELED: [],
};

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  listCatalogs(tenantId: string) {
    return this.prisma.sinapiCatalog.findMany({ where: { tenantId }, orderBy: [{ referenceMonth: 'desc' }, { importedAt: 'desc' }] });
  }

  async listCatalogItems(tenantId: string, id: string, search?: string) {
    const catalog = await this.prisma.sinapiCatalog.findFirst({ where: { id, tenantId } });
    if (!catalog) throw new NotFoundException('Catálogo SINAPI não encontrado.');
    return this.prisma.sinapiCatalogItem.findMany({ where: { tenantId, catalogId: id,
      ...(search?.trim() ? { OR: [{ code: { contains: search.trim() } }, { description: { contains: search.trim() } }] } : {}) },
      orderBy: [{ type: 'asc' }, { code: 'asc' }], take: 200 });
  }

  async importCatalog(tenantId: string, actorUserId: string, dto: ImportSinapiCatalogDto) {
    const normalized = dto.items.map((item) => ({ ...item, code: item.code.trim().toUpperCase(),
      description: item.description.trim(), unit: item.unit.trim().toUpperCase() }));
    const keys = normalized.map((item) => `${item.type}:${item.code}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('O arquivo possui itens SINAPI duplicados.');
    const checksum = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const catalog = await tx.sinapiCatalog.create({ data: {
        tenantId, importedByUserId: actorUserId, referenceMonth: dto.referenceMonth,
        state: dto.state.toUpperCase(), source: dto.source?.trim().toUpperCase() ?? 'SINAPI',
        version: dto.version.trim(), checksum, itemCount: normalized.length,
        items: { create: normalized.map((item) => ({ tenantId, type: item.type, code: item.code,
          description: item.description, unit: item.unit, unitCost: item.unitCost,
          compositionData: item.compositionData as Prisma.InputJsonValue | undefined })) },
      }, include: { _count: { select: { items: true } } } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'SinapiCatalog', catalog.id,
        { referenceMonth: catalog.referenceMonth, state: catalog.state, checksum, itemCount: normalized.length });
      return catalog;
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta versão do catálogo SINAPI já foi importada.');
      }
      throw error;
    });
  }

  listBudgets(tenantId: string) {
    return this.prisma.workOrderBudget.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' },
      include: { workOrder: { select: { id: true, number: true, title: true, status: true } },
        catalog: { select: { id: true, referenceMonth: true, state: true, version: true } }, _count: { select: { items: true, revisions: true } } } });
  }

  async getBudget(tenantId: string, workOrderId: string) {
    const budget = await this.prisma.workOrderBudget.findFirst({ where: { tenantId, workOrderId },
      include: { workOrder: true, catalog: true, items: { include: { catalogItem: true } },
        revisions: { orderBy: { version: 'desc' } }, submittedBy: { select: { name: true } }, approvedBy: { select: { name: true } } } });
    if (!budget) throw new NotFoundException('Orçamento não encontrado para esta OS.');
    return budget;
  }

  async saveBudget(tenantId: string, actorUserId: string, workOrderId: string, dto: SaveBudgetDto) {
    const current = await this.prisma.workOrderBudget.findFirst({ where: { tenantId, workOrderId } });
    if (current && current.status !== BudgetStatus.DRAFT && current.status !== BudgetStatus.REJECTED) {
      throw new BadRequestException('Somente orçamentos em rascunho ou rejeitados podem ser editados.');
    }
    const [workOrder, selectedCatalog, catalogItems] = await Promise.all([
      this.prisma.workOrder.findFirst({ where: { id: workOrderId, tenantId, deletedAt: null } }),
      dto.catalogId ? this.prisma.sinapiCatalog.findFirst({ where: { id: dto.catalogId, tenantId, active: true } }) : null,
      this.prisma.sinapiCatalogItem.findMany({ where: { tenantId,
        id: { in: dto.items.map((item) => item.catalogItemId).filter((id): id is string => Boolean(id)) },
        ...(dto.catalogId ? { catalogId: dto.catalogId } : {}) } }),
    ]);
    if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
    if (dto.catalogId && !selectedCatalog) throw new BadRequestException('Catálogo SINAPI inválido para a organização.');
    const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
    const items = dto.items.map((item) => {
      const catalog = item.catalogItemId ? catalogById.get(item.catalogItemId) : undefined;
      if (item.catalogItemId && !catalog) throw new BadRequestException('Item não pertence ao catálogo SINAPI selecionado.');
      if (!catalog && (!item.code || !item.description || !item.unit || item.unitCost === undefined)) {
        throw new BadRequestException('Item livre exige código, descrição, unidade e custo unitário.');
      }
      const quantity = new Prisma.Decimal(item.quantity);
      const unitCost = catalog?.unitCost ?? new Prisma.Decimal(item.unitCost!);
      return { catalogItemId: catalog?.id, kind: item.kind ?? this.kind(catalog?.type),
        source: catalog ? 'SINAPI' : 'PROPRIO', code: catalog?.code ?? item.code!.trim().toUpperCase(),
        description: catalog?.description ?? item.description!.trim(), unit: catalog?.unit ?? item.unit!.trim().toUpperCase(),
        quantity, unitCost, totalCost: quantity.times(unitCost).toDecimalPlaces(2),
        sourceData: catalog ? { catalogId: catalog.catalogId, referenceUnitCost: catalog.unitCost.toString() } : undefined };
    });
    const subtotal = items.reduce((total, item) => total.plus(item.totalCost), new Prisma.Decimal(0));
    const bdi = new Prisma.Decimal(dto.bdiPercentage).dividedBy(100);
    const total = subtotal.times(new Prisma.Decimal(1).plus(bdi)).toDecimalPlaces(2);
    return this.prisma.$transaction(async (tx) => {
      let budget;
      if (current) {
        await tx.budgetItem.deleteMany({ where: { budgetId: current.id } });
        budget = await tx.workOrderBudget.update({ where: { id: current.id }, data: {
          status: BudgetStatus.DRAFT, version: { increment: 1 }, catalogId: dto.catalogId,
          referenceMonth: dto.referenceMonth, state: dto.state?.toUpperCase(), subtotal,
          bdiPercentage: bdi, total, notes: dto.notes, decisionNote: null,
          items: { create: items.map((item) => ({ ...item, tenantId })) },
        }, include: { items: true, workOrder: true } });
      } else {
        budget = await tx.workOrderBudget.create({ data: { tenantId, workOrderId,
          catalogId: dto.catalogId, referenceMonth: dto.referenceMonth, state: dto.state?.toUpperCase(),
          subtotal, bdiPercentage: bdi, total, notes: dto.notes,
          items: { create: items.map((item) => ({ ...item, tenantId })) },
        }, include: { items: true, workOrder: true } });
      }
      await this.revision(tx, budget, actorUserId, current ? 'Edição do orçamento' : 'Criação do orçamento');
      await this.audit(tx, tenantId, actorUserId, current ? AuditAction.UPDATE : AuditAction.CREATE,
        'WorkOrderBudget', budget.id, { version: budget.version, total: budget.total.toString() });
      return budget;
    });
  }

  async transition(tenantId: string, actorUserId: string, id: string, dto: TransitionBudgetDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM WorkOrderBudget WHERE id = ${id} AND tenantId = ${tenantId} FOR UPDATE`;
      const current = await tx.workOrderBudget.findFirst({ where: { id, tenantId }, include: { items: true } });
      if (!current) throw new NotFoundException('Orçamento não encontrado.');
      if (current.version !== dto.version) throw new ConflictException('O orçamento foi alterado; atualize a tela.');
      if (!TRANSITIONS[current.status].includes(dto.status)) throw new BadRequestException(`Transição ${current.status} → ${dto.status} não permitida.`);
      if ((dto.status === BudgetStatus.REJECTED || dto.status === BudgetStatus.CANCELED) && !dto.note) throw new BadRequestException('Informe a justificativa.');
      const now = new Date();
      const updated = await tx.workOrderBudget.update({ where: { id }, data: {
        status: dto.status, version: { increment: 1 }, decisionNote: dto.note,
        submittedAt: dto.status === BudgetStatus.SUBMITTED ? now : undefined,
        submittedByUserId: dto.status === BudgetStatus.SUBMITTED ? actorUserId : undefined,
        approvedAt: dto.status === BudgetStatus.APPROVED ? now : undefined,
        approvedByUserId: dto.status === BudgetStatus.APPROVED ? actorUserId : undefined,
        rejectedAt: dto.status === BudgetStatus.REJECTED ? now : undefined,
        canceledAt: dto.status === BudgetStatus.CANCELED ? now : undefined,
      }, include: { items: true, workOrder: true } });
      if (dto.status === BudgetStatus.APPROVED) {
        await tx.workOrder.update({ where: { id: current.workOrderId }, data: { approvedCost: current.total } });
      }
      await this.revision(tx, updated, actorUserId, dto.note ?? `Transição para ${dto.status}`);
      await this.audit(tx, tenantId, actorUserId, AuditAction.STATUS_CHANGE, 'WorkOrderBudget', id,
        { from: current.status, to: dto.status, version: updated.version });
      return updated;
    });
  }

  private kind(type?: string): BudgetItemKind {
    if (type === 'INPUT') return BudgetItemKind.INPUT;
    if (type === 'COMPOSITION') return BudgetItemKind.COMPOSITION;
    return BudgetItemKind.SERVICE;
  }

  private revision(tx: Prisma.TransactionClient, budget: { id: string; tenantId: string; version: number;
    status: BudgetStatus; subtotal: Prisma.Decimal; bdiPercentage: Prisma.Decimal; total: Prisma.Decimal;
    items: Array<{ code: string; description: string; unit: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal; totalCost: Prisma.Decimal }> },
    actorUserId: string, reason: string) {
    return tx.budgetRevision.create({ data: { tenantId: budget.tenantId, budgetId: budget.id,
      createdByUserId: actorUserId, version: budget.version, status: budget.status,
      subtotal: budget.subtotal, bdiPercentage: budget.bdiPercentage, total: budget.total, reason,
      snapshot: { items: budget.items.map((item) => ({ code: item.code, description: item.description,
        unit: item.unit, quantity: item.quantity.toString(), unitCost: item.unitCost.toString(), totalCost: item.totalCost.toString() })) } } });
  }

  private audit(tx: Prisma.TransactionClient, tenantId: string, actorUserId: string,
    action: AuditAction, entityType: string, entityId: string, afterData: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { tenantId, actorUserId, action, entityType, entityId, afterData } });
  }
}
