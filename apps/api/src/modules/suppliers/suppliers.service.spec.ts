import { BadRequestException } from '@nestjs/common';
import { OperationalCatalogKind } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SuppliersService } from './suppliers.service';

describe('SuppliersService — especialidades e isolamento', () => {
  it('valida áreas de atuação exclusivamente no catálogo SPECIALTY do tenant', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      supplier: { findFirst: jest.fn().mockResolvedValue(null) },
      operationalCatalogItem: { findMany },
    } as unknown as PrismaService;
    const service = new SuppliersService(prisma);

    await expect(service.create('tenant-a', 'user-a', {
      legalName: 'Fornecedor Teste Ltda.',
      taxId: '12.345.678/0001-90',
      serviceAreaCategoryIds: ['11111111-1111-4111-8111-111111111111'],
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        id: { in: ['11111111-1111-4111-8111-111111111111'] },
        kind: OperationalCatalogKind.SPECIALTY,
        active: true,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });
  });

  it('não localiza fornecedor arquivado ou pertencente a outro tenant', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new SuppliersService({ supplier: { findFirst } } as unknown as PrismaService);

    await expect(service.get('tenant-a', 'supplier-b')).rejects.toThrow('Fornecedor não encontrado.');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'supplier-b', tenantId: 'tenant-a', deletedAt: null },
    }));
  });
});
