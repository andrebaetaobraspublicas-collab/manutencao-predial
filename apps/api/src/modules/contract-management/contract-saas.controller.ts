import { Body, CanActivate, Controller, ExecutionContext, Get, HttpException, Injectable, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ContractBillingGuard } from './contract-billing.controller';
import { ContractSaasAccess } from './contract-saas-access';
import { ContractSaasService } from './contract-saas.service';
import { ContractSaasAudit } from './contract-saas-audit';
import { GcAuditQuery, GcCreateUserDto, GcGrantDto, GcNavigationDto, GcPasswordDto, GcPlanDto, GcSettingDto, GcStripeActionDto, GcSubscriptionDto, GcUserAccessDto, GcUserQuery, GcVersionDto } from './contract-saas.dto';

@Injectable()
export class ContractSaasGuard implements CanActivate {
  private readonly buckets=new Map<string,{start:number;count:number}>();
  constructor(private readonly common:ContractBillingGuard,private readonly access:ContractSaasAccess){}
  async canActivate(ctx:ExecutionContext){
    this.common.canActivate(ctx);const req=ctx.switchToHttp().getRequest();await this.access.assertAdmin(req.user);
    const key=req.user.userId,now=Date.now();for(const [id,row]of this.buckets)if(now-row.start>60000)this.buckets.delete(id);
    const b=this.buckets.get(key)||{start:now,count:0};this.buckets.set(key,b);
    if(++b.count>120)throw new HttpException('Limite de operações administrativas. Aguarde um minuto.',429);
    ctx.switchToHttp().getResponse().setHeader('Cache-Control','private, no-store');return true;
  }
}
@ApiTags('Gestão Contratual · administração SaaS') @ApiCookieAuth('gp_access')
@Controller('contract-management/admin') @UseGuards(ContractSaasGuard)
export class ContractSaasController {
  constructor(private readonly service:ContractSaasService,private readonly audit:ContractSaasAudit){}
  @Get('overview') @ApiOperation({summary:'Indicadores globais do produto e integração Stripe TEST; não retorna segredos nem planilhas.'}) overview(@CurrentUser()u:AuthenticatedUser){return this.service.overview(u);}
  @Get('users') @ApiOperation({summary:'Diretório administrativo paginado de acessos deste produto.'}) users(@CurrentUser()u:AuthenticatedUser,@Query()q:GcUserQuery){return this.service.users(u,q);}
  @Get('accounts') @ApiOperation({summary:'Busca vínculos centrais ativos para concessão explícita de acesso.'}) accounts(@CurrentUser()u:AuthenticatedUser,@Query()q:GcUserQuery){return this.service.accounts(u,q);}
  @Post('users') @ApiOperation({summary:'Cria identidade compartilhada e acesso exclusivo à Gestão Contratual com teste local de 30 dias.'}) create(@CurrentUser()u:AuthenticatedUser,@Body()d:GcCreateUserDto){return this.service.create(u,d);}
  @Post('users/grant') @ApiOperation({summary:'Concede acesso a vínculo existente; resolve tenant no servidor.'}) grant(@CurrentUser()u:AuthenticatedUser,@Body()d:GcGrantDto){return this.service.grant(u,d);}
  @Patch('users/:id') @ApiOperation({summary:'Altera papel/situação; exclusão recuperável somente do acesso ao produto.'}) status(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string,@Body()d:GcUserAccessDto){return this.service.updateAccess(u,id,d);}
  @Get('users/:id/sessions') sessions(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string){return this.service.sessions(u,id);}
  @Post('users/:id/password') @ApiOperation({summary:'Altera senha compartilhada, consome resets e revoga sessões; auditoria sem credenciais.'}) password(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string,@Body()d:GcPasswordDto){return this.service.identity(u,id,d,d.newPassword,d.acknowledgeShared);}
  @Post('users/:id/revoke-sessions') @ApiOperation({summary:'Encerra sessões compartilhadas e invalida JWTs anteriores da conta selecionada.'}) revoke(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string,@Body()d:GcVersionDto){return this.service.identity(u,id,d);}
  @Put('users/:id/subscription') @ApiOperation({summary:'Configura licença manual ou retorno ao Stripe sem alterar cobranças.'}) subscription(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string,@Body()d:GcSubscriptionDto){return this.service.subscription(u,id,d);}
  @Post('users/:id/stripe') @ApiOperation({summary:'Sincroniza, agenda cancelamento ou remove cancelamento agendado na assinatura TEST vinculada.'}) stripe(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string,@Body()d:GcStripeActionDto){return this.service.stripeAction(u,id,d);}
  @Get('plans') plans(@CurrentUser()u:AuthenticatedUser){return this.service.plans(u);}
  @Post('plans') createPlan(@CurrentUser()u:AuthenticatedUser,@Body()d:GcPlanDto){return this.service.savePlan(u,d);}
  @Put('plans/:id') plan(@CurrentUser()u:AuthenticatedUser,@Param('id',ParseUUIDPipe)id:string,@Body()d:GcPlanDto){return this.service.savePlan(u,d,id);}
  @Get('audit') @ApiOperation({summary:'Auditoria de metadados, incluindo atos anteriores, com período em Brasília; não expõe documentos nem senhas.'}) logs(@CurrentUser()u:AuthenticatedUser,@Query()q:GcAuditQuery){return this.audit.logs(u,q);}
  @Get('audit/export') @ApiOperation({summary:'CSV da página filtrada da auditoria, até 100 registros; neutraliza fórmulas.'}) async export(@CurrentUser()u:AuthenticatedUser,@Query()q:GcAuditQuery,@Res()res:Response){
    const data=await this.audit.logs(u,q),cell=(v:unknown)=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
    const csv=[['Data UTC','Responsável','E-mail','Operação','Registro','Detalhes'],...data.items.map(e=>[new Date(e.createdAt).toISOString(),e.actor?.name,e.actor?.email,e.action,e.entityId,JSON.stringify(e.metadata)])].map(r=>r.map(cell).join(';')).join('\r\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="auditoria-gestao-pagina-'+data.page+'.csv"');res.setHeader('X-Content-Type-Options','nosniff');res.send('\uFEFF'+csv);
  }
  @Get('settings') settings(@CurrentUser()u:AuthenticatedUser){return this.service.settings(u);}
  @Put('settings/:name') @ApiOperation({summary:'Edita textos de privacidade, termos e informativo interno, com versão; não envia mensagens externas.'}) setting(@CurrentUser()u:AuthenticatedUser,@Param('name')name:string,@Body()d:GcSettingDto){return this.service.setting(u,name,d);}
}
@ApiTags('Gestão Contratual · navegação e ajuda') @ApiCookieAuth('gp_access')
@Controller('contract-management') @UseGuards(ContractBillingGuard)
export class ContractHelpController {
  constructor(private readonly service:ContractSaasService,private readonly access:ContractSaasAccess,private readonly audit:ContractSaasAudit){}
  @Get('saas-access') async permissions(@CurrentUser()u:AuthenticatedUser){return {admin:await this.access.admin(u),root:this.access.root(u)};}
  @Get('content') @ApiOperation({summary:'Textos publicados do produto para usuários autenticados.'}) content(){return this.service.content();}
  @Post('activity/navigation') @ApiOperation({summary:'Registra abertura de seção, sem valores de campos ou documentos.'}) async navigation(@CurrentUser()u:AuthenticatedUser,@Body()d:GcNavigationDto){await this.audit.observe(u,'activity.navigation','gestao-contratual',{screen:d.screen});return {recorded:true};}
}
