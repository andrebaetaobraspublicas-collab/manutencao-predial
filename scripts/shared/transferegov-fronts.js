(function(G){
  'use strict';
  const B=G.TransferegovBM||(typeof require==='function'?require('../../apps/api/src/modules/orcapro/legacy/assets/transferegov-bm.js'):null),VERSION='tg-fronts-2026.1',clone=v=>JSON.parse(JSON.stringify(v));
  const stages=s=>(s.stages||s.groups?.map(g=>({id:g.id,number:g.id,name:g.name}))||[]);
  const equal=(a,b)=>B.canonical(a)===B.canonical(b);
  function validate(s,c){
    const d=c.frontDistribution;if(!d)return;
    const ids=new Set(s.items.map(r=>r.id)),stageIds=new Set(stages(s).map(r=>r.id)),fronts=new Set(c.fronts.map(f=>String(f.number))),rule=r=>r==='keep'||r==='dimensions'||(/^front:\d{1,3}$/.test(r)&&fronts.has(r.slice(6)));
    if(d.version!==VERSION||!rule(d.defaultRule)||typeof d.unit!=='string'||d.unit.length>30||typeof d.preserveManual!=='boolean'||!Array.isArray(d.weights)||d.weights.length>999||!d.weights.every(w=>fronts.has(String(w.front))&&typeof w.dimension==='string'&&w.dimension.length<=24)||new Set(d.weights.map(w=>String(w.front))).size!==d.weights.length)throw Error('Parâmetros de dimensão física inválidos.');
    if(!Array.isArray(d.rules)||d.rules.length>10000||new Set(d.rules.map(r=>r.stageId)).size!==d.rules.length||!d.rules.every(r=>stageIds.has(r.stageId)&&(r.rule==='inherit'||rule(r.rule))))throw Error('Regras de etapas incompatíveis com o orçamento.');
    if(!Array.isArray(d.protected)||d.protected.length>10000||!d.protected.every(id=>ids.has(id)))throw Error('Proteções de serviços incompatíveis com o orçamento.');
  }
  function setup(s,c){
    const config=clone(c),old=config.frontDistribution;
    if(old)validate(s,config);
    const defaults=old?null:new Map(B.defaults(s).items.map(r=>[r.id,r])),oldWeights=new Map((old?.weights||[]).map(w=>[String(w.front),w.dimension])),oldRules=new Map((old?.rules||[]).map(r=>[r.stageId,r.rule]));
    const protectedIds=old?.protected||config.items.filter(i=>!equal(i.allocations,defaults.get(i.id)?.allocations)).map(i=>i.id);
    config.frontDistribution={version:VERSION,defaultRule:old?.defaultRule||'keep',unit:old?.unit||'m²',preserveManual:old?.preserveManual!==false,
      weights:config.fronts.map(f=>({front:Number(f.number),dimension:oldWeights.get(String(f.number))||''})),
      rules:stages(s).map(stage=>({stageId:stage.id,rule:oldRules.get(stage.id)||'inherit'})),protected:[...new Set(protectedIds)],...(old?.lastApplied?{lastApplied:old.lastApplied}:{})};return config;
  }
  function apportioned(quantity,weights){
    const q=BigInt(quantity),sum=weights.reduce((n,w)=>n+w.value,0n);if(sum<=0n)throw Error('Informe uma dimensão positiva em pelo menos uma frente.');
    const parts=weights.map(w=>({...w,quantity:q*w.value/sum,remainder:q*w.value%sum})),order=[...parts].sort((a,b)=>a.remainder===b.remainder?a.front-b.front:a.remainder>b.remainder?-1:1);
    let rest=q-parts.reduce((n,p)=>n+p.quantity,0n);for(let i=0;rest>0n;i++,rest--)order[i].quantity++;
    return Object.fromEntries(parts.map(p=>[String(p.front),B.decimal(p.quantity)]));
  }
  function propose(s,input){
    const config=setup(s,input),d=config.frontDistribution,errors=[],rows=[],byStage=new Map(stages(s).map(st=>[String(st.number),st])),rules=new Map(d.rules.map(r=>[r.stageId,r.rule])),byItem=new Map(s.items.map(r=>[r.id,r])),protectedIds=new Set(d.protected);
    if(!config.fronts.length||config.fronts.length>999||config.fronts.some(f=>!Number.isInteger(Number(f.number))||Number(f.number)<1||Number(f.number)>999||!String(f.name||'').trim())||new Set(config.fronts.map(f=>Number(f.number))).size!==config.fronts.length)throw Error('Cadastre frentes com nomes e números únicos de 1 a 999 antes de distribuir.');
    if(config.items.length*config.fronts.length>200000)throw Error('Distribuição limitada a 200.000 combinações de serviço e frente.');
    let weights;
    const dimensions=()=>weights||(weights=d.weights.map(w=>{const text=w.dimension.trim();if(text&&!/^\d{1,9}(?:[.,]\d{1,6})?$/.test(text))throw Error('Dimensões: use até seis casas, valores não negativos e sem separador de milhar.');return{front:w.front,value:text?B.exact(text,1000000n):0n};}));
    for(const item of config.items){if(!item.include)continue;const r=byItem.get(item.id);if(!r)throw Error('Serviço não pertence à fotografia atual.');
      let ancestor;const path=String(r.number).split('.');path.pop();while(path.length){const stage=byStage.get(path.join('.'));if(stage&&rules.get(stage.id)!=='inherit'){ancestor=stage;break;}path.pop();}
      const rule=ancestor?rules.get(ancestor.id):d.defaultRule,record={id:item.id,number:r.number,code:r.code,description:r.description,stage:ancestor?`${ancestor.number} — ${ancestor.name}`:'Critério geral',rule,before:clone(item.allocations),after:clone(item.allocations),quantity:B.decimal(B.truncated(r.quantity)),status:'kept',reason:'Distribuição atual mantida.'};
      if(d.preserveManual&&protectedIds.has(item.id)){record.reason='Ajuste manual protegido.';record.status='protected';}
      else if(rule!=='keep'){
        const shared=/ADMINISTRACAO LOCAL|MOBILIZACAO|DESMOBILIZACAO|CANTEIRO/.test(String(r.description).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase());
        if(rule==='dimensions'&&shared&&!ancestor){record.status='pending';record.reason='Possível serviço compartilhado: defina uma regra específica na etapa ou distribua manualmente.';}
        else try{const q=B.truncated(r.quantity);record.after=rule==='dimensions'?apportioned(q,dimensions()):Object.fromEntries(config.fronts.map(f=>[String(f.number),B.decimal(String(f.number)===rule.slice(6)?q:0n)]));
          record.status=equal(record.before,record.after)?'unchanged':'changed';record.reason=rule==='dimensions'?'Proporção das dimensões físicas; resíduos distribuídos por maiores restos.':'Frente única definida pela regra.';
          item.allocations=clone(record.after);if(!d.preserveManual)protectedIds.delete(item.id);
        }catch(e){record.status='pending';record.reason=e.message;errors.push(e.message);}
      }rows.push(record);
    }
    d.protected=[...protectedIds];const summary={included:rows.length,changed:rows.filter(r=>r.status==='changed').length,protected:rows.filter(r=>r.status==='protected').length,pending:rows.filter(r=>r.status==='pending').length,kept:rows.filter(r=>['kept','unchanged'].includes(r.status)).length};
    d.lastApplied={version:VERSION,defaultRule:d.defaultRule,unit:d.unit,weights:clone(d.weights),rules:clone(d.rules),summary,rows};
    return{config,signature:B.canonical(input),rows,summary,errors:[...new Set(errors)]};
  }
  const api={VERSION,stages,setup,validate,propose,apportioned};G.TransferegovFronts=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
