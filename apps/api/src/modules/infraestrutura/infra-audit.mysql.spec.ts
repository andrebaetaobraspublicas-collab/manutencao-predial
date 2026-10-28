import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InfraAuditService } from './infra-audit.service';
import { InfraDatabase } from './infra-db';
import { InfraAccess } from './infra.guard';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const supplied=process.env.INFRA_TEST_DATABASE_URL,suite=supplied?describe:describe.skip;
suite('Infraestrutura audit on isolated MySQL',()=>{
  let db:InfraDatabase,service:InfraAuditService;const actor=randomUUID(),tenant=randomUUID(),ids:string[]=[];
  const user={userId:actor,tenantId:tenant} as AuthenticatedUser;
  beforeAll(async()=>{
    if(!supplied||!new URL(supplied).pathname.includes('test'))throw Error('An isolated test database is required');
    db=new InfraDatabase(new ConfigService({INFRA_ENABLED:'true',INFRA_DATABASE_URL:supplied}));
    const sql=await readFile(join(__dirname,'../../../infraestrutura-migrations/001_infraestrutura.sql'),'utf8');
    for(const statement of sql.replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(s=>/^CREATE TABLE (InfraAudit|InfraUser)\s/.test(s)))await db.query(statement.replace('CREATE TABLE ','CREATE TABLE IF NOT EXISTS '));
    const primary={ $queryRaw:jest.fn().mockResolvedValue([{id:actor}]),user:{findMany:jest.fn().mockResolvedValue([{id:actor,name:'Responsável histórico',email:'history@example.test'}])} };
    const access={principal:jest.fn().mockResolvedValue({role:'ADMIN',status:'ACTIVE'}),configuredAdmin:()=>false};
    service=new InfraAuditService(db,primary as unknown as PrismaService,access as unknown as InfraAccess);
    for(const [time,action]of [['2026-10-15 02:59:59.999','access.login'],['2026-10-15 03:00:00.000','project.save'],['2026-10-16 02:59:59.999','access.request.failed'],['2026-10-16 03:00:00.000','project.archive']]){
      const id=randomUUID();ids.push(id);await db.query('INSERT INTO InfraAudit(id,tenant_id,user_id,action,entity,entity_id,payload,created_at) VALUES(?,?,?,?,?,?,?,?)',[id,tenant,actor,action,'project','unavailable-project',JSON.stringify({version:1,password:'DO NOT RETURN'}),time]);
    }
  },30000);
  afterAll(async()=>{if(db){if(ids.length)await db.query('DELETE FROM InfraAudit WHERE id IN ('+ids.map(()=>'?').join(',')+')',ids);await db.onModuleDestroy();}});
  it('uses the full Brazilian day and the same count/page predicates on real MySQL',async()=>{
    const result=await service.logs(user,{user:'Responsável',from:'2026-10-15',to:'2026-10-15',category:'all',page:1,pageSize:1});
    expect(result.total).toBe(2);expect(result.pages).toBe(2);expect(result.items[0].action).toBe('access.request.failed');
    expect(result.items[0].actor?.name).toBe('Responsável histórico');expect(result.items[0].metadata).toEqual({version:1});
    const last=await service.logs(user,{user:'Responsável',from:'2026-10-15',to:'2026-10-15',category:'all',page:99,pageSize:1});
    expect(last.page).toBe(2);expect(last.items[0].action).toBe('project.save');
  });
  it('filters access, changes and failures independently without inserting audit feedback',async()=>{
    for(const [category,expected]of [['access',1],['activity',1],['failure',1]] as const){const r=await service.logs(user,{user:'Responsável',from:'2026-10-15',to:'2026-10-15',category,page:1,pageSize:20});expect(r.total).toBe(expected);}
    const rows=await db.query<{total:bigint}[]>('SELECT COUNT(*) AS total FROM InfraAudit WHERE id IN ('+ids.map(()=>'?').join(',')+')',ids);expect(Number(rows[0].total)).toBe(4);
  });
});
