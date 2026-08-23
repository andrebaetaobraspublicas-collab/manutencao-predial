import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  ContractStatus,
  ContractType,
  MeasurementStatus,
  SinapiItemType,
  WorkOrderStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

type TestAgent = ReturnType<typeof request.agent>;

const chunk = <T>(values: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};

describe('homologação de volume e desempenho', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: TestAgent;
  let tenantId: string;
  let catalogId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'e2e-only-secret-with-at-least-thirty-two-characters';
    process.env.COOKIE_SECURE = 'false';
    process.env.COOKIE_DOMAIN = '';

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(helmet());
    app.use(compression());
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }));
    await app.init();
    prisma = app.get(PrismaService);
    agent = request.agent(app.getHttpServer());

    const unique = randomUUID();
    const slug = `volume-${unique}`;
    await agent.post('/api/v1/auth/register-tenant').send({
      tenantName: 'Organização de Volume E2E', tenantSlug: slug,
      ownerName: 'Responsável de Volume', email: `volume-${unique}@example.test`,
      password: `Teste-${unique}-Aa1!`,
    }).expect(201);
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug },
      include: { memberships: { include: { user: true }, take: 1 } },
    });
    tenantId = tenant.id;
    const userId = tenant.memberships[0].userId;

    const building = await agent.post('/api/v1/buildings').send({
      code: 'EDF-VOLUME', name: 'Edificação de Volume', addressLine1: 'Rua da Homologação, 100',
      city: 'Brasília', state: 'DF', postalCode: '70000-000',
    }).expect(201);
    const supplier = await agent.post('/api/v1/suppliers').send({
      legalName: 'Fornecedor de Volume Ltda.', taxId: unique.replaceAll('-', '').slice(0, 14),
    }).expect(201);
    const baseContract = await agent.post('/api/v1/contracts').send({
      code: 'CT-VOLUME-0000', supplierId: supplier.body.id,
      object: 'Contrato-base dos ensaios automatizados de volume.', type: 'INTEGRATED_MAINTENANCE',
      startDate: '2026-01-01', endDate: '2027-12-31', originalValue: 100000000,
      buildingIds: [building.body.id],
    }).expect(201);

    const contracts = Array.from({ length: 999 }, (_, index) => ({
      id: randomUUID(), tenantId, supplierId: supplier.body.id,
      code: `CT-VOLUME-${String(index + 1).padStart(4, '0')}`,
      object: `Contrato sintético de carga ${index + 1}`,
      type: ContractType.INTEGRATED_MAINTENANCE,
      status: ContractStatus.ACTIVE,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2027-12-31T00:00:00.000Z'),
      originalValue: 100000,
      currentValue: 100000,
    }));
    for (const rows of chunk(contracts, 500)) await prisma.contract.createMany({ data: rows });

    const workOrders = Array.from({ length: 10_000 }, (_, index) => ({
      id: randomUUID(), tenantId, number: `OS-VOLUME-${String(index + 1).padStart(5, '0')}`,
      buildingId: building.body.id, requesterUserId: userId, createdByUserId: userId,
      supplierId: supplier.body.id, title: `Ordem de serviço de carga ${index + 1}`,
      description: index % 10 === 0 ? 'Concretagem e manutenção preventiva simulada.' : 'Manutenção predial simulada.',
      status: WorkOrderStatus.OPEN,
    }));
    for (const rows of chunk(workOrders, 500)) await prisma.workOrder.createMany({ data: rows });

    const measurements = Array.from({ length: 10_000 }, (_, index) => ({
      id: randomUUID(), tenantId, contractId: baseContract.body.id, createdByUserId: userId,
      number: `MED-VOLUME-${String(index + 1).padStart(5, '0')}`,
      referenceMonth: `${2026 + Math.floor(index / 12) % 2}-${String((index % 12) + 1).padStart(2, '0')}`,
      status: MeasurementStatus.DRAFT,
      grossAmount: 10, netAmount: 10,
    }));
    for (const rows of chunk(measurements, 500)) await prisma.measurement.createMany({ data: rows });

    const catalog = await prisma.sinapiCatalog.create({ data: {
      tenantId, importedByUserId: userId, referenceMonth: '2026-08', state: 'DF',
      version: `volume-${unique.slice(0, 8)}`, itemCount: 15_000,
    } });
    catalogId = catalog.id;
    const catalogItems = Array.from({ length: 15_000 }, (_, index) => ({
      id: randomUUID(), tenantId, catalogId, type: index % 2 ? SinapiItemType.INPUT : SinapiItemType.COMPOSITION,
      code: `SIN-${String(index + 1).padStart(6, '0')}`,
      description: index % 10 === 0
        ? `CONCRETAGEM DE ESTRUTURA - ITEM ${index + 1}`
        : `SERVIÇO DE MANUTENÇÃO PREDIAL - ITEM ${index + 1}`,
      unit: index % 2 ? 'UN' : 'M3', unitCost: (index % 1000) + 0.5,
    }));
    for (const rows of chunk(catalogItems, 500)) await prisma.sinapiCatalogItem.createMany({ data: rows });
  }, 180_000);

  afterAll(async () => {
    await app?.close();
  });

  it('confirma a massa mínima de homologação', async () => {
    const [contracts, workOrders, measurements, catalogItems] = await Promise.all([
      prisma.contract.count({ where: { tenantId } }),
      prisma.workOrder.count({ where: { tenantId } }),
      prisma.measurement.count({ where: { tenantId } }),
      prisma.sinapiCatalogItem.count({ where: { tenantId, catalogId } }),
    ]);
    expect(contracts).toBe(1000);
    expect(workOrders).toBe(10_000);
    expect(measurements).toBe(10_000);
    expect(catalogItems).toBe(15_000);
  });

  it('lista e pesquisa 10 mil ordens de serviço em até 5 segundos', async () => {
    const startedAt = performance.now();
    const response = await agent.get('/api/v1/work-orders?page=1&pageSize=25&search=concretagem').expect(200);
    const elapsedMs = performance.now() - startedAt;
    console.info(`[HOMOLOGATION_METRIC] work-orders-search-ms=${elapsedMs.toFixed(0)}`);
    expect(response.body.pagination.total).toBe(1000);
    expect(response.body.items).toHaveLength(25);
    expect(elapsedMs).toBeLessThan(5_000);
  });

  it('pesquisa 15 mil referências SINAPI em até 5 segundos', async () => {
    const startedAt = performance.now();
    const response = await agent
      .get(`/api/v1/budgets/sinapi/catalogs/${catalogId}/search?search=concretagem&page=1&pageSize=25`)
      .expect(200);
    const elapsedMs = performance.now() - startedAt;
    console.info(`[HOMOLOGATION_METRIC] sinapi-search-ms=${elapsedMs.toFixed(0)}`);
    expect(response.body.pagination.total).toBe(1500);
    expect(response.body.items).toHaveLength(25);
    expect(elapsedMs).toBeLessThan(5_000);
  });

  it('consolida painel e conciliação de mil contratos em até 15 segundos', async () => {
    const startedAt = performance.now();
    const response = await agent.get('/api/v1/dashboard/overview').expect(200);
    const elapsedMs = performance.now() - startedAt;
    console.info(`[HOMOLOGATION_METRIC] dashboard-1000-contracts-ms=${elapsedMs.toFixed(0)}`);
    expect(response.body.workOrders.open).toBe(10_000);
    expect(response.body.contracts.reconciliation.totalContracts).toBe(1000);
    expect(elapsedMs).toBeLessThan(15_000);
  });
});
