import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ContractDossierAttachmentEntity, MembershipRole } from '../../generated/prisma/client';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CreateContractAdjustmentDto, CreateContractAmendmentDto, CreateContractPenaltyDto,
  CreateContractSubcontractDto } from './dto/contract-events.dto';
import {
  CreateConstructionDiaryDto,
  CreateContractApostilleDto,
  CreateContractCommunicationClaimDto,
  CreateContractGuaranteeDto,
  CreateContractInspectionTeamMemberDto,
  CreateContractReceiptDto,
} from './dto/contract-governance.dto';

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

  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MANAGER,
    MembershipRole.CONTRACT_MANAGER,
  )
  @Delete(':id')
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.archive(user.tenantId, user.userId, id);
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

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER)
  @Post(':id/inspection-team')
  inspectionTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateContractInspectionTeamMemberDto,
  ) {
    return this.service.addInspectionTeamMember(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER)
  @Post(':id/guarantees')
  guarantee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateContractGuaranteeDto,
  ) {
    return this.service.addGuarantee(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER)
  @Post(':id/apostilles')
  apostille(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateContractApostilleDto,
  ) {
    return this.service.addApostille(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR)
  @Post(':id/receipts')
  receipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateContractReceiptDto,
  ) {
    return this.service.addReceipt(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR)
  @Post(':id/construction-diaries')
  constructionDiary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateConstructionDiaryDto,
  ) {
    return this.service.addConstructionDiary(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR)
  @Post(':id/communications')
  communication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateContractCommunicationClaimDto,
  ) {
    return this.service.addCommunicationClaim(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER)
  @Patch(':id/governance/:kind/:entryId')
  updateGovernanceEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Param('entryId') entryId: string,
    @Body() data: Record<string, unknown>,
  ) {
    return this.service.updateGovernanceEntry(
      user.tenantId,
      user.userId,
      id,
      kind,
      entryId,
      data,
    );
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER)
  @Delete(':id/governance/:kind/:entryId')
  archiveGovernanceEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Param('entryId') entryId: string,
  ) {
    return this.service.archiveGovernanceEntry(user.tenantId, user.userId, id, kind, entryId);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER, MembershipRole.CONTRACT_INSPECTOR)
  @Post(':id/dossier-attachments')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024, files: 1 },
  }))
  uploadDossierAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('entityType') entityType: ContractDossierAttachmentEntity,
    @Body('entityId') entityId: string | undefined,
    @Body('kind') kind: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.uploadDossierAttachment(
      user.tenantId,
      user.userId,
      id,
      entityType,
      entityId,
      kind,
      file,
    );
  }

  @Get(':id/dossier-attachments/:attachmentId/download')
  async downloadDossierAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const { attachment, absolutePath } = await this.service.resolveDossierAttachmentForDownload(
      user.tenantId,
      user.userId,
      id,
      attachmentId,
    );
    response.type(attachment.mimeType);
    response.download(absolutePath, attachment.originalName);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CONTRACT_MANAGER)
  @Delete(':id/dossier-attachments/:attachmentId')
  archiveDossierAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.service.archiveDossierAttachment(user.tenantId, user.userId, id, attachmentId);
  }
}
