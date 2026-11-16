import { gzipSync } from 'node:zlib';
import { InfraProductionVersionRetentionWorker } from './version-retention.infra-production-worker';
import { ConfigService } from '@nestjs/config';
import mariadb, { Connection } from 'mariadb';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VersionRetentionWorker } from './version-retention.worker';
import { ProductionVersionRetentionWorker } from './version-retention.production-worker';
import { historySql, historyValues, supersedeHistorySql, supersedeHistoryValues } from './version-retention';

const supplied = process.env.RETENTION_TEST_DATABASE_URL;
const suite = supplied ? describe : describe.skip;
suite('retention worker on isolated local MySQL', () => {
  const names = [0,1,2].map(i => `retention_test_${process.pid}_${i}`);
  const realNames = ['u296746636_gestaopredios','u296746636_orcapro_infra','u296746636_gestao_dev'];
  const original = mariadb.createConnection.bind(mariadb);
  let admin: Connection, dbs: Connection[], worker: VersionRetentionWorker, spy: jest.SpyInstance;
  const actor:any = {tenantId:'tenant-a',userId:'actor-a',workSessionId:'session-a'};
  const config = new ConfigService({VERSION_RETENTION_DEV:'true',WEB_BASE_URL:'https://gestaodepredios.com.br',
    ...Object.fromEntries(['DATABASE_URL','INFRA_DATABASE_URL','GESTAO_DATABASE_URL'].map((k,i)=>[k,`mysql://unused@localhost/${realNames[i]}`]))});
  beforeAll(async()=>{
    const url=new URL(supplied!);if(url.hostname!=='127.0.0.1'||url.port!=='3308')throw Error('Requires local test MySQL');
    const options={host:url.hostname,port:3308,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),timezone:'Z',allowPublicKeyRetrieval:true};
    admin=await original(options); dbs=[];
    for(const name of names){
      await admin.query(`CREATE DATABASE ${name}`);
      const db=await original({...options,database:name});dbs.push(db);
      await db.query(readFileSync(join(__dirname,'../../retention-migrations/001_development_history.sql'),'utf8'));
    }
    await dbs[0].query('CREATE TABLE OrcaproProject(id CHAR(36) PRIMARY KEY,tenantId CHAR(36),version INT)');
    await dbs[0].query('CREATE TABLE OrcaproProjectVersion(projectId CHAR(36),version INT,PRIMARY KEY(projectId,version))');
    await dbs[0].query('CREATE TABLE OrcaproAudit(id CHAR(36),tenantId CHAR(36),actorUserId CHAR(36),action VARCHAR(100),entityId CHAR(36),metadata JSON)');
    await dbs[1].query('CREATE TABLE InfraProject(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36),version INT)');
    await dbs[1].query('CREATE TABLE InfraProjectVersion(project_id CHAR(36),version INT,PRIMARY KEY(project_id,version))');
    await dbs[1].query('CREATE TABLE InfraAudit(id CHAR(36),tenant_id CHAR(36),user_id CHAR(36),action VARCHAR(100),entity VARCHAR(80),entity_id CHAR(36),payload JSON)');
    await dbs[2].query('CREATE TABLE GcSource(tenant_id CHAR(36),product VARCHAR(16),project_id CHAR(36),source_version INT)');
    await dbs[2].query('CREATE TABLE GcAction(id INT PRIMARY KEY,payload JSON)');
    await dbs[2].query("INSERT INTO GcAction VALUES(1,'{}')");
    spy=jest.spyOn(mariadb,'createConnection').mockImplementation(async (o:any)=>{
      const index=['u528277311_orcapro_live','u528277311_infra_auth'].includes(o.database)?0:o.database==='u528277311_infra_live'?1:realNames.indexOf(o.database);if(index<0)throw Error('Unexpected target');
      return original({...options,database:names[index]});
    });
    worker=new VersionRetentionWorker(config);
    for(const [i,project,versions,column,tenant] of [[0,'OrcaproProject','OrcaproProjectVersion','projectId','tenantId'],[1,'InfraProject','InfraProjectVersion','project_id','tenant_id']] as const){
      const db=dbs[i];await db.query(`INSERT INTO ${project}(id,${tenant},version) VALUES('project-a','tenant-a',12),('project-b','tenant-b',1)`);
      for(let v=1;v<=12;v++){
        await db.query(`INSERT INTO ${versions}(${column},version) VALUES('project-a',?)`,[v]);
        const session=v<=2?'a':v<=4?'b':v<=6?'c':v<=8?'d':v<=10?'e':undefined;
        const user={...actor,workSessionId:session};
        await db.query(historySql,historyValues(user,'project-a',v,v===7));
        await db.query(supersedeHistorySql,supersedeHistoryValues(user,'project-a',v));
      }
      await db.query("UPDATE VersionRetention SET superseded_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 25 HOUR) WHERE version IN (1,3,5,7)");
      // Distinct days in one login each keep a checkpoint.
      await db.query("UPDATE VersionRetention SET work_day='2026-11-12' WHERE version=3");
      // Same session key in another tenant cannot make that tenant's latest disposable.
      await db.query(`INSERT INTO ${versions}(${column},version) VALUES('project-b',1)`);
      await db.query(historySql,historyValues({...actor,tenantId:'tenant-b'},'project-b',1));
      await dbs[2].query("INSERT INTO GcSource VALUES('tenant-a',?,'project-a',5)",[i===0?'ORCAPRO':'INFRA']);
    }
  },30000);
  afterAll(async()=>{
    spy?.mockRestore();if(dbs)for(const db of dbs)await db.end();
    if(admin){for(const name of names)await admin.query(`DROP DATABASE IF EXISTS ${name}`);await admin.end();}
  });
  it('removes only expired intermediate versions, preserves references and audits atomically',async()=>{
    await worker.run();
    for(const [i,table,column,audit] of [[0,'OrcaproProjectVersion','projectId','OrcaproAudit'],[1,'InfraProjectVersion','project_id','InfraAudit']] as const){
      const versions=await dbs[i].query(`SELECT version FROM ${table} WHERE ${column}='project-a' ORDER BY version`);
      expect(versions.map((r:any)=>r.version)).toEqual([2,3,4,5,6,7,8,9,10,11,12]);
      expect((await dbs[i].query(`SELECT COUNT(*) n FROM ${table} WHERE ${column}='project-b'`))[0].n).toBe(1n);
      expect((await dbs[i].query(`SELECT COUNT(*) n FROM ${audit} WHERE action='history.consolidate'`))[0].n).toBe(1n);
    }
    expect((await dbs[2].query('SELECT COUNT(*) n FROM GcAction'))[0].n).toBe(1n);
  });
  it('fails closed if the contract registry cannot be read',async()=>{
    await dbs[0].query("UPDATE VersionRetention SET superseded_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 25 HOUR) WHERE version=9");
    await dbs[2].query('RENAME TABLE GcSource TO GcSourceUnavailable');
    try {await worker.run();expect((await dbs[0].query('SELECT COUNT(*) n FROM OrcaproProjectVersion WHERE version=9'))[0].n).toBe(1n);}
    finally {await dbs[2].query('RENAME TABLE GcSourceUnavailable TO GcSource');}
  });
  it('production protects risks/contracts, isolates tenants and never opens Infra',async()=>{
    const db=dbs[0],id='11111111-1111-1111-1111-111111111111';
    await db.query('ALTER TABLE OrcaproProjectVersion ADD COLUMN data JSON');
    await db.query('CREATE TABLE ContractEvidence(tenantId CHAR(36),source JSON)');
    await db.query("INSERT INTO OrcaproProject VALUES(?,'tenant-a',8)",[id]);
    for(let v=1;v<=8;v++){
      const data=v>=5?{risks:{analyses:[{snapshot:{projectVersion:3}}]}}:{};
      await db.query('INSERT INTO OrcaproProjectVersion(projectId,version,data) VALUES(?,?,?)',[id,v,JSON.stringify(data)]);
      const user={...actor,workSessionId:v<=2?'one':v<=4?'two':v<=6?'three':'four'};
      await db.query(historySql,historyValues(user,id,v));
      await db.query(supersedeHistorySql,supersedeHistoryValues(user,id,v));
    }
    await db.query("UPDATE VersionRetention SET superseded_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 25 HOUR) WHERE entity_id=? AND version IN (1,3,5)",[id]);
    await db.query("INSERT INTO OrcaproAudit VALUES('pin','tenant-a','actor','risk.create',?,?)",[id,JSON.stringify({details:{sourceVersion:1}})]);
    const values={VERSION_RETENTION_ORCAPRO_PROD:'true',WEB_BASE_URL:'https://sistema.orcaproobras.com.br',DATABASE_URL:'mysql://unused@localhost/u528277311_orcapro_live'};
    const worker=new ProductionVersionRetentionWorker(new ConfigService(values));
    const before=spy.mock.calls.length;
    await worker.run();
    expect(spy.mock.calls.slice(before).map(([o]:any)=>o.database)).toEqual(['u528277311_orcapro_live']);
    const versions=async()=> (await db.query('SELECT version FROM OrcaproProjectVersion WHERE projectId=? ORDER BY version',[id])).map((r:any)=>r.version);
    expect(await versions()).toEqual([1,2,3,4,5,6,7,8]);
    await db.query("UPDATE VersionRetention SET superseded_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 25 HOUR) WHERE entity_id=? AND version=7",[id]);
    await db.query("INSERT INTO ContractEvidence VALUES('tenant-a',?)",[JSON.stringify({projectId:id})]);
    await worker.run();expect(await versions()).toEqual([1,2,3,4,5,6,7,8]);
    await db.query('CREATE TABLE GcNewRegistry(id INT)');
    await db.query("UPDATE ContractEvidence SET tenantId='tenant-b'");
    await worker.run();expect(await versions()).toEqual([1,2,3,4,5,6,7,8]);
    await db.query('DROP TABLE GcNewRegistry');
    await worker.run();expect(await versions()).toEqual([1,2,3,4,5,6,8]);
    expect((await db.query("SELECT COUNT(*) n FROM OrcaproAudit WHERE entityId=? AND action='history.consolidate'",[id]))[0].n).toBe(1n);
    const end=spy.mock.calls.length;
    await new ProductionVersionRetentionWorker(new ConfigService({...values,WEB_BASE_URL:'https://orcaproinfra.com.br'})).run();
    await new ProductionVersionRetentionWorker(new ConfigService({...values,GESTAO_DATABASE_URL:'mysql://unknown'})).run();
    expect(spy.mock.calls.length).toBe(end);
  });
  it('Infra production preserves gzip risk snapshots/contracts and isolates tenants',async()=>{
    const db=dbs[1],id='22222222-2222-2222-2222-222222222222';
    await db.query('UPDATE VersionRetention SET protected=1');
    await db.query('ALTER TABLE InfraProjectVersion ADD COLUMN gz_blob LONGBLOB');
    await db.query('CREATE TABLE ContractEvidence(tenantId CHAR(36),source JSON)');
    await db.query("INSERT INTO InfraProject VALUES(?,'tenant-a',8)",[id]);
    for(let v=1;v<=8;v++){
      const data=v>=5?{risks:{analyses:[{snapshot:{projectVersion:3}}]}}:{};
      await db.query('INSERT INTO InfraProjectVersion(project_id,version,gz_blob) VALUES(?,?,?)',[id,v,gzipSync(Buffer.from(JSON.stringify({data})))]);
      const user={...actor,workSessionId:v<=2?'one':v<=4?'two':v<=6?'three':'four'};
      await db.query(historySql,historyValues(user,id,v));
      await db.query(supersedeHistorySql,supersedeHistoryValues(user,id,v));
    }
    await db.query("UPDATE VersionRetention SET superseded_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 25 HOUR) WHERE entity_id=? AND version IN (1,3,5)",[id]);
    await db.query("INSERT INTO InfraAudit VALUES('pin','tenant-a','actor','risk.create','project',?,?)",[id,JSON.stringify({details:{sourceVersion:1}})]);
    const values={VERSION_RETENTION_INFRA_PROD:'true',WEB_BASE_URL:'https://orcaproinfra.com.br',DATABASE_URL:'mysql://unused@localhost/u528277311_infra_auth',INFRA_DATABASE_URL:'mysql://unused@localhost/u528277311_infra_live'};
    const worker=new InfraProductionVersionRetentionWorker(new ConfigService(values));
    const before=spy.mock.calls.length;
    await worker.run();
    expect(spy.mock.calls.slice(before).map(([o]:any)=>o.database)).toEqual(['u528277311_infra_live','u528277311_infra_auth']);
    const versions=async()=> (await db.query('SELECT version FROM InfraProjectVersion WHERE project_id=? ORDER BY version',[id])).map((r:any)=>r.version);
    expect(await versions()).toEqual([1,2,3,4,5,6,7,8]);
    await db.query("UPDATE VersionRetention SET superseded_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 25 HOUR) WHERE entity_id=? AND version=7",[id]);
    await db.query("INSERT INTO ContractEvidence VALUES('tenant-a',?)",[JSON.stringify({project_id:id})]);
    await worker.run();expect(await versions()).toEqual([1,2,3,4,5,6,7,8]);
    await db.query('CREATE TABLE GcNewRegistry(id INT)');
    await db.query("UPDATE ContractEvidence SET tenantId='tenant-b'");
    await worker.run();expect(await versions()).toEqual([1,2,3,4,5,6,7,8]);
    await db.query('DROP TABLE GcNewRegistry');
    await dbs[0].query("INSERT INTO ContractEvidence VALUES('tenant-a',?)",[JSON.stringify({projectId:id})]);
    await worker.run();expect(await versions()).toEqual([1,2,3,4,5,6,7,8]);
    await dbs[0].query("UPDATE ContractEvidence SET tenantId='tenant-b' WHERE tenantId='tenant-a'");
    await worker.run();expect(await versions()).toEqual([1,2,3,4,5,6,8]);
    expect((await db.query("SELECT COUNT(*) n FROM InfraAudit WHERE entity_id=? AND action='history.consolidate'",[id]))[0].n).toBe(1n);
    const end=spy.mock.calls.length;
    await new InfraProductionVersionRetentionWorker(new ConfigService({...values,WEB_BASE_URL:'https://sistema.orcaproobras.com.br'})).run();
    await new InfraProductionVersionRetentionWorker(new ConfigService({...values,GESTAO_DATABASE_URL:'mysql://unknown'})).run();
    expect(spy.mock.calls.length).toBe(end);
  });
  it('refuses mixed environments before any business writes',async()=>{
    const before=spy.mock.calls.length;
    await new VersionRetentionWorker(new ConfigService({VERSION_RETENTION_DEV:'true',WEB_BASE_URL:'https://sistema.orcaproobras.com.br'})).run();
    expect(spy.mock.calls.length).toBe(before);
  });
});
