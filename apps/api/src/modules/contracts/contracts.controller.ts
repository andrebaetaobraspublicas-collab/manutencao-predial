import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CreateContractAdjustmentDto, CreateContractAmendmentDto, CreateContractPenaltyDto,
  CreateContractSubcontractDto } from './dto/contract-events.dto';

@ApiTags('Contratos')
@Controller('contracts')
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MANAGER,
    MembershipRole.CONTRACT_MANAGER,
    MembershipRole.CONTRACT_INSPECTOR,
    MembershipRole.OPERATOR,
    MembershipRole.AUDITOR,
  )
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.tenantId);
  }

  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MANAGER,
    MembershipRole.CONTRACT_MANAGER,
    MembershipRole.CONTRACT_INSPECTOR,
    MembershipRole.OPERATOR,
    MembershipRole.AUDITOR,
  )
  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.get(user.tenantId, id);
  }

  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MANAGER,
    MembershipRole.CONTRACT_MANAGER,
  )
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContractDto) {
    return this.service.create(user.tenantId, user.userId, dto);
  }

  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MANAGER,
    MembershipRole.CONTRACT_MANAGER,
  )
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
  ) {
    return this.service.update(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER)
  @Post(':id/amendments')
  amendment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateContractAmendmentDto) {
    return this.service.addAmendment(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER)
  @Post(':id/adjustments')
  adjustment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateContractAdjustmentDto) {
    return this.service.addAdjustment(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER)
  @Post(':id/subcontracts')
  subcontract(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateContractSubcontractDto) {
    return this.service.addSubcontract(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER)
  @Post(':id/penalties')
  penalty(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateContractPenaltyDto) {
    return this.service.addPenalty(user.tenantId, user.userId, id, dto);
  }
}
