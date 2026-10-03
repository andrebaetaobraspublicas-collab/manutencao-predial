import { Body, Controller, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrcaproGuard } from './orcapro.guard';
import { OrcaproRiskService } from './orcapro-risk.service';
import { RiskBdiDto, RiskCreateDto, RiskSaveDto, RiskVersionDto } from './orcapro-risk.dto';
@ApiTags('OrçaPro — riscos') @ApiCookieAuth('gp_access') @ApiBearerAuth() @UseGuards(OrcaproGuard)
@Controller('orcapro/projects/:projectId/risks')
export class OrcaproRiskController {
  constructor(private readonly risks:OrcaproRiskService) {}
  @Post() @ApiOperation({summary:'Criar fotografia imutável do custo direto e curva ABC da versão privada do orçamento.'})
  create(@CurrentUser() user:AuthenticatedUser,@Param('projectId',ParseUUIDPipe) id:string,@Body() dto:RiskCreateDto) {return this.risks.create(user,id,dto.expectedVersion,dto.name);}
  @Put(':riskId') @ApiOperation({summary:'Salvar variáveis e eventos; invalida resultado anterior e preserva histórico de versões.'})
  save(@CurrentUser() user:AuthenticatedUser,@Param('projectId',ParseUUIDPipe) id:string,@Param('riskId',ParseUUIDPipe) riskId:string,@Body() dto:RiskSaveDto) {return this.risks.configure(user,id,riskId,dto.expectedVersion,dto.config);}
  @Post(':riskId/simulate') @ApiOperation({summary:'Monte Carlo reproduzível em worker isolado; calcula tornado e VME/RMS sobre o mesmo escopo.'})
  simulate(@CurrentUser() user:AuthenticatedUser,@Param('projectId',ParseUUIDPipe) id:string,@Param('riskId',ParseUUIDPipe) riskId:string,@Body() dto:RiskVersionDto) {return this.risks.simulate(user,id,riskId,dto.expectedVersion);}
  @Post(':riskId/bdi-preview') @ApiOperation({summary:'Recalcular taxa no servidor e apresentar prévia do BDI principal, sem alterar o orçamento.'})
  preview(@CurrentUser() user:AuthenticatedUser,@Param('projectId',ParseUUIDPipe) id:string,@Param('riskId',ParseUUIDPipe) riskId:string,@Body() dto:RiskBdiDto) {return this.risks.bdi(user,id,riskId,dto);}
  @Post(':riskId/bdi-apply') @ApiOperation({summary:'Criar configuração personalizada do BDI principal, preservando configuração anterior na memória da análise.'})
  apply(@CurrentUser() user:AuthenticatedUser,@Param('projectId',ParseUUIDPipe) id:string,@Param('riskId',ParseUUIDPipe) riskId:string,@Body() dto:RiskBdiDto) {return this.risks.bdi(user,id,riskId,dto,true);}
}
