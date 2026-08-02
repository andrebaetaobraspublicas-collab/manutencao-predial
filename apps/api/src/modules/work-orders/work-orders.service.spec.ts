import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AttachmentKind,
  ContractStatus,
  MeasurementStatus,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationOutboxService } from '../notifications/notification-outbox.service';
import { OperationsService } from '../operations/operations.service';
import { WorkOrdersService } from './work-orders.service';

type ReadinessHarness = {
  evaluateOperationalRequirements(context: unknown, solution?: string): string[];
  evaluateCloseReadiness(context: unknown): { ready: boolean; blockers: string[] };
  validateReferences(
    tenantId: string,
    dto: {
      buildingId: string;
      supplierId?: string;
      assignedToUserId?: string;
      contractIds?: string[];
    },
    requesterUserId: string,
  ): Promise<void>;
};

const baseContext = () => ({
  id: 'work-order-1',
  number: 'OS-2026-000001',
  title: 'Reparo',
  status: WorkOrderStatus.COMPLETED,
  requesterUserId: 'user-1',
  assignedToUserId: null,
  categoryId: 'category-1',
  hasOpenPendency: false,
  solution: 'Registro substituído e testado.',
  finalCost: 100,
  approvedCost: 150,
  acceptedByUserId: 'manager-1',
  acceptanceNote: 'Aceito.',
  measurementEligible: false,
  operationalCriteriaSnapshot: {
    requirePhotoBefore: false,
    requirePhotoDuring: false,
    requirePhotoAfter: false,
    requireChecklist: false,
    requireFinalCost: false,
    requireAcceptance: true,
  },
  category: {
    requirePhotoBefore: true,
    requirePhotoDuring: true,
    requirePhotoAfter: true,
    requireChecklist: true,
    requireFinalCost: true,
    requireAcceptance: true,
  },
  attachments: [] as Array<{ kind: AttachmentKind }>,
  checklistItems: [] as Array<{
    id: string;
    label: string;
    required: boolean;
    templateItem: { categoryId: string } | null;
    responses: Array<{ checked: boolean }>;
  }>,
  contracts: [],
  measurementItems: [],
});

describe('WorkOrdersService — critérios operacionais', () => {
  const service = new WorkOrdersService(
    {} as PrismaService,
    new ConfigService(),
    {} as OperationsService,
    {} as NotificationOutboxService,
  );
  const readiness = service as unknown as ReadinessHarness;

  it('usa o snapshot da categoria e não altera retroativamente uma OS', () => {
    const result = readiness.evaluateCloseReadiness(baseContext());
    expect(result).toEqual({
      ready: true,
      blockers: [],
      checks: expect.any(Object),
    });
  });

  it('bloqueia conclusão sem checklist obrigatório e evidências configuradas', () => {
    const context = baseContext();
    context.operationalCriteriaSnapshot = {
      ...context.operationalCriteriaSnapshot,
      requireChecklist: true,
      requirePhotoAfter: true,
    };
    context.checklistItems = [
      {
        id: 'item-1',
        label: 'Testar estanqueidade',
        required: true,
        templateItem: { categoryId: 'category-1' },
        responses: [{ checked: false }],
      },
    ];

    const blockers = readiness.evaluateOperationalRequirements(context);
    expect(blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Testar estanqueidade'),
        expect.stringContaining('depois do serviço'),
      ]),
    );
  });

  it('exige contrato principal e custo final quando marcado para medição', () => {
    const context = { ...baseContext(), measurementEligible: true, finalCost: null };
    const result = readiness.evaluateCloseReadiness(context);
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('contrato principal'),
        expect.stringContaining('custo final'),
      ]),
    );
  });

  it('aceita evidência e última resposta positiva do checklist', () => {
    const context = baseContext();
    context.operationalCriteriaSnapshot = {
      ...context.operationalCriteriaSnapshot,
      requireChecklist: true,
      requirePhotoAfter: true,
    };
    context.attachments = [{ kind: AttachmentKind.PHOTO_AFTER }];
    context.checklistItems = [
      {
        id: 'item-1',
        label: 'Testar estanqueidade',
        required: true,
        templateItem: { categoryId: 'category-1' },
        responses: [{ checked: true }, { checked: false }],
      },
    ];

    expect(readiness.evaluateOperationalRequirements(context)).toEqual([]);
  });

  it('interpreta flags numéricas do snapshot legado sem perder requisitos', () => {
    const context = {
      ...baseContext(),
      acceptedByUserId: null,
      operationalCriteriaSnapshot: {
        requirePhotoBefore: 0,
        requirePhotoDuring: 0,
        requirePhotoAfter: 0,
        requireChecklist: 0,
        requireFinalCost: 0,
        requireAcceptance: 1,
      },
    };

    expect(readiness.evaluateCloseReadiness(context).blockers).toEqual(
      expect.arrayContaining([expect.stringContaining('responsável pelo aceite')]),
    );
  });

  it('aceita elegibilidade somente com contrato vigente, custo aprovado e sem medição ativa', () => {
    const context = {
      ...baseContext(),
      measurementEligible: true,
      contracts: [
        {
          isPrimary: true,
          contract: {
            status: ContractStatus.ACTIVE,
            startDate: new Date(Date.now() - 86_400_000),
            endDate: new Date(Date.now() + 86_400_000),
            deletedAt: null,
          },
        },
      ],
    };

    expect(readiness.evaluateCloseReadiness(context)).toEqual(
      expect.objectContaining({ ready: true, blockers: [] }),
    );
  });

  it('bloqueia elegibilidade com contrato vencido, excesso de custo ou medição existente', () => {
    const context = {
      ...baseContext(),
      measurementEligible: true,
      approvedCost: 50,
      contracts: [
        {
          isPrimary: true,
          contract: {
            status: ContractStatus.EXPIRED,
            startDate: new Date(Date.now() - 172_800_000),
            endDate: new Date(Date.now() - 86_400_000),
            deletedAt: null,
          },
        },
      ],
      measurementItems: [{ measurement: { status: MeasurementStatus.APPROVED } }],
    };

    expect(readiness.evaluateCloseReadiness(context).blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('vigente'),
        expect.stringContaining('custo aprovado'),
        expect.stringContaining('já está vinculada'),
      ]),
    );
  });

  it('rejeita contrato que não abrange a edificação da OS', async () => {
    const prisma = {
      building: { findFirst: jest.fn().mockResolvedValue({ id: 'building-a' }) },
      contract: {
        findMany: jest.fn().mockResolvedValue([{ id: 'contract-a', buildings: [] }]),
      },
    } as unknown as PrismaService;
    const serviceWithReferences = new WorkOrdersService(
      prisma,
      new ConfigService(),
      {} as OperationsService,
      {} as NotificationOutboxService,
    ) as unknown as ReadinessHarness;

    await expect(
      serviceWithReferences.validateReferences(
        'tenant-a',
        { buildingId: 'building-a', contractIds: ['contract-a'] },
        'requester-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revalida o estado da OS sob lock antes de aceitar a avaliação', async () => {
    const upsert = jest.fn();
    const tx = {
      $queryRaw: jest.fn(),
      workOrder: {
        findFirst: jest.fn().mockResolvedValue({
          requesterUserId: 'requester-a',
          status: WorkOrderStatus.IN_PROGRESS,
        }),
      },
      satisfactionResponse: { upsert },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const satisfactionService = new WorkOrdersService(
      prisma,
      new ConfigService(),
      {} as OperationsService,
      {} as NotificationOutboxService,
    );

    await expect(
      satisfactionService.submitSatisfaction(
        'tenant-a',
        'requester-a',
        'work-order-a',
        { score: 5, npsScore: 10 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('preserva a avaliação anterior no histórico e limpa o ciclo ao reabrir', async () => {
    const now = new Date('2026-08-02T12:00:00.000Z');
    const closedAt = new Date('2026-08-01T12:00:00.000Z');
    const updatedAt = new Date('2026-08-02T11:00:00.000Z');
    const locked = {
      id: 'work-order-a',
      status: WorkOrderStatus.CLOSED,
      reopenCount: 0,
      updatedAt,
      closedAt,
      completedAt: closedAt,
      solution: 'Reparo concluído.',
      finalCost: 100,
      acceptanceNote: 'Aceito.',
      acceptedAt: closedAt,
      acceptedByUserId: 'manager-a',
      measurementEligible: false,
      slaPolicyId: 'old-policy',
      slaResponseDeadline: closedAt,
      slaResolutionDeadline: closedAt,
      slaResolutionWarningAt: closedAt,
      slaSnapshot: { cycle: 1 },
    };
    const previousSatisfaction = {
      id: 'satisfaction-a',
      respondedByUserId: 'requester-a',
      score: 4,
      npsScore: 8,
      comment: 'Bom atendimento.',
      respondedAt: closedAt,
    };
    const updated = {
      id: 'work-order-a',
      number: 'OS-2026-000001',
      requesterUserId: 'requester-a',
      assignedToUserId: null,
      reopenCount: 1,
    };
    const reopeningCreate = jest.fn().mockResolvedValue({
      id: 'reopening-a',
      reason: 'Problema recorrente.',
    });
    const satisfactionDelete = jest.fn().mockResolvedValue(previousSatisfaction);
    const workOrderFindFirst = jest
      .fn()
      .mockResolvedValueOnce(locked)
      .mockResolvedValueOnce({
        requesterUserId: 'requester-a',
        building: { managerUserId: null },
        contracts: [],
      });
    const tx = {
      $queryRaw: jest.fn(),
      workOrder: {
        findFirst: workOrderFindFirst,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
      },
      measurementItem: { findFirst: jest.fn().mockResolvedValue(null) },
      satisfactionResponse: {
        findUnique: jest.fn().mockResolvedValue(previousSatisfaction),
        delete: satisfactionDelete,
      },
      workOrderReopening: { create: reopeningCreate },
      workOrderStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      tenantMembership: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      workOrder: {
        findFirst: jest.fn().mockResolvedValue({
          ...locked,
          priority: WorkOrderPriority.NORMAL,
          categoryId: 'category-a',
        }),
      },
      workOrderContract: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const calculateSla = jest.fn().mockResolvedValue({
      policy: { id: 'new-policy', code: 'NORMAL', name: 'Normal' },
      calendar: { id: 'calendar-a', code: 'PADRAO', name: 'Padrão' },
      startAt: now,
      responseDeadline: new Date('2026-08-02T14:00:00.000Z'),
      resolutionDeadline: new Date('2026-08-03T12:00:00.000Z'),
      resolutionWarningAt: new Date('2026-08-03T10:00:00.000Z'),
    });
    const outbox = {
      enqueueMany: jest.fn().mockResolvedValue([]),
    } as unknown as NotificationOutboxService;
    const reopenService = new WorkOrdersService(
      prisma,
      new ConfigService(),
      { calculateSla } as unknown as OperationsService,
      outbox,
    );

    await reopenService.reopen(
      'tenant-a',
      'manager-a',
      'work-order-a',
      { reason: 'Problema recorrente.' },
    );

    expect(reopeningCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousSatisfactionSnapshot: {
          id: 'satisfaction-a',
          respondedByUserId: 'requester-a',
          score: 4,
          npsScore: 8,
          comment: 'Bom atendimento.',
          respondedAt: closedAt.toISOString(),
        },
      }),
    });
    expect(satisfactionDelete).toHaveBeenCalledWith({
      where: { workOrderId: 'work-order-a' },
    });
  });
});
