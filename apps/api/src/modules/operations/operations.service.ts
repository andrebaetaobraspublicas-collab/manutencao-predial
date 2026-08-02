import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  OperationalCatalogKind,
  Prisma,
  SlaTimeMode,
  WorkOrderPriority,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCatalogItemDto,
  ListCatalogItemsQuery,
  ReplaceChecklistTemplateDto,
  UpdateCatalogItemDto,
} from './dto/catalog.dto';
import {
  CalculateSlaDto,
  CreateSlaCalendarDto,
  CreateSlaHolidayDto,
  CreateSlaPolicyDto,
  ListSlaCalendarsQuery,
  ListSlaPoliciesQuery,
  UpdateSlaCalendarDto,
  UpdateSlaPolicyDto,
} from './dto/sla.dto';
import {
  calculateSlaDeadlines,
  type SlaCalendarValue,
  validateSlaCalendar,
} from './sla-calculator';
import { selectSlaPolicy } from './sla-policy-resolver';

type ClassificationInput = {
  categoryId?: string;
  specialtyId?: string;
  environmentId?: string;
  causeId?: string;
};

export type CalculateSlaInput = Omit<CalculateSlaDto, 'startAt'> & {
  startAt: string | Date;
};

type OperationsDatabaseClient = PrismaService | Prisma.TransactionClient;

const SLA_POLICY_INCLUDE = {
  calendar: {
    include: {
      holidays: { where: { active: true }, orderBy: { date: 'asc' as const } },
    },
  },
  contract: { select: { id: true, code: true, object: true, tenantId: true } },
  category: { select: { id: true, code: true, name: true, tenantId: true, kind: true } },
} satisfies Prisma.SlaPolicyInclude;

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async provisionTenantDefaults(
    tenantId: string,
    timezone = 'America/Sao_Paulo',
    database: OperationsDatabaseClient = this.prisma,
  ) {
    const category = await database.operationalCatalogItem.upsert({
      where: {
        tenantId_kind_code: {
          tenantId,
          kind: OperationalCatalogKind.CATEGORY,
          code: 'GERAL',
        },
      },
      create: {
        tenantId,
        kind: OperationalCatalogKind.CATEGORY,
        code: 'GERAL',
        name: 'Serviços gerais',
        requireAcceptance: true,
      },
      update: {},
    });
    const calendar = await database.slaCalendar.upsert({
      where: { tenantId_code: { tenantId, code: 'PADRAO_24X7' } },
      create: {
        tenantId,
        code: 'PADRAO_24X7',
        name: 'Calendário corrido 24x7',
        timezone,
        timeMode: SlaTimeMode.CALENDAR,
        businessDays: [0, 1, 2, 3, 4, 5, 6],
      },
      update: {},
    });

    const defaults: Array<{
      priority: WorkOrderPriority;
      responseMinutes: number;
      resolutionMinutes: number;
    }> = [
      { priority: WorkOrderPriority.LOW, responseMinutes: 1440, resolutionMinutes: 7200 },
      { priority: WorkOrderPriority.NORMAL, responseMinutes: 480, resolutionMinutes: 4320 },
      { priority: WorkOrderPriority.HIGH, responseMinutes: 240, resolutionMinutes: 1440 },
      { priority: WorkOrderPriority.URGENT, responseMinutes: 60, resolutionMinutes: 480 },
      { priority: WorkOrderPriority.CRITICAL, responseMinutes: 15, resolutionMinutes: 240 },
    ];
    const policies: Array<{ id: string; code: string; priority: WorkOrderPriority }> = [];
    for (const item of defaults) {
      policies.push(
        await database.slaPolicy.upsert({
          where: { tenantId_code: { tenantId, code: `PADRAO_${item.priority}` } },
          create: {
            tenantId,
            calendarId: calendar.id,
            code: `PADRAO_${item.priority}`,
            name: `SLA padrão ${item.priority}`,
            priority: item.priority,
            responseMinutes: item.responseMinutes,
            resolutionMinutes: item.resolutionMinutes,
            warningMinutesBefore: Math.min(60, item.responseMinutes),
          },
          update: {},
          select: { id: true, code: true, priority: true },
        }),
      );
    }
    return { category, calendar, policies };
  }

  listCatalogItems(tenantId: string, query: ListCatalogItemsQuery) {
    return this.prisma.operationalCatalogItem.findMany({
      where: {
        tenantId,
        kind: query.kind,
        deletedAt: null,
        active: query.activeOnly ? true : undefined,
      },
      include: {
        parent: { select: { id: true, code: true, name: true, kind: true } },
        _count: { select: { children: true, checklistTemplate: true } },
      },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCatalogItem(
    tenantId: string,
    actorUserId: string,
    dto: CreateCatalogItemDto,
  ) {
    this.assertCategoryOnlyConfiguration(dto.kind, dto);
    const code = normalizeCode(dto.code);
    const duplicate = await this.prisma.operationalCatalogItem.findFirst({
      where: { tenantId, kind: dto.kind, code },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Já existe um item deste tipo com esse código.');
    if (dto.parentId) await this.assertValidCatalogParent(tenantId, dto.kind, dto.parentId);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.operationalCatalogItem.create({
        data: {
          tenantId,
          parentId: dto.parentId,
          kind: dto.kind,
          code,
          name: dto.name.trim(),
          description: cleanOptional(dto.description),
          sortOrder: dto.sortOrder,
          defaultPriority: dto.defaultPriority,
          requirePhotoBefore: dto.requirePhotoBefore,
          requirePhotoDuring: dto.requirePhotoDuring,
          requirePhotoAfter: dto.requirePhotoAfter,
          requireChecklist: dto.requireChecklist,
          requireFinalCost: dto.requireFinalCost,
          requireAcceptance: dto.requireAcceptance,
        },
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'OperationalCatalogItem', item.id, {
        kind: item.kind,
        code: item.code,
        name: item.name,
      });
      return item;
    });
  }

  async updateCatalogItem(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateCatalogItemDto,
  ) {
    const current = await this.getCatalogItem(tenantId, id);
    if (dto.kind && dto.kind !== current.kind) {
      throw new BadRequestException('O tipo de um item de catálogo não pode ser alterado.');
    }
    this.assertCategoryOnlyConfiguration(current.kind, dto);

    const code = dto.code ? normalizeCode(dto.code) : undefined;
    if (code && code !== current.code) {
      const duplicate = await this.prisma.operationalCatalogItem.findFirst({
        where: { tenantId, kind: current.kind, code, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Já existe um item deste tipo com esse código.');
    }
    if (dto.parentId) {
      await this.assertValidCatalogParent(tenantId, current.kind, dto.parentId, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.operationalCatalogItem.update({
        where: { id },
        data: {
          parentId: dto.parentId,
          code,
          name: dto.name?.trim(),
          description: dto.description === undefined ? undefined : cleanOptional(dto.description),
          sortOrder: dto.sortOrder,
          defaultPriority: dto.defaultPriority,
          requirePhotoBefore: dto.requirePhotoBefore,
          requirePhotoDuring: dto.requirePhotoDuring,
          requirePhotoAfter: dto.requirePhotoAfter,
          requireChecklist: dto.requireChecklist,
          requireFinalCost: dto.requireFinalCost,
          requireAcceptance: dto.requireAcceptance,
        },
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.UPDATE, 'OperationalCatalogItem', id, {
        code: updated.code,
        name: updated.name,
        active: updated.active,
      });
      return updated;
    });
  }

  async archiveCatalogItem(tenantId: string, actorUserId: string, id: string) {
    const current = await this.getCatalogItem(tenantId, id);
    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.operationalCatalogItem.update({
        where: { id },
        data: { active: false, deletedAt: new Date() },
      });
      if (current.kind === OperationalCatalogKind.CATEGORY) {
        await Promise.all([
          tx.checklistTemplateItem.updateMany({
            where: { tenantId, categoryId: id, active: true },
            data: { active: false },
          }),
          tx.slaPolicy.updateMany({
            where: { tenantId, categoryId: id, active: true },
            data: { active: false },
          }),
        ]);
      }
      await this.audit(tx, tenantId, actorUserId, AuditAction.DELETE, 'OperationalCatalogItem', id, {
        code: current.code,
        archived: true,
      });
      return archived;
    });
  }

  async getChecklistTemplate(tenantId: string, categoryId: string) {
    const category = await this.requireCategory(tenantId, categoryId, false);
    const items = await this.prisma.checklistTemplateItem.findMany({
      where: { tenantId, categoryId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { category: pickCatalogIdentity(category), items };
  }

  async replaceChecklistTemplate(
    tenantId: string,
    actorUserId: string,
    categoryId: string,
    dto: ReplaceChecklistTemplateDto,
  ) {
    const category = await this.requireCategory(tenantId, categoryId);
    const normalizedLabels = dto.items.map((item) => item.label.trim().toLocaleLowerCase('pt-BR'));
    if (new Set(normalizedLabels).size !== normalizedLabels.length) {
      throw new BadRequestException('O checklist não pode conter itens com o mesmo rótulo.');
    }
    if (category.requireChecklist && dto.items.length === 0) {
      throw new BadRequestException('A categoria exige checklist e deve possuir ao menos um item.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.checklistTemplateItem.updateMany({
        where: { tenantId, categoryId, active: true },
        data: { active: false },
      });
      if (dto.items.length) {
        await tx.checklistTemplateItem.createMany({
          data: dto.items.map((item, index) => ({
            tenantId,
            categoryId,
            label: item.label.trim(),
            description: cleanOptional(item.description),
            required: item.required ?? true,
            sortOrder: item.sortOrder ?? index,
          })),
        });
      }
      await this.audit(tx, tenantId, actorUserId, AuditAction.UPDATE, 'ChecklistTemplate', categoryId, {
        categoryId,
        itemCount: dto.items.length,
      });
      const items = await tx.checklistTemplateItem.findMany({
        where: { tenantId, categoryId, active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      return { category: pickCatalogIdentity(category), items };
    });
  }

  async instantiateChecklist(
    tenantId: string,
    workOrderId: string,
    categoryId: string,
    database: OperationsDatabaseClient = this.prisma,
  ) {
    const [workOrder, category, templateItems, existing] = await Promise.all([
      database.workOrder.findFirst({
        where: { id: workOrderId, tenantId, deletedAt: null },
        select: { id: true },
      }),
      database.operationalCatalogItem.findFirst({
        where: {
          id: categoryId,
          tenantId,
          kind: OperationalCatalogKind.CATEGORY,
          active: true,
          deletedAt: null,
        },
        select: { id: true },
      }),
      database.checklistTemplateItem.findMany({
        where: { tenantId, categoryId, active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      database.workOrderChecklistItem.findMany({
        where: { tenantId, workOrderId, templateItemId: { not: null } },
        select: { templateItemId: true },
      }),
    ]);
    if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
    if (!category) throw new BadRequestException('Categoria inválida para esta organização.');

    const existingTemplateIds = new Set(existing.map((item) => item.templateItemId));
    const missing = templateItems.filter((item) => !existingTemplateIds.has(item.id));
    if (missing.length) {
      await database.workOrderChecklistItem.createMany({
        data: missing.map((item) => ({
          tenantId,
          workOrderId,
          templateItemId: item.id,
          label: item.label,
          description: item.description,
          required: item.required,
          sortOrder: item.sortOrder,
        })),
      });
    }
    return database.workOrderChecklistItem.findMany({
      where: { tenantId, workOrderId },
      include: { responses: { orderBy: { createdAt: 'desc' } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async validateWorkOrderClassification(
    tenantId: string,
    input: ClassificationInput,
  ): Promise<void> {
    const references = [
      [input.categoryId, OperationalCatalogKind.CATEGORY],
      [input.specialtyId, OperationalCatalogKind.SPECIALTY],
      [input.environmentId, OperationalCatalogKind.ENVIRONMENT],
      [input.causeId, OperationalCatalogKind.CAUSE],
    ] as const;
    const requested = references.filter((reference) => Boolean(reference[0]));
    if (!requested.length) return;

    const items = await this.prisma.operationalCatalogItem.findMany({
      where: {
        tenantId,
        id: { in: requested.map(([id]) => id!) },
        active: true,
        deletedAt: null,
      },
      select: { id: true, kind: true },
    });
    const found = new Map(items.map((item) => [item.id, item.kind]));
    const invalid = requested.some(([id, kind]) => found.get(id!) !== kind);
    if (invalid || items.length !== requested.length) {
      throw new BadRequestException('Classificação operacional inválida para esta organização.');
    }
  }

  listSlaCalendars(tenantId: string, query: ListSlaCalendarsQuery) {
    return this.prisma.slaCalendar.findMany({
      where: { tenantId, active: query.activeOnly ? true : undefined },
      include: { holidays: { where: { active: true }, orderBy: { date: 'asc' } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createSlaCalendar(
    tenantId: string,
    actorUserId: string,
    dto: CreateSlaCalendarDto,
  ) {
    const code = normalizeCode(dto.code);
    const duplicate = await this.prisma.slaCalendar.findFirst({
      where: { tenantId, code },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Já existe um calendário com esse código.');
    const calendar = normalizeCalendarInput(dto);
    validateSlaCalendar(calendar);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.slaCalendar.create({
        data: {
          tenantId,
          code,
          name: dto.name.trim(),
          timezone: calendar.timezone,
          timeMode: calendar.timeMode,
          businessDays: calendar.businessDays as Prisma.InputJsonValue,
          shifts:
            calendar.shifts === undefined
              ? undefined
              : (calendar.shifts as Prisma.InputJsonValue),
          workdayStart: calendar.workdayStart,
          workdayEnd: calendar.workdayEnd,
          active: dto.active,
        },
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'SlaCalendar', created.id, {
        code: created.code,
        timeMode: created.timeMode,
      });
      return created;
    });
  }

  async updateSlaCalendar(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateSlaCalendarDto,
  ) {
    const current = await this.requireSlaCalendar(tenantId, id, false);
    const code = dto.code ? normalizeCode(dto.code) : undefined;
    if (code && code !== current.code) {
      const duplicate = await this.prisma.slaCalendar.findFirst({
        where: { tenantId, code, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Já existe um calendário com esse código.');
    }
    const calendar = normalizeCalendarInput({
      code: dto.code ?? current.code,
      name: dto.name ?? current.name,
      timezone: dto.timezone ?? current.timezone,
      timeMode: dto.timeMode ?? current.timeMode,
      businessDays: dto.businessDays ?? jsonBusinessDays(current.businessDays),
      shifts: dto.shifts !== undefined ? dto.shifts : jsonShifts(current.shifts),
      workdayStart: dto.workdayStart ?? current.workdayStart ?? undefined,
      workdayEnd: dto.workdayEnd ?? current.workdayEnd ?? undefined,
      active: dto.active ?? current.active,
    });
    validateSlaCalendar(calendar);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Tenant WHERE id = ${tenantId} FOR UPDATE`;
      const locked = await tx.slaCalendar.findFirst({
        where: { id, tenantId },
        select: { updatedAt: true },
      });
      if (!locked) throw new NotFoundException('Calendário de SLA não encontrado.');
      if (locked.updatedAt.getTime() !== current.updatedAt.getTime()) {
        throw new ConflictException(
          'O calendário foi alterado por outro usuário. Atualize e tente novamente.',
        );
      }
      if (code && code !== current.code) {
        const duplicate = await tx.slaCalendar.findFirst({
          where: { tenantId, code, NOT: { id } },
          select: { id: true },
        });
        if (duplicate) throw new ConflictException('Já existe um calendário com esse código.');
      }
      if (dto.active === false) {
        const activePolicy = await tx.slaPolicy.findFirst({
          where: { tenantId, calendarId: id, active: true },
          select: { id: true },
        });
        if (activePolicy) {
          throw new ConflictException(
            'Desative ou mova as políticas de SLA ativas antes de desativar o calendário.',
          );
        }
      }
      const updated = await tx.slaCalendar.update({
        where: { id },
        data: {
          code,
          name: dto.name?.trim(),
          timezone: calendar.timezone,
          timeMode: calendar.timeMode,
          businessDays: calendar.businessDays as Prisma.InputJsonValue,
          shifts:
            calendar.shifts === undefined
              ? undefined
              : (calendar.shifts as Prisma.InputJsonValue),
          workdayStart: calendar.workdayStart,
          workdayEnd: calendar.workdayEnd,
          active: dto.active,
        },
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.UPDATE, 'SlaCalendar', id, {
        code: updated.code,
        timeMode: updated.timeMode,
        active: updated.active,
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async addSlaHoliday(
    tenantId: string,
    actorUserId: string,
    calendarId: string,
    dto: CreateSlaHolidayDto,
  ) {
    await this.requireSlaCalendar(tenantId, calendarId, false);
    const date = dateOnly(dto.date);
    const duplicate = await this.prisma.slaHoliday.findFirst({
      where: { tenantId, calendarId, date },
      select: { id: true, active: true },
    });
    if (duplicate?.active) throw new ConflictException('Já existe um feriado nessa data.');

    return this.prisma.$transaction(async (tx) => {
      const holiday = duplicate
        ? await tx.slaHoliday.update({
            where: { id: duplicate.id },
            data: { name: dto.name.trim(), active: true },
          })
        : await tx.slaHoliday.create({
            data: { tenantId, calendarId, date, name: dto.name.trim() },
          });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'SlaHoliday', holiday.id, {
        calendarId,
        date: dto.date,
        name: holiday.name,
      });
      return holiday;
    });
  }

  async deactivateSlaHoliday(
    tenantId: string,
    actorUserId: string,
    calendarId: string,
    holidayId: string,
  ) {
    const holiday = await this.prisma.slaHoliday.findFirst({
      where: { id: holidayId, tenantId, calendarId, active: true },
    });
    if (!holiday) throw new NotFoundException('Feriado não encontrado.');

    return this.prisma.$transaction(async (tx) => {
      const deactivated = await tx.slaHoliday.update({
        where: { id: holidayId },
        data: { active: false },
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.DELETE, 'SlaHoliday', holidayId, {
        calendarId,
        date: holiday.date.toISOString().slice(0, 10),
        deactivated: true,
      });
      return deactivated;
    });
  }

  listSlaPolicies(tenantId: string, query: ListSlaPoliciesQuery) {
    return this.prisma.slaPolicy.findMany({
      where: {
        tenantId,
        priority: query.priority,
        contractId: query.contractId,
        categoryId: query.categoryId,
        calendarId: query.calendarId,
        active: query.activeOnly ? true : undefined,
      },
      include: SLA_POLICY_INCLUDE,
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  }

  async createSlaPolicy(
    tenantId: string,
    actorUserId: string,
    dto: CreateSlaPolicyDto,
  ) {
    const code = normalizeCode(dto.code);
    this.validateSlaDurations(
      dto.responseMinutes,
      dto.resolutionMinutes,
      dto.warningMinutesBefore ?? 60,
    );
    await this.validateSlaPolicyReferences(tenantId, dto, dto.active ?? true);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Tenant WHERE id = ${tenantId} FOR UPDATE`;
      const [duplicateCode, duplicateScope] = await Promise.all([
        tx.slaPolicy.findFirst({
          where: { tenantId, code },
          select: { id: true },
        }),
        dto.active === false
          ? Promise.resolve(null)
          : tx.slaPolicy.findFirst({
              where: {
                tenantId,
                priority: dto.priority,
                contractId: dto.contractId ?? null,
                categoryId: dto.categoryId ?? null,
                active: true,
              },
              select: { id: true },
            }),
      ]);
      if (duplicateCode) throw new ConflictException('Já existe uma política com esse código.');
      if (duplicateScope) {
        throw new ConflictException('Já existe uma política ativa para o mesmo escopo e prioridade.');
      }
      const policy = await tx.slaPolicy.create({
        data: {
          tenantId,
          calendarId: dto.calendarId,
          contractId: dto.contractId,
          categoryId: dto.categoryId,
          code,
          name: dto.name.trim(),
          priority: dto.priority,
          responseMinutes: dto.responseMinutes,
          resolutionMinutes: dto.resolutionMinutes,
          warningMinutesBefore: dto.warningMinutesBefore,
          active: dto.active,
        },
        include: SLA_POLICY_INCLUDE,
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'SlaPolicy', policy.id, {
        code: policy.code,
        priority: policy.priority,
        contractId: policy.contractId,
        categoryId: policy.categoryId,
      });
      return policy;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateSlaPolicy(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateSlaPolicyDto,
  ) {
    const current = await this.requireSlaPolicy(tenantId, id);
    const merged = {
      calendarId: dto.calendarId ?? current.calendarId,
      contractId:
        dto.contractId !== undefined ? dto.contractId ?? undefined : current.contractId ?? undefined,
      categoryId:
        dto.categoryId !== undefined ? dto.categoryId ?? undefined : current.categoryId ?? undefined,
      priority: dto.priority ?? current.priority,
      active: dto.active ?? current.active,
      responseMinutes: dto.responseMinutes ?? current.responseMinutes,
      resolutionMinutes: dto.resolutionMinutes ?? current.resolutionMinutes,
      warningMinutesBefore: dto.warningMinutesBefore ?? current.warningMinutesBefore,
    };
    this.validateSlaDurations(
      merged.responseMinutes,
      merged.resolutionMinutes,
      merged.warningMinutesBefore,
    );
    await this.validateSlaPolicyReferences(tenantId, merged, merged.active);

    const code = dto.code ? normalizeCode(dto.code) : undefined;

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Tenant WHERE id = ${tenantId} FOR UPDATE`;
      const locked = await tx.slaPolicy.findFirst({
        where: { id, tenantId },
        select: { updatedAt: true },
      });
      if (!locked) throw new NotFoundException('Política de SLA não encontrada.');
      if (locked.updatedAt.getTime() !== current.updatedAt.getTime()) {
        throw new ConflictException(
          'A política de SLA foi alterada por outro usuário. Atualize e tente novamente.',
        );
      }
      const [duplicateCode, duplicateScope] = await Promise.all([
        tx.slaPolicy.findFirst({
          where: { tenantId, code: code ?? current.code, NOT: { id } },
          select: { id: true },
        }),
        merged.active
          ? tx.slaPolicy.findFirst({
              where: {
                tenantId,
                priority: merged.priority,
                contractId: merged.contractId ?? null,
                categoryId: merged.categoryId ?? null,
                active: true,
                NOT: { id },
              },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);
      if (duplicateCode) throw new ConflictException('Já existe uma política com esse código.');
      if (duplicateScope) {
        throw new ConflictException('Já existe uma política ativa para o mesmo escopo e prioridade.');
      }
      const removesGlobalFallback =
        current.active &&
        current.contractId === null &&
        current.categoryId === null &&
        (!merged.active ||
          Boolean(merged.contractId) ||
          Boolean(merged.categoryId) ||
          merged.priority !== current.priority);
      if (removesGlobalFallback) {
        const replacement = await tx.slaPolicy.findFirst({
          where: {
            tenantId,
            priority: current.priority,
            contractId: null,
            categoryId: null,
            active: true,
            NOT: { id },
          },
          select: { id: true },
        });
        if (!replacement) {
          throw new ConflictException(
            'Cada prioridade deve manter uma política global ativa como fallback do tenant.',
          );
        }
      }
      const policy = await tx.slaPolicy.update({
        where: { id },
        data: {
          calendarId: dto.calendarId,
          contractId: dto.contractId,
          categoryId: dto.categoryId,
          code,
          name: dto.name?.trim(),
          priority: dto.priority,
          responseMinutes: dto.responseMinutes,
          resolutionMinutes: dto.resolutionMinutes,
          warningMinutesBefore: dto.warningMinutesBefore,
          active: dto.active,
        },
        include: SLA_POLICY_INCLUDE,
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.UPDATE, 'SlaPolicy', id, {
        code: policy.code,
        priority: policy.priority,
        active: policy.active,
      });
      return policy;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async resolveSlaPolicy(
    tenantId: string,
    priority: WorkOrderPriority,
    scope: { contractId?: string; categoryId?: string },
  ) {
    await this.validateSlaScope(tenantId, scope);
    const policies = await this.prisma.slaPolicy.findMany({
      where: {
        tenantId,
        priority,
        active: true,
        calendar: { tenantId, active: true },
      },
      include: SLA_POLICY_INCLUDE,
    });
    const policy = selectSlaPolicy(policies, scope);
    if (
      policy.calendar.tenantId !== tenantId ||
      (policy.contract && policy.contract.tenantId !== tenantId) ||
      (policy.category &&
        (policy.category.tenantId !== tenantId || policy.category.kind !== OperationalCatalogKind.CATEGORY))
    ) {
      throw new ConflictException('A política de SLA possui referências inconsistentes entre organizações.');
    }
    return policy;
  }

  async calculateSla(tenantId: string, input: CalculateSlaInput) {
    const policy = await this.resolveSlaPolicy(tenantId, input.priority, {
      contractId: input.contractId,
      categoryId: input.categoryId,
    });
    const startAt = input.startAt instanceof Date ? input.startAt : new Date(input.startAt);
    const calendar: SlaCalendarValue = {
      timeMode: policy.calendar.timeMode,
      timezone: policy.calendar.timezone,
      businessDays: policy.calendar.businessDays,
      shifts: policy.calendar.shifts,
      workdayStart: policy.calendar.workdayStart,
      workdayEnd: policy.calendar.workdayEnd,
      holidays: policy.calendar.holidays,
    };
    const deadlines = calculateSlaDeadlines(
      calendar,
      startAt,
      policy.responseMinutes,
      policy.resolutionMinutes,
      policy.warningMinutesBefore,
    );
    return {
      policy: {
        id: policy.id,
        code: policy.code,
        name: policy.name,
        priority: policy.priority,
        contractId: policy.contractId,
        categoryId: policy.categoryId,
        responseMinutes: policy.responseMinutes,
        resolutionMinutes: policy.resolutionMinutes,
        warningMinutesBefore: policy.warningMinutesBefore,
      },
      calendar: {
        id: policy.calendar.id,
        code: policy.calendar.code,
        name: policy.calendar.name,
        timezone: policy.calendar.timezone,
        timeMode: policy.calendar.timeMode,
        businessDays: policy.calendar.businessDays,
        shifts: policy.calendar.shifts,
        workdayStart: policy.calendar.workdayStart,
        workdayEnd: policy.calendar.workdayEnd,
        holidays: policy.calendar.holidays.map((holiday) => ({
          date: holiday.date.toISOString().slice(0, 10),
          name: holiday.name,
        })),
      },
      startAt,
      ...deadlines,
    };
  }

  private async getCatalogItem(tenantId: string, id: string) {
    const item = await this.prisma.operationalCatalogItem.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!item) throw new NotFoundException('Item de catálogo não encontrado.');
    return item;
  }

  private async requireCategory(tenantId: string, id: string, active = true) {
    const category = await this.prisma.operationalCatalogItem.findFirst({
      where: {
        id,
        tenantId,
        kind: OperationalCatalogKind.CATEGORY,
        deletedAt: null,
        active: active ? true : undefined,
      },
    });
    if (!category) throw new NotFoundException('Categoria não encontrada.');
    return category;
  }

  private async assertValidCatalogParent(
    tenantId: string,
    kind: OperationalCatalogKind,
    parentId: string,
    childId?: string,
  ): Promise<void> {
    const visited = new Set<string>(childId ? [childId] : []);
    let cursor: string | null = parentId;
    for (let depth = 0; cursor && depth < 100; depth += 1) {
      if (visited.has(cursor)) throw new BadRequestException('A hierarquia do catálogo não pode conter ciclos.');
      visited.add(cursor);
      const parent: { id: string; parentId: string | null } | null =
        await this.prisma.operationalCatalogItem.findFirst({
          where: { id: cursor, tenantId, kind, active: true, deletedAt: null },
          select: { id: true, parentId: true },
        });
      if (!parent) throw new BadRequestException('Item pai inválido para esta organização e tipo.');
      cursor = parent.parentId;
    }
    if (cursor) throw new BadRequestException('A hierarquia do catálogo excede o limite permitido.');
  }

  private assertCategoryOnlyConfiguration(
    kind: OperationalCatalogKind,
    dto: Partial<CreateCatalogItemDto>,
  ): void {
    const hasCategoryConfiguration =
      dto.defaultPriority !== undefined ||
      dto.requirePhotoBefore !== undefined ||
      dto.requirePhotoDuring !== undefined ||
      dto.requirePhotoAfter !== undefined ||
      dto.requireChecklist !== undefined ||
      dto.requireFinalCost !== undefined ||
      dto.requireAcceptance !== undefined;
    if (kind !== OperationalCatalogKind.CATEGORY && hasCategoryConfiguration) {
      throw new BadRequestException('Prioridade e critérios de fechamento só podem ser definidos em categorias.');
    }
  }

  private async requireSlaCalendar(tenantId: string, id: string, active = true) {
    const calendar = await this.prisma.slaCalendar.findFirst({
      where: { id, tenantId, active: active ? true : undefined },
      include: { holidays: { where: { active: true }, orderBy: { date: 'asc' } } },
    });
    if (!calendar) throw new NotFoundException('Calendário de SLA não encontrado.');
    return calendar;
  }

  private async requireSlaPolicy(tenantId: string, id: string) {
    const policy = await this.prisma.slaPolicy.findFirst({
      where: { id, tenantId },
      include: SLA_POLICY_INCLUDE,
    });
    if (!policy) throw new NotFoundException('Política de SLA não encontrada.');
    return policy;
  }

  private async validateSlaScope(
    tenantId: string,
    scope: { contractId?: string; categoryId?: string },
  ): Promise<void> {
    const [contract, category] = await Promise.all([
      scope.contractId
        ? this.prisma.contract.findFirst({
            where: { id: scope.contractId, tenantId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve(null),
      scope.categoryId
        ? this.prisma.operationalCatalogItem.findFirst({
            where: {
              id: scope.categoryId,
              tenantId,
              kind: OperationalCatalogKind.CATEGORY,
              active: true,
              deletedAt: null,
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (scope.contractId && !contract) {
      throw new BadRequestException('Contrato inválido para esta organização.');
    }
    if (scope.categoryId && !category) {
      throw new BadRequestException('Categoria inválida para esta organização.');
    }
  }

  private async validateSlaPolicyReferences(
    tenantId: string,
    input: { calendarId: string; contractId?: string | null; categoryId?: string | null },
    requireActiveCalendar: boolean,
  ): Promise<void> {
    const [calendar] = await Promise.all([
      this.prisma.slaCalendar.findFirst({
        where: { id: input.calendarId, tenantId, active: requireActiveCalendar ? true : undefined },
        select: { id: true },
      }),
      this.validateSlaScope(tenantId, {
        contractId: input.contractId ?? undefined,
        categoryId: input.categoryId ?? undefined,
      }),
    ]);
    if (!calendar) throw new BadRequestException('Calendário inválido para esta organização.');
  }

  private validateSlaDurations(
    responseMinutes: number,
    resolutionMinutes: number,
    warningMinutesBefore: number,
  ): void {
    if (responseMinutes > resolutionMinutes) {
      throw new BadRequestException(
        'O prazo de resposta não pode ser maior que o prazo de resolução.',
      );
    }
    if (warningMinutesBefore > resolutionMinutes) {
      throw new BadRequestException(
        'A antecedência do aviso não pode ser maior que o prazo de resolução.',
      );
    }
  }

  private findActivePolicyForExactScope(
    tenantId: string,
    priority: WorkOrderPriority,
    contractId?: string,
    categoryId?: string,
    excludeId?: string,
  ) {
    return this.prisma.slaPolicy.findFirst({
      where: {
        tenantId,
        priority,
        contractId: contractId ?? null,
        categoryId: categoryId ?? null,
        active: true,
        NOT: excludeId ? { id: excludeId } : undefined,
      },
      select: { id: true },
    });
  }

  private audit(
    database: OperationsDatabaseClient,
    tenantId: string,
    actorUserId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    afterData: Prisma.InputJsonObject,
  ) {
    return database.auditLog.create({
      data: { tenantId, actorUserId, action, entityType, entityId, afterData },
    });
  }
}

function normalizeCalendarInput(dto: CreateSlaCalendarDto): SlaCalendarValue {
  const timeMode = dto.timeMode ?? SlaTimeMode.CALENDAR;
  const hasShifts = Boolean(dto.shifts?.length);
  return {
    timeMode,
    timezone: dto.timezone?.trim() || 'America/Sao_Paulo',
    businessDays: dto.businessDays ?? [1, 2, 3, 4, 5],
    shifts: dto.shifts,
    workdayStart:
      timeMode === SlaTimeMode.BUSINESS && !hasShifts
        ? dto.workdayStart ?? '08:00'
        : dto.workdayStart,
    workdayEnd:
      timeMode === SlaTimeMode.BUSINESS && !hasShifts
        ? dto.workdayEnd ?? '18:00'
        : dto.workdayEnd,
  };
}

function jsonBusinessDays(value: Prisma.JsonValue | null): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((day): day is number => typeof day === 'number');
}

function jsonShifts(
  value: Prisma.JsonValue | null,
): CreateSlaCalendarDto['shifts'] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value as unknown as CreateSlaCalendarDto['shifts'];
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function cleanOptional(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function dateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Data de feriado inválida.');
  }
  return date;
}

function pickCatalogIdentity(category: {
  id: string;
  code: string;
  name: string;
  requireChecklist: boolean;
}) {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    requireChecklist: category.requireChecklist,
  };
}
