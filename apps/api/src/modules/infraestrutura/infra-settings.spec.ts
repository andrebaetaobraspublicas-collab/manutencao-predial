import { ConfigService } from '@nestjs/config';
import { InfraService } from './infra.service';

describe('Infra settings JSON scalar decoding', () => {
  test.each(['light', 'dark', '123', 'true', 'null', '"quoted"', '', 123, true, null, { color: 'light' }, [1, 'light']])('preserves JSON value %j exactly', async value => {
    const query = jest.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain('CAST(data AS CHAR) AS data');
      expect(sql).toContain('WHERE tenant_id=? AND user_id=?');
      expect(params).toEqual(['tenant-a', 'user-a']);
      return [{ name: 'preference', data: JSON.stringify(value) }];
    });
    const service = new InfraService({ query } as any, new ConfigService(), {} as any, {} as any);
    expect(await service.settings({ tenantId: 'tenant-a', userId: 'user-a' } as any)).toEqual({ preference: value });
  });
});
