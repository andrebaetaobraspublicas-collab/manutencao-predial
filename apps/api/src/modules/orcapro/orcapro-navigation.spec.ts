import { NotFoundException } from '@nestjs/common';
import { OrcaproService } from './orcapro.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrcaproAccess } from './orcapro.guard';

describe('SINAPI navigation index', () => {
  const create = () => {
    const rows = jest.fn().mockResolvedValue([{ composition: { code: '90084' }, description: 'Escavação', unit: 'M3', group: 'Escavação de Valas' }]);
    const count = jest.fn().mockResolvedValue(7000);
    const service = new OrcaproService({ orcaproCompositionVersion: { findMany: rows }, orcaproInputVersion: { count } } as unknown as PrismaService, {} as OrcaproAccess);
    return { service, rows, count };
  };
  it('uses the requested historical reference and returns no prices or analytics', async () => {
    const { service, rows, count } = create();
    jest.spyOn(service, 'reference').mockResolvedValue({ metadata: { grupos: ['Escavação de Valas'] } } as never);
    const index = await service.catalogNavigation('historical-reference');
    expect(rows.mock.calls[0][0].where).toEqual({ referenceId: 'historical-reference' });
    expect(count).toHaveBeenCalledWith({ where: { referenceId: 'historical-reference' } });
    expect(index.items[0]).toEqual({ code: '90084', description: 'Escavação', unit: 'M3', group: 'Escavação de Valas' });
    expect(index.inputCount).toBe(7000);
  });
  it('rejects unavailable references before reading their descriptions', async () => {
    const { service, rows } = create();
    jest.spyOn(service, 'reference').mockRejectedValue(new NotFoundException());
    await expect(service.catalogNavigation('draft')).rejects.toThrow(NotFoundException);
    expect(rows).not.toHaveBeenCalled();
  });
});
