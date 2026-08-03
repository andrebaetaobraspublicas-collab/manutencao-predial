import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import {
  CreateAssetDto, CreateMaintenancePlanDto, GenerateMaintenanceQuery, IntelligentMaintenanceDto,
  UpdateAssetDto, UpdateMaintenancePlanDto,
} from './dto/maintenance.dto';
import { MaintenanceService } from './maintenance.service';

const READ = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR, MembershipRole.OPERATOR, MembershipRole.AUDITOR];
const WRITE = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR];

@ApiTags('Manutenção preventiva')
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}
  @Roles(...READ) @Get('assets') assets(@CurrentUser() u: AuthenticatedUser) { return this.service.listAssets(u.tenantId); }
  @Roles(...WRITE) @Post('assets') createAsset(@CurrentUser() u: AuthenticatedUser, @Body() d: CreateAssetDto) { return this.service.createAsset(u.tenantId, u.userId, d); }
  @Roles(...WRITE) @Patch('assets/:id') updateAsset(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() d: UpdateAssetDto) { return this.service.updateAsset(u.tenantId, u.userId, id, d); }
  @Roles(...WRITE) @Delete('assets/:id') archiveAsset(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.service.archiveAsset(u.tenantId, u.userId, id); }
  @Roles(...READ) @Get('plans') plans(@CurrentUser() u: AuthenticatedUser) { return this.service.listPlans(u.tenantId); }
  @Roles(...READ) @Get('intelligent/systems') intelligentSystems() { return this.service.intelligentSystems(); }
  @Roles(...WRITE) @Post('intelligent/preview') intelligentPreview(@CurrentUser() u: AuthenticatedUser,
    @Body() d: IntelligentMaintenanceDto) { return this.service.previewIntelligent(u.tenantId, d); }
  @Roles(...WRITE) @Post('intelligent/create') intelligentCreate(@CurrentUser() u: AuthenticatedUser,
    @Body() d: IntelligentMaintenanceDto) { return this.service.createIntelligent(u.tenantId, u.userId, u.role, d); }
  @Roles(...WRITE) @Post('plans') createPlan(@CurrentUser() u: AuthenticatedUser, @Body() d: CreateMaintenancePlanDto) { return this.service.createPlan(u.tenantId, u.userId, d); }
  @Roles(...WRITE) @Patch('plans/:id') updatePlan(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() d: UpdateMaintenancePlanDto) { return this.service.updatePlan(u.tenantId, u.userId, id, d); }
  @Roles(...WRITE) @Delete('plans/:id') archivePlan(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.service.archivePlan(u.tenantId, u.userId, id); }
  @Roles(...WRITE) @Post('generate') generate(@CurrentUser() u: AuthenticatedUser, @Query() q: GenerateMaintenanceQuery) { return this.service.generate(u.tenantId, u.userId, u.role, q.horizonDays); }
}

