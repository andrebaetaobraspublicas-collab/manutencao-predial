import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import {
  ContractStatus,
  type Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListWorkOrdersQuery } from '../work-orders/dto/list-work-orders.query';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { OPEN_WORK_ORDER_STATUSES } from '../work-orders/work-order-state-machine';
import { ExpiringContractsQuery } from './dto/expiring-contracts.query';

const CONTRACT_REPORT_INCLUDE = {
  supplier: { select: { legalName: true, tradeName: true, taxId: true } },
  manager: { select: { name: true, email: true } },
  inspector: { select: { name: true, email: true } },
  buildings: {
    include: { building: { select: { code: true, name: true, city: true, state: true } } },
  },
  amendments: { orderBy: { createdAt: 'asc' as const } },
  adjustments: { orderBy: { createdAt: 'asc' as const } },
  commitments: {
    include: { movements: { orderBy: { createdAt: 'asc' as const } } },
    orderBy: { issueDate: 'asc' as const },
  },
  measurements: { orderBy: { referenceMonth: 'asc' as const } },
  _count: { select: { workOrders: true } },
} satisfies Prisma.ContractInclude;

type ContractReport = Prisma.ContractGetPayload<{
  include: typeof CONTRACT_REPORT_INCLUDE;
}>;

type WorkOrderReport = Awaited<
  ReturnType<WorkOrdersService['listForReport']>
>['items'][number];

type PdfWriter = PDFKit.PDFDocument;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  async backlogPdf(
    tenantId: string,
    query: ListWorkOrdersQuery,
  ): Promise<Buffer> {
    const report = await this.backlogData(tenantId, query);
    return this.renderPdf(report.tenant.name, 'Backlog de ordens de serviço', (document) => {
      this.reportMetadata(document, report.generatedAt, report.hash, report.filters);
      this.metricCards(document, [
        ['Backlog localizado', report.total],
        ['Registros exportados', report.items.length],
        ['SLA vencido', report.overdue],
        ['Com pendência', report.items.filter((item) => item.hasOpenPendency).length],
      ]);
      if (report.truncated) {
        document
          .fillColor('#9a5d09')
          .text('Exportação limitada aos 5.000 registros mais antigos.')
          .fillColor('#000000');
      }
      this.sectionTitle(document, 'Relação analítica das ordens');
      for (const item of report.items) this.workOrderRow(document, item, report.tenant.timezone);
    });
  }

  async backlogCsv(
    tenantId: string,
    query: ListWorkOrdersQuery,
  ): Promise<Buffer> {
    const report = await this.backlogData(tenantId, query);
    const rows: unknown[][] = [
      [
        'Número',
        'Título',
        'Status',
        'Prioridade',
        'Edificação',
        'Fornecedor',
        'Demandante',
        'Responsável',
        'Categoria',
        'Contrato principal',
        'Abertura',
        'Prazo SLA',
        'SLA vencido',
        'Pendência aberta',
        'Custo final',
      ],
      ...report.items.map((item) => [
        item.number,
        item.title,
        item.status,
        item.priority,
        `${item.building.code} - ${item.building.name}`,
        item.supplier?.tradeName || item.supplier?.legalName || '',
        item.requester.name,
        item.assignedTo?.name || '',
        item.category?.name || '',
        item.contracts.find((link) => link.isPrimary)?.contract.code || '',
        this.dateTime(item.openedAt, report.tenant.timezone),
        item.slaResolutionDeadline
          ? this.dateTime(item.slaResolutionDeadline, report.tenant.timezone)
          : '',
        this.isOverdue(item) ? 'Sim' : 'Não',
        item.hasOpenPendency ? 'Sim' : 'Não',
        item.finalCost ?? '',
      ]),
      [],
      ['Organização', report.tenant.name],
      ['Emitido em', this.dateTime(report.generatedAt, report.tenant.timezone)],
      ['Filtros', report.filters],
      ['Hash SHA-256', report.hash],
      ['Total localizado', report.total],
      ['Total exportado', report.items.length],
    ];
    return this.csv(rows);
  }

  async workOrderPdf(tenantId: string, id: string): Promise<Buffer> {
    const [tenant, item] = await Promise.all([
      this.tenant(tenantId),
      this.workOrders.get(tenantId, id),
    ]);
    const hash = this.hash({ tenantId, id, updatedAt: item.updatedAt });
    return this.renderPdf(tenant.name, `Ordem de serviço ${item.number}`, (document) => {
      this.reportMetadata(document, new Date(), hash, 'Ficha individual');
      this.metricCards(document, [
        ['Status', item.status],
        ['Prioridade', item.priority],
        ['Custo final', this.money(item.finalCost)],
        ['SLA', this.isOverdue(item) ? 'Vencido' : 'Regular'],
      ]);
      this.sectionTitle(document, 'Identificação e responsabilidade');
      this.label(document, 'Título', item.title);
      this.label(document, 'Status / prioridade', `${item.status} / ${item.priority}`);
      this.label(document, 'Edificação', `${item.building.code} - ${item.building.name}`);
      this.label(document, 'Local', item.locationDetail || 'Não informado');
      this.label(document, 'Demandante', `${item.requester.name} <${item.requester.email}>`);
      this.label(document, 'Responsável', item.assignedTo?.name || 'Não atribuído');
      this.label(
        document,
        'Fornecedor',
        item.supplier?.tradeName || item.supplier?.legalName || 'Não definido',
      );
      this.label(document, 'Categoria', item.category?.name || 'Não classificada');
      this.label(document, 'Abertura', this.dateTime(item.openedAt, tenant.timezone));
      this.label(
        document,
        'Prazo SLA',
        item.slaResolutionDeadline
          ? this.dateTime(item.slaResolutionDeadline, tenant.timezone)
          : 'Não calculado',
      );
      this.sectionTitle(document, 'Descrição da demanda');
      document.fontSize(9).text(item.description);
      this.sectionTitle(document, 'Solução e fechamento');
      this.label(document, 'Solução', item.solution || 'Ainda não registrada');
      this.label(document, 'Custo final', this.money(item.finalCost));
      this.label(
        document,
        'Prontidão para fechamento',
        item.closeReadiness.ready
          ? 'Requisitos atendidos'
          : item.closeReadiness.blockers.join('; ') || 'Pendente',
      );
      this.label(document, 'Contratos', item.contracts.map((link) => link.contract.code).join(', ') || 'Nenhum');
      this.label(document, 'Anexos', item.attachments.length);
      this.label(document, 'Pendências', item.pendencies.length);
      this.label(document, 'Comentários', item.comments.length);
      this.label(document, 'Orçamentos', item.budgets.length);
      this.sectionTitle(document, 'Histórico cronológico de status');
      for (const history of item.statusHistory) {
        document
          .fontSize(8)
          .text(
            `${this.dateTime(history.changedAt, tenant.timezone)} | ${history.fromStatus ?? '-'} → ${history.toStatus} | ${history.changedBy.name}${history.note ? ` | ${history.note}` : ''}`,
          );
      }
    });
  }

  async expiringContractsPdf(
    tenantId: string,
    query: ExpiringContractsQuery,
  ): Promise<Buffer> {
    const report = await this.expiringContractsData(tenantId, query);
    return this.renderPdf(report.tenant.name, 'Contratos a vencer', (document) => {
      this.reportMetadata(
        document,
        report.generatedAt,
        report.hash,
        `Próximos ${query.days} dias${query.supplierId ? '; fornecedor filtrado' : ''}`,
      );
      const value = report.items.reduce((sum, item) => sum + Number(item.currentValue), 0);
      const urgent = report.items.filter((item) => item.endDate.getTime() - report.generatedAt.getTime() <= 30 * 86400000).length;
      this.metricCards(document, [['Contratos', report.items.length], ['Vencem em 30 dias', urgent], ['Valor vigente', this.money(value)]]);
      this.sectionTitle(document, 'Agenda de vencimentos');
      for (const item of report.items) {
        this.ensureSpace(document, 58);
        document.fontSize(9).text(`${item.code} | ${item.status} | ${this.date(item.endDate, report.tenant.timezone)}`);
        document
          .fontSize(8)
          .text(item.object)
          .text(item.supplier.tradeName || item.supplier.legalName)
          .text(`Valor atual: ${this.money(item.currentValue)}`)
          .moveDown(0.5);
      }
    });
  }

  async expiringContractsCsv(
    tenantId: string,
    query: ExpiringContractsQuery,
  ): Promise<Buffer> {
    const report = await this.expiringContractsData(tenantId, query);
    return this.csv([
      ['Código', 'Objeto', 'Status', 'Fornecedor', 'Início', 'Término', 'Valor atual', 'Medido', 'Pago'],
      ...report.items.map((item) => [
        item.code,
        item.object,
        item.status,
        item.supplier.tradeName || item.supplier.legalName,
        this.date(item.startDate, report.tenant.timezone),
        this.date(item.endDate, report.tenant.timezone),
        item.currentValue,
        item.measuredValue,
        item.paidValue,
      ]),
      [],
      ['Organização', report.tenant.name],
      ['Janela em dias', query.days],
      ['Hash SHA-256', report.hash],
    ]);
  }

  async contractMirrorPdf(tenantId: string, id: string): Promise<Buffer> {
    const [tenant, contract] = await Promise.all([
      this.tenant(tenantId),
      this.contract(tenantId, id),
    ]);
    const hash = this.hash(contract);
    return this.renderPdf(tenant.name, `Espelho do contrato ${contract.code}`, (document) => {
      this.reportMetadata(document, new Date(), hash, 'Cadastro e execução financeira');
      const balance = Number(contract.currentValue) - Number(contract.measuredValue);
      const payable = Number(contract.measuredValue) - Number(contract.paidValue);
      this.metricCards(document, [
        ['Valor vigente', this.money(contract.currentValue)],
        ['Medido', this.money(contract.measuredValue)],
        ['Pago', this.money(contract.paidValue)],
        ['Saldo a medir', this.money(balance)],
      ]);
      this.sectionTitle(document, 'Identificação contratual');
      this.label(document, 'Objeto', contract.object);
      this.label(document, 'Processo', contract.administrativeProcess || 'Não informado');
      this.label(document, 'Status / tipo', `${contract.status} / ${contract.type}`);
      this.label(
        document,
        'Vigência',
        `${this.date(contract.startDate, tenant.timezone)} a ${this.date(contract.endDate, tenant.timezone)}`,
      );
      this.label(
        document,
        'Fornecedor',
        `${contract.supplier.tradeName || contract.supplier.legalName} | ${contract.supplier.taxId}`,
      );
      this.label(document, 'Gestor', contract.manager?.name || 'Não definido');
      this.label(document, 'Fiscal', contract.inspector?.name || 'Não definido');
      this.label(
        document,
        'Edificações',
        contract.buildings.map((link) => `${link.building.code} - ${link.building.name}`).join('; ') || 'Nenhuma',
      );
      this.sectionTitle(document, 'Execução financeira');
      this.label(document, 'Valor original', this.money(contract.originalValue));
      this.label(document, 'Valor atual', this.money(contract.currentValue));
      this.label(document, 'Valor medido', this.money(contract.measuredValue));
      this.label(document, 'Valor pago', this.money(contract.paidValue));
      this.label(
        document,
        'Saldo a medir',
        this.money(balance),
      );
      this.label(
        document,
        'Saldo medido a pagar',
        this.money(payable),
      );
      this.label(document, 'Ordens de serviço vinculadas', contract._count.workOrders);
      this.label(document, 'Empenhos emitidos', contract.commitments.length);
      this.label(document, 'Boletins de medição', contract.measurements.length);
      this.sectionTitle(document, 'Aditivos e reajustes');
      if (!contract.amendments.length && !contract.adjustments.length) {
        document.fontSize(9).text('Nenhum aditivo ou reajuste registrado.');
      }
      for (const amendment of contract.amendments) {
        document.fontSize(8).text(`Aditivo ${amendment.number} | ${amendment.type} | ${amendment.description}`);
      }
      for (const adjustment of contract.adjustments) {
        document.fontSize(8).text(`Reajuste ${adjustment.referencePeriod} | ${adjustment.type} | ${this.money(adjustment.amount)}`);
      }
      this.sectionTitle(document, 'Medições');
      if (!contract.measurements.length) document.fontSize(9).text('Nenhuma medição registrada.');
      for (const measurement of contract.measurements) {
        document.fontSize(8).text(`${measurement.number} | ${measurement.referenceMonth} | ${measurement.status} | líquido ${this.money(measurement.netAmount)}`);
      }
      this.sectionTitle(document, 'Empenhos');
      if (!contract.commitments.length) document.fontSize(9).text('Nenhum empenho registrado.');
      for (const commitment of contract.commitments) {
        document.fontSize(8).text(`${commitment.number}/${commitment.fiscalYear} | ${this.date(commitment.issueDate, tenant.timezone)} | ${this.money(commitment.originalValue)} | ${commitment.movements.length} movimento(s)`);
      }
    });
  }

  async contractFinancialCsv(tenantId: string, id: string): Promise<Buffer> {
    const [tenant, contract] = await Promise.all([
      this.tenant(tenantId),
      this.contract(tenantId, id),
    ]);
    const rows: unknown[][] = [
      ['Contrato', contract.code],
      ['Organização', tenant.name],
      ['Fornecedor', contract.supplier.tradeName || contract.supplier.legalName],
      ['Valor original', contract.originalValue],
      ['Valor atual', contract.currentValue],
      ['Valor medido', contract.measuredValue],
      ['Valor pago', contract.paidValue],
      ['Saldo a medir', Number(contract.currentValue) - Number(contract.measuredValue)],
      ['Saldo medido a pagar', Number(contract.measuredValue) - Number(contract.paidValue)],
      [],
      ['Medição', 'Competência', 'Status', 'Bruto', 'Deduções', 'Líquido', 'Pagamento'],
      ...contract.measurements.map((measurement) => [
        measurement.number,
        measurement.referenceMonth,
        measurement.status,
        measurement.grossAmount,
        measurement.deductions,
        measurement.netAmount,
        measurement.paidAt ? this.date(measurement.paidAt, tenant.timezone) : '',
      ]),
      [],
      ['Empenho', 'Exercício', 'Emissão', 'Valor original', 'Movimentações'],
      ...contract.commitments.map((commitment) => [
        commitment.number,
        commitment.fiscalYear,
        this.date(commitment.issueDate, tenant.timezone),
        commitment.originalValue,
        commitment.movements.length,
      ]),
      [],
      ['Hash SHA-256', this.hash(contract)],
    ];
    return this.csv(rows);
  }

  private async backlogData(tenantId: string, query: ListWorkOrdersQuery) {
    const effective = Object.assign(new ListWorkOrdersQuery(), query, {
      backlogOnly: true,
      status: undefined,
      page: 1,
      pageSize: 100,
    });
    const [tenant, result] = await Promise.all([
      this.tenant(tenantId),
      this.workOrders.listForReport(tenantId, effective),
    ]);
    const generatedAt = new Date();
    const filters = this.workOrderFilters(effective);
    const hash = this.hash({
      tenantId,
      filters,
      rows: result.items.map((item) => [item.id, item.updatedAt]),
    });
    return {
      ...result,
      tenant,
      generatedAt,
      filters,
      hash,
      overdue: result.items.filter((item) => this.isOverdue(item)).length,
    };
  }

  private async expiringContractsData(
    tenantId: string,
    query: ExpiringContractsQuery,
  ) {
    const tenant = await this.tenant(tenantId);
    const generatedAt = new Date();
    const until = new Date(generatedAt.getTime() + query.days * 24 * 60 * 60_000);
    const items = await this.prisma.contract.findMany({
      where: {
        tenantId,
        deletedAt: null,
        supplierId: query.supplierId,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
        endDate: { gte: generatedAt, lte: until },
      },
      include: { supplier: { select: { legalName: true, tradeName: true } } },
      orderBy: [{ endDate: 'asc' }, { code: 'asc' }],
    });
    return {
      tenant,
      generatedAt,
      items,
      hash: this.hash({ tenantId, days: query.days, rows: items.map((item) => [item.id, item.updatedAt]) }),
    };
  }

  private async tenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, name: true, timezone: true },
    });
    if (!tenant) throw new NotFoundException('Organização não encontrada.');
    return tenant;
  }

  private async contract(tenantId: string, id: string): Promise<ContractReport> {
    const contract = await this.prisma.contract.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: CONTRACT_REPORT_INCLUDE,
    });
    if (!contract) throw new NotFoundException('Contrato não encontrado.');
    return contract;
  }

  private renderPdf(
    tenantName: string,
    title: string,
    render: (document: PdfWriter) => void,
  ): Promise<Buffer> {
    const document = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: title, Author: 'Gestão de Prédios' } });
    const chunks: Buffer[] = [];
    const output = new Promise<Buffer>((resolve, reject) => {
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    document.rect(0, 0, 595, 92).fill('#0e425d');
    document.fillColor('#ffffff').fontSize(10).text('GESTÃO DE PRÉDIOS', 42, 25, { characterSpacing: 1.2 });
    document.fontSize(18).text(title, 42, 43, { width: 510 });
    document.fontSize(8).text(tenantName, 42, 70, { width: 510, align: 'right' });
    document.y = 110;
    document.fillColor('#10233a');
    render(document);
    const pages = document.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      document.switchToPage(index);
      document.rect(0, 792, 595, 50).fill('#f1f5f8');
      document.fontSize(7).fillColor('#526174')
        .text('Documento gerado eletronicamente · Gestão de Prédios', 42, 806, { width: 360 })
        .text(`Página ${index + 1} de ${pages.count}`, 402, 806, { align: 'right', width: 150 });
    }
    document.end();
    return output;
  }

  private reportMetadata(
    document: PdfWriter,
    generatedAt: Date,
    hash: string,
    filters: string,
  ): void {
    document
      .fontSize(8)
      .fillColor('#526174')
      .text(`Emitido em: ${generatedAt.toLocaleString('pt-BR')}`)
      .text(`Filtros: ${filters}`)
      .text(`Integridade SHA-256: ${hash}`)
      .fillColor('#000000')
      .moveDown();
  }

  private metricCards(document: PdfWriter, metrics: Array<[string, unknown]>): void {
    this.ensureSpace(document, 70);
    const gap = 8;
    const width = (511 - gap * (metrics.length - 1)) / metrics.length;
    const top = document.y;
    metrics.forEach(([label, value], index) => {
      const left = 42 + index * (width + gap);
      document.roundedRect(left, top, width, 52, 5).fillAndStroke('#f3f7fa', '#d9e3ea');
      document.fillColor('#587084').fontSize(7).text(label.toUpperCase(), left + 9, top + 9, { width: width - 18 });
      document.fillColor('#10233a').fontSize(11).text(String(value), left + 9, top + 27, { width: width - 18, ellipsis: true });
    });
    document.y = top + 66;
  }

  private sectionTitle(document: PdfWriter, title: string): void {
    this.ensureSpace(document, 38);
    document.moveDown(0.4);
    const top = document.y;
    document.rect(42, top, 4, 17).fill('#e5a33b');
    document.fillColor('#10233a').fontSize(11).text(title, 53, top + 2, { width: 499 });
    document.y = top + 25;
  }

  private workOrderRow(document: PdfWriter, item: WorkOrderReport, timezone: string): void {
    this.ensureSpace(document, 72);
    const supplier = item.supplier?.tradeName || item.supplier?.legalName || 'Sem fornecedor';
    const top = document.y;
    document.roundedRect(42, top, 511, 58, 4).fillAndStroke('#ffffff', '#dce5eb');
    document.fillColor(this.isOverdue(item) ? '#a33a3a' : '#0e5a76').fontSize(9).text(`${item.number} · ${item.status} · ${item.priority}`, 51, top + 8, { width: 493 });
    document
      .fillColor('#10233a')
      .fontSize(8)
      .text(`${item.title} — ${item.building.code}/${item.building.name}`, 51, top + 22, { width: 493 })
      .text(`Demandante: ${item.requester.name} · Fornecedor: ${supplier}`, 51, top + 34, { width: 493 })
      .text(
        `Abertura: ${this.date(item.openedAt, timezone)} | SLA: ${item.slaResolutionDeadline ? this.dateTime(item.slaResolutionDeadline, timezone) : 'não calculado'}`,
        51, top + 46, { width: 493 },
      );
    document.y = top + 66;
  }

  private ensureSpace(document: PdfWriter, height: number): void {
    if (document.y + height > 770) document.addPage();
  }

  private label(document: PdfWriter, label: string, value: unknown): void {
    this.ensureSpace(document, 30);
    document.fontSize(8).fillColor('#526174').text(label, { continued: true });
    document.fillColor('#000000').text(`: ${String(value ?? '')}`);
  }

  private workOrderFilters(query: ListWorkOrdersQuery): string {
    const filters = [
      query.search ? `busca=${query.search.trim()}` : '',
      query.status ? `status=${query.status}` : 'status=backlog',
      query.priority ? `prioridade=${query.priority}` : '',
      query.buildingId ? `edificação=${query.buildingId}` : '',
      query.supplierId ? `fornecedor=${query.supplierId}` : '',
      query.requesterUserId ? `demandante=${query.requesterUserId}` : '',
      query.assignedToUserId ? `responsável=${query.assignedToUserId}` : '',
      query.categoryId ? `categoria=${query.categoryId}` : '',
      query.contractId ? `contrato=${query.contractId}` : '',
      query.hasOpenPendency ? 'pendência=aberta' : '',
      query.overdue ? 'sla=vencido' : '',
      query.openedFrom ? `abertura>=${query.openedFrom}` : '',
      query.openedTo ? `abertura<=${query.openedTo}` : '',
      query.ageMinDays !== undefined ? `idade>=${query.ageMinDays}d` : '',
      query.ageMaxDays !== undefined ? `idade<=${query.ageMaxDays}d` : '',
    ].filter(Boolean);
    return filters.join('; ') || 'backlog completo';
  }

  private isOverdue(item: WorkOrderReport): boolean {
    return Boolean(
      item.slaResolutionDeadline &&
        OPEN_WORK_ORDER_STATUSES.includes(item.status) &&
        item.slaResolutionDeadline < new Date(),
    );
  }

  private csv(rows: unknown[][]): Buffer {
    const content = rows
      .map((row) => row.map((value) => this.csvCell(value)).join(';'))
      .join('\r\n');
    return Buffer.from(`\uFEFF${content}`, 'utf8');
  }

  private csvCell(value: unknown): string {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private money(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'Não informado';
    const number = Number(value);
    return Number.isFinite(number)
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number)
      : String(value);
  }

  private date(value: Date, timezone: string): string {
    return value.toLocaleDateString('pt-BR', { timeZone: timezone });
  }

  private dateTime(value: Date, timezone: string): string {
    return value.toLocaleString('pt-BR', { timeZone: timezone });
  }
}
