import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      service: 'gestao-de-predios-api',
      readiness: 'ready',
      release: process.env.RELEASE_SHA?.slice(0, 40) ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('live')
  live() {
    return {
      status: 'ok',
      service: 'gestao-de-predios-api',
      liveness: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  async ready() {
    const startedAt = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      service: 'gestao-de-predios-api',
      readiness: 'ready',
      database: 'reachable',
      latencyMs: Date.now() - startedAt,
      release: process.env.RELEASE_SHA?.slice(0, 40) ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }
}
