import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';
import { GestaoLoginGuard } from './gestao-login.guard';
import { canUseIndependentIdentity } from './product-session';

describe('Gestão independent development login',()=>{
 const config=(overrides:any={})=>new ConfigService({GESTAO_ENABLED:'true',WEB_BASE_URL:'https://gestaodepredios.com.br',CORS_ORIGINS:'https://gestaodepredios.com.br',...overrides});
 it('blocks production before looking up identity',async()=>{
  const prisma:any={user:{findUnique:jest.fn()}},service=new AuthService(prisma,{} as any,config({WEB_BASE_URL:'https://sistema.orcaproobras.com.br'}),{} as any,{} as any);
  await expect(service.loginGestao({email:'a@example.test',password:'fixture'},{} as any)).rejects.toThrow();expect(prisma.user.findUnique).not.toHaveBeenCalled();
 });
 it('uses existing active membership without changing other product permissions',async()=>{
  const identity={id:'user-a',status:'ACTIVE',deletedAt:null,passwordHash:await hash('test-password',4),orcaproSubscription:{tenantId:'licensed-tenant'}};
  const membership={id:'m',userId:'user-a',tenantId:'licensed-tenant',maintenanceAccess:false,tenant:{id:'licensed-tenant',status:'CANCELED'}};
  const prisma:any={user:{findUnique:jest.fn().mockResolvedValue(identity),update:jest.fn()},tenantMembership:{findFirst:jest.fn().mockResolvedValue(membership)}};
  const service=new AuthService(prisma,{} as any,config(),{} as any,{} as any),issue=jest.spyOn(service as any,'issueSession').mockResolvedValue({user:{maintenanceAccess:false}});
  await service.loginGestao({email:' A@EXAMPLE.TEST ',password:'test-password'},{} as any);
  expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{email:'a@example.test'}}));
  expect(prisma.tenantMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({tenantId:'licensed-tenant',userId:'user-a',status:'ACTIVE'})}));
  expect(prisma.user.update).toHaveBeenCalledWith({where:{id:'user-a'},data:{lastLoginAt:expect.any(Date)}});expect(issue).toHaveBeenCalledWith(identity,membership,membership.tenant,{});
 });
 it('rejects invalid credentials without issuing a session',async()=>{
  const prisma:any={user:{findUnique:jest.fn().mockResolvedValue({id:'user-a',status:'ACTIVE',passwordHash:await hash('other-password',4)})},tenantMembership:{findFirst:jest.fn()}};
  const service=new AuthService(prisma,{} as any,config(),{} as any,{} as any);
  await expect(service.loginGestao({email:'a@example.test',password:'wrong'},{} as any)).rejects.toThrow();expect(prisma.tenantMembership.findFirst).not.toHaveBeenCalled();
 });
 it('separates identity from maintenance billing only on development',async()=>{
  const prisma:any={};expect(await canUseIndependentIdentity('user-a',prisma,config())).toBe(true);
  expect(await canUseIndependentIdentity('user-a',prisma,config({WEB_BASE_URL:'https://sistema.orcaproobras.com.br',ORCAPRO_ENABLED:'false'}))).toBe(false);
 });
 it('rejects cross-site login and rate limits password attempts',()=>{
  const guard=new GestaoLoginGuard(config()),ctx=(origin:string)=>({switchToHttp:()=>({getRequest:()=>({headers:{origin},ip:'test-ip'})})}) as any;
  expect(()=>guard.canActivate(ctx('https://foreign.example'))).toThrow();for(let i=0;i<10;i++)expect(guard.canActivate(ctx('https://gestaodepredios.com.br'))).toBe(true);
  expect(()=>guard.canActivate(ctx('https://gestaodepredios.com.br'))).toThrow('Muitas tentativas');
 });
});
