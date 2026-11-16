import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ContractDatabase, ContractSql } from './contract-db';
import { randomUUID } from 'node:crypto';
export type ContractRole='MANAGER'|'FISCAL'|'READER';
@Injectable()
export class ContractAccess {
 constructor(private readonly db:ContractDatabase,private readonly prisma:PrismaService,private readonly config:ConfigService,@Optional() @Inject('GESTAO_BILLING') private readonly billing?:{allowedContract(user:AuthenticatedUser,id:string,db?:ContractSql):Promise<boolean>}){}
 licensed(u:AuthenticatedUser,id:string,db?:ContractSql){return this.billing?this.billing.allowedContract(u,id,db):Promise.resolve(true);}
 admin(u:AuthenticatedUser){return u.email.toLowerCase()===String(this.config.get('GESTAO_ADMIN_EMAIL') || '').trim().toLowerCase()&&String(this.config.get('GESTAO_ADMIN_USER_IDS')||'').split(',').map(x=>x.trim()).includes(u.userId);}
 async role(u:AuthenticatedUser,id:string,db:ContractSql=this.db as ContractSql):Promise<ContractRole>{
  const rows=await db.query('SELECT c.owner_id,m.role FROM GcContract c LEFT JOIN GcMember m ON m.contract_id=c.id AND m.tenant_id=c.tenant_id AND m.user_id=? WHERE c.id=? AND c.tenant_id=? AND c.archived_at IS NULL'+(db!==this.db?' FOR UPDATE':''),[u.userId,id,u.tenantId]);
  if(!rows[0]||(rows[0].owner_id!==u.userId&&!['MANAGER','FISCAL','READER'].includes(rows[0].role))||!(await this.licensed(u,id,db)))throw new NotFoundException('Contrato não encontrado ou acesso contratual não habilitado nesta organização.');return rows[0].owner_id===u.userId?'MANAGER':rows[0].role;
 }
 async require(u:AuthenticatedUser,id:string,roles:ContractRole[],db?:ContractSql){const role=await this.role(u,id,db);if(!roles.includes(role))throw new ForbiddenException('Seu papel neste contrato não permite esta operação.');return role;}
 async candidates(u:AuthenticatedUser){const rows=await this.prisma.tenantMembership.findMany({where:{tenantId:u.tenantId,status:'ACTIVE',user:{deletedAt:null},OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{user:{select:{id:true,name:true,email:true,status:true}}},take:500});return rows.filter(r=>r.user.status==='ACTIVE').map(r=>({id:r.user.id,name:r.user.name,email:r.user.email}));}
 async members(u:AuthenticatedUser,id:string){
  await this.role(u,id);
  const owner=await this.db.query<any[]>("SELECT owner_id AS userId,'OWNER' AS role FROM GcContract WHERE id=? AND tenant_id=? AND archived_at IS NULL",[id,u.tenantId]);
  const rows=await this.db.query<any[]>('SELECT user_id AS userId,role,granted_by AS grantedBy,updated_at AS updatedAt FROM GcMember WHERE contract_id=? AND tenant_id=?',[id,u.tenantId]);
  const candidates=await this.candidates(u);
  return [...owner,...rows.filter(r=>r.userId!==owner[0]?.userId)].map(r=>({...r,...candidates.find(c=>c.id===r.userId)}));
 }
 async grant(u:AuthenticatedUser,id:string,body:{userId:string;role:ContractRole|'REVOKED'}){
  await this.require(u,id,['MANAGER']);if(!['MANAGER','FISCAL','READER','REVOKED'].includes(body.role))throw new ForbiddenException('Papel inválido.');
  if(body.role!=='REVOKED'&&!(await this.candidates(u)).some(c=>c.id===body.userId))throw new ForbiddenException('Usuário ativo da mesma organização obrigatório.');
  await this.db.transaction(async db=>{await this.require(u,id,['MANAGER'],db);const contract=await db.query('SELECT owner_id FROM GcContract WHERE id=? AND tenant_id=? FOR UPDATE',[id,u.tenantId]);if(contract[0]?.owner_id===body.userId)throw new BadRequestException('O proprietário mantém a responsabilidade de gestor do contrato.');if(body.role==='REVOKED'){const prior=await db.query('SELECT role FROM GcMember WHERE contract_id=? AND tenant_id=? AND user_id=?',[id,u.tenantId,body.userId]);if(!prior[0])throw new NotFoundException('Membro não encontrado.');}await db.query('INSERT INTO GcMember(contract_id,tenant_id,user_id,role,granted_by) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role),granted_by=VALUES(granted_by),updated_at=CURRENT_TIMESTAMP(3)',[id,u.tenantId,body.userId,body.role,u.userId]);await db.query('INSERT INTO GcAdministrativeAudit(id,contract_id,tenant_id,actor_id,kind,details) VALUES(?,?,?,?,?,?)',[randomUUID(),id,u.tenantId,u.userId,'member.role',JSON.stringify(body)]);});
  // The mutation committed successfully; do not re-read a team the caller can no longer access.
  if(body.userId===u.userId&&body.role==='REVOKED')return [];
  return this.members(u,id);
 }
}
