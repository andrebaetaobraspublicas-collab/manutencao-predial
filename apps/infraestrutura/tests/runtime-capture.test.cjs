const test=require('node:test'),assert=require('node:assert/strict');
const H=require('./harness.cjs');
const runtime=require('../../api/src/modules/infraestrutura/assets/legacy-runtime.cjs');

test('contract capture exports existing Infra line totals and quantities without changing the calculation or its input',()=>{
 const context=H.loadExtracted(),O=context.OP,model=O.ui.model();
 const raw=JSON.parse(JSON.stringify(O.app.base.officialRaw||O.app.base.raw));
 const project=JSON.parse(JSON.stringify(O.app.pj)),before=JSON.stringify(project);
 const result=runtime.calculateProject(raw,project,{cycleId:'capture-regression'});
 assert.equal(JSON.stringify(project),before);
 assert.equal(result.items.length,model.items.length);
 assert.deepEqual(result.totals,JSON.parse(JSON.stringify(model.tot)));
 for(const row of result.items){
  const source=model.items.find(item=>item.id===row.id);assert(source);
  assert.equal(row.quantity,source.qty);assert(Number.isFinite(row.quantity));
  assert.equal(row.unitCostCents,source.unitCost);assert(Number.isFinite(row.unitCostCents));
  assert.equal(row.priceCents,source.total);assert(Number.isFinite(row.priceCents));
  assert.equal(row.directCents,source.direct);
 }
 assert.equal(result.items.reduce((total,row)=>total+row.priceCents,0),result.totals.price);
});
