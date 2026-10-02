/* ==== 32_tax_abc_core.js — etapa v1.5 incorporada à v1.8 (release 1.8.1) ==== */
(function(G){
  'use strict';
  const OP=G.OP, A=OP.app, ABC=OP.abc, IVA=OP.iva;
  const Q=OP.taxABC={version:'1.8.1',feature:'v1.5 — Curva ABC tributária'};
  const finite=Number.isFinite;
  const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0);
  const usable=z=>!!z&&(z.complete||z.known>0);
  const zero=()=>({creditCents:0,ibsCents:0,cbsCents:0,base:0,complete:true,known:0,missing:0,economic:0,current:0});
  const missing=()=>({...zero(),complete:false,missing:1});
  const currency=v=>finite(v)?v/100:null;
  Q.metrics=Object.freeze({cost:'Valor econômico original',credit:'Crédito de IVA',base:'Base creditável ponderada',ibs:'Crédito de IBS',cbs:'Crédito de CBS',net:'Custo líquido econômico'});
  Q.config=()=>{
    const c=A.pj?.abcTax||{};
    return {version:1,metric:Object.hasOwn(Q.metrics,c.metric)?c.metric:'cost',partial:c.partial==='complete'?'complete':'known',columns:c.columns==='full'?'full':'compact'};
  };
  Q.isActive=()=>Q.config().metric!=='cost';
  Q.save=(key,value)=>{
    const c=Q.config();
    if(key==='metric'&&Object.hasOwn(Q.metrics,value))c.metric=value;
    else if(key==='partial'&&['complete','known'].includes(value))c.partial=value;
    else if(key==='columns'&&['compact','full'].includes(value))c.columns=value;
    else return false;
    A.pj.abcTax=c;OP.ui.saveSoon();return true;
  };
  // Presentation cache only. No changes to prices, coefficients, BDI or the source tax engine.
  const views=new WeakMap();
  Q.detail=(t)=>{
    if(views.has(t))return views.get(t);
    const d=IVA.evaluate(t.e,t.year,true);
    const weights=d.lines.map(x=>x.completo&&finite(x.baseCreditavel)?x.baseCreditavel:0);
    const target=Math.round(sum(weights,x=>x)*100);
    if(!Number.isSafeInteger(target)||weights.some(x=>x<0))throw new Error('Base ponderada fora da precisão suportada pela curva.');
    const assigned=ABC.allocate(weights,target);
    if(!assigned)throw new Error('Não foi possível conciliar os centavos da base ponderada.');
    const service=new Map(),input=new Map();
    d.lines.forEach((x,i)=>{
      x.abcBaseCents=assigned[i];
      if(x.completo){service.set(x.oc.originId,(service.get(x.oc.originId)||0)+assigned[i]);input.set(x.oc.abcKey,(input.get(x.oc.abcKey)||0)+assigned[i]);}
    });
    const out={...d,baseByService:service,baseByInput:input,baseTotal:target};views.set(t,out);return out;
  };
  Q.directInput=r=>{
    const entries=[...(r.origins?.values()||[])];
    return entries.length&&entries.every(e=>Number.isSafeInteger(e.allocated))?sum(entries,e=>e.allocated):null;
  };
  Q.netValue=(direct,z,comparable)=>comparable&&finite(direct)&&z?.complete&&Number.isSafeInteger(z.creditCents)?direct-z.creditCents:null;
  /** ABC percentages have only positive, known, included weights as denominator.
   * Null is never a zero. Negative and zero values remain visible, without A/B/C.
   * A partial aggregate can be ranked on its known portion only when explicitly allowed.
   */
  Q.rank=(source,metric='credit',partial='known')=>{
    const rows=source.map((r,i)=>{
      const value=r.values[metric];const excluded=partial==='complete'&&!r.taxComplete&&metric!=='net'&&metric!=='cost';
      if(value!=null&&!Number.isSafeInteger(value))throw new Error('Valor da curva fora da precisão em centavos: '+r.code);
      return {...r,sequence:i,value:value??null,excluded,rank:null,share:null,cumulative:null,cls:'N/D'};
    });
    const included=rows.filter(r=>finite(r.value)&&!r.excluded);
    const total=sum(included,r=>r.value>0?r.value:0);
    if(!Number.isSafeInteger(total))throw new Error('Total da curva fora da precisão suportada.');
    const group=r=>r.excluded?4:r.value==null?3:r.value>0?0:r.value===0?1:2;
    rows.sort((a,b)=>group(a)-group(b)||(a.value!=null&&b.value!=null?b.value-a.value:0)||String(a.num||a.code).localeCompare(String(b.num||b.code),'pt-BR',{numeric:true})||a.sequence-b.sequence);
    let acc=0,n=0;
    for(const r of rows){
      if(r.excluded){r.cls='Excl.';continue;}
      if(r.value==null){r.cls='N/D';continue;}
      if(r.value===0){r.cls='—';continue;}
      if(r.value<0){r.cls='Neg.';continue;}
      const prev=acc;acc+=r.value;r.rank=++n;r.share=r.value/total;r.cumulative=acc/total;
      const bp=BigInt(prev)*100n, bt=BigInt(total); r.cls=bp<bt*80n?'A':bp<bt*95n?'B':'C';
    }
    return {rows,total,knownTotal:sum(included,r=>r.value),negativeTotal:sum(included,r=>r.value<0?r.value:0),excludedKnownTotal:sum(rows,r=>r.excluded&&finite(r.value)?r.value:0),
      positiveCount:n,zeroCount:included.filter(r=>r.value===0).length,negativeCount:included.filter(r=>r.value<0).length,unknownCount:rows.filter(r=>r.value==null&&!r.excluded).length,
      excludedCount:rows.filter(r=>r.excluded).length,partialCount:rows.filter(r=>!r.taxComplete).length,partialRanked:rows.filter(r=>!r.taxComplete&&r.rank!=null).length,
      changes:rows.filter(r=>/^[ABC]$/.test(r.cls)&&/^[ABC]$/.test(r.costClass)&&r.cls!==r.costClass).length};
  };
  Q.compute=(model,type,options={})=>{
    const settings={...Q.config(),...options};
    const tax=options.tax||IVA.budget(model),d=Q.detail(tax),abc=tax.e.abc;
    const comparable=A.pj.iva.priceMode==='budget'&&A.pj.iva.valuation==='budget';
    const input=type==='inputs';
    const mode=options.mode==='reference'?'reference':abc.canAllocate?'budget':'reference';
    const sources=input?abc.rows:model.items.map(r=>({key:r.id,num:r.num,code:r.node.code,source:r.fonte,desc:r.desc,unit:r.unit,qty:r.qty,reference:r.unitCost==null?null:r.total,direct:r.unitCost==null?null:r.direct}));
    const costRanks=ABC.rank(sources,input?mode:'reference'),baseRanks=new Map(costRanks.rows.map(x=>[x.key,x]));
    const taxMap=input?tax.byABC:tax.byService,baseMap=input?d.baseByInput:d.baseByService;
    const rows=sources.map(r=>{
      const z=taxMap.get(r.key)||(r.qty===0?zero():missing());
      const available=usable(z),direct=input?Q.directInput(r):r.direct;
      const costRank=baseRanks.get(r.key);
      const values={cost:costRank?.value??null,credit:available?z.creditCents:null,ibs:available?z.ibsCents:null,cbs:available?z.cbsCents:null,base:available?(baseMap.get(r.key)||0):null,net:Q.netValue(direct,z,comparable)};
      let netReason='';
      if(!comparable)netReason='Referências não homogêneas: o cenário tributário não está conciliado ao orçamento com preços da base ativa.';
      else if(direct==null)netReason='Custo direto não determinado ou apropriação não disponível para todas as origens desta linha.';
      else if(!z.complete)netReason='Crédito parcial ou não determinado: custo líquido não calculado para não presumir a parcela desconhecida.';
      else if(values.net<0)netReason='Crédito estimado superior ao custo apropriado; revisar premissas. Valor negativo preservado e fora das classes A/B/C.';
      return {...r,values,direct,tax:z,taxComplete:!!z.complete,taxKnown:z.known||0,taxMissing:z.missing||0,netReason,
        costValue:costRank?.value??null,costRank:costRank?.rank??null,costClass:costRank?.cls||'S/C',costShare:costRank?.share??null};
    });
    const ranking=Q.rank(rows,settings.metric,settings.partial);
    const totals={base:d.baseTotal,ibs:tax.total.ibsCents,cbs:tax.total.cbsCents,credit:tax.total.creditCents};
    return {...ranking,type,mode,settings,tax,detail:d,abc,model,comparable,totals,
      complete:tax.total.complete,metadata:{project:model.pj.name,ref:model.base.raw.ref,base:model.base.raw.fonte||'SINAPI',uf:model.uf,regime:OP.sinapi.REGIMES[model.rg],year:tax.year,created:new Date().toISOString(),basis:IVA.ui.basis()},
      comparableCost:sum(rows,r=>r.values.net!=null?r.direct:0),comparableCredit:sum(rows,r=>r.values.net!=null?r.values.credit:0),
      knownCost:sum(rows,r=>r.direct!=null?r.direct:0),completeCost:sum(rows,r=>r.taxComplete&&r.direct!=null?r.direct:0)};
  };
  Q.state=()=>{const s=A.abcUi;if(!s?.ready)return null;return Q.compute(OP.ui.model(),s.type,{mode:s.mode});};
  Q.refreshState=s=>{
    const m=OP.ui.model();
    if(s.taxModel===m)return;
    if(s.type==='inputs'){s.result=IVA.budget(m).e.abc;if(s.mode==='budget'&&!s.result.canAllocate)s.mode='reference';}
    else {const rows=m.items.map(r=>({key:r.id,num:r.num,code:r.node.code,source:r.fonte,desc:r.desc,unit:r.unit,qty:r.qty,reference:r.unitCost==null?null:r.total}));s.ranking=ABC.rank(rows);s.metadata={project:m.pj.name,uf:m.uf,regime:OP.sinapi.REGIMES[m.rg],ref:m.base.raw.ref,base:m.base.raw.fonte||'SINAPI'};}
    s.taxModel=m;s.page=1;
  };
  Q.reason=(r,data)=>r.excluded?'Fora do universo selecionado: estimativa incompleta':data.settings.metric==='net'&&r.netReason?r.netReason:!r.taxComplete?(r.taxKnown?'Parcela conhecida; há ocorrências pendentes':'Sem crédito determinado'):r.value===0?'Valor zero neste critério; sem classe ABC':'Estimativa completa no modelo (não é validação fiscal)';
  Q.conditions=(r)=>r.taxComplete?'Estimativa completa':r.taxKnown?'Parcial':'Não determinado';
  Q.snapshot=data=>({version:Q.version,feature:Q.feature,metadata:data.metadata,criterion:data.settings.metric,criterionLabel:Q.metrics[data.settings.metric],partialPolicy:data.settings.partial,
    formulaNet:'Custo direto apropriado - crédito de IVA estimado; indicador comparativo, sem aplicação no orçamento.',classes:'Acumulado anterior <80%: A; <95%: B; restante C. Somente valores positivos incluídos. Zero, negativos, excluídos e não determinados não recebem A/B/C.',
    totalPositive:currency(data.total),totalKnownSigned:currency(data.knownTotal),negativeTotal:currency(data.negativeTotal),excludedKnownTotal:currency(data.excludedKnownTotal),allTaxTotals:Object.fromEntries(Object.entries(data.totals).map(([k,v])=>[k,currency(v)])),complete:data.complete,rows:data.rows.map(r=>({
      key:r.key,rank:r.rank,item:r.num||'',code:String(r.code||''),source:r.source,description:r.desc,nature:r.nature||'',unit:r.unit,quantity:r.qty,
      direct:currency(r.direct),economicReference:currency(r.costValue),base:currency(r.values.base),ibs:currency(r.values.ibs),cbs:currency(r.values.cbs),credit:currency(r.values.credit),net:currency(r.values.net),
      criterionValue:currency(r.value),share:r.share,cumulative:r.cumulative,class:r.cls,costRank:r.costRank,costClass:r.costClass,
      taxStatus:Q.conditions(r),knownOccurrences:r.taxKnown,missingOccurrences:r.taxMissing,excluded:r.excluded,reason:Q.reason(r,data)
    })),scenario:JSON.parse(JSON.stringify(A.pj.iva))});
})(typeof window!=='undefined'?window:globalThis);

