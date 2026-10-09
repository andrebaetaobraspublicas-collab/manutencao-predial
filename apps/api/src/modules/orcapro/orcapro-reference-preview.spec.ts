import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrcaproService } from './orcapro.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrcaproAccess } from './orcapro.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { loadLegacyRuntime } from './legacy/legacy-runtime';

const user = { userId: 'owner', tenantId: 'tenant' } as AuthenticatedUser;
const raw = (ref: string, price: number) => ({ v: 1, fonte: 'SINAPI', ref, emissao: '', ufs: ['SP'], cidades: [''], encargos: {},
  grupos: ['Example'], ct: [''], cls: ['MATERIAL'], un: ['UN'],
  ins: { c: [1], k: [0], d: ['Material'], u: [0], o: [0], p: [[price]], lab: {} },
  comp: { c: [10], g: [0], d: ['Example'], u: [0], s: [0], it: [[[1, 2]]] } });
function setup() {
  const { OP } = loadLegacyRuntime(), data = OP.engine.newProject('Example');
  data.id = 'project'; data.uf = 'SP'; data.rg = 'SD'; data.sinapiReferenceId = 'august';
  data.root.children.push(OP.engine.item(10, 3));
  data.risks = { preserved: true };
  const project = { id: 'project', name: 'Example', referenceId: 'august', uf: 'SP', regime: 'SD', version: 7, data };
  const findFirst = jest.fn().mockResolvedValue(project);
  const service = new OrcaproService({ orcaproProject: { findFirst } } as unknown as PrismaService, {} as OrcaproAccess);
  jest.spyOn(service, 'reference').mockResolvedValue({ status: 'PUBLISHED' } as never);
  jest.spyOn(service, 'graph').mockImplementation(async id => ({ raw: raw(id === 'august' ? '08/2026' : '09/2026', id === 'august' ? 100 : 200) } as never));
  return { service, project, findFirst };
}
describe('explicit reference comparison', () => {
  it('recalculates the requested reference without mutating the historical document or risks', async () => {
    const { service, project, findFirst } = setup(), original = JSON.stringify(project);
    const preview = await service.previewReference(user, 'project', 'september');
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'project', tenantId: 'tenant', ownerUserId: 'owner', archivedAt: null } });
    expect(JSON.stringify(project)).toBe(original);
    expect(preview.expectedVersion).toBe(7); expect(preview.current.direct).toBe(600); expect(preview.next.direct).toBe(1200);
    expect(preview.next.price).toBe(1500); expect(preview.data.sinapiReferenceId).toBe('september');
    expect(preview.data.risks).toEqual(project.data.risks);
    expect(preview.data.root).toEqual(project.data.root);
    expect(preview.next.iva.complete).toBe(true);
  });
  it('rejects a project outside the owner scope before reading reference data', async () => {
    const { service, findFirst } = setup(); findFirst.mockResolvedValue(null);
    await expect(service.previewReference(user, 'other-project', 'september')).rejects.toThrow(NotFoundException);
    expect(service.graph).not.toHaveBeenCalled();
  });
  it('blocks drafts and missing composition graphs instead of choosing replacements', async () => {
    const { service } = setup(); (service.reference as jest.Mock).mockResolvedValue({ status: 'DRAFT' });
    await expect(service.previewReference(user, 'project', 'september')).rejects.toThrow('publicada');
    expect(service.graph).not.toHaveBeenCalled();
    (service.reference as jest.Mock).mockResolvedValue({ status: 'PUBLISHED' });
    (service.graph as jest.Mock).mockRejectedValue(new BadRequestException('Composição ausente na referência: 93957.'));
    await expect(service.previewReference(user, 'project', 'september')).rejects.toThrow('93957');
  });
  it('keeps absent prices explicit and reports partial tax credit', async () => {
    const { service } = setup();
    (service.graph as jest.Mock).mockImplementation(async (id: string) => ({ raw: raw('09/2026', id === 'august' ? 100 : null as unknown as number) }));
    const preview = await service.previewReference(user, 'project', 'september');
    expect(preview.next.items[0].unitCost).toBeNull();
    expect(preview.next.iva.complete).toBe(false); expect(preview.next.iva.missing).toBeGreaterThan(0);
  });
});
