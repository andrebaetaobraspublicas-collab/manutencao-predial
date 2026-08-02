import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { ListWorkOrdersQuery } from '../work-orders/dto/list-work-orders.query';
import { ExpiringContractsQuery } from './dto/expiring-contracts.query';
import { ReportsService } from './reports.service';

const REPORT_ROLES = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER,
  MembershipRole.CONTRACT_INSPECTOR,
  MembershipRole.AUDITOR,
];

@ApiTags('Relatórios')
@Roles(...REPORT_ROLES)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('work-orders/backlog.pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Exporta o backlog de OS filtrado em PDF' })
  async backlogPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWorkOrdersQuery,
    @Res() response: Response,
  ) {
    this.send(
      response,
      await this.service.backlogPdf(user.tenantId, query),
      'application/pdf',
      `backlog-os-${this.today()}.pdf`,
    );
  }

  @Get('work-orders/backlog.csv')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Exporta o mesmo backlog de OS filtrado em CSV' })
  async backlogCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWorkOrdersQuery,
    @Res() response: Response,
  ) {
    this.send(
      response,
      await this.service.backlogCsv(user.tenantId, query),
      'text/csv; charset=utf-8',
      `backlog-os-${this.today()}.csv`,
    );
  }

  @Get('work-orders/:id.pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Emite a ficha individual de uma ordem de serviço' })
  async workOrderPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    this.send(
      response,
      await this.service.workOrderPdf(user.tenantId, id),
      'application/pdf',
      `ordem-servico-${id}.pdf`,
    );
  }

  @Get('contracts/expiring.pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Lista contratos a vencer em PDF' })
  async expiringContractsPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpiringContractsQuery,
    @Res() response: Response,
  ) {
    this.send(
      response,
      await this.service.expiringContractsPdf(user.tenantId, query),
      'application/pdf',
      `contratos-a-vencer-${this.today()}.pdf`,
    );
  }

  @Get('contracts/expiring.csv')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Lista os mesmos contratos a vencer em CSV' })
  async expiringContractsCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpiringContractsQuery,
    @Res() response: Response,
  ) {
    this.send(
      response,
      await this.service.expiringContractsCsv(user.tenantId, query),
      'text/csv; charset=utf-8',
      `contratos-a-vencer-${this.today()}.csv`,
    );
  }

  @Get('contracts/:id/mirror.pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Emite o espelho cadastral e financeiro do contrato' })
  async contractMirrorPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    this.send(
      response,
      await this.service.contractMirrorPdf(user.tenantId, id),
      'application/pdf',
      `espelho-contrato-${id}.pdf`,
    );
  }

  @Get('contracts/:id/financial.csv')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Exporta a execução financeira do contrato em CSV' })
  async contractFinancialCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    this.send(
      response,
      await this.service.contractFinancialCsv(user.tenantId, id),
      'text/csv; charset=utf-8',
      `financeiro-contrato-${id}.csv`,
    );
  }

  private send(
    response: Response,
    body: Buffer,
    contentType: string,
    filename: string,
  ): void {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(body);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
