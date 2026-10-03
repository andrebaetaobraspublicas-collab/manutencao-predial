(function installLocalRisks(G) {
  'use strict';
  const O=G.OP, A=O.app, U=O.util, UI=O.ui, clone=U.deepClone;
  const VERSION='orcapro-risk-1.0.0';
  const fail=message=>{throw new Error(message);};
  const mod=p=>p.risks?.v===1&&Array.isArray(p.risks.analyses)?p.risks:{v:1,analyses:[]};
  const analysis=(p,id)=>mod(p).analyses.find(a=>a.id===id&&!a.archivedAt)||fail('Análise de riscos não encontrada.');
  const number=(v,min,max,label)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fail(label+' fora do intervalo permitido.');
  const text=(v,max,label)=>typeof v==='string'&&v.length<=max?v:fail(label+' inválido.');
  const option=(v,values)=>values.includes(v)?v:fail('Opção de risco inválida.');
  function validate(c,rows) {
    if(!c||!Array.isArray(c.variables)||!Array.isArray(c.events)||c.variables.length>1000||c.events.length>100)fail('Modelo de riscos inválido.');
    const ids=new Set(rows.map(r=>r.id)),seen=new Set();
    const variable=(v,event=false)=>{
      if(!v||typeof v!=='object')fail('Variável de risco inválida.');
      const id=text(v.id,160,'Identificador');
      if(!/^[A-Za-z0-9_.:-]+$/.test(id)||seen.has(id)||(!event&&!ids.has(id)))fail('Variável duplicada ou ausente na fotografia.');
      seen.add(id);
      const min=number(v.min,event?0:-100,event?1e12:1000,'Mínimo'),mode=number(v.mode,min,event?1e12:1000,'Provável'),max=number(v.max,mode,event?1e12:1000,'Máximo');
      const distribution=option(v.distribution,['triangular','uniforme','pert','normal_truncada','lognormal','fixo']);
      const mean=number(v.mean,event?0:-100,event?1e12:1000,'Média'),sd=number(v.sd,0,event?1e12:1000,'Desvio');
      if(distribution==='normal_truncada'&&(mean<min||mean>max))fail('Média da normal deve estar entre mínimo e máximo.');
      if(distribution==='lognormal'&&mean<=0)fail('Lognormal exige média positiva.');
      return {id,probability:number(v.probability,0,100,'Probabilidade'),min,mode,max,distribution,mean,sd,responsibility:option(v.responsibility,['contratado','compartilhado','administracao']),justification:text(v.justification,1000,'Justificativa')};
    };
    const variables=c.variables.map(v=>{if(typeof v.selected!=='boolean')fail('Seleção inválida.');return {...variable(v),selected:v.selected,type:option(v.type,['variacao_custo_unitario','variacao_quantitativo'])};});
    const events=c.events.map(v=>({...variable(v,true),description:text(v.description,300,'Descrição do evento')}));
    const iterations=number(c.iterations,1000,100000,'Iterações'),seed=number(c.seed,0,2147483647,'Semente');
    if(!Number.isInteger(iterations)||!Number.isInteger(seed))fail('Iterações e semente devem ser inteiros.');
    if(iterations*(variables.filter(v=>v.selected).length+events.length)>10000000)fail('Limite de 10 milhões de sorteios excedido. Reduza serviços ou iterações.');
    return {scope:option(c.scope,['A','AB','ALL']),iterations,seed,percentile:number(c.percentile,50,99,'Percentil'),contract:option(c.contract,['global','preco_unitario']),quantityJustification:text(c.quantityJustification,1000,'Justificativa de quantitativos'),notes:text(c.notes,4000,'Premissas'),variables,events};
  }
  function defaults(rows) {
    return {scope:'A',iterations:10000,seed:20261003,percentile:80,contract:'global',quantityJustification:'',notes:'',events:[],variables:rows.map(r=>({id:r.id,selected:r.abc==='A',probability:100,min:-5,mode:5,max:10,distribution:'triangular',mean:5,sd:2.5,responsibility:'contratado',type:'variacao_custo_unitario',justification:''}))};
  }
  function classify(rows) {
    rows=[...rows].sort((a,b)=>Number(b.directCents)-Number(a.directCents));
    const total=rows.reduce((s,r)=>s+BigInt(r.directCents),0n);let cumulative=0n;
    for(const r of rows){r.abc=total>0n&&cumulative*100n<total*80n?'A':total>0n&&cumulative*100n<total*95n?'B':'C';cumulative+=BigInt(r.directCents);}
    return rows;
  }
  async function fingerprint(context,rows) {
    const raw=JSON.stringify({...context,rows:[...rows].sort((a,b)=>a.id.localeCompare(b.id))});
    if(G.crypto?.subtle){const bytes=await G.crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
    return 'json:'+raw;
  }
  function context() {return {referenceId:String(A.base.raw.fonte||'SICRO')+' '+String(A.base.raw.ref)+' / '+String(A.base.id||'embedded'),uf:A.pj.uf,regime:A.pj.rg};}
  async function snapshot(p=A.pj) {
    const model=p===A.pj?UI.model():O.engine.compute(A.base,p),items=model.items;
    if(!items.length)fail('Inclua ao menos um serviço no orçamento antes de criar a análise.');
    if(items.length>1000)fail('A análise permite até 1.000 serviços.');
    const identify=r=>String(r.node.code||r.id);
    const missing=items.filter(r=>r.unitCost==null);
    if(missing.length)fail('Há '+missing.length+' serviço(s) com preço ausente: '+missing.slice(0,5).map(identify).join(', ')+'. Informe os custos no orçamento.');
    const invalid=items.filter(r=>!Number.isFinite(r.unitCost)||r.unitCost<0||r.unitCost>Number.MAX_SAFE_INTEGER||!Number.isSafeInteger(r.direct)||r.direct<0||!Number.isFinite(r.qty)||r.qty<0);
    if(invalid.length)fail('Custo ou quantidade inválido nos serviços: '+invalid.slice(0,5).map(identify).join(', ')+'.');
    const rows=classify(items.map(r=>({id:r.id,code:String(r.node.code||''),description:r.desc,unit:r.unit,qty:r.qty,unitCostCents:String(r.unitCost),directCents:String(r.direct),abc:''})));
    if(new Set(rows.map(r=>r.id)).size!==rows.length)fail('Há identificadores de serviços duplicados no orçamento.');
    const base=rows.reduce((s,r)=>s+BigInt(r.directCents),0n);
    if(base<=0n||base>BigInt(Number.MAX_SAFE_INTEGER))fail('Custo direto deve ser positivo e estar dentro da precisão permitida.');
    const ctx=context();
    return {...ctx,projectVersion:p.riskRevision||1,capturedAt:new Date().toISOString(),baseCents:base.toString(),rows,fingerprint:await fingerprint(ctx,rows)};
  }
  function input(c,rows) {
    const byId=new Map(c.variables.map(v=>[v.id,v]));
    const services=rows.map(row=>{const v=byId.get(row.id),inScope=c.scope==='ALL'||row.abc==='A'||(c.scope==='AB'&&row.abc==='B');return {id_risco_servico:row.id,descricao:row.description,quantidade:row.qty,custo_unitario:Number(row.unitCostCents)/100,valor_base:Number(row.directCents)/100,selecionado:v?.selected&&inScope?1:0,incluir_contingencia:1,responsavel:v?.responsibility||'contratado',tipo_risco:v?.type||'variacao_custo_unitario',probabilidade:v?.probability??0,minimo:v?.distribution==='fixo'?v.mode:v?.min??0,mais_provavel:v?.mode??0,maximo:v?.distribution==='fixo'?v.mode:v?.max??0,distribuicao:v?.distribution||'fixo',media:v?.mean??0,desvio_padrao:v?.sd??0};});
    const events=c.events.map(v=>({id_evento_risco:v.id,descricao:v.description,probabilidade:v.probability,incluir_contingencia:1,responsavel:v.responsibility,impacto_minimo:v.distribution==='fixo'?v.mode:v.min,impacto_mais_provavel:v.mode,impacto_maximo:v.distribution==='fixo'?v.mode:v.max,distribuicao_impacto:v.distribution,media:v.mean,desvio_padrao:v.sd,estrategia_mitigacao:v.justification}));
    return {analysis:{metodo_escopo:'full',iteracoes:c.iterations,semente:c.seed,percentil_alvo:c.percentile,regime_execucao:c.contract,justificativa_variacao_quantidade:c.quantityJustification,incluir_eventos:1,incluir_quantitativos:1},services,events};
  }
  // Decimal half-up via integer arithmetic: only the statistical sampling uses Float64.
  function cents(value) {
    if(!Number.isFinite(value)||value<0||value*100>Number.MAX_SAFE_INTEGER)fail('Resultado excede a precisão monetária permitida. Reduza os impactos.');
    const [mantissa,e='0']=String(value).split('e'),parts=mantissa.split('.'),digits=BigInt(parts.join('')),power=Number(e)-(parts[1]?.length||0)+2;
    if(power>=0)return (digits*10n**BigInt(power)).toString();
    const divisor=10n**BigInt(-power);return ((digits+divisor/2n)/divisor).toString();
  }
  function summarize(out,baseCents) {
    const targetCents=cents(out.summary.valor_percentil_alvo),delta=BigInt(targetCents)-BigInt(baseCents),contingencyCents=(delta>0n?delta:0n).toString();
    return {...out,baseCents,targetCents,contingencyCents,rate:(Number(contingencyCents)/Number(baseCents)).toFixed(10),engineVersion:VERSION,computedAt:new Date().toISOString(),assumptions:['Variáveis independentes; não há matriz de correlação.','Base: custo direto completo do SICRO, com DMT/FIT/FIC e custos próprios efetivamente adotados. Fora do escopo, os serviços ficam fixos.','Riscos da Administração são excluídos. Em preço unitário, risco de quantitativos exige justificativa.','Lognormal usa média e desvio aritméticos; seus extremos no tornado não são limites de truncamento.','RMS é a raiz da média dos quadrados dos VME: indicador auxiliar, sem nível de confiança.']};
  }
  async function run(c,snap) {
    c=validate(c,snap.rows);const payload=input(c,snap.rows);
    const included=payload.services.some(v=>v.selecionado&&v.responsavel!=='administracao'&&(v.tipo_risco!=='variacao_quantitativo'||c.contract!=='preco_unitario'||c.quantityJustification.trim()));
    if(!included&&!payload.events.some(v=>v.responsavel!=='administracao'))fail('Selecione ao menos um risco do escopo ou cadastre um evento incluído.');
    if(!G.Worker)fail('Este navegador não suporta a simulação isolada. Use Chrome, Edge, Firefox ou Safari atualizado.');
    const source=document.getElementById('orcapro-risk-engine').textContent;
    const code=source+'\nself.onmessage=function(e){try{const p=e.data,E=self.RiscosEngine,r=E.simulateMonteCarlo(p.analysis,p.services,p.events);self.postMessage({summary:r.resumo,tornado:E.buildTornado(p.analysis,p.services,p.events).rows,expected:E.expectedMonetaryValue(p.analysis,p.services,p.events)});}catch(error){self.postMessage({error:error.message});}};';
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
    try{return summarize(await new Promise((resolve,reject)=>{
      let worker,settled=false,timer;
      const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();error?reject(error):resolve(value);};
      try{worker=new Worker(url);timer=setTimeout(()=>finish(new Error('A simulação excedeu 30 segundos. Reduza serviços ou iterações.')),30000);worker.onmessage=e=>finish(e.data.error?new Error(e.data.error):null,e.data);worker.onerror=e=>finish(new Error(e.message||'Falha na simulação isolada.'));worker.postMessage(payload);}catch(e){finish(e);}
    }),snap.baseCents);}finally{URL.revokeObjectURL(url);}
  }
  async function save(project) {
    project.updated=Date.now();project.riskRevision=(A.pj.riskRevision||1)+1;
    await O.store.put('projects',project);A.saveError=false;
    return project;
  }
  function preserve(a,kind){
    const history=a.history||=[];
    if(history.length>=100)fail('Limite de 100 versões locais por análise. Crie outra análise para continuar.');
    history.push({at:new Date().toISOString(),kind,config:clone(a.config),result:a.result?clone(a.result):null});
  }
  async function bdi(p,a,body,apply) {
    if(!a.result)fail('Execute a simulação antes de aplicar ao BDI.');
    const current=await snapshot();
    if(current.fingerprint!==a.snapshot.fingerprint)fail('Quantidades, custos ou referência mudaram. Crie uma nova análise para o orçamento atual.');
    const result=await run(a.config,a.snapshot),rate=Number(result.rate),W=O.bdiui;
    const method=option(body.method,['param','exato','simples']),mode=option(body.mode,['replace','add']);
    const previousCfg=clone(p.bdiCfg?.v===1?p.bdiCfg:W.defaultsFor(UI.model().tot)),cfg=clone(previousCfg);cfg.mode=method;
    const key=method==='exato'?'risco':'r',oldRisk=Number(cfg[method][key]||0);
    number(oldRisk,0,10,'Parcela de risco anterior');
    if(mode==='add'&&oldRisk>0&&!body.confirmDoubleCounting)fail('Confirme a soma de parcelas distintas para evitar dupla contagem.');
    cfg[method][key]=mode==='add'?oldRisk+rate:rate;
    const calc=W.M[method].calc(cfg),newBdi=W.valorAplicado(cfg,calc.bdi);number(newBdi,0,10,'BDI calculado');
    const newModel=O.engine.compute(A.base,{...p,bdiCfg:cfg,bdi:newBdi});
    const preview={method,mode,oldRisk,newRisk:cfg[method][key],rate:result.rate,contingencyCents:result.contingencyCents,oldBdi:Number(p.bdi),newBdi,oldPriceCents:String(UI.model().tot.price),newPriceCents:String(newModel.tot.price),differentiatedBdiPreserved:p.bdi2!=null};
    if(!apply)return preview;
    if(!body.reason?.trim())fail('Informe a justificativa da aplicação ao BDI.');
    if((a.applications||[]).length>=100)fail('Limite de 100 aplicações por análise. Crie outra análise.');
    cfg.applied.p={mode:method,metodo:W.LABEL[method],ano:calc.ano,bdi:calc.bdi,valor:newBdi,ivaeq:calc.ivaeq,date:Date.now(),rows:calc.rows,eq:calc.eq,memoria:calc.memoria||[],riskAnalysisId:a.id};
    p.bdiCfg=cfg;p.bdi=newBdi;a.result=result;
    (a.applications||=[]).push({...preview,id:U.uid('ap'),createdAt:new Date().toISOString(),reason:text(body.reason.trim(),1000,'Justificativa'),previousCfg,riskConfig:clone(a.config),riskResult:clone(result),snapshotFingerprint:a.snapshot.fingerprint});
    return {project:await save(p),preview};
  }
  const C=O.riskLocal={
    get wrapper(){return {id:A.pj.id,version:A.pj.riskRevision||1};},
    async flush(){O.register?.snapshot();try{await O.store.put('projects',A.pj);A.saveError=false;}catch(e){A.saveError=true;throw new Error('Não foi possível salvar a análise neste navegador. Exporte o projeto JSON. '+e.message);}},
    acceptProject(p){A.pj=p;A.model=null;},
    async request(path,request){
      const body=JSON.parse(request.body||'{}'),parts=path.split('/').filter(Boolean),id=parts[2],riskId=parts[4],action=parts[5];
      if(id!==A.pj.id||body.expectedVersion!==(A.pj.riskRevision||1))fail('O orçamento aberto mudou. Reabra a análise.');
      const p=clone(A.pj);
      if(!riskId){
        const name=text(body.name,160,'Nome da análise').trim();if(!name)fail('Nome da análise obrigatório.');
        p.risks=mod(p);if(p.risks.analyses.length>=20)fail('Limite de 20 análises por orçamento.');
        const id=U.uid('risk'),snap=await snapshot();
        p.risks.analyses.push({id,name,createdAt:new Date().toISOString(),engineVersion:VERSION,snapshot:snap,config:defaults(snap.rows),result:null,applications:[],history:[]});
        return {project:await save(p),riskId:id};
      }
      const a=analysis(p,riskId);
      if(await fingerprint({referenceId:a.snapshot.referenceId,uf:a.snapshot.uf,regime:a.snapshot.regime},a.snapshot.rows)!==a.snapshot.fingerprint)fail('Fotografia alterada. Crie uma nova análise.');
      if(!action&&request.method==='PUT'){const valid=validate(body.config,a.snapshot.rows);preserve(a,'modelo');a.config=valid;a.result=null;a.updatedAt=new Date().toISOString();return {project:await save(p)};}
      if(action==='simulate'){a.config=validate(a.config,a.snapshot.rows);const result=await run(a.config,a.snapshot);if(a.result)preserve(a,'simulacao');a.result=result;return {project:await save(p)};}
      if(action==='bdi-preview'||action==='bdi-apply')return bdi(p,a,body,action==='bdi-apply');
      fail('Operação de riscos não reconhecida.');
    },
    // Pure functions are also used by the offline regression harness.
    validate,defaults,classify,input,cents,summarize,fingerprint,snapshot
  };
})(window);
