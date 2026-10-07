import { ConfigService } from '@nestjs/config';
import { InfraService } from './infra.service';
import { InfraDatabase } from './infra-db';
import { PrismaService } from '../../prisma/prisma.service';
import { InfraAccess } from './infra.guard';

function fixture(ids: string[] = ['matching-user']) {
  const primary = {
    $queryRaw: jest.fn(async (_query: unknown) => ids.map(id => ({ id }))),
    tenantMembership: { findMany: jest.fn(async (_query: unknown) => []),count: jest.fn(async (_query: unknown) => 0) },
  };
  return { primary,service: new InfraService({} as InfraDatabase,new ConfigService(),primary as unknown as PrismaService,{} as InfraAccess) };
}

test('busca parametrizada normaliza collation e mantém filtros de identidade e organização',async () => {
  const { primary,service } = fixture();
  const search = "JÉANE%_' OR 1=1 --";
  await service.accounts({ search,page: '2' });
  const sql = primary.$queryRaw.mock.calls[0][0] as unknown as { sql: string; values: unknown[] };
  expect(sql.sql).toContain('COLLATE utf8mb4_unicode_ci');
  expect(sql.sql).toContain('LOCATE(');
  expect(sql.sql).not.toContain(search);
  expect(sql.values).toEqual([search,search]);
  const query = primary.tenantMembership.findMany.mock.calls[0][0] as any;
  expect(query.where).toEqual({ status: 'ACTIVE',userId: { in: ['matching-user'] },user: { deletedAt: null,status: 'ACTIVE' },tenant: { deletedAt: null,status: { in: ['TRIAL','ACTIVE','PAST_DUE'] } } });
  expect(query.skip).toBe(30);
  expect(query.take).toBe(30);
  expect(primary.tenantMembership.count.mock.calls[0][0]).toEqual({ where: query.where });
});

test('busca sem resultado não retorna todas as contas',async () => {
  const { primary,service } = fixture([]);
  await service.accounts({ search: 'inexistente' });
  expect((primary.tenantMembership.findMany.mock.calls[0][0] as any).where.userId).toEqual({ in: [] });
});

test('listagem sem busca preserva filtros e não faz comparação textual',async () => {
  const { primary,service } = fixture();
  await service.accounts({});
  expect(primary.$queryRaw).not.toHaveBeenCalled();
  expect((primary.tenantMembership.findMany.mock.calls[0][0] as any).where.userId).toBeUndefined();
});
