import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import {
  BillingInterval,
  ContractStatus,
  ContractType,
  KpiCategory,
  KpiDirection,
  MembershipRole,
  MembershipStatus,
  PrismaClient,
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

const seedAdminPassword = requireSeedAdminPassword();
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

async function main() {
  const seedAdminPasswordHash = await hash(seedAdminPassword, 12);
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

  const user = await prisma.user.upsert({
    where: { email: seedAdminEmail },
    update: { passwordHash: seedAdminPasswordHash },
    create: {
      name: 'Administrador de Demonstração',
      email: seedAdminEmail,
      passwordHash: seedAdminPasswordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { status: MembershipStatus.ACTIVE, role: MembershipRole.OWNER },
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
      const workOrder = await prisma.workOrder.create({
        data: {
          tenantId: tenant.id,
          buildingId: building.id,
          requesterUserId: user.id,
          createdByUserId: user.id,
          supplierId: supplier.id,
          number: example.number,
          title: example.title,
          description: example.description,
          priority: example.priority,
          status: example.status,
          hasOpenPendency: example.status === WorkOrderStatus.PENDING,
          openedAt: example.openedAt,
          slaResponseDeadline: new Date(example.openedAt.getTime() + 8 * 60 * 60 * 1000),
          slaResolutionDeadline: new Date(example.openedAt.getTime() + 72 * 60 * 60 * 1000),
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
      update: { currentValue: 3 },
    });
  }

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
