import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';

type TestAgent = ReturnType<typeof request.agent>;

type TenantFixture = {
  agent: TestAgent;
  buildingId: string;
  supplierId: string;
  contractId: string;
  workOrderId: string;
  attachmentId: string;
};

describe('isolamento multiempresa', () => {
  let app: INestApplication;
  let uploadRoot: string;
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'e2e-only-secret-with-at-least-thirty-two-characters';
    process.env.COOKIE_SECURE = 'false';
    process.env.COOKIE_DOMAIN = '';
    uploadRoot = await mkdtemp(path.join(tmpdir(), 'gestaopredios-e2e-'));
    process.env.UPLOAD_ROOT = uploadRoot;

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    tenantA = await createTenantFixture(app, 'a');
    tenantB = await createTenantFixture(app, 'b');
  });

  afterAll(async () => {
    await app?.close();
    if (uploadRoot) await rm(uploadRoot, { force: true, recursive: true });
  });

  it('não lista nem consulta recursos de outra organização', async () => {
    const list = await tenantA.agent.get('/api/v1/work-orders').expect(200);

    expect(list.body.pagination.total).toBe(1);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(tenantA.workOrderId);
    expect(list.body.items.some((item: { id: string }) => item.id === tenantB.workOrderId)).toBe(
      false,
    );

    await tenantA.agent.get(`/api/v1/buildings/${tenantB.buildingId}`).expect(404);
    await tenantA.agent.get(`/api/v1/suppliers/${tenantB.supplierId}`).expect(404);
    await tenantA.agent.get(`/api/v1/contracts/${tenantB.contractId}`).expect(404);
    await tenantA.agent.get(`/api/v1/work-orders/${tenantB.workOrderId}`).expect(404);
  });

  it('não altera nem cria relações usando identificadores de outra organização', async () => {
    await tenantA.agent
      .patch(`/api/v1/buildings/${tenantB.buildingId}`)
      .send({ name: 'Tentativa cruzada' })
      .expect(404);

    await tenantA.agent
      .post('/api/v1/work-orders')
      .send({
        buildingId: tenantB.buildingId,
        title: 'Tentativa de OS cruzada',
        description: 'A API deve rejeitar a edificação de outra organização.',
      })
      .expect(400);

    await tenantA.agent
      .post(`/api/v1/work-orders/${tenantB.workOrderId}/pendencies`)
      .send({ reason: 'Tentativa de pendência em recurso de outra organização.' })
      .expect(404);
  });

  it('não permite baixar anexo de outra organização', async () => {
    await tenantA.agent
      .get(
        `/api/v1/work-orders/${tenantB.workOrderId}/attachments/${tenantB.attachmentId}/download`,
      )
      .expect(404);
  });
});

async function createTenantFixture(
  app: INestApplication,
  label: string,
): Promise<TenantFixture> {
  const unique = randomUUID();
  const agent = request.agent(app.getHttpServer());

  await agent
    .post('/api/v1/auth/register-tenant')
    .send({
      tenantName: `Organização E2E ${label.toUpperCase()}`,
      tenantSlug: `e2e-${label}-${unique}`,
      ownerName: `Responsável ${label.toUpperCase()}`,
      email: `e2e-${label}-${unique}@example.test`,
      password: `Teste-${unique}-Aa1!`,
    })
    .expect(201);

  const building = await agent
    .post('/api/v1/buildings')
    .send({
      code: `EDF-${label}-${unique.slice(0, 8)}`,
      name: `Edificação ${label.toUpperCase()}`,
      addressLine1: 'Rua de Teste, 100',
      city: 'Brasília',
      state: 'DF',
      postalCode: '70000-000',
    })
    .expect(201);

  const supplier = await agent
    .post('/api/v1/suppliers')
    .send({
      legalName: `Fornecedor ${label.toUpperCase()} Ltda.`,
      taxId: unique.replaceAll('-', '').slice(0, 14),
    })
    .expect(201);

  const contract = await agent
    .post('/api/v1/contracts')
    .send({
      code: `CT-${label}-${unique.slice(0, 8)}`,
      supplierId: supplier.body.id,
      object: 'Contrato sintético exclusivo para o teste de isolamento.',
      type: 'INTEGRATED_MAINTENANCE',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2027-01-01T00:00:00.000Z',
      originalValue: 1000,
      buildingIds: [building.body.id],
    })
    .expect(201);

  const workOrder = await agent
    .post('/api/v1/work-orders')
    .send({
      buildingId: building.body.id,
      title: `OS da organização ${label.toUpperCase()}`,
      description: 'Ordem de serviço sintética para validar o isolamento multiempresa.',
      supplierId: supplier.body.id,
      contractIds: [contract.body.id],
    })
    .expect(201);

  const attachment = await agent
    .post(`/api/v1/work-orders/${workOrder.body.id}/attachments`)
    .field('kind', 'PHOTO_BEFORE')
    .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), {
      filename: 'evidencia.jpg',
      contentType: 'image/jpeg',
    })
    .expect(201);

  return {
    agent,
    buildingId: building.body.id,
    supplierId: supplier.body.id,
    contractId: contract.body.id,
    workOrderId: workOrder.body.id,
    attachmentId: attachment.body.id,
  };
}
