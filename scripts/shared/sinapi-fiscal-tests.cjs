'use strict';
function patch(source){
 const start=source.indexOf('/* Autoverificação determinística.'),end=source.indexOf('root.TESTES={executar};',start);
 if(start>=0&&end>start){
  let tests=source.slice(start,end);
  tests=tests.replace('!Number.isFinite(a)||Math.abs(a-b)>tol','!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>tol')
   .replaceAll('Cadastro de 27 UFs e oito exercícios','Cadastro histórico de 27 UFs e doze exercícios')
   .replaceAll('Anexo IX acompanha os oito exercícios','Anexo IX acompanha os doze exercícios')
   .replaceAll('[1,1,1,.9,.8,.7,.6,0][i]','[1,1,1,.9,.8,.7,.6,0,0,0,0,0][i]')
   .replace("add('Matriz cobre todos os códigos SINAPI carregados',()=>{eq(Object.keys(M.matrizTributaria.insumos).length,db.ins.size);for(const cod of db.ins.keys())yes(!!M.matrizTributaria.insumos[cod]);});", "add('Base histórica contém todos os códigos da matriz tributária original',()=>{for(const cod of Object.keys(M.matrizTributaria.insumos))yes(db.ins.has(cod),'Insumo da matriz ausente na base de teste: '+cod);});")
   .replace('eq(M.ANEXOS_IVA.totalInsumosAnalisados,db.ins.size);','eq(M.ANEXOS_IVA.totalInsumosAnalisados,Object.keys(M.matrizTributaria.insumos).length);');
  source=source.slice(0,start)+tests+source.slice(end);
 }
 source=source.replace(/T\.runTests=\(\)=>\{const active=T\.db\(\),subset=[^\n]+return results;\};/,"T.runTests=options=>{if(!OP.fiscalTests)throw Error('Componente de testes não carregado. Atualize a página.');return OP.fiscalTests.run(options);};");
 source=source.replace("case'tests':{toast('Executando verificações locais…');await new Promise(r=>setTimeout(r,20));let results=T.runTests();$('#iva-test-results').textContent=results.map(x=>(x.ok?'✓ ':'✗ ')+x.nome+(x.erro?' — '+x.erro:'')).join('\\n')+'\\n\\n'+results.filter(x=>x.ok).length+'/'+results.length+' verificações aprovadas. Testes de software, não certificação fiscal.';M.configurarPrecos(CFG);break;}",
  "case'tests':{if(ST.testsRunning)break;ST.testsRunning=true;const button=$('[data-iva-action=\"tests\"]'),slot=$('#iva-test-results');if(button)button.disabled=true;if(slot)slot.textContent='Carregando a base histórica isolada e preparando os recursos do orçamento…';try{const results=await T.runTests();if(slot?.isConnected!==false)slot.textContent=results.map(x=>(x.ok?'✓ ':'✗ ')+x.nome+(x.erro?' — '+x.erro:'')).join('\\n')+'\\n\\n'+results.filter(x=>x.ok).length+'/'+results.length+' verificações aprovadas. A regressão histórica usa SINAPI 08/2026 e IVA 28%; o cenário atual verifica os novos padrões e o orçamento aberto. Testes de software, não certificação fiscal.';}catch(e){if(slot?.isConnected!==false)slot.textContent='Não foi possível concluir os testes: '+e.message;throw e;}finally{ST.testsRunning=false;if(button)button.disabled=false;M.configurarPrecos(CFG);}break;}")
  .replace('Os testes verificam transição, equivalência dos combustíveis, consistência da soma e reconciliação de custos.','A regressão histórica usa uma base fixa do SINAPI 08/2026 com IVA de 28%, carregada somente ao executar os testes. As verificações atuais conferem os novos padrões, a depreciação progressiva e o orçamento aberto. O catálogo sob demanda não precisa conter todos os insumos da matriz histórica; nenhum orçamento é salvo ou substituído.');
 return source;
}
module.exports={patch};
