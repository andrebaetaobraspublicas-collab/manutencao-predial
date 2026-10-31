import { BadRequestException, CanActivate, ConflictException, ExecutionContext, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MailDeliveryError, MailService, TransactionalEmail } from '../../common/mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { InfraDatabase } from '../infraestrutura/infra-db';
import { subscriptionAllowsAccess } from '../orcapro/orcapro-entitlement';
import { BulletinConfirmDto, BulletinDraftDto } from './bulletins.dto';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export const emailHash=(email:string)=>digest(email.trim().toLowerCase());
export const productLabel=(products:string[])=>products.map(p=>p==='INFRA'?'OrçaPro Infraestrutura':'OrçaPro').join(' e ');
export function bulletinEnvironment(config:ConfigService){return config.get('SYSTEM_BULLETINS_ENABLED')==='true'&&['https://gestaodepredios.com.br','https://www.gestaodepredios.com.br'].includes(config.get('WEB_BASE_URL')??'');}
@Injectable()
export class BulletinGuard implements CanActivate {
 constructor(private readonly config:ConfigService){}
 canActivate(context:ExecutionContext){
  if(!bulletinEnvironment(this.config))throw new NotFoundException();
  const req=context.switchToHttp().getRequest(),u=req.user as AuthenticatedUser;
  const ids=(this.config.get<string>('ORCAPRO_ADMIN_USER_IDS')??'').split(',').map(v=>v.trim());
  if(!u?.tenantId||!ids.includes(u.userId))throw new ForbiddenException('Informativos restritos à administração global do SaaS.');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!(this.config.get<string>('CORS_ORIGINS')??'').split(',').map(v=>v.trim()).includes(req.headers.origin))throw new ForbiddenException('Origem da operação não autorizada.');
  req.res?.setHeader('Cache-Control','no-store');return true;
 }
}
type Recipient={id:string;email:string;hash:string;active:boolean;products:string[]};
@Injectable()
export class BulletinsService implements OnApplicationBootstrap,OnModuleDestroy {
 private timer?:NodeJS.Timeout;private running=false;private readonly logger=new Logger(BulletinsService.name);
 constructor(private readonly db:PrismaService,private readonly infra:InfraDatabase,private readonly config:ConfigService,private readonly mail:MailService){}
 onApplicationBootstrap(){if(bulletinEnvironment(this.config)){this.timer=setInterval(()=>void this.process().catch(()=>this.logger.error('Fila de informativos temporariamente indisponível.')),5000);this.timer.unref();}}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 private requireMail(){if(!this.mail.isConfigured())throw new BadRequestException('Configure o provedor de e-mail e o remetente antes de enviar. Nenhum envio foi realizado.');}
 async audience(products:string[],filter:string){
  // This is the platform administrator's shared account directory, not tenant operational data.
  const users=await this.db.user.findMany({where:{deletedAt:null},take:10001,orderBy:{id:'asc'},select:{id:true,email:true,status:true,orcaproAccess:true,orcaproSubscription:true,memberships:{select:{tenantId:true,status:true,tenant:{select:{deletedAt:true}}}},_count:{select:{orcaproProjects:true}}}});
  if(users.length>10000)throw new BadRequestException('Diretório excede o lote máximo de 10.000 contas.');
  const profiles=products.includes('INFRA')?await this.infra.query<{user_id:string;tenant_id:string;status:string;deleted_at:Date|null}[]>('SELECT external_user_id AS user_id,tenant_id,status,deleted_at FROM InfraUser'):[];
  const byId=new Map<string,{active:boolean}>();for(const p of profiles.filter(p=>!p.deleted_at)){const owner=users.find(u=>u.id===p.user_id);const active=p.status==='ACTIVE'&&!!owner?.memberships.some(m=>m.tenantId===p.tenant_id&&m.status==='ACTIVE'&&!m.tenant.deletedAt);byId.set(p.user_id,{active:active||byId.get(p.user_id)?.active===true});}
  const blocked=new Set((await this.db.notificationPreference.findMany({where:{emailEnabled:false,userId:{in:users.map(u=>u.id)}},select:{userId:true}})).map(p=>p.userId));
  const admins=(this.config.get<string>('ORCAPRO_ADMIN_USER_IDS')??'').split(',');
  const result=new Map<string,Recipient>();let excludedPreferences=0;
  for(const u of users){
   const sharedActive=u.status==='ACTIVE'&&u.memberships.some(m=>m.status==='ACTIVE'&&!m.tenant.deletedAt);
   const selected:{product:string;active:boolean}[]=[];const grant=u.orcaproAccess;
   if(products.includes('ORCAPRO')&&!grant?.deletedAt&&(grant||u.orcaproSubscription||u._count.orcaproProjects||admins.includes(u.id)))selected.push({product:'ORCAPRO',active:sharedActive&&grant?.enabled!==false&&(admins.includes(u.id)||subscriptionAllowsAccess(u.orcaproSubscription,grant?.managed===true))});
   const profile=byId.get(u.id);if(products.includes('INFRA')&&profile)selected.push({product:'INFRA',active:sharedActive&&profile.active});
   const match=selected.filter(s=>filter==='ALL'||(filter==='ACTIVE'?s.active:!s.active));if(!match.length)continue;
   if(blocked.has(u.id)){excludedPreferences++;continue;}
   const email=u.email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))continue;
   const previous=result.get(email);if(previous){previous.products=[...new Set([...previous.products,...match.map(m=>m.product)])].sort();continue;}
   result.set(email,{id:u.id,email,hash:emailHash(email),active:sharedActive,products:match.map(m=>m.product).sort()});
  }
  const recipients=[...result.values()].sort((a,b)=>a.id.localeCompare(b.id));return{recipients,excludedPreferences,hash:digest(JSON.stringify(recipients.map(r=>[r.id,r.hash,r.products])))};
 }
 private content(b:{products:unknown;subject:string;body:string},to:string):TransactionalEmail {const products=b.products as string[];return{to,subject:b.subject,heading:`Informativo — ${productLabel(products)}`,message:b.body,brand:productLabel(products)};}
 private audit(actor:AuthenticatedUser,action:string,id:string,metadata:object){return this.db.orcaproAudit.create({data:{tenantId:actor.tenantId,actorUserId:actor.userId,action,entityId:id,metadata:metadata as Prisma.InputJsonValue}});}
 private async owned(actor:AuthenticatedUser,id:string){const b=await this.db.systemBulletin.findFirst({where:{id,tenantId:actor.tenantId}});if(!b)throw new NotFoundException();return b;}
 async preview(actor:AuthenticatedUser,dto:BulletinDraftDto){
  if(dto.subject.trim().length<3||dto.body.trim().length<10)throw new BadRequestException('Preencha o assunto e o conteúdo.');
  const a=await this.audience(dto.products,dto.accountStatus);const b=await this.db.systemBulletin.create({data:{tenantId:actor.tenantId,actorUserId:actor.userId,actorName:actor.name,subject:dto.subject.trim(),body:dto.body.trim(),products:[...dto.products].sort(),accountStatus:dto.accountStatus,audienceHash:a.hash,recipientCount:a.recipients.length}});
  await this.audit(actor,'bulletin.preview',b.id,{products:dto.products,count:a.recipients.length});
  return{...b,excludedPreferences:a.excludedPreferences,email:this.mail.preview(this.content(b,actor.email)),mailConfigured:this.mail.isConfigured()};
 }
 async test(actor:AuthenticatedUser,id:string){
  this.requireMail();const b=await this.owned(actor,id);if(b.status!=='DRAFT')throw new ConflictException('Crie uma nova prévia para testar.');
  const admin=await this.db.user.findFirst({where:{id:actor.userId,deletedAt:null,status:'ACTIVE'},select:{email:true}});if(!admin)throw new ForbiddenException();
  const stamp=new Date();const claimed=await this.db.systemBulletin.updateMany({where:{id,tenantId:actor.tenantId,OR:[{lastTestAt:null},{lastTestAt:{lt:new Date(Date.now()-60000)}}]},data:{lastTestAt:stamp}});if(!claimed.count)throw new BadRequestException('Aguarde um minuto antes de outro teste.');
  const result=await this.mail.sendEmail({...this.content(b,admin.email),subject:'[TESTE] '+b.subject,idempotencyKey:`bulletin-test/${id}/${stamp.toISOString()}`});
  if(result.development)throw new BadRequestException('O provedor não confirmou o envio real.');await this.audit(actor,'bulletin.test',id,{result:'ACCEPTED'});return{accepted:true};
 }
 async confirm(actor:AuthenticatedUser,id:string,dto:BulletinConfirmDto){
  this.requireMail();const b=await this.owned(actor,id);if(b.status!=='DRAFT')return{id:b.id,status:b.status,recipientCount:b.recipientCount};
  if(dto.confirmation!=='ENVIAR INFORMATIVO')throw new BadRequestException('Confirmação explícita obrigatória.');
  const a=await this.audience(b.products as string[],b.accountStatus);if(dto.audienceHash!==b.audienceHash||a.hash!==b.audienceHash)throw new ConflictException('Os destinatários mudaram. Gere uma nova prévia e confirme novamente.');if(!a.recipients.length)throw new BadRequestException('Nenhum destinatário elegível.');
  return this.db.$transaction(async tx=>{const claim=await tx.systemBulletin.updateMany({where:{id,tenantId:actor.tenantId,status:'DRAFT'},data:{status:'QUEUED',confirmedAt:new Date()}});if(!claim.count)return{id,status:'QUEUED'};
   await tx.systemBulletinDelivery.createMany({data:a.recipients.map(r=>({bulletinId:id,userId:r.id,emailHash:r.hash}))});
   await tx.orcaproAudit.create({data:{tenantId:actor.tenantId,actorUserId:actor.userId,action:'bulletin.confirm',entityId:id,metadata:{count:a.recipients.length,products:b.products} as Prisma.InputJsonValue}});return{id,status:'QUEUED',recipientCount:a.recipients.length};});
 }
 async history(actor:AuthenticatedUser,page=1){const where={tenantId:actor.tenantId};const [items,total]=await Promise.all([this.db.systemBulletin.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*20,take:20,select:{id:true,subject:true,actorName:true,products:true,accountStatus:true,status:true,createdAt:true,confirmedAt:true,completedAt:true,recipientCount:true}}),this.db.systemBulletin.count({where})]);
  return{items:await Promise.all(items.map(async b=>({...b,results:await this.db.systemBulletinDelivery.groupBy({by:['status','errorCode'],where:{bulletinId:b.id},_count:{_all:true}})}))),total,page};}
 async process(){
  if(this.running||!bulletinEnvironment(this.config)||!this.mail.isConfigured())return;this.running=true;
  try{const campaigns=await this.db.systemBulletin.findMany({where:{status:{in:['QUEUED','SENDING']}},orderBy:{createdAt:'asc'},take:3});
   for(const b of campaigns){
    const candidates=await this.db.systemBulletinDelivery.findMany({where:{bulletinId:b.id,OR:[{status:'PENDING',availableAt:{lte:new Date()}},{status:'PROCESSING',leaseUntil:{lt:new Date()}}]},take:3,orderBy:{id:'asc'}});
    const a=await this.audience(b.products as string[],b.accountStatus);const eligible=new Map(a.recipients.map(r=>[r.id,r]));
    for(const row of candidates){const now=new Date();const claim=await this.db.systemBulletinDelivery.updateMany({where:{id:row.id,status:row.status,attempts:row.attempts,...(row.status==='PROCESSING'?{leaseUntil:{lt:now}}:{})},data:{status:'PROCESSING',attempts:{increment:1},leaseUntil:new Date(Date.now()+120000)}});if(!claim.count)continue;
     const recipient=eligible.get(row.userId);let status='SKIPPED',errorCode:string|null=null,providerMessageId:string|null=null;
     if(!recipient||recipient.hash!==row.emailHash)errorCode='ELIGIBILITY_CHANGED';
     else if(this.mail.provider()==='smtp'&&row.status==='PROCESSING'&&row.attempts>0)errorCode='SMTP_ACCEPTANCE_UNCERTAIN';
     else if(row.attempts>=3||!b.confirmedAt||Date.now()-b.confirmedAt.getTime()>23*3600000)errorCode='RETRY_WINDOW_EXPIRED';
     else try{const result=await this.mail.sendEmail({...this.content(b,recipient.email),idempotencyKey:`bulletin/${row.id}`});status=result.development?'FAILED':'SENT';providerMessageId=result.providerMessageId??null;errorCode=result.development?'PROVIDER_NOT_CONFIGURED':null;}
     catch(e){const retry=e instanceof MailDeliveryError&&e.retryable&&row.attempts<2;status=retry?'PENDING':'FAILED';errorCode=e instanceof MailDeliveryError?`PROVIDER_${e.providerStatus??'NETWORK'}`:'DELIVERY_FAILED';}
     await this.db.systemBulletinDelivery.update({where:{id:row.id},data:{status,errorCode,providerMessageId,leaseUntil:null,availableAt:new Date(Date.now()+60000),processedAt:['SENT','FAILED','SKIPPED'].includes(status)?new Date():null}});
     await new Promise(resolve=>setTimeout(resolve,700));
    }
    const pending=await this.db.systemBulletinDelivery.count({where:{bulletinId:b.id,status:{in:['PENDING','PROCESSING']}}});const failures=await this.db.systemBulletinDelivery.count({where:{bulletinId:b.id,status:{in:['FAILED','SKIPPED']}}});
    await this.db.systemBulletin.update({where:{id:b.id},data:{status:pending?'SENDING':failures?'PARTIAL':'COMPLETED',completedAt:pending?null:new Date()}});
   }
  }finally{this.running=false;}
 }
}
