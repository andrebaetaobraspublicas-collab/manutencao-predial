import 'reflect-metadata';
import { ContractStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListWorkOrdersQuery } from '../work-orders/dto/list-work-orders.query';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { ExpiringContractsQuery } from './dto/expiring-contracts.query';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  it('usa o mesmo recorte tenant-aware no CSV do backlog', async () => {
    const prisma = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tenant-a',
          name: 'Organização A',
          timezone: 'America/Sao_Paulo',
        }),
      },
    } as unknown as PrismaService;
    const listForReport = jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      truncated: false,
    });
    const service = new ReportsService(
      prisma,
      { listForReport } as unknown as WorkOrdersService,
    );
    const query = Object.assign(new ListWorkOrdersQuery(), {
      buildingId: '11111111-1111-4111-8111-111111111111',
    });

    const csv = await service.backlogCsv('tenant-a', query);

    expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant-a', deletedAt: null } }),
    );
    expect(listForReport).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({
        backlogOnly: true,
        buildingId: query.buildingId,
      }),
    );
    expect(csv.toString('utf8')).toContain('Organização A');
  });

  it('filtra contratos a vencer pelo tenant e pelo fornecedor', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tenant-a',
          name: 'Organização A',
          timezone: 'America/Sao_Paulo',
        }),
      },
      contract: { findMany },
    } as unknown as PrismaService;
    const service = new ReportsService(prisma, {} as WorkOrdersService);
    const query = Object.assign(new ExpiringContractsQuery(), {
      days: 30,
      supplierId: '22222222-2222-4222-8222-222222222222',
    });

    await service.expiringContractsCsv('tenant-a', query);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          deletedAt: null,
          supplierId: query.supplierId,
          status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
        }),
      }),
    );
  });
});
