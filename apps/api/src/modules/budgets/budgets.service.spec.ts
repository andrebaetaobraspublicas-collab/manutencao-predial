import { BadRequestException } from '@nestjs/common';
import { SinapiItemType } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BudgetsService } from './budgets.service';

describe('BudgetsService catalog search', () => {
  const catalog = {
    id: 'catalog-1',
    tenantId: 'tenant-1',
    active: true,
    source: 'SINAPI',
    version: '2026.04-CSD',
    priceRegime: 'NON_EXEMPT',
    referenceMonth: '2026-04',
    state: 'MG',
  };
  const item = {
    id: 'item-1',
    tenantId: 'tenant-1',
    catalogId: 'catalog-1',
    type: SinapiItemType.COMPOSITION,
    code: '88489',
    description: 'Pintura látex acrílica',
    unit: 'M2',
    unitCost: '12.50',
  };

  function setup() {
    const prisma = {
      sinapiCatalog: {
        findFirst: jest.fn().mockResolvedValue(catalog),
        findMany: jest.fn().mockResolvedValue([{ id: 'catalog-1' }, { id: 'catalog-inputs' }]),
      },
      sinapiCatalogItem: {
        findMany: jest.fn()
          .mockResolvedValueOnce([item])
          .mockResolvedValueOnce([{ unit: 'M2' }]),
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaService;
    return { prisma, service: new BudgetsService(prisma) };
  }

  it('aplica tenant, filtros e paginação sem misturar catálogos', async () => {
    const { prisma, service } = setup();
    const result = await service.searchCatalogItems('tenant-1', 'catalog-1', {
      search: 'pintura',
      type: SinapiItemType.COMPOSITION,
      unit: 'm2',
      minCost: 10,
      maxCost: 20,
      page: 2,
      pageSize: 25,
    });

    expect(prisma.sinapiCatalogItem.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        catalogId: { in: ['catalog-1', 'catalog-inputs'] },
        unit: 'M2',
      }),
      skip: 25,
      take: 25,
    }));
    expect(prisma.sinapiCatalog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        version: { in: ['2026.04-ISD', '2026.04-ICD', '2026.04-CSD', '2026.04-CCD'] },
      }),
    }));
    expect(result.pagination).toEqual({ page: 2, pageSize: 25, total: 1, totalPages: 1 });
    expect(result.facets.units).toEqual(['M2']);
    expect(result.scope.includesInputsAndCompositions).toBe(true);
  });

  it('rejeita faixa de custo invertida', async () => {
    const { service } = setup();
    await expect(service.searchCatalogItems('tenant-1', 'catalog-1', {
      minCost: 30,
      maxCost: 10,
      page: 1,
      pageSize: 25,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('usa consulta textual parametrizada no MySQL sem perder paginação ou tenant', async () => {
    const prisma = {
      sinapiCatalog: {
        findFirst: jest.fn().mockResolvedValue(catalog),
        findMany: jest.fn().mockResolvedValue([{ id: 'catalog-1' }]),
      },
      sinapiCatalogItem: {
        findMany: jest.fn()
          .mockResolvedValueOnce([item])
          .mockResolvedValueOnce([{ unit: 'M2' }]),
      },
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: 'item-1' }])
        .mockResolvedValueOnce([{ total: 1n }]),
    } as unknown as PrismaService;
    const service = new BudgetsService(prisma);

    const result = await service.searchCatalogItems('tenant-1', 'catalog-1', {
      search: 'concretagem', page: 1, pageSize: 25,
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(result.items).toEqual([item]);
    expect(result.pagination.total).toBe(1);
  });
});
