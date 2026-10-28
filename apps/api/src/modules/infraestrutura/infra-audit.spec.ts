import { ForbiddenException, NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom, of, throwError } from 'rxjs';
import { InfraAuditService } from './infra-audit.service';
import { InfraAuditInterceptor } from './infra-audit.interceptor';
import { InfraDatabase } from './infra-db';
import { InfraAccess } from './infra.guard';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const user = { userId: 'actor',tenantId: 'tenant' } as AuthenticatedUser;
function setup(admin=true) {
  const query = jest.fn(async(sql: string)=>{
    if(sql.startsWith('SELECT external_user_id'))return [{id:'historical',name:'Older account',email:'old@example.test'}];
    if(sql.startsWith('SELECT COUNT'))return [{total:101n}];
    if(sql.startsWith('SELECT a.id'))return [{id:'event',tenantId:'another-tenant',actorUserId:'historical',entity:'project',entityId:'project',action:'project.save',createdAt:new Date(),payload:JSON.stringify({version:7,password:'PRIVATE',data:{private:true}})}];
    if(sql.startsWith('SELECT id,name'))return [{id:'project',name:'Ponte'}];
    return [];
  });
  const db = {query,transaction:jest.fn((fn: (tx: {query:typeof query})=>unknown)=>fn({query}))};
  const primary = {$queryRaw:jest.fn().mockResolvedValue([{id:'historical'}]),user:{findMany:jest.fn().mockResolvedValue([{id:'historical',name:'Older account',email:'old@example.test'}])}};
  const access = {principal:jest.fn().mockResolvedValue({role:admin?'ADMIN':'USER',status:'ACTIVE'}),configuredAdmin:jest.fn().mockReturnValue(false)};
  return {db,primary,access,service:new InfraAuditService(db as unknown as InfraDatabase,primary as unknown as PrismaService,access as unknown as InfraAccess)};
}
describe('Infraestrutura detailed audit',()=>{
  it('paginates all historical rows, clamps the last page and resolves historical identities and project names',async()=>{
    const {service,db,primary}=setup();
    const result=await service.logs(user,{page:999,pageSize:50,category:'activity',user:'Old%_=',from:'2026-10-15',to:'2026-10-16'});
    expect(result).toMatchObject({total:101,pages:3,page:3,items:[{actor:{name:'Older account'},entityName:'Ponte',metadata:{version:7},payload:{version:7}}]});
    const count=db.query.mock.calls.find(c=>c[0].startsWith('SELECT COUNT')) as unknown as [string,unknown[]];
    const rows=db.query.mock.calls.find(c=>c[0].startsWith('SELECT a.id')) as unknown as [string,unknown[]];
    expect(rows[0]).toContain('ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?');
    expect(rows[1]).toEqual([...count[1],50,100]);
    expect(count[1]).toEqual(expect.arrayContaining(['historical',new Date('2026-10-15T03:00:00Z'),new Date('2026-10-17T03:00:00Z'),'access.login','access.request.failed']));
    expect(primary.$queryRaw.mock.calls[0][0].values).toEqual(['Old%_=','Old%_=']);
    expect(primary.$queryRaw.mock.calls[0][0].sql).toContain('CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci');
    expect(db.query.mock.calls.every(c=>c[0].startsWith('SELECT'))).toBe(true);
  });
  it('denies non-admins before cross-tenant identity or audit queries',async()=>{
    const {service,db,primary}=setup(false);
    await expect(service.logs(user,{page:1,pageSize:50,category:'all'})).rejects.toThrow(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();expect(primary.$queryRaw).not.toHaveBeenCalled();
  });
  it('filters failures and includes no arbitrary SQL from a user search',async()=>{
    const {service,db,primary}=setup();primary.$queryRaw.mockResolvedValue([]);
    db.query.mockImplementation(async(sql:string)=>sql.startsWith('SELECT COUNT')?[{total:0n}]:[]);
    const result=await service.logs(user,{page:2,pageSize:20,category:'failure',user:"' OR 1=1 --"});
    expect(result).toMatchObject({total:0,page:1,pages:1,items:[]});
    const calls=db.query.mock.calls as unknown as [string,unknown[]][];
    expect(calls.find(c=>c[0].startsWith('SELECT COUNT'))?.[0]).toContain('1=0');
    expect(calls.every(c=>!c[0].includes("' OR 1=1 --"))).toBe(true);
  });
  it('rejects reversed periods and a navigation event for another user/tenant project',async()=>{
    const {service,db}=setup();
    await expect(service.logs(user,{page:1,pageSize:50,category:'all',from:'2026-10-16',to:'2026-10-15'})).rejects.toThrow();
    await expect(service.navigation(user,{screen:'budget',projectId:'other-project'})).rejects.toThrow(NotFoundException);
    expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('tenant_id=? AND user_id=?'),['other-project','tenant','actor']);
    expect(db.query.mock.calls.some(c=>c[0].startsWith('INSERT'))).toBe(false);
  });
  it('redacts sensitive details when writing and does not fail a successful operation if logging is unavailable',async()=>{
    const {service,db}=setup();
    await service.record(user,'access.request','access','project',{password:'PRIVATE',route:'/infraestrutura/projects/:id',details:{token:'SECRET',version:2}});
    const params=(db.query.mock.calls.at(-1) as unknown as [string,unknown[]])[1];expect(params[1]).toBe('tenant');expect(params[2]).toBe('actor');
    expect(JSON.parse(String(params[6]))).toEqual({route:'/infraestrutura/projects/:id',details:{version:2}});
    db.query.mockRejectedValueOnce(new Error('Database offline') as never);
    await expect(service.record(user,'access.request','access','project')).resolves.toBeUndefined();
  });
});

function interceptorFixture(path:string,actor:AuthenticatedUser|null=user,commercial=false) {
  const record=jest.fn().mockResolvedValue(undefined),query=jest.fn().mockResolvedValue([{id:'profile'}]);
  const primary={refreshSession:{findUnique:jest.fn().mockResolvedValue({userId:'actor',revokedAt:null,membership:{tenantId:'tenant'}})}};
  const interceptor=new InfraAuditInterceptor({record} as unknown as InfraAuditService,{query} as unknown as InfraDatabase,primary as unknown as PrismaService,new ConfigService({INFRA_ENABLED:'true',INFRA_COMMERCIAL:String(commercial)}));
  const req={path,method:'POST',params:{id:'project'},user:actor ?? undefined,route:{path:'/infraestrutura/projects/:id'},ip:'192.0.2.1',get:()=> 'Fixture browser',body:{password:'PRIVATE'},query:{secret:'PRIVATE'},cookies:{gp_refresh:'PRIVATE_REFRESH'}};
  const context={getType:()=> 'http',switchToHttp:()=>({getRequest:()=>req,getResponse:()=>({statusCode:200})})} as unknown as ExecutionContext;
  return {record,query,primary,interceptor,context};
}
describe('Infraestrutura access capture',()=>{
  it('records successful access without request bodies, queries, tokens or cookies',async()=>{
    const f=interceptorFixture('/api/v1/infraestrutura/projects/project');
    await expect(lastValueFrom(f.interceptor.intercept(f.context,{handle:()=>of({ok:true})}))).resolves.toEqual({ok:true});
    expect(f.record).toHaveBeenCalledWith(user,'access.request','access','project',expect.objectContaining({method:'POST',status:200,ip:'192.0.2.1'}));
    expect(JSON.stringify(f.record.mock.calls)).not.toContain('PRIVATE');
  });
  it('records anonymous dedicated login failures and propagates the original status',async()=>{
    const f=interceptorFixture('/api/v1/infraestrutura/auth/login',null);
    await expect(lastValueFrom(f.interceptor.intercept(f.context,{handle:()=>throwError(()=>new UnauthorizedException())}))).rejects.toThrow(UnauthorizedException);
    expect(f.record).toHaveBeenCalledWith(undefined,'access.login.failed','access','project',expect.objectContaining({status:401}));
  });
  it.each(['/api/v1/infraestrutura/admin/audit','/api/v1/infraestrutura/activity/navigation','/api/v1/infraestrutura/health'])('does not create feedback events for %s',async path=>{
    const f=interceptorFixture(path);await lastValueFrom(f.interceptor.intercept(f.context,{handle:()=>of({items:[]})}));expect(f.record).not.toHaveBeenCalled();expect(f.query).not.toHaveBeenCalled();
  });
  it('does not copy unrelated shared logins into the development Infra audit',async()=>{
    const f=interceptorFixture('/api/v1/auth/login',null);f.query.mockResolvedValue([]);
    await lastValueFrom(f.interceptor.intercept(f.context,{handle:()=>of({user})}));expect(f.record).not.toHaveBeenCalled();
  });
  it('records shared logout against its verified session without storing its refresh token',async()=>{
    const f=interceptorFixture('/api/v1/auth/logout',null);
    await lastValueFrom(f.interceptor.intercept(f.context,{handle:()=>of(undefined)}));
    expect(f.primary.refreshSession.findUnique.mock.calls[0][0]).toEqual(expect.objectContaining({where:{tokenHash:expect.stringMatching(/^[a-f0-9]{64}$/)}}));
    expect(f.record.mock.calls[0][1]).toBe('access.logout');expect(JSON.stringify(f.record.mock.calls)).not.toContain('PRIVATE_REFRESH');
  });
});
