(function(G){
  'use strict';
  const B=G.TransferegovBM||(typeof require==='function'?require('./transferegov-bm.js'):null);
  if(!B)throw Error('Carregue a base TransfereGov antes do PLE.');
  const VERSION='transferegov-ple-2026.1';
  const PO=[...B.PO.slice(0,13),'N° Evento','Evento',...B.PO.slice(13)];
  const CFF=['N° do Evento','Título do Evento','N° da Frente de Obra','Frente de Obra','N° do Período de Conclusão do Evento'];
  const PROFILES={documentation:{name:'Documentação — PO-PLE / CFF-PLE',po:'PO-PLE',cff:'CFF-PLE'},example:{name:'Exemplo oficial — PO-PLE / CFF - PLE',po:'PO-PLE',cff:'CFF - PLE'}};
  const copy=v=>JSON.parse(JSON.stringify(v));
  // Reuse the BM copy-only price/code adapter. PLE has a separate version,
  // configuration, event schedule and audit endpoint; no project engine runs.
  function bmConfig(s,c){const next={...copy(c),version:B.VERSION};next.schedule=B.suggested(s,next);return next;}
  function normalize(s,c){return {...B.normalize(s,c),version:VERSION};}
  function defaults(s){const c=B.defaults(s);c.version=VERSION;c.events=c.groups.map(g=>({id:g.id,number:g.number,name:String(g.name).slice(0,100)}));for(const i of c.items)i.event=i.group;c.schedule=[];return c;}
  function pairs(c){
    const found=new Map();
    for(const item of c.items.filter(i=>i.include))for(const [front,value]of Object.entries(item.allocations||{})){
      if(value===''||value==null)continue;
      const key=String(item.event)+':'+front;
      if(!found.has(key))found.set(key,{event:item.event,front:Number(front),items:[]});
      found.get(key).items.push(item.id);
    }
    return [...found.values()];
  }
  function suggested(s,c){return pairs(c).map(p=>{
    let period=1;
    for(const id of p.items){const r=s.items.find(i=>i.id===id);if(!r)continue;r.periodDays.forEach((days,i)=>{if(days>0)period=Math.max(period,i+1);});}
    return {event:p.event,front:p.front,period};
  });}
  function validateConfiguration(s,c){
    if(c?.version!==VERSION)throw Error('Configuração de outra modalidade; carregue uma configuração PLE.');
    if(!Array.isArray(c.events)||!c.events.length||c.events.length>999||!c.events.every(e=>e&&typeof e.id==='string'&&e.id.length<=100&&typeof e.name==='string'&&e.name.length<=500&&Number.isFinite(Number(e.number))))throw Error('Eventos inválidos na configuração PLE.');
    if(!Array.isArray(c.items)||!c.items.every(i=>typeof i?.event==='string'&&i.event.length<=100))throw Error('Vínculos de eventos inválidos na configuração PLE.');
    if(!Array.isArray(c.schedule)||c.schedule.length>100000||!c.schedule.every(p=>p&&typeof p.event==='string'&&p.event.length<=100&&Number.isFinite(Number(p.front))&&Number.isFinite(Number(p.period))))throw Error('Conclusões inválidas na configuração PLE.');
    B.validateConfiguration(s,bmConfig(s,c));
  }
  function prepare(s,input){
    const c=normalize(s,input),plan=B.prepare(s,bmConfig(s,c));
    const error=(id,message)=>plan.errors.push({id,message});
    plan.version=VERSION;plan.format='PLE';plan.sheetNames=[PROFILES[c.profile]?.po,PROFILES[c.profile]?.cff];
    const events=Array.isArray(c.events)?c.events:[],ids=new Set(),numbers=new Set();
    if(!events.length||events.length>999)error('events','Cadastre de 1 a 999 eventos.');
    for(const e of events){if(typeof e.id!=='string'||!e.id||ids.has(e.id))error('events','Identificadores de eventos devem ser únicos.');ids.add(e.id);if(!Number.isInteger(Number(e.number))||Number(e.number)<1||Number(e.number)>999||numbers.has(Number(e.number)))error('events','Eventos: use números únicos de 1 a 999.');numbers.add(Number(e.number));if(typeof e.name!=='string'||!e.name.trim()||e.name.length>100)error('events','Eventos: informe títulos de até 100 caracteres.');}
    for(const item of plan.items){const ci=c.items.find(i=>i.id===item.id),event=events.find(e=>e.id===ci.event);if(!event)error(item.id,`Item ${item.number}: selecione o evento de execução.`);else Object.assign(item,{eventId:event.id,eventNumber:Number(event.number),eventName:event.name});}
    const completions=[],required=pairs(c),schedule=Array.isArray(c.schedule)?c.schedule:[];
    if(schedule.length>100000||required.length>100000)error('schedule','O PLE permite até 100.000 conclusões por arquivo.');
    for(const pair of required){
      const e=events.find(e=>e.id===pair.event),f=c.fronts.find(f=>Number(f.number)===pair.front),rows=schedule.filter(p=>p.event===pair.event&&Number(p.front)===pair.front);
      if(!e||!f){error('schedule','Há serviço vinculado a evento ou frente inexistente.');continue;}
      if(rows.length!==1){error('schedule',`Evento ${e.number}, frente ${f.number}: informe exatamente um mês de conclusão.`);continue;}
      const period=Number(rows[0].period);
      if(!Number.isInteger(period)||period<1||period>Number(c.duration)){error('schedule',`Evento ${e.number}, frente ${f.number}: mês de conclusão deve estar entre 1 e ${c.duration}.`);continue;}
      completions.push({eventId:e.id,eventNumber:Number(e.number),eventName:e.name,front:Number(f.number),frontName:f.name,period});
    }
    plan.events=events.filter(e=>plan.items.some(i=>i.eventId===e.id)).map(e=>({id:e.id,number:Number(e.number),name:e.name})).sort((a,b)=>a.number-b.number);
    plan.completions=completions.sort((a,b)=>a.eventNumber-b.eventNumber||a.front-b.front);
    // Percentual BM is deliberately absent from PLE: completion is an integer month.
    for(const g of plan.groups)delete g.schedule;
    return plan;
  }
  function workbook(plan){
    if(plan.errors.length)throw Error('Corrija as pendências antes de gerar o PLE.');
    const po=[[...PO]],cff=[[...CFF]],merges=[],cffMerges=[];
    if(plan.profile==='documentation'){po[0][0]='Nível';cff[0][0]='Nº do Evento';cff[0][2]='Nº da Frente de Obra';}
    const money=c=>Number(c)/100;
    for(const group of plan.groups){
      const row=Array(19).fill('');Object.assign(row,{0:'Macrosserviço',1:String(group.number),4:group.name,11:money(group.totalCents)});po.push(row);let index=0;
      for(const item of plan.items.filter(i=>i.group===group.id)){
        const start=po.length+1;index++;
        item.allocations.forEach((f,j)=>{const line=Array(19).fill('');if(!j)Object.assign(line,{0:'Serviço',1:`${group.number}.${index}`,2:item.source,3:item.code,4:item.description,5:Number(item.quantity),6:item.unit,7:money(item.referenceCents),8:money(item.costCents),9:{v:item.bdiPoints/10000,style:2},10:money(item.priceCents),11:money(item.totalCents),12:item.note,13:String(item.eventNumber),14:item.eventName});Object.assign(line,{15:String(f.front),16:f.name,17:Number(f.quantity),18:money(f.totalCents)});po.push(line);});
        if(item.allocations.length>1)for(let col=0;col<15;col++)merges.push(`${String.fromCharCode(65+col)}${start}:${String.fromCharCode(65+col)}${po.length}`);
      }
    }
    for(const event of plan.events){const start=cff.length+1,rows=plan.completions.filter(p=>p.eventId===event.id);rows.forEach((p,j)=>cff.push([j?'':String(event.number),j?'':event.name,String(p.front),p.frontName,String(p.period)]));if(rows.length>1)cffMerges.push(`A${start}:A${cff.length}`,`B${start}:B${cff.length}`);}
    const sheets=[{name:plan.sheetNames[0],rows:po,merges},{name:plan.sheetNames[1],rows:cff,merges:cffMerges}];
    return {sheets,files:B.xlsxFiles(sheets)};
  }
  const api={...B,VERSION,PO,CFF,PROFILES,normalize,defaults,pairs,suggested,validateConfiguration,prepare,workbook};
  G.TransferegovPLE=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
