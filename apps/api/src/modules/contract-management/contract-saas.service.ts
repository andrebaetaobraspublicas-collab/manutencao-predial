import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ContractDatabase, ContractSql } from './contract-db';
import { ContractSaasAccess, manualLicence, profileAllowsLogin } from './contract-saas-access';
import { ContractBillingService } from './contract-billing.service';
import { saasAudit } from './contract-saas-audit';
import { GcCreateUserDto, GcGrantDto, GcPlanDto, GcSettingDto, GcStripeActionDto, GcSubscriptionDto, GcUserAccessDto, GcUserQuery, GcVersionDto } from './contract-saas.dto';

const membershipSelect={id:true,userId:true,tenantId:true,status:true,expiresAt:true,user:{select:{id:true,name:true,email:true,status:true,deletedAt:true,lastLoginAt:true}},tenant:{select:{name:true,slug:true,status:true,deletedAt:true}}} as const;
const eligible=(m:any)=>m&&m.status==='ACTIVE'&&(!m.expiresAt||new Date(m.expiresAt)>new Date())&&m.user.status==='ACTIVE'&&!m.user.deletedAt&&!m.tenant.deletedAt&&m.tenant.status!=='SUSPENDED';
const planShape=(r:any)=>({id:r.id,code:r.code,name:r.name,billingInterval:r.billing_interval,priceBrl:String(r.price_brl),stripePriceId:r.stripe_price_id,active:!!r.active,version:r.version});
function reason(value:string){if(!value||value.trim().length<5)throw new BadRequestException('Informe uma justificativa com pelo menos cinco caracteres.');return value.trim();}
function checkVersion(row:any,expected:number){if(!row||row.version!==expected)throw new ConflictException('Registro alterado por outra operação. Atualize a tela.');}
@Injectable()
export class ContractSaasService {
  constructor(private readonly db:ContractDatabase,private readonly primary:PrismaService,private readonly access:ContractSaasAccess,private readonly billing:ContractBillingService){}
  private async target(actor:AuthenticatedUser,id:string,db:ContractSql=this.db as ContractSql,protect=true){
    await this.access.assertAdmin(actor);
    const row=(await db.query('SELECT * FROM GcSaasUser WHERE id=?'+(db!==this.db?' FOR UPDATE':''),[id]))[0];
    if(!row)throw new NotFoundException('Acesso da Gestão Contratual não encontrado.');
    if(protect&&(row.user_id===actor.userId||this.access.protectedIdentity(row.user_id)))throw new ForbiddenException('Administrador inicial e própria conta protegidos.');
    if(protect&&row.role==='ADMIN'&&!this.access.root(actor))throw new ForbiddenException('Somente o administrador inicial pode alterar outro administrador do SaaS.');
    return row;
  }
  async accounts(actor:AuthenticatedUser,q:GcUserQuery){
    await this.access.assertAdmin(actor);
    const term=q.search.trim();
    const ids=term?await this.primary.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM User WHERE deletedAt IS NULL AND (LOCATE(CONVERT(${term} USING utf8mb4) COLLATE utf8mb4_unicode_ci,name COLLATE utf8mb4_unicode_ci)>0 OR LOCATE(CONVERT(${term} USING utf8mb4) COLLATE utf8mb4_unicode_ci,email COLLATE utf8mb4_unicode_ci)>0)`):null;
    const where:Prisma.TenantMembershipWhereInput={status:'ACTIVE',...(ids?{userId:{in:ids.map(r=>r.id)}}:{}),OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}],user:{status:'ACTIVE',deletedAt:null},tenant:{deletedAt:null,status:{in:['ACTIVE','TRIAL','PAST_DUE','CANCELED']}}};
    const [rows,total]=await Promise.all([this.primary.tenantMembership.findMany({where,select:membershipSelect,orderBy:[{createdAt:'asc'},{id:'asc'}],take:q.pageSize,skip:(q.page-1)*q.pageSize}),this.primary.tenantMembership.count({where})]);
    const registered=rows.length?await this.db.query<any[]>('SELECT membership_id FROM GcSaasUser WHERE membership_id IN ('+rows.map(()=>'?').join(',')+')',rows.map(r=>r.id)):[];
    return {items:rows.map(m=>({membershipId:m.id,name:m.user.name,email:m.user.email,organization:m.tenant.name,slug:m.tenant.slug,registered:registered.some(r=>r.membership_id===m.id)})),total,page:q.page,pageSize:q.pageSize};
  }
  async users(actor:AuthenticatedUser,q:GcUserQuery){
    await this.access.assertAdmin(actor);
    const conditions:string[]=[],values:unknown[]=[];
    if(q.status!=='ALL'){conditions.push('p.status=?');values.push(q.status);}
    if(q.search.trim()){
      const term=q.search.trim(),ids=await this.primary.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM User WHERE LOCATE(CONVERT(${term} USING utf8mb4) COLLATE utf8mb4_unicode_ci,name COLLATE utf8mb4_unicode_ci)>0 OR LOCATE(CONVERT(${term} USING utf8mb4) COLLATE utf8mb4_unicode_ci,email COLLATE utf8mb4_unicode_ci)>0`);
      conditions.push(ids.length?'p.user_id IN ('+ids.map(()=>'?').join(',')+')':'1=0');values.push(...ids.map(r=>r.id));
    }
    const where=conditions.length?' WHERE '+conditions.join(' AND '):'',total=Number((await this.db.query('SELECT COUNT(*) n FROM GcSaasUser p'+where,values))[0].n),pages=Math.max(1,Math.ceil(total/q.pageSize)),page=Math.min(q.page,pages);
    const rows=await this.db.query<any[]>('SELECT p.*,b.status stripe_status,b.current_period_end stripe_end,b.subscription_id,b.cancel_at_period_end,b.risk_blocked,b.version stripe_version FROM GcSaasUser p LEFT JOIN GcBillingAccount b ON b.tenant_id=p.tenant_id AND b.owner_id=p.user_id'+where+' ORDER BY p.created_at DESC,p.id DESC LIMIT ? OFFSET ?',[...values,q.pageSize,(page-1)*q.pageSize]);
    const memberships=rows.length?await this.primary.tenantMembership.findMany({where:{id:{in:rows.map(r=>r.membership_id)}},select:membershipSelect}):[];
    const productionAccess=new Map<string,boolean>();
    if(this.db.production?.())for(const row of rows){const m=memberships.find(m=>m.id===row.membership_id);productionAccess.set(row.user_id,!!m&&await this.billing.allowedOwn({userId:row.user_id,tenantId:row.tenant_id,email:m.user.email,name:m.user.name} as AuthenticatedUser));}
    return {items:rows.map(r=>{const m=memberships.find(m=>m.id===r.membership_id),manual=manualLicence(r);return {id:r.id,userId:r.user_id,membershipId:r.membership_id,name:m?.user.name||'Identidade indisponível',email:m?.user.email||'',organization:m?.tenant.name||'Organização indisponível',slug:m?.tenant.slug||'',role:r.role,status:r.status,version:r.version,protected:r.user_id===actor.userId||this.access.protectedIdentity(r.user_id),lastLoginAt:m?.user.lastLoginAt,identityActive:!!eligible(m),accessAllowed:(productionAccess.get(r.user_id)??true)&&!!eligible(m)&&profileAllowsLogin(r)&&(this.access.rootId(r.user_id)||(!r.risk_blocked&&(r.role==='ADMIN'||(manual??(['active','trialing'].includes(r.stripe_status)&&!!r.stripe_end&&new Date(r.stripe_end)>new Date()))))),billingSource:r.billing_source,manualStatus:r.manual_status,currentPeriodEnd:r.manual_period_end,planId:r.plan_id,stripe:{status:r.risk_blocked?'review_required':r.stripe_status,periodEnd:r.stripe_end,subscriptionId:r.subscription_id,cancelAtPeriodEnd:!!r.cancel_at_period_end,version:r.stripe_version}};}),total,page,pages,pageSize:q.pageSize};
  }
  async grant(actor:AuthenticatedUser,dto:GcGrantDto){
    await this.access.assertAdmin(actor);reason(dto.reason);
    const m=await this.primary.tenantMembership.findUnique({where:{id:dto.membershipId},select:membershipSelect});
    if(!eligible(m))throw new BadRequestException('Selecione um vínculo ativo da identidade.');
    const id=randomUUID();
    try{return await this.db.transaction(async db=>{
      // Existing licences keep their source; a new account gets a local 30-day trial.
      const legacy=(await db.query('SELECT subscription_id FROM GcBillingAccount WHERE tenant_id=? AND owner_id=?',[m!.tenantId,m!.userId]))[0];
      await db.query('INSERT INTO GcSaasUser(id,membership_id,tenant_id,user_id,billing_source,manual_status,manual_period_end) VALUES(?,?,?,?,?,?,?)',[id,m!.id,m!.tenantId,m!.userId,legacy?'STRIPE':'MANUAL',legacy?null:'TRIALING',legacy?null:new Date(Date.now()+30*86400000)]);
      await saasAudit(db,actor,'saas.user.grant',id,{membershipId:m!.id,customerTenantId:m!.tenantId,reason:dto.reason});return {id};
    });}catch(e){if((e as any)?.code==='ER_DUP_ENTRY')throw new ConflictException('Conta já cadastrada. Use a lista para restaurar ou alterar o acesso.');throw e;}
  }
  async create(actor:AuthenticatedUser,dto:GcCreateUserDto){
    await this.access.assertAdmin(actor);
    if(!!dto.organizationName!==!!dto.organizationSlug||dto.name.trim().length<2)throw new BadRequestException('Confira nome e os dois campos da organização.');
    if(Buffer.byteLength(dto.password,'utf8')>72)throw new BadRequestException('Senha deve ter até 72 bytes.');
    const passwordHash=await hash(dto.password,12),userId=randomUUID(),id=randomUUID();let prepared=false;
    try{
      const result=await this.primary.$transaction(async central=>{
        if(await central.user.findUnique({where:{email:dto.email.trim().toLowerCase()},select:{id:true}}))throw new ConflictException('E-mail já cadastrado. Conceda acesso à conta existente.');
        const tenant=dto.organizationSlug?await central.tenant.create({data:{name:dto.organizationName!.trim(),slug:dto.organizationSlug,status:'ACTIVE'}}):await central.tenant.findFirst({where:{id:actor.tenantId,deletedAt:null},select:{id:true,slug:true}});
        if(!tenant)throw new BadRequestException('Organização indisponível.');
        await central.user.create({data:{id:userId,name:dto.name.trim(),email:dto.email.trim().toLowerCase(),passwordHash,status:'ACTIVE'}});
        const member=await central.tenantMembership.create({data:{userId,tenantId:tenant.id,role:'REQUESTER',status:'ACTIVE',maintenanceAccess:false,acceptedAt:new Date()}});
        await central.orcaproUserAccess.create({data:{userId,enabled:false,managed:true,updatedByUserId:actor.userId}});
        await central.auditLog.create({data:{tenantId:actor.tenantId,actorUserId:actor.userId,action:'CREATE',entityType:'GcSharedIdentity',entityId:userId,afterData:{operationId:id,maintenanceAccess:false,orcaproAccess:false}}});
        await this.db.transaction(async db=>{await db.query("INSERT INTO GcSaasUser(id,membership_id,tenant_id,user_id,status,billing_source,manual_status,manual_period_end) VALUES(?,?,?,?,'PENDING','MANUAL','TRIALING',?)",[id,member.id,tenant.id,userId,new Date(Date.now()+30*86400000)]);await saasAudit(db,actor,'saas.user.create.request',id,{operationId:id,customerTenantId:tenant.id});});prepared=true;
        return {id,userId,organizationSlug:tenant.slug};
      },{timeout:20000});
      // No distributed transaction: PENDING fails closed until identity commit succeeds.
      await this.db.transaction(async db=>{await db.query("UPDATE GcSaasUser SET status='ACTIVE',updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND status='PENDING'",[id]);await saasAudit(db,actor,'saas.user.create',id,{userId,trialDays:30,sharedIdentity:true});});
      return result;
    }catch(e){
      if(prepared)await saasAudit(this.db as ContractSql,actor,'saas.user.create.failed',id,{operationId:id,provisionPending:true}).catch(()=>undefined);
      if((e as any)?.code==='P2002')throw new ConflictException('E-mail ou organização já cadastrados.');
      if(e instanceof HttpException)throw e;
      throw new ServiceUnavailableException('Cadastro não concluído. Atualize a lista; acesso pendente exige conferência da identidade antes da ativação.');
    }
  }
  async updateAccess(actor:AuthenticatedUser,id:string,dto:GcUserAccessDto){
    reason(dto.reason);await this.access.assertAdmin(actor);
    if(dto.role==='ADMIN'&&!this.access.root(actor))throw new ForbiddenException('Somente o administrador inicial concede administração global do produto.');
    return this.db.transaction(async db=>{const row=await this.target(actor,id,db);checkVersion(row,dto.expectedVersion);
      if(dto.status==='ACTIVE'){const m=await this.primary.tenantMembership.findUnique({where:{id:row.membership_id},select:membershipSelect});if(!eligible(m))throw new BadRequestException('Identidade e vínculo ativos são necessários.');}
      await db.query('UPDATE GcSaasUser SET role=?,status=?,deleted_at=?,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND tenant_id=?',[dto.role,dto.status,dto.status==='DELETED'?new Date():null,id,row.tenant_id]);
      await saasAudit(db,actor,'saas.user.access',id,{before:{role:row.role,status:row.status},after:{role:dto.role,status:dto.status},reason:dto.reason,otherProductsPreserved:true});return {saved:true};
    });
  }
  async sessions(actor:AuthenticatedUser,id:string){const row=await this.target(actor,id,this.db as ContractSql,false);return this.primary.refreshSession.findMany({where:{userId:row.user_id,revokedAt:null,expiresAt:{gt:new Date()}},select:{id:true,createdAt:true,expiresAt:true,userAgent:true,ipAddress:true},orderBy:{createdAt:'desc'},take:100});}
  async identity(actor:AuthenticatedUser,id:string,dto:GcVersionDto,newPassword?:string,acknowledgeShared=false){
    const row=await this.target(actor,id);checkVersion(row,dto.expectedVersion);reason(dto.reason);
    if(row.role==='ADMIN'||row.status==='DELETED')throw new ForbiddenException('Senha e sessões deste perfil devem ser gerenciadas pela própria conta.');
    if(newPassword!==undefined&&(!acknowledgeShared||newPassword.length<10||Buffer.byteLength(newPassword,'utf8')>72))throw new BadRequestException('Confirme o encerramento das sessões e informe uma senha de 10 caracteres a 72 bytes.');
    const kind=newPassword===undefined?'saas.user.revoke':'saas.user.password',operationId=randomUUID(),passwordHash=newPassword===undefined?undefined:await hash(newPassword,12);
    await this.db.transaction(async db=>{const current=await this.target(actor,id,db);checkVersion(current,dto.expectedVersion);await db.query('UPDATE GcSaasUser SET version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND tenant_id=?',[id,row.tenant_id]);await saasAudit(db,actor,kind+'.request',id,{operationId,reason:dto.reason});});
    try{await this.primary.$transaction(async central=>{
      await central.$queryRaw(Prisma.sql`SELECT id FROM User WHERE id=${row.user_id} FOR UPDATE`);
      const m=await central.tenantMembership.findUnique({where:{id:row.membership_id},select:membershipSelect});if(!m||m.user.deletedAt)throw new NotFoundException('Identidade indisponível.');
      if(passwordHash){await central.user.update({where:{id:row.user_id},data:{passwordHash}});await central.accountToken.updateMany({where:{userId:row.user_id,purpose:'PASSWORD_RESET',consumedAt:null},data:{consumedAt:new Date()}});}
      await central.tenantMembership.updateMany({where:{userId:row.user_id},data:{sessionVersion:{increment:1}}});
      await central.refreshSession.updateMany({where:{userId:row.user_id,revokedAt:null},data:{revokedAt:new Date()}});
      await central.auditLog.create({data:{tenantId:actor.tenantId,actorUserId:actor.userId,action:'UPDATE',entityType:'GcSharedIdentity',entityId:row.user_id,afterData:{operationId,kind,sharedLogin:!this.db.production?.(),sessionsRevoked:true}}});
    });}catch(e){await saasAudit(this.db as ContractSql,actor,kind+'.failed',id,{operationId}).catch(()=>undefined);if(e instanceof HttpException)throw e;throw new ServiceUnavailableException('Não foi possível concluir a operação na identidade.');}
    let localAuditPending=false;await saasAudit(this.db as ContractSql,actor,kind,id,{operationId,reason:dto.reason,sharedLogin:!this.db.production?.(),sessionsRevoked:true}).catch(()=>{localAuditPending=true;});
    return {saved:true,localAuditPending,sharedLogin:!this.db.production?.()};
  }
  async subscription(actor:AuthenticatedUser,id:string,dto:GcSubscriptionDto){
    reason(dto.reason);const end=dto.currentPeriodEnd?new Date(dto.currentPeriodEnd):null;
    if(dto.billingSource==='MANUAL'&&['ACTIVE','TRIALING','MANUAL_CONTRACT'].includes(dto.status)&&end&&end<=new Date())throw new BadRequestException('Validade deve estar no futuro.');
    if(dto.billingSource==='MANUAL'&&dto.status==='TRIALING'&&!end)throw new BadRequestException('Teste exige validade.');
    return this.db.transaction(async db=>{const row=await this.target(actor,id,db);checkVersion(row,dto.expectedVersion);
      if(dto.planId&&!(await db.query('SELECT id FROM GcSaasPlan WHERE id=? AND active=TRUE',[dto.planId]))[0])throw new BadRequestException('Plano ativo obrigatório.');
      await db.query('UPDATE GcSaasUser SET billing_source=?,manual_status=?,manual_period_end=?,plan_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND tenant_id=?',[dto.billingSource,dto.billingSource==='MANUAL'?dto.status:null,dto.billingSource==='MANUAL'?end:null,dto.planId||null,id,row.tenant_id]);
      await saasAudit(db,actor,'saas.subscription.manual',id,{billingSource:dto.billingSource,status:dto.status,periodEnd:end?.toISOString(),planId:dto.planId||null,reason:dto.reason,stripeUnchanged:true});return {saved:true};
    });
  }
  async plans(actor?:AuthenticatedUser){if(actor)await this.access.assertAdmin(actor);return (await this.db.query<any[]>('SELECT * FROM GcSaasPlan'+(actor?'':' WHERE active=TRUE')+' ORDER BY active DESC,name')).map(planShape);}
  async savePlan(actor:AuthenticatedUser,dto:GcPlanDto,id?:string){
    await this.access.assertAdmin(actor);if(dto.name.trim().length<2)throw new BadRequestException('Nome do plano obrigatório.');
    if(dto.stripePriceId)await this.billing.validatePrice(dto.stripePriceId,dto.priceBrl,dto.billingInterval);
    try{return await this.db.transaction(async db=>{
      const old=id?(await db.query('SELECT * FROM GcSaasPlan WHERE id=? FOR UPDATE',[id]))[0]:undefined;
      if(id)checkVersion(old,dto.expectedVersion!);
      if(old&&(old.stripe_price_id!==(dto.stripePriceId||null)||!new Prisma.Decimal(old.price_brl).eq(dto.priceBrl)||old.billing_interval!==dto.billingInterval)){
        const used=(await db.query('SELECT id FROM GcSaasUser WHERE plan_id=? LIMIT 1',[id]))[0];
        const checkout=old.stripe_price_id&&(await db.query('SELECT owner_id FROM GcBillingAccount WHERE checkout_price_id=? OR subscription_id IS NOT NULL LIMIT 1',[old.stripe_price_id]))[0];
        if(used||checkout)throw new ConflictException('Plano já utilizado. Crie outro plano para mudar preço, periodicidade ou vínculo Stripe.');
      }
      const key=id||randomUUID();
      if(id)await db.query('UPDATE GcSaasPlan SET code=?,name=?,billing_interval=?,price_brl=?,stripe_price_id=?,active=?,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',[dto.code,dto.name.trim(),dto.billingInterval,dto.priceBrl,dto.stripePriceId||null,dto.active,id]);
      else await db.query('INSERT INTO GcSaasPlan(id,code,name,billing_interval,price_brl,stripe_price_id,active) VALUES(?,?,?,?,?,?,?)',[key,dto.code,dto.name.trim(),dto.billingInterval,dto.priceBrl,dto.stripePriceId||null,dto.active]);
      await saasAudit(db,actor,'saas.plan.save',key,{code:dto.code,priceBrl:dto.priceBrl,billingInterval:dto.billingInterval,active:dto.active});return {id:key};
    });}catch(e){if((e as any)?.code==='ER_DUP_ENTRY')throw new ConflictException('Código ou preço Stripe já cadastrado.');throw e;}
  }
  async settings(actor:AuthenticatedUser){await this.access.assertAdmin(actor);return this.db.query('SELECT name,title,body,published,version,updated_at AS updatedAt FROM GcSaasSetting ORDER BY name');}
  async content(){return this.db.query('SELECT name,title,body,version,updated_at AS updatedAt FROM GcSaasSetting WHERE published=TRUE ORDER BY name');}
  async setting(actor:AuthenticatedUser,name:string,dto:GcSettingDto){
    await this.access.assertAdmin(actor);reason(dto.reason);if(!['privacy','terms','notice'].includes(name))throw new BadRequestException('Seção inválida.');
    return this.db.transaction(async db=>{const old=(await db.query('SELECT version FROM GcSaasSetting WHERE name=? FOR UPDATE',[name]))[0];checkVersion(old,dto.expectedVersion);
      await db.query('UPDATE GcSaasSetting SET title=?,body=?,published=?,version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP(3) WHERE name=?',[dto.title.trim(),dto.body.trim(),dto.published,actor.userId,name]);
      await saasAudit(db,actor,'saas.content.save',name,{published:dto.published,version:old.version+1,reason:dto.reason});return {saved:true};
    });
  }
  async overview(actor:AuthenticatedUser){
    await this.access.assertAdmin(actor);
    const [people,contracts,storage,bytes,events]=await Promise.all([
      this.db.query('SELECT status,COUNT(*) n FROM GcSaasUser GROUP BY status'),
      this.db.query('SELECT demo,COUNT(*) n FROM GcContract WHERE archived_at IS NULL GROUP BY demo'),
      this.db.query('SELECT COALESCE(SUM(size_bytes),0) bytes FROM GcBlob'),
      this.db.query('SELECT COALESCE(SUM(data_length+index_length),0) bytes FROM information_schema.tables WHERE table_schema=DATABASE()'),
      this.db.query('SELECT COUNT(*) n,MAX(processed_at) lastEvent FROM GcBillingEvent')]);
    return {users:people.map((r:any)=>({status:r.status,count:Number(r.n)})),contracts:contracts.map((r:any)=>({demo:!!r.demo,count:Number(r.n)})),privateFilesBytes:String(storage[0].bytes),databaseBytes:String(bytes[0].bytes),stripeEvents:Number(events[0].n),lastStripeEvent:events[0].lastEvent,integration:this.billing.integration(),root:this.access.root(actor)};
  }
  async stripeAction(actor:AuthenticatedUser,id:string,dto:GcStripeActionDto){reason(dto.reason);const row=await this.target(actor,id);return this.billing.adminAction(actor,row,dto);}
}

