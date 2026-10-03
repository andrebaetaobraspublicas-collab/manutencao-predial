const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {loadLegacyRuntime}=require('../../apps/api/src/modules/orcapro/legacy/assets/runtime.cjs');
const engine=require('../../apps/api/src/modules/orcapro/risks/assets/engine.cjs');
function setup(){
  const {OP}=loadLegacyRuntime(),downloads=[],buttons=[{disabled:true}];
  OP.app.pj=OP.engine.newProject();OP.app.pj.name='Orçamento sintético';
  const config={scope:'A',iterations:1000,seed:42,percentile:80,contract:'global',quantityJustification:'',notes:'<img src=x onerror=alert(1)>',variables:[{id:'s',selected:true,probability:100,min:-5,mode:5,max:10,distribution:'triangular',mean:5,sd:2,responsibility:'contratado',type:'variacao_custo_unitario',justification:'Teste'}],events:[]};
  const services=[{id_risco_servico:'s',descricao:'=HYPERLINK("unsafe") <img src=x>',selecionado:1,incluir_contingencia:1,valor_base:1000,quantidade:1,custo_unitario:1000,probabilidade:100,minimo:-5,mais_provavel:5,maximo:10,distribuicao:'triangular',responsavel:'contratado'}];
  const analysis={iteracoes:1000,semente:42,percentil_alvo:80,metodo_escopo:'full'},result=engine.simulateMonteCarlo(analysis,services,[]);
  const a={id:'risk-1',name:'<script>alert(1)</script>',snapshot:{projectVersion:1,referenceId:'ref-1',uf:'SP',regime:'SD',baseCents:'100000',rows:[{id:'s',code:'10',description:services[0].descricao,qty:1,unit:'UN',abc:'A',directCents:'100000'}]},config,result:{summary:result.resumo,tornado:engine.buildTornado(analysis,services,[]).rows,expected:engine.expectedMonetaryValue(analysis,services,[]),baseCents:'100000',targetCents:'105000',contingencyCents:'5000',rate:'0.0500000000',engineVersion:'orcapro-risk-1.0.0',computedAt:new Date().toISOString(),assumptions:['Independência']},applications:[]};
  OP.app.pj.risks={v:1,analyses:[a]};OP.exp.download=(name,text,type)=>downloads.push({name,text,type});OP.cloud={};
  const context={OP,addEventListener(){},document:{querySelector:()=>null,querySelectorAll:selector=>selector.includes('riskSave')?buttons:[]}};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/risk-ui.js','utf8'),context);context.installOrcaProRisks();OP.ui.views.risks.render();return {OP,a,downloads,buttons};
}
test('risk reports include full premises and safe HTML; CSV guards formula injection',()=>{
  const {OP,downloads}=setup();OP.ui.act.riskReport();OP.ui.act.riskCsv();
  const html=downloads[0].text,csv=downloads[1].text;assert.ok(html.includes('Serviços e distribuições')&&html.includes('Premissas')&&html.includes('Percentis'));assert.ok(!html.includes('<script>')&&!html.includes('<img '));assert.ok(html.includes('&lt;img'));assert.ok(csv.includes('"\'=HYPERLINK'));assert.ok(csv.includes('Probabilidade %'));
});
test('input edits are retained immediately and enable saving without waiting for blur',()=>{
  const {OP,buttons}=setup();OP.ui.inp.riskField({dataset:{key:'iterations',owner:''},type:'number',value:'2000'});assert.equal(OP.risks.draft.iterations,2000);assert.equal(OP.risks.dirty,true);assert.equal(buttons[0].disabled,false);
  OP.ui.inp.riskField({dataset:{key:'mode',owner:'variables',index:'0'},type:'number',value:''});assert.equal(OP.risks.draft.variables[0].mode,null);
});
