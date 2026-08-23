import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AuditAction,
  BudgetItemKind,
  BudgetStage,
  BudgetStatus,
  ContractBudgetItemKind,
  ContractBudgetStatus,
  Prisma,
  WorkOrderStatus,
} from '../../generated/prisma/client';
import type { SinapiCatalog } from '../../generated/prisma/client';
import { resolveUploadRoot, sanitizeUploadOriginalName } from '../../common/files/upload-storage';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogFileSource, CatalogItemSearchQuery, ImportCatalogFileDto, ImportSinapiCatalogDto, SaveBudgetDto, TransitionBudgetDto } from './dto/budgets.dto';
import {
  ContractBudgetItemsQuery,
  ImportContractBudgetDto,
  UpdateContractBudgetDto,
  UpsertContractBudgetItemDto,
  UpsertContractLaborPostDto,
} from './dto/contract-budgets.dto';
import { parseContractBudgetFile } from './contract-budget-parser';
import { parseCustomWorkbook, parseOfficialSinapiWorkbook } from './xlsx-catalog-parser';

const TRANSITIONS: Record<BudgetStatus, BudgetStatus[]> = {
  DRAFT: [BudgetStatus.SUBMITTED, BudgetStatus.CANCELED],
  SUBMITTED: [BudgetStatus.APPROVED, BudgetStatus.REJECTED, BudgetStatus.CANCELED],
  REJECTED: [BudgetStatus.DRAFT, BudgetStatus.CANCELED],
  APPROVED: [], CANCELED: [],
};

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

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

  async searchCatalogItems(tenantId: string, id: string, query: CatalogItemSearchQuery) {
    const catalog = await this.prisma.sinapiCatalog.findFirst({ where: { id, tenantId, active: true } });
    if (!catalog) throw new NotFoundException('Catálogo SINAPI não encontrado.');
    if (query.minCost !== undefined && query.maxCost !== undefined && query.minCost > query.maxCost) {
      throw new BadRequestException('O custo mínimo não pode ser maior que o custo máximo.');
    }
    const catalogIds = await this.catalogFamilyIds(tenantId, catalog);
    const term = query.search?.trim();
    const where: Prisma.SinapiCatalogItemWhereInput = {
      tenantId,
      catalogId: { in: catalogIds },
      ...(term ? { OR: [{ code: { contains: term } }, { description: { contains: term } }] } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.unit?.trim() ? { unit: query.unit.trim().toUpperCase() } : {}),
      ...(query.minCost !== undefined || query.maxCost !== undefined ? {
        unitCost: {
          ...(query.minCost !== undefined ? { gte: query.minCost } : {}),
          ...(query.maxCost !== undefined ? { lte: query.maxCost } : {}),
        },
      } : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    let items;
    let total;
    if (term && typeof this.prisma.$queryRaw === 'function') {
      ({ items, total } = await this.searchCatalogTextSafely(
        tenantId, catalogIds, query, term, page, pageSize,
      ));
    } else {
      [items, total] = await Promise.all([
        this.prisma.sinapiCatalogItem.findMany({
          where,
          orderBy: [{ type: 'asc' }, { code: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.sinapiCatalogItem.count({ where }),
      ]);
    }
    const unitRows = await this.prisma.sinapiCatalogItem.findMany({
      where: { tenantId, catalogId: { in: catalogIds } },
      select: { unit: true },
      distinct: ['unit'],
      orderBy: { unit: 'asc' },
    });
    return {
      catalog,
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      facets: { units: unitRows.map((row) => row.unit) },
      scope: { catalogIds, includesInputsAndCompositions: catalogIds.length > 1 },
    };
  }

  async getCatalogItem(tenantId: string, catalogId: string, itemId: string) {
    const item = await this.prisma.sinapiCatalogItem.findFirst({
      where: { id: itemId, catalogId, tenantId },
      include: { catalog: true },
    });
    if (!item) throw new NotFoundException('Item do catálogo SINAPI não encontrado.');
    return item;
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

  async importWorkbook(tenantId: string, actorUserId: string, dto: ImportCatalogFileDto,
    file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Selecione uma planilha XLSX.');
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('O importador aceita somente arquivos .xlsx.');
    }
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const catalogs = dto.sourceType === CatalogFileSource.SINAPI
      ? await parseOfficialSinapiWorkbook(file.buffer, dto.state)
      : [await parseCustomWorkbook(file.buffer)];
    if (dto.sourceType === CatalogFileSource.CUSTOM && !dto.referenceMonth) {
      throw new BadRequestException('Informe a competência da tabela própria.');
    }
    if (dto.sourceType === CatalogFileSource.SINAPI && dto.referenceMonth) {
      const detectedMonths = [...new Set(catalogs.map((catalog) => catalog.referenceMonth))];
      if (detectedMonths.length !== 1 || detectedMonths[0] !== dto.referenceMonth) {
        throw new BadRequestException(
          `A competência informada (${dto.referenceMonth}) diverge da competência identificada no arquivo (${detectedMonths.join(', ')}).`,
        );
      }
    }
    const source = dto.sourceType === CatalogFileSource.SINAPI ? 'SINAPI' : 'PROPRIO';
    for (const parsed of catalogs) {
      const keys = parsed.items.map((item) => `${item.type}:${item.code}`);
      if (new Set(keys).size !== keys.length) {
        throw new BadRequestException(`A aba ${parsed.sheet} possui códigos duplicados para o mesmo tipo.`);
      }
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const result: Array<{ id: string; source: string; sheet: string; referenceMonth: string;
          state: string; priceRegime: string; catalogKind: string; itemCount: number; skipped: number; checksum: string }> = [];
        for (const parsed of catalogs) {
          const catalogVersion = dto.sourceType === CatalogFileSource.SINAPI
            ? `${dto.version.trim()}-${parsed.sheet}`
            : dto.version.trim();
          const catalog = await tx.sinapiCatalog.create({ data: {
            tenantId, importedByUserId: actorUserId,
            referenceMonth: parsed.referenceMonth || dto.referenceMonth!, state: dto.state.toUpperCase(),
            source, version: catalogVersion, checksum, itemCount: parsed.items.length,
            priceRegime: parsed.priceRegime, catalogKind: parsed.catalogKind,
          } });
          for (let index = 0; index < parsed.items.length; index += 500) {
            await tx.sinapiCatalogItem.createMany({ data: parsed.items.slice(index, index + 500).map((item) => ({
              tenantId, catalogId: catalog.id, type: item.type, code: item.code,
              description: item.description, unit: item.unit, unitCost: item.unitCost,
              compositionData: item.compositionData as Prisma.InputJsonValue | undefined,
            })) });
          }
          await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'SinapiCatalog', catalog.id, {
            source, sheet: parsed.sheet, referenceMonth: catalog.referenceMonth, state: catalog.state,
            priceRegime: parsed.priceRegime, catalogKind: parsed.catalogKind, checksum,
            itemCount: parsed.items.length, skipped: parsed.skipped,
          });
          result.push({ id: catalog.id, source, sheet: parsed.sheet, referenceMonth: catalog.referenceMonth,
            state: catalog.state, priceRegime: parsed.priceRegime, catalogKind: parsed.catalogKind,
            itemCount: parsed.items.length, skipped: parsed.skipped, checksum });
        }
        return { fileName: file.originalname, checksum, catalogs: result,
          totalItems: result.reduce((sum, item) => sum + item.itemCount, 0),
          totalSkipped: result.reduce((sum, item) => sum + item.skipped, 0) };
      }, { maxWait: 20_000, timeout: 180_000 });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta versão da tabela já foi importada para a UF e competência informadas.');
      }
      throw error;
    }
  }

  async getContractBudget(tenantId: string, contractId: string) {
    const contract = await this.contractSummary(tenantId, contractId);
    const budget = await this.prisma.contractBudget.findFirst({
      where: { tenantId, contractId, deletedAt: null },
      include: {
        laborPosts: {
          where: { deletedAt: null },
          orderBy: [{ code: 'asc' }, { createdAt: 'asc' }],
          include: { components: { orderBy: { sortOrder: 'asc' } } },
        },
        imports: {
          orderBy: { createdAt: 'desc' },
          include: {
            sheets: { orderBy: { orderIndex: 'asc' } },
            importedBy: { select: { id: true, name: true } },
          },
        },
        revisions: { orderBy: { version: 'desc' }, take: 20 },
        _count: { select: { items: true, laborPosts: true, imports: true, revisions: true } },
      },
    });
    return { contract, budget };
  }

  async searchContractBudgetItems(tenantId: string, contractId: string, query: ContractBudgetItemsQuery) {
    await this.contractSummary(tenantId, contractId);
    const budget = await this.prisma.contractBudget.findFirst({
      where: { tenantId, contractId, deletedAt: null },
      select: { id: true, title: true, status: true, version: true },
    });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    if (!budget) return { budget: null, items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } };
    const search = query.search?.trim();
    const where: Prisma.ContractBudgetItemWhereInput = {
      tenantId,
      budgetId: budget.id,
      deletedAt: null,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(search ? { OR: [{ code: { contains: search } }, { description: { contains: search } },
        { sectionName: { contains: search } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.contractBudgetItem.findMany({
        where,
        orderBy: [{ kind: 'asc' }, { sectionCode: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { catalogItem: { select: { id: true, catalogId: true, type: true } } },
      }),
      this.prisma.contractBudgetItem.count({ where }),
    ]);
    return { budget, items, pagination: { page, pageSize, total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async importContractBudget(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    dto: ImportContractBudgetDto,
    file?: Express.Multer.File,
  ) {
    const contract = await this.contractSummary(tenantId, contractId);
    if (!file?.buffer?.length) throw new BadRequestException('Selecione uma planilha XLSX/XLSB ou um PDF textual.');
    const originalName = sanitizeUploadOriginalName(file.originalname);
    const extension = originalName.toLowerCase().split('.').pop() ?? '';
    if (!['xlsx', 'xlsb', 'pdf'].includes(extension) || !this.hasContractBudgetSignature(file.buffer, extension)) {
      throw new BadRequestException('O arquivo deve ser uma planilha XLSX/XLSB ou um PDF válido.');
    }
    const parsed = await parseContractBudgetFile(file.buffer, originalName, file.mimetype);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const root = resolveUploadRoot(this.config?.get<string>('UPLOAD_ROOT'));
    const relativeDir = path.join(tenantId, 'contracts', contractId, 'budgets');
    const absoluteDir = this.resolveInsideRoot(root, relativeDir);
    await mkdir(absoluteDir, { recursive: true });
    const fileName = `${randomUUID()}.${extension}`;
    const storageKey = path.join(relativeDir, fileName).replaceAll(path.sep, '/');
    const absolutePath = path.join(absoluteDir, fileName);
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const previous = await tx.contractBudget.findFirst({ where: { tenantId, contractId, deletedAt: null } });
        const budget = await tx.contractBudget.upsert({
          where: { contractId },
          create: {
            tenantId,
            contractId,
            createdByUserId: actorUserId,
            version: 0,
            title: dto.title?.trim() || `Planilha orçamentária — ${contract.code}`,
            referenceMonth: dto.referenceMonth,
          },
          update: {
            deletedAt: null,
            title: dto.title?.trim() || undefined,
            referenceMonth: dto.referenceMonth || undefined,
          },
        });
        if (dto.replaceExisting !== false) {
          const deletedAt = new Date();
          await tx.contractBudgetItem.updateMany({ where: { tenantId, budgetId: budget.id, deletedAt: null }, data: { deletedAt } });
          await tx.contractLaborPost.updateMany({ where: { tenantId, budgetId: budget.id, deletedAt: null }, data: { deletedAt } });
        }
        const report = {
          warnings: parsed.warnings,
          sourceTotal: parsed.sourceTotal ?? null,
          sheets: parsed.sheets.length,
          items: parsed.items.length,
          laborPosts: parsed.laborPosts.length,
          replacedExisting: dto.replaceExisting !== false,
        };
        const imported = await tx.contractBudgetImport.create({ data: {
          tenantId,
          budgetId: budget.id,
          importedByUserId: actorUserId,
          format: parsed.format,
          originalName,
          storageKey,
          fileName,
          mimeType: file.mimetype || this.contractBudgetMime(extension),
          sizeBytes: BigInt(file.size),
          sha256,
          sheetCount: parsed.sheets.length,
          importedItemCount: parsed.items.length,
          laborPostCount: parsed.laborPosts.length,
          ignoredSheetCount: parsed.sheets.filter((sheet) => sheet.role === 'AUXILIARY').length,
          report: this.json(report),
          sheets: { create: parsed.sheets.map((sheet) => ({ tenantId, ...sheet })) },
        } });
        for (let index = 0; index < parsed.items.length; index += 500) {
          await tx.contractBudgetItem.createMany({ data: parsed.items.slice(index, index + 500).map((item) => ({
            tenantId,
            budgetId: budget.id,
            importId: imported.id,
            kind: item.kind,
            source: item.source,
            sectionCode: item.sectionCode,
            sectionName: item.sectionName,
            code: item.code.slice(0, 80),
            description: item.description,
            technicalReference: item.technicalReference,
            unit: item.unit.slice(0, 30),
            quantity: item.quantity,
            laborUnitCost: item.laborUnitCost,
            materialUnitCost: item.materialUnitCost,
            unitCost: item.unitCost,
            bdiPercentage: item.bdiPercentage,
            totalCost: item.totalCost,
            includedInTotal: item.includedInTotal,
            sourceSheet: item.sourceSheet,
            sourceRow: item.sourceRow,
            sourceData: item.sourceData ? this.json(item.sourceData) : undefined,
          })) });
        }
        for (const post of parsed.laborPosts) {
          await tx.contractLaborPost.create({ data: {
            tenantId,
            budgetId: budget.id,
            importId: imported.id,
            code: post.code,
            title: post.title,
            unit: post.unit,
            postQuantity: post.postQuantity,
            employeesPerPost: post.employeesPerPost,
            professionalQuantity: post.professionalQuantity,
            months: post.months,
            cbo: post.cbo,
            collectiveAgreement: post.collectiveAgreement,
            mteRegistration: post.mteRegistration,
            categoryBaseDate: post.categoryBaseDate,
            shift: post.shift,
            baseSalary: post.baseSalary,
            monthlyCostBeforeBdi: post.monthlyCostBeforeBdi,
            bdiAmount: post.bdiAmount,
            monthlyCost: post.monthlyCost,
            annualCost: post.annualCost,
            includedInTotal: post.includedInTotal,
            sourceSheet: post.sourceSheet,
            sourceData: post.sourceData ? this.json(post.sourceData) : undefined,
            components: { create: post.components.map((component) => ({
              tenantId,
              ...component,
              sourceData: component.sourceData ? this.json(component.sourceData) : undefined,
            })) },
          } });
        }
        const refreshed = await this.refreshContractBudget(tx, tenantId, actorUserId, budget.id,
          previous ? 'Nova importação da planilha orçamentária' : 'Importação inicial da planilha orçamentária',
          parsed.sourceTotal);
        await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'ContractBudgetImport', imported.id, {
          contractId,
          budgetId: budget.id,
          originalName,
          sha256,
          itemCount: parsed.items.length,
          laborPostCount: parsed.laborPosts.length,
          sheetCount: parsed.sheets.length,
        });
        return { contract, budget: refreshed, imported: { ...imported, sizeBytes: imported.sizeBytes.toString() }, report };
      }, { maxWait: 30_000, timeout: 240_000 });
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  async updateContractBudget(tenantId: string, actorUserId: string, contractId: string,
    dto: UpdateContractBudgetDto) {
    await this.contractSummary(tenantId, contractId);
    const budget = await this.ensureContractBudget(tenantId, actorUserId, contractId);
    return this.prisma.$transaction(async (tx) => {
      await tx.contractBudget.update({ where: { id: budget.id }, data: {
        title: dto.title?.trim(),
        referenceMonth: dto.referenceMonth,
        status: dto.status,
        notes: dto.notes?.trim(),
      } });
      return this.refreshContractBudget(tx, tenantId, actorUserId, budget.id, 'Atualização dos dados do orçamento contratual');
    });
  }

  async upsertContractBudgetItem(tenantId: string, actorUserId: string, contractId: string,
    itemId: string | undefined, dto: UpsertContractBudgetItemDto) {
    await this.contractSummary(tenantId, contractId);
    const budget = await this.ensureContractBudget(tenantId, actorUserId, contractId);
    const current = itemId ? await this.prisma.contractBudgetItem.findFirst({
      where: { id: itemId, tenantId, budgetId: budget.id, deletedAt: null },
    }) : null;
    if (itemId && !current) throw new NotFoundException('Item do orçamento contratual não encontrado.');
    const catalog = dto.catalogItemId ? await this.prisma.sinapiCatalogItem.findFirst({
      where: { id: dto.catalogItemId, tenantId, catalog: { active: true } },
    }) : null;
    if (dto.catalogItemId && !catalog) throw new BadRequestException('Item SINAPI inválido para a organização.');
    const quantity = new Prisma.Decimal(dto.quantity);
    const unitCost = catalog?.unitCost ?? new Prisma.Decimal(dto.unitCost);
    const bdiPercentage = new Prisma.Decimal(dto.bdiPercentage ?? 0);
    const totalCost = quantity.times(unitCost).times(new Prisma.Decimal(1).plus(bdiPercentage.dividedBy(100))).toDecimalPlaces(2);
    const data = {
      catalogItemId: catalog?.id ?? null,
      kind: catalog ? (catalog.type === 'INPUT' ? ContractBudgetItemKind.SINAPI_INPUT : ContractBudgetItemKind.SINAPI_COMPOSITION) : dto.kind,
      source: catalog ? 'SINAPI' : 'USER',
      sectionCode: dto.sectionCode?.trim(),
      sectionName: dto.sectionName?.trim(),
      code: (catalog?.code ?? dto.code.trim()).slice(0, 80),
      description: catalog?.description ?? dto.description.trim(),
      technicalReference: dto.technicalReference?.trim(),
      unit: (catalog?.unit ?? dto.unit.trim()).toUpperCase().slice(0, 30),
      quantity,
      laborUnitCost: new Prisma.Decimal(dto.laborUnitCost ?? 0),
      materialUnitCost: new Prisma.Decimal(dto.materialUnitCost ?? 0),
      unitCost,
      bdiPercentage,
      totalCost,
      includedInTotal: dto.includedInTotal ?? true,
      deletedAt: null,
    };
    return this.prisma.$transaction(async (tx) => {
      const item = current
        ? await tx.contractBudgetItem.update({ where: { id: current.id }, data })
        : await tx.contractBudgetItem.create({ data: { tenantId, budgetId: budget.id, ...data } });
      const refreshed = await this.refreshContractBudget(tx, tenantId, actorUserId, budget.id,
        current ? 'Edição de item do orçamento contratual' : 'Inclusão de item no orçamento contratual');
      await this.audit(tx, tenantId, actorUserId, current ? AuditAction.UPDATE : AuditAction.CREATE,
        'ContractBudgetItem', item.id, { contractId, budgetId: budget.id, code: item.code, totalCost: item.totalCost.toString() });
      return { item, budget: refreshed };
    });
  }

  async archiveContractBudgetItem(tenantId: string, actorUserId: string, contractId: string, itemId: string) {
    await this.contractSummary(tenantId, contractId);
    const budget = await this.prisma.contractBudget.findFirst({ where: { tenantId, contractId, deletedAt: null } });
    if (!budget) throw new NotFoundException('Orçamento contratual não encontrado.');
    const current = await this.prisma.contractBudgetItem.findFirst({ where: { id: itemId, tenantId, budgetId: budget.id, deletedAt: null } });
    if (!current) throw new NotFoundException('Item do orçamento contratual não encontrado.');
    return this.prisma.$transaction(async (tx) => {
      await tx.contractBudgetItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
      const refreshed = await this.refreshContractBudget(tx, tenantId, actorUserId, budget.id, 'Exclusão de item do orçamento contratual');
      await this.audit(tx, tenantId, actorUserId, AuditAction.DELETE, 'ContractBudgetItem', itemId,
        { contractId, budgetId: budget.id, archived: true });
      return { id: itemId, archived: true, budget: refreshed };
    });
  }

  async upsertContractLaborPost(tenantId: string, actorUserId: string, contractId: string,
    postId: string | undefined, dto: UpsertContractLaborPostDto) {
    await this.contractSummary(tenantId, contractId);
    const budget = await this.ensureContractBudget(tenantId, actorUserId, contractId);
    const current = postId ? await this.prisma.contractLaborPost.findFirst({
      where: { id: postId, tenantId, budgetId: budget.id, deletedAt: null },
    }) : null;
    if (postId && !current) throw new NotFoundException('Posto de trabalho não encontrado.');
    const professionalQuantity = new Prisma.Decimal(dto.professionalQuantity ?? dto.postQuantity * dto.employeesPerPost);
    const monthlyCost = new Prisma.Decimal(dto.monthlyCost);
    const annualCost = dto.annualCost !== undefined
      ? new Prisma.Decimal(dto.annualCost)
      : monthlyCost.times(professionalQuantity).times(dto.months).toDecimalPlaces(2);
    const data = {
      code: dto.code.trim().toUpperCase(),
      title: dto.title.trim(),
      unit: dto.unit?.trim().toUpperCase() || 'POSTO',
      postQuantity: dto.postQuantity,
      employeesPerPost: dto.employeesPerPost,
      professionalQuantity,
      months: dto.months,
      cbo: dto.cbo?.trim(),
      collectiveAgreement: dto.collectiveAgreement?.trim(),
      mteRegistration: dto.mteRegistration?.trim(),
      categoryBaseDate: dto.categoryBaseDate?.trim(),
      shift: dto.shift?.trim(),
      baseSalary: dto.baseSalary,
      monthlyCostBeforeBdi: dto.monthlyCostBeforeBdi,
      bdiAmount: dto.bdiAmount ?? 0,
      monthlyCost,
      annualCost,
      includedInTotal: dto.includedInTotal ?? true,
      deletedAt: null,
    };
    return this.prisma.$transaction(async (tx) => {
      let post;
      if (current) {
        if (dto.components !== undefined) {
          await tx.contractLaborCostComponent.deleteMany({ where: { laborPostId: current.id } });
        }
        post = await tx.contractLaborPost.update({ where: { id: current.id }, data: {
          ...data,
          components: dto.components?.length ? { create: dto.components.map((component, index) => ({
            tenantId,
            ...component,
            sortOrder: index,
          })) } : undefined,
        }, include: { components: { orderBy: { sortOrder: 'asc' } } } });
      } else {
        post = await tx.contractLaborPost.create({ data: {
          tenantId,
          budgetId: budget.id,
          ...data,
          components: dto.components?.length ? { create: dto.components.map((component, index) => ({
            tenantId,
            ...component,
            sortOrder: index,
          })) } : undefined,
        }, include: { components: { orderBy: { sortOrder: 'asc' } } } });
      }
      const refreshed = await this.refreshContractBudget(tx, tenantId, actorUserId, budget.id,
        current ? 'Edição de posto de trabalho' : 'Inclusão de posto de trabalho');
      await this.audit(tx, tenantId, actorUserId, current ? AuditAction.UPDATE : AuditAction.CREATE,
        'ContractLaborPost', post.id, { contractId, budgetId: budget.id, code: post.code, annualCost: post.annualCost.toString() });
      return { post, budget: refreshed };
    });
  }

  async archiveContractLaborPost(tenantId: string, actorUserId: string, contractId: string, postId: string) {
    await this.contractSummary(tenantId, contractId);
    const budget = await this.prisma.contractBudget.findFirst({ where: { tenantId, contractId, deletedAt: null } });
    if (!budget) throw new NotFoundException('Orçamento contratual não encontrado.');
    const current = await this.prisma.contractLaborPost.findFirst({ where: { id: postId, tenantId, budgetId: budget.id, deletedAt: null } });
    if (!current) throw new NotFoundException('Posto de trabalho não encontrado.');
    return this.prisma.$transaction(async (tx) => {
      await tx.contractLaborPost.update({ where: { id: postId }, data: { deletedAt: new Date() } });
      const refreshed = await this.refreshContractBudget(tx, tenantId, actorUserId, budget.id, 'Exclusão de posto de trabalho');
      await this.audit(tx, tenantId, actorUserId, AuditAction.DELETE, 'ContractLaborPost', postId,
        { contractId, budgetId: budget.id, archived: true });
      return { id: postId, archived: true, budget: refreshed };
    });
  }

  async resolveContractBudgetImportDownload(tenantId: string, actorUserId: string,
    contractId: string, importId: string) {
    await this.contractSummary(tenantId, contractId);
    const imported = await this.prisma.contractBudgetImport.findFirst({
      where: { id: importId, tenantId, budget: { contractId, deletedAt: null } },
    });
    if (!imported) throw new NotFoundException('Arquivo-fonte do orçamento não encontrado.');
    const root = resolveUploadRoot(this.config?.get<string>('UPLOAD_ROOT'));
    const absolutePath = this.resolveInsideRoot(root, imported.storageKey);
    try { await access(absolutePath); } catch { throw new NotFoundException('Arquivo físico não localizado.'); }
    await this.prisma.auditLog.create({ data: {
      tenantId,
      actorUserId,
      action: AuditAction.DOWNLOAD,
      entityType: 'ContractBudgetImport',
      entityId: imported.id,
      afterData: { contractId, originalName: imported.originalName },
    } });
    return { imported, absolutePath };
  }

  async searchWorkOrderContractItems(tenantId: string, workOrderId: string, query: ContractBudgetItemsQuery) {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId, deletedAt: null },
      select: { id: true, number: true, title: true },
    });
    if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
    const links = await this.prisma.workOrderContract.findMany({
      where: { workOrderId, contract: { tenantId, deletedAt: null } },
      select: { isPrimary: true, contract: { select: { id: true, code: true, object: true } } },
      orderBy: { isPrimary: 'desc' },
    });
    const contractIds = links.map((link) => link.contract.id);
    const budgets = contractIds.length ? await this.prisma.contractBudget.findMany({
      where: { tenantId, contractId: { in: contractIds }, deletedAt: null, status: { not: ContractBudgetStatus.ARCHIVED } },
      select: { id: true },
    }) : [];
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const search = query.search?.trim();
    const where: Prisma.ContractBudgetItemWhereInput = {
      tenantId,
      budgetId: { in: budgets.map((budget) => budget.id) },
      deletedAt: null,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(search ? { OR: [{ code: { contains: search } }, { description: { contains: search } },
        { sectionName: { contains: search } }] } : {}),
    };
    const [items, total] = budgets.length ? await Promise.all([
      this.prisma.contractBudgetItem.findMany({
        where,
        orderBy: [{ kind: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { budget: { select: { id: true, title: true, contract: { select: { id: true, code: true } } } } },
      }),
      this.prisma.contractBudgetItem.count({ where }),
    ]) : [[], 0];
    return {
      workOrder,
      contracts: links,
      items,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  listBudgets(tenantId: string) {
    return this.prisma.workOrderBudget.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' },
      include: { workOrder: { select: { id: true, number: true, title: true, status: true } },
        catalog: { select: { id: true, referenceMonth: true, state: true, version: true } }, _count: { select: { items: true, revisions: true } } } });
  }

  async getBudget(tenantId: string, workOrderId: string, stage: BudgetStage = BudgetStage.PLANNED) {
    const budget = await this.prisma.workOrderBudget.findFirst({ where: { tenantId, workOrderId, stage },
      include: { workOrder: true, catalog: true, items: { include: { catalogItem: true } },
        revisions: { orderBy: { version: 'desc' } }, submittedBy: { select: { name: true } }, approvedBy: { select: { name: true } } } });
    if (!budget) throw new NotFoundException('Orçamento não encontrado para esta OS.');
    return budget;
  }

  async getBudgetStages(tenantId: string, workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId, deletedAt: null },
      select: { id: true, number: true, title: true },
    });
    if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
    const budgets = await this.prisma.workOrderBudget.findMany({
      where: { tenantId, workOrderId },
      orderBy: { stage: 'asc' },
      include: { items: true, catalog: true, revisions: { orderBy: { version: 'desc' } } },
    });
    return { workOrder, budgets };
  }

  async saveBudget(tenantId: string, actorUserId: string, workOrderId: string, dto: SaveBudgetDto,
    stage: BudgetStage = BudgetStage.PLANNED) {
    const current = await this.prisma.workOrderBudget.findFirst({ where: { tenantId, workOrderId, stage } });
    if (current && current.status !== BudgetStatus.DRAFT && current.status !== BudgetStatus.REJECTED) {
      throw new BadRequestException('Somente orçamentos em rascunho ou rejeitados podem ser editados.');
    }
    const [workOrder, selectedCatalog] = await Promise.all([
      this.prisma.workOrder.findFirst({
        where: { id: workOrderId, tenantId, deletedAt: null },
        include: { contracts: { select: { contractId: true } } },
      }),
      dto.catalogId ? this.prisma.sinapiCatalog.findFirst({ where: { id: dto.catalogId, tenantId, active: true } }) : null,
    ]);
    if (!workOrder) throw new NotFoundException('Ordem de serviço não encontrada.');
    if (dto.catalogId && !selectedCatalog) throw new BadRequestException('Catálogo SINAPI inválido para a organização.');
    const allowedCatalogIds = selectedCatalog ? await this.catalogFamilyIds(tenantId, selectedCatalog) : undefined;
    const contractIds = workOrder.contracts.map((link) => link.contractId);
    const [catalogItems, contractItems] = await Promise.all([
      this.prisma.sinapiCatalogItem.findMany({ where: { tenantId,
        id: { in: dto.items.map((item) => item.catalogItemId).filter((id): id is string => Boolean(id)) },
        ...(allowedCatalogIds ? { catalogId: { in: allowedCatalogIds } } : {}) } }),
      this.prisma.contractBudgetItem.findMany({ where: {
        tenantId,
        id: { in: dto.items.map((item) => item.contractBudgetItemId).filter((id): id is string => Boolean(id)) },
        deletedAt: null,
        budget: { contractId: { in: contractIds }, deletedAt: null, status: { not: ContractBudgetStatus.ARCHIVED } },
      }, include: { budget: { select: { id: true, contractId: true, version: true } } } }),
    ]);
    const finalBudgetStatuses = new Set<WorkOrderStatus>([
      WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.WAITING_APPROVAL,
      WorkOrderStatus.COMPLETED, WorkOrderStatus.CLOSED,
    ]);
    if (stage === BudgetStage.FINAL_EXECUTED && !finalBudgetStatuses.has(workOrder.status)) {
      throw new BadRequestException('O orçamento final executado só pode ser registrado após o início da execução.');
    }
    const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
    const contractItemById = new Map(contractItems.map((item) => [item.id, item]));
    const items = dto.items.map((item) => {
      if (item.catalogItemId && item.contractBudgetItemId) {
        throw new BadRequestException('Cada item deve ter apenas uma fonte de preços.');
      }
      const catalog = item.catalogItemId ? catalogById.get(item.catalogItemId) : undefined;
      const contractItem = item.contractBudgetItemId ? contractItemById.get(item.contractBudgetItemId) : undefined;
      if (item.catalogItemId && !catalog) throw new BadRequestException('Item não pertence à base SINAPI e ao regime selecionados.');
      if (item.contractBudgetItemId && !contractItem) {
        throw new BadRequestException('Item não pertence à planilha orçamentária dos contratos vinculados à OS.');
      }
      if (!catalog && !contractItem && (!item.code || !item.description || !item.unit || item.unitCost === undefined)) {
        throw new BadRequestException('Item livre exige código, descrição, unidade e custo unitário.');
      }
      const quantity = new Prisma.Decimal(item.quantity);
      const unitCost = catalog?.unitCost ?? contractItem?.unitCost ?? new Prisma.Decimal(item.unitCost!);
      return { catalogItemId: catalog?.id, contractBudgetItemId: contractItem?.id,
        kind: contractItem ? this.contractKind(contractItem.kind) : (item.kind ?? this.kind(catalog?.type)),
        source: catalog ? 'SINAPI' : contractItem ? 'CONTRATO' : 'PROPRIO',
        code: (catalog?.code ?? contractItem?.code ?? item.code!.trim().toUpperCase()).slice(0, 40),
        description: catalog?.description ?? contractItem?.description ?? item.description!.trim(),
        unit: catalog?.unit ?? contractItem?.unit ?? item.unit!.trim().toUpperCase(),
        quantity, unitCost, totalCost: quantity.times(unitCost).toDecimalPlaces(2),
        sourceData: catalog ? { catalogId: catalog.catalogId, referenceUnitCost: catalog.unitCost.toString() }
          : contractItem ? { contractId: contractItem.budget.contractId, contractBudgetId: contractItem.budgetId,
            contractBudgetVersion: contractItem.budget.version, referenceUnitCost: contractItem.unitCost.toString() }
          : undefined };
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
        budget = await tx.workOrderBudget.create({ data: { tenantId, workOrderId, stage,
          catalogId: dto.catalogId, referenceMonth: dto.referenceMonth, state: dto.state?.toUpperCase(),
          subtotal, bdiPercentage: bdi, total, notes: dto.notes,
          items: { create: items.map((item) => ({ ...item, tenantId })) },
        }, include: { items: true, workOrder: true } });
      }
      await this.revision(tx, budget, actorUserId, current ? 'Edição do orçamento' : 'Criação do orçamento');
      await this.audit(tx, tenantId, actorUserId, current ? AuditAction.UPDATE : AuditAction.CREATE,
        'WorkOrderBudget', budget.id, { stage, version: budget.version, total: budget.total.toString() });
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
        const costData = current.stage === BudgetStage.PLANNED ? { estimatedCost: current.total }
          : current.stage === BudgetStage.APPROVED ? { approvedCost: current.total }
          : { finalCost: current.total };
        await tx.workOrder.update({ where: { id: current.workOrderId }, data: costData });
      }
      await this.revision(tx, updated, actorUserId, dto.note ?? `Transição para ${dto.status}`);
      await this.audit(tx, tenantId, actorUserId, AuditAction.STATUS_CHANGE, 'WorkOrderBudget', id,
        { stage: current.stage, from: current.status, to: dto.status, version: updated.version });
      return updated;
    });
  }

  private async contractSummary(tenantId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        object: true,
        exclusiveLaborDedication: true,
        originalValue: true,
        currentValue: true,
        supplier: { select: { id: true, legalName: true, tradeName: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contrato não encontrado.');
    return contract;
  }

  private async ensureContractBudget(tenantId: string, actorUserId: string, contractId: string) {
    return this.prisma.contractBudget.upsert({
      where: { contractId },
      create: {
        tenantId,
        contractId,
        createdByUserId: actorUserId,
        version: 0,
        title: 'Planilha orçamentária do contrato',
      },
      update: { deletedAt: null },
    });
  }

  private async refreshContractBudget(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    budgetId: string,
    reason: string,
    sourceTotal?: number,
  ) {
    const [items, laborPosts] = await Promise.all([
      tx.contractBudgetItem.findMany({ where: { tenantId, budgetId, deletedAt: null, includedInTotal: true } }),
      tx.contractLaborPost.findMany({ where: { tenantId, budgetId, deletedAt: null, includedInTotal: true } }),
    ]);
    let subtotal = new Prisma.Decimal(0);
    let bdiAmount = new Prisma.Decimal(0);
    for (const item of items) {
      const lineTotal = item.totalCost;
      if (item.bdiPercentage.greaterThan(0)) {
        const base = item.quantity.times(item.unitCost).toDecimalPlaces(2);
        subtotal = subtotal.plus(base);
        const lineBdi = lineTotal.minus(base);
        if (lineBdi.greaterThan(0)) bdiAmount = bdiAmount.plus(lineBdi);
      } else {
        subtotal = subtotal.plus(lineTotal);
      }
    }
    for (const post of laborPosts) {
      const calculatedBase = post.monthlyCostBeforeBdi.times(post.professionalQuantity).times(post.months).toDecimalPlaces(2);
      const calculatedBdi = post.bdiAmount.times(post.professionalQuantity).times(post.months).toDecimalPlaces(2);
      const base = calculatedBase.greaterThan(0) && calculatedBase.lessThanOrEqualTo(post.annualCost)
        ? calculatedBase
        : Prisma.Decimal.max(new Prisma.Decimal(0), post.annualCost.minus(calculatedBdi));
      subtotal = subtotal.plus(base);
      const difference = post.annualCost.minus(base);
      if (difference.greaterThan(0)) bdiAmount = bdiAmount.plus(difference);
    }
    subtotal = subtotal.toDecimalPlaces(2);
    bdiAmount = bdiAmount.toDecimalPlaces(2);
    const total = subtotal.plus(bdiAmount).toDecimalPlaces(2);
    const updated = await tx.contractBudget.update({
      where: { id: budgetId },
      data: {
        subtotal,
        bdiAmount,
        total,
        version: { increment: 1 },
        ...(sourceTotal !== undefined ? { sourceTotal } : {}),
      },
    });
    await tx.contractBudgetRevision.create({ data: {
      tenantId,
      budgetId,
      createdByUserId: actorUserId,
      version: updated.version,
      subtotal,
      bdiAmount,
      total,
      reason,
      snapshot: {
        itemCount: items.length,
        laborPostCount: laborPosts.length,
        itemKinds: items.reduce<Record<string, number>>((counts, item) => {
          counts[item.kind] = (counts[item.kind] ?? 0) + 1;
          return counts;
        }, {}),
        subtotal: subtotal.toString(),
        bdiAmount: bdiAmount.toString(),
        total: total.toString(),
        sourceTotal: updated.sourceTotal?.toString() ?? null,
      },
    } });
    await this.audit(tx, tenantId, actorUserId, AuditAction.UPDATE, 'ContractBudget', budgetId, {
      reason,
      version: updated.version,
      subtotal: subtotal.toString(),
      bdiAmount: bdiAmount.toString(),
      total: total.toString(),
    });
    return updated;
  }

  private hasContractBudgetSignature(buffer: Buffer, extension: string) {
    if (extension === 'pdf') return buffer.subarray(0, 4).toString('ascii') === '%PDF';
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }

  private contractBudgetMime(extension: string) {
    if (extension === 'pdf') return 'application/pdf';
    if (extension === 'xlsb') return 'application/vnd.ms-excel.sheet.binary.macroEnabled.12';
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  private resolveInsideRoot(root: string, relativePath: string) {
    const normalizedRoot = path.resolve(root);
    const candidate = path.resolve(normalizedRoot, relativePath);
    if (candidate !== normalizedRoot && !candidate.startsWith(`${normalizedRoot}${path.sep}`)) {
      throw new BadRequestException('Caminho de armazenamento inválido.');
    }
    return candidate;
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private kind(type?: string): BudgetItemKind {
    if (type === 'INPUT') return BudgetItemKind.INPUT;
    if (type === 'COMPOSITION') return BudgetItemKind.COMPOSITION;
    return BudgetItemKind.SERVICE;
  }

  private contractKind(kind: ContractBudgetItemKind): BudgetItemKind {
    if (kind === ContractBudgetItemKind.MATERIAL || kind === ContractBudgetItemKind.SINAPI_INPUT) {
      return BudgetItemKind.INPUT;
    }
    if (kind === ContractBudgetItemKind.SINAPI_COMPOSITION) return BudgetItemKind.COMPOSITION;
    return BudgetItemKind.SERVICE;
  }

  private async searchCatalogTextSafely(
    tenantId: string,
    catalogIds: string[],
    query: CatalogItemSearchQuery,
    term: string,
    page: number,
    pageSize: number,
  ) {
    const pattern = `%${term.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
    const conditions: Prisma.Sql[] = [
      Prisma.sql`tenantId = ${tenantId}`,
      Prisma.sql`catalogId IN (${Prisma.join(catalogIds)})`,
      Prisma.sql`(code COLLATE utf8mb4_unicode_ci LIKE ${pattern} OR description COLLATE utf8mb4_unicode_ci LIKE ${pattern})`,
    ];
    if (query.type) conditions.push(Prisma.sql`type = ${query.type}`);
    if (query.unit?.trim()) conditions.push(Prisma.sql`unit = ${query.unit.trim().toUpperCase()}`);
    if (query.minCost !== undefined) conditions.push(Prisma.sql`unitCost >= ${query.minCost}`);
    if (query.maxCost !== undefined) conditions.push(Prisma.sql`unitCost <= ${query.maxCost}`);
    const where = Prisma.join(conditions, ' AND ');
    const offset = (page - 1) * pageSize;
    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM SinapiCatalogItem
        WHERE ${where}
        ORDER BY type ASC, code ASC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint | number | string }>>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM SinapiCatalogItem
        WHERE ${where}
      `),
    ]);
    const byId = idRows.length
      ? await this.prisma.sinapiCatalogItem.findMany({ where: { tenantId, id: { in: idRows.map((row) => row.id) } } })
      : [];
    const index = new Map(idRows.map((row, position) => [row.id, position]));
    byId.sort((left, right) => (index.get(left.id) ?? 0) - (index.get(right.id) ?? 0));
    return { items: byId, total: Number(countRows[0]?.total ?? 0) };
  }

  private async catalogFamilyIds(tenantId: string, catalog: SinapiCatalog) {
    if (catalog.source !== 'SINAPI') return [catalog.id];
    const versionRoot = catalog.version.replace(/-(ISD|ICD|CSD|CCD)$/i, '');
    const family = await this.prisma.sinapiCatalog.findMany({
      where: {
        tenantId,
        active: true,
        source: catalog.source,
        state: catalog.state,
        referenceMonth: catalog.referenceMonth,
        priceRegime: catalog.priceRegime,
        version: { in: ['ISD', 'ICD', 'CSD', 'CCD'].map((suffix) => `${versionRoot}-${suffix}`) },
      },
      select: { id: true },
    });
    return family.length ? family.map((item) => item.id) : [catalog.id];
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
