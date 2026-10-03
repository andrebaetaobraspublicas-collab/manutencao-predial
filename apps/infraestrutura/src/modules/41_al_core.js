/* ==== 41_al_core.js — Administração Local (SICRO, Manual de Custos — Volume 07) ==== */
/* Motor da calculadora "SICRO AL" do usuário, integrado ao OrçaPro Infraestrutura:
 * as regras, tabelas e equações são as do aplicativo original (Volume 07, 2ª edição, e caderno
 * de aplicação); composições e preços passam a vir da base SICRO ativa do OrçaPro. */
(function (G) {
'use strict';
const OP=G.OP; const AL=(OP.al={version:'1.0-orçaplan'});
const SEED=G.OP_DATA.alSeed;
const AR=new Map(SEED.alRates.map(c=>[c.code,c]));
let P=null;
const baseLabel=()=>{const b=OP.app&&OP.app.base;return b?('SICRO '+b.ufs[0]+' '+b.raw.ref+((OP.app.pj&&OP.app.pj.rg)==='CD'?' com desoneração':' sem desoneração')):'base SICRO';};
const baseDate=()=>{const b=OP.app&&OP.app.base;const m=b?/^(\d{2})\/(\d{4})$/.exec(b.raw.ref):null;return m?m[2]+'-'+m[1]:'';};
/* composições da base ativa (produção, FIC e custo unitário) */
const C={get(code){const b=OP.app&&OP.app.base;if(!b)return null;const j=b.compIdx.get(code);if(j==null)return null;const pj=OP.app.pj||{};
  const cost=b.compCost(code,pj.uf||b.ufs[0],pj.rg||'SD');return {code:b.raw.comp.c[j],name:b.raw.comp.d[j],unit:b.unit(j),prod:b.raw.comp.P[j],fic:b.raw.comp.F[j],price:cost==null?NaN:cost/100,A:[],B:[],C:[],D:[],E:[],F:[]};},
 has(code){const b=OP.app&&OP.app.base;return !!(b&&b.compIdx.has(code));},get size(){return OP.app&&OP.app.base?OP.app.base.nComp:0;}};
/* insumos da base ativa: mão de obra (R$/mês ou R$/h) e equipamentos (CHP/CHI) */
const R={get(code){const b=OP.app&&OP.app.base;if(!b)return null;const i=b.insIdx.get(code);if(i==null)return null;const rg=(OP.app.pj&&OP.app.pj.rg)||'SD',cat=b.insCat[i],name=b.raw.ins.d[i],unit=b.insUnit(i);
  if(cat==='eq'){const e=b.eqParts(code,rg);return {code,name,unit:'h',kind:'A',chp:e?e[7]:null,chi:e?e[8]:null};}
  const v=b.insValue(i,rg);return {code,name,unit,kind:'B',price:v==null?null:Number(v)/1e10};}};
const clone=o=>JSON.parse(JSON.stringify(o));const sum=a=>a.reduce((s,v)=>s+v,0);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const round=(v,d=2)=>Math.round((v+Math.sign(v||1)*Number.EPSILON*Math.max(1,Math.abs(v))*4)*10**d)/10**d;
const nfmt=(v,d=2)=>Number.isFinite(v)?v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const money=v=>Number.isFinite(v)?v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
const raw=v=>v===null||v===undefined?'':String(v).replace('.',',');
function number(v){if(typeof v==='number')return v;let s=String(v??'').trim().replace(/\s|R\$/g,'');if(!s)return NaN;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)?Number(s):NaN;}
const uid=()=>crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const safeCode=c=>/^[\w-]{1,50}$/.test(c)&&!['__proto__','constructor','prototype'].includes(c);
const match=(s,q)=>norm(q).split(/\s+/).filter(Boolean).every(k=>norm(s).includes(k));
const option=(v,t,s)=>`<option value="${esc(v)}"${String(v)===String(s)?' selected':''}>${esc(t)}</option>`;
function getComp(code,p=P,draft=null){return draft?.[code]||p?.overrides?.[code]||C.get(code);}
function compCalc(code,p=P){const c=getComp(code,p);if(!c)throw Error('Composição não encontrada na base ativa: '+code);if(!Number.isFinite(c.price))throw Error('Composição sem custo: '+code);return {code,c,parts:{},detail:{},total:round(c.price),totalRaw:c.price};}
function alRate(code,p=P){
 if(p.rates?.[code])return {...(AR.get(code)||{}),...p.rates[code],code};
 if(p.params.costBasis==='book')return AR.get(code)||{code,name:R.get(code)?.name||code,kind:code.startsWith('E')?'equipment':'labor',source:'Sem preço no caderno',missing:true};
 let r=R.get(code);if(!r||code.startsWith('P')&&!/m[eê]s/i.test(r.unit))return {code,name:AR.get(code)?.name||r?.name||code,kind:code.startsWith('E')?'equipment':'labor',source:'Insumo mensalista/veículo não consta da base ativa',missing:true};
 return {...r,kind:r.kind==='A'?'equipment':'labor',source:baseLabel()+' • insumo da base ativa',date:baseDate()};
}
function variableCalc(p){
 let a=p.params,front=[],labs=[],forest=[],issues=[],totals={front:0,soil:0,asphalt:0,concrete:0,forest:0},stages={};const rounded=v=>a.roundMode==='book'?round(v,2):v;
 for(const it of p.items){if(it.enabled===false||it.qty===0)continue;let c=getComp(it.code,p);const ph=it.phMode==='composition'?(c?.prod):it.ph;
  const noFront=['oae','oaeRecovery','conservation','restricted'].includes(a.nature)||WATER.includes(a.nature)||it.stage==='Obras de arte especiais';
  let fm=it.frontMode||'none';if(it.review)issues.push('Revisar enquadramento de '+it.code+' — '+it.name);
  if(fm==='review'||it.labMode==='review')issues.push('Regra de dimensionamento pendente: '+it.code);
  if(!noFront&&['prod','coef'].includes(fm)){let value=NaN,expr='';if(fm==='coef'){value=it.qty*(it.frontCoef||0);expr=`${nfmt(it.qty)} × ${nfmt(it.frontCoef||0,6)}`;}else if(ph>0){value=(it.frontFactor??1)*it.qty/(ph*a.hours);expr=`${nfmt(it.frontFactor??1,2)} × ${nfmt(it.qty)} ÷ (${nfmt(ph,4)} × ${nfmt(a.hours)})`;}
   if(!Number.isFinite(value))issues.push('Produção horária ausente para '+it.code);else{const val=rounded(value);front.push({id:it.id,code:it.code,name:it.name,stage:it.stage,qty:it.qty,unit:it.unit,ph,method:fm,param:fm==='coef'?it.frontCoef:it.frontFactor??1,raw:value,value:val,formula:expr,source:it.frontRef||it.ruleSource});totals.front+=val;stages[it.stage]=(stages[it.stage]||0)+val;}}
  if(!WATER.includes(a.nature)&&['capacity','coef'].includes(it.labMode)){let value=it.labMode==='capacity'?(it.labParam>0?it.qty/it.labParam:NaN):it.qty*(it.labParam||0);if(!Number.isFinite(value))issues.push('Capacidade de laboratório inválida: '+it.code);else{const val=rounded(value),type=it.lab||'concrete';labs.push({id:it.id,code:it.code,name:it.name,stage:it.stage,qty:it.qty,unit:it.unit,ph,method:it.labMode,param:it.labParam,raw:value,value:val,lab:type,formula:`${nfmt(it.qty)} ${it.labMode==='capacity'?'÷':'×'} ${nfmt(it.labParam,6)}`,source:it.labRef||it.ruleSource});totals[type]+=val;}}
  if(!WATER.includes(a.nature)&&it.forest){if(!(ph>0))issues.push('Produção do manejo florestal ausente: '+it.code);else{let value=it.qty/(ph*a.hours),val=rounded(value);forest.push({id:it.id,code:it.code,name:it.name,stage:it.stage,qty:it.qty,unit:it.unit,ph,raw:value,value:val,formula:`${nfmt(it.qty)} ÷ (${nfmt(ph,4)} × ${nfmt(a.hours)})`,source:'Manual, Equação 16; '+(it.phSource||'produção da composição')});totals.forest+=val;}}
 }
 for(const k in totals)totals[k]=rounded(totals[k]);return {front,labs,forest,totals,stages,issues};
}
function teamTemplates(p,v){const a=p.params,n=a.nature,size=sizeOf(n,a.length,a.execMonths).index,cs=sizeOf('oae',a.oaeLength,a.oaeMonths).index;let groups=[];
 const labor=(code,q)=>({code,q,kind:'labor'}),vehicle=(code,q)=>({code,q,kind:'vehicle'}),productive=(code,q)=>({code,q,kind:'productive'});
 const add=(id,name,parcel,qty,unit,rows,ref,roundMonthly=false)=>{const e=p.teamEdits?.[id]||{};groups.push({id,name,parcel,qty:e.qtyOverride??qty,autoQty:qty,unit,rows:clone(e.rows||rows),ref,roundMonthly,edited:!!p.teamEdits?.[id],justification:e.justification||''});};
 function fixed(s,aux=false){let rows=[];if(!aux)rows.push(labor(s===0?'P9819':'P9955',1),labor('P9840',1),labor('P9897',1),labor('P9958',s+1),labor('P9959',1));rows.push(labor('P9946',s),labor('P9903',s+2));if(!aux)rows.push(labor('P9883',1),labor('P9809',s?1:0),labor('P9896',2*(s+1)),labor('P9827',2*(s+1)));rows.push(labor('P9806',1),labor('P9803',1),labor('P9842',s+1));return rows.filter(r=>r.q>0);}
 if(n==='custom')add('customFixed','Equipe própria de administração local','Fixa',a.fixedMonths,'mês',[],'Manual, seção 2.1.6: composição específica para obra não convencional.',true);
 const topo=(s=0,restricted=false)=>[labor('P9949',s===2?2:1),labor('P9950',s===2?4:2),...(!restricted?[labor('P9948',s===2?2:1),vehicle('E9131',s===2?2:1)]:[])];
 const oae=(s=0)=>[labor('P9869',1),labor('P9875',s+1),labor('P9804',s+1),vehicle('E9093',1)];
 if(['construction','restoration','oae','oaeRecovery','rail'].includes(n)){
  add('fixedLabor','Parcela fixa • mão de obra','Fixa',a.fixedMonths,'mês',fixed(size),'Manual, Tabela 5',true);
  add('fixedVehicles','Parcela fixa • veículos','Fixa',a.fixedMonths,'mês',[vehicle('E9093',size+3),vehicle('E9240',size+1),vehicle('E9557',1)],'Manual, Tabela 5; seção 3.5',true);
  if(['construction','restoration','rail'].includes(n))add('earth','Produção de terraplenagem','Vinculada',a.earthMonths,'mês',[labor('P9884',1),vehicle('E9093',1)],'Manual, Tabela '+(n==='rail'?18:15));
  if(n==='rail')add('pavement','Superestrutura ferroviária','Vinculada',a.paveMonths,'mês',[labor('P9901',1),labor('P9875',1),labor('P9804',1),vehicle('E9093',1)],'Manual, Tabela 18');
  else if(['construction','restoration'].includes(n))add('pavement','Produção de pavimentação','Vinculada',a.paveMonths,'mês',[labor('P9893',1),vehicle('E9093',1)],'Manual, Tabela 15');
  else add('oaeMain','Produção de OAE','Vinculada',a.execMonths,'mês',oae(size),'Manual, Tabela 17');
  add('topography','Topografia','Vinculada',a.topoMonths,'mês',topo(size),'Manual, Tabela 19');
 }else if(n==='conservation'){
  add('fixedLabor','Parcela fixa • mão de obra','Fixa',a.fixedMonths,'mês',[labor('P9819',.25),labor('P9958',1),labor('P9806',1),labor('P9803',1),labor('P9842',1)],'Manual, Tabela 6',true);
  add('fixedVehicles','Parcela fixa • veículos','Fixa',a.fixedMonths,'mês',[vehicle('E9093',1.25),vehicle('E9239',1)],'Manual, Tabela 6',true);
  const cp=Math.max(1,a.laneKm/200);add('conservation','Produção de conservação','Vinculada',a.fixedMonths,'mês',[labor('P9916',cp),labor('P9875',2*cp),vehicle('E9093',cp)],'Manual, Tabela 16; CP = máximo(1; km de faixas / 200)');
 }else if(SIMPLE.includes(n)){
  add('fixedLabor','Parcela fixa • mão de obra','Fixa',a.fixedMonths,'mês',[labor('P9819',.25),labor('P9840',1),...(!a.housing?[labor('P9958',1)]:[]),labor('P9842',1)],'Manual, Tabela 14. Motorista P9958 conforme o caderno; E9958 na tabela do manual é divergência registrada.',true);
  add('fixedVehicles','Parcela fixa • veículos','Fixa',a.fixedMonths,'mês',[vehicle('E9093',1.25),...(!a.housing?[vehicle('E9239',1)]:[])],'Manual, Tabela 14 e nota 1',true);
  add('topography','Topografia','Vinculada',a.topoMonths,'mês',topo(0,n==='restricted'),'Manual, Tabela 20');
 }else if(WATER.includes(n)){
  let rows={rockWater:[['P9819',1],['P9946',1],['P9840',1],['P9933',1],['P9804',1],['P9809',1],['P9803',1],['P9806',2],['P9827',2]],hopper:[['P9812',1],['P9837',1],['P9903',1],['P9814',2],['P9809',1],['P9803',1],['P9806',1]],suction:[['P9812',1],['P9803',1],['P9806',1],['P9814',2]],clamshell:[['P9903',1],['P9814',2],['P9809',1],['P9806',1]],moles:[['P9819',1],['P9946',1],['P9837',1],['P9876',1],['P9840',1],['P9933',1],['P9949',1],['P9950',2],['P9804',1],['P9814',4],['P9809',1],['P9803',1],['P9806',2],['P9827',2]]}[n];
  add('fixedLabor','Parcela fixa • equipe de apoio','Fixa',a.fixedMonths,'mês',rows.map(x=>labor(...x)),'Manual, Tabelas 8 a 13; natureza '+NATURES[n],true);
  let vr=n==='clamshell'?[productive('E9536',576)]:n==='suction'?[vehicle('E9093',1),productive('E9536',576)]:[vehicle('E9093',1),vehicle('E9131',1),...(n==='moles'?[productive('E9536',400)]:[])];add('fixedVehicles','Parcela fixa • veículos e embarcação','Fixa',a.fixedMonths,'mês',vr,'Manual, Tabelas 8 a 13; embarcação somente horas produtivas',true);
 }
 if(a.complement&&!WATER.includes(n)&&!['oae','oaeRecovery'].includes(n)){
  add('extraFixedLabor','Complementação OAE • gerência auxiliar','Fixa complementar',a.oaeMonths,'mês',fixed(cs,true),'Manual, seção 2.1.7; Caderno, Tabela 7. Conferir sobreposição.',true);
  add('extraFixedVehicles','Complementação OAE • veículos','Fixa complementar',a.oaeMonths,'mês',[vehicle('E9093',cs)],'Caderno, Tabela 8',true);
  add('extraOAE','Complementação OAE • produção','Vinculada complementar',a.oaeMonths,'mês',oae(cs),'Manual, Tabela 17; Caderno, Tabela 11');
  add('extraTopo','Complementação OAE • topografia','Vinculada complementar',a.oaeMonths,'mês',topo(cs),'Manual, seção 2.1.7 e Tabela 19; Caderno, Tabela 11');
 }
 if(!WATER.includes(n)){
  const restricted=n==='restricted';const labRows=()=>[labor('P9858',1),labor('P9833',2),...(!restricted?[labor('P9948',1),vehicle('E9131',1)]:[])];
  if(!['restricted','conservation','oae','oaeRecovery'].includes(n))add('front','Acompanhamento das frentes de serviço','Variável',v.totals.front,'equipe × mês',[labor('P9875',1),labor('P9804',.5)],'Manual, Tabela 23 e Equações 4, 6 e 7',true);
  for(const k of ['soil','asphalt','concrete'])add(k,LAB_TYPES[k],'Variável',v.totals[k],'equipe × mês',labRows(),'Manual, Tabela '+(restricted?31:30)+'; Equações 14 e 15');
  add('forest','Controle e manejo florestal','Variável',v.totals.forest,'técnico × mês',[labor('P9947',1)],'Manual, Tabela 44; Equação 16',true);
 }
 const cac0=a.covered/(SIMPLE.includes(n)?AREA_REFS.punctualCovered:AREA_REFS.covered),cad0=a.uncovered/AREA_REFS.uncovered,rr=x=>a.roundMode==='book'?round(x,2):x;
 const cac=rr(cac0),cad=rr(cad0);
 if(!WATER.includes(n)){
  const f=n==='conservation'?.1:(SIMPLE.includes(n)?.1:.2)*cac;
  add('maintenanceLabor','Manutenção do canteiro • mão de obra','Manutenção',a.maintenanceMonths,'mês',[labor('P9953',f),labor('P9952',f),labor('P9954',f)],'Manual, Tabelas 46–49 e Equação 19',true);
  if(!SIMPLE.includes(n)){const cf=n==='conservation'?.5:cad;add('maintenanceVehicles','Manutenção do canteiro • equipamentos','Manutenção',a.maintenanceMonths,'mês',[productive('E9686',11*cf),productive('E9669',22*cf),productive('E9524',11*cf)],'Manual, Tabelas 47 e 48; somente horas produtivas',true);}
 }
 return {groups,cac,cad,cac0,cad0,add};
}
function calculateAL(p=P){
 const a=p.params,v=variableCalc(p),built=teamTemplates(p,v),groups=built.groups,issues=[...v.issues],rateMissing=new Set(),warnings=[];
 const fhead=parcel=>sum(groups.filter(g=>parcel.includes(g.parcel)&&g.qty>0).map(g=>sum(g.rows.filter(r=>r.kind==='labor').map(r=>r.q))));
 const QF=fhead(['Fixa','Fixa complementar']),QVi=fhead(['Vinculada','Vinculada complementar']);
 const periods={front:a.frontMonths,soil:a.soilMonths,asphalt:a.asphaltMonths,concrete:a.concreteMonths,forest:a.forestMonths};
 const workforce=groups.filter(g=>g.parcel==='Variável').map(g=>{const count=sum(g.rows.filter(r=>r.kind==='labor').map(r=>r.q)),duration=periods[g.id]||0;if(g.qty>0&&duration<=0)issues.push('Informe o período de atuação de '+g.name);return {id:g.id,name:g.name,headcount:count,teams:g.qty,months:duration,average:duration>0?count*g.qty/duration:0};});
 const QVaRaw=sum(workforce.map(r=>r.average)),QVa=Math.ceil(QVaRaw-1e-10),qmEstimated=Math.ceil(Math.ceil(a.ordinary*1.33-1e-10)+QF+QVi+Math.ceil(QVa*1.33-1e-10)-1e-10),QM=a.peakMode==='informed'?a.peakInput:qmEstimated;
 if(a.peakMode==='informed'&&!(a.peakInput>0))issues.push('Informe o número total de profissionais no pico obtido pelo histograma.');
 if(QM>500&&!(p.teamEdits?.safety?.rows?.length&&p.teamEdits.safety.justification?.trim()))issues.push('Mais de 500 profissionais: Tabela 22 do manual não cobre esta faixa. Dimensione a equipe de segurança manualmente e registre a justificativa.');
 let tst=QM>500?null:a.risk===3?(QM<=100?0:QM<=250?1:2):(QM<=100?1:QM<=250?2:3);
 let part=QM>100&&a.risk===4?(a.roundMode==='book'?round(3/a.dailyHours,2):3/a.dailyHours):0;
 if(!WATER.includes(a.nature)&&a.nature!=='custom'){built.add('safety','Medicina e segurança do trabalho','Vinculada',a.safetyMonths,'mês',[{code:'P9876',q:tst??0,kind:'labor'},{code:'P9864',q:part,kind:'labor'},{code:'P9851',q:part,kind:'labor'}],'Manual, Tabela 22 (até 500 trabalhadores). Dimensionamento referencial, sujeito à norma aplicável.',true);}
 else if(WATER.includes(a.nature))warnings.push('Obra hidroviária: equipe fixa própria, sem parcelas vinculada/variável automáticas. Verifique requisitos específicos e profissionais adicionais no projeto.');
 if(a.nature==='continuous'&&a.length*12/a.execMonths>5)issues.push('Intervenção contínua supera 5 km por ano: rever enquadramento (Manual, Tabela 4).');
 if(a.complement&&['oae','oaeRecovery'].includes(a.nature))warnings.push('A natureza principal já é OAE; a complementação OAE não é duplicada.');
 if(a.nature==='custom'&&!p.teamEdits?.customFixed?.justification?.trim())issues.push('Empreendimento não convencional: adapte a equipe própria e justifique o dimensionamento.');
 const linePrice=r=>{let rate=alRate(r.code,p),name=r.name||rate.name||r.code,value=NaN,hop=r.hop??a.hop,hip=r.hip??a.hip;
  if(r.kind==='composition'){try{value=(r.price??compCalc(r.code,p).total);}catch(e){issues.push(e.message);}}
  else if(r.kind==='manual'||r.kind==='labor')value=r.price??rate.price;
  else if(r.kind==='vehicle')value=(Number.isFinite(r.chp??rate.chp)?(r.chp??rate.chp)*hop:hop===0?0:NaN)+(Number.isFinite(r.chi??rate.chi)?(r.chi??rate.chi)*hip:hip===0?0:NaN);
  else if(r.kind==='productive')value=r.chp??rate.chp;
  if(!Number.isFinite(value)&&r.q>0)rateMissing.add(r.code);return {...r,name,rate,hop,hip,unitRate:Number.isFinite(value)?value:0,missing:!Number.isFinite(value)&&r.q>0,cost:r.q*(Number.isFinite(value)?value:0)};
 };
 for(const g of groups){g.details=g.rows.map(linePrice);g.unitRaw=sum(g.details.map(r=>r.cost));g.costUnit=a.roundMode==='book'&&g.roundMonthly?round(g.unitRaw):g.unitRaw;g.total=round(g.qty*g.costUnit);if(g.qty<0||!Number.isFinite(g.qty))issues.push('Quantidade inválida na equipe '+g.name);}
 // Remove price warnings from inactive teams; rates can be supplied later without hindering a completed scenario.
 rateMissing.clear();for(const g of groups)if(g.qty>0)for(const r of g.details)if(r.missing)rateMissing.add(r.code);
 if(a.miscMode==='percent'&&(p.extras||[]).some(e=>e.misc))warnings.push('Há custos diversos detalhados guardados, mas o método ativo é percentual; esses dispêndios não são somados ao percentual.');
 const extras=(p.extras||[]).map(e=>({...e,total:round(e.qty*e.price)}));
 const subtotal=round(sum(groups.map(g=>g.total))+sum(extras.filter(x=>!x.misc).map(x=>x.total)));
 const misc=a.miscMode==='percent'?round(subtotal*a.miscPct/100):round(sum(extras.filter(x=>x.misc).map(x=>x.total)));
 const total=round(subtotal+misc),bdiValue=round(total*a.bdi/100),price=round(total+bdiValue);
 if(rateMissing.size)issues.push('Preços de administração local ausentes: '+[...rateMissing].join(', ')+'.');
 if(a.hop+a.hip!==a.hours&&Math.abs(a.hop+a.hip-a.hours)>.001)warnings.push('Horas operativas + improdutivas divergem da jornada mensal; ajuste documentado necessário.');
 if(a.dailyHours<3)warnings.push('A dedicação referencial de 3 h supera a jornada diária informada; revise a jornada ou justifique a equipe de segurança.');
 if(a.contractMonths<a.execMonths)issues.push('Prazo contratual menor que a execução.');
 for(const k of ['fixedMonths','earthMonths','paveMonths','topoMonths','maintenanceMonths','safetyMonths','frontMonths','forestMonths','soilMonths','asphaltMonths','concreteMonths','oaeMonths'])if(a[k]>a.execMonths&&a[k]>0)issues.push('Período '+k+' supera o prazo de execução.');
 const parcels={};for(const g of groups)parcels[g.parcel]=(parcels[g.parcel]||0)+g.total;parcels['Custos diversos']=misc;if(extras.some(e=>!e.misc))parcels['Complementos próprios']=sum(extras.filter(e=>!e.misc).map(e=>e.total));
 return {groups,extras,v,workforce,QF,QVi,QVaRaw,QVa,QM,qmEstimated,tst,part,subtotal,misc,total,bdiValue,price,parcels,cac:built.cac,cad:built.cad,cac0:built.cac0,cad0:built.cad0,size:sizeOf(a.nature,a.length,a.execMonths),oaeSize:sizeOf('oae',a.oaeLength,a.oaeMonths),issues:[...new Set(issues)],warnings,missing:[...rateMissing]};
}
/* Administração Local • regras transcritas do Volume 07, 2ª edição, e do caderno anexado.
   Os campos automáticos são sugestões de enquadramento por descrição. A fonte acompanha cada regra. */
const NATURES={construction:'Construção rodoviária',restoration:'Restauração rodoviária',conservation:'Conservação rodoviária',oae:'Construção de OAE',oaeRecovery:'Recuperação / reforço / alargamento de OAE',rail:'Construção ferroviária',continuous:'Intervenção pontual contínua',restricted:'Intervenção pontual restrita',rockWater:'Derrocagem subaquática • apoio em terra',hopper:'Dragagem hopper • apoio em terra',suction:'Dragagem de sucção e recalque • terra e apoio náutico',clamshell:'Dragagem com pontão e clamshell',moles:'Execução de molhes',custom:'Empreendimento não convencional'};
const STAGES=['Terraplenagem','Pavimentação','Drenagem','Obras de arte correntes','Sinalização','Obras complementares','Proteção ambiental','Obras de arte especiais','Superestrutura ferroviária','Outros serviços'];
const WATER=['rockWater','hopper','suction','clamshell','moles'];
const SIMPLE=['continuous','restricted'];
const AREA_REFS={covered:1919.27,uncovered:3838.60,punctualCovered:305.17};
const LAB_TYPES={soil:'Laboratório de solos',asphalt:'Laboratório de asfaltos',concrete:'Laboratório de concreto'};
const FRONT_BODY_PIPE={'0.40':[.00069,0,0],'0.60':[.00124,0,0],'0.80':[.00181,.00356,0],'1.00':[.00239,.00474,.00709],'1.20':[.00297,.00593,.00889],'1.50':[.00384,.00767,.01150]};
const FRONT_MOUTH_PIPE={'0.40':[.00070,0,0],'0.60':[.00171,0,0],'0.80':[.00301,.00316,0],'1.00':[.00473,.00614,.00781],'1.20':[.00696,.00908,.01150],'1.50':[.01196,.01652,.02072]};
const FRONT_BODY_CELL={'1.50':[.00265,.00450,.00643],'2.00':[.00406,.00682,.00970],'2.50':[.00591,.00903,.01291],'3.00':[.00852,.01283,.01839]};
const FRONT_MOUTH_CELL={'1.50':[.01405,.01710,.02138],'2.00':[.02237,.02762,.03386],'2.50':[.03119,.03792,.04733],'3.00':[.04499,.05581,.06709]};
const LAB_BODY_PIPE={'0.40':[.00014,0,0],'0.60':[.00020,0,0],'0.80':[.00028,.00056,0],'1.00':[.00037,.00075,.00113],'1.20':[.00045,.00095,.00144],'1.50':[.00059,.00122,.00185]};
const LAB_MOUTH_PIPE={'0.40':[.00039,0,0],'0.60':[.00096,0,0],'0.80':[.00171,.00180,0],'1.00':[.00273,.00356,.00454],'1.20':[.00407,.00533,.00680],'1.50':[.00757,.00986,.01245]};
const LAB_BODY_CELL={'1.50':[.00107,.00182,.00261],'2.00':[.00171,.00281,.00401],'2.50':[.00258,.00370,.00532],'3.00':[.00390,.00557,.00802]};
const LAB_MOUTH_CELL={'1.50':[.00582,.00704,.00880],'2.00':[.00952,.01170,.01412],'2.50':[.01327,.01583,.01936],'3.00':[.01972,.02380,.02783]};
const PRECAST_CELL={'1.50x1.50':.00195,'2.00x2.00':.00230,'2.50x2.50':.00266,'3.00x3.00':.00330};
const PRECAST_CHANNEL={'1.50x1.50':.00139,'2.00x1.50':.00157,'2.00x2.00':.00192,'2.50x1.50':.00210,'2.50x2.00':.00232,'3.00x1.50':.00251,'3.00x2.00':.00274};
const CAPACITIES=[
 ['soil-normal','Compactação de aterros • Proctor normal','soil','m³',165000,'Tabela 32'],
 ['soil-inter','Compactação de aterros • Proctor intermediário','soil','m³',24300,'Tabela 32'],
 ['subgrade','Regularização do subleito','soil','m²',76500,'Tabela 33'],
 ['reinforce','Reforço do subleito','soil','m³',13900,'Tabela 33'],
 ['lime','Base e sub-base de solo-cal','soil','m³',5100,'Tabela 33'],
 ['base-nomix','Base de solo sem mistura','soil','m³',14100,'Tabela 33'],
 ['subbase-nomix','Sub-base de solo sem mistura','soil','m³',14600,'Tabela 33'],
 ['mix','Base e sub-base estabilizadas com mistura','soil','m³',14600,'Tabela 33'],
 ['slag','Mistura solo–escória de aciaria','soil','m³',13500,'Tabela 33'],
 ['bg','Brita graduada','soil','m³',10700,'Tabela 33'],
 ['macadam','Macadame hidráulico ou seco','soil','m³',25600,'Tabela 33'],
 ['improved','Solo melhorado com cimento','soil','m³',8300,'Tabela 33'],
 ['basecement','Base de solo-cimento','soil','m³',14200,'Tabela 33'],
 ['subcementplant','Sub-base de solo-cimento • usina','soil','m³',6700,'Tabela 33'],
 ['subcementroad','Sub-base de solo-cimento • pista','soil','m³',6300,'Tabela 33'],
 ['recycle','Reciclagem estabilizada granulometricamente','soil','m³',8100,'Tabela 33'],
 ['foamroad','Reciclagem com espuma de asfalto • pista (solos + asfaltos)','soil','m³',4200,'Tabela 33, nota 1'],
 ['foamplant','Reciclagem com espuma de asfalto • usina (solos + asfaltos)','soil','m³',4100,'Tabela 33, nota 1'],
 ['recyclecement','Reciclagem com cimento','soil','m³',5900,'Tabela 33'],
 ['prime','Imprimação com asfalto diluído','asphalt','m²',2164000,'Tabela 34'],
 ['primeEm','Imprimação com emulsão','asphalt','m²',1674000,'Tabela 34'],
 ['tack','Pintura de ligação','asphalt','m²',1906000,'Tabela 34'],
 ['tss-bath','Tratamento simples • banho diluído','asphalt','m²',456000,'Tabela 34'],
 ['tss-bath-poly','Tratamento simples • banho diluído com polímero','asphalt','m²',268000,'Tabela 34'],
 ['tss-cap','Tratamento simples • CAP','asphalt','m²',611000,'Tabela 34'],
 ['tss-cap-poly','Tratamento simples • CAP com polímero','asphalt','m²',409000,'Tabela 34'],
 ['tss-em','Tratamento simples • emulsão','asphalt','m²',584000,'Tabela 34'],
 ['tss-em-poly','Tratamento simples • emulsão com polímero','asphalt','m²',346000,'Tabela 34'],
 ['tsd-bath','Tratamento duplo/triplo • banho diluído','asphalt','m²',111000,'Tabela 34'],
 ['tsd-bath-poly','Tratamento duplo/triplo • banho diluído com polímero','asphalt','m²',105000,'Tabela 34'],
 ['tsd-cap','Tratamento duplo/triplo • CAP','asphalt','m²',135000,'Tabela 34'],
 ['tsd-cap-poly','Tratamento duplo/triplo • CAP com polímero','asphalt','m²',154000,'Tabela 34'],
 ['tsd-em','Tratamento duplo/triplo • emulsão','asphalt','m²',139000,'Tabela 34'],
 ['tsd-em-poly','Tratamento duplo/triplo • emulsão com polímero','asphalt','m²',131000,'Tabela 34'],
 ['asphalt','Concreto asfáltico / reciclado','asphalt','t',6100,'Tabela 34'],
 ['rubber','Concreto asfáltico com borracha','asphalt','t',6600,'Tabela 34'],
 ['polymer','Concreto asfáltico com polímero','asphalt','t',9500,'Tabela 34'],
 ['sand','Areia-asfalto','asphalt','t',7500,'Tabela 34'],
 ['sand-poly','Areia-asfalto com polímero','asphalt','t',6300,'Tabela 34'],
 ['micro-hot-poly','Micro pré-misturado a quente com polímero','asphalt','t',7400,'Tabela 34'],
 ['micro08','Microrrevestimento • 0,8 cm faixa II','asphalt','m²',327000,'Tabela 34'],
 ['micro15','Microrrevestimento • 1,5 cm faixa III','asphalt','m²',186000,'Tabela 34'],
 ['micro20','Microrrevestimento • 2,0 cm faixa II','asphalt','m²',140000,'Tabela 34'],
 ['micro-hot','Micro pré-misturado a quente','asphalt','t',13400,'Tabela 34'],
 ['slurry1','Lama asfáltica • faixa I','asphalt','m²',55000,'Tabela 34'],
 ['slurry2','Lama asfáltica • faixa II','asphalt','m²',56200,'Tabela 34'],
 ['slurry3','Lama asfáltica • faixa III','asphalt','m²',53700,'Tabela 34'],
 ['coldpoly','Pré-misturado a frio com polímero','asphalt','m³',2800,'Tabela 34'],
 ['cold','Pré-misturado a frio convencional','asphalt','m³',3400,'Tabela 34'],
 ['bitmacpoly','Macadame betuminoso com polímero','asphalt','m³',2600,'Tabela 34'],
 ['bitmacA','Macadame betuminoso • faixa A','asphalt','m³',8000,'Tabela 34'],
 ['bitmacB','Macadame betuminoso • faixa B','asphalt','m³',7900,'Tabela 34'],
 ['bitmacC','Macadame betuminoso • faixa C','asphalt','m³',7800,'Tabela 34'],
 ['bitmacD','Macadame betuminoso • faixa D','asphalt','m³',7700,'Tabela 34'],
 ['rigidsmall','Pavimento rígido • equipamento pequeno','concrete','m³',8000,'Tabela 35'],
 ['rigidrail','Pavimento rígido • fôrma-trilho','concrete','m³',13500,'Tabela 35'],
 ['rigidslip','Pavimento rígido • fôrmas deslizantes','concrete','m³',11800,'Tabela 35'],
 ['rigidroll','Pavimento rígido • compactado com rolo','concrete','m³',10000,'Tabela 35'],
 ['concretesubroll','Sub-base de concreto • rolo','concrete','m³',19100,'Tabela 35'],
 ['concretesubvib','Sub-base de concreto • adensado','concrete','m³',7900,'Tabela 35'],
 ['concrete-oae','Concreto estrutural de OAE • central / comercial','concrete','m³',1000,'Tabela 36'],
 ['concrete-oac','Concreto de OAC moldada in loco • betoneira','concrete','m³',1100,'Tabela 37'],
 ['precell','Aduela pré-moldada no canteiro','concrete','m',28200,'Tabela 37'],
 ['prepipe','Tubo pré-moldado no canteiro','concrete','m',109000,'Tabela 37'],
 ['sleeper-wide','Dormente protendido • bitola larga / mista','concrete','un',8200,'Tabela 42'],
 ['sleeper-meter','Dormente protendido • bitola métrica','concrete','un',11500,'Tabela 42'],
 ['othermix','Concreto estrutural • betoneira','concrete','m³',1100,'Tabela 43'],
 ['otherplant','Concreto estrutural • central / comercial','concrete','m³',1000,'Tabela 43']
];
function sizeOf(nature,length,months){const rate=months>0?length*12/months:0;let limits=nature==='restoration'?[20,40]:nature==='oae'?[150,300]:nature==='oaeRecovery'?[200,400]:[15,30];if(SIMPLE.includes(nature)||WATER.includes(nature)||nature==='conservation'||nature==='custom')return {index:0,label:nature==='conservation'?'Sem porte':SIMPLE.includes(nature)?'Pontual':'Específico',rate,limits:null};return {index:rate<=limits[0]?0:rate<=limits[1]?1:2,label:rate<=limits[0]?'Pequeno porte':rate<=limits[1]?'Médio porte':'Grande porte',rate,limits};}
function stageGuess(c){let s=norm(c.name);if(c.code.startsWith('55'))return 'Terraplenagem';if(c.code.startsWith('40'))return 'Pavimentação';if(c.code.startsWith('20'))return 'Drenagem';if(c.code.startsWith('07')||c.code.startsWith('08'))return 'Obras de arte correntes';if(c.code.startsWith('52'))return 'Sinalização';if(c.code.startsWith('37'))return 'Obras complementares';if(c.code.startsWith('44'))return 'Proteção ambiental';return c.stage||'Outros serviços';}
function ruleFor(c,stage=stageGuess(c)){
 const s=norm(c.name),unit=c.unit.replace('m2','m²').replace('m3','m³');let r={frontMode:'none',frontFactor:1,frontCoef:0,labMode:'none',lab:'soil',labParam:0,forest:false,phMode:'composition',ph:c.prod,phSource:'Composição SICRO SP 07/2026 / adaptação do projeto',ruleSource:'Enquadramento sugerido pela descrição; conferir o escopo e a função do serviço.',review:false};
 const cap=id=>{const x=CAPACITIES.find(x=>x[0]===id);if(x&&x[3]===unit)Object.assign(r,{labMode:'capacity',lab:x[2],labParam:x[4],labRef:'Manual, '+x[5]+' • '+x[1]});else r.review=true;};
 if(/desmatamento|destocamento/.test(s)){r.forest=true;r.ruleSource='Manual, seção 3.3.3, Equação 16';return r;}
 if(/compactacao de aterros/.test(s)){r.frontMode='prod';r.frontRef='Manual, seção 3.3.1.1, Equação 4';if(/proctor normal/.test(s))cap('soil-normal');else if(/proctor intermediario/.test(s))cap('soil-inter');else r.review=true;return r;}
 const pipe=s.match(/(corpo|boca) de b([sdt])tc.*?d\s*=\s*([\d.,]+)/);
 const cell=s.match(/(corpo|boca) de b([sdt])cc\s*([\d.,]+)\s*x\s*([\d.,]+)/);
 if(pipe){const mouth=pipe[1]==='boca',i='sdt'.indexOf(pipe[2]),dia=number(pipe[3]).toFixed(2),f=(mouth?FRONT_MOUTH_PIPE:FRONT_BODY_PIPE)[dia]?.[i],l=(mouth?LAB_MOUTH_PIPE:LAB_BODY_PIPE)[dia]?.[i];if(f)Object.assign(r,{frontMode:'coef',frontCoef:f,frontRef:'Manual, Tabela '+(mouth?26:25)});else r.review=true;if(l)Object.assign(r,{lab:'concrete',labMode:'coef',labParam:l,labRef:'Manual, Tabela '+(mouth?39:38)+' • verificar fornecimento comercial e berço moldado no local'});r.ruleSource='Classificação de bueiro tubular por tipo e diâmetro. Coeficientes da composição do dispositivo, não do tubo isolado.';return r;}
 if(cell){const mouth=cell[1]==='boca',i='sdt'.indexOf(cell[2]),w=number(cell[3]).toFixed(2),h=number(cell[4]).toFixed(2),pre=/pre-mold/.test(s);let f=0,l=0;if(mouth){if(w===h){f=FRONT_MOUTH_CELL[w]?.[i];l=LAB_MOUTH_CELL[w]?.[i];}}else if(pre){if(i===0)f=(/canal/.test(s)?PRECAST_CHANNEL:PRECAST_CELL)[w+'x'+h];r.review=true;}else if(w===h){f=FRONT_BODY_CELL[w]?.[i];l=LAB_BODY_CELL[w]?.[i];}if(f)Object.assign(r,{frontMode:'coef',frontCoef:f,frontRef:'Manual, Tabela '+(mouth?29:pre?28:27)});else r.review=true;if(l)Object.assign(r,{labMode:'coef',lab:'concrete',labParam:l,labRef:'Manual, Tabela '+(mouth?41:40)});r.ruleSource='Bueiro celular: conferência das dimensões, moldagem local / pré-moldado e responsabilidade do controle tecnológico.';return r;}
 if(/^meio-fio|^sarjeta|^valeta/.test(s)&&unit==='m'){let v=/^meio-fio/.test(s)?.00010:/^sarjeta/.test(s)?(/concreto/.test(s)?.00020:.00004):(/concreto/.test(s)?.00029:.00006);Object.assign(r,{frontMode:'coef',frontCoef:v,frontRef:'Manual, Tabela 24',ruleSource:'Somente dispositivos lineares de drenagem; dispositivos periféricos não somados novamente.'});return r;}
 if(/bueiro metalico|corpo de b.*tm/.test(s)){r.frontMode='prod';r.frontRef='Manual, seção 3.3.1.4.3';return r;}
 if(stage==='Pavimentação'&&!/aquisicao|transporte/.test(s)){r.frontMode='prod';r.frontRef='Manual, seção 3.3.1.2';}
 if(['Sinalização','Obras complementares','Proteção ambiental'].includes(stage)){r.frontMode='prod';r.frontFactor=.2;r.frontRef='Manual, seção 3.3.1.5, Equação 7';}
 if(/regularizacao do subleito/.test(s))cap('subgrade');
 else if(/reforco do subleito/.test(s))cap('reinforce');
 else if(/reciclagem.*espuma/.test(s))cap(/usina/.test(s)?'foamplant':'foamroad');
 else if(/reciclagem.*cimento/.test(s))cap('recyclecement');
 else if(/reciclagem.*granulometric/.test(s))cap('recycle');
 else if(/solo.cal/.test(s))cap('lime');
 else if(/solo melhorado com cimento/.test(s))cap('improved');
 else if(/solo.cimento/.test(s))cap(/sub-base/.test(s)?(/usina/.test(s)?'subcementplant':'subcementroad'):'basecement');
 else if(/brita graduada/.test(s)&&!/cimento/.test(s))cap('bg');
 else if(/macadame hidraulico|macadame seco/.test(s))cap('macadam');
 else if(/estabilizada.*escoria/.test(s))cap('slag');
 else if(/estabilizada.*mistura/.test(s))cap(/sem mistura/.test(s)?(/sub-base/.test(s)?'subbase-nomix':'base-nomix'):'mix');
 else if(/imprimacao/.test(s))cap(/emulsao/.test(s)?'primeEm':'prime');
 else if(/^pintura de ligacao/.test(s))cap('tack');
 else if(/tratamento superficial/.test(s)){let key=/simples/.test(s)?'tss':'tsd';key+=/banho diluido/.test(s)?'-bath':/emulsao/.test(s)?'-em':'-cap';if(/polimero/.test(s))key+='-poly';cap(key);}
 else if(/concreto asfaltico/.test(s)&&!/^usinagem/.test(s))cap(/borracha/.test(s)?'rubber':/polimero/.test(s)?'polymer':'asphalt');
 else if(/^areia.asfalto/.test(s))cap(/polimero/.test(s)?'sand-poly':'sand');
 else if(/microrrevestimento/.test(s))cap(/0,8|0.8/.test(s)?'micro08':/1,5|1.5/.test(s)?'micro15':'micro20');
 else if(/lama asfaltica/.test(s))cap(/faixa iii/.test(s)?'slurry3':/faixa ii/.test(s)?'slurry2':'slurry1');
 else if(/pre-misturado a frio/.test(s))cap(/polimero/.test(s)?'coldpoly':'cold');
 else if(/^concreto.*pavimento rigido/.test(s))cap(/formas deslizantes/.test(s)?'rigidslip':/forma-trilho/.test(s)?'rigidrail':/rolo/.test(s)?'rigidroll':'rigidsmall');
 else if(/^concreto.*fck/.test(s)&&unit==='m³'){cap(stage==='Obras de arte especiais'?'concrete-oae':/betoneira/.test(s)?'othermix':'otherplant');r.review=stage!=='Obras de arte especiais';r.ruleSource='Confirmar função estrutural e evitar duplicar volumes de confecção / lançamento. Manual, seção 3.3.2.4.';}
 else if(stage==='Pavimentação')r.review=true;
 r.ruleSource+=(r.frontRef?' '+r.frontRef+'.':'')+(r.labRef?' '+r.labRef+'.':'');return r;
}

const REFERENCE_IDS=['fixedLabor','fixedVehicles','extraFixedLabor','extraFixedVehicles','earth','pavement','topography','safety','extraOAE','extraTopo','front','soil','asphalt','concrete','forest','maintenanceLabor','maintenanceVehicles'];
function runSelfTests(){const out=[],check=(name,fn)=>{try{const v=fn();out.push({name,pass:v!==false,detail:v===false?'Resultado divergente':''});}catch(e){out.push({name,pass:false,detail:e.message});}},near=(a,b,t=.005)=>Math.abs(a-b)<=t;let p=clone(SEED.example),r=calculateAL(p);
 check('Custo total do caderno: R$ 13.046.028,31',()=>near(r.total,13046028.31));check('Subtotal anterior aos custos diversos',()=>near(r.subtotal,12424788.87));check('Diversos de 5% sobre o subtotal',()=>near(r.misc,621239.44));check('Porte principal: 25 km/ano, médio',()=>r.size.index===1&&r.size.rate===25);check('Porte OAE: 216 m/ano, médio',()=>r.oaeSize.index===1&&r.oaeSize.rate===216);
 for(const [k,n]of Object.entries({front:142.33,soil:48.18,asphalt:17.05,concrete:6.58,forest:15.26}))check('Demanda '+k+' = '+n,()=>near(r.v.totals[k],n,.000001));
 check('Pico de mão de obra: 335',()=>r.QM===335);check('Parcela fixa: 32 pessoas',()=>r.QF===32);check('Vinculada antes da segurança: 15 pessoas',()=>r.QVi===15);check('Parcela variável: 27 pessoas inteiras',()=>r.QVa===27);check('CAC: 1,25',()=>r.cac===1.25);check('CAD: 0,94',()=>r.cad===.94);check('Segurança grau 4: três técnicos',()=>r.tst===3);check('Dedicação demonstrativa: 0,38',()=>r.part===.38);
 SEED.referenceRows.forEach((v,i)=>check('Conferência do caderno, item '+v.item,()=>near(r.groups.find(g=>g.id===REFERENCE_IDS[i])?.total,v.total)));
 check('BDI 25% não altera o custo direto',()=>{let q=clone(p);q.params.bdi=25;let v=calculateAL(q);return v.total===r.total&&near(v.price,16307535.39);});
 check('Parcela variável não é multiplicada de novo pelo período',()=>{let q=clone(p);q.params.frontMonths=11;let v=calculateAL(q);return v.groups.find(g=>g.id==='front').total===r.groups.find(g=>g.id==='front').total&&v.workforce.find(g=>g.id==='front').average>r.workforce.find(g=>g.id==='front').average;});
 check('Conservação: sem topografia e sem frente variável duplicada',()=>{let q=clone(p);q.params.nature='conservation';q.params.risk=3;q.params.complement=false;return !calculateAL(q).groups.some(g=>g.id==='topography')&&calculateAL(q).v.front.length===0;});
 check('Conservação: mínimo uma equipe até 200 km-faixa',()=>{let q=clone(p);q.params.nature='conservation';q.params.laneKm=100;q.params.complement=false;let a=calculateAL(q).groups.find(g=>g.id==='conservation');return a&&a.rows.find(r=>r.code==='P9916').q===1;});
 check('Intervenção restrita: laboratório sem van/motorista',()=>{let q=clone(p);q.params.nature='restricted';q.params.complement=false;return calculateAL(q).groups.find(g=>g.id==='soil').rows.length===2;});
 check('Intervenção restrita com alojamento: sem miniônibus',()=>{let q=clone(p);q.params.nature='restricted';q.params.complement=false;q.params.housing=true;return !calculateAL(q).groups.find(g=>g.id==='fixedVehicles').rows.some(r=>r.code==='E9239');});
 
 check('Acima de 500 profissionais: não extrapola Tabela 22',()=>{let q=clone(p);q.params.peakMode='informed';q.params.peakInput=501;return calculateAL(q).issues.some(s=>s.includes('500'));});
 
 
 
 check('Base SICRO ativa: composições conferidas com o relatório oficial',()=>{const v=OP.app.base?.raw?.valid;return !!v&&v.ok===v.total&&v.total>0;});
 check('Não há pendências de cálculo de AL no exemplo original',()=>r.issues.length===0);return out;}

/* ---------- interface pública ---------- */
AL.SEED=SEED;AL.NATURES=NATURES;AL.STAGES=STAGES;AL.LAB_TYPES=LAB_TYPES;AL.CAPACITIES=CAPACITIES;AL.WATER=WATER;AL.SIMPLE=SIMPLE;AL.AREA_REFS=AREA_REFS;AL.REFERENCE_IDS=REFERENCE_IDS;
AL.calculate=p=>{P=p;return calculateAL(p);};
AL.alRate=(code,p)=>alRate(code,p||P);
AL.ruleFor=(c,stage)=>ruleFor(c,stage);AL.stageGuess=c=>stageGuess(c);AL.sizeOf=(n,l,m)=>sizeOf(n,l,m);
AL.selfTests=()=>runSelfTests();AL.round=round;AL.clone=clone;AL.number=number;
})(typeof window!=='undefined'?window:globalThis);

