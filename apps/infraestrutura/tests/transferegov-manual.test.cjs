const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
test('Infraestrutura manual renders the shared walkthrough, tables, examples and HTTPS sources without project changes or HTML injection',()=>{
 const H=require('./harness.cjs'),ctx=H.loadExtracted(),O=ctx.OP,guide=JSON.parse(fs.readFileSync(root+'/scripts/shared/transferegov-bm-manual.json','utf8')),source=JSON.stringify(O.app.pj);
 guide.sections.push({title:'<img src=x onerror=alert(1)>',table:{headers:['<unsafe>'],rows:[['<script>bad()</script>']]},formula:'<value>',expected:'<result>'});guide.references.push({title:'unsafe',url:'javascript:alert(1)'});
 ctx.location={hostname:'www.gestaodepredios.com.br'};ctx.TransferegovBM=require('../../api/src/modules/orcapro/legacy/assets/transferegov-bm.js');
 ctx.document.createElement=()=>{const article={innerHTML:''},nav={appendChild:()=>{}};let original='';return{dataset:{},set innerHTML(v){original=v;},get innerHTML(){return article.innerHTML||original;},querySelector:selector=>selector==='.mnav'?nav:selector==='.mart'?article:null};};
 vm.runInContext(fs.readFileSync(root+'/scripts/shared/transferegov-bm-ui.js','utf8'),ctx);ctx.installTransferegovBM(guide);O.app.man={cap:guide.id,q:''};const html=O.ui.views.manual.render();
 for(const value of ['Neste capítulo','<table','0,34 m³','Resultado esperado','Checklist antes de concluir','mandatarias.transferegov.sistema.gov.br','tg-manual-section-0'])assert.ok(html.includes(value),value);
 assert.ok(html.includes('&lt;unsafe&gt;'));assert.ok(html.includes('&lt;value&gt;'));assert.ok(html.includes('white-space:pre-wrap;overflow-wrap:anywhere'));assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));assert.equal(JSON.stringify(O.app.pj),source);
});
