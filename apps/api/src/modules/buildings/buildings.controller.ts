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
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { BuildingAttachmentKind, MembershipRole } from '../../generated/prisma/client';
import { BuildingsService } from './buildings.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { CreateBuildingInspectionDto } from './dto/create-building-inspection.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';

@ApiTags('Edificações')
@Controller('buildings')
export class BuildingsController {
  constructor(private readonly service: BuildingsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.tenantId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.get(user.tenantId, id);
  }

  @Get(':id/deletion-impact')
  deletionImpact(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.deletionImpact(user.tenantId, id);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBuildingDto) {
    return this.service.create(user.tenantId, user.userId, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBuildingDto,
  ) {
    return this.service.update(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER)
  @Post(':id/inspections')
  createInspection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateBuildingInspectionDto,
  ) {
    return this.service.createInspection(user.tenantId, user.userId, id, dto);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER)
  @Delete(':id/inspections/:inspectionId')
  archiveInspection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('inspectionId') inspectionId: string,
  ) {
    return this.service.archiveInspection(user.tenantId, user.userId, id, inspectionId);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER)
  @ApiConsumes('multipart/form-data')
  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024,
        files: 1,
      },
    }),
  )
  uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('kind') kind: BuildingAttachmentKind,
    @Body('inspectionId') inspectionId?: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.uploadAttachment(
      user.tenantId,
      user.userId,
      id,
      kind,
      inspectionId,
      file,
    );
  }

  @Get(':id/attachments/:attachmentId/download')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const { attachment, absolutePath } = await this.service.resolveAttachmentForDownload(
      user.tenantId,
      user.userId,
      id,
      attachmentId,
    );
    response.type(attachment.mimeType);
    response.download(absolutePath, attachment.originalName);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER)
  @Delete(':id/attachments/:attachmentId')
  archiveAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.service.archiveAttachment(user.tenantId, user.userId, id, attachmentId);
  }

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @Delete(':id')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archive(user.tenantId, user.userId, id);
  }
}
