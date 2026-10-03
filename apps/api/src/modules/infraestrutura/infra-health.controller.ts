import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { InfraDatabase } from './infra-db';

@Controller('infraestrutura')
export class InfraHealthController {
  constructor(private readonly db: InfraDatabase) {}
  @Public() @Get('health')
  async health(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control','no-store');
    if (!this.db.enabled()) { response.status(503); return { status: 'disabled',service: 'orcapro-infraestrutura',ready: false }; }
    try {
      const rows = await this.db.query<any[]>('SELECT COUNT(*) AS count FROM InfraMigration');
      const ready = BigInt(rows[0].count) >= 1n;
      if (!ready) response.status(503);
      return { status: ready ? 'ok' : 'starting',service: 'orcapro-infraestrutura',ready,database: 'reachable',timestamp: new Date().toISOString() };
    } catch { response.status(503); return { status: 'unavailable',service: 'orcapro-infraestrutura',ready: false,database: 'unreachable' }; }
  }
}
