import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import {
  CreateCatalogItemDto,
  ListCatalogItemsQuery,
  ReplaceChecklistTemplateDto,
  UpdateCatalogItemDto,
} from './dto/catalog.dto';
import {
  CalculateSlaDto,
  CreateSlaCalendarDto,
  CreateSlaHolidayDto,
  CreateSlaPolicyDto,
  ListSlaCalendarsQuery,
  ListSlaPoliciesQuery,
  UpdateSlaCalendarDto,
  UpdateSlaPolicyDto,
} from './dto/sla.dto';
import { OperationsService } from './operations.service';

const CONFIGURATION_ROLES = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
];

@ApiTags('Operação - catálogos')
@Controller('operations/catalogs')
export class OperationsCatalogsController {
  constructor(private readonly service: OperationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCatalogItemsQuery,
  ) {
    return this.service.listCatalogItems(user.tenantId, query);
  }

  @Roles(...CONFIGURATION_ROLES)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCatalogItemDto,
  ) {
    return this.service.createCatalogItem(user.tenantId, user.userId, dto);
  }

  @Roles(...CONFIGURATION_ROLES)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.service.updateCatalogItem(user.tenantId, user.userId, id, dto);
  }

  @Roles(...CONFIGURATION_ROLES)
  @Delete(':id')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archiveCatalogItem(user.tenantId, user.userId, id);
  }

  @Get(':categoryId/checklist-template')
  checklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId') categoryId: string,
  ) {
    return this.service.getChecklistTemplate(user.tenantId, categoryId);
  }

  @Roles(...CONFIGURATION_ROLES)
  @Put(':categoryId/checklist-template')
  replaceChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId') categoryId: string,
    @Body() dto: ReplaceChecklistTemplateDto,
  ) {
    return this.service.replaceChecklistTemplate(
      user.tenantId,
      user.userId,
      categoryId,
      dto,
    );
  }
}

@ApiTags('Operação - SLA')
@Controller('operations/sla')
export class OperationsSlaController {
  constructor(private readonly service: OperationsService) {}

  @Get('calendars')
  calendars(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSlaCalendarsQuery,
  ) {
    return this.service.listSlaCalendars(user.tenantId, query);
  }

  @Roles(...CONFIGURATION_ROLES)
  @Post('calendars')
  createCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSlaCalendarDto,
  ) {
    return this.service.createSlaCalendar(user.tenantId, user.userId, dto);
  }

  @Roles(...CONFIGURATION_ROLES)
  @Patch('calendars/:id')
  updateCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSlaCalendarDto,
  ) {
    return this.service.updateSlaCalendar(user.tenantId, user.userId, id, dto);
  }

  @Roles(...CONFIGURATION_ROLES)
  @Post('calendars/:id/holidays')
  addHoliday(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSlaHolidayDto,
  ) {
    return this.service.addSlaHoliday(user.tenantId, user.userId, id, dto);
  }

  @Roles(...CONFIGURATION_ROLES)
  @Delete('calendars/:id/holidays/:holidayId')
  deactivateHoliday(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('holidayId') holidayId: string,
  ) {
    return this.service.deactivateSlaHoliday(
      user.tenantId,
      user.userId,
      id,
      holidayId,
    );
  }

  @Roles(...CONFIGURATION_ROLES)
  @Get('policies')
  policies(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSlaPoliciesQuery,
  ) {
    return this.service.listSlaPolicies(user.tenantId, query);
  }

  @Roles(...CONFIGURATION_ROLES)
  @Post('policies')
  createPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSlaPolicyDto,
  ) {
    return this.service.createSlaPolicy(user.tenantId, user.userId, dto);
  }

  @Roles(...CONFIGURATION_ROLES)
  @Patch('policies/:id')
  updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSlaPolicyDto,
  ) {
    return this.service.updateSlaPolicy(user.tenantId, user.userId, id, dto);
  }

  @Post('calculate')
  calculate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CalculateSlaDto,
  ) {
    return this.service.calculateSla(user.tenantId, dto);
  }
}
