const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const H=require('./harness.cjs');
const original=H.loadOriginal(),modular=H.loadExtracted();
const clean=value=>JSON.parse(JSON.stringify(value));
const OM=original.OP.ui.model(),NM=modular.OP.ui.model();
const sourceFile=path.join(H.seedDir,'original.html');
const source=fs.readFileSync(sourceFile,'utf8').replace(/\r\n/g,'\n');

test('SICRO SP 07/2026: 6.619 custos iguais ao relatório oficial',()=>{
 const O=modular.OP,result=O.sicro.validate(O.app.base);
 assert.equal(result.total,6619);assert.equal(result.ok,6619);assert.equal(result.mismatch,0);
 const published=O.app.base.raw.comp.o,computed=O.app.base.costTable('SP','SD',true).cost;
 for(let index=0;index<6619;index++)assert.equal(computed[index],published[index],O.app.base.raw.comp.c[index]);
});

test('Extração conserva todos os custos em cada regime',()=>{
 for(const regime of ['SD','CD','SE'])assert.deepEqual(clean(modular.OP.app.base.costTable('SP',regime,true).cost),clean(original.OP.app.base.costTable('SP',regime,true).cost),regime);
});

test('Rodovia conserva os 64 serviços, centavos e prazo de 172 dias úteis',()=>{
 assert.equal(NM.items.length,64);assert.equal(NM.T,172);
 assert.equal(NM.tot.direct,2964114491);assert.equal(NM.tot.price,3563786534);
 assert.deepEqual(clean(NM.tot),clean(OM.tot));
 const values=m=>m.items.map(i=>({code:i.node.code,qty:i.qty,unitCost:i.unitCost,direct:i.direct,price:i.price}));
 assert.deepEqual(clean(values(NM)),clean(values(OM)));
 assert.equal(NM.T,OM.T);
});

const suites=[['Administração Local','al',44],['Mobilização','mob',6],['Canteiro','can',39],['FIT','fit',9],['FIC','fic',7],['PEM','pem',3]];
const report={catalog:modular.OP.sicro.validate(modular.OP.app.base),road:{services:NM.items.length,directCents:NM.tot.direct,priceCents:NM.tot.price,workDays:NM.T},suites:{}};
for(const [name,key,count] of suites)test(`${name}: autotestes originais preservados`,()=>{
 const tests=modular.OP[key].selfTests();assert.equal(tests.length,count);assert.ok(tests.every(x=>x.pass),JSON.stringify(tests.filter(x=>!x.pass)));
 assert.deepEqual(clean(tests),clean(original.OP[key].selfTests()));
 report.suites[key]={total:count,passed:tests.filter(x=>x.pass).length,details:clean(tests)};
});

test('Riscos: o motor reproduz a mesma simulação e o mesmo tornado do HTML',()=>{
 const input=ctx=>{const C=ctx.OP.riskLocal,rows=C.classify(ctx.OP.ui.model().items.map(i=>({id:i.node.code,code:i.node.code,description:i.desc,unit:i.unit,qty:i.qty,unitCostCents:String(i.unitCost),directCents:String(i.direct)}))),cfg=C.defaults(rows);cfg.iterations=1000;return C.input(C.validate(cfg,rows),rows);};
 const a=input(original),b=input(modular),r1=original.RiscosEngine.simulateMonteCarlo(a.analysis,a.services,a.events),r2=modular.RiscosEngine.simulateMonteCarlo(b.analysis,b.services,b.events);
 assert.deepEqual(clean(r1),clean(r2));
 assert.deepEqual(clean(original.RiscosEngine.buildTornado(a.analysis,a.services,a.events)),clean(modular.RiscosEngine.buildTornado(b.analysis,b.services,b.events)));
 report.risks={deterministic:true,iterations:1000,summary:clean(r2.resumo)};
});

test('Gate de concordância legal permanece byte a byte igual',()=>{
 const old=source.match(/function showLegalGate\(\) \{[\s\S]*?\n  \}/)[0];
 const main=fs.readFileSync(path.join(H.root,'src/modules/99_main.js'),'utf8');
 const current=main.match(/function showLegalGate\(\) \{[\s\S]*?\n  \}/)[0];assert.equal(current,old);
 const shell=fs.readFileSync(path.join(H.root,'index.html'),'utf8');
 const gate=text=>text.slice(text.indexOf('<div id="legalGate"'),text.indexOf('<div class="app" id="app"')).replace(/\r\n/g,'\n');
 assert.equal(gate(shell),gate(source));
 assert.ok(!main.includes('setTimeout(r, 4000 - elapsed)'));
});

test('Dados SICRO/PEM têm um único seed global e estão fora das assets públicas',()=>{
 assert.ok(!fs.existsSync(path.join(H.root,'public/data/pem.json')));assert.ok(!fs.existsSync(path.join(H.root,'public/data/sicro-sp-2026-07.json')));
 assert.ok(fs.statSync(path.join(H.seedDir,'base.json.gz')).size<1000000);
 const zlib=require('node:zlib'),raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(H.seedDir,'base.json.gz'))).toString());assert.equal(raw.comp.c.length,6619);
 const pem=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(H.seedDir,'pem.json.gz'))).toString());assert.equal(pem.pem.length,3673);
 report.snapshot={gzipBytes:fs.statSync(path.join(H.seedDir,'base.json.gz')).size,pemCount:pem.pem.length};
});

test('Código extraído mantém as hashes registradas no inventário',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(H.root,'extraction-manifest.json'),'utf8'));
 for(const module of manifest.modules){const bytes=fs.readFileSync(path.join(H.root,'src/modules',module.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),module.extractedSha256,module.file);}
 const actual=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');assert.equal(actual,manifest.sourceSha256);
});

test.after(()=>{const dir=path.join(H.root,'test-results');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'regression.json'),JSON.stringify(report,null,2));});
