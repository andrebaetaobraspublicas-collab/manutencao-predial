import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  AuditAction,
  BudgetStatus,
  ContractStatus,
  MaintenanceGenerationStatus,
  MeasurementStatus,
  MembershipStatus,
  Prisma,
  WorkOrderStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  PilotAcceptanceOutcomeDto,
  RecordPilotAcceptanceDto,
  RecordPilotDecisionDto,
} from './dto/pilot.dto';
import {
  isPilotScenarioCode,
  PILOT_SCENARIOS,
  type PilotAcceptanceOutcome,
  type PilotAutomaticStatus,
  type PilotDecisionOutcome,
  type PilotScenarioCode,
  summarizePilot,
} from './pilot-rules';

type AutomaticCheck = {
  status: PilotAutomaticStatus;
  message: string;
  metrics: Record<string, string | number | boolean>;
};

type DecisionView = {
  outcome: PilotDecisionOutcome;
  note: string;
  evidenceReference: string | null;
  recordedAt: Date;
  recordedBy: { id: string; name: string; email: string } | null;
};

@Injectable()
export class PilotService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string) {
    const [tenant, checks, logs, acceptanceLog] = await Promise.all([
      this.prisma.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { id: true, name: true, slug: true, status: true, timezone: true },
      }),
      this.automaticChecks(tenantId),
      this.prisma.auditLog.findMany({
        where: { tenantId, entityType: 'PilotHomologation' },
        orderBy: { occurredAt: 'desc' },
        take: 500,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.findFirst({
        where: { tenantId, entityType: 'PilotAcceptance' },
        orderBy: { occurredAt: 'desc' },
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    if (!tenant) throw new NotFoundException('Organização não encontrada.');

    const decisions = new Map<PilotScenarioCode, DecisionView>();
    for (const log of logs) {
      if (!log.entityId || !isPilotScenarioCode(log.entityId) || decisions.has(log.entityId)) continue;
      const data = this.jsonObject(log.afterData);
      if (!data) continue;
      const outcome = data.outcome;
      if (!this.isDecisionOutcome(outcome)) continue;
      decisions.set(log.entityId, {
        outcome,
        note: typeof data.note === 'string' ? data.note : '',
        evidenceReference: typeof data.evidenceReference === 'string' ? data.evidenceReference : null,
        recordedAt: log.occurredAt,
        recordedBy: log.actor,
      });
    }

    const acceptance = this.acceptanceView(acceptanceLog);
    const scenarios = PILOT_SCENARIOS.map((definition) => ({
      ...definition,
      automatic: checks[definition.code],
      decision: decisions.get(definition.code) ?? null,
    }));
    const summary = summarizePilot(
      scenarios.map((scenario) => ({
        automaticStatus: scenario.automatic.status,
        decisionOutcome: scenario.decision?.outcome,
      })),
      acceptance?.outcome,
    );

    return {
      tenant,
      environment: {
        name: 'PRODUCTION_TEST',
        stagingExcluded: true,
        notice: 'Por decisão do proprietário, o banco de produção atual é usado somente para testes do piloto.',
      },
      summary,
      scenarios,
      acceptance,
      generatedAt: new Date(),
    };
  }

  async recordDecision(
    tenantId: string,
    actor: AuthenticatedUser,
    code: string,
    dto: RecordPilotDecisionDto,
  ) {
    if (!isPilotScenarioCode(code)) throw new NotFoundException('Cenário de homologação não encontrado.');
    const definition = PILOT_SCENARIOS.find((item) => item.code === code)!;
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.userId,
        action: AuditAction.STATUS_CHANGE,
        entityType: 'PilotHomologation',
        entityId: code,
        afterData: {
          scenarioCode: code,
          scenarioTitle: definition.title,
          outcome: dto.outcome,
          note: dto.note.trim(),
          evidenceReference: dto.evidenceReference?.trim() || null,
          actorRole: actor.role,
          recordedAt: new Date().toISOString(),
        },
      },
    });
    return this.overview(tenantId);
  }

  async recordAcceptance(tenantId: string, actor: AuthenticatedUser, dto: RecordPilotAcceptanceDto) {
    const current = await this.overview(tenantId);
    if (dto.outcome === PilotAcceptanceOutcomeDto.APPROVED && !current.summary.canAccept) {
      throw new BadRequestException('Todos os cenários devem estar automaticamente aptos e homologados antes do aceite final.');
    }
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.userId,
        action: AuditAction.STATUS_CHANGE,
        entityType: 'PilotAcceptance',
        entityId: tenantId,
        afterData: {
          outcome: dto.outcome,
          note: dto.note.trim(),
          actorRole: actor.role,
          release: '0.10.0',
          readinessSnapshot: current.summary,
          recordedAt: new Date().toISOString(),
        },
      },
    });
    return this.overview(tenantId);
  }

  async csv(tenantId: string, actorUserId: string) {
    const overview = await this.overview(tenantId);
    const rows: Array<Array<string | number>> = [
      ['Código', 'Cenário', 'Categoria', 'Verificação automática', 'Decisão', 'Responsável', 'Data', 'Evidência', 'Observação'],
      ...overview.scenarios.map((scenario) => [
        scenario.code,
        scenario.title,
        scenario.category,
        scenario.automatic.status,
        scenario.decision?.outcome ?? 'SEM_DECISAO',
        scenario.decision?.recordedBy?.name ?? '',
        scenario.decision?.recordedAt.toISOString() ?? '',
        scenario.decision?.evidenceReference ?? '',
        scenario.decision?.note ?? '',
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => this.csvCell(value)).join(';')).join('\r\n');
    await this.auditExport(tenantId, actorUserId, 'PilotHomologationCsv');
    return Buffer.from(`\uFEFF${csv}`, 'utf8');
  }

  async pdf(tenantId: string, actorUserId: string) {
    const overview = await this.overview(tenantId);
    const output = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(18).text('GP-044 — Homologação do piloto');
      doc.fontSize(10).text(overview.tenant.name);
      doc.text(`Situação: ${overview.summary.status} | Progresso: ${overview.summary.progressPercentage}%`);
      doc.text(`Emitido em ${overview.generatedAt.toISOString()}`).moveDown();
      for (const scenario of overview.scenarios) {
        if (doc.y > 690) doc.addPage();
        doc.fontSize(11).text(`${scenario.code} — ${scenario.title}`);
        doc.fontSize(9).text(`Automático: ${scenario.automatic.status} | Decisão: ${scenario.decision?.outcome ?? 'SEM_DECISAO'}`);
        doc.text(scenario.automatic.message);
        if (scenario.decision?.note) doc.text(`Registro: ${scenario.decision.note}`);
        if (scenario.decision?.evidenceReference) doc.text(`Evidência: ${scenario.decision.evidenceReference}`);
        doc.moveDown(0.7);
      }
      if (overview.acceptance) {
        doc.moveDown().fontSize(11).text(`Aceite final: ${overview.acceptance.outcome}`);
        doc.fontSize(9).text(overview.acceptance.note);
      }
      doc.end();
    });
    await this.auditExport(tenantId, actorUserId, 'PilotHomologationPdf');
    return output;
  }

  private async automaticChecks(tenantId: string): Promise<Record<PilotScenarioCode, AutomaticCheck>> {
    const [
      memberships,
      buildings,
      suppliers,
      contracts,
      categories,
      slaPolicies,
      closedWorkOrders,
      qualifiedWorkOrders,
      commitments,
      paidMeasurements,
      sinapiCatalogs,
      approvedBudgets,
      maintenancePlans,
      generatedMaintenance,
      kpiMeasurements,
    ] = await Promise.all([
      this.prisma.tenantMembership.findMany({
        where: { tenantId, status: MembershipStatus.ACTIVE, user: { status: 'ACTIVE', deletedAt: null } },
        select: { role: true },
      }),
      this.prisma.building.count({ where: { tenantId, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.supplier.count({ where: { tenantId, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.contract.count({ where: { tenantId, deletedAt: null, status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] }, buildings: { some: {} } } }),
      this.prisma.operationalCatalogItem.count({ where: { tenantId, kind: 'CATEGORY', active: true, deletedAt: null } }),
      this.prisma.slaPolicy.count({ where: { tenantId, active: true } }),
      this.prisma.workOrder.count({ where: { tenantId, deletedAt: null, status: WorkOrderStatus.CLOSED } }),
      this.prisma.workOrder.count({ where: {
        tenantId,
        deletedAt: null,
        status: WorkOrderStatus.CLOSED,
        acceptedByUserId: { not: null },
        solution: { not: null },
        finalCost: { gt: 0 },
        comments: { some: {} },
        checklistItems: { some: { responses: { some: { checked: true } } } },
        attachments: { some: { deletedAt: null } },
      } }),
      this.prisma.commitment.count({ where: { tenantId, canceledAt: null } }),
      this.prisma.measurement.count({ where: { tenantId, status: MeasurementStatus.PAID, items: { some: {} } } }),
      this.prisma.sinapiCatalog.count({ where: { tenantId, active: true, itemCount: { gt: 0 } } }),
      this.prisma.workOrderBudget.count({ where: { tenantId, status: BudgetStatus.APPROVED, total: { gt: 0 } } }),
      this.prisma.maintenancePlan.count({ where: { tenantId, active: true, suspendedAt: null } }),
      this.prisma.maintenancePlanGeneration.count({ where: { tenantId, status: MaintenanceGenerationStatus.GENERATED, workOrderId: { not: null } } }),
      this.prisma.kpiMeasurement.count({ where: { tenantId } }),
    ]);

    const roles = new Set(memberships.map((item) => item.role));
    const check = (
      passed: boolean,
      message: string,
      metrics: Record<string, string | number | boolean>,
    ): AutomaticCheck => ({ status: passed ? 'PASSED' : 'PENDING', message, metrics });

    return {
      MASTER_DATA: check(
        memberships.length > 0 && buildings > 0 && suppliers > 0 && contracts > 0 && categories > 0 && slaPolicies > 0,
        'Requer ao menos um membro ativo, prédio, fornecedor, contrato vigente com cobertura, categoria e política de SLA.',
        { members: memberships.length, buildings, suppliers, contracts, categories, slaPolicies },
      ),
      WORK_ORDER_CYCLE: check(
        qualifiedWorkOrders > 0,
        'Requer uma OS fechada com aceite, solução, custo final, comentário, checklist respondido e anexo privado.',
        { closedWorkOrders, fullyEvidencedWorkOrders: qualifiedWorkOrders },
      ),
      FINANCIAL_RECONCILIATION: check(
        commitments > 0 && paidMeasurements > 0,
        'Requer empenho ativo e medição paga contendo ao menos uma OS.',
        { commitments, paidMeasurements },
      ),
      BUDGET_SINAPI: check(
        sinapiCatalogs > 0 && approvedBudgets > 0,
        'Requer catálogo SINAPI com itens e orçamento de OS aprovado com valor positivo.',
        { sinapiCatalogs, approvedBudgets },
      ),
      PREVENTIVE_MAINTENANCE: check(
        maintenancePlans > 0 && generatedMaintenance > 0,
        'Requer plano ativo e geração preventiva concluída com vínculo à OS.',
        { activePlans: maintenancePlans, generatedWorkOrders: generatedMaintenance },
      ),
      KPI_REPORTS: check(
        kpiMeasurements > 0,
        'Requer indicadores calculados; a conciliação dos relatórios ainda depende de decisão humana.',
        { kpiMeasurements },
      ),
      ACCESS_SECURITY: check(
        roles.size >= 2,
        'Requer ao menos dois papéis ativos; revogação, hierarquia e anexos privados devem ser homologados manualmente.',
        { activeMembers: memberships.length, distinctRoles: roles.size },
      ),
      BACKUP_RECOVERY: {
        status: 'MANUAL',
        message: 'Registrar a referência do backup, hash e resultado do ensaio de restauração.',
        metrics: { automatedCheck: false },
      },
      USER_ACCEPTANCE: {
        status: 'MANUAL',
        message: 'Registrar a confirmação dos usuários responsáveis após executar o roteiro completo.',
        metrics: { automatedCheck: false },
      },
    };
  }

  private acceptanceView(log: Awaited<ReturnType<typeof this.latestAcceptanceShape>> | null) {
    if (!log) return null;
    const data = this.jsonObject(log.afterData);
    if (!data) return null;
    const outcome = data.outcome;
    if (outcome !== 'APPROVED' && outcome !== 'REJECTED') return null;
    return {
      outcome: outcome as PilotAcceptanceOutcome,
      note: typeof data.note === 'string' ? data.note : '',
      recordedAt: log.occurredAt,
      recordedBy: log.actor,
    };
  }

  private latestAcceptanceShape() {
    return this.prisma.auditLog.findFirst({ include: { actor: { select: { id: true, name: true, email: true } } } });
  }

  private jsonObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, Prisma.JsonValue>
      : null;
  }

  private isDecisionOutcome(value: unknown): value is PilotDecisionOutcome {
    return value === 'PASSED' || value === 'FAILED' || value === 'BLOCKED' || value === 'PENDING';
  }

  private csvCell(value: string | number) {
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  private auditExport(tenantId: string, actorUserId: string, entityType: string) {
    return this.prisma.auditLog.create({
      data: { tenantId, actorUserId, action: AuditAction.EXPORT, entityType, afterData: { exportedAt: new Date().toISOString() } },
    });
  }
}
