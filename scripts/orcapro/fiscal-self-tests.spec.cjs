const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),assets=path.join(root,'apps/api/src/modules/orcapro/legacy/assets');
const {createFixture}=require('./build-fiscal-test-fixture.cjs');
const raw=JSON.parse(fs.readFileSync(path.join(root,'legacy/orcaplan-1.8.3/sinapi-2026-08.raw.json'),'utf8'));
const fixture=createFixture();
function context(){
 const c={console,document:{getElementById:()=>null,addEventListener(){}},addEventListener(){},setTimeout,clearTimeout,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,atob,btoa,crypto:crypto.webcrypto};c.window=c;vm.createContext(c);
 for(const f of fs.readdirSync(path.join(assets,'modules')).filter(n=>n.endsWith('.js')&&parseInt(n)<40).sort())vm.runInContext(fs.readFileSync(path.join(assets,'modules',f),'utf8'),c,{filename:f,timeout:10000});
 vm.runInContext(fs.readFileSync(path.join(assets,'fiscal-self-tests.js'),'utf8'),c);
 const sparse=JSON.parse(JSON.stringify(raw));for(const [k,v]of Object.entries(sparse.ins))if(Array.isArray(v))sparse.ins[k]=v.slice(0,430);for(const [k,v]of Object.entries(sparse.comp))if(Array.isArray(v))sparse.comp[k]=[];
 sparse.ref='09/2026';c.OP.app.base=c.OP.register.makeBase(sparse,'current-september',[],[],[]);c.OP.app.pj=c.OP.engine.newProject();c.OP.app.pj.sinapiReferenceId='current-september';c.OP.iva.setup();c.OP.ui.model();return c;
}
test('historical tests have complete isolated dependencies; a sparse September catalog passes without changing the budget',async()=>{
 const c=context(),O=c.OP,db=O.iva.db(),project=JSON.stringify(O.app.pj),activeRaw=JSON.stringify(O.app.base.raw);
 assert.equal(db.ins.size,430);assert.equal(db.comp.size,0);
 const results=await O.iva.runTests({fixture});
 assert.ok(results.length>145);assert.deepEqual(Array.from(results).filter(x=>!x.ok),[]);
 assert.equal(results.filter(x=>x.nome.startsWith('Regressão histórica')).length,124);
 assert.equal(O.iva.db(),db);assert.equal(c.MOTOR.db(),db);assert.equal(JSON.stringify(O.app.pj),project);assert.equal(JSON.stringify(O.app.base.raw),activeRaw);assert.equal(O.app.base.raw.ref,'09/2026');
});
test('missing historical dependencies fail visibly and the active motor DB is restored',async()=>{
 const c=context(),db=c.OP.iva.db(),broken=JSON.parse(JSON.stringify(fixture));broken.db.comp=broken.db.comp.filter(([code])=>code!=='89470');
 const results=await c.OP.iva.runTests({fixture:broken});
 assert.ok(results.some(x=>!x.ok&&x.nome.includes('89470')));assert.equal(c.MOTOR.db(),db);
});
test('a populated building budget with private compositions retains its costs and credits',async()=>{
 const c=context(),O=c.OP;
 O.app.base=O.register.makeBase(JSON.parse(JSON.stringify(raw)),'active-august',[],[],[]);
 O.app.pj=JSON.parse(fs.readFileSync(path.join(root,'legacy/orcaplan-1.8.3/fixtures/edificio.project.json'),'utf8'));
 O.engine.fix(O.app.pj);O.register.hydrate(O.app.pj);O.app.model=null;O.iva.setup();
 const model=O.ui.model(),credit=O.iva.budget(model).total.creditCents,cost=model.tot.direct,before=JSON.stringify(O.app.pj),base=JSON.stringify(O.app.base.raw);
 assert.ok(credit>0);const results=await O.iva.runTests({fixture});assert.deepEqual(Array.from(results).filter(x=>!x.ok),[]);
 assert.equal(JSON.stringify(O.app.pj),before);assert.equal(JSON.stringify(O.app.base.raw),base);assert.equal(O.ui.model().tot.direct,cost);assert.equal(O.iva.budget(O.ui.model()).total.creditCents,credit);
});
test('a regression in current credits remains a failure rather than being suppressed',async()=>{
 const c=context(),original=c.MOTOR.avaliarOcorrencia;
 c.MOTOR.avaliarOcorrencia=(oc,...args)=>{const r=original(oc,...args);return oc.cod==='SELFTEST-SINAPI'?{...r,credito:r.credito+1}:r;};
 const results=await c.OP.iva.runTests({fixture});assert.ok(results.some(x=>!x.ok&&x.nome.startsWith('Cenário atual')));
});
test('historical fixture download validates SHA-256 and retries after a failed request',async()=>{
 const c=context(),zlib=require('node:zlib'),data=zlib.gzipSync(Buffer.from(JSON.stringify(fixture)));let calls=0;
 c.ORCAPRO_FISCAL_TEST_FIXTURE={url:'/orcapro-legacy/data/fiscal-regression-test.json.gz',bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')};c.AbortController=AbortController;
 c.fetch=async()=>{calls++;return calls===1?new Response('unavailable',{status:503}):new Response(data);};
 await assert.rejects(()=>c.OP.iva.runTests(),/503/);const results=await c.OP.iva.runTests();assert.deepEqual(Array.from(results).filter(x=>!x.ok),[]);assert.equal(calls,2);
});
test('downloaded fixture with the wrong checksum is rejected',async()=>{
 const c=context(),data=Buffer.from('not the trusted fixture');c.AbortController=AbortController;
 c.ORCAPRO_FISCAL_TEST_FIXTURE={url:'/orcapro-legacy/data/fiscal-regression-test.json.gz',bytes:data.length,sha256:'0'.repeat(64)};c.fetch=async()=>new Response(data);
 await assert.rejects(()=>c.OP.iva.runTests(),/Integridade/);
});
test('the build patch is idempotent and the UI awaits the full report',()=>{
 const {patch}=require('../shared/sinapi-fiscal-tests.cjs');
 for(const name of ['027-28_abc_ui.js','028-29_iva_bridge.js','029-30_iva_ui.js']){const source=fs.readFileSync(path.join(assets,'modules',name),'utf8');assert.equal(patch(source),source);}
 const source=fs.readFileSync(path.join(assets,'modules/029-30_iva_ui.js'),'utf8');assert.ok(source.includes('const results=await T.runTests()'));assert.ok(source.includes('button.disabled=false'));
});
