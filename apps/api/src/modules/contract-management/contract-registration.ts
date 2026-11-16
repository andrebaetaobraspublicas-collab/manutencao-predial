import { BadRequestException, Body, ConflictException, Controller, Get, HttpException, Injectable, NotFoundException, Post, Req, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { RegisterOrcaproDto } from '../auth/dto/orcapro-account.dto';
import { GestaoLoginGuard } from '../auth/gestao-login.guard';
import { writeSessionCookies } from '../auth/session-cookies';
import { ContractDatabase, ContractSql } from './contract-db';
import { ContractBillingService } from './contract-billing.service';
import { saasAudit } from './contract-saas-audit';

@Injectable()
export class ContractRegistration {
  constructor(private readonly db:ContractDatabase,private readonly primary:PrismaService,private readonly billing:ContractBillingService,private readonly auth:AuthService) {}
  async plans() {
    if(!this.db.enabled())throw new NotFoundException();
    const integration=this.billing.integration();
    const rows=integration.configured?await this.db.query('SELECT id,name,billing_interval,price_brl FROM GcSaasPlan WHERE active=TRUE AND stripe_price_id IS NOT NULL ORDER BY price_brl'):[];
    return {testMode:true,configured:integration.configured,plans:rows.map((p:any)=>({id:p.id,name:p.name,billingInterval:p.billing_interval,priceBrl:String(p.price_brl)}))};
  }
  async register(dto:RegisterOrcaproDto,request:Request) {
    if(!this.db.enabled())throw new NotFoundException();
    if(!this.billing.integration().configured)throw new ServiceUnavailableException('Assinatura de teste indisponível. Tente novamente mais tarde.');
    if(dto.name.trim().length<2||Buffer.byteLength(dto.password,'utf8')>72)throw new BadRequestException('Confira o nome e a senha de até 72 bytes.');
    const plan=(await this.db.query('SELECT * FROM GcSaasPlan WHERE id=? AND active=TRUE AND stripe_price_id IS NOT NULL',[dto.planId]))[0];
    if(!plan)throw new BadRequestException('Plano indisponível.');
    await this.billing.validatePrice(plan.stripe_price_id,plan.price_brl,plan.billing_interval);
    const email=dto.email.trim().toLowerCase(),userId=randomUUID(),profileId=randomUUID();
    const passwordHash=await hash(dto.password,12);
    try {
      const actor=await this.primary.$transaction(async central=>{
        if(await central.user.findUnique({where:{email},select:{id:true}}))throw new ConflictException('Este e-mail já possui conta. Entre para contratar a Gestão Contratual.');
        const tenant=await central.tenant.create({data:{name:dto.name.trim(),slug:`gestao-${userId}`,status:'ACTIVE'}});
        await central.user.create({data:{id:userId,name:dto.name.trim(),email,passwordHash,status:'ACTIVE'}});
        const member=await central.tenantMembership.create({data:{tenantId:tenant.id,userId,role:'REQUESTER',status:'ACTIVE',maintenanceAccess:false,acceptedAt:new Date()}});
        await central.orcaproUserAccess.create({data:{userId,managed:true,enabled:false,updatedByUserId:userId}});
        const identity={userId,tenantId:tenant.id};
        // Separate databases: a pending profile cannot grant access before the identity commits.
        await this.db.transaction(async db=>{
          await db.query("INSERT INTO GcSaasUser(id,membership_id,tenant_id,user_id,status,billing_source) VALUES(?,?,?,?,'PENDING','STRIPE')",[profileId,member.id,tenant.id,userId]);
          await saasAudit(db,identity,'saas.user.self-register.request',profileId,{planId:dto.planId,pendingPayment:true});
        });
        return identity;
      },{timeout:20000});
      await this.db.transaction(async db=>{
        await db.query("UPDATE GcSaasUser SET status='ACTIVE',updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND tenant_id=? AND user_id=? AND status='PENDING'",[profileId,actor.tenantId,userId]);
        await saasAudit(db,actor,'saas.user.self-register',profileId,{planId:dto.planId,pendingPayment:true,maintenanceAccess:false,orcaproAccess:false});
      });
    }catch(e){
      if((e as {code?:string})?.code==='P2002')throw new ConflictException('Este e-mail já possui conta. Entre para retomar a contratação.');
      if(e instanceof HttpException)throw e;
      throw new ServiceUnavailableException('Não foi possível concluir o cadastro. Entre com sua conta ou contate o suporte antes de repetir.');
    }
    const session=await this.auth.loginGestao({email,password:dto.password},request);
    try { const checkout=await this.billing.checkout(session.user,randomUUID(),dto.planId);return {session,checkoutUrl:checkout.url}; }
    catch { await saasAudit(this.db as ContractSql,session.user,'saas.user.checkout.pending',profileId,{planId:dto.planId}).catch(()=>undefined);return {session,checkoutUrl:null,checkoutError:'Conta criada. Retome a assinatura de teste na Gestão Contratual.'}; }
  }
}

@Public()
@ApiTags('Gestão Contratual · cadastro autônomo de testes')
@Controller('contract-management/billing/public')
export class ContractRegistrationController {
  constructor(private readonly registration:ContractRegistration,private readonly config:ConfigService) {}
  @Get('plans') @ApiOperation({summary:'Planos públicos de teste; indisponível em produção'})
  plans(){return this.registration.plans();}
  @Post('register') @UseGuards(GestaoLoginGuard) @ApiOperation({summary:'Cria identidade isolada sem licença; Checkout TEST e ativação por webhook'})
  async register(@Body() dto:RegisterOrcaproDto,@Req() req:Request,@Res({passthrough:true}) res:Response){
    const result=await this.registration.register(dto,req);writeSessionCookies(res,result.session,this.config);
    return {checkoutUrl:result.checkoutUrl,checkoutError:result.checkoutError};
  }
}
