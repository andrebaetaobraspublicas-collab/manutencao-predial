import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction, FrequencyUnit, MaintenanceGenerationStatus, MembershipRole,
  OperationalCatalogKind, Prisma, WorkOrderOrigin,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { CreateAssetDto, CreateMaintenancePlanDto, IntelligentMaintenanceDto, UpdateAssetDto, UpdateMaintenancePlanDto } from './dto/maintenance.dto';
import { availableMaintenanceSystems, INTELLIGENCE_VERSION, recommendMaintenance } from './maintenance-intelligence';
import { nextOccurrence } from './maintenance-recurrence';

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService, private readonly workOrders: WorkOrdersService) {}

  listAssets(tenantId: string) { return this.prisma.asset.findMany({ where: { tenantId, deletedAt: null },
    orderBy: [{ status: 'asc' }, { name: 'asc' }], include: { building: { select: { id: true, code: true, name: true } }, _count: { select: { maintenancePlans: true } } } }); }

  async createAsset(tenantId: string, actorUserId: string, dto: CreateAssetDto) {
    await this.ensureBuilding(tenantId, dto.buildingId);
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({ data: { tenantId, buildingId: dto.buildingId,
        tag: dto.tag.trim().toUpperCase(), name: dto.name.trim(), category: dto.category.trim(),
        location: dto.location, manufacturer: dto.manufacturer, model: dto.model, serialNumber: dto.serialNumber,
        criticality: dto.criticality, status: dto.status, installedAt: dto.installedAt ? new Date(dto.installedAt) : undefined,
        warrantyEndsAt: dto.warrantyEndsAt ? new Date(dto.warrantyEndsAt) : undefined,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined }, include: { building: true } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'Asset', asset.id, { tag: asset.tag, name: asset.name });
      return asset;
    }).catch((error: unknown) => { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Já existe ativo com este patrimônio/tag.'); throw error; });
  }

  async updateAsset(tenantId: string, actorUserId: string, id: string, dto: UpdateAssetDto) {
    const current = await this.prisma.asset.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!current) throw new NotFoundException('Ativo não encontrado.');
    if (dto.buildingId) await this.ensureBuilding(tenantId, dto.buildingId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({ where: { id }, data: { ...dto,
        tag: dto.tag?.trim().toUpperCase(), name: dto.name?.trim(), category: dto.category?.trim(),
        installedAt: dto.installedAt ? new Date(dto.installedAt) : undefined,
        warrantyEndsAt: dto.warrantyEndsAt ? new Date(dto.warrantyEndsAt) : undefined,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.UPDATE, 'Asset', id, { tag: updated.tag, status: updated.status });
      return updated;
    });
  }

  async archiveAsset(tenantId: string, actorUserId: string, id: string) {
    const current = await this.prisma.asset.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!current) throw new NotFoundException('Ativo não encontrado.');
    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.asset.update({ where: { id }, data: { status: 'DISPOSED', deletedAt: new Date() } });
      await tx.maintenancePlan.updateMany({ where: { tenantId, assetId: id, active: true, deletedAt: null }, data: { active: false, suspendedAt: new Date() } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.DELETE, 'Asset', id, { tag: current.tag, archived: true });
      return archived;
    });
  }

  listPlans(tenantId: string) { return this.prisma.maintenancePlan.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ active: 'desc' }, { nextDueAt: 'asc' }],
    include: { building: { select: { id: true, code: true, name: true } }, asset: { select: { id: true, tag: true, name: true } },
      contract: { select: { id: true, code: true } }, supplier: { select: { id: true, legalName: true, tradeName: true } },
      _count: { select: { generatedWorkOrders: true, generations: true } } } }); }

  intelligentSystems() { return { version: INTELLIGENCE_VERSION, systems: availableMaintenanceSystems() }; }

  async previewIntelligent(tenantId: string, dto: IntelligentMaintenanceDto) {
    const building = await this.prisma.building.findFirst({ where: { id: dto.buildingId, tenantId, deletedAt: null },
      select: { id: true, code: true, name: true, type: true, constructionYear: true, grossAreaM2: true, floors: true } });
    if (!building) throw new BadRequestException('Edificação inválida.');
    const validSystems = new Set(availableMaintenanceSystems());
    const systems = dto.systems.map((item) => item.trim().toUpperCase());
    const invalid = systems.filter((item) => !validSystems.has(item));
    if (invalid.length) throw new BadRequestException(`Sistemas não reconhecidos: ${invalid.join(', ')}.`);
    const recommendations = recommendMaintenance({ buildingType: building.type ?? undefined,
      constructionYear: building.constructionYear, environmentalExposure: dto.environmentalExposure,
      occupationIntensity: dto.occupationIntensity, systems,
      startDate: dto.startDate ? new Date(dto.startDate) : new Date() });
    return { version: INTELLIGENCE_VERSION, generatedAt: new Date().toISOString(), building,
      assumptions: { environmentalExposure: dto.environmentalExposure, occupationIntensity: dto.occupationIntensity,
        humanValidationRequired: true, normativeTextReproduced: false }, recommendations };
  }

  async createIntelligent(tenantId: string, actorUserId: string, actorRole: MembershipRole,
    dto: IntelligentMaintenanceDto) {
    const preview = await this.previewIntelligent(tenantId, dto);
    await this.validatePlanReferences(tenantId, { buildingId: dto.buildingId, contractId: dto.contractId, supplierId: dto.supplierId });
    const selected = dto.selectedCodes?.length ? new Set(dto.selectedCodes) : null;
    const recommendations = preview.recommendations.filter((item) => !selected || selected.has(item.code));
    if (!recommendations.length) throw new BadRequestException('Selecione ao menos uma recomendação.');
    const catalogs = await this.prisma.operationalCatalogItem.findMany({ where: { tenantId,
      kind: OperationalCatalogKind.CATEGORY, active: true, deletedAt: null } });
    const categoryByCode = new Map(catalogs.map((item) => [item.code, item.id]));
    const categoryCode = (system: string) => system.includes('ELETR') || system === 'SPDA' || system === 'GERADOR' ? 'ELETRICA'
      : ['RESERVATORIOS', 'BOMBAS', 'HIDRAULICO'].includes(system) ? 'HIDRAULICA'
      : system === 'AR_CONDICIONADO' ? 'CLIMATIZACAO' : 'GERAL';
    const result = await this.prisma.$transaction(async (tx) => {
      const createdIds: string[] = []; const skippedCodes: string[] = [];
      for (const recommendation of recommendations) {
        const name = `[${recommendation.code}] ${recommendation.title}`;
        const existing = await tx.maintenancePlan.findFirst({ where: { tenantId, buildingId: dto.buildingId,
          name, active: true } });
        if (existing) { skippedCodes.push(recommendation.code); continue; }
        const created = await tx.maintenancePlan.create({ data: {
          tenantId, buildingId: dto.buildingId, contractId: dto.contractId, supplierId: dto.supplierId,
          categoryId: categoryByCode.get(categoryCode(recommendation.system)), name,
          titleTemplate: `${recommendation.title} — {data}`, description: `${recommendation.objective}\n\n${recommendation.rationale}`,
          type: recommendation.type, frequencyUnit: recommendation.frequencyUnit,
          frequencyValue: recommendation.frequencyValue, nextDueAt: new Date(recommendation.nextDueAt),
          defaultPriority: recommendation.priority, generationHorizonDays: dto.horizonDays,
          checklistTemplate: { items: recommendation.checklist.map((label, index) => ({ label, required: true, sortOrder: index })) },
          generationSource: 'INTELLIGENT_RULE_ENGINE', riskScore: recommendation.riskScore,
          recommendationVersion: INTELLIGENCE_VERSION, technicalBasis: {
            code: recommendation.code, system: recommendation.system, criticality: recommendation.criticality,
            rationale: recommendation.rationale, procedure: recommendation.procedure,
            acceptanceCriteria: recommendation.acceptanceCriteria, technicalReferences: recommendation.technicalReferences,
            estimatedHours: recommendation.estimatedHours, specialty: recommendation.specialty,
            humanValidationRequired: true,
          },
        } });
        createdIds.push(created.id);
      }
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'IntelligentMaintenanceBatch', dto.buildingId,
        { version: INTELLIGENCE_VERSION, createdIds, skippedCodes, systems: dto.systems });
      return { createdIds, skippedCodes };
    });
    const generation = dto.generateWorkOrders
      ? await this.generate(tenantId, actorUserId, actorRole, dto.horizonDays)
      : { generated: 0, skipped: 0, failed: 0, workOrderIds: [] as string[] };
    return { version: INTELLIGENCE_VERSION, recommendations: recommendations.length,
      plansCreated: result.createdIds.length, plansSkipped: result.skippedCodes.length,
      planIds: result.createdIds, skippedCodes: result.skippedCodes, workOrders: generation };
  }

  async createPlan(tenantId: string, actorUserId: string, dto: CreateMaintenancePlanDto) {
    await this.validatePlanReferences(tenantId, dto);
    const data = this.planData(dto);
    const plan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.maintenancePlan.create({ data: { tenantId, ...data,
        buildingId: dto.buildingId, name: dto.name.trim(), titleTemplate: dto.titleTemplate.trim(),
        type: dto.type, frequencyUnit: dto.frequencyUnit, frequencyValue: dto.frequencyValue,
        nextDueAt: new Date(dto.nextDueAt) }, include: { building: true, asset: true } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'MaintenancePlan', created.id, { name: created.name, nextDueAt: created.nextDueAt.toISOString() });
      return created;
    });
    return plan;
  }

  async updatePlan(tenantId: string, actorUserId: string, id: string, dto: UpdateMaintenancePlanDto) {
    const current = await this.prisma.maintenancePlan.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!current) throw new NotFoundException('Plano de manutenção não encontrado.');
    await this.validatePlanReferences(tenantId, { ...dto, buildingId: dto.buildingId ?? current.buildingId });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenancePlan.update({ where: { id }, data: this.planData(dto) });
      await this.audit(tx, tenantId, actorUserId, AuditAction.UPDATE, 'MaintenancePlan', id, { active: updated.active, nextDueAt: updated.nextDueAt.toISOString() });
      return updated;
    });
  }

  async archivePlan(tenantId: string, actorUserId: string, id: string) {
    const current = await this.prisma.maintenancePlan.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!current) throw new NotFoundException('Plano de manutenção não encontrado.');
    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.maintenancePlan.update({ where: { id }, data: {
        active: false, suspendedAt: new Date(), deletedAt: new Date(),
      } });
      await this.audit(tx, tenantId, actorUserId, AuditAction.DELETE, 'MaintenancePlan', id,
        { name: current.name, generatedWorkOrdersPreserved: true, archived: true });
      return archived;
    });
  }

  async generate(tenantId: string, actorUserId: string, actorRole: MembershipRole, horizonDays: number) {
    const now = Date.now();
    const horizon = new Date(now + horizonDays * 86400000);
    const maximumDueDate = new Date(horizon.getTime() + 365 * 86400000);
    const plans = await this.prisma.maintenancePlan.findMany({ where: { tenantId, active: true, suspendedAt: null, deletedAt: null,
      frequencyUnit: { not: FrequencyUnit.METER_READING }, nextDueAt: { lte: maximumDueDate } },
      orderBy: { nextDueAt: 'asc' }, include: { asset: true } });
    const result = { generated: 0, skipped: 0, failed: 0, workOrderIds: [] as string[] };
    for (const plan of plans) {
      const planHorizon = new Date(now + Math.min(horizonDays, plan.generationHorizonDays) * 86400000 + plan.advanceDays * 86400000);
      let scheduledFor = plan.nextDueAt;
      let occurrences = 0;
      while (scheduledFor <= planHorizon && occurrences < 24) {
        occurrences += 1;
        const nextDue = nextOccurrence(scheduledFor, plan.frequencyUnit, plan.frequencyValue);
        let reservation;
        try {
          reservation = await this.prisma.maintenancePlanGeneration.create({ data: { tenantId, planId: plan.id, scheduledFor } });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const existing = await this.prisma.maintenancePlanGeneration.findUnique({
              where: { planId_scheduledFor: { planId: plan.id, scheduledFor } },
            });
            if (existing?.status === MaintenanceGenerationStatus.FAILED) {
              reservation = await this.prisma.maintenancePlanGeneration.update({ where: { id: existing.id },
                data: { status: MaintenanceGenerationStatus.PENDING, error: null } });
            } else {
              result.skipped += 1;
              if (existing?.status === MaintenanceGenerationStatus.GENERATED) {
                await this.prisma.maintenancePlan.updateMany({ where: { id: plan.id, tenantId, nextDueAt: { lte: scheduledFor } }, data: { nextDueAt: nextDue } });
              }
              scheduledFor = nextDue;
              continue;
            }
          } else {
            throw error;
          }
        }
        try {
          const workOrder = await this.workOrders.create(tenantId, actorUserId, actorRole, {
            buildingId: plan.buildingId, categoryId: plan.categoryId ?? undefined,
            specialtyId: plan.specialtyId ?? undefined, title: this.renderTitle(plan.titleTemplate, plan.asset?.name, scheduledFor),
            description: plan.description ?? `Ordem gerada automaticamente pelo plano preventivo ${plan.name}.`,
            locationDetail: plan.asset?.location ?? undefined, priority: plan.defaultPriority,
            origin: WorkOrderOrigin.PREVENTIVE_PLAN, assignedToUserId: plan.assignedToUserId ?? undefined,
            supplierId: plan.supplierId ?? undefined, contractIds: plan.contractId ? [plan.contractId] : undefined,
            dueAt: scheduledFor.toISOString(),
          });
          await this.prisma.$transaction([
            this.prisma.workOrder.update({ where: { id: workOrder.id }, data: { maintenancePlanId: plan.id, preventiveScheduledFor: scheduledFor } }),
            this.prisma.maintenancePlanGeneration.update({ where: { id: reservation.id }, data: { status: MaintenanceGenerationStatus.GENERATED, workOrderId: workOrder.id, generatedAt: new Date() } }),
            this.prisma.maintenancePlan.update({ where: { id: plan.id }, data: { lastGeneratedAt: new Date(), nextDueAt: nextDue, lastError: null, lastErrorAt: null } }),
          ]);
          result.generated += 1; result.workOrderIds.push(workOrder.id);
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 5000) : 'Falha desconhecida';
          await this.prisma.$transaction([
            this.prisma.maintenancePlanGeneration.update({ where: { id: reservation.id }, data: { status: MaintenanceGenerationStatus.FAILED, error: message } }),
            this.prisma.maintenancePlan.update({ where: { id: plan.id }, data: { lastErrorAt: new Date(), lastError: message } }),
          ]);
          result.failed += 1;
        }
        scheduledFor = nextDue;
      }
    }
    await this.prisma.auditLog.create({ data: { tenantId, actorUserId, action: AuditAction.CREATE,
      entityType: 'MaintenanceGenerationBatch', afterData: { horizon: horizon.toISOString(), ...result } } });
    return result;
  }

  private planData(dto: UpdateMaintenancePlanDto) {
    return { buildingId: dto.buildingId, assetId: dto.assetId, contractId: dto.contractId,
      categoryId: dto.categoryId, specialtyId: dto.specialtyId, supplierId: dto.supplierId,
      assignedToUserId: dto.assignedToUserId, name: dto.name?.trim(), titleTemplate: dto.titleTemplate?.trim(),
      description: dto.description, type: dto.type, frequencyUnit: dto.frequencyUnit,
      frequencyValue: dto.frequencyValue, nextDueAt: dto.nextDueAt ? new Date(dto.nextDueAt) : undefined,
      defaultPriority: dto.defaultPriority, advanceDays: dto.advanceDays,
      generationHorizonDays: dto.generationHorizonDays,
      checklistTemplate: dto.checklistTemplate as Prisma.InputJsonValue | undefined, active: dto.active,
      suspendedAt: dto.active === false ? new Date() : dto.active === true ? null : undefined };
  }

  private async validatePlanReferences(tenantId: string, dto: Partial<CreateMaintenancePlanDto> & { buildingId: string }) {
    const [building, asset, contract, supplier, assignee, catalogs] = await Promise.all([
      this.prisma.building.findFirst({ where: { id: dto.buildingId, tenantId, deletedAt: null } }),
      dto.assetId ? this.prisma.asset.findFirst({ where: { id: dto.assetId, tenantId, buildingId: dto.buildingId, deletedAt: null } }) : true,
      dto.contractId ? this.prisma.contract.findFirst({ where: { id: dto.contractId, tenantId, deletedAt: null } }) : true,
      dto.supplierId ? this.prisma.supplier.findFirst({ where: { id: dto.supplierId, tenantId, deletedAt: null } }) : true,
      dto.assignedToUserId ? this.prisma.tenantMembership.findFirst({ where: { tenantId, userId: dto.assignedToUserId, status: 'ACTIVE', user: { deletedAt: null, status: 'ACTIVE' } } }) : true,
      this.prisma.operationalCatalogItem.findMany({ where: { tenantId, id: { in: [dto.categoryId, dto.specialtyId].filter((id): id is string => Boolean(id)) }, deletedAt: null } }),
    ]);
    if (!building || !asset || !contract || !supplier || !assignee) throw new BadRequestException('Uma ou mais referências do plano são inválidas.');
    const category = catalogs.find((item) => item.id === dto.categoryId);
    const specialty = catalogs.find((item) => item.id === dto.specialtyId);
    if ((dto.categoryId && category?.kind !== OperationalCatalogKind.CATEGORY) ||
      (dto.specialtyId && specialty?.kind !== OperationalCatalogKind.SPECIALTY)) throw new BadRequestException('Categoria ou especialidade inválida.');
  }

  private async ensureBuilding(tenantId: string, id: string) {
    if (!await this.prisma.building.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } })) throw new BadRequestException('Edificação inválida.');
  }

  private renderTitle(template: string, assetName: string | undefined, dueAt: Date) {
    return template.replaceAll('{ativo}', assetName ?? 'instalação').replaceAll('{data}', dueAt.toISOString().slice(0, 10));
  }

  private audit(tx: Prisma.TransactionClient, tenantId: string, actorUserId: string,
    action: AuditAction, entityType: string, entityId: string, afterData: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { tenantId, actorUserId, action, entityType, entityId, afterData } });
  }
}
