import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  OperationalCatalogKind,
  WorkOrderPriority,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationsService } from './operations.service';

const invalidPolicy = {
  calendarId: '00000000-0000-4000-8000-000000000001',
  code: 'INVALIDA',
  name: 'Política inválida',
  priority: WorkOrderPriority.HIGH,
  responseMinutes: 120,
  resolutionMinutes: 60,
  warningMinutesBefore: 30,
};

describe('OperationsService — isolamento por organização', () => {
  it('rejeita prazos incoerentes antes de persistir uma política', async () => {
    const service = new OperationsService({} as PrismaService);

    await expect(
      service.createSlaPolicy('tenant-a', 'user-a', invalidPolicy),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('provisiona de forma idempotente categoria, calendário e cinco SLAs para tenant novo', async () => {
    const catalogUpsert = jest.fn().mockResolvedValue({ id: 'category', code: 'GERAL' });
    const calendarUpsert = jest.fn().mockResolvedValue({ id: 'calendar', code: 'PADRAO_24X7' });
    const policyUpsert = jest.fn().mockImplementation(({ create }) =>
      Promise.resolve({ id: create.code, code: create.code, priority: create.priority }),
    );
    const prisma = {
      operationalCatalogItem: { upsert: catalogUpsert },
      slaCalendar: { upsert: calendarUpsert },
      slaPolicy: { upsert: policyUpsert },
    } as unknown as PrismaService;
    const service = new OperationsService(prisma);

    const result = await service.provisionTenantDefaults('tenant-a', 'America/Recife');

    expect(result.policies).toHaveLength(5);
    expect(catalogUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_kind_code: {
            tenantId: 'tenant-a',
            kind: OperationalCatalogKind.CATEGORY,
            code: 'GERAL',
          },
        },
      }),
    );
    expect(calendarUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ tenantId: 'tenant-a', timezone: 'America/Recife' }),
      }),
    );
  });

  it('valida todos os identificadores do catálogo dentro do tenant autenticado', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'category-a', kind: OperationalCatalogKind.CATEGORY },
      { id: 'cause-a', kind: OperationalCatalogKind.CAUSE },
    ]);
    const prisma = {
      operationalCatalogItem: { findMany },
    } as unknown as PrismaService;
    const service = new OperationsService(prisma);

    await service.validateWorkOrderClassification('tenant-a', {
      categoryId: 'category-a',
      causeId: 'cause-a',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          active: true,
          deletedAt: null,
        }),
      }),
    );
  });

  it('rejeita item com tipo diferente mesmo que o UUID exista no tenant', async () => {
    const prisma = {
      operationalCatalogItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'category-a', kind: OperationalCatalogKind.SPECIALTY },
        ]),
      },
    } as unknown as PrismaService;
    const service = new OperationsService(prisma);

    await expect(
      service.validateWorkOrderClassification('tenant-a', { categoryId: 'category-a' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filtra a resolução de SLA pelo tenant e escolhe a regra mais específica', async () => {
    const policies = [
      makePolicy('tenant', null, null),
      makePolicy('specific', 'contract-a', 'category-a'),
    ];
    const findMany = jest.fn().mockResolvedValue(policies);
    const prisma = {
      contract: { findFirst: jest.fn().mockResolvedValue({ id: 'contract-a' }) },
      operationalCatalogItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'category-a' }),
      },
      slaPolicy: { findMany },
    } as unknown as PrismaService;
    const service = new OperationsService(prisma);

    const selected = await service.resolveSlaPolicy('tenant-a', WorkOrderPriority.HIGH, {
      contractId: 'contract-a',
      categoryId: 'category-a',
    });

    expect(selected.id).toBe('specific');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a', active: true }),
      }),
    );
  });

  it('impede remover o último fallback global ativo de uma prioridade', async () => {
    const updatedAt = new Date('2026-08-02T12:00:00.000Z');
    const current = {
      id: 'policy-a',
      tenantId: 'tenant-a',
      calendarId: 'calendar-a',
      contractId: null,
      categoryId: null,
      code: 'PADRAO_HIGH',
      name: 'Padrão alta',
      priority: WorkOrderPriority.HIGH,
      responseMinutes: 60,
      resolutionMinutes: 240,
      warningMinutesBefore: 30,
      active: true,
      createdAt: updatedAt,
      updatedAt,
    };
    const policyFindFirst = jest
      .fn()
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ updatedAt })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      slaPolicy: { findFirst: policyFindFirst },
    };
    const prisma = {
      slaPolicy: { findFirst: policyFindFirst },
      slaCalendar: { findFirst: jest.fn().mockResolvedValue({ id: 'calendar-a' }) },
      $transaction: jest.fn().mockImplementation((callback) => callback(transactionClient)),
    } as unknown as PrismaService;
    const service = new OperationsService(prisma);

    await expect(
      service.updateSlaPolicy('tenant-a', 'user-a', 'policy-a', { active: false }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

function makePolicy(id: string, contractId: string | null, categoryId: string | null) {
  return {
    id,
    contractId,
    categoryId,
    calendar: {
      id: 'calendar-a',
      tenantId: 'tenant-a',
      code: 'DEFAULT',
      name: 'Default',
      timezone: 'America/Sao_Paulo',
      timeMode: 'CALENDAR',
      businessDays: null,
      workdayStart: null,
      workdayEnd: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      holidays: [],
    },
    contract: contractId
      ? { id: contractId, code: 'C', object: 'Contrato', tenantId: 'tenant-a' }
      : null,
    category: categoryId
      ? {
          id: categoryId,
          code: 'CAT',
          name: 'Categoria',
          tenantId: 'tenant-a',
          kind: OperationalCatalogKind.CATEGORY,
        }
      : null,
  };
}
