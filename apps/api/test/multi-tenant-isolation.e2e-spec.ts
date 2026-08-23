import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';

type TestAgent = ReturnType<typeof request.agent>;

type TenantFixture = {
  agent: TestAgent;
  tenantSlug: string;
  buildingId: string;
  supplierId: string;
  contractId: string;
  workOrderId: string;
  attachmentId: string;
  membershipId: string;
  categoryId: string;
  commitmentId: string;
  assetId: string;
  maintenancePlanId: string;
  sinapiCatalogId: string;
  budgetId: string;
  kpiDefinitionId: string;
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
    app.use(helmet());
    app.use(compression());
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

  it('expõe saúde, aplica cabeçalhos de segurança e rejeita entradas inválidas', async () => {
    const health = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(health.body.readiness).toBe('ready');
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['content-security-policy']).toContain("default-src 'self'");

    await request(app.getHttpServer()).get('/api/v1/contracts').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'inexistente@example.test', password: 'senha-incorreta' })
      .expect(401);
    await tenantA.agent
      .post('/api/v1/buildings')
      .send({
        code: 'INVALIDO', name: 'Entrada inválida', addressLine1: 'Rua A', city: 'Brasília',
        state: 'DF', postalCode: '70000-000', campoNaoPermitido: 'não deve passar',
      })
      .expect(400);
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

  it('isola a administração de membros e a revogação de sessões', async () => {
    const list = await tenantA.agent.get('/api/v1/members').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(tenantA.membershipId);
    expect(list.body.some((item: { id: string }) => item.id === tenantB.membershipId)).toBe(false);

    await tenantA.agent
      .patch(`/api/v1/members/${tenantB.membershipId}`)
      .send({ status: 'SUSPENDED' })
      .expect(404);
    await tenantA.agent
      .post(`/api/v1/members/${tenantB.membershipId}/revoke-sessions`)
      .expect(404);
  });

  it('permite ao administrador criar, suspender, reativar e trocar a senha de usuários', async () => {
    const unique = randomUUID();
    const email = `operador-${unique}@example.test`;
    const initialPassword = `Inicial-${unique}-Aa1!`;
    const newPassword = `Alterada-${unique}-Bb2!`;
    const created = await tenantA.agent.post('/api/v1/members').send({
      name: 'Operador E2E', email, password: initialPassword, role: 'OPERATOR',
    }).expect(201);
    const memberAgent = request.agent(app.getHttpServer());
    await memberAgent.post('/api/v1/auth/login').send({
      tenantSlug: tenantA.tenantSlug, email, password: initialPassword,
    }).expect(200);
    await memberAgent.get('/api/v1/members/directory').expect(200);

    await tenantA.agent.patch(`/api/v1/members/${created.body.id}`).send({ status: 'SUSPENDED' }).expect(200);
    await memberAgent.get('/api/v1/members/directory').expect(401);
    await tenantA.agent.patch(`/api/v1/members/${created.body.id}`).send({ status: 'ACTIVE' }).expect(200);
    await tenantA.agent.post(`/api/v1/members/${created.body.id}/password`)
      .send({ newPassword }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      tenantSlug: tenantA.tenantSlug, email, password: initialPassword,
    }).expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      tenantSlug: tenantA.tenantSlug, email, password: newPassword,
    }).expect(200);
  });

  it('isola catálogos, comentários e fluxos robustos da OS', async () => {
    await tenantA.agent
      .patch(`/api/v1/operations/catalogs/${tenantB.categoryId}`)
      .send({ name: 'Tentativa cruzada' })
      .expect(404);
    await tenantA.agent
      .get(`/api/v1/operations/catalogs/${tenantB.categoryId}/checklist-template`)
      .expect(404);
    await tenantA.agent
      .post(`/api/v1/work-orders/${tenantB.workOrderId}/comments`)
      .send({ body: 'Comentário cruzado deve ser recusado.' })
      .expect(404);
    await tenantA.agent
      .post(`/api/v1/work-orders/${tenantB.workOrderId}/close`)
      .send({ measurementEligible: false })
      .expect(404);
    await tenantA.agent
      .post(`/api/v1/work-orders/${tenantB.workOrderId}/reopen`)
      .send({ reason: 'Tentativa de reabertura em outra organização.' })
      .expect(404);
  });

  it('isola empenhos, SINAPI, orçamentos, ativos e planos preventivos', async () => {
    const commitments = await tenantA.agent.get('/api/v1/finance/commitments').expect(200);
    expect(commitments.body).toHaveLength(1);
    expect(commitments.body[0].id).toBe(tenantA.commitmentId);

    await tenantA.agent
      .post(`/api/v1/finance/commitments/${tenantB.commitmentId}/movements`)
      .send({ type: 'REINFORCEMENT', amount: 10, occurredAt: '2026-08-02T12:00:00.000Z' })
      .expect(404);
    await tenantA.agent
      .get(`/api/v1/budgets/sinapi/catalogs/${tenantB.sinapiCatalogId}/items`)
      .expect(404);
    const textualSearch = await tenantA.agent
      .get(`/api/v1/budgets/sinapi/catalogs/${tenantA.sinapiCatalogId}/search?search=Serviço`)
      .expect(200);
    expect(textualSearch.body.pagination.total).toBe(1);
    await tenantA.agent
      .get(`/api/v1/budgets/work-orders/${tenantB.workOrderId}`)
      .expect(404);
    await tenantA.agent
      .patch(`/api/v1/maintenance/assets/${tenantB.assetId}`)
      .send({ name: 'Tentativa cruzada' })
      .expect(404);
    await tenantA.agent
      .patch(`/api/v1/maintenance/plans/${tenantB.maintenancePlanId}`)
      .send({ name: 'Tentativa cruzada' })
      .expect(404);

    const budgets = await tenantA.agent.get('/api/v1/budgets').expect(200);
    expect(budgets.body).toHaveLength(1);
    expect(budgets.body[0].id).toBe(tenantA.budgetId);
  });

  it('isola a planilha orçamentária contratual e sua seleção pelas OS', async () => {
    const created = await tenantA.agent
      .post(`/api/v1/budgets/contracts/${tenantA.contractId}/items`)
      .send({
        kind: 'ON_DEMAND_SERVICE',
        code: 'SERV-CT-001',
        description: 'Serviço eventual previsto no contrato A',
        unit: 'UN',
        quantity: 10,
        unitCost: 100,
        includedInTotal: true,
      })
      .expect(201);

    await tenantA.agent
      .patch(`/api/v1/budgets/contracts/${tenantA.contractId}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    const available = await tenantA.agent
      .get(`/api/v1/budgets/work-orders/${tenantA.workOrderId}/contract-items`)
      .expect(200);
    expect(available.body.items.some((item: { id: string }) => item.id === created.body.item.id)).toBe(true);

    await tenantB.agent
      .get(`/api/v1/budgets/contracts/${tenantA.contractId}`)
      .expect(404);
    await tenantB.agent
      .post(`/api/v1/budgets/contracts/${tenantA.contractId}/items`)
      .send({
        kind: 'MATERIAL', code: 'CRUZADO', description: 'Tentativa cruzada',
        unit: 'UN', quantity: 1, unitCost: 1,
      })
      .expect(404);
    await tenantB.agent
      .put(`/api/v1/budgets/work-orders/${tenantB.workOrderId}`)
      .send({
        bdiPercentage: 0,
        items: [{ contractBudgetItemId: created.body.item.id, quantity: 1 }],
      })
      .expect(400);
  });

  it('isola categorias de fornecedor e eventos contratuais e deriva o valor atual', async () => {
    await tenantA.agent
      .patch(`/api/v1/suppliers/${tenantA.supplierId}`)
      .send({ serviceAreaCategoryIds: [tenantB.categoryId] })
      .expect(400);

    await tenantA.agent
      .post(`/api/v1/contracts/${tenantB.contractId}/amendments`)
      .send({ number: 'TA-CRUZADO', type: 'VALUE_INCREASE', description: 'Tentativa cruzada', valueChange: 100 })
      .expect(404);

    const amendment = await tenantA.agent
      .post(`/api/v1/contracts/${tenantA.contractId}/amendments`)
      .send({ number: 'TA-001', type: 'VALUE_INCREASE', description: 'Acréscimo validado', valueChange: 100 })
      .expect(201);

    await tenantA.agent
      .patch(`/api/v1/contracts/${tenantB.contractId}/governance/amendments/${amendment.body.id}`)
      .send({ number: 'TA-001', type: 'VALUE_INCREASE', description: 'Tentativa cruzada', valueChange: 150 })
      .expect(404);

    await tenantA.agent
      .patch(`/api/v1/contracts/${tenantA.contractId}/governance/amendments/${amendment.body.id}`)
      .send({ number: 'TA-001', type: 'VALUE_INCREASE', description: 'Acréscimo editado', valueChange: 150 })
      .expect(200);

    const contract = await tenantA.agent.get(`/api/v1/contracts/${tenantA.contractId}`).expect(200);
    expect(Number(contract.body.currentValue)).toBe(1150);
    expect(contract.body.amendments).toHaveLength(1);
    expect(contract.body.amendments[0].description).toBe('Acréscimo editado');
  });

  it('cadastra, edita e exclui todo o dossiê de fiscalização contratual', async () => {
    const inspector = await tenantA.agent.post('/api/v1/inspectors').send({
      name: 'Fiscal E2E', registrationNumber: `MAT-${randomUUID().slice(0, 8)}`,
      jobTitle: 'Engenheiro civil', specialty: 'Edificações', availableHours: 40, maxProcesses: 8,
    }).expect(201);

    const entries = [
      {
        kind: 'adjustments', endpoint: 'adjustments', payload: {
          type: 'PRICE_ADJUSTMENT', referencePeriod: '2026-08', approvalDate: '2026-08-10',
          percentage: 1, amount: 10, indexName: 'IPCA',
        }, edit: { type: 'PRICE_ADJUSTMENT', referencePeriod: '2026-08', approvalDate: '2026-08-11',
          percentage: 1.1, amount: 11, indexName: 'IPCA' },
      },
      {
        kind: 'subcontracts', endpoint: 'subcontracts', payload: {
          subcontractorName: 'Subcontratada E2E', subcontractorTaxId: '12345678000199',
          scope: 'Execução especializada de testes automatizados.', amount: 25,
          approvedAt: '2026-08-10', authorizationCase: 'AUT-E2E-001',
        }, edit: { subcontractorName: 'Subcontratada E2E Editada', subcontractorTaxId: '12345678000199',
          scope: 'Escopo especializado editado.', amount: 30, approvedAt: '2026-08-11', authorizationCase: 'AUT-E2E-002' },
      },
      {
        kind: 'penalties', endpoint: 'penalties', payload: {
          type: 'WARNING', administrativeCase: 'PROC-E2E-001',
          description: 'Advertência fictícia de homologação.', amount: 0, appliedAt: '2026-08-10',
        }, edit: { type: 'FINE', administrativeCase: 'PROC-E2E-001',
          description: 'Sanção fictícia editada.', amount: 1, appliedAt: '2026-08-11' },
      },
      {
        kind: 'guarantees', endpoint: 'guarantees', payload: {
          number: `GAR-${randomUUID().slice(0, 8)}`, modality: 'SURETY_BOND', guarantorName: 'Seguradora E2E',
          contractPercentage: 5, minimumPercentage: 5, startsAt: '2026-01-01', endsAt: '2027-01-01',
          status: 'PRESENTED', workflow: 'Análise inicial', coverages: 'Execução contratual',
        }, edit: null as Record<string, unknown> | null,
      },
      {
        kind: 'apostilles', endpoint: 'apostilles', payload: {
          number: `AP-${randomUUID().slice(0, 8)}`, type: 'PRICE_ADJUSTMENT', date: '2026-08-10',
          indexName: 'IPCA', percentage: 1, valueChange: 10,
          justification: 'Apostilamento fictício para homologação automatizada.',
        }, edit: null as Record<string, unknown> | null,
      },
      {
        kind: 'receipts', endpoint: 'receipts', payload: {
          number: `REC-${randomUUID().slice(0, 8)}`, type: 'PROVISIONAL', objectCategory: 'Serviços de engenharia',
          status: 'REQUESTED', provisionalRequired: true, decision: 'APPROVE',
          consolidatedOpinion: 'Recebimento provisório apto para homologação.',
        }, edit: null as Record<string, unknown> | null,
      },
      {
        kind: 'construction-diaries', endpoint: 'construction-diaries', payload: {
          number: `DO-${randomUUID().slice(0, 8)}`, workOrderId: tenantA.workOrderId, date: '2026-08-10',
          operationalSituation: 'Execução normal', weather: 'Ensolarado', status: 'OPEN',
          ownWorkforce: 2, outsourcedWorkforce: 1, servicesPerformed: 'Inspeção automatizada.',
        }, edit: null as Record<string, unknown> | null,
      },
      {
        kind: 'communications', endpoint: 'communications', payload: {
          number: `COM-${randomUUID().slice(0, 8)}`, type: 'SOLICITACAO_ESCLARECIMENTO', protocolDate: '2026-08-10',
          sender: 'Contratada', recipient: 'Fiscalização', priority: 'NORMAL', currentStatus: 'Protocolado',
          workflowStage: 'Protocolo', subject: 'Comunicação fictícia',
          detailedDescription: 'Registro para homologação automatizada do fluxo de comunicações.',
        }, edit: null as Record<string, unknown> | null,
      },
    ];

    const teamPayload = {
      inspectorProfileId: inspector.body.id, role: 'TECHNICAL_INSPECTOR', designationAct: 'Portaria E2E 001',
      startsAt: '2026-01-01', isPrimary: true, notes: 'Equipe de homologação.',
    };
    const team = await tenantA.agent
      .post(`/api/v1/contracts/${tenantA.contractId}/inspection-team`).send(teamPayload).expect(201);
    await tenantA.agent
      .patch(`/api/v1/contracts/${tenantA.contractId}/governance/inspection-team/${team.body.id}`)
      .send({ ...teamPayload, designationAct: 'Portaria E2E 002' }).expect(200);

    for (const entry of entries) {
      const created = await tenantA.agent
        .post(`/api/v1/contracts/${tenantA.contractId}/${entry.endpoint}`).send(entry.payload).expect(201);
      const editPayload: Record<string, unknown> = entry.edit ?? { ...entry.payload };
      if (entry.kind === 'guarantees') editPayload.workflow = 'Aprovada na homologação';
      if (entry.kind === 'apostilles') editPayload.justification = 'Justificativa editada pela homologação automatizada.';
      if (entry.kind === 'receipts') editPayload.consolidatedOpinion = 'Parecer consolidado editado.';
      if (entry.kind === 'construction-diaries') editPayload.operationalSituation = 'Execução revisada';
      if (entry.kind === 'communications') editPayload.subject = 'Comunicação fictícia editada';
      await tenantA.agent
        .patch(`/api/v1/contracts/${tenantA.contractId}/governance/${entry.kind}/${created.body.id}`)
        .send(editPayload).expect(200);
      await tenantA.agent
        .delete(`/api/v1/contracts/${tenantA.contractId}/governance/${entry.kind}/${created.body.id}`)
        .expect(200);
    }

    await tenantA.agent
      .delete(`/api/v1/contracts/${tenantA.contractId}/governance/inspection-team/${team.body.id}`).expect(200);
    await tenantA.agent.delete(`/api/v1/inspectors/${inspector.body.id}`).expect(200);
  });

  it('preserva nomes UTF-8 e entrega anexos privados íntegros', async () => {
    const inspection = await tenantA.agent
      .post(`/api/v1/buildings/${tenantA.buildingId}/inspections`)
      .send({ inspectionDate: '2026-08-12', type: 'PREVENTIVE',
        responsibleTechnician: 'Eng. João da Conceição', team: 'Manutenção predial' })
      .expect(201);
    const bytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'utf8');
    const uploaded = await tenantA.agent
      .post(`/api/v1/buildings/${tenantA.buildingId}/attachments`)
      .field('kind', 'INSPECTION_REPORT').field('inspectionId', inspection.body.id)
      .attach('file', bytes, { filename: 'Laudo técnico – inspeção.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(uploaded.body.originalName).toBe('Laudo técnico – inspeção.pdf');

    const downloaded = await tenantA.agent
      .get(`/api/v1/buildings/${tenantA.buildingId}/attachments/${uploaded.body.id}/download`).expect(200);
    expect(downloaded.headers['content-type']).toContain('application/pdf');
    expect(downloaded.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(Buffer.compare(downloaded.body, bytes)).toBe(0);

    await tenantA.agent
      .delete(`/api/v1/buildings/${tenantA.buildingId}/attachments/${uploaded.body.id}`).expect(200);
    await tenantA.agent
      .delete(`/api/v1/buildings/${tenantA.buildingId}/inspections/${inspection.body.id}`).expect(200);
  });

  it('impede estouro e transferência indevida de empenhos sob concorrência', async () => {
    const target = await tenantA.agent.post('/api/v1/contracts').send({
      code: `CT-TARGET-${randomUUID().slice(0, 8)}`, supplierId: tenantA.supplierId,
      object: 'Contrato alvo do teste de transferência de empenho.', type: 'INTEGRATED_MAINTENANCE',
      startDate: '2026-01-01', endDate: '2027-01-01', originalValue: 500,
    }).expect(201);
    await tenantA.agent.post('/api/v1/finance/commitments').send({
      contractId: target.body.id, number: `EMP-TARGET-${randomUUID().slice(0, 8)}`,
      fiscalYear: 2026, issueDate: '2026-08-12', originalValue: 400,
    }).expect(201);
    await tenantA.agent.patch(`/api/v1/finance/commitments/${tenantA.commitmentId}`)
      .send({ contractId: target.body.id }).expect(400);

    const concurrentContract = await tenantA.agent.post('/api/v1/contracts').send({
      code: `CT-CONC-${randomUUID().slice(0, 8)}`, supplierId: tenantA.supplierId,
      object: 'Contrato para teste de concorrência financeira.', type: 'INTEGRATED_MAINTENANCE',
      startDate: '2026-01-01', endDate: '2027-01-01', originalValue: 1000,
    }).expect(201);
    const attempts = await Promise.all([
      tenantA.agent.post('/api/v1/finance/commitments').send({ contractId: concurrentContract.body.id,
        number: `EMP-C1-${randomUUID().slice(0, 8)}`, fiscalYear: 2026, issueDate: '2026-08-12', originalValue: 600 }),
      tenantA.agent.post('/api/v1/finance/commitments').send({ contractId: concurrentContract.body.id,
        number: `EMP-C2-${randomUUID().slice(0, 8)}`, fiscalYear: 2026, issueDate: '2026-08-12', originalValue: 600 }),
    ]);
    expect(attempts.map((item) => item.status).sort()).toEqual([201, 400]);
  });

  it('executa OS, orçamento final, medição, liquidação e pagamento de ponta a ponta', async () => {
    const workOrder = await tenantA.agent.post('/api/v1/work-orders').send({
      buildingId: tenantA.buildingId, title: 'OS financeira completa E2E',
      description: 'Ciclo operacional e financeiro completo para homologação.',
      supplierId: tenantA.supplierId, contractIds: [tenantA.contractId],
    }).expect(201);
    const budget = await tenantA.agent
      .put(`/api/v1/budgets/work-orders/${workOrder.body.id}?stage=FINAL_EXECUTED`)
      .send({ bdiPercentage: 0, items: [{ kind: 'SERVICE', code: 'E2E-001',
        description: 'Serviço executado na homologação', unit: 'UN', quantity: 1, unitCost: 100 }] })
      .expect(200);
    const submitted = await tenantA.agent.post(`/api/v1/budgets/${budget.body.id}/transitions`)
      .send({ status: 'SUBMITTED', version: budget.body.version }).expect(201);
    await tenantA.agent.post(`/api/v1/budgets/${budget.body.id}/transitions`)
      .send({ status: 'APPROVED', version: submitted.body.version }).expect(201);
    await tenantA.agent.post(`/api/v1/work-orders/${workOrder.body.id}/transitions`)
      .send({ toStatus: 'IN_PROGRESS' }).expect(201);
    await tenantA.agent.post(`/api/v1/work-orders/${workOrder.body.id}/transitions`)
      .send({ toStatus: 'COMPLETED', solution: 'Serviço concluído e conferido automaticamente.' }).expect(201);
    await tenantA.agent.post(`/api/v1/work-orders/${workOrder.body.id}/close`)
      .send({ finalCost: 100, measurementEligible: true, acceptanceNote: 'Aceite automatizado.' }).expect(201);

    const measurement = await tenantA.agent.post('/api/v1/finance/measurements').send({
      contractId: tenantA.contractId, commitmentId: tenantA.commitmentId,
      number: `MED-${randomUUID().slice(0, 8)}`, referenceMonth: '2026-08',
      items: [{ workOrderId: workOrder.body.id, amount: 100 }],
    }).expect(201);
    let version = measurement.body.version;
    for (const status of ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'LIQUIDATED', 'PAID']) {
      const transitioned = await tenantA.agent
        .post(`/api/v1/finance/measurements/${measurement.body.id}/transitions`)
        .send({ status, version }).expect(201);
      version = transitioned.body.version;
    }
    const reconciliation = await tenantA.agent
      .get(`/api/v1/finance/reconciliation/contracts/${tenantA.contractId}`).expect(200);
    expect(Number(reconciliation.body.totals.measured)).toBeGreaterThanOrEqual(100);
    expect(Number(reconciliation.body.totals.paid)).toBeGreaterThanOrEqual(100);
  });

  it('gera manutenção recorrente de forma idempotente', async () => {
    await tenantA.agent.patch(`/api/v1/maintenance/plans/${tenantA.maintenancePlanId}`)
      .send({ nextDueAt: new Date(Date.now() + 86_400_000).toISOString(), generationHorizonDays: 30 }).expect(200);
    const first = await tenantA.agent.post('/api/v1/maintenance/generate?horizonDays=30').expect(201);
    const second = await tenantA.agent.post('/api/v1/maintenance/generate?horizonDays=30').expect(201);
    expect(first.body.generated).toBeGreaterThanOrEqual(1);
    expect(second.body.generated).toBe(0);
    expect(second.body.failed).toBe(0);
  });

  it('emite relatórios PDF e CSV coerentes com os módulos operacionais', async () => {
    const pdf = await tenantA.agent.get('/api/v1/reports/work-orders/backlog.pdf').expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(pdf.body).subarray(0, 4).toString()).toBe('%PDF');
    const csv = await tenantA.agent.get('/api/v1/reports/work-orders/backlog.csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text || Buffer.from(csv.body).toString('utf8')).toContain('Número');
    const mirror = await tenantA.agent
      .get(`/api/v1/reports/contracts/${tenantA.contractId}/mirror.pdf`).expect(200);
    expect(Buffer.from(mirror.body).subarray(0, 4).toString()).toBe('%PDF');
    const financial = await tenantA.agent
      .get(`/api/v1/reports/contracts/${tenantA.contractId}/financial.csv`).expect(200);
    expect(financial.text || Buffer.from(financial.body).toString('utf8')).toContain('Empenho');
  });

  it('isola biblioteca, configuração contratual, dashboard e dados de KPIs', async () => {
    const definitions = await tenantA.agent.get('/api/v1/kpis/definitions').expect(200);
    expect(definitions.body.some((item: { id: string }) => item.id === tenantB.kpiDefinitionId)).toBe(false);

    await tenantA.agent
      .get(`/api/v1/kpis/contracts/${tenantB.contractId}/dashboard?referenceMonth=2026-08`)
      .expect(404);

    await tenantA.agent
      .post(`/api/v1/kpis/contracts/${tenantA.contractId}/configurations`)
      .send({
        definitionId: tenantB.kpiDefinitionId,
        weight: 10,
        financialRole: 'PERFORMANCE',
        bands: [{ label: 'Bom', rating: 'GOOD', minValue: 0, score: 100 }],
      })
      .expect(400);

    await tenantA.agent
      .post('/api/v1/kpis/data-points')
      .send({
        definitionId: tenantB.kpiDefinitionId,
        occurredAt: '2026-08-02T12:00:00.000Z',
        value: 99,
      })
      .expect(400);
  });

  it('isola decisões e evidências do piloto por organização', async () => {
    await tenantB.agent
      .post('/api/v1/pilot/scenarios/ACCESS_SECURITY/decision')
      .send({
        outcome: 'PASSED',
        note: 'Perfis e acessos conferidos pela organização B.',
        evidenceReference: 'E2E-TENANT-B',
      })
      .expect(201);

    const overviewA = await tenantA.agent.get('/api/v1/pilot/overview').expect(200);
    const overviewB = await tenantB.agent.get('/api/v1/pilot/overview').expect(200);
    const accessA = overviewA.body.scenarios.find(
      (scenario: { code: string }) => scenario.code === 'ACCESS_SECURITY',
    );
    const accessB = overviewB.body.scenarios.find(
      (scenario: { code: string }) => scenario.code === 'ACCESS_SECURITY',
    );

    expect(accessA.decision).toBeNull();
    expect(accessB.decision.outcome).toBe('PASSED');
    expect(accessB.decision.evidenceReference).toBe('E2E-TENANT-B');
  });

  it('bloqueia o aceite final enquanto houver cenários pendentes', async () => {
    const response = await tenantA.agent
      .post('/api/v1/pilot/acceptance')
      .send({
        outcome: 'APPROVED',
        note: 'Tentativa de aceite antes da conclusão de todos os cenários.',
      })
      .expect(400);

    expect(response.body.message).toContain('cenários');
  });
});

async function createTenantFixture(
  app: INestApplication,
  label: string,
): Promise<TenantFixture> {
  const unique = randomUUID();
  const tenantSlug = `e2e-${label}-${unique}`;
  const agent = request.agent(app.getHttpServer());

  await agent
    .post('/api/v1/auth/register-tenant')
    .send({
      tenantName: `Organização E2E ${label.toUpperCase()}`,
      tenantSlug,
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

  const members = await agent.get('/api/v1/members').expect(200);
  const categories = await agent
    .get('/api/v1/operations/catalogs?kind=CATEGORY')
    .expect(200);

  const commitment = await agent
    .post('/api/v1/finance/commitments')
    .send({
      contractId: contract.body.id,
      number: `EMP-${label}-${unique.slice(0, 8)}`,
      fiscalYear: 2026,
      issueDate: '2026-08-02T12:00:00.000Z',
      originalValue: 1000,
    })
    .expect(201);

  const asset = await agent
    .post('/api/v1/maintenance/assets')
    .send({
      buildingId: building.body.id,
      tag: `AT-${label}-${unique.slice(0, 8)}`,
      name: `Ativo ${label.toUpperCase()}`,
      category: 'Climatização',
    })
    .expect(201);

  const maintenancePlan = await agent
    .post('/api/v1/maintenance/plans')
    .send({
      buildingId: building.body.id,
      assetId: asset.body.id,
      name: `Plano ${label.toUpperCase()}`,
      titleTemplate: 'Preventiva {ativo} {data}',
      type: 'PREVENTIVE',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      nextDueAt: '2026-12-01T12:00:00.000Z',
    })
    .expect(201);

  const catalog = await agent
    .post('/api/v1/budgets/sinapi/catalogs')
    .send({
      referenceMonth: '2026-07',
      state: 'DF',
      version: `e2e-${label}-${unique.slice(0, 8)}`,
      items: [{ type: 'SERVICE', code: `S-${label}`, description: 'Serviço sintético', unit: 'UN', unitCost: 10 }],
    })
    .expect(201);
  const catalogItems = await agent
    .get(`/api/v1/budgets/sinapi/catalogs/${catalog.body.id}/items`)
    .expect(200);
  const budget = await agent
    .put(`/api/v1/budgets/work-orders/${workOrder.body.id}`)
    .send({ catalogId: catalog.body.id, referenceMonth: '2026-07', state: 'DF', bdiPercentage: 10,
      items: [{ catalogItemId: catalogItems.body[0].id, quantity: 2 }] })
    .expect(200);

  const kpiDefinitions = await agent.get('/api/v1/kpis/definitions').expect(200);

  return {
    agent,
    tenantSlug,
    buildingId: building.body.id,
    supplierId: supplier.body.id,
    contractId: contract.body.id,
    workOrderId: workOrder.body.id,
    attachmentId: attachment.body.id,
    membershipId: members.body[0].id,
    categoryId: categories.body[0].id,
    commitmentId: commitment.body.id,
    assetId: asset.body.id,
    maintenancePlanId: maintenancePlan.body.id,
    sinapiCatalogId: catalog.body.id,
    budgetId: budget.body.id,
    kpiDefinitionId: kpiDefinitions.body[0].id,
  };
}
