import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { BudgetsService } from './budgets.service';
import { ImportSinapiCatalogDto, SaveBudgetDto, TransitionBudgetDto } from './dto/budgets.dto';

const READ = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR, MembershipRole.OPERATOR, MembershipRole.AUDITOR];
const WRITE = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER,
  MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR];

@ApiTags('Orçamentos e SINAPI')
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly service: BudgetsService) {}

  @Roles(...READ) @Get('sinapi/catalogs')
  catalogs(@CurrentUser() user: AuthenticatedUser) { return this.service.listCatalogs(user.tenantId); }

  @Roles(...READ) @Get('sinapi/catalogs/:id/items')
  catalogItems(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query('search') search?: string) {
    return this.service.listCatalogItems(user.tenantId, id, search);
  }

  @Roles(...WRITE) @Post('sinapi/catalogs')
  importCatalog(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportSinapiCatalogDto) {
    return this.service.importCatalog(user.tenantId, user.userId, dto);
  }

  @Roles(...READ) @Get()
  list(@CurrentUser() user: AuthenticatedUser) { return this.service.listBudgets(user.tenantId); }

  @Roles(...READ) @Get('work-orders/:workOrderId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('workOrderId') workOrderId: string) {
    return this.service.getBudget(user.tenantId, workOrderId);
  }

  @Roles(...WRITE) @Put('work-orders/:workOrderId')
  save(@CurrentUser() user: AuthenticatedUser, @Param('workOrderId') workOrderId: string,
    @Body() dto: SaveBudgetDto) { return this.service.saveBudget(user.tenantId, user.userId, workOrderId, dto); }

  @Roles(...WRITE) @Post(':id/transitions')
  transition(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
    @Body() dto: TransitionBudgetDto) { return this.service.transition(user.tenantId, user.userId, id, dto); }
}

