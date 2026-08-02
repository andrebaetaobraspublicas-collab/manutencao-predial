import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import {
  AuditAction, KpiCategory, KpiDirection, KpiPeriodicity, Prisma, WorkOrderStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CalculateKpisDto } from './dto/kpis.dto';

const DEFAULTS = [
  { code: 'SLA_COMPLIANCE', name: 'Cumprimento de SLA', category: KpiCategory.SLA, unit: '%', direction: KpiDirection.HIGHER_IS_BETTER, formula: 'OS encerradas no prazo / OS encerradas com SLA', targetValue: 95 },
  { code: 'MTTA_HOURS', name: 'Tempo médio até atribuição', category: KpiCategory.OPERATIONAL, unit: 'h', direction: KpiDirection.LOWER_IS_BETTER, formula: 'Média(assignedAt - openedAt)', targetValue: 8 },
  { code: 'MTTR_HOURS', name: 'Tempo médio para resolução', category: KpiCategory.RELIABILITY, unit: 'h', direction: KpiDirection.LOWER_IS_BETTER, formula: 'Média(completedAt - openedAt)', targetValue: 48 },
  { code: 'BACKLOG_TOTAL', name: 'Backlog operacional', category: KpiCategory.OPERATIONAL, unit: 'OS', direction: KpiDirection.LOWER_IS_BETTER, formula: 'OS abertas ao fim do período', targetValue: 20 },
  { code: 'REOPEN_RATE_30D', name: 'Taxa de reabertura em 30 dias', category: KpiCategory.RELIABILITY, unit: '%', direction: KpiDirection.LOWER_IS_BETTER, formula: 'Reaberturas em 30 dias / OS encerradas', targetValue: 5 },
  { code: 'PREVENTIVE_COMPLIANCE', name: 'Cumprimento preventivo', category: KpiCategory.OPERATIONAL, unit: '%', direction: KpiDirection.HIGHER_IS_BETTER, formula: 'Gerações preventivas concluídas / previstas', targetValue: 95 },
  { code: 'CONTRACT_EXECUTION', name: 'Execução financeira contratual', category: KpiCategory.FINANCIAL, unit: '%', direction: KpiDirection.TARGET_RANGE, formula: 'Valor medido / valor vigente', targetValue: 100 },
] as const;

@Injectable()
export class KpisService {
  constructor(private readonly prisma: PrismaService) {}

  async definitions(tenantId: string) {
    const current = await this.prisma.kpiDefinition.findMany({ where: { tenantId, active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    return current.length ? current : this.ensureDefaults(tenantId);
  }

  async ensureDefaults(tenantId: string, actorUserId?: string) {
    const definitions = [];
    for (const item of DEFAULTS) {
      definitions.push(await this.prisma.kpiDefinition.upsert({ where: { tenantId_code: { tenantId, code: item.code } },
        create: { tenantId, ...item, source: 'CORE', periodicity: KpiPeriodicity.MONTHLY },
        update: { name: item.name, description: item.formula, formula: item.formula, source: 'CORE' } }));
    }
    if (actorUserId) await this.prisma.auditLog.create({ data: { tenantId, actorUserId, action: AuditAction.UPDATE,
      entityType: 'KpiDefinition', afterData: { synchronized: definitions.length } } });
    return definitions;
  }

  async calculate(tenantId: string, actorUserId: string, dto: CalculateKpisDto) {
    const start = new Date(dto.periodStart); const end = new Date(dto.periodEnd);
    if (end <= start) throw new BadRequestException('O fim do período deve ser posterior ao início.');
    const definitions = await this.ensureDefaults(tenantId);
    const values = [];
    for (const definition of definitions) {
      const calculated = await this.compute(tenantId, definition.code, start, end, dto);
      const calculationKey = createHash('sha256').update(JSON.stringify({ tenantId, definitionId: definition.id,
        version: definition.version, start: start.toISOString(), end: end.toISOString(), buildingId: dto.buildingId ?? null,
        contractId: dto.contractId ?? null, supplierId: dto.supplierId ?? null })).digest('hex');
      values.push(await this.prisma.kpiMeasurement.upsert({ where: { calculationKey }, create: {
        tenantId, definitionId: definition.id, buildingId: dto.buildingId, contractId: dto.contractId,
        supplierId: dto.supplierId, periodStart: start, periodEnd: end, value: calculated.value,
        calculationKey, formulaVersion: definition.version, targetValue: definition.targetValue,
        source: 'CORE', details: calculated.details }, update: { value: calculated.value,
        targetValue: definition.targetValue, details: calculated.details, computedAt: new Date() },
        include: { definition: true } }));
    }
    await this.prisma.auditLog.create({ data: { tenantId, actorUserId, action: AuditAction.CREATE,
      entityType: 'KpiCalculationBatch', afterData: { periodStart: start.toISOString(), periodEnd: end.toISOString(), count: values.length } } });
    return values;
  }

  async executive(tenantId: string) {
    if (!await this.prisma.kpiDefinition.count({ where: { tenantId, active: true } })) await this.ensureDefaults(tenantId);
    const definitions = await this.prisma.kpiDefinition.findMany({ where: { tenantId, active: true }, orderBy: { name: 'asc' },
      include: { measurements: { where: { buildingId: null, contractId: null, supplierId: null }, orderBy: { periodEnd: 'desc' }, take: 2 } } });
    return definitions.map((definition) => { const current = definition.measurements[0]; const previous = definition.measurements[1];
      const delta = current && previous ? current.value.minus(previous.value) : null;
      return { code: definition.code, name: definition.name, category: definition.category, unit: definition.unit,
        direction: definition.direction, targetValue: definition.targetValue, current, previous, delta }; });
  }

  async trend(tenantId: string, code: string, periods: number) {
    const definition = await this.prisma.kpiDefinition.findFirst({ where: { tenantId, code: code.toUpperCase(), active: true } });
    if (!definition) throw new NotFoundException('Indicador não encontrado.');
    return this.prisma.kpiMeasurement.findMany({ where: { tenantId, definitionId: definition.id }, orderBy: { periodEnd: 'desc' }, take: periods });
  }

  async executiveCsv(tenantId: string) {
    const rows = await this.executive(tenantId);
    const csv = [['Código','Indicador','Categoria','Valor atual','Unidade','Meta','Variação','Competência'],
      ...rows.map((row) => [row.code, row.name, row.category, row.current?.value ?? '', row.unit,
        row.targetValue ?? '', row.delta ?? '', row.current?.periodEnd.toISOString() ?? ''])]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(';')).join('\r\n');
    return Buffer.from(`\uFEFF${csv}`, 'utf8');
  }

  async executivePdf(tenantId: string) {
    const [tenant, rows] = await Promise.all([this.prisma.tenant.findUnique({ where: { id: tenantId } }), this.executive(tenantId)]);
    return new Promise<Buffer>((resolve, reject) => { const doc = new PDFDocument({ size: 'A4', margin: 48 }); const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk))); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
      doc.fontSize(18).text('Relatório executivo de indicadores').fontSize(10).text(tenant?.name ?? 'Organização').text(`Emitido em ${new Date().toISOString()}`).moveDown();
      for (const row of rows) { if (doc.y > 730) doc.addPage(); doc.fontSize(11).text(`${row.name} (${row.code})`);
        doc.fontSize(9).text(`Atual: ${row.current?.value?.toString() ?? 'Sem medição'} ${row.unit} | Meta: ${row.targetValue?.toString() ?? '-'} | Variação: ${row.delta?.toString() ?? '-'}`).moveDown(0.6); }
      doc.end(); });
  }

  private async compute(tenantId: string, code: string, start: Date, end: Date, scope: CalculateKpisDto): Promise<{ value: Prisma.Decimal; details: Prisma.InputJsonValue }> {
    const workOrderWhere: Prisma.WorkOrderWhereInput = { tenantId, deletedAt: null,
      ...(scope.buildingId ? { buildingId: scope.buildingId } : {}),
      ...(scope.supplierId ? { supplierId: scope.supplierId } : {}),
      ...(scope.contractId ? { contracts: { some: { contractId: scope.contractId } } } : {}) };
    if (code === 'SLA_COMPLIANCE') {
      const rows = await this.prisma.workOrder.findMany({ where: { ...workOrderWhere, closedAt: { gte: start, lt: end }, slaResolutionDeadline: { not: null } }, select: { closedAt: true, slaResolutionDeadline: true } });
      const onTime = rows.filter((row) => row.closedAt! <= row.slaResolutionDeadline!).length;
      return this.ratio(onTime, rows.length, { numerator: onTime, denominator: rows.length });
    }
    if (code === 'MTTA_HOURS' || code === 'MTTR_HOURS') {
      const field = code === 'MTTA_HOURS' ? 'assignedAt' : 'completedAt';
      const rows = await this.prisma.workOrder.findMany({ where: { ...workOrderWhere, [field]: { gte: start, lt: end } }, select: { openedAt: true, assignedAt: true, completedAt: true } });
      const hours = rows.map((row) => ((code === 'MTTA_HOURS' ? row.assignedAt : row.completedAt)!.getTime() - row.openedAt.getTime()) / 3600000);
      const average = hours.length ? hours.reduce((a,b) => a+b,0) / hours.length : 0;
      return { value: new Prisma.Decimal(average.toFixed(6)), details: { count: hours.length } };
    }
    if (code === 'BACKLOG_TOTAL') {
      const count = await this.prisma.workOrder.count({ where: { ...workOrderWhere, openedAt: { lt: end },
        OR: [{ status: { notIn: [WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELED] } }, { closedAt: { gte: end } }] } });
      return { value: new Prisma.Decimal(count), details: { count } };
    }
    if (code === 'REOPEN_RATE_30D') {
      const [reopened, closed] = await Promise.all([
        this.prisma.workOrderReopening.count({ where: { tenantId, reopenedAt: { gte: start, lt: end }, within30Days: true,
          ...(scope.buildingId || scope.contractId || scope.supplierId ? { workOrder: workOrderWhere } : {}) } }),
        this.prisma.workOrder.count({ where: { ...workOrderWhere, closedAt: { gte: start, lt: end } } }),
      ]); return this.ratio(reopened, closed, { numerator: reopened, denominator: closed });
    }
    if (code === 'PREVENTIVE_COMPLIANCE') {
      const [generated, total] = await Promise.all([
        this.prisma.maintenancePlanGeneration.count({ where: { tenantId, scheduledFor: { gte: start, lt: end }, status: 'GENERATED', ...(scope.buildingId ? { plan: { buildingId: scope.buildingId } } : {}) } }),
        this.prisma.maintenancePlanGeneration.count({ where: { tenantId, scheduledFor: { gte: start, lt: end }, ...(scope.buildingId ? { plan: { buildingId: scope.buildingId } } : {}) } }),
      ]); return this.ratio(generated, total, { numerator: generated, denominator: total });
    }
    if (code === 'CONTRACT_EXECUTION') {
      const contracts = await this.prisma.contract.findMany({ where: { tenantId, deletedAt: null,
        ...(scope.contractId ? { id: scope.contractId } : {}), ...(scope.supplierId ? { supplierId: scope.supplierId } : {}),
        ...(scope.buildingId ? { buildings: { some: { buildingId: scope.buildingId } } } : {}) }, select: { currentValue: true, measuredValue: true } });
      const current = contracts.reduce((sum, item) => sum.plus(item.currentValue), new Prisma.Decimal(0));
      const measured = contracts.reduce((sum, item) => sum.plus(item.measuredValue), new Prisma.Decimal(0));
      return { value: current.isZero() ? new Prisma.Decimal(0) : measured.dividedBy(current).times(100).toDecimalPlaces(6),
        details: { contracts: contracts.length, measured: measured.toString(), current: current.toString() } };
    }
    throw new BadRequestException(`Fórmula não suportada: ${code}`);
  }

  private ratio(numerator: number, denominator: number, details: Prisma.InputJsonValue) {
    return { value: new Prisma.Decimal(denominator ? (numerator / denominator * 100).toFixed(6) : 0), details };
  }
}
