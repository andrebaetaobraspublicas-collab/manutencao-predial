import { Controller, Get, Res } from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { ReportsService } from './reports.service';

@ApiTags('Relatórios')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MANAGER,
    MembershipRole.CONTRACT_MANAGER,
    MembershipRole.CONTRACT_INSPECTOR,
    MembershipRole.AUDITOR,
  )
  @Get('work-orders/backlog.pdf')
  @ApiProduces('application/pdf')
  async backlogPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const pdf = await this.service.backlogPdf(user.tenantId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="backlog-os-${new Date().toISOString().slice(0, 10)}.pdf"`,
    );
    response.send(pdf);
  }
}
