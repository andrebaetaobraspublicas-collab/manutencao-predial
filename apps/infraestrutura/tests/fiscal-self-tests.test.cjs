const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('./harness.cjs');

test('SICRO self-tests use the active one-UF catalog, preserve data and catch a broken calculation',()=>{
 const ctx=H.loadExtracted(),O=ctx.OP;O.iva.setup();O.ui.model();
 const before=JSON.stringify(O.app.pj),raw=JSON.stringify(O.app.base.raw);
 const results=O.iva.runTests();
 assert.ok(results.length>=25);assert.deepEqual(Array.from(results).filter(x=>!x.ok),[]);
 assert.equal(JSON.stringify(O.app.pj),before);assert.equal(JSON.stringify(O.app.base.raw),raw);
 assert.ok(results.some(x=>x.nome.includes('6.619')));
 assert.ok(results.every(x=>!x.nome.includes('Acervo de origem')));
 const original=ctx.MOTOR.avaliarOcorrencia;
 ctx.MOTOR.avaliarOcorrencia=(...args)=>({...original(...args),credito:123456});
 assert.ok(O.iva.runTests().some(x=>!x.ok&&x.nome.includes('Motor')));
 ctx.MOTOR.avaliarOcorrencia=original;
 const published=O.app.base.raw.comp.o[0];O.app.base.raw.comp.o[0]=published+1;
 assert.ok(O.iva.runTests().some(x=>!x.ok&&x.nome.includes('custos publicados')));
 O.app.base.raw.comp.o[0]=published;
});

test('progressive UI transformation is idempotent, including the already generated Infraestrutura module',()=>{
 const {ui}=require('../../../scripts/shared/tax-scenario-defaults.cjs');
 const source=fs.readFileSync(path.join(H.root,'src/modules/28_abc_ui.js'),'utf8');
 assert.equal(ui(source),source);assert.equal(ui(ui(source)),source);
 assert.equal(source.split("['progressivo','Recuperação progressiva da depreciação (2027–2037)']").length-1,1);
 assert.equal(source.split('<p class="small">Recuperação progressiva da depreciação:').length-1,1);
 const old="['corrente','Alíquota do exercício corrente']<h3>Base ponderada com combustíveis</h3>";
 assert.equal(ui(ui(old)),ui(old));
});
