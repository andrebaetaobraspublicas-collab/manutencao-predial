import {
  AdjustmentType,
  AmendmentType,
  AuditAction,
  BudgetItemKind,
  BudgetStage,
  BudgetStatus,
  CommitmentMovementType,
  ConstructionDiaryStatus,
  ContractApostilleType,
  ContractCommunicationPriority,
  ContractExecutionRegime,
  ContractGuaranteeModality,
  ContractGuaranteeStatus,
  ContractInspectionRole,
  ContractNature,
  ContractReceiptDecision,
  ContractReceiptStatus,
  ContractReceiptType,
  ContractStatus,
  ContractType,
  MeasurementStatus,
  OperationalCatalogKind,
  Prisma,
  PrismaClient,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../src/generated/prisma/client';

const DEMO_MARKER = '[DADOS FICTÍCIOS PARA TESTES]';

export const CONTRACT_TEST_DATA_EXPECTED = {
  contracts: 5,
  amendments: 9,
  adjustments: 8,
  subcontracts: 5,
  commitments: 5,
  financialWorkOrders: 8,
  measurements: 8,
  budgets: 24,
  budgetItems: 48,
  inspectors: 2,
  inspectionTeamAssignments: 5,
  guarantees: 3,
  apostilles: 4,
  receipts: 3,
  constructionDiaries: 5,
  communications: 5,
} as const;

type ContractSeed = {
  code: string;
  supplierTaxId: string;
  buildingCodes: string[];
  object: string;
  type: ContractType;
  status: ContractStatus;
  process: string;
  startDate: string;
  endDate: string;
  originalValue: number;
  adjustmentIndex: string;
};

const CONTRACT_SEEDS: ContractSeed[] = [
  {
    code: 'CT-2026/004',
    supplierTaxId: '44.555.666/0001-77',
    buildingCodes: ['EDF-001', 'EDF-002'],
    object: 'Manutenção e adequação dos sistemas de prevenção e combate a incêndio.',
    type: ContractType.PREVENTIVE_MAINTENANCE,
    status: ContractStatus.ACTIVE,
    process: 'PE-2025/031-DEMO',
    startDate: '2026-02-01',
    endDate: '2027-01-31',
    originalValue: 420000,
    adjustmentIndex: 'IPCA',
  },
  {
    code: 'CT-2026/005',
    supplierTaxId: '12.345.678/0001-90',
    buildingCodes: ['EDF-001', 'EDF-003'],
    object: 'Fornecimento de materiais e apoio técnico para manutenção predial.',
    type: ContractType.SUPPLY,
    status: ContractStatus.EXPIRING,
    process: 'DL-2025/044-DEMO',
    startDate: '2025-11-01',
    endDate: '2026-10-31',
    originalValue: 260000,
    adjustmentIndex: 'IPCA',
  },
];

const AMENDMENT_SEEDS = [
  { contractCode: 'CT-2026/001', number: 'TA-DEMO-001/2026', type: AmendmentType.VALUE_INCREASE,
    description: 'Acréscimo fictício para ampliação de serviços preventivos.', signedAt: '2026-02-12',
    effectiveAt: '2026-03-01', valueChange: 45000 },
  { contractCode: 'CT-2026/001', number: 'TA-DEMO-002/2026', type: AmendmentType.SCOPE_CHANGE,
    description: 'Inclusão fictícia de manutenção de sistemas de automação.', signedAt: '2026-04-08',
    effectiveAt: '2026-04-15' },
  { contractCode: 'CT-2026/002', number: 'TA-DEMO-003/2026', type: AmendmentType.TERM_EXTENSION,
    description: 'Prorrogação fictícia da vigência por seis meses.', signedAt: '2026-06-20',
    effectiveAt: '2027-01-01', endDateBefore: '2027-01-01', endDateAfter: '2027-06-30' },
  { contractCode: 'CT-2026/002', number: 'TA-DEMO-004/2026', type: AmendmentType.VALUE_INCREASE,
    description: 'Acréscimo fictício para peças de elevadores.', signedAt: '2026-03-10',
    effectiveAt: '2026-03-15', valueChange: 18000 },
  { contractCode: 'CT-2026/003', number: 'TA-DEMO-005/2026', type: AmendmentType.VALUE_DECREASE,
    description: 'Supressão fictícia de item não executado.', signedAt: '2026-05-05',
    effectiveAt: '2026-05-10', valueChange: -15000 },
  { contractCode: 'CT-2026/003', number: 'TA-DEMO-006/2026', type: AmendmentType.SCOPE_CHANGE,
    description: 'Inclusão fictícia de recuperação de fachadas.', signedAt: '2026-06-01',
    effectiveAt: '2026-06-10' },
  { contractCode: 'CT-2026/004', number: 'TA-DEMO-007/2026', type: AmendmentType.VALUE_INCREASE,
    description: 'Acréscimo fictício para substituição de bombas de incêndio.', signedAt: '2026-07-02',
    effectiveAt: '2026-07-10', valueChange: 22000 },
  { contractCode: 'CT-2026/005', number: 'TA-DEMO-008/2026', type: AmendmentType.TERM_EXTENSION,
    description: 'Prorrogação fictícia do fornecimento por quatro meses.', signedAt: '2026-07-15',
    effectiveAt: '2026-11-01', endDateBefore: '2026-10-31', endDateAfter: '2027-02-28' },
] as const;

const ADJUSTMENT_SEEDS = [
  { contractCode: 'CT-2026/001', type: AdjustmentType.REPACTUATION, referencePeriod: '2026-03',
    requestDate: '2026-03-05', approvalDate: '2026-04-01', percentage: 0.021333, amount: 32000,
    indexName: 'CCT-DEMO', notes: 'Repactuação fictícia de mão de obra.' },
  { contractCode: 'CT-2026/002', type: AdjustmentType.PRICE_ADJUSTMENT, referencePeriod: '2026-01',
    requestDate: '2026-01-10', approvalDate: '2026-02-01', percentage: 0.045, amount: 16200,
    indexName: 'IPCA', notes: 'Reajuste anual fictício.' },
  { contractCode: 'CT-2026/002', type: AdjustmentType.ECONOMIC_REBALANCING, referencePeriod: '2026-05',
    requestDate: '2026-05-12', approvalDate: '2026-06-10', percentage: 0.032778, amount: 11800,
    indexName: 'COTAÇÃO-DEMO', notes: 'Reequilíbrio fictício por variação extraordinária de componentes.' },
  { contractCode: 'CT-2026/003', type: AdjustmentType.REPACTUATION, referencePeriod: '2026-02',
    requestDate: '2026-02-15', approvalDate: '2026-03-15', percentage: 0.05, amount: 39000,
    indexName: 'CCT-DEMO', notes: 'Repactuação fictícia da equipe residente.' },
  { contractCode: 'CT-2026/004', type: AdjustmentType.PRICE_ADJUSTMENT, referencePeriod: '2026-02',
    requestDate: '2026-02-05', approvalDate: '2026-03-01', percentage: 0.042857, amount: 18000,
    indexName: 'IPCA', notes: 'Reajuste fictício do contrato de incêndio.' },
  { contractCode: 'CT-2026/004', type: AdjustmentType.REPACTUATION, referencePeriod: '2026-06',
    requestDate: '2026-06-08', approvalDate: '2026-07-01', percentage: 0.02381, amount: 10000,
    indexName: 'CCT-DEMO', notes: 'Repactuação fictícia da equipe técnica.' },
  { contractCode: 'CT-2026/005', type: AdjustmentType.PRICE_ADJUSTMENT, referencePeriod: '2026-01',
    requestDate: '2026-01-07', approvalDate: '2026-02-03', percentage: 0.030769, amount: 8000,
    indexName: 'IPCA', notes: 'Reajuste fictício do fornecimento.' },
] as const;

const SUBCONTRACT_SEEDS = [
  { contractCode: 'CT-2026/001', supplierTaxId: '22.333.444/0001-55', authorizationCase: 'SUB-DEMO-001/2026',
    scope: 'Manutenção especializada dos elevadores do edifício administrativo.', amount: 72000,
    startDate: '2026-03-01', endDate: '2026-12-15', approvedAt: '2026-02-20' },
  { contractCode: 'CT-2026/002', supplierTaxId: '33.444.555/0001-66', authorizationCase: 'SUB-DEMO-002/2026',
    scope: 'Adequações civis em casas de máquinas e poços.', amount: 48000,
    startDate: '2026-04-01', endDate: '2026-09-30', approvedAt: '2026-03-22' },
  { contractCode: 'CT-2026/003', supplierTaxId: '44.555.666/0001-77', authorizationCase: 'SUB-DEMO-003/2026',
    scope: 'Instalação de sinalização e iluminação de emergência.', amount: 86000,
    startDate: '2026-05-01', endDate: '2026-11-30', approvedAt: '2026-04-18' },
  { contractCode: 'CT-2026/004', supplierTaxId: '12.345.678/0001-90', authorizationCase: 'SUB-DEMO-004/2026',
    scope: 'Apoio civil para instalação de bombas e tubulações de incêndio.', amount: 65000,
    startDate: '2026-06-01', endDate: '2026-12-20', approvedAt: '2026-05-20' },
  { contractCode: 'CT-2026/005', supplierTaxId: '22.333.444/0001-55', authorizationCase: 'SUB-DEMO-005/2026',
    scope: 'Fornecimento especializado de componentes de automação.', amount: 39000,
    startDate: '2026-02-01', endDate: '2026-10-15', approvedAt: '2026-01-25' },
] as const;

const FINANCIAL_SCENARIOS = [
  { number: 'OS-2026-000013', contractCode: 'CT-2026/001', title: 'Substituição de válvulas da prumada hidráulica',
    referenceMonth: '2026-01', finalValue: 12500, measurementNumber: 'MED-DEMO-001/2026', measurementStatus: MeasurementStatus.PAID },
  { number: 'OS-2026-000014', contractCode: 'CT-2026/001', title: 'Revisão geral do sistema de climatização',
    referenceMonth: '2026-02', finalValue: 18400, measurementNumber: 'MED-DEMO-002/2026', measurementStatus: MeasurementStatus.LIQUIDATED },
  { number: 'OS-2026-000015', contractCode: 'CT-2026/002', title: 'Troca de cabos de tração do elevador social',
    referenceMonth: '2026-03', finalValue: 9300, measurementNumber: 'MED-DEMO-003/2026', measurementStatus: MeasurementStatus.PAID },
  { number: 'OS-2026-000016', contractCode: 'CT-2026/002', title: 'Manutenção do quadro de comando do elevador',
    referenceMonth: '2026-04', finalValue: 14600, measurementNumber: 'MED-DEMO-004/2026', measurementStatus: MeasurementStatus.APPROVED },
  { number: 'OS-2026-000017', contractCode: 'CT-2026/003', title: 'Recuperação de revestimento da fachada sul',
    referenceMonth: '2026-05', finalValue: 22750, measurementNumber: 'MED-DEMO-005/2026', measurementStatus: MeasurementStatus.UNDER_REVIEW },
  { number: 'OS-2026-000018', contractCode: 'CT-2026/003', title: 'Impermeabilização da cobertura do almoxarifado',
    referenceMonth: '2026-06', finalValue: 16500, measurementNumber: 'MED-DEMO-006/2026', measurementStatus: MeasurementStatus.SUBMITTED },
  { number: 'OS-2026-000019', contractCode: 'CT-2026/004', title: 'Teste hidrostático da rede de incêndio',
    referenceMonth: '2026-07', finalValue: 11800, measurementNumber: 'MED-DEMO-007/2026', measurementStatus: MeasurementStatus.DRAFT },
  { number: 'OS-2026-000020', contractCode: 'CT-2026/005', title: 'Fornecimento de sensores para automação predial',
    referenceMonth: '2026-07', finalValue: 7400, measurementNumber: 'MED-DEMO-008/2026', measurementStatus: MeasurementStatus.REJECTED },
] as const;

const COMMITMENT_BY_CONTRACT: Record<string, { number: string; originalValue: number; issueDate: string }> = {
  'CT-2026/001': { number: '2026NE000001', originalValue: 500000, issueDate: '2026-01-10' },
  'CT-2026/002': { number: '2026NE000002', originalValue: 180000, issueDate: '2026-02-10' },
  'CT-2026/003': { number: '2026NE000003', originalValue: 300000, issueDate: '2026-03-10' },
  'CT-2026/004': { number: '2026NE000004', originalValue: 250000, issueDate: '2026-02-12' },
  'CT-2026/005': { number: '2026NE000005', originalValue: 220000, issueDate: '2026-01-12' },
};

function atNoon(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function measurementVersion(status: MeasurementStatus): number {
  return ({ DRAFT: 0, SUBMITTED: 1, UNDER_REVIEW: 2, APPROVED: 3, REJECTED: 3,
    LIQUIDATED: 4, PAID: 5, CANCELED: 1 } satisfies Record<MeasurementStatus, number>)[status];
}

async function ensureMovement(prisma: PrismaClient, input: {
  tenantId: string; commitmentId: string; userId: string; type: CommitmentMovementType;
  amount: Prisma.Decimal | number; occurredAt: Date; documentRef: string; measurementId?: string;
}) {
  const exists = await prisma.commitmentMovement.findFirst({
    where: { commitmentId: input.commitmentId, type: input.type, documentRef: input.documentRef },
    select: { id: true },
  });
  if (!exists) await prisma.commitmentMovement.create({ data: {
    tenantId: input.tenantId, commitmentId: input.commitmentId, measurementId: input.measurementId,
    createdByUserId: input.userId, type: input.type, amount: input.amount,
    occurredAt: input.occurredAt, documentRef: input.documentRef,
    notes: `${DEMO_MARKER} Movimento financeiro criado pelo seed de homologação.`,
  } });
}

async function ensureBudget(prisma: PrismaClient, input: {
  tenantId: string; userId: string; workOrderId: string; workOrderNumber: string;
  referenceMonth: string; stage: BudgetStage; total: Prisma.Decimal;
}) {
  const budget = await prisma.workOrderBudget.upsert({
    where: { workOrderId_stage: { workOrderId: input.workOrderId, stage: input.stage } },
    update: {},
    create: {
      tenantId: input.tenantId, workOrderId: input.workOrderId, stage: input.stage,
      status: BudgetStatus.APPROVED, version: 1, referenceMonth: input.referenceMonth, state: 'DF',
      subtotal: input.total, bdiPercentage: 0, total: input.total,
      submittedByUserId: input.userId, approvedByUserId: input.userId,
      submittedAt: atNoon(`${input.referenceMonth}-20`), approvedAt: atNoon(`${input.referenceMonth}-22`),
      notes: `${DEMO_MARKER} Orçamento ${input.stage.toLowerCase()} da ${input.workOrderNumber}.`,
    },
  });
  const serviceTotal = input.total.times('0.72').toDecimalPlaces(2);
  const inputTotal = input.total.minus(serviceTotal);
  const itemSeeds = [
    { code: `SERV-${input.workOrderNumber.slice(-3)}-${input.stage.slice(0, 3)}`, kind: BudgetItemKind.SERVICE,
      description: `Serviço especializado — ${input.workOrderNumber}`, unit: 'SV', total: serviceTotal },
    { code: `INS-${input.workOrderNumber.slice(-3)}-${input.stage.slice(0, 3)}`, kind: BudgetItemKind.INPUT,
      description: `Materiais e insumos — ${input.workOrderNumber}`, unit: 'CJ', total: inputTotal },
  ];
  for (const item of itemSeeds) {
    if (!await prisma.budgetItem.findFirst({ where: { budgetId: budget.id, code: item.code } })) {
      await prisma.budgetItem.create({ data: {
        tenantId: input.tenantId, budgetId: budget.id, kind: item.kind, source: 'PROPRIO',
        code: item.code, description: item.description, unit: item.unit,
        quantity: 1, unitCost: item.total, totalCost: item.total,
        sourceData: { demonstration: true, marker: DEMO_MARKER },
      } });
    }
  }
  await prisma.budgetRevision.upsert({
    where: { budgetId_version: { budgetId: budget.id, version: 1 } },
    update: {},
    create: {
      tenantId: input.tenantId, budgetId: budget.id, createdByUserId: input.userId,
      version: 1, status: BudgetStatus.APPROVED, subtotal: input.total, bdiPercentage: 0,
      total: input.total, reason: `${DEMO_MARKER} Revisão inicial aprovada.`,
      snapshot: { demonstration: true, stage: input.stage, workOrderNumber: input.workOrderNumber,
        items: itemSeeds.map((item) => ({ code: item.code, total: item.total.toString() })) },
    },
  });
  return budget;
}

export async function provisionContractTestData(prisma: PrismaClient, input: {
  tenantId: string; userId: string;
}) {
  const { tenantId, userId } = input;
  const [suppliers, buildings] = await Promise.all([
    prisma.supplier.findMany({ where: { tenantId, deletedAt: null } }),
    prisma.building.findMany({ where: { tenantId, deletedAt: null } }),
  ]);
  const supplierByTaxId = new Map(suppliers.map((item) => [item.taxId, item]));
  const buildingByCode = new Map(buildings.map((item) => [item.code, item]));

  for (const seed of CONTRACT_SEEDS) {
    const supplier = supplierByTaxId.get(seed.supplierTaxId);
    const selectedBuildings = seed.buildingCodes.map((code) => buildingByCode.get(code)).filter(Boolean);
    if (!supplier || selectedBuildings.length !== seed.buildingCodes.length) {
      throw new Error(`Pré-requisitos ausentes para o contrato fictício ${seed.code}.`);
    }
    const contract = await prisma.contract.upsert({
      where: { tenantId_code: { tenantId, code: seed.code } },
      update: { deletedAt: null, executionRegime: ContractExecutionRegime.GLOBAL_PRICE,
        nature: seed.type === ContractType.SUPPLY ? ContractNature.SCOPE : ContractNature.CONTINUOUS },
      create: {
        tenantId, supplierId: supplier.id, code: seed.code, administrativeProcess: seed.process,
        object: seed.object, type: seed.type, executionRegime: ContractExecutionRegime.GLOBAL_PRICE,
        nature: seed.type === ContractType.SUPPLY ? ContractNature.SCOPE : ContractNature.CONTINUOUS,
        status: seed.status, managerUserId: userId,
        inspectorUserId: userId, startDate: atNoon(seed.startDate), endDate: atNoon(seed.endDate),
        signatureDate: atNoon(seed.startDate), originalValue: seed.originalValue,
        currentValue: seed.originalValue, adjustmentBaseDate: atNoon(seed.startDate),
        adjustmentIndex: seed.adjustmentIndex, notes: `${DEMO_MARKER} Contrato criado para homologação.`,
      },
    });
    for (const building of selectedBuildings) await prisma.contractBuilding.upsert({
      where: { contractId_buildingId: { contractId: contract.id, buildingId: building!.id } },
      update: {}, create: { contractId: contract.id, buildingId: building!.id },
    });
  }

  await prisma.contract.updateMany({
    where: { tenantId, code: 'CT-2026/001', deletedAt: null },
    data: { exclusiveLaborDedication: true },
  });

  const contracts = await prisma.contract.findMany({
    where: { tenantId, code: { in: Object.keys(COMMITMENT_BY_CONTRACT) }, deletedAt: null },
    include: { buildings: true },
  });
  const contractByCode = new Map(contracts.map((item) => [item.code, item]));
  if (contracts.length !== CONTRACT_TEST_DATA_EXPECTED.contracts) {
    throw new Error('A carteira fictícia de contratos não foi provisionada integralmente.');
  }

  const inspectorSeeds = [
    {
      registrationNumber: 'FISC-DEMO-001',
      name: 'Mariana Alves Costa',
      cpf: '11122233344',
      jobTitle: 'Engenheira Civil',
      professionalEducation: 'Engenharia Civil',
      professionalCouncil: 'CREA-DF 000001/D',
      department: 'Coordenação de Manutenção Predial',
      email: 'mariana.fiscal@example.com',
      specialty: 'Edificações',
      availableHours: 40,
      maxProcesses: 8,
      designationOrdinance: 'Portaria DEMO nº 101/2026',
    },
    {
      registrationNumber: 'FISC-DEMO-002',
      name: 'Bruno Henrique Lima',
      cpf: '55566677788',
      jobTitle: 'Fiscal Administrativo',
      professionalEducation: 'Administração',
      department: 'Núcleo de Gestão Contratual',
      email: 'bruno.fiscal@example.com',
      specialty: 'Fiscalização administrativa',
      availableHours: 40,
      maxProcesses: 10,
      designationOrdinance: 'Portaria DEMO nº 102/2026',
    },
  ] as const;
  const inspectors: Awaited<ReturnType<typeof prisma.inspectorProfile.upsert>>[] = [];
  for (const seed of inspectorSeeds) {
    inspectors.push(await prisma.inspectorProfile.upsert({
      where: { tenantId_registrationNumber: { tenantId, registrationNumber: seed.registrationNumber } },
      update: { ...seed, deletedAt: null, status: 'ACTIVE' },
      create: { tenantId, createdByUserId: userId, ...seed,
        notes: `${DEMO_MARKER} Perfil de fiscalização criado para homologação.` },
    }));
  }

  const teamSeeds = [
    ['CT-2026/001', inspectors[0]!.id, ContractInspectionRole.TECHNICAL_INSPECTOR, true],
    ['CT-2026/001', inspectors[1]!.id, ContractInspectionRole.ADMINISTRATIVE_INSPECTOR, true],
    ['CT-2026/002', inspectors[0]!.id, ContractInspectionRole.CONTRACT_MANAGER, true],
    ['CT-2026/003', inspectors[1]!.id, ContractInspectionRole.CONTRACT_MANAGER, true],
    ['CT-2026/004', inspectors[0]!.id, ContractInspectionRole.TECHNICAL_INSPECTOR, true],
  ] as const;
  for (const [contractCode, inspectorProfileId, role, isPrimary] of teamSeeds) {
    const contract = contractByCode.get(contractCode)!;
    const existing = await prisma.contractInspectionTeamMember.findFirst({
      where: { tenantId, contractId: contract.id, inspectorProfileId, role, deletedAt: null },
    });
    if (!existing) await prisma.contractInspectionTeamMember.create({ data: {
      tenantId, contractId: contract.id, inspectorProfileId, assignedByUserId: userId, role,
      designationAct: `Portaria DEMO de fiscalização — ${contract.code}`,
      startsAt: atNoon('2026-01-02'), isPrimary,
      notes: `${DEMO_MARKER} Designação fictícia para teste do dossiê contratual.`,
    } });
  }

  const guaranteeSeeds = [
    { contractCode: 'CT-2026/001', number: 'AP-DEMO-001/2026', modality: ContractGuaranteeModality.SURETY_BOND,
      percentage: 5, startsAt: '2026-01-01', endsAt: '2027-03-31', status: ContractGuaranteeStatus.APPROVED },
    { contractCode: 'CT-2026/002', number: 'CF-DEMO-002/2026', modality: ContractGuaranteeModality.BANK_GUARANTEE,
      percentage: 5, startsAt: '2026-01-01', endsAt: '2027-09-30', status: ContractGuaranteeStatus.APPROVED },
    { contractCode: 'CT-2026/004', number: 'AP-DEMO-003/2026', modality: ContractGuaranteeModality.SURETY_BOND,
      percentage: 10, startsAt: '2026-02-01', endsAt: '2027-04-30', status: ContractGuaranteeStatus.UNDER_REVIEW },
  ] as const;
  for (const seed of guaranteeSeeds) {
    const contract = contractByCode.get(seed.contractCode)!;
    await prisma.contractGuarantee.upsert({
      where: { contractId_number: { contractId: contract.id, number: seed.number } },
      update: { deletedAt: null },
      create: {
        tenantId, contractId: contract.id, createdByUserId: userId,
        analystInspectorId: inspectors[0]!.id, number: seed.number, modality: seed.modality,
        guarantorName: 'Seguradora Demonstração S.A.', guarantorTaxId: '99999999000199',
        contractPercentage: seed.percentage,
        guaranteedValue: new Prisma.Decimal(contract.originalValue).mul(seed.percentage).div(100),
        minimumPercentage: 5, issuedAt: atNoon(seed.startsAt), startsAt: atNoon(seed.startsAt),
        endsAt: atNoon(seed.endsAt), status: seed.status, workflow: 'Análise inicial',
        coverages: 'Execução contratual, multas, obrigações trabalhistas e correção de vícios.',
        history: `${DEMO_MARKER} Garantia contratual fictícia para homologação.`,
      },
    });
  }

  const apostilleSeeds = [
    { contractCode: 'CT-2026/001', number: 'APOST-DEMO-001/2026', type: ContractApostilleType.PRICE_ADJUSTMENT,
      date: '2026-04-01', index: 'IPCA', percentage: 2.5, valueChange: 37500 },
    { contractCode: 'CT-2026/002', number: 'APOST-DEMO-002/2026', type: ContractApostilleType.REPACTUATION,
      date: '2026-05-02', index: 'CCT-DEMO', percentage: 1.8, valueChange: 7200 },
    { contractCode: 'CT-2026/003', number: 'APOST-DEMO-003/2026', type: ContractApostilleType.BUDGET_ALLOCATION_CHANGE,
      date: '2026-06-03', index: null, percentage: null, valueChange: 0 },
    { contractCode: 'CT-2026/004', number: 'APOST-DEMO-004/2026', type: ContractApostilleType.MONETARY_UPDATE,
      date: '2026-07-04', index: 'IPCA-E', percentage: 1.2, valueChange: 5040 },
  ] as const;
  for (const seed of apostilleSeeds) {
    const contract = contractByCode.get(seed.contractCode)!;
    const valueBefore = new Prisma.Decimal(contract.originalValue);
    await prisma.contractApostille.upsert({
      where: { contractId_number: { contractId: contract.id, number: seed.number } },
      update: { deletedAt: null, status: 'ACTIVE' },
      create: {
        tenantId, contractId: contract.id, createdByUserId: userId, number: seed.number,
        type: seed.type, date: atNoon(seed.date), indexName: seed.index,
        percentage: seed.percentage, valueBefore, valueChange: seed.valueChange,
        valueAfter: valueBefore.plus(seed.valueChange),
        calculationMemo: `${DEMO_MARKER} Memória de cálculo simplificada para teste.`,
        justification: `${DEMO_MARKER} Apostilamento fictício para homologação.`,
      },
    });
  }

  const receiptSeeds = [
    ['CT-2026/001', 'TRP-DEMO-001/2026', ContractReceiptType.PARTIAL, ContractReceiptStatus.WITH_PENDING_ITEMS],
    ['CT-2026/002', 'TRP-DEMO-002/2026', ContractReceiptType.PROVISIONAL, ContractReceiptStatus.OBSERVATION_PERIOD],
    ['CT-2026/003', 'TRD-DEMO-003/2026', ContractReceiptType.DEFINITIVE, ContractReceiptStatus.TERM_ISSUED],
  ] as const;
  for (const [contractCode, number, type, status] of receiptSeeds) {
    const contract = contractByCode.get(contractCode)!;
    await prisma.contractReceipt.upsert({
      where: { contractId_number: { contractId: contract.id, number } },
      update: { deletedAt: null },
      create: {
        tenantId, contractId: contract.id, createdByUserId: userId,
        responsibleInspectorId: inspectors[0]!.id, number, type,
        objectCategory: 'Obras e serviços de engenharia', requestProtocol: `PROT-${number}`,
        protocolAt: atNoon('2026-07-10'), inspectionDate: atNoon('2026-07-15'), status,
        provisionalRequired: true, decision: ContractReceiptDecision.APPROVE_WITH_PENDING_ITEMS,
        commissionOrdinance: 'Portaria DEMO nº 150/2026', quorum: 'Quórum atendido',
        contractorDocuments: 'Relatório final, as built e certificados de garantia.',
        inspectionsAndTests: 'Vistoria visual, teste funcional e conferência documental.',
        observationStartsAt: atNoon('2026-07-15'), observationEndsAt: atNoon('2026-08-15'),
        consolidatedOpinion: `${DEMO_MARKER} Recebimento aprovado com pendências de baixa criticidade.`,
        pendingItems: { items: [{ description: 'Complementar manual técnico', criticality: 'Baixa', status: 'Aberta' }] },
      },
    });
  }

  for (const [index, contract] of contracts.entries()) {
    const diaryNumber = `DO-DEMO-${String(index + 1).padStart(3, '0')}/2026`;
    await prisma.constructionDiary.upsert({
      where: { contractId_number: { contractId: contract.id, number: diaryNumber } },
      update: { deletedAt: null },
      create: {
        tenantId, contractId: contract.id, createdByUserId: userId,
        responsibleInspectorId: inspectors[index % inspectors.length]!.id,
        number: diaryNumber, date: atNoon(`2026-07-${String(20 + index).padStart(2, '0')}`),
        operationalSituation: 'Execução normal dos serviços programados', weather: 'Ensolarado',
        temperatureCelsius: 26, precipitationMm: 0, status: ConstructionDiaryStatus.VALIDATED,
        workFront: 'Áreas técnicas e ambientes administrativos', ownWorkforce: 4,
        outsourcedWorkforce: 6, servicesPerformed: 'Inspeções, ajustes e substituições programadas.',
        servicesInProgress: 'Testes funcionais e limpeza técnica.',
        occurrencesAndRisks: `${DEMO_MARKER} Sem acidentes; sinalização reforçada na frente de trabalho.`,
        contractualImpact: 'Sem impacto identificado',
        inspectionDirections: 'Manter isolamento da área e registrar evidências fotográficas.',
      },
    });

    const communicationNumber = `CP-DEMO-${String(index + 1).padStart(3, '0')}/2026`;
    await prisma.contractCommunicationClaim.upsert({
      where: { contractId_number: { contractId: contract.id, number: communicationNumber } },
      update: { deletedAt: null },
      create: {
        tenantId, contractId: contract.id, createdByUserId: userId,
        responsibleInspectorId: inspectors[index % inspectors.length]!.id,
        number: communicationNumber, type: index % 2 ? 'Pedido de orientação técnica' : 'Solicitação de esclarecimento',
        protocolDate: atNoon(`2026-07-${String(10 + index).padStart(2, '0')}`),
        sender: 'Contratada', recipient: 'Fiscalização', priority: ContractCommunicationPriority.NORMAL,
        currentStatus: index < 3 ? 'Em instrução' : 'Decidido', claimNature: 'Escopo',
        workflowStage: index < 3 ? 'Manifestação técnica' : 'Comunicação da decisão',
        standardDecisionDays: 30, decisionDeadline: atNoon(`2026-08-${String(10 + index).padStart(2, '0')}`),
        subject: `Esclarecimento operacional do ${contract.code}`,
        detailedDescription: `${DEMO_MARKER} Comunicação fictícia sobre método executivo e sequência dos serviços.`,
        inspectionOpinion: 'A fiscalização orienta seguir o procedimento técnico aprovado.',
      },
    });
  }

  for (const seed of AMENDMENT_SEEDS) {
    const contract = contractByCode.get(seed.contractCode)!;
    await prisma.contractAmendment.upsert({
      where: { contractId_number: { contractId: contract.id, number: seed.number } },
      update: {},
      create: {
        tenantId, contractId: contract.id, number: seed.number, type: seed.type,
        description: `${DEMO_MARKER} ${seed.description}`, signedAt: atNoon(seed.signedAt),
        effectiveAt: atNoon(seed.effectiveAt),
        endDateBefore: 'endDateBefore' in seed ? atNoon(seed.endDateBefore) : undefined,
        endDateAfter: 'endDateAfter' in seed ? atNoon(seed.endDateAfter) : undefined,
        valueChange: 'valueChange' in seed ? seed.valueChange : undefined,
      },
    });
  }

  for (const seed of ADJUSTMENT_SEEDS) {
    const contract = contractByCode.get(seed.contractCode)!;
    const exists = await prisma.contractAdjustment.findFirst({ where: {
      tenantId, contractId: contract.id, type: seed.type, referencePeriod: seed.referencePeriod,
      status: 'ACTIVE', canceledAt: null,
    } });
    if (!exists) await prisma.contractAdjustment.create({ data: {
      tenantId, contractId: contract.id, type: seed.type, referencePeriod: seed.referencePeriod,
      requestDate: atNoon(seed.requestDate), approvalDate: atNoon(seed.approvalDate),
      percentage: seed.percentage, amount: seed.amount, indexName: seed.indexName,
      notes: `${DEMO_MARKER} ${seed.notes}`,
    } });
  }

  for (const seed of SUBCONTRACT_SEEDS) {
    const contract = contractByCode.get(seed.contractCode)!;
    const supplier = supplierByTaxId.get(seed.supplierTaxId)!;
    const exists = await prisma.contractSubcontract.findFirst({ where: {
      tenantId, contractId: contract.id, authorizationCase: seed.authorizationCase,
    } });
    if (!exists) await prisma.contractSubcontract.create({ data: {
      tenantId, contractId: contract.id, supplierId: supplier.id,
      subcontractorName: supplier.legalName, subcontractorTaxId: supplier.taxId,
      scope: `${DEMO_MARKER} ${seed.scope}`, amount: seed.amount,
      startDate: atNoon(seed.startDate), endDate: atNoon(seed.endDate),
      approvedAt: atNoon(seed.approvedAt), authorizationCase: seed.authorizationCase,
    } });
  }

  const commitmentByContract = new Map<string, Awaited<ReturnType<typeof prisma.commitment.upsert>>>();
  for (const [contractCode, seed] of Object.entries(COMMITMENT_BY_CONTRACT)) {
    const contract = contractByCode.get(contractCode)!;
    const commitment = await prisma.commitment.upsert({
      where: { tenantId_number_fiscalYear: { tenantId, number: seed.number, fiscalYear: 2026 } },
      update: {},
      create: {
        tenantId, contractId: contract.id, createdByUserId: userId, number: seed.number,
        fiscalYear: 2026, issueDate: atNoon(seed.issueDate), originalValue: seed.originalValue,
        notes: `${DEMO_MARKER} Empenho principal para homologação financeira.`,
      },
    });
    commitmentByContract.set(contractCode, commitment);
    if (!await prisma.commitmentMovement.findFirst({ where: {
      commitmentId: commitment.id, type: CommitmentMovementType.ISSUE,
    } })) await prisma.commitmentMovement.create({ data: {
      tenantId, commitmentId: commitment.id, createdByUserId: userId,
      type: CommitmentMovementType.ISSUE, amount: commitment.originalValue,
      occurredAt: commitment.issueDate, documentRef: `EMISSAO-${commitment.number}`,
      notes: `${DEMO_MARKER} Emissão inicial.`,
    } });
  }
  await ensureMovement(prisma, { tenantId, userId,
    commitmentId: commitmentByContract.get('CT-2026/003')!.id,
    type: CommitmentMovementType.REINFORCEMENT, amount: 50000,
    occurredAt: atNoon('2026-05-15'), documentRef: 'REFORCO-DEMO-001/2026' });
  await ensureMovement(prisma, { tenantId, userId,
    commitmentId: commitmentByContract.get('CT-2026/005')!.id,
    type: CommitmentMovementType.CANCELLATION, amount: 20000,
    occurredAt: atNoon('2026-07-20'), documentRef: 'ANULACAO-DEMO-001/2026' });

  const category = await prisma.operationalCatalogItem.findFirst({ where: {
    tenantId, kind: OperationalCatalogKind.CATEGORY, code: 'GERAL', deletedAt: null,
  } });
  for (const scenario of FINANCIAL_SCENARIOS) {
    const contract = contractByCode.get(scenario.contractCode)!;
    const openedAt = atNoon(`${scenario.referenceMonth}-05`);
    const completedAt = atNoon(`${scenario.referenceMonth}-18`);
    const workOrder = await prisma.workOrder.upsert({
      where: { tenantId_number: { tenantId, number: scenario.number } },
      update: { deletedAt: null },
      create: {
        tenantId, number: scenario.number, buildingId: contract.buildings[0].buildingId,
        requesterUserId: userId, createdByUserId: userId, acceptedByUserId: userId,
        supplierId: contract.supplierId, categoryId: category?.id,
        title: scenario.title, description: `${DEMO_MARKER} ${scenario.title}.`,
        priority: WorkOrderPriority.NORMAL, status: WorkOrderStatus.CLOSED,
        openedAt, startedAt: atNoon(`${scenario.referenceMonth}-08`), completedAt,
        closedAt: atNoon(`${scenario.referenceMonth}-19`), acceptedAt: atNoon(`${scenario.referenceMonth}-19`),
        solution: 'Serviço fictício executado e aceito para teste do fluxo financeiro.',
        measurementEligible: true,
      },
    });
    await prisma.workOrderContract.upsert({
      where: { workOrderId_contractId: { workOrderId: workOrder.id, contractId: contract.id } },
      update: { isPrimary: true },
      create: { workOrderId: workOrder.id, contractId: contract.id, isPrimary: true,
        allocatedAmount: scenario.finalValue },
    });
    const closedHistoryNote = `${DEMO_MARKER} OS concluída para homologação de orçamento e medição.`;
    if (!await prisma.workOrderStatusHistory.findFirst({ where: {
      workOrderId: workOrder.id, note: closedHistoryNote,
    } })) await prisma.workOrderStatusHistory.create({ data: {
      workOrderId: workOrder.id, changedByUserId: userId, toStatus: WorkOrderStatus.CLOSED,
      note: closedHistoryNote, changedAt: completedAt,
    } });

    const finalTotal = new Prisma.Decimal(scenario.finalValue);
    const stageTotals: Array<[BudgetStage, Prisma.Decimal]> = [
      [BudgetStage.PLANNED, finalTotal.times('1.08').toDecimalPlaces(2)],
      [BudgetStage.APPROVED, finalTotal.times('1.03').toDecimalPlaces(2)],
      [BudgetStage.FINAL_EXECUTED, finalTotal],
    ];
    const budgetByStage = new Map<BudgetStage, Awaited<ReturnType<typeof ensureBudget>>>();
    for (const [stage, total] of stageTotals) budgetByStage.set(stage, await ensureBudget(prisma, {
      tenantId, userId, workOrderId: workOrder.id, workOrderNumber: workOrder.number,
      referenceMonth: scenario.referenceMonth, stage, total,
    }));
    await prisma.workOrder.update({ where: { id: workOrder.id }, data: {
      estimatedCost: stageTotals[0][1], approvedCost: stageTotals[1][1], finalCost: finalTotal,
    } });

    const deduction = scenario.measurementStatus === MeasurementStatus.REJECTED
      ? finalTotal.times('0.05').toDecimalPlaces(2) : new Prisma.Decimal(0);
    const net = finalTotal.minus(deduction);
    const measurementStatus: MeasurementStatus = scenario.measurementStatus;
    const submitted = measurementStatus !== MeasurementStatus.DRAFT;
    const reviewed = measurementStatus !== MeasurementStatus.DRAFT
      && measurementStatus !== MeasurementStatus.SUBMITTED;
    const approved = new Set<MeasurementStatus>([
      MeasurementStatus.APPROVED, MeasurementStatus.LIQUIDATED, MeasurementStatus.PAID,
    ]).has(measurementStatus);
    const liquidated = new Set<MeasurementStatus>([
      MeasurementStatus.LIQUIDATED, MeasurementStatus.PAID,
    ]).has(measurementStatus);
    const paid = measurementStatus === MeasurementStatus.PAID;
    const commitment = commitmentByContract.get(scenario.contractCode)!;
    const measurement = await prisma.measurement.upsert({
      where: { contractId_number: { contractId: contract.id, number: scenario.measurementNumber } },
      update: {},
      create: {
        tenantId, contractId: contract.id, commitmentId: commitment.id, createdByUserId: userId,
        reviewedByUserId: reviewed ? userId : undefined, approvedByUserId: approved ? userId : undefined,
        number: scenario.measurementNumber, referenceMonth: scenario.referenceMonth,
        status: measurementStatus, grossAmount: finalTotal, deductions: deduction,
        netAmount: net, submittedAt: submitted ? atNoon(`${scenario.referenceMonth}-23`) : undefined,
        reviewedAt: reviewed ? atNoon(`${scenario.referenceMonth}-24`) : undefined,
        approvedAt: approved ? atNoon(`${scenario.referenceMonth}-25`) : undefined,
        liquidatedAt: liquidated ? atNoon(`${scenario.referenceMonth}-27`) : undefined,
        paidAt: paid ? atNoon(`${scenario.referenceMonth}-28`) : undefined,
        decisionNote: measurementStatus === MeasurementStatus.REJECTED
          ? `${DEMO_MARKER} Medição devolvida para correção de quantitativos.` : undefined,
        version: measurementVersion(measurementStatus),
        notes: `${DEMO_MARKER} Boletim criado para testar o workflow de medições.`,
        items: { create: {
          tenantId, workOrderId: workOrder.id, budgetId: budgetByStage.get(BudgetStage.FINAL_EXECUTED)!.id,
          description: `Orçamento final executado da ${workOrder.number}`,
          amount: finalTotal, deductionAmount: deduction, netAmount: net,
          snapshot: { demonstration: true, budgetStage: BudgetStage.FINAL_EXECUTED,
            workOrderNumber: workOrder.number, finalValue: finalTotal.toString() },
        } },
      },
    });
    if (liquidated) await ensureMovement(prisma, { tenantId, userId,
      commitmentId: commitment.id, measurementId: measurement.id,
      type: CommitmentMovementType.LIQUIDATION, amount: measurement.netAmount,
      occurredAt: measurement.liquidatedAt!, documentRef: `LIQ-${measurement.number}` });
    if (paid) await ensureMovement(prisma, { tenantId, userId,
      commitmentId: commitment.id, measurementId: measurement.id,
      type: CommitmentMovementType.PAYMENT, amount: measurement.netAmount,
      occurredAt: measurement.paidAt!, documentRef: `PAG-${measurement.number}` });
  }

  for (const contract of contracts) {
    const [amendments, adjustments, apostilles, measurements] = await Promise.all([
      prisma.contractAmendment.findMany({ where: { tenantId, contractId: contract.id,
        status: 'ACTIVE', canceledAt: null } }),
      prisma.contractAdjustment.findMany({ where: { tenantId, contractId: contract.id,
        status: 'ACTIVE', canceledAt: null } }),
      prisma.contractApostille.findMany({ where: { tenantId, contractId: contract.id,
        status: 'ACTIVE', deletedAt: null } }),
      prisma.measurement.findMany({ where: { tenantId, contractId: contract.id, canceledAt: null } }),
    ]);
    const currentValue = [...amendments.map((item) => item.valueChange), ...adjustments.map((item) => item.amount),
      ...apostilles.map((item) => item.valueChange)]
      .reduce<Prisma.Decimal>((total, value) => value ? total.plus(value) : total,
        new Prisma.Decimal(contract.originalValue));
    const measuredStatuses = new Set<MeasurementStatus>([
      MeasurementStatus.APPROVED, MeasurementStatus.LIQUIDATED, MeasurementStatus.PAID,
    ]);
    const measuredValue = measurements.filter((item) => measuredStatuses.has(item.status))
      .reduce((total, item) => total.plus(item.netAmount), new Prisma.Decimal(0));
    const paidValue = measurements.filter((item) => item.status === MeasurementStatus.PAID)
      .reduce((total, item) => total.plus(item.netAmount), new Prisma.Decimal(0));
    const endDate = amendments.reduce((latest, item) => item.endDateAfter && item.endDateAfter > latest
      ? item.endDateAfter : latest, contract.endDate);
    await prisma.contract.update({ where: { id: contract.id }, data: {
      currentValue, measuredValue, paidValue, endDate,
    } });
  }

  await prisma.tenantSequence.upsert({
    where: { tenantId_key: { tenantId, key: 'WORK_ORDER:2026' } },
    create: { tenantId, key: 'WORK_ORDER:2026', currentValue: 20 },
    update: {},
  });
  await prisma.tenantSequence.updateMany({
    where: { tenantId, key: 'WORK_ORDER:2026', currentValue: { lt: 20 } },
    data: { currentValue: 20 },
  });
  const auditExists = await prisma.auditLog.findFirst({ where: {
    tenantId, entityType: 'ContractTestPortfolio', entityId: 'DEMO-2026-V1',
  } });
  if (!auditExists) await prisma.auditLog.create({ data: {
    tenantId, actorUserId: userId, action: AuditAction.CREATE,
    entityType: 'ContractTestPortfolio', entityId: 'DEMO-2026-V1',
    afterData: { marker: DEMO_MARKER, ...CONTRACT_TEST_DATA_EXPECTED },
  } });
  if (!await prisma.notification.findFirst({ where: {
    tenantId, userId, title: 'Carteira contratual fictícia disponível',
  } })) await prisma.notification.create({ data: {
    tenantId, userId, eventType: 'CONTRACT_EXPIRING',
    title: 'Carteira contratual fictícia disponível',
    message: 'Contratos, fiscalização, garantias, apostilamentos, recebimentos, diários, pleitos e dados financeiros DEMO foram criados.',
    actionUrl: '/contratos',
  } });
}
