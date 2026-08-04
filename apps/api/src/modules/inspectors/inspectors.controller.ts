import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { CreateInspectorProfileDto } from './dto/create-inspector-profile.dto';
import { UpdateInspectorProfileDto } from './dto/update-inspector-profile.dto';
import { InspectorsService } from './inspectors.service';

const READ_ROLES = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER,
  MembershipRole.CONTRACT_INSPECTOR,
  MembershipRole.OPERATOR,
  MembershipRole.AUDITOR,
];

const WRITE_ROLES = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER,
];

@ApiTags('Fiscais')
@Controller('inspectors')
export class InspectorsController {
  constructor(private readonly service: InspectorsService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.tenantId);
  }

  @Roles(...READ_ROLES)
  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.get(user.tenantId, id);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInspectorProfileDto) {
    return this.service.create(user.tenantId, user.userId, dto);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateInspectorProfileDto,
  ) {
    return this.service.update(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @Delete(':id')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archive(user.tenantId, user.userId, id);
  }
}
