import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  AttachmentKind,
  MembershipRole,
} from '../../generated/prisma/client';
import { AddPendencyDto } from './dto/add-pendency.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { ListWorkOrdersQuery } from './dto/list-work-orders.query';
import { ResolvePendencyDto } from './dto/resolve-pendency.dto';
import { SubmitSatisfactionDto } from './dto/submit-satisfaction.dto';
import { TransitionWorkOrderDto } from './dto/transition-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrdersService } from './work-orders.service';

const OPERATIONAL_ROLES = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.OPERATOR,
  MembershipRole.CONTRACT_MANAGER,
  MembershipRole.CONTRACT_INSPECTOR,
];

const CREATE_ROLES = [
  ...OPERATIONAL_ROLES,
  MembershipRole.REQUESTER,
];

const ATTACHMENT_WRITE_ROLES = [
  ...OPERATIONAL_ROLES,
  MembershipRole.REQUESTER,
];

@ApiTags('Ordens de serviço')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly service: WorkOrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWorkOrdersQuery,
  ) {
    return this.service.listForUser(user, query);
  }

  @Roles(...CREATE_ROLES)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkOrderDto,
  ) {
    return this.service.create(user.tenantId, user.userId, user.role, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getForUser(user, id);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderDto,
  ) {
    return this.service.update(user.tenantId, user.userId, id, dto);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Post(':id/transitions')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionWorkOrderDto,
  ) {
    return this.service.transition(user.tenantId, user.userId, id, dto);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Post(':id/pendencies')
  addPendency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddPendencyDto,
  ) {
    return this.service.addPendency(user.tenantId, user.userId, id, dto);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Patch(':id/pendencies/:pendencyId/resolve')
  resolvePendency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('pendencyId') pendencyId: string,
    @Body() dto: ResolvePendencyDto,
  ) {
    return this.service.resolvePendency(
      user.tenantId,
      user.userId,
      id,
      pendencyId,
      dto,
    );
  }

  @Post(':id/satisfaction')
  submitSatisfaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitSatisfactionDto,
  ) {
    return this.service.submitSatisfaction(user.tenantId, user.userId, id, dto);
  }

  @Roles(...ATTACHMENT_WRITE_ROLES)
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
    @Body('kind') kind: AttachmentKind,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.uploadAttachment(user.tenantId, user.userId, user.role, id, kind, file);
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
      user.role,
      id,
      attachmentId,
    );
    response.type(attachment.mimeType);
    response.download(absolutePath, attachment.originalName);
  }
}
