import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { BudgetsService } from './budgets.service';
import { BudgetStageQuery, CatalogItemSearchQuery, ImportCatalogFileDto, ImportSinapiCatalogDto, SaveBudgetDto, TransitionBudgetDto } from './dto/budgets.dto';
import {
  ContractBudgetItemsQuery,
  ImportContractBudgetDto,
  UpdateContractBudgetDto,
  UpsertContractBudgetItemDto,
  UpsertContractLaborPostDto,
} from './dto/contract-budgets.dto';

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

  @Roles(...READ) @Get('sinapi/catalogs/:id/search')
  searchCatalogItems(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
    @Query() query: CatalogItemSearchQuery) {
    return this.service.searchCatalogItems(user.tenantId, id, query);
  }

  @Roles(...READ) @Get('sinapi/catalogs/:id/items/:itemId')
  catalogItem(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
    @Param('itemId') itemId: string) {
    return this.service.getCatalogItem(user.tenantId, id, itemId);
  }

  @Roles(...WRITE) @Post('sinapi/catalogs')
  importCatalog(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportSinapiCatalogDto) {
    return this.service.importCatalog(user.tenantId, user.userId, dto);
  }

  @Roles(...WRITE)
  @ApiConsumes('multipart/form-data')
  @Post('catalogs/import-file')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1 } }))
  importFile(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportCatalogFileDto,
    @UploadedFile() file?: Express.Multer.File) {
    return this.service.importWorkbook(user.tenantId, user.userId, dto, file);
  }

  @Roles(...READ) @Get()
  list(@CurrentUser() user: AuthenticatedUser) { return this.service.listBudgets(user.tenantId); }

  @Roles(...READ) @Get('contracts/:contractId')
  contractBudget(@CurrentUser() user: AuthenticatedUser, @Param('contractId') contractId: string) {
    return this.service.getContractBudget(user.tenantId, contractId);
  }

  @Roles(...READ) @Get('contracts/:contractId/items')
  contractBudgetItems(@CurrentUser() user: AuthenticatedUser, @Param('contractId') contractId: string,
    @Query() query: ContractBudgetItemsQuery) {
    return this.service.searchContractBudgetItems(user.tenantId, contractId, query);
  }

  @Roles(...WRITE)
  @ApiConsumes('multipart/form-data')
  @Post('contracts/:contractId/import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 80 * 1024 * 1024, files: 1 } }))
  importContractBudget(@CurrentUser() user: AuthenticatedUser, @Param('contractId') contractId: string,
    @Body() dto: ImportContractBudgetDto, @UploadedFile() file?: Express.Multer.File) {
    return this.service.importContractBudget(user.tenantId, user.userId, contractId, dto, file);
  }

  @Roles(...WRITE) @Patch('contracts/:contractId')
  updateContractBudget(@CurrentUser() user: AuthenticatedUser, @Param('contractId') contractId: string,
    @Body() dto: UpdateContractBudgetDto) {
    return this.service.updateContractBudget(user.tenantId, user.userId, contractId, dto);
  }

  @Roles(...WRITE) @Post('contracts/:contractId/items')
  createContractBudgetItem(@CurrentUser() user: AuthenticatedUser, @Param('contractId') contractId: string,
    @Body() dto: UpsertContractBudgetItemDto) {
    return this.service.upsertContractBudgetItem(user.tenantId, user.userId, contractId, undefined, dto);
  }

  @Roles(...WRITE) @Patch('contracts/:contractId/items/:itemId')
  updateContractBudgetItem(@CurrentUser() user: AuthenticatedUser, @Param('contractId') contractId: string,
    @Param('itemId') itemId: string, @Body() dto: UpsertContractBudgetItemDto) {
    return this.service.upsertContractBudgetItem(user.tenantId, user.userId, contractId, itemId, dto);
  }

  @Roles(...WRITE) @Delete('contracts/:contractId/items/:itemId')
  deleteContractBudgetItem(@CurrentUser() user: AuthenticatedUser, @Param('contractId') contractId: string,
    @Param('itemId') itemId: string) {
    return this.service.archiveContractBudgetItem(user.tenantId, user.userId, contractId, itemId);
  }

  @Roles(...WRITE) @Post('contracts/:contractId/labor-posts')
  createLaborPost(@CurrentUser() user: AuthenticatedUser, @Param('contractId') contractId: string,
    @Body() dto: UpsertContractLaborPostDto) {
    return this.service.upsertContractLaborPost(user.tenantId, user.userId, contractId, undefined, dto);
  }

  @Roles(...WRITE) @Patch('contracts/:contractId/labor-posts/:postId')
  updateLaborPost(@CurrentUser() user: AuthenticatedUser, @Param('contractId') contractId: string,
    @Param('postId') postId: string, @Body() dto: UpsertContractLaborPostDto) {
    return this.service.upsertContractLaborPost(user.tenantId, user.userId, contractId, postId, dto);
  }

  @Roles(...WRITE) @Delete('contracts/:contractId/labor-posts/:postId')
  deleteLaborPost(@CurrentUser() user: AuthenticatedUser, @Param('contractId') contractId: string,
    @Param('postId') postId: string) {
    return this.service.archiveContractLaborPost(user.tenantId, user.userId, contractId, postId);
  }

  @Roles(...READ) @Get('contracts/:contractId/imports/:importId/download')
  async downloadContractBudgetImport(@CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string, @Param('importId') importId: string,
    @Res() response: Response) {
    const { imported, absolutePath } = await this.service.resolveContractBudgetImportDownload(
      user.tenantId, user.userId, contractId, importId,
    );
    response.type(imported.mimeType);
    response.download(absolutePath, imported.originalName);
  }

  @Roles(...READ) @Get('work-orders/:workOrderId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('workOrderId') workOrderId: string,
    @Query() query: BudgetStageQuery) {
    return this.service.getBudget(user.tenantId, workOrderId, query.stage);
  }

  @Roles(...READ) @Get('work-orders/:workOrderId/stages')
  stages(@CurrentUser() user: AuthenticatedUser, @Param('workOrderId') workOrderId: string) {
    return this.service.getBudgetStages(user.tenantId, workOrderId);
  }

  @Roles(...READ) @Get('work-orders/:workOrderId/contract-items')
  contractItemsForWorkOrder(@CurrentUser() user: AuthenticatedUser,
    @Param('workOrderId') workOrderId: string, @Query() query: ContractBudgetItemsQuery) {
    return this.service.searchWorkOrderContractItems(user.tenantId, workOrderId, query);
  }

  @Roles(...WRITE) @Put('work-orders/:workOrderId')
  save(@CurrentUser() user: AuthenticatedUser, @Param('workOrderId') workOrderId: string,
    @Body() dto: SaveBudgetDto, @Query() query: BudgetStageQuery) {
    return this.service.saveBudget(user.tenantId, user.userId, workOrderId, dto, query.stage);
  }

  @Roles(...WRITE) @Post(':id/transitions')
  transition(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
    @Body() dto: TransitionBudgetDto) { return this.service.transition(user.tenantId, user.userId, id, dto); }
}

