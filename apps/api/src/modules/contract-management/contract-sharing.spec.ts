import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ContractAccess } from './contract-access';
import { ContractService } from './contract.service';

const actor:any={userId:'manager',tenantId:'org',email:'qa@example.invalid'};
function accessFixture(role='MANAGER'){
 const roles=new Map([['manager',role],['fiscal','FISCAL']]);
 const query=jest.fn(async(sql:string,args:any[]=[])=>{
  if(sql.startsWith('SELECT c.owner_id'))return args[2]==='org'?[{owner_id:'owner',role:roles.get(args[0])}]:[];
  if(sql.startsWith('SELECT owner_id AS'))return [{userId:'owner',role:'OWNER'}];
  if(sql.startsWith('SELECT owner_id'))return [{owner_id:'owner'}];
  if(sql.startsWith('SELECT role'))return roles.has(args[2])?[{role:roles.get(args[2])}]:[];
  if(sql.startsWith('SELECT user_id'))return [...roles].map(([userId,role])=>({userId,role}));
  if(sql.startsWith('INSERT INTO GcMember'))roles.set(args[2],args[3]);
  return [];
 });
 const db:any={query,transaction:async(fn:any)=>fn({query})};
 const prisma:any={tenantMembership:{findMany:async()=>['owner','manager','fiscal'].map(id=>({user:{id,name:id,email:id+'@example.invalid',status:'ACTIVE'}}))}};
 return {roles,query,access:new ContractAccess(db,prisma,{} as any)};
}

describe('Contract team authorization',()=>{
 it('acknowledges self-revocation without exposing the team after access is removed',async()=>{
  const {access,query}=accessFixture();
  await expect(access.grant(actor,'contract',{userId:actor.userId,role:'REVOKED'})).resolves.toEqual([]);
  await expect(access.members(actor,'contract')).rejects.toBeInstanceOf(NotFoundException);
  expect(query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO GcAdministrativeAudit'))).toHaveLength(1);
 });
 it('lists the permanent owner and refuses all attempts to change their role',async()=>{
  const {access,query}=accessFixture();
  expect(await access.members(actor,'contract')).toEqual(expect.arrayContaining([expect.objectContaining({userId:'owner',role:'OWNER',name:'owner'})]));
  for(const role of ['READER','REVOKED'] as const)await expect(access.grant(actor,'contract',{userId:'owner',role})).rejects.toBeInstanceOf(BadRequestException);
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
 it.each(['FISCAL','READER'])('%s cannot change the contract team',async role=>{
  const {access,query}=accessFixture(role);
  await expect(access.grant(actor,'contract',{userId:'fiscal',role:'MANAGER'})).rejects.toBeInstanceOf(ForbiddenException);
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
 it('rejects foreign-organization members before any mutation',async()=>{
  const {access,query}=accessFixture();
  await expect(access.grant(actor,'contract',{userId:'outside',role:'READER'})).rejects.toBeInstanceOf(ForbiddenException);
  await expect(access.members({...actor,tenantId:'other'},'contract')).rejects.toBeInstanceOf(NotFoundException);
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
 it('rechecks the current role inside the transaction if another manager revoked it',async()=>{
  const {access,query,roles}=accessFixture();
  jest.spyOn(access,'candidates').mockImplementation(async()=>{roles.set(actor.userId,'REVOKED');return [{id:'fiscal',name:'Fiscal',email:'fiscal@example.invalid'}];});
  await expect(access.grant(actor,'contract',{userId:'fiscal',role:'MANAGER'})).rejects.toBeInstanceOf(NotFoundException);
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
});

describe('Per-bulletin approval presentation',()=>{
 it.each([
  ['OWNER','manager',false,true],['MANAGER','manager',false,false],['FISCAL','manager',false,false],
  ['MANAGER','another',false,true],['FISCAL','another',false,true],
  ['READER','another',false,false],['MANAGER','manager',true,true],
 ])('role %s, author %s and demo %s give approval %s',async(role,author,demo,canApprove)=>{
  const baseline={regime:'UNIT_PRICE',originalValue:'100',paradigmOriginal:'100',events:[],items:[{id:'i',code:'1',description:'Service',unit:'UN',originalQuantity:'10',quantity:'10',unitPrice:'10',referencePrice:'10',originalTotal:'100',measured:'0'}]};
  const row={id:'c',owner_id:role==='OWNER'?actor.userId:'owner',baseline,version:2,demo,regime:'UNIT_PRICE'};
  const draft={id:'draft',kind:'measurement',actor_id:author,payload:{title:'Medição',period:'2026-11',executionDate:'2026-11-10',evidence:'Conferência',lines:[{itemId:'i',quantity:'1'}]}};
  const query=jest.fn(async(sql:string)=>sql.startsWith('SELECT c.')?[row]:sql.startsWith('SELECT id,version')?[draft]:[]);
  const service=new ContractService({query} as any,{} as any,{} as any,{} as any,{role:async()=>role==='OWNER'?'MANAGER':role} as any);
  expect((await service.detail(actor,'c')).measurements[0]).toMatchObject({createdBy:author,canApprove});
 });
});
