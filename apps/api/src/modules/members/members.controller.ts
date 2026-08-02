import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MembersService } from './members.service';

const ADMIN_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN] as const;

@ApiTags('Usuários e convites')
@Controller('members')
@Roles(...ADMIN_ROLES)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os membros da organização autenticada' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.members.list(user.tenantId);
  }

  @Get('invitations')
  @ApiOperation({ summary: 'Lista os convites da organização autenticada' })
  listInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.members.listInvitations(user.tenantId);
  }

  @Post('invitations')
  @ApiOperation({ summary: 'Convida um usuário para a organização' })
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteMemberDto,
    @Req() request: Request,
  ) {
    return this.members.invite(user, dto, request);
  }

  @Patch(':membershipId')
  @ApiOperation({ summary: 'Altera papel, situação ou validade de um acesso' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberDto,
    @Req() request: Request,
  ) {
    return this.members.update(user, membershipId, dto, request);
  }

  @Post(':membershipId/revoke-sessions')
  @ApiOperation({ summary: 'Revoga todas as sessões de um membro' })
  revokeSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('membershipId') membershipId: string,
    @Req() request: Request,
  ) {
    return this.members.revokeSessions(user, membershipId, request);
  }
}
