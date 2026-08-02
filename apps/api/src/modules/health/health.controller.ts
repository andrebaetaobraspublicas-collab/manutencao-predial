import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

export function resolveReleaseSha(
  releaseFile = join(__dirname, '..', '..', 'release-sha.txt'),
) {
  const environmentRelease = process.env.RELEASE_SHA?.trim();
  if (environmentRelease) return environmentRelease.slice(0, 40);

  try {
    const fileRelease = readFileSync(releaseFile, 'utf8').trim();
    if (fileRelease) return fileRelease.slice(0, 40);
  } catch {
    // O arquivo é materializado somente na promoção do runtime da Hostinger.
  }

  return 'unknown';
}

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
      release: resolveReleaseSha(),
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
      release: resolveReleaseSha(),
      timestamp: new Date().toISOString(),
    };
  }
}
