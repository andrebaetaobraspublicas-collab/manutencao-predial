import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import {
  BillingInterval,
  AdjustmentType,
  AmendmentType,
  AssetCriticality,
  BudgetItemKind,
  BudgetStage,
  BudgetStatus,
  CommitmentMovementType,
  ContractStatus,
  ContractType,
  KpiCategory,
  KpiDirection,
  FrequencyUnit,
  MaintenancePlanType,
  MeasurementStatus,
  MembershipRole,
  MembershipStatus,
  OperationalCatalogKind,
  PenaltyType,
  PrismaClient,
  SlaTimeMode,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../src/generated/prisma/client';
import { parseMySqlUrl } from '../src/prisma/database-url';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL não configurada.');

function requireSeedAdminPassword(): string {
  const value = process.env.SEED_ADMIN_PASSWORD;
  if (!value || value.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD deve possuir pelo menos 12 caracteres.');
  }
  return value;
}

const seedAdminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@gestaodepredios.com.br';

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(parseMySqlUrl(databaseUrl)),
});

const kpis = [
  ['SLA_COMPLIANCE', 'Cumprimento do SLA de resolução', KpiCategory.SLA, '%', KpiDirection.HIGHER_IS_BETTER, 95],
  ['MTTA_HOURS', 'Tempo médio até o primeiro atendimento', KpiCategory.OPERATIONAL, 'horas', KpiDirection.LOWER_IS_BETTER, 4],
  ['MTTR_HOURS', 'Tempo médio para resolução', KpiCategory.RELIABILITY, 'horas', KpiDirection.LOWER_IS_BETTER, 24],
  ['BACKLOG_TOTAL', 'Backlog total de ordens de serviço', KpiCategory.OPERATIONAL, 'OS', KpiDirection.LOWER_IS_BETTER, 20],
  ['BACKLOG_OVER_30D', 'OS abertas há mais de 30 dias', KpiCategory.OPERATIONAL, 'OS', KpiDirection.LOWER_IS_BETTER, 0],
  ['USER_SATISFACTION', 'Índice de satisfação do usuário', KpiCategory.SATISFACTION, 'nota 1-5', KpiDirection.HIGHER_IS_BETTER, 4.5],
  ['NPS', 'Net Promoter Score dos usuários', KpiCategory.SATISFACTION, 'pontos', KpiDirection.HIGHER_IS_BETTER, 60],
  ['CORRECTIVE_RECURRENCE', 'Taxa de reincidência de manutenção corretiva', KpiCategory.RELIABILITY, '%', KpiDirection.LOWER_IS_BETTER, 5],
  ['CORRECTIVE_FAILURE_REDUCTION', 'Redução de falhas corretivas por manutenção preventiva', KpiCategory.RELIABILITY, '%', KpiDirection.HIGHER_IS_BETTER, 15],
  ['PREVENTIVE_COMPLIANCE', 'Execução do plano preventivo no prazo', KpiCategory.OPERATIONAL, '%', KpiDirection.HIGHER_IS_BETTER, 95],
  ['ENERGY_REDUCTION', 'Redução do consumo de energia', KpiCategory.SUSTAINABILITY, '%', KpiDirection.HIGHER_IS_BETTER, 5],
  ['WATER_REDUCTION', 'Redução do consumo de água', KpiCategory.SUSTAINABILITY, '%', KpiDirection.HIGHER_IS_BETTER, 5],
  ['WASTE_DIVERSION', 'Resíduos destinados à reciclagem/reuso', KpiCategory.SUSTAINABILITY, '%', KpiDirection.HIGHER_IS_BETTER, 60],
  ['CONTRACT_EXECUTION', 'Execução financeira do contrato', KpiCategory.FINANCIAL, '%', KpiDirection.TARGET_RANGE, 100],
  ['SAFETY_COMPLIANCE', 'Conformidade documental de segurança do trabalho', KpiCategory.SAFETY, '%', KpiDirection.HIGHER_IS_BETTER, 100],
] as const;

const defaultSlaByPriority: Record<
  WorkOrderPriority,
  { responseMinutes: number; resolutionMinutes: number }
> = {
  LOW: { responseMinutes: 1440, resolutionMinutes: 7200 },
  NORMAL: { responseMinutes: 480, resolutionMinutes: 4320 },
  HIGH: { responseMinutes: 240, resolutionMinutes: 1440 },
  URGENT: { responseMinutes: 60, resolutionMinutes: 480 },
  CRITICAL: { responseMinutes: 15, resolutionMinutes: 240 },
};

async function provisionOperationalSeed(tenantId: string, timezone: string) {
  const catalogDefinitions = [
    {
      kind: OperationalCatalogKind.CATEGORY,
      code: 'GERAL',
      name: 'Serviços gerais',
      requireAcceptance: true,
    },
    {
      kind: OperationalCatalogKind.CATEGORY,
      code: 'HIDRAULICA',
      name: 'Hidráulica',
      defaultPriority: WorkOrderPriority.HIGH,
      requirePhotoBefore: true,
      requirePhotoAfter: true,
      requireChecklist: true,
      requireFinalCost: true,
      requireAcceptance: true,
    },
    {
      kind: OperationalCatalogKind.CATEGORY,
      code: 'ELETRICA',
      name: 'Elétrica',
      defaultPriority: WorkOrderPriority.HIGH,
      requirePhotoBefore: true,
      requirePhotoAfter: true,
      requireChecklist: true,
      requireAcceptance: true,
    },
    {
      kind: OperationalCatalogKind.CATEGORY,
      code: 'CLIMATIZACAO',
      name: 'Climatização',
      defaultPriority: WorkOrderPriority.NORMAL,
      requireChecklist: true,
      requireAcceptance: true,
    },
    { kind: OperationalCatalogKind.SPECIALTY, code: 'HIDRAULICA', name: 'Hidráulica' },
    { kind: OperationalCatalogKind.SPECIALTY, code: 'ELETRICA', name: 'Elétrica' },
    { kind: OperationalCatalogKind.SPECIALTY, code: 'HVAC', name: 'Climatização e HVAC' },
    { kind: OperationalCatalogKind.ENVIRONMENT, code: 'BANHEIRO', name: 'Banheiro' },
    { kind: OperationalCatalogKind.ENVIRONMENT, code: 'AREA_TECNICA', name: 'Área técnica' },
    { kind: OperationalCatalogKind.ENVIRONMENT, code: 'ESCRITORIO', name: 'Escritório' },
    { kind: OperationalCatalogKind.CAUSE, code: 'DESGASTE', name: 'Desgaste natural' },
    { kind: OperationalCatalogKind.CAUSE, code: 'FALHA_COMPONENTE', name: 'Falha de componente' },
    { kind: OperationalCatalogKind.CAUSE, code: 'NAO_IDENTIFICADA', name: 'Não identificada' },
  ] as const;

  const catalogs = new Map<string, Awaited<ReturnType<typeof prisma.operationalCatalogItem.upsert>>>();
  for (const definition of catalogDefinitions) {
    const item = await prisma.operationalCatalogItem.upsert({
      where: {
        tenantId_kind_code: {
          tenantId,
          kind: definition.kind,
          code: definition.code,
        },
      },
      create: { tenantId, ...definition },
      update: {},
    });
    catalogs.set(`${definition.kind}:${definition.code}`, item);
  }

  const checklistByCategory = {
    HIDRAULICA: ['Isolar o abastecimento', 'Executar reparo e teste de estanqueidade'],
    ELETRICA: ['Desenergizar e sinalizar o circuito', 'Testar proteções antes da energização'],
    CLIMATIZACAO: ['Verificar filtros e dreno', 'Registrar temperatura após estabilização'],
  } as const;
  for (const [categoryCode, labels] of Object.entries(checklistByCategory)) {
    const category = catalogs.get(`${OperationalCatalogKind.CATEGORY}:${categoryCode}`)!;
    for (const [sortOrder, label] of labels.entries()) {
      const existing = await prisma.checklistTemplateItem.findFirst({
        where: { tenantId, categoryId: category.id, label },
      });
      if (!existing) {
        await prisma.checklistTemplateItem.create({
          data: { tenantId, categoryId: category.id, label, required: true, sortOrder },
        });
      }
    }
  }

  const calendar = await prisma.slaCalendar.upsert({
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
  const policies = new Map<WorkOrderPriority, Awaited<ReturnType<typeof prisma.slaPolicy.upsert>>>();
  for (const priority of Object.values(WorkOrderPriority)) {
    const rule = defaultSlaByPriority[priority];
    const policy = await prisma.slaPolicy.upsert({
      where: { tenantId_code: { tenantId, code: `PADRAO_${priority}` } },
      create: {
        tenantId,
        calendarId: calendar.id,
        code: `PADRAO_${priority}`,
        name: `SLA padrão ${priority}`,
        priority,
        responseMinutes: rule.responseMinutes,
        resolutionMinutes: rule.resolutionMinutes,
        warningMinutesBefore: Math.min(60, rule.responseMinutes),
      },
      update: {},
    });
    policies.set(priority, policy);
  }

  return { catalogs, calendar, policies };
}

async function provisionFunctionalDemoData(input: {
  tenantId: string; userId: string; buildingId: string; supplierId: string; contractId: string;
}) {
  const { tenantId, userId, buildingId, supplierId, contractId } = input;
  const categories = await prisma.operationalCatalogItem.findMany({
    where: { tenantId, kind: OperationalCatalogKind.CATEGORY, deletedAt: null },
  });
  const categoryByCode = new Map(categories.map((item) => [item.code, item]));
  for (const code of ['HIDRAULICA', 'ELETRICA', 'CLIMATIZACAO']) {
    const category = categoryByCode.get(code);
    if (category) await prisma.supplierServiceArea.upsert({
      where: { supplierId_categoryId: { supplierId, categoryId: category.id } },
      create: { tenantId, supplierId, categoryId: category.id }, update: { deletedAt: null },
    });
  }

  const secondSupplier = await prisma.supplier.upsert({
    where: { tenantId_taxId: { tenantId, taxId: '98.765.432/0001-10' } },
    create: { tenantId, legalName: 'Engenharia Técnica Centro-Oeste Ltda.', tradeName: 'ETCO Engenharia',
      taxId: '98.765.432/0001-10', email: 'contato@etco.exemplo', phone: '(61) 3333-4000',
      addressLine1: 'SIA Trecho 3, Lote 120', city: 'Brasília', state: 'DF', postalCode: '71200-030', rating: 4.4 },
    update: {},
  });
  const consortium = await prisma.supplier.upsert({
    where: { tenantId_taxId: { tenantId, taxId: '11.222.333/0001-44' } },
    create: { tenantId, legalName: 'Consórcio Manutenção Integrada DF', tradeName: 'CMI-DF',
      taxId: '11.222.333/0001-44', kind: 'CONSORTIUM', email: 'gestao@cmidf.exemplo', city: 'Brasília', state: 'DF' }, update: {},
  });
  await prisma.supplierConsortiumMember.upsert({
    where: { consortiumId_memberSupplierId: { consortiumId: consortium.id, memberSupplierId: supplierId } },
    create: { tenantId, consortiumId: consortium.id, memberSupplierId: supplierId, participationPercentage: 60, isLeader: true }, update: {},
  });
  await prisma.supplierConsortiumMember.upsert({
    where: { consortiumId_memberSupplierId: { consortiumId: consortium.id, memberSupplierId: secondSupplier.id } },
    create: { tenantId, consortiumId: consortium.id, memberSupplierId: secondSupplier.id, participationPercentage: 40 }, update: {},
  });

  const adjustment = await prisma.contractAdjustment.findFirst({ where: { tenantId, contractId, referencePeriod: '2026-01', type: AdjustmentType.PRICE_ADJUSTMENT } });
  if (!adjustment) await prisma.contractAdjustment.create({ data: { tenantId, contractId, type: AdjustmentType.PRICE_ADJUSTMENT,
    referencePeriod: '2026-01', approvalDate: new Date('2026-07-01T12:00:00.000Z'), percentage: 0.0333,
    amount: 25000, indexName: 'IPCA', notes: 'Registro demonstrativo de reajuste.' } });
  await prisma.contractAmendment.upsert({
    where: { contractId_number: { contractId, number: 'TA-001/2026' } },
    create: { tenantId, contractId, number: 'TA-001/2026', type: AmendmentType.VALUE_INCREASE,
      description: 'Acréscimo demonstrativo para ampliação de escopo.', signedAt: new Date('2026-06-15T12:00:00.000Z'), valueChange: 25000 }, update: {},
  });
  const penalty = await prisma.contractPenalty.findFirst({ where: { tenantId, contractId, administrativeCase: 'PA-2026/DEMO-01' } });
  if (!penalty) await prisma.contractPenalty.create({ data: { tenantId, contractId, supplierId,
    registeredByUserId: userId, type: PenaltyType.WARNING, administrativeCase: 'PA-2026/DEMO-01',
    description: 'Advertência demonstrativa por atraso no envio de relatório.', appliedAt: new Date('2026-05-20T12:00:00.000Z') } });
  await prisma.contract.update({ where: { id: contractId }, data: { adjustmentBaseDate: new Date('2026-01-01T12:00:00.000Z'),
    adjustmentIndex: 'IPCA', currentValue: 1550000, administrativeProcess: 'PE-2025/001-DEMO' } });

  const category = categoryByCode.get('GERAL') ?? categories[0];
  const completedAt = new Date(); completedAt.setUTCDate(10); completedAt.setUTCHours(15, 0, 0, 0);
  const measuredOrder = await prisma.workOrder.upsert({
    where: { tenantId_number: { tenantId, number: 'OS-2026-000004' } },
    create: { tenantId, number: 'OS-2026-000004', buildingId, requesterUserId: userId, createdByUserId: userId,
      acceptedByUserId: userId, supplierId, categoryId: category?.id, title: 'Reparo concluído em registro hidráulico',
      description: 'OS demonstrativa com os três estágios de orçamento.', priority: WorkOrderPriority.NORMAL,
      status: WorkOrderStatus.CLOSED, openedAt: new Date(completedAt.getTime() - 5 * 86_400_000), startedAt: new Date(completedAt.getTime() - 2 * 86_400_000),
      completedAt, closedAt: new Date(completedAt.getTime() + 3_600_000), acceptedAt: new Date(completedAt.getTime() + 3_600_000),
      estimatedCost: 1800, approvedCost: 1650, finalCost: 1575, solution: 'Registro substituído, conexão testada e área liberada.',
      acceptanceNote: 'Serviço conferido para demonstração.', measurementEligible: true,
      contracts: { create: { contractId, isPrimary: true } },
      statusHistory: { create: { changedByUserId: userId, toStatus: WorkOrderStatus.CLOSED, note: 'Fluxo demonstrativo concluído.' } },
    }, update: {},
  });
  const budgetValues: Array<[BudgetStage, number]> = [[BudgetStage.PLANNED, 1800], [BudgetStage.APPROVED, 1650], [BudgetStage.FINAL_EXECUTED, 1575]];
  for (const [stage, total] of budgetValues) {
    const budget = await prisma.workOrderBudget.upsert({
      where: { workOrderId_stage: { workOrderId: measuredOrder.id, stage } },
      create: { tenantId, workOrderId: measuredOrder.id, stage, status: BudgetStatus.APPROVED,
        approvedByUserId: userId, approvedAt: completedAt, subtotal: total, total, notes: `Orçamento ${stage} demonstrativo.` }, update: {},
    });
    if (await prisma.budgetItem.count({ where: { budgetId: budget.id } }) === 0) await prisma.budgetItem.create({ data: {
      tenantId, budgetId: budget.id, kind: BudgetItemKind.SERVICE, source: 'PROPRIO', code: `DEMO-${stage}`,
      description: 'Serviço de manutenção predial demonstrativo', unit: 'UN', quantity: 1, unitCost: total, totalCost: total,
    } });
    await prisma.budgetRevision.upsert({ where: { budgetId_version: { budgetId: budget.id, version: 1 } },
      create: { tenantId, budgetId: budget.id, createdByUserId: userId, version: 1, status: BudgetStatus.APPROVED,
        subtotal: total, bdiPercentage: 0, total, snapshot: { stage, demonstration: true }, reason: 'Seed funcional' }, update: {} });
  }

  const commitment = await prisma.commitment.upsert({
    where: { tenantId_number_fiscalYear: { tenantId, number: '2026NE000001', fiscalYear: 2026 } },
    create: { tenantId, contractId, createdByUserId: userId, number: '2026NE000001', fiscalYear: 2026,
      issueDate: new Date('2026-01-10T12:00:00.000Z'), originalValue: 500000, notes: 'Empenho demonstrativo.' }, update: {},
  });
  if (await prisma.commitmentMovement.count({ where: { commitmentId: commitment.id, type: CommitmentMovementType.ISSUE } }) === 0)
    await prisma.commitmentMovement.create({ data: { tenantId, commitmentId: commitment.id, createdByUserId: userId,
      type: CommitmentMovementType.ISSUE, amount: 500000, occurredAt: commitment.issueDate, notes: 'Emissão demonstrativa.' } });
  const finalBudget = await prisma.workOrderBudget.findUniqueOrThrow({ where: { workOrderId_stage: { workOrderId: measuredOrder.id, stage: BudgetStage.FINAL_EXECUTED } } });
  const referenceMonth = completedAt.toISOString().slice(0, 7);
  const measurement = await prisma.measurement.upsert({
    where: { contractId_number: { contractId, number: `MED-DEMO-${referenceMonth}` } },
    create: { tenantId, contractId, commitmentId: commitment.id, createdByUserId: userId,
      number: `MED-DEMO-${referenceMonth}`, referenceMonth, status: MeasurementStatus.DRAFT,
      grossAmount: 1575, netAmount: 1575, notes: 'Medição demonstrativa consolidada do orçamento final.' }, update: {},
  });
  await prisma.measurementItem.upsert({ where: { measurementId_workOrderId: { measurementId: measurement.id, workOrderId: measuredOrder.id } },
    create: { tenantId, measurementId: measurement.id, workOrderId: measuredOrder.id, budgetId: finalBudget.id,
      description: 'Orçamento final executado da OS demonstrativa', amount: 1575, netAmount: 1575,
      snapshot: { budgetStage: BudgetStage.FINAL_EXECUTED, budgetVersion: finalBudget.version } }, update: {} });

  const asset = await prisma.asset.upsert({ where: { tenantId_tag: { tenantId, tag: 'BOM-001' } },
    create: { tenantId, buildingId, tag: 'BOM-001', name: 'Bomba de recalque principal', category: 'Bombas',
      location: 'Casa de bombas', criticality: AssetCriticality.HIGH, installedAt: new Date('2018-03-10T12:00:00.000Z'),
      metadata: { powerKw: 7.5, demonstration: true } }, update: {} });
  const existingPlan = await prisma.maintenancePlan.findFirst({ where: { tenantId, buildingId, name: '[BOM-PREV] Manutenção preventiva de bombas' } });
  if (!existingPlan) await prisma.maintenancePlan.create({ data: { tenantId, buildingId, assetId: asset.id, contractId, supplierId,
    categoryId: categoryByCode.get('HIDRAULICA')?.id, name: '[BOM-PREV] Manutenção preventiva de bombas',
    titleTemplate: 'Manutenção preventiva da bomba — {data}', description: 'Plano inteligente demonstrativo.',
    type: MaintenancePlanType.PREVENTIVE, frequencyUnit: FrequencyUnit.MONTH, frequencyValue: 1,
    nextDueAt: new Date(Date.now() + 7 * 86_400_000), defaultPriority: WorkOrderPriority.HIGH,
    checklistTemplate: { items: ['Verificar ruído e vibração', 'Verificar vazamentos', 'Registrar corrente elétrica'] },
    generationSource: 'INTELLIGENT_RULE_ENGINE', riskScore: 8, recommendationVersion: 'RULESET_BR_2026.1',
    technicalBasis: { system: 'BOMBAS', humanValidationRequired: true, references: ['ABNT NBR 5674'] } } });

  if (await prisma.workOrderComment.count({ where: { tenantId, workOrderId: measuredOrder.id } }) === 0)
    await prisma.workOrderComment.create({ data: { tenantId, workOrderId: measuredOrder.id, authorUserId: userId,
      body: 'Comentário demonstrativo: evidências e custos conferidos.' } });
  if (!await prisma.notification.findFirst({ where: { tenantId, userId, workOrderId: measuredOrder.id,
    title: 'OS demonstrativa concluída' } })) await prisma.notification.create({ data: { tenantId, userId,
    workOrderId: measuredOrder.id, eventType: 'WORK_ORDER_STATUS_CHANGED', title: 'OS demonstrativa concluída',
    message: 'A OS com orçamento final está pronta para conferência da medição.', actionUrl: `/ordens-servico/${measuredOrder.id}` } });
  await prisma.tenantSequence.upsert({ where: { tenantId_key: { tenantId, key: 'WORK_ORDER:2026' } },
    create: { tenantId, key: 'WORK_ORDER:2026', currentValue: 4 }, update: {} });
  await prisma.tenantSequence.updateMany({ where: { tenantId, key: 'WORK_ORDER:2026', currentValue: { lt: 4 } },
    data: { currentValue: 4 } });
}

async function main() {
  const plans = await Promise.all([
    prisma.saaSPlan.upsert({
      where: { code: 'TRIAL_30D' },
      update: {},
      create: {
        code: 'TRIAL_30D',
        name: 'Trial 30 dias',
        billingInterval: BillingInterval.MONTH,
        priceBrl: 0,
        maxBuildings: 3,
        maxOperationalUsers: 5,
        maxStorageGb: 2,
        maxWorkOrdersYear: 500,
        features: { trial: true },
      },
    }),
    prisma.saaSPlan.upsert({
      where: { code: 'ESSENCIAL_MONTHLY' },
      update: { stripePriceId: process.env.STRIPE_PRICE_ESSENCIAL_MONTHLY || undefined },
      create: {
        code: 'ESSENCIAL_MONTHLY',
        name: 'Essencial',
        billingInterval: BillingInterval.MONTH,
        priceBrl: 349,
        stripePriceId: process.env.STRIPE_PRICE_ESSENCIAL_MONTHLY || undefined,
        maxBuildings: 3,
        maxOperationalUsers: 5,
        maxStorageGb: 5,
        maxWorkOrdersYear: 1500,
        features: { reports: 'basic', contracts: true },
      },
    }),
    prisma.saaSPlan.upsert({
      where: { code: 'PRO_MONTHLY' },
      update: { stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || undefined },
      create: {
        code: 'PRO_MONTHLY',
        name: 'Profissional',
        billingInterval: BillingInterval.MONTH,
        priceBrl: 799,
        stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || undefined,
        maxBuildings: 15,
        maxOperationalUsers: 15,
        maxStorageGb: 25,
        maxWorkOrdersYear: 10000,
        features: { reports: 'advanced', contracts: true, measurements: true, kpis: true },
      },
    }),
    prisma.saaSPlan.upsert({
      where: { code: 'ENTERPRISE_MONTHLY' },
      update: { stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || undefined },
      create: {
        code: 'ENTERPRISE_MONTHLY',
        name: 'Gestão Pública e Enterprise',
        billingInterval: BillingInterval.MONTH,
        priceBrl: 1990,
        stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || undefined,
        maxBuildings: 50,
        maxOperationalUsers: 50,
        maxStorageGb: 100,
        maxWorkOrdersYear: 50000,
        features: { reports: 'complete', audit: true, laborManagement: true, sla: true },
      },
    }),
  ]);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demonstracao' },
    update: {},
    create: {
      name: 'Organização de Demonstração',
      slug: 'demonstracao',
      status: TenantStatus.TRIAL,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  const operational = await provisionOperationalSeed(tenant.id, tenant.timezone);

  const existingSeedUser = await prisma.user.findUnique({
    where: { email: seedAdminEmail },
  });
  const user =
    existingSeedUser ??
    (await prisma.user.create({
      data: {
      name: 'Administrador de Demonstração',
      email: seedAdminEmail,
      passwordHash: await hash(requireSeedAdminPassword(), 12),
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      },
    }));

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: user.id,
      status: MembershipStatus.ACTIVE,
      role: MembershipRole.OWNER,
      acceptedAt: new Date(),
    },
  });

  const trialPlan = plans[0];
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId: tenant.id },
  });
  if (!subscription) {
    await prisma.tenantSubscription.create({
      data: {
        tenantId: tenant.id,
        planId: trialPlan.id,
        status: SubscriptionStatus.TRIALING,
        currentPeriodStart: new Date(),
        currentPeriodEnd: tenant.trialEndsAt,
      },
    });
  }

  const building = await prisma.building.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'EDF-001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'EDF-001',
      name: 'Edifício Administrativo Central',
      type: 'Administrativo',
      addressLine1: 'Praça dos Três Poderes',
      city: 'Brasília',
      state: 'DF',
      postalCode: '70100-000',
      latitude: -15.7991,
      longitude: -47.8645,
      geocodedAt: new Date(),
      geocodingProvider: 'SEED',
      geocodingAccuracy: 'verified-demo-coordinate',
      geocodingConfirmedAt: new Date(),
      geocodingConfirmedByUserId: user.id,
      grossAreaM2: 18500,
      floors: 12,
    },
  });

  const supplier = await prisma.supplier.upsert({
    where: { tenantId_taxId: { tenantId: tenant.id, taxId: '12.345.678/0001-90' } },
    update: {},
    create: {
      tenantId: tenant.id,
      legalName: 'Manutenção Predial Brasil Ltda.',
      tradeName: 'MPB Serviços',
      taxId: '12.345.678/0001-90',
      email: 'contato@mpb.exemplo',
      serviceAreas: ['civil', 'elétrica', 'hidráulica', 'climatização'],
    },
  });

  const contract = await prisma.contract.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'CT-2026/001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      supplierId: supplier.id,
      code: 'CT-2026/001',
      object: 'Manutenção predial preventiva e corretiva do edifício administrativo.',
      type: ContractType.INTEGRATED_MAINTENANCE,
      status: ContractStatus.ACTIVE,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.000Z'),
      originalValue: 1500000,
      currentValue: 1500000,
      buildings: { create: { buildingId: building.id } },
    },
  });

  const existingOs = await prisma.workOrder.count({ where: { tenantId: tenant.id } });
  if (existingOs === 0) {
    const examples = [
      {
        number: 'OS-2026-000001',
        title: 'Vazamento no banheiro do 3º pavimento',
        description: 'Vazamento contínuo próximo à prumada hidráulica.',
        priority: WorkOrderPriority.HIGH,
        status: WorkOrderStatus.IN_PROGRESS,
        openedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        number: 'OS-2026-000002',
        title: 'Falha em unidade de climatização',
        description: 'Equipamento não mantém a temperatura de referência.',
        priority: WorkOrderPriority.URGENT,
        status: WorkOrderStatus.PENDING,
        openedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      },
      {
        number: 'OS-2026-000003',
        title: 'Inspeção preventiva do quadro geral',
        description: 'Rotina mensal de termografia e reaperto.',
        priority: WorkOrderPriority.NORMAL,
        status: WorkOrderStatus.OPEN,
        openedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      },
    ];

    for (const example of examples) {
      const categoryCode = example.title.includes('Vazamento')
        ? 'HIDRAULICA'
        : example.title.includes('climatiza')
          ? 'CLIMATIZACAO'
          : 'ELETRICA';
      const category = operational.catalogs.get(
        `${OperationalCatalogKind.CATEGORY}:${categoryCode}`,
      )!;
      const slaPolicy = operational.policies.get(example.priority)!;
      const slaResponseDeadline = new Date(
        example.openedAt.getTime() +
          defaultSlaByPriority[example.priority].responseMinutes * 60_000,
      );
      const slaResolutionDeadline = new Date(
        example.openedAt.getTime() +
          defaultSlaByPriority[example.priority].resolutionMinutes * 60_000,
      );
      const slaResolutionWarningAt = new Date(
        slaResolutionDeadline.getTime() -
          Math.min(
            slaPolicy.warningMinutesBefore,
            defaultSlaByPriority[example.priority].resolutionMinutes,
          ) *
            60_000,
      );
      const workOrder = await prisma.workOrder.create({
        data: {
          tenantId: tenant.id,
          buildingId: building.id,
          requesterUserId: user.id,
          createdByUserId: user.id,
          supplierId: supplier.id,
          categoryId: category.id,
          slaPolicyId: slaPolicy.id,
          number: example.number,
          title: example.title,
          description: example.description,
          priority: example.priority,
          status: example.status,
          hasOpenPendency: example.status === WorkOrderStatus.PENDING,
          openedAt: example.openedAt,
          slaResponseDeadline,
          slaResolutionDeadline,
          slaResolutionWarningAt,
          slaSnapshot: {
            policy: {
              id: slaPolicy.id,
              code: slaPolicy.code,
              responseMinutes: slaPolicy.responseMinutes,
              resolutionMinutes: slaPolicy.resolutionMinutes,
              warningMinutesBefore: slaPolicy.warningMinutesBefore,
            },
            calendar: {
              id: operational.calendar.id,
              code: operational.calendar.code,
              timezone: operational.calendar.timezone,
              timeMode: operational.calendar.timeMode,
            },
            startAt: example.openedAt.toISOString(),
            responseDeadline: slaResponseDeadline.toISOString(),
            resolutionDeadline: slaResolutionDeadline.toISOString(),
            resolutionWarningAt: slaResolutionWarningAt.toISOString(),
            capturedAt: new Date().toISOString(),
          },
          operationalCriteriaSnapshot: {
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
          },
          contracts: { create: { contractId: contract.id, isPrimary: true } },
          statusHistory: {
            create: {
              changedByUserId: user.id,
              toStatus: example.status,
              note: 'Registro demonstrativo criado pelo seed.',
            },
          },
        },
      });

      const templateItems = await prisma.checklistTemplateItem.findMany({
        where: { tenantId: tenant.id, categoryId: category.id, active: true },
        orderBy: { sortOrder: 'asc' },
      });
      if (templateItems.length) {
        await prisma.workOrderChecklistItem.createMany({
          data: templateItems.map((item) => ({
            tenantId: tenant.id,
            workOrderId: workOrder.id,
            templateItemId: item.id,
            label: item.label,
            description: item.description,
            required: item.required,
            sortOrder: item.sortOrder,
          })),
        });
      }

      if (example.status === WorkOrderStatus.PENDING) {
        await prisma.workOrderPendency.create({
          data: {
            tenantId: tenant.id,
            workOrderId: workOrder.id,
            previousStatus: WorkOrderStatus.IN_PROGRESS,
            reason: 'Aguardando peça de reposição.',
            dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    await prisma.tenantSequence.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: 'WORK_ORDER:2026' } },
      create: { tenantId: tenant.id, key: 'WORK_ORDER:2026', currentValue: 3 },
      update: {},
    });
  }

  await provisionFunctionalDemoData({ tenantId: tenant.id, userId: user.id, buildingId: building.id,
    supplierId: supplier.id, contractId: contract.id });

  for (const [code, name, category, unit, direction, target] of kpis) {
    await prisma.kpiDefinition.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: {},
      create: {
        tenantId: tenant.id,
        code,
        name,
        category,
        unit,
        direction,
        targetValue: target,
      },
    });
  }

  console.log(`Seed concluído. Login: ${seedAdminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
