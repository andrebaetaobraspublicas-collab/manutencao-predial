const test=require('node:test'),assert=require('node:assert/strict');
const H=require('./harness.cjs'),{fixture,cycleId,projectId}=require('./bridge-harness.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
test('consultation async basic analysis completes once, preserves budget and supports close',async()=>{
 const ctx=H.loadExtracted(),O=ctx.OP,A=O.app,raw=copy(A.base.officialRaw),data=copy(A.pj);
 data.id=projectId;data.sicroCycleId=cycleId;
 let renders=0,html='';
 O.drawer.render=()=>{if(!A.drawer)return;assert.ok(++renders<5,'analysis restarted indefinitely');html=O.drawer.tabs.basic(A.base.comp(A.drawer.code));};
 const f=await fixture({context:ctx,data,raw,pem:ctx.OP_DATA.pem});
 A.view='catalog';const budget=A.base,before=JSON.stringify(A.pj);
 A.drawer={code:5502978,tab:'basic'};O.drawer.render();
 assert.match(html,/Abrindo/);assert.equal(A.base,budget);
 for(let i=0;i<100&&A.drawer.basicJob;i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(A.drawer.basicJob,null);assert.equal(renders,2);assert.match(html,/basicTableBox/);
 assert.equal(A.base,budget);assert.equal(JSON.stringify(A.pj),before);
 O.drawer.render();assert.match(html,/basicTableBox/);assert.equal(renders,3);
 A.drawer={code:A.base.raw.comp.c[0],tab:'basic'};O.drawer.render();assert.match(html,/Abrindo/);A.drawer=null;
 await new Promise(r=>setTimeout(r,30));assert.equal(renders,4);
 assert.equal(f.requests.filter(r=>r.method==='PUT').length,0);
});
test('excavation navigation preserves every composition and its path without modifying catalog',()=>{
 const O=H.loadExtracted().OP,b=O.app.base,before=JSON.stringify(b.raw),gi=b.raw.grupos.findIndex(x=>/Terraplenagem/.test(x));
 const group=O.factors.forGroup(b,gi),families=group.families.filter(f=>f.title.startsWith('Escavação, carga e transporte ·'));
 assert.equal(families.reduce((s,f)=>s+f.size,0),283);assert.ok(families.length>5);
 assert.ok(Math.max(...families.map(f=>f.size))<=40);
 const ids=group.families.flatMap(f=>f.members.map(m=>m.j));assert.equal(ids.length,308);assert.equal(new Set(ids).size,308);
 for(const j of ids){const found=O.factors.locate(b,b.raw.comp.c[j]);assert.ok(found);assert.ok(O.factors.matches(found.family,found.path).some(m=>m.j===j));}
 assert.equal(JSON.stringify(b.raw),before);

});

