import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { InfraService } from './infra.service';
import { InfraDatabase } from './infra-db';
import { PrismaService } from '../../prisma/prisma.service';
import { InfraAccess } from './infra.guard';

const example = JSON.parse(readFileSync(resolve(__dirname,'../../../../../legacy/infraestrutura-1.8.3/example-road.json'),'utf8'));
test('primeira abertura usa o documento original e reabre o mesmo orçamento privado',async () => {
  const actor = { userId: 'owner',tenantId: 'tenant' } as AuthenticatedUser;
  const cycle = { id: '332007f8-cfde-4713-b00d-f0dc70866045',uf: 'SP',status: 'PUBLISHED',import_status: 'PASSED',example_json: JSON.stringify(example),validation: null };
  let stored: Record<string,unknown> | undefined;
  const query = jest.fn(async (sql: string,values: unknown[] = []) => {
    if (sql.startsWith('SELECT id FROM InfraUser')) return [{ id: 'profile' }];
    if (sql.startsWith('SELECT * FROM InfraProject WHERE user_id')) {
      expect(values).toEqual([actor.userId,actor.tenantId]);
      return stored ? [stored] : [];
    }
    if (sql.startsWith('SELECT id,uf,example_json') || sql.startsWith('SELECT * FROM InfraCycle')) return [cycle];
    if (sql.startsWith('INSERT INTO InfraProject(')) {
      stored = { id: values[0],user_id: values[1],tenant_id: values[2],cycle_id: values[3],name: values[4],uf: values[5],regime: values[6],bdi: values[7],data: values[8],version: 1,created_at: '2026-10-03T00:00:00.000Z',updated_at: '2026-10-03T00:00:00.000Z',deleted_at: null };
      return { affectedRows: 1 };
    }
    if (sql.startsWith('SELECT * FROM InfraProject WHERE id')) {
      expect(values.slice(1)).toEqual([actor.tenantId,actor.userId]);
      return [stored];
    }
    if (sql.startsWith('INSERT INTO InfraProjectVersion') || sql.startsWith('DELETE FROM InfraProjectVersion') || sql.startsWith('INSERT INTO InfraAudit')) return { affectedRows: 1 };
    throw new Error('Unexpected SQL in workspace test');
  });
  const db = { transaction: async (fn: (sql: { query: typeof query }) => unknown) => fn({ query }) } as unknown as InfraDatabase;
  const service = new InfraService(db,new ConfigService(),{} as PrismaService,{} as InfraAccess);
  const first = await service.openWorkspace(actor), second = await service.openWorkspace(actor);
  expect(first.id).toBe(second.id);
  expect(first.data.root).toEqual(example.root);
  expect(first.data.bdi).toBe(example.bdi);
  expect(query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO InfraProject('))).toHaveLength(1);
});

