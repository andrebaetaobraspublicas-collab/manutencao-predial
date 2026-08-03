import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import {
  AttachmentKind, AuditAction, BudgetStage, BudgetStatus, KpiAdjustmentStatus,
  KpiAdjustmentType, KpiAggregation, KpiAlertSeverity, KpiAlertType, KpiCategory,
  KpiDirection, KpiFinancialRole, KpiPeriodicity, MeasurementStatus, Prisma,
  WorkOrderOrigin, WorkOrderPriority, WorkOrderStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BindContractKpiDto, CalculateKpisDto, ContractPerformanceDto, CreateKpiDataPointDto,
  CreateKpiDefinitionDto, KpiAlertsQuery, KpiDefinitionsQuery, KpiTrendQuery,
  UpdateContractKpiDto, UpdateKpiDefinitionDto,
} from './dto/kpis.dto';
import { KPI_LIBRARY, KPI_LIBRARY_VERSION } from './kpi-library';
import { cappedAdjustment, findPerformanceBand, performanceRating, weightedPerformanceIndex } from './kpi-rules';

const CLOSED = [WorkOrderStatus.COMPLETED, WorkOrderStatus.CLOSED];
const OPEN = [WorkOrderStatus.OPEN, WorkOrderStatus.TRIAGED, WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.PENDING, WorkOrderStatus.WAITING_APPROVAL];

type Scope = CalculateKpisDto;
type Computed = { value: Prisma.Decimal; details: Prisma.InputJsonValue; hasData: boolean };

function periodForMonth(referenceMonth: string) {
  const start = new Date(`${referenceMonth}-01T00:00:00.000Z`);
  return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

@Injectable()
export class KpisService {
  constructor(private readonly prisma: PrismaService) {}

  async definitions(tenantId: string, query: KpiDefinitionsQuery = {}) {
    if (!await this.prisma.kpiDefinition.count({ where: { tenantId, systemProvided: true, deletedAt: null } })) {
      await this.ensureDefaults(tenantId);
    }
    return this.prisma.kpiDefinition.findMany({
      where: { tenantId, deletedAt: null, ...(query.category ? { category: query.category } : {}),
        ...(query.active === undefined ? {} : { active: query.active }),
        ...(query.search ? { OR: [{ code: { contains: query.search } }, { name: { contains: query.search } }] } : {}) },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { contractBindings: true, measurements: true } } },
    });
  }

  async ensureDefaults(tenantId: string, actorUserId?: string) {
    const definitions = [];
    for (const item of KPI_LIBRARY) {
      definitions.push(await this.prisma.kpiDefinition.upsert({
        where: { tenantId_code: { tenantId, code: item.code } },
        create: { tenantId, ...item, source: KPI_LIBRARY_VERSION, systemProvided: true },
        update: { ...item, source: KPI_LIBRARY_VERSION, systemProvided: true, deletedAt: null },
      }));
    }
    definitions.push(await this.prisma.kpiDefinition.upsert({
      where: { tenantId_code: { tenantId, code: 'GLOBAL_PERFORMANCE_INDEX' } },
      create: { tenantId, code: 'GLOBAL_PERFORMANCE_INDEX', name: 'Índice Global de Desempenho (IGD)',
        description: 'Soma ponderada dos escores dos KPIs vinculados ao contrato.', category: KpiCategory.CONTRACTUAL,
        unit: 'pontos', direction: KpiDirection.HIGHER_IS_BETTER, periodicity: KpiPeriodicity.MONTHLY,
        aggregation: KpiAggregation.AVERAGE, calculationMethod: 'WEIGHTED_IGD', systemProvided: true,
        source: KPI_LIBRARY_VERSION, formula: 'IGD = Σ(escore normalizado × peso) ÷ Σ(pesos)',
        formulaExample: 'Exemplo: (95×20 + 80×10) ÷ 30 = 90 pontos.', objective: 'Sintetizar o desempenho contratual.',
        dataSource: 'KPIs vinculados ao contrato', acceptableRange: '85 a 100 pontos', responsibleRole: 'Gestor do contrato',
        targetValue: 85, warningValue: 70, criticalValue: 50 },
      update: { source: KPI_LIBRARY_VERSION, systemProvided: true, deletedAt: null },
    }));
    if (actorUserId) await this.audit(this.prisma, tenantId, actorUserId, AuditAction.UPDATE, 'KpiLibrary', tenantId,
      { version: KPI_LIBRARY_VERSION, synchronized: definitions.length });
    return definitions;
  }

  async createDefinition(tenantId: string, actorUserId: string, dto: CreateKpiDefinitionDto) {
    try {
      const { formulaConfig, ...fields } = dto;
      const item = await this.prisma.kpiDefinition.create({ data: { tenantId, ...fields,
        code: dto.code.trim().toUpperCase(), source: 'CUSTOM', systemProvided: false,
        periodicity: dto.periodicity ?? KpiPeriodicity.MONTHLY,
        aggregation: dto.aggregation ?? KpiAggregation.AVERAGE,
        calculationMethod: dto.calculationMethod ?? 'DATA_POINT_AVERAGE',
        formulaConfig: formulaConfig as Prisma.InputJsonValue | undefined } });
      await this.audit(this.prisma, tenantId, actorUserId, AuditAction.CREATE, 'KpiDefinition', item.id,
        { code: item.code, version: item.version });
      return item;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe um indicador com este código.');
      }
      throw error;
    }
  }

  async updateDefinition(tenantId: string, actorUserId: string, id: string, dto: UpdateKpiDefinitionDto) {
    const current = await this.prisma.kpiDefinition.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!current) throw new NotFoundException('Indicador não encontrado.');
    if (current.systemProvided && Object.keys(dto).some((key) => !['active'].includes(key))) {
      throw new BadRequestException('A memória do indicador de sistema é versionada; personalize-o em um novo indicador.');
    }
    const { formulaConfig, ...fields } = dto;
    const updated = await this.prisma.kpiDefinition.update({ where: { id }, data: {
      ...fields, code: dto.code?.trim().toUpperCase(), version: { increment: 1 },
      formulaConfig: formulaConfig as Prisma.InputJsonValue | undefined,
    } });
    await this.audit(this.prisma, tenantId, actorUserId, AuditAction.UPDATE, 'KpiDefinition', id,
      { beforeVersion: current.version, afterVersion: updated.version });
    return updated;
  }

  async contractConfigurations(tenantId: string, contractId: string) {
    await this.requireContract(tenantId, contractId);
    return this.prisma.contractKpi.findMany({ where: { tenantId, contractId, deletedAt: null },
      include: { definition: true, bands: { where: { active: true, deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ active: 'desc' }, { definition: { name: 'asc' } }] });
  }

  async bindContract(tenantId: string, actorUserId: string, contractId: string, dto: BindContractKpiDto) {
    const [contract, definition, existing] = await Promise.all([
      this.requireContract(tenantId, contractId),
      this.prisma.kpiDefinition.findFirst({ where: { id: dto.definitionId, tenantId, active: true, deletedAt: null } }),
      this.prisma.contractKpi.findUnique({ where: { contractId_definitionId: { contractId, definitionId: dto.definitionId } } }),
    ]);
    if (!definition) throw new BadRequestException('Indicador inválido para a organização.');
    this.validateBands(dto.bands);
    const otherWeights = await this.prisma.contractKpi.aggregate({ where: { tenantId, contractId, active: true,
      deletedAt: null, ...(existing ? { id: { not: existing.id } } : {}) }, _sum: { weight: true } });
    if ((otherWeights._sum.weight?.toNumber() ?? 0) + dto.weight > 100.0001) {
      throw new BadRequestException('A soma dos pesos ativos do contrato não pode superar 100%.');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const binding = await tx.contractKpi.upsert({ where: { contractId_definitionId: { contractId, definitionId: dto.definitionId } },
        create: { tenantId, contractId, ...this.bindingData(dto) },
        update: { ...this.bindingData(dto), active: true, deletedAt: null } });
      const ratings = dto.bands.map((band) => band.rating.trim().toUpperCase());
      await tx.kpiPerformanceBand.updateMany({ where: { tenantId, contractKpiId: binding.id, rating: { notIn: ratings }, active: true },
        data: { active: false, deletedAt: new Date() } });
      for (const [index, band] of dto.bands.entries()) await tx.kpiPerformanceBand.upsert({
        where: { contractKpiId_rating: { contractKpiId: binding.id, rating: ratings[index] } },
        create: { tenantId, contractKpiId: binding.id, ...band, rating: ratings[index], sortOrder: band.sortOrder ?? index },
        update: { ...band, rating: ratings[index], sortOrder: band.sortOrder ?? index, active: true, deletedAt: null },
      });
      await this.audit(tx, tenantId, actorUserId, existing ? AuditAction.UPDATE : AuditAction.CREATE,
        'ContractKpi', binding.id, { contractCode: contract.code, definitionCode: definition.code, weight: dto.weight });
      return tx.contractKpi.findUnique({ where: { id: binding.id }, include: { definition: true,
        bands: { where: { active: true, deletedAt: null }, orderBy: { sortOrder: 'asc' } } } });
    });
    return result;
  }

  async updateContractBinding(tenantId: string, actorUserId: string, id: string, dto: UpdateContractKpiDto) {
    const current = await this.prisma.contractKpi.findFirst({ where: { id, tenantId, deletedAt: null },
      include: { bands: { where: { active: true, deletedAt: null } } } });
    if (!current) throw new NotFoundException('Configuração contratual do KPI não encontrada.');
    return this.bindContract(tenantId, actorUserId, current.contractId, {
      definitionId: current.definitionId,
      targetValue: dto.targetValue ?? current.targetValue?.toNumber(),
      warningValue: dto.warningValue ?? current.warningValue?.toNumber(),
      criticalValue: dto.criticalValue ?? current.criticalValue?.toNumber(),
      weight: dto.weight ?? current.weight.toNumber(), financialRole: dto.financialRole ?? current.financialRole,
      deductionCapPercent: dto.deductionCapPercent ?? current.deductionCapPercent?.toNumber(),
      bonusCapPercent: dto.bonusCapPercent ?? current.bonusCapPercent?.toNumber(),
      roundingScale: dto.roundingScale ?? current.roundingScale,
      actionPlanTrigger: dto.actionPlanTrigger ?? current.actionPlanTrigger,
      bands: dto.bands ?? current.bands.map((band) => ({ label: band.label, rating: band.rating,
        minValue: band.minValue?.toNumber(), maxValue: band.maxValue?.toNumber(), score: band.score.toNumber(),
        adjustmentType: band.adjustmentType, adjustmentPercent: band.adjustmentPercent?.toNumber(),
        fixedAmount: band.fixedAmount?.toNumber(), triggerActionPlan: band.triggerActionPlan, sortOrder: band.sortOrder })),
    });
  }

  async createDataPoint(tenantId: string, actorUserId: string, dto: CreateKpiDataPointDto) {
    const definition = await this.prisma.kpiDefinition.findFirst({ where: { id: dto.definitionId, tenantId, active: true, deletedAt: null } });
    if (!definition) throw new BadRequestException('Indicador inválido para a organização.');
    await this.validateDimensions(tenantId, dto);
    const { dimensions, ...fields } = dto;
    const data: Prisma.KpiDataPointUncheckedCreateInput = { tenantId, ...fields, occurredAt: new Date(dto.occurredAt),
      source: dto.source ?? 'USER_INPUT', dimensions: dimensions as Prisma.InputJsonValue | undefined };
    const item = dto.sourceReference
      ? await this.prisma.kpiDataPoint.upsert({ where: { tenantId_definitionId_sourceReference: {
        tenantId, definitionId: dto.definitionId, sourceReference: dto.sourceReference } }, create: data, update: data })
      : await this.prisma.kpiDataPoint.create({ data });
    await this.audit(this.prisma, tenantId, actorUserId, AuditAction.CREATE, 'KpiDataPoint', item.id,
      { definitionCode: definition.code, value: item.value.toString(), source: item.source });
    return item;
  }

  async calculate(tenantId: string, actorUserId: string, dto: CalculateKpisDto) {
    const start = new Date(dto.periodStart); const end = new Date(dto.periodEnd);
    if (end <= start) throw new BadRequestException('O fim do período deve ser posterior ao início.');
    await this.ensureDefaults(tenantId);
    const definitions = dto.contractId && await this.prisma.contractKpi.count({ where: { tenantId, contractId: dto.contractId, active: true, deletedAt: null } })
      ? (await this.prisma.contractKpi.findMany({ where: { tenantId, contractId: dto.contractId, active: true, deletedAt: null }, include: { definition: true } })).map((item) => item.definition)
      : await this.prisma.kpiDefinition.findMany({ where: { tenantId, active: true, deletedAt: null, calculationMethod: { not: 'WEIGHTED_IGD' } } });
    const values = [];
    for (const definition of definitions) {
      const measurement = await this.calculateDefinition(tenantId, definition, start, end, dto);
      if (measurement) values.push(measurement);
    }
    await this.audit(this.prisma, tenantId, actorUserId, AuditAction.CREATE, 'KpiCalculationBatch', undefined,
      { periodStart: start.toISOString(), periodEnd: end.toISOString(), count: values.length,
        scope: { ...dto } as Prisma.InputJsonValue });
    return values;
  }

  async calculateContractPerformance(tenantId: string, actorUserId: string, contractId: string, dto: ContractPerformanceDto) {
    const contract = await this.requireContract(tenantId, contractId);
    await this.ensureDefaults(tenantId);
    const bindings = await this.prisma.contractKpi.findMany({ where: { tenantId, contractId, active: true, deletedAt: null },
      include: { definition: true, bands: { where: { active: true, deletedAt: null }, orderBy: { sortOrder: 'asc' } } } });
    if (!bindings.length) throw new BadRequestException('Selecione ao menos um KPI para este contrato.');
    const coveredBuildings = await this.prisma.contractBuilding.findMany({ where: { contractId }, select: { buildingId: true }, take: 2 });
    const { start, end } = periodForMonth(dto.referenceMonth);
    const results: Array<{ binding: typeof bindings[number]; measurement: NonNullable<Awaited<ReturnType<KpisService['calculateDefinition']>>>; band: ReturnType<typeof findPerformanceBand> }> = [];
    for (const binding of bindings) {
      const measurement = await this.calculateDefinition(tenantId, binding.definition, start, end, { periodStart: start.toISOString(), periodEnd: end.toISOString(), contractId });
      if (!measurement) continue;
      const numericBands = binding.bands.map((band) => ({ ...band, minValue: band.minValue?.toNumber() ?? null,
        maxValue: band.maxValue?.toNumber() ?? null, score: band.score.toNumber(), adjustmentPercent: band.adjustmentPercent?.toNumber() ?? null,
        fixedAmount: band.fixedAmount?.toNumber() ?? null }));
      const band = findPerformanceBand(measurement.value.toNumber(), numericBands);
      const updated = await this.prisma.kpiMeasurement.update({ where: { id: measurement.id }, data: {
        normalizedScore: band?.score, performanceBand: band?.rating,
        targetValue: binding.targetValue ?? binding.definition.targetValue,
        supplierId: contract.supplierId,
        buildingId: coveredBuildings.length === 1 ? coveredBuildings[0].buildingId : null,
      }, include: { definition: true } });
      results.push({ binding, measurement: updated, band });
      await this.syncAlert(tenantId, contractId, binding, updated, band, dto.referenceMonth);
    }
    const igd = weightedPerformanceIndex(results.filter((row) => row.band).map((row) => ({
      score: row.band!.score, weight: row.binding.weight.toNumber(),
    })));
    const igdMeasurement = await this.saveIgd(tenantId, contractId, start, end, dto.referenceMonth, igd, results);
    let financialMeasurement = null;
    if (dto.financialMeasurementId) financialMeasurement = await this.applyFinancialAdjustments(
      tenantId, actorUserId, contractId, dto.financialMeasurementId, dto.referenceMonth, results, igd,
    );
    await this.audit(this.prisma, tenantId, actorUserId, AuditAction.CREATE, 'ContractPerformanceCalculation', contractId,
      { contractCode: contract.code, referenceMonth: dto.referenceMonth, calculated: results.length, igd });
    return { referenceMonth: dto.referenceMonth, contract: { id: contract.id, code: contract.code },
      igd, rating: performanceRating(igd), igdMeasurement, indicators: results.map(({ binding, measurement, band }) => ({
        contractKpiId: binding.id, code: binding.definition.code, name: binding.definition.name,
        value: measurement.value, unit: binding.definition.unit, target: binding.targetValue ?? binding.definition.targetValue,
        weight: binding.weight, score: band?.score ?? null, band: band?.rating ?? 'SEM_FAIXA', adjustment: band?.adjustmentType ?? 'NONE',
        details: measurement.details,
      })), financialMeasurement };
  }

  async contractDashboard(tenantId: string, contractId: string, referenceMonth?: string) {
    const contract = await this.requireContract(tenantId, contractId);
    const ref = referenceMonth ?? new Date().toISOString().slice(0, 7);
    const { start, end } = periodForMonth(ref);
    const [configs, measurements, alerts, adjustments, trends] = await Promise.all([
      this.prisma.contractKpi.findMany({ where: { tenantId, contractId, active: true, deletedAt: null }, include: { definition: true,
        bands: { where: { active: true, deletedAt: null }, orderBy: { sortOrder: 'asc' } } }, orderBy: { weight: 'desc' } }),
      this.prisma.kpiMeasurement.findMany({ where: { tenantId, contractId, periodStart: start, periodEnd: end }, include: { definition: true } }),
      this.prisma.kpiAlert.findMany({ where: { tenantId, contractId, resolvedAt: null }, orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }], take: 20 }),
      this.prisma.kpiFinancialAdjustment.findMany({ where: { tenantId, contractId, referenceMonth: ref }, include: { contractKpi: { include: { definition: true } } } }),
      this.prisma.kpiMeasurement.findMany({ where: { tenantId, contractId, periodEnd: { lte: end } }, orderBy: { periodEnd: 'asc' }, take: 240,
        select: { definitionId: true, value: true, normalizedScore: true, performanceBand: true, periodEnd: true } }),
    ]);
    const byDefinition = new Map(measurements.map((item) => [item.definitionId, item]));
    const igdDefinition = await this.prisma.kpiDefinition.findUnique({ where: { tenantId_code: { tenantId, code: 'GLOBAL_PERFORMANCE_INDEX' } } });
    const igd = igdDefinition ? byDefinition.get(igdDefinition.id)?.value.toNumber() ?? null : null;
    const indicators = configs.map((config) => ({ ...config, current: byDefinition.get(config.definitionId) ?? null }));
    const categoryScores = new Map<string, { total: number; weight: number }>();
    for (const item of indicators) { const score = item.current?.normalizedScore?.toNumber(); if (score === undefined) continue;
      const key = item.definition.category; const row = categoryScores.get(key) ?? { total: 0, weight: 0 };
      row.total += score * item.weight.toNumber(); row.weight += item.weight.toNumber(); categoryScores.set(key, row); }
    return { referenceMonth: ref, contract: { id: contract.id, code: contract.code, object: contract.object,
      supplier: await this.prisma.supplier.findFirst({ where: { id: contract.supplierId, tenantId }, select: { id: true, legalName: true, tradeName: true } }) },
      igd, rating: performanceRating(igd), indicators, alerts, adjustments,
      categoryScores: [...categoryScores].map(([category, row]) => ({ category, score: row.weight ? row.total / row.weight : null })),
      trend: trends.filter((item) => item.definitionId === igdDefinition?.id).map((item) => ({ periodEnd: item.periodEnd, value: item.value })),
      libraryVersion: KPI_LIBRARY_VERSION };
  }

  async analysis(tenantId: string) {
    const latest = await this.prisma.kpiMeasurement.findMany({ where: { tenantId, normalizedScore: { not: null } },
      orderBy: { periodEnd: 'desc' }, take: 1000, include: { contract: { select: { id: true, code: true } },
        supplier: { select: { id: true, legalName: true, tradeName: true } }, building: { select: { id: true, code: true, name: true } } } });
    const rank = <T extends { id: string; name: string }>(dimension: (row: typeof latest[number]) => T | null) => {
      const grouped = new Map<string, { id: string; name: string; sum: number; count: number }>();
      for (const row of latest) { const item = dimension(row); if (!item || !row.normalizedScore) continue; const current = grouped.get(item.id) ?? { ...item, sum: 0, count: 0 };
        current.sum += row.normalizedScore.toNumber(); current.count++; grouped.set(item.id, current); }
      return [...grouped.values()].map((item) => ({ id: item.id, name: item.name, score: item.sum / item.count, samples: item.count })).sort((a,b) => b.score-a.score).slice(0,10);
    };
    return { contracts: rank((row) => row.contract ? { id: row.contract.id, name: row.contract.code } : null),
      suppliers: rank((row) => row.supplier ? { id: row.supplier.id, name: row.supplier.tradeName ?? row.supplier.legalName } : null),
      buildings: rank((row) => row.building ? { id: row.building.id, name: `${row.building.code} — ${row.building.name}` } : null) };
  }

  alerts(tenantId: string, query: KpiAlertsQuery) {
    return this.prisma.kpiAlert.findMany({ where: { tenantId, ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.openOnly ? { resolvedAt: null } : {}) }, orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }], take: 100 });
  }

  async executive(tenantId: string) {
    await this.ensureDefaults(tenantId);
    const definitions = await this.prisma.kpiDefinition.findMany({ where: { tenantId, active: true, deletedAt: null }, orderBy: { name: 'asc' },
      include: { measurements: { where: { buildingId: null, contractId: null, supplierId: null }, orderBy: { periodEnd: 'desc' }, take: 2 } } });
    return definitions.map((definition) => { const current = definition.measurements[0]; const previous = definition.measurements[1];
      return { code: definition.code, name: definition.name, category: definition.category, unit: definition.unit,
        direction: definition.direction, targetValue: definition.targetValue, current, previous,
        delta: current && previous ? current.value.minus(previous.value) : null }; });
  }

  async trend(tenantId: string, code: string, query: KpiTrendQuery) {
    const definition = await this.prisma.kpiDefinition.findFirst({ where: { tenantId, code: code.toUpperCase(), active: true, deletedAt: null } });
    if (!definition) throw new NotFoundException('Indicador não encontrado.');
    return this.prisma.kpiMeasurement.findMany({ where: { tenantId, definitionId: definition.id,
      ...(query.contractId ? { contractId: query.contractId } : {}), ...(query.buildingId ? { buildingId: query.buildingId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}) }, orderBy: { periodEnd: 'desc' }, take: query.periods });
  }

  async executiveCsv(tenantId: string) {
    const rows = await this.executive(tenantId);
    const csv = [['Código','Indicador','Categoria','Valor atual','Unidade','Meta','Variação','Competência'],
      ...rows.map((row) => [row.code,row.name,row.category,row.current?.value ?? '',row.unit,row.targetValue ?? '',row.delta ?? '',row.current?.periodEnd.toISOString() ?? ''])]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(';')).join('\r\n');
    return Buffer.from(`\uFEFF${csv}`, 'utf8');
  }

  async executivePdf(tenantId: string) {
    const [tenant, rows] = await Promise.all([this.prisma.tenant.findUnique({ where: { id: tenantId } }), this.executive(tenantId)]);
    return new Promise<Buffer>((resolve, reject) => { const doc = new PDFDocument({ size: 'A4', margin: 48 }); const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk))); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
      doc.fontSize(18).text('Gestão por desempenho contratual').fontSize(10).text(tenant?.name ?? 'Organização').text(`Biblioteca ${KPI_LIBRARY_VERSION}`).text(`Emitido em ${new Date().toISOString()}`).moveDown();
      for (const row of rows) { if (doc.y > 730) doc.addPage(); doc.fontSize(11).text(`${row.name} (${row.code})`);
        doc.fontSize(9).text(`Atual: ${row.current?.value?.toString() ?? 'Sem medição'} ${row.unit} | Meta: ${row.targetValue?.toString() ?? '-'} | Variação: ${row.delta?.toString() ?? '-'}`).moveDown(0.6); }
      doc.end(); });
  }

  private bindingData(dto: BindContractKpiDto) {
    return { definitionId: dto.definitionId, targetValue: dto.targetValue, warningValue: dto.warningValue,
      criticalValue: dto.criticalValue, weight: dto.weight, financialRole: dto.financialRole,
      deductionCapPercent: dto.deductionCapPercent, bonusCapPercent: dto.bonusCapPercent,
      roundingScale: dto.roundingScale ?? 2, actionPlanTrigger: dto.actionPlanTrigger ?? false };
  }

  private validateBands(bands: BindContractKpiDto['bands']) {
    if (new Set(bands.map((band) => band.rating.trim().toUpperCase())).size !== bands.length) throw new BadRequestException('As classificações das faixas não podem se repetir.');
    for (const band of bands) if (band.minValue !== undefined && band.maxValue !== undefined && band.maxValue <= band.minValue) {
      throw new BadRequestException(`A faixa ${band.label} possui limites inválidos.`);
    }
  }

  private async validateDimensions(tenantId: string, dto: CreateKpiDataPointDto) {
    const [building, contract, supplier] = await Promise.all([
      dto.buildingId ? this.prisma.building.count({ where: { id: dto.buildingId, tenantId, deletedAt: null } }) : 1,
      dto.contractId ? this.prisma.contract.count({ where: { id: dto.contractId, tenantId, deletedAt: null } }) : 1,
      dto.supplierId ? this.prisma.supplier.count({ where: { id: dto.supplierId, tenantId, deletedAt: null } }) : 1,
    ]);
    if (!building || !contract || !supplier) throw new BadRequestException('Uma dimensão informada não pertence à organização.');
  }

  private requireContract(tenantId: string, id: string) {
    return this.prisma.contract.findFirst({ where: { id, tenantId, deletedAt: null } }).then((item) => {
      if (!item) throw new NotFoundException('Contrato não encontrado.'); return item;
    });
  }

  private async calculateDefinition(tenantId: string, definition: { id: string; code: string; version: number; calculationMethod: string;
    aggregation: KpiAggregation; targetValue: Prisma.Decimal | null; formula: string | null }, start: Date, end: Date, scope: Scope) {
    const computed = await this.compute(tenantId, definition.calculationMethod, start, end, scope, definition.id, definition.aggregation);
    if (!computed.hasData) return null;
    const calculationKey = hash({ tenantId, definitionId: definition.id, version: definition.version, start: start.toISOString(), end: end.toISOString(),
      buildingId: scope.buildingId ?? null, contractId: scope.contractId ?? null, supplierId: scope.supplierId ?? null,
      workOrderId: scope.workOrderId ?? null, maintenancePlanId: scope.maintenancePlanId ?? null, assetId: scope.assetId ?? null });
    return this.prisma.kpiMeasurement.upsert({ where: { calculationKey }, create: { tenantId, definitionId: definition.id,
      buildingId: scope.buildingId, contractId: scope.contractId, supplierId: scope.supplierId, workOrderId: scope.workOrderId,
      maintenancePlanId: scope.maintenancePlanId, assetId: scope.assetId, periodStart: start, periodEnd: end,
      value: computed.value, calculationKey, formulaVersion: definition.version, targetValue: definition.targetValue,
      source: definition.calculationMethod, formulaSnapshot: definition.formula, details: computed.details },
      update: { value: computed.value, targetValue: definition.targetValue, formulaSnapshot: definition.formula,
        details: computed.details, computedAt: new Date() }, include: { definition: true } });
  }

  private workOrderWhere(tenantId: string, scope: Scope): Prisma.WorkOrderWhereInput {
    return { tenantId, deletedAt: null, ...(scope.workOrderId ? { id: scope.workOrderId } : {}),
      ...(scope.buildingId ? { buildingId: scope.buildingId } : {}), ...(scope.supplierId ? { supplierId: scope.supplierId } : {}),
      ...(scope.contractId ? { contracts: { some: { contractId: scope.contractId } } } : {}),
      ...(scope.maintenancePlanId ? { maintenancePlanId: scope.maintenancePlanId } : {}),
      ...(scope.assetId ? { maintenancePlan: { assetId: scope.assetId } } : {}) };
  }

  private async compute(tenantId: string, method: string, start: Date, end: Date, scope: Scope,
    definitionId: string, aggregation: KpiAggregation): Promise<Computed> {
    const where = this.workOrderWhere(tenantId, scope);
    if (method === 'WO_AVG_ASSIGNMENT_HOURS' || method === 'WO_AVG_RESOLUTION_HOURS' || method === 'WO_AVG_CLOSURE_HOURS' || method === 'WO_CORRECTIVE_AVG_HOURS') {
      const target = method === 'WO_AVG_ASSIGNMENT_HOURS' ? 'assignedAt' : method === 'WO_AVG_CLOSURE_HOURS' ? 'closedAt' : 'completedAt';
      const rows = await this.prisma.workOrder.findMany({ where: { ...where, ...(method === 'WO_CORRECTIVE_AVG_HOURS' ? { maintenancePlanId: null } : {}),
        [target]: { gte: start, lt: end } }, select: { openedAt: true, assignedAt: true, completedAt: true, closedAt: true } });
      const hours = rows.map((row) => ((target === 'assignedAt' ? row.assignedAt : target === 'closedAt' ? row.closedAt : row.completedAt)!.getTime() - row.openedAt.getTime()) / 3_600_000);
      return this.average(hours, { count: hours.length, method, source: 'WorkOrder' });
    }
    if (method.startsWith('WO_SLA_')) {
      const priority = method.startsWith('WO_SLA_BY_PRIORITY:') ? method.split(':')[1] as WorkOrderPriority : undefined;
      const origin = method.startsWith('WO_SLA_BY_ORIGIN:') ? method.split(':')[1] as WorkOrderOrigin : undefined;
      const rows = await this.prisma.workOrder.findMany({ where: { ...where, closedAt: { gte: start, lt: end }, slaResolutionDeadline: { not: null },
        ...(priority ? { priority } : {}), ...(origin ? { origin } : {}) }, select: { closedAt: true, slaResolutionDeadline: true } });
      const onTime = rows.filter((row) => row.closedAt! <= row.slaResolutionDeadline!).length;
      const numerator = method === 'WO_SLA_BREACH_RATE' ? rows.length - onTime : onTime;
      return this.ratio(numerator, rows.length, { numerator, denominator: rows.length, onTime, method });
    }
    if (method === 'WO_BACKLOG_COUNT' || method === 'WO_PENDING_COUNT') {
      const count = await this.prisma.workOrder.count({ where: { ...where, openedAt: { lt: end },
        status: method === 'WO_PENDING_COUNT' ? WorkOrderStatus.PENDING : { in: OPEN } } });
      return { value: new Prisma.Decimal(count), details: { count, method }, hasData: true };
    }
    if (method === 'WO_CORRECTIVE_COUNT') {
      const count = await this.prisma.workOrder.count({ where: { ...where, maintenancePlanId: null, openedAt: { gte: start, lt: end } } });
      return { value: new Prisma.Decimal(count), details: { count }, hasData: true };
    }
    if (method === 'WO_REOPEN_RATE' || method === 'WO_REOPEN_COUNT' || method === 'WO_FIRST_TIME_FIX') {
      const [reopened, closed] = await Promise.all([
        this.prisma.workOrderReopening.count({ where: { tenantId, reopenedAt: { gte: start, lt: end }, within30Days: true,
          ...(scope.buildingId || scope.contractId || scope.supplierId ? { workOrder: where } : {}) } }),
        this.prisma.workOrder.count({ where: { ...where, closedAt: { gte: start, lt: end } } }),
      ]);
      if (method === 'WO_REOPEN_COUNT') return { value: new Prisma.Decimal(reopened), details: { reopened }, hasData: true };
      return this.ratio(method === 'WO_FIRST_TIME_FIX' ? Math.max(0, closed - reopened) : reopened, closed, { reopened, closed });
    }
    if (method.startsWith('PLAN_')) {
      const planWhere: Prisma.MaintenancePlanGenerationWhereInput = { tenantId, scheduledFor: { gte: start, lt: end },
        ...(scope.maintenancePlanId ? { planId: scope.maintenancePlanId } : {}),
        ...(scope.buildingId || scope.contractId || scope.supplierId || scope.assetId ? { plan: {
          ...(scope.buildingId ? { buildingId: scope.buildingId } : {}), ...(scope.contractId ? { contractId: scope.contractId } : {}),
          ...(scope.supplierId ? { supplierId: scope.supplierId } : {}), ...(scope.assetId ? { assetId: scope.assetId } : {}) } } : {}) };
      const total = await this.prisma.maintenancePlanGeneration.count({ where: planWhere });
      if (method === 'PLAN_GENERATED_COUNT') { const count = await this.prisma.maintenancePlanGeneration.count({ where: { ...planWhere, status: 'GENERATED' } }); return { value: new Prisma.Decimal(count), details: { count, total }, hasData: true }; }
      const woFilter: Prisma.WorkOrderWhereInput = { ...where, maintenancePlanId: { not: null }, preventiveScheduledFor: { gte: start, lt: end } };
      if (method === 'PLAN_COMPLETED_COUNT') { const count = await this.prisma.workOrder.count({ where: { ...woFilter, status: { in: CLOSED } } }); return { value: new Prisma.Decimal(count), details: { count, total }, hasData: true }; }
      if (method === 'PLAN_CANCELED_COUNT') { const count = await this.prisma.workOrder.count({ where: { ...woFilter, status: WorkOrderStatus.CANCELED } }); return { value: new Prisma.Decimal(count), details: { count, total }, hasData: true }; }
      if (method === 'PLAN_LATE_COUNT') { const count = await this.prisma.workOrder.count({ where: { ...woFilter, status: { in: OPEN }, dueAt: { lt: end } } }); return { value: new Prisma.Decimal(count), details: { count, total }, hasData: true }; }
      if (method === 'PLAN_COMPLIANCE') { const completed = await this.prisma.workOrder.count({ where: { ...woFilter, status: { in: CLOSED } } }); return this.ratio(completed, total, { completed, planned: total }); }
    }
    if (method === 'PREVENTIVE_CORRECTIVE_RATIO') {
      const [preventive, corrective] = await Promise.all([
        this.prisma.workOrder.count({ where: { ...where, maintenancePlanId: { not: null }, openedAt: { gte: start, lt: end } } }),
        this.prisma.workOrder.count({ where: { ...where, maintenancePlanId: null, openedAt: { gte: start, lt: end } } }),
      ]); return this.ratio(preventive, preventive + corrective, { preventive, corrective });
    }
    if (['WO_APPROVAL_RATE','WO_PHOTO_COMPLIANCE','WO_REPORT_COMPLIANCE','WO_CHECKLIST_COMPLIANCE','WO_DOCUMENTATION_COMPLIANCE'].includes(method)) {
      const rows = await this.prisma.workOrder.findMany({ where: { ...where, closedAt: { gte: start, lt: end } },
        select: { acceptedAt: true, solution: true, finalCost: true,
          attachments: { where: { deletedAt: null }, select: { kind: true } },
          checklistItems: { select: { required: true, responses: { where: { checked: true }, take: 1 } } } } });
      const photoKinds: AttachmentKind[] = [AttachmentKind.PHOTO_BEFORE,AttachmentKind.PHOTO_DURING,AttachmentKind.PHOTO_AFTER];
      const passed = rows.filter((row) => { const photo = row.attachments.some((a) => photoKinds.includes(a.kind));
        const report = row.attachments.some((a) => a.kind === AttachmentKind.TECHNICAL_REPORT);
        const checklist = row.checklistItems.filter((i) => i.required).every((i) => i.responses.length > 0);
        if (method === 'WO_APPROVAL_RATE') return Boolean(row.acceptedAt);
        if (method === 'WO_PHOTO_COMPLIANCE') return photo;
        if (method === 'WO_REPORT_COMPLIANCE') return report;
        if (method === 'WO_CHECKLIST_COMPLIANCE') return checklist;
        return Boolean(row.acceptedAt && row.solution && row.finalCost && photo && checklist);
      }).length;
      return this.ratio(passed, rows.length, { compliant: passed, total: rows.length, method });
    }
    if (method === 'SATISFACTION_AVG' || method === 'NPS') {
      const rows = await this.prisma.satisfactionResponse.findMany({ where: { workOrder: { ...where,
        OR: [{ completedAt: { gte: start, lt: end } }, { closedAt: { gte: start, lt: end } }] } }, select: { score: true, npsScore: true } });
      if (method === 'SATISFACTION_AVG') return this.average(rows.map((row) => row.score), { responses: rows.length });
      const valid = rows.flatMap((row) => row.npsScore === null ? [] : [row.npsScore]);
      if (!valid.length) return { value: new Prisma.Decimal(0), details: { responses: 0 }, hasData: false };
      const promoters = valid.filter((value) => value >= 9).length; const detractors = valid.filter((value) => value <= 6).length;
      return { value: new Prisma.Decimal(((promoters - detractors) / valid.length * 100).toFixed(6)), details: { promoters, detractors, responses: valid.length }, hasData: true };
    }
    if (method === 'CONTRACT_EXECUTION') {
      const contracts = await this.prisma.contract.findMany({ where: { tenantId, deletedAt: null,
        ...(scope.contractId ? { id: scope.contractId } : {}), ...(scope.supplierId ? { supplierId: scope.supplierId } : {}),
        ...(scope.buildingId ? { buildings: { some: { buildingId: scope.buildingId } } } : {}) }, select: { currentValue: true, measuredValue: true } });
      const basis = contracts.reduce((sum, item) => sum.plus(item.currentValue), new Prisma.Decimal(0));
      const measured = contracts.reduce((sum, item) => sum.plus(item.measuredValue), new Prisma.Decimal(0));
      return { value: basis.isZero() ? new Prisma.Decimal(0) : measured.dividedBy(basis).times(100).toDecimalPlaces(6),
        details: { contracts: contracts.length, measured: measured.toString(), current: basis.toString() }, hasData: contracts.length > 0 };
    }
    if (method === 'COST_PER_M2') {
      const orders = await this.prisma.workOrder.findMany({ where: { ...where, completedAt: { gte: start, lt: end }, finalCost: { not: null } },
        select: { finalCost: true, building: { select: { id: true, grossAreaM2: true } } } });
      const cost = orders.reduce((sum,row) => sum.plus(row.finalCost ?? 0), new Prisma.Decimal(0));
      const areas = new Map(orders.filter((row) => row.building.grossAreaM2).map((row) => [row.building.id,row.building.grossAreaM2!]));
      const area = [...areas.values()].reduce((sum,value) => sum.plus(value), new Prisma.Decimal(0));
      return { value: area.isZero() ? new Prisma.Decimal(0) : cost.dividedBy(area).toDecimalPlaces(6), details: { cost: cost.toString(), areaM2: area.toString(), orders: orders.length }, hasData: !area.isZero() };
    }
    if (method === 'BUDGET_VARIANCE') {
      const orders = await this.prisma.workOrder.findMany({ where: { ...where, completedAt: { gte: start, lt: end } }, select: { budgets: { where: { status: BudgetStatus.APPROVED,
        stage: { in: [BudgetStage.PLANNED,BudgetStage.FINAL_EXECUTED] } }, select: { stage: true, total: true } } } });
      const planned = orders.flatMap((row) => row.budgets.filter((b) => b.stage === BudgetStage.PLANNED)).reduce((s,b) => s.plus(b.total),new Prisma.Decimal(0));
      const final = orders.flatMap((row) => row.budgets.filter((b) => b.stage === BudgetStage.FINAL_EXECUTED)).reduce((s,b) => s.plus(b.total),new Prisma.Decimal(0));
      return { value: planned.isZero() ? new Prisma.Decimal(0) : final.minus(planned).dividedBy(planned).times(100).abs().toDecimalPlaces(6),
        details: { planned: planned.toString(), final: final.toString() }, hasData: !planned.isZero() };
    }
    return this.computeDataPoints(tenantId, definitionId, start, end, scope, aggregation, method);
  }

  private async computeDataPoints(tenantId: string, definitionId: string, start: Date, end: Date, scope: Scope,
    aggregation: KpiAggregation, method: string): Promise<Computed> {
    const rows = await this.prisma.kpiDataPoint.findMany({ where: { tenantId, definitionId, occurredAt: { gte: start, lt: end },
      ...(scope.buildingId ? { buildingId: scope.buildingId } : {}), ...(scope.contractId ? { contractId: scope.contractId } : {}),
      ...(scope.supplierId ? { supplierId: scope.supplierId } : {}) }, orderBy: { occurredAt: 'asc' } });
    if (!rows.length) return { value: new Prisma.Decimal(0), details: { count: 0, method, noData: true }, hasData: false };
    if (method === 'DATA_POINT_RATIO' || aggregation === KpiAggregation.RATIO) {
      const numerator = rows.reduce((sum,row) => sum.plus(row.numerator ?? row.value),new Prisma.Decimal(0));
      const denominator = rows.reduce((sum,row) => sum.plus(row.denominator ?? 0),new Prisma.Decimal(0));
      if (denominator.isZero()) return this.average(rows.map((row) => row.value.toNumber()), { count: rows.length, fallback: 'average' });
      return { value: numerator.dividedBy(denominator).times(100).toDecimalPlaces(6), details: { count: rows.length, numerator: numerator.toString(), denominator: denominator.toString() }, hasData: true };
    }
    if (method === 'DATA_POINT_SUM' || aggregation === KpiAggregation.SUM) return { value: rows.reduce((sum,row) => sum.plus(row.value),new Prisma.Decimal(0)), details: { count: rows.length }, hasData: true };
    if (aggregation === KpiAggregation.COUNT) return { value: new Prisma.Decimal(rows.length), details: { count: rows.length }, hasData: true };
    if (aggregation === KpiAggregation.LATEST) return { value: rows.at(-1)!.value, details: { count: rows.length, occurredAt: rows.at(-1)!.occurredAt.toISOString() }, hasData: true };
    return this.average(rows.map((row) => row.value.toNumber()), { count: rows.length });
  }

  private average(values: number[], details: Prisma.InputJsonValue): Computed {
    return { value: new Prisma.Decimal(values.length ? (values.reduce((a,b)=>a+b,0)/values.length).toFixed(6) : 0), details, hasData: values.length > 0 };
  }

  private ratio(numerator: number, denominator: number, details: Prisma.InputJsonValue): Computed {
    return { value: new Prisma.Decimal(denominator ? (numerator/denominator*100).toFixed(6) : 0), details, hasData: denominator > 0 };
  }

  private async saveIgd(tenantId: string, contractId: string, start: Date, end: Date, referenceMonth: string, igd: number | null,
    results: Array<{ binding: { id: string; weight: Prisma.Decimal }; band: { score: number } | null }>) {
    if (igd === null) return null;
    const definition = await this.prisma.kpiDefinition.findUnique({ where: { tenantId_code: { tenantId, code: 'GLOBAL_PERFORMANCE_INDEX' } } });
    if (!definition) return null;
    const calculationKey = hash({ tenantId, definitionId: definition.id, contractId, referenceMonth, version: definition.version });
    return this.prisma.kpiMeasurement.upsert({ where: { calculationKey }, create: { tenantId, definitionId: definition.id, contractId,
      periodStart: start, periodEnd: end, value: new Prisma.Decimal(igd.toFixed(6)), normalizedScore: new Prisma.Decimal(igd.toFixed(4)),
      performanceBand: performanceRating(igd), calculationKey, formulaVersion: definition.version, targetValue: definition.targetValue,
      source: 'WEIGHTED_IGD', formulaSnapshot: definition.formula, details: { components: results.filter((row) => row.band).map((row) => ({ contractKpiId: row.binding.id, score: row.band!.score, weight: row.binding.weight.toString() })) } },
      update: { value: new Prisma.Decimal(igd.toFixed(6)), normalizedScore: new Prisma.Decimal(igd.toFixed(4)), performanceBand: performanceRating(igd), computedAt: new Date() } });
  }

  private async syncAlert(tenantId: string, contractId: string, binding: { id: string; definition: { name: string; direction: KpiDirection };
    actionPlanTrigger: boolean }, measurement: { id: string; value: Prisma.Decimal }, band: ReturnType<typeof findPerformanceBand>, referenceMonth: string) {
    if (!band || band.score >= 85) return;
    const severity = band.score < 50 ? KpiAlertSeverity.CRITICAL : KpiAlertSeverity.WARNING;
    const type = band.triggerActionPlan || binding.actionPlanTrigger ? KpiAlertType.ACTION_PLAN : band.score < 70 ? KpiAlertType.TARGET_MISSED : KpiAlertType.NEAR_LIMIT;
    const dedupeKey = hash({ contractId, contractKpiId: binding.id, referenceMonth, type });
    await this.prisma.kpiAlert.upsert({ where: { tenantId_dedupeKey: { tenantId, dedupeKey } }, create: { tenantId, contractId,
      contractKpiId: binding.id, kpiMeasurementId: measurement.id, type, severity, title: `${binding.definition.name}: ${band.label}`,
      message: `Valor ${measurement.value.toString()} enquadrado na faixa ${band.label}. Consulte a memória de cálculo.`, dedupeKey,
      actionPlanRequired: band.triggerActionPlan || binding.actionPlanTrigger }, update: { kpiMeasurementId: measurement.id, severity,
      message: `Valor ${measurement.value.toString()} enquadrado na faixa ${band.label}. Consulte a memória de cálculo.`, resolvedAt: null } });
  }

  private async applyFinancialAdjustments(tenantId: string, actorUserId: string, contractId: string, measurementId: string,
    referenceMonth: string, results: Array<{ binding: { id: string; financialRole: KpiFinancialRole; deductionCapPercent: Prisma.Decimal | null;
      bonusCapPercent: Prisma.Decimal | null; roundingScale: number; definition: { code: string; name: string } };
      measurement: { id: string; value: Prisma.Decimal; targetValue: Prisma.Decimal | null; details: Prisma.JsonValue | null }; band: ReturnType<typeof findPerformanceBand> }>, igd: number | null) {
    const financial = await this.prisma.measurement.findFirst({ where: { id: measurementId, tenantId, contractId, referenceMonth,
      status: MeasurementStatus.DRAFT }, include: { items: true } });
    if (!financial) throw new BadRequestException('A medição financeira deve pertencer ao contrato/competência e estar em rascunho.');
    const basis = financial.grossAmount.toNumber();
    let deductions = 0; let bonuses = 0; const adjustmentIds: string[] = [];
    for (const row of results) {
      if (!row.band || row.band.adjustmentType === 'NONE') continue;
      const isDeduction = row.band.adjustmentType === 'DEDUCTION';
      const allowed = isDeduction
        ? row.binding.financialRole === KpiFinancialRole.DEDUCTION || row.binding.financialRole === KpiFinancialRole.DEDUCTION_AND_BONUS
        : row.binding.financialRole === KpiFinancialRole.BONUS || row.binding.financialRole === KpiFinancialRole.DEDUCTION_AND_BONUS;
      if (!allowed) continue;
      const capPercent = isDeduction ? row.binding.deductionCapPercent?.toNumber() : row.binding.bonusCapPercent?.toNumber();
      const amount = cappedAdjustment({ basis, percent: row.band.adjustmentPercent ?? 0, fixedAmount: row.band.fixedAmount, capPercent });
      const rounded = new Prisma.Decimal(amount).toDecimalPlaces(row.binding.roundingScale);
      if (isDeduction) deductions += rounded.toNumber(); else bonuses += rounded.toNumber();
      const memory = { kpi: row.binding.definition.code, measuredValue: row.measurement.value.toString(),
        targetValue: row.measurement.targetValue?.toString() ?? null, band: row.band.rating, score: row.band.score,
        percentage: row.band.adjustmentPercent, basisAmount: financial.grossAmount.toString(), capPercent,
        formulaDetails: row.measurement.details };
      const adjustment = await this.prisma.kpiFinancialAdjustment.upsert({ where: { financialMeasurementId_contractKpiId: {
        financialMeasurementId: measurementId, contractKpiId: row.binding.id } }, create: { tenantId, contractId,
        contractKpiId: row.binding.id, kpiMeasurementId: row.measurement.id, financialMeasurementId: measurementId, referenceMonth,
        type: isDeduction ? KpiAdjustmentType.DEDUCTION : KpiAdjustmentType.BONUS,
        percentage: row.band.adjustmentPercent ?? 0, basisAmount: financial.grossAmount, amount: rounded,
        formula: `${row.band.adjustmentPercent ?? 0}% × ${financial.grossAmount.toString()}, limitado ao teto contratual`,
        calculationMemory: memory, status: KpiAdjustmentStatus.APPLIED, appliedAt: new Date() }, update: { kpiMeasurementId: row.measurement.id,
        type: isDeduction ? KpiAdjustmentType.DEDUCTION : KpiAdjustmentType.BONUS, percentage: row.band.adjustmentPercent ?? 0,
        basisAmount: financial.grossAmount, amount: rounded, calculationMemory: memory, status: KpiAdjustmentStatus.APPLIED, appliedAt: new Date(), waivedAt: null } });
      adjustmentIds.push(adjustment.id);
    }
    const manualDeductions = financial.items.reduce((sum,item) => sum.plus(item.deductionAmount),new Prisma.Decimal(0));
    const performanceDeductions = new Prisma.Decimal(deductions).toDecimalPlaces(2);
    const bonusTotal = new Prisma.Decimal(bonuses).toDecimalPlaces(2);
    const totalDeductions = manualDeductions.plus(performanceDeductions);
    const updated = await this.prisma.measurement.update({ where: { id: measurementId }, data: { performanceDeductions,
      deductions: totalDeductions, bonuses: bonusTotal, performanceIndex: igd === null ? null : new Prisma.Decimal(igd.toFixed(4)),
      netAmount: financial.grossAmount.minus(totalDeductions).plus(bonusTotal) }, include: { items: true, kpiAdjustments: { include: { contractKpi: { include: { definition: true } } } } } });
    await this.audit(this.prisma, tenantId, actorUserId, AuditAction.UPDATE, 'MeasurementPerformance', measurementId,
      { adjustmentIds, performanceDeductions: performanceDeductions.toString(), bonuses: bonusTotal.toString(), igd });
    return updated;
  }

  private audit(tx: Prisma.TransactionClient | PrismaService, tenantId: string, actorUserId: string, action: AuditAction,
    entityType: string, entityId: string | undefined, afterData: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { tenantId, actorUserId, action, entityType, entityId, afterData } });
  }
}
