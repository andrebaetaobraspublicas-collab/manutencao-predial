import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { CalculateKpisDto, KpiTrendQuery } from './dto/kpis.dto';
import { KpisService } from './kpis.service';

const READ = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR, MembershipRole.AUDITOR];
const WRITE = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];

@ApiTags('KPIs e SLAs gerenciais')
@Controller('kpis')
export class KpisController {
  constructor(private readonly service: KpisService) {}
  @Roles(...READ) @Get('definitions') definitions(@CurrentUser() u: AuthenticatedUser) { return this.service.definitions(u.tenantId); }
  @Roles(...WRITE) @Post('definitions/defaults') defaults(@CurrentUser() u: AuthenticatedUser) { return this.service.ensureDefaults(u.tenantId, u.userId); }
  @Roles(...WRITE) @Post('calculate') calculate(@CurrentUser() u: AuthenticatedUser, @Body() d: CalculateKpisDto) { return this.service.calculate(u.tenantId, u.userId, d); }
  @Roles(...READ) @Get('executive') executive(@CurrentUser() u: AuthenticatedUser) { return this.service.executive(u.tenantId); }
  @Roles(...READ) @Get(':code/trend') trend(@CurrentUser() u: AuthenticatedUser, @Param('code') code: string, @Query() q: KpiTrendQuery) { return this.service.trend(u.tenantId, code, q.periods); }
  @Roles(...READ) @ApiProduces('text/csv') @Get('exports/executive.csv')
  async csv(@CurrentUser() u: AuthenticatedUser, @Res() res: Response) { this.send(res, await this.service.executiveCsv(u.tenantId), 'text/csv; charset=utf-8', 'indicadores-gerenciais.csv'); }
  @Roles(...READ) @ApiProduces('application/pdf') @Get('exports/executive.pdf')
  async pdf(@CurrentUser() u: AuthenticatedUser, @Res() res: Response) { this.send(res, await this.service.executivePdf(u.tenantId), 'application/pdf', 'indicadores-gerenciais.pdf'); }
  private send(res: Response, body: Buffer, type: string, name: string) { res.setHeader('Content-Type', type); res.setHeader('Content-Disposition', `attachment; filename="${name}"`); res.setHeader('Cache-Control', 'private, no-store'); res.send(body); }
}

