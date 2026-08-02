import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import {
  CreateCommitmentDto,
  CreateCommitmentMovementDto,
  CreateMeasurementDto,
  TransitionMeasurementDto,
} from './dto/finance.dto';
import { FinanceService } from './finance.service';

const READ = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR, MembershipRole.AUDITOR];
const WRITE = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR];

@ApiTags('Medições e empenhos')
@Controller('finance')
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  @Roles(...READ) @Get('commitments')
  commitments(@CurrentUser() user: AuthenticatedUser) { return this.service.listCommitments(user.tenantId); }

  @Roles(...WRITE) @Post('commitments')
  createCommitment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCommitmentDto) {
    return this.service.createCommitment(user.tenantId, user.userId, dto);
  }

  @Roles(...WRITE) @Post('commitments/:id/movements')
  movement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
    @Body() dto: CreateCommitmentMovementDto) {
    return this.service.addCommitmentMovement(user.tenantId, user.userId, id, dto);
  }

  @Roles(...READ) @Get('measurements')
  measurements(@CurrentUser() user: AuthenticatedUser) { return this.service.listMeasurements(user.tenantId); }

  @Roles(...READ) @Get('measurements/:id')
  measurement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getMeasurement(user.tenantId, id);
  }

  @Roles(...WRITE) @Post('measurements')
  createMeasurement(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMeasurementDto) {
    return this.service.createMeasurement(user.tenantId, user.userId, dto);
  }

  @Roles(...WRITE) @Post('measurements/:id/transitions')
  transition(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
    @Body() dto: TransitionMeasurementDto) {
    return this.service.transitionMeasurement(user.tenantId, user.userId, id, dto);
  }
}

