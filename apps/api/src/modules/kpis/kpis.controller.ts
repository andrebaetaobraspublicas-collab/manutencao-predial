import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import {
  BindContractKpiDto, CalculateKpisDto, ContractDashboardQuery, ContractPerformanceDto,
  CreateKpiDataPointDto, CreateKpiDefinitionDto, KpiAlertsQuery, KpiDefinitionsQuery,
  KpiTrendQuery, UpdateContractKpiDto, UpdateKpiDefinitionDto,
} from './dto/kpis.dto';
import { KpisService } from './kpis.service';

const READ = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR, MembershipRole.AUDITOR];
const WRITE = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];
const FISCAL_WRITE = [...WRITE, MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR];

@ApiTags('KPIs, SLAs e desempenho contratual')
@Controller('kpis')
export class KpisController {
  constructor(private readonly service: KpisService) {}

  @Roles(...READ) @Get('definitions')
  definitions(@CurrentUser() u: AuthenticatedUser, @Query() q: KpiDefinitionsQuery) { return this.service.definitions(u.tenantId, q); }

  @Roles(...WRITE) @Post('definitions/defaults')
  defaults(@CurrentUser() u: AuthenticatedUser) { return this.service.ensureDefaults(u.tenantId, u.userId); }

  @Roles(...WRITE) @Post('definitions')
  createDefinition(@CurrentUser() u: AuthenticatedUser, @Body() d: CreateKpiDefinitionDto) { return this.service.createDefinition(u.tenantId, u.userId, d); }

  @Roles(...WRITE) @Patch('definitions/:id')
  updateDefinition(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() d: UpdateKpiDefinitionDto) {
    return this.service.updateDefinition(u.tenantId, u.userId, id, d);
  }

  @Roles(...READ) @Get('contracts/:contractId/configurations')
  configurations(@CurrentUser() u: AuthenticatedUser, @Param('contractId') contractId: string) {
    return this.service.contractConfigurations(u.tenantId, contractId);
  }

  @Roles(...WRITE) @Post('contracts/:contractId/configurations')
  bind(@CurrentUser() u: AuthenticatedUser, @Param('contractId') contractId: string, @Body() d: BindContractKpiDto) {
    return this.service.bindContract(u.tenantId, u.userId, contractId, d);
  }

  @Roles(...WRITE) @Patch('contract-configurations/:id')
  updateBinding(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() d: UpdateContractKpiDto) {
    return this.service.updateContractBinding(u.tenantId, u.userId, id, d);
  }

  @Roles(...FISCAL_WRITE) @Post('data-points')
  dataPoint(@CurrentUser() u: AuthenticatedUser, @Body() d: CreateKpiDataPointDto) {
    return this.service.createDataPoint(u.tenantId, u.userId, d);
  }

  @Roles(...WRITE) @Post('calculate')
  calculate(@CurrentUser() u: AuthenticatedUser, @Body() d: CalculateKpisDto) { return this.service.calculate(u.tenantId, u.userId, d); }

  @Roles(...FISCAL_WRITE) @Post('contracts/:contractId/calculate')
  calculateContract(@CurrentUser() u: AuthenticatedUser, @Param('contractId') contractId: string, @Body() d: ContractPerformanceDto) {
    return this.service.calculateContractPerformance(u.tenantId, u.userId, contractId, d);
  }

  @Roles(...READ) @Get('contracts/:contractId/dashboard')
  dashboard(@CurrentUser() u: AuthenticatedUser, @Param('contractId') contractId: string, @Query() q: ContractDashboardQuery) {
    return this.service.contractDashboard(u.tenantId, contractId, q.referenceMonth);
  }

  @Roles(...READ) @Get('analysis') analysis(@CurrentUser() u: AuthenticatedUser) { return this.service.analysis(u.tenantId); }
  @Roles(...READ) @Get('alerts') alerts(@CurrentUser() u: AuthenticatedUser, @Query() q: KpiAlertsQuery) { return this.service.alerts(u.tenantId, q); }
  @Roles(...READ) @Get('executive') executive(@CurrentUser() u: AuthenticatedUser) { return this.service.executive(u.tenantId); }

  @Roles(...READ) @ApiProduces('text/csv') @Get('exports/executive.csv')
  async csv(@CurrentUser() u: AuthenticatedUser, @Res() res: Response) {
    this.send(res, await this.service.executiveCsv(u.tenantId), 'text/csv; charset=utf-8', 'indicadores-gerenciais.csv');
  }

  @Roles(...READ) @ApiProduces('application/pdf') @Get('exports/executive.pdf')
  async pdf(@CurrentUser() u: AuthenticatedUser, @Res() res: Response) {
    this.send(res, await this.service.executivePdf(u.tenantId), 'application/pdf', 'indicadores-gerenciais.pdf');
  }

  @Roles(...READ) @Get(':code/trend')
  trend(@CurrentUser() u: AuthenticatedUser, @Param('code') code: string, @Query() q: KpiTrendQuery) {
    return this.service.trend(u.tenantId, code, q);
  }

  private send(res: Response, body: Buffer, type: string, name: string) {
    res.setHeader('Content-Type', type); res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'private, no-store'); res.send(body);
  }
}
