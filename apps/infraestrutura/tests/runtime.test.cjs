const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const fixture=path.resolve(__dirname,'../../../legacy/infraestrutura-1.8.3');
const runtime=require('../../api/src/modules/infraestrutura/assets/legacy-runtime.cjs');
const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(fixture,'base.json.gz'))));
const pem=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(fixture,'pem.json.gz'))));
const project=JSON.parse(fs.readFileSync(path.join(fixture,'example-road.json'),'utf8'));

test('Runtime de importação calcula 6.619 custos publicados, com o mesmo motor',()=>{
 const result=runtime.validateRaw(raw);assert.equal(result.ok,6619);assert.equal(result.mismatch,0);assert.equal(result.compositionCount,6619);assert.equal(result.inputCount,2398);
 const divergent=JSON.parse(JSON.stringify(raw));divergent.comp.o[0]+=1;
 const result2=runtime.validateRaw(divergent);assert.equal(result2.ok,6618);assert.equal(result2.mismatch,1);assert.equal(result2.sample[0].code,raw.comp.c[0]);
});

test('Runtime de migração compara fotografias sem mutar o projeto e o catálogo',()=>{
 const original=JSON.stringify(project),base=JSON.stringify(raw);
 const result=runtime.compareProjects(raw,raw,project,{pem});
 assert.equal(result.before.workDays,172);assert.equal(result.after.workDays,172);
 assert.equal(result.before.totals.direct,2964114491);assert.equal(result.after.totals.direct,2964114491);
 assert.equal(result.items.length,64);assert.ok(result.items.every(item=>item.deltaDirectCents===0));
 assert.equal(JSON.stringify(project),original);assert.equal(JSON.stringify(raw),base);
});

test('Créditos de IBS/CBS no comparativo usam o mesmo motor da interface e a nova UF/data-base',()=>{
 const H=require('./harness.cjs'),ctx=H.loadExtracted();
 ctx.OP.app.pj.iva.year=2033;ctx.OP.iva.invalidate();
 const current=ctx.OP.iva.budget(ctx.OP.ui.model());
 const input=JSON.parse(JSON.stringify(ctx.OP.app.pj));
 const actual=runtime.calculateProject(raw,input,{pem});
 assert.equal(actual.iva.creditCents,current.total.creditCents);assert.equal(actual.iva.ibsCents,current.total.ibsCents);assert.equal(actual.iva.cbsCents,current.total.cbsCents);
 const changed=JSON.parse(JSON.stringify(raw));changed.ufs=['RJ'];changed.ref='08/2026';
 for(const key of ['v','vcd'])changed.ins[key]=changed.ins[key].map((v,i)=>changed.ins.k[i]===0&&v!=null?v*2:v);
 const next=runtime.calculateProject(changed,{...input,uf:'RJ'},{pem});
 assert.notEqual(next.totals.direct,actual.totals.direct);assert.notEqual(next.iva.creditCents,actual.iva.creditCents);
 assert.equal(next.iva.creditCents,next.iva.ibsCents+next.iva.cbsCents);assert.equal(next.iva.year,2033);
});
