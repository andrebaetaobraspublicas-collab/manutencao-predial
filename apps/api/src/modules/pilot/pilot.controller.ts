import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { RecordPilotAcceptanceDto, RecordPilotDecisionDto } from './dto/pilot.dto';
import { PilotService } from './pilot.service';

const READ = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR, MembershipRole.AUDITOR];
const WRITE = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];

@ApiTags('Piloto e homologação')
@Controller('pilot')
export class PilotController {
  constructor(private readonly service: PilotService) {}

  @Roles(...READ)
  @Get('overview')
  @ApiOperation({ summary: 'Consolida a prontidão e as decisões do piloto no tenant autenticado' })
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.service.overview(user.tenantId);
  }

  @Roles(...READ)
  @ApiProduces('text/csv')
  @Get('exports/homologation.csv')
  async csv(@CurrentUser() user: AuthenticatedUser, @Res() response: Response) {
    this.send(response, await this.service.csv(user.tenantId, user.userId), 'text/csv; charset=utf-8', 'homologacao-piloto.csv');
  }

  @Roles(...READ)
  @ApiProduces('application/pdf')
  @Get('exports/homologation.pdf')
  async pdf(@CurrentUser() user: AuthenticatedUser, @Res() response: Response) {
    this.send(response, await this.service.pdf(user.tenantId, user.userId), 'application/pdf', 'homologacao-piloto.pdf');
  }

  @Roles(...WRITE)
  @Post('scenarios/:code/decision')
  @ApiOperation({ summary: 'Registra decisão append-only para um cenário de homologação' })
  decision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() dto: RecordPilotDecisionDto,
  ) {
    return this.service.recordDecision(user.tenantId, user, code.toUpperCase(), dto);
  }

  @Roles(...WRITE)
  @Post('acceptance')
  @ApiOperation({ summary: 'Registra o aceite ou rejeição final do piloto' })
  acceptance(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordPilotAcceptanceDto) {
    return this.service.recordAcceptance(user.tenantId, user, dto);
  }

  private send(response: Response, body: Buffer, contentType: string, filename: string) {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(body);
  }
}
