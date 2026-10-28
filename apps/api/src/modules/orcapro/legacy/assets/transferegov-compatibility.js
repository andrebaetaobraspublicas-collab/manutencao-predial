(function(G){
  'use strict';
  const B=G.TransferegovBM||(typeof require==='function'?require('./transferegov-bm.js'):null),VERSION='tg-compatible-2026.1';
  const clone=x=>JSON.parse(JSON.stringify(x)),amount=x=>Number(BigInt(x))/100;
  function makeDocument(source,rows,provenance){
    const data=clone(source),by=new Map(),seen=new Set();
    if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw Error('Normalização limitada a 10.000 serviços.');
    for(const r of rows){if(!r||typeof r.id!=='string'||by.has(r.id)||!/^\d{1,8}\.\d{2}$/.test(r.quantity)||!/^\d{1,10}\.\d{2}$/.test(r.cost))throw Error('Quantidade ou custo inválido na cópia compatível.');by.set(r.id,r);}
    const changes=[];let initialTotal=0n;
    const walk=n=>{for(const child of n.children||[]){if(child.kind==='stage'){walk(child);continue;}const row=by.get(child.id);if(!row||seen.has(child.id))throw Error('Os serviços da normalização não correspondem ao orçamento salvo.');seen.add(child.id);
      changes.push({id:child.id,code:String(child.code||''),originalQuantity:child.qty,quantity:row.quantity,originalCost:child.custo??null,cost:row.cost,periodicDisabled:!!child.work?.periodic?.enabled});
      const q=B.exact(row.quantity),cost=B.exact(row.cost),bdi=B.truncated(child.bdiDif&&source.bdi2!=null?source.bdi2:source.bdi||0,10000n),price=B.round(cost*(10000n+bdi),10000n),total=B.round(q*price,100n);
      if(price>999999999999n||total>999999999999n||bdi>10000n)throw Error('Serviço acima dos limites financeiros do TransfereGov.');initialTotal+=total;
      child.qty=Number(row.quantity);child.custo=Number(row.cost);delete child.referenceLink;delete child.periodMemo;
      if(child.work?.periodic)child.work.periodic.enabled=false;
    }};walk(data.root||{});if(seen.size!==by.size)throw Error('Há serviço que não pertence ao orçamento salvo.');
    const originalBdi=data.bdi,originalBdi2=data.bdi2;
    data.bdi=Number(B.truncated(data.bdi||0,10000n))/10000;
    if(data.bdi2!=null)data.bdi2=Number(B.truncated(data.bdi2,10000n))/10000;
    data.round='round';if(data.crewPlan)data.crewPlan.syncEvents=false;
    delete data.risks;
    if(initialTotal>999999999999n)throw Error('Total acima do limite do TransfereGov.');
    data.transferegovCompatibility={version:VERSION,...clone(provenance),initialTotalCents:String(initialTotal),originalRound:source.round||'round',originalBdi:originalBdi??0,...(originalBdi2==null?{}:{originalBdi2}),changes};
    return data;
  }
  function rows(snapshot){return snapshot.items.map(r=>{if(r.costCents==null)throw Error(`Item ${r.number}: custo adotado ausente.`);return{id:r.id,quantity:B.decimal(B.truncated(r.quantity)),cost:B.decimal(B.truncated(r.costCents,1n))};});}
  function active(project){return project?.transferegovCompatibility?.version===VERSION;}
  function install(O){
    if(!O?.engine||O.transferegovCompatibilityInstalled)return;O.transferegovCompatibilityInstalled=true;
    const compute=O.engine.compute;
    O.engine.compute=function(base,pj){
      if(!active(pj))return compute(base,pj);
      // This arithmetic profile belongs only to an explicitly created copy.
      // The original engines and unmarked projects retain every legacy rule.
      pj.round='round';pj.bdi=Number(B.truncated(pj.bdi||0,10000n))/10000;if(pj.bdi2!=null)pj.bdi2=Number(B.truncated(pj.bdi2,10000n))/10000;
      const walk=n=>{for(const c of n.children||[]){if(c.kind==='stage')walk(c);else{c.qty=amount(B.truncated(c.qty||0));if(c.work?.periodic)c.work.periodic.enabled=false;}}};walk(pj.root||{});
      const m=compute(base,pj);
      for(const r of m.items){if(r.unitCost==null)continue;const cost=B.truncated(r.unitCost,1n),q=B.truncated(r.qty),bdi=B.truncated(r.bdiDif&&pj.bdi2!=null?pj.bdi2:pj.bdi,10000n),price=B.round(cost*(10000n+bdi),10000n);
        r.unitCost=Number(cost);r.unitPrice=Number(price);r.qty=amount(q);r.direct=Number(B.round(q*cost,100n));r.total=Number(B.round(q*price,100n));r.node.custo=amount(cost);delete r.node.referenceLink;if('price'in r)r.price=r.total;
      }
      const sum=(list,key)=>list.reduce((n,r)=>n+BigInt(Math.round(r[key]||0)),0n);
      m.tot.direct=Number(sum(m.items,'direct'));m.tot.price=Number(sum(m.items,'total'));m.tot.bdi=m.tot.price-m.tot.direct;
      for(const s of m.stages||[]){s.total=Number(sum(s.leaf||[],'total'));s.direct=Number(sum(s.leaf||[],'direct'));}
      for(const r of m.flat)r.weight=m.tot.price?r.total/m.tot.price:0;
      if(pj.sanitation?.current){pj.sanitation.current.direct=m.tot.direct;pj.sanitation.current.price=m.tot.price;}
      m.transferegovArithmetic='half-up-2';return m;
    };
  }
  const api={VERSION,makeDocument,rows,active,install};G.TransferegovCompatibility=api;
  if(G.OP)install(G.OP);if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
