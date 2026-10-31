import { Body, Controller, Get, Module, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, DefaultValuePipe, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MailService } from '../../common/mail/mail.service';
import { InfraModule } from '../infraestrutura/infra.module';
import { BulletinGuard, BulletinsService } from './bulletins.service';
import { BulletinConfirmDto, BulletinDraftDto } from './bulletins.dto';
@ApiTags('Informativos do sistema — desenvolvimento') @ApiCookieAuth('gp_access')
@UseGuards(BulletinGuard) @Controller('system-bulletins')
export class BulletinsController {
 constructor(private readonly service:BulletinsService,private readonly mail:MailService){}
 @Get('capabilities') capabilities(@CurrentUser() actor:AuthenticatedUser){return{allowed:true,mailConfigured:this.mail.isConfigured(),administrator:actor.name,products:['ORCAPRO','INFRA']};}
 @Post('preview') @ApiOperation({summary:'Salva prévia imutável e conta o diretório global de contas deduplicadas, respeitando preferências.'})
 preview(@CurrentUser() actor:AuthenticatedUser,@Body() dto:BulletinDraftDto){return this.service.preview(actor,dto);}
 @Get() @ApiOperation({summary:'Histórico paginado privado do tenant do administrador, sem e-mails de destinatários.'})
 history(@CurrentUser() actor:AuthenticatedUser,@Query('page',new DefaultValuePipe(1),ParseIntPipe) page:number){return this.service.history(actor,Math.max(1,Math.min(page,100000)));}
 @Post(':id/test') @ApiOperation({summary:'Envia teste somente para o e-mail atual do próprio administrador; limite de um teste por minuto.'})
 test(@CurrentUser() actor:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string){return this.service.test(actor,id);}
 @Post(':id/confirm') @ApiOperation({summary:'Exige frase explícita e hash do público conferido; enfileiramento idempotente, sem envio na requisição.'})
 confirm(@CurrentUser() actor:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:BulletinConfirmDto){return this.service.confirm(actor,id,dto);}
}
@Module({imports:[InfraModule],controllers:[BulletinsController],providers:[BulletinGuard,BulletinsService]})
export class BulletinsModule {}
