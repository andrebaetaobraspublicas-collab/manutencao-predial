const test = require('node:test'), assert = require('node:assert/strict');
const { loadLegacyRuntime } = require('../../apps/api/src/modules/orcapro/legacy/assets/runtime.cjs');
const H = require('../../apps/infraestrutura/tests/harness.cjs');
const clone = x => JSON.parse(JSON.stringify(x));
function sinapi() {
  const runtime = loadLegacyRuntime(), O = runtime.OP;
  const raw = { v: 1, fonte: 'SINAPI', ref: '09/2026', emissao: '', ufs: ['SP','RJ'], cidades: ['',''], encargos: {},
    grupos: ['Teste'], ct: [''], cls: ['MATERIAL'], un: ['UN'],
    ins: { c: [1,2], k: [0,0], d: ['Material A','Material B'], u: [0,0], o: [0,0], p: [[1000,1500],[500,700]], lab: {} },
    comp: { c: [10,11,12], g: [0,0,0], d: ['Auxiliar','Serviço principal','Sem esse material'], u: [0,0,0], s: [0,0,0], it: [[[1,2]],[[-10,3],[2,1]],[[2,1]]] },
    ovr: { SD: { 11: [6500,9700] } } };
  const project = O.engine.newProject(); project.uf = 'SP'; project.rg = 'SD'; project.bdi = .25;
  const stage = O.engine.addStage(project, null, 'ETAPA');
  for (const [code,qty,custo] of [[11,2,null],[10,3,null],[11,1,99],[12,4,null]]) {
    const { item } = O.engine.addItem(project, stage.id, code, qty);
    if (custo != null) item.custo = custo;
  }
  project.catalog = { v: 1, inputs: [], compositions: [] };
  O.app.pj = project; O.app.inputs = []; O.app.customs = []; O.app.base = runtime.createBase(raw,'test');
  return { O, raw, project, base: O.app.base, runtime };
}
const change = code => ({ code, priceCents: 2000, source: 'Cotação de teste', date: '2026-10-27' });
test('SINAPI: preview is read-only, nested paths and fixed prices, BDI, restore and isolation', () => {
  const { O, base, project, raw, runtime } = sinapi(), P = O.inputPrices;
  const original = JSON.stringify(project), official = JSON.stringify(raw);
  const preview = P.preview(base,project,change(1));
  assert.equal(JSON.stringify(project), original);
  assert.equal(preview.affected.length, 3); assert.equal(preview.affected.filter(r => r.fixed).length, 1);
  assert.equal(preview.after.direct-preview.before.direct, 18000);
  P.apply(base,project,preview);
  const m = O.engine.compute(base,project);
  assert.equal(m.items[0].unitCost,12500); assert.equal(m.items[2].unitCost,9900);
  assert.equal(m.tot.price, preview.after.price); assert.equal(project.bdi,.25);
  assert.equal(base.compCost(11,'RJ','SD'),9700); assert.equal(base.compCost(11,'SP','CD'),6500);
  assert.equal(runtime.createBase(raw,'other-project').compCost(11,'SP','SD'),6500);
  const reopened = runtime.calculateProject(raw,project); assert.equal(reopened.model.tot.direct,m.tot.direct);
  assert.equal(JSON.stringify(raw), official);
  const restored = P.preview(base,project,{code:1},true); P.apply(base,project,restored);
  assert.equal(O.engine.compute(base,project).items[0].unitCost,6500);
  assert.equal(project.inputPriceHistory.length,2);
});
test('preview rejects concurrent changes and invalid/negative/fractional cents; zero is accepted', () => {
  const { O, base, project } = sinapi(), P=O.inputPrices;
  for (const value of [-1,NaN,Infinity,1.5]) assert.throws(()=>P.preview(base,project,{...change(1),priceCents:value}));
  const zero=P.preview(base,project,{...change(1),priceCents:0});assert.equal(zero.affected[0].newUnit,500);
  const preview=P.preview(base,project,change(1)); project.bdi=.3;
  assert.throws(()=>P.apply(base,project,preview),/mudou/);assert.equal(project.inputPriceOverrides,undefined);
});
test('own inputs and quoted compositions stay independent; inactive month cannot leak', () => {
  const { O, project, raw, runtime }=sinapi();
  const own={...O.register.newInput(),code:'IP-TEST',desc:'Próprio',cls:'MATERIAL',unit:'UN',prices:[{uf:'SP',ref:'',base:10}]};
  const comp={...O.register.newComp(),code:'CP-TEST',desc:'Própria',unit:'UN',items:[{type:'I',code:'IP-TEST',coef:2}],mode:'analytic'};
  project.catalog={v:1,inputs:[own],compositions:[comp]};O.app.inputs=[own];O.app.customs=[comp];
  const base=O.app.base=runtime.createBase(raw,'own',[own],[comp]);
  O.engine.addItem(project,project.root.children[0].id,'CP-TEST',1);
  const p=O.inputPrices.preview(base,project,change('IP-TEST'));assert.equal(p.affected.length,1);
  O.inputPrices.apply(base,project,p);assert.equal(O.engine.compute(base,project).items.at(-1).unitCost,4000);
  const other=runtime.calculateProject({...raw,ref:'10/2026'},project);assert.equal(other.model.items.at(-1).unitCost,2000);
});
test('SICRO: material and equipment CHP/CHI reprice nested services with unchanged schedule; restore and server parity', () => {
  const ctx=H.loadExtracted(),O=ctx.OP,A=O.app,P=O.inputPrices;
  const before=O.ui.model(), projectBefore=JSON.stringify(A.pj);
  const material=O.abc.compute(before).rows.find(r=>/^M\d{4}$/.test(r.code)&&r.price>0);
  assert.ok(material);
  const preview=P.preview(A.base,A.pj,{...change(material.code),priceCents:Math.round(material.price*2)});
  assert.equal(JSON.stringify(A.pj),projectBefore);assert.ok(preview.affected.length>0);assert.ok(preview.after.direct>preview.before.direct);
  P.apply(A.base,A.pj,preview);const after=O.engine.compute(A.base,A.pj);A.model=after;
  assert.equal(after.T,before.T);assert.equal(after.tot.direct,preview.after.direct);
  const oldTax=O.iva.budget(after);assert.equal(oldTax.total.creditCents,oldTax.total.ibsCents+oldTax.total.cbsCents);
  const equipment=A.base.raw.ins.c.find(c=>/^E\d{4}$/.test(c)&&before.items.some(r=>!r.fixo&&P.uses(A.base,r.node.code,c)));
  assert.ok(equipment);const parts=A.base.eqParts(equipment,A.pj.rg);
  const eq=P.preview(A.base,A.pj,{...change(equipment),priceCents:Math.round(parts[7]*200),chiCents:Math.round(parts[8]*200)});
  assert.ok(eq.affected.length>0);assert.ok(eq.after.direct>eq.before.direct);P.apply(A.base,A.pj,eq);
  const result=O.engine.compute(A.base,A.pj);A.model=result;
  const tax=O.iva.budget(result);assert.equal(tax.total.creditCents,tax.total.ibsCents+tax.total.cbsCents);
  assert.notEqual(tax.total.creditCents,oldTax.total.creditCents);
});
