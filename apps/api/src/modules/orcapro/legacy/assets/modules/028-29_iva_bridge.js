/* 29_iva_bridge.js — Integração OrçaPlan 1.2 / motor Crédito de IVA 2.5.
 * Custos do orçamento em centavos; motor fiscal em reais. Nenhum preço/BDI é alterado.
 * A ABC física é a única árvore: a mesma ocorrência alimenta serviços, insumos e memórias.
 * Contextos (depreciação/juros/manutenção/operador) NÃO são perdidos na agregação por código.
 */
(function(G){'use strict';
 const OP=G.OP,U=OP.util,A=OP.app,M=G.MOTOR,T=OP.iva={version:'1.2',sourceVersion:'2.5'};
 const clone=x=>JSON.parse(JSON.stringify(x)), finite=v=>typeof v==='number'&&Number.isFinite(v), code=v=>/^\d+$/.test(String(v))?+v:String(v);
 let baseRef,customRef,db,projectRef,rawCfgRef,cfg,signature='',graphCache=new Map(),modelCache=new WeakMap(),detailCache=new Map();
 T.invalidate=()=>{signature='';graphCache.clear();modelCache=new WeakMap();detailCache.clear();};
 T.config=()=>{
  if(!A.pj||!A.base)return null;
  if(projectRef!==A.pj||rawCfgRef!==A.pj.iva?.cfg){
   const z=A.pj.iva||{};let safeCfg;
   try{safeCfg=M.validarCfg(z.cfg||M.cfgInicial(A.base.ufs),A.base.ufs);}catch(e){safeCfg=M.cfgInicial(A.base.ufs);A.ivaConfigError='Cenário tributário incompatível: '+e.message;}
   A.pj.iva={version:1,year:M.ANOS.includes(+z.year)?+z.year:2033,priceMode:z.priceMode==='source'?'source':'budget',valuation:z.valuation==='reference'?'reference':'budget',cfg:safeCfg,terminals:{}};
   for(const [k,v] of Object.entries(z.terminals||{}))if(k.length<2000&&v&&Object.hasOwn(M.PERFIS,v.profile))A.pj.iva.terminals[k]={profile:v.profile,note:String(v.note||'').slice(0,1500)};
   projectRef=A.pj;rawCfgRef=A.pj.iva.cfg;cfg=safeCfg;T.invalidate();
  }
  return A.pj.iva;
 };
 T.setup=()=>{
  const z=T.config();if(!z)return null;
  if(baseRef!==A.base||customRef!==A.base.custom){
   const b=A.base,r=b.raw,ii=r.ins,cc=r.comp;
   db={ref:r.ref,emissao:r.emissao,uf:b.ufs.slice(),cap:r.cidades.slice(),cls:r.cls.slice(),un:r.un.slice(),grp:r.grupos.slice(),ins:new Map(),comp:new Map()};
   const prices=a=>(a||[]).map(v=>finite(v)?v/100:null);
   ii.c.forEach((c,i)=>{const l=ii.lab?.[c]||{};db.ins.set(String(c),{c:String(c),k:ii.k[i],u:ii.u[i],o:ii.o[i],d:ii.d[i],ownInput:!!b.ownInputs?.has(String(c)),ownProfile:b.ownInputs?.get(String(c))?.taxProfile||'',p:prices(ii.p[i]),...(l.CD?{pCD:prices(l.CD)}:{}),...(l.SE?{pSE:prices(l.SE)}:{})});});
   cc.c.forEach((c,j)=>db.comp.set(String(c),{c:String(c),g:cc.g[j],u:cc.u[j],sit:!!cc.s[j],d:cc.d[j],it:(cc.it[j]||[]).map(([c,k])=>({t:c<0?'C':'I',c:String(Math.abs(c)),k}))}));
   for(const c of b.custom.values()){let u=db.un.indexOf(c.unit);if(u<0){u=db.un.length;db.un.push(c.unit);}db.comp.set(String(c.code),{c:String(c.code),g:-1,u,d:c.desc,sit:false,it:(c.items||[]).map(x=>({t:x.type,c:String(x.code),k:x.coef}))});}
   M.attachDB(db);baseRef=b;customRef=b.custom;T.invalidate();
  }
  const sig=JSON.stringify([z.cfg,z.priceMode,z.valuation,z.terminals,A.pj.uf,A.pj.rg]);
  if(signature!==sig){signature=sig;cfg=z.cfg;M.configurarPrecos(cfg);graphCache.clear();modelCache=new WeakMap();detailCache.clear();}
  return db;
 };
 T.db=()=>{T.setup();return db;};
 T.context=M.contextoDe;
 T.price=(c)=>{
  const d=db.ins.get(String(c));if(!d)return {valor:null,origem:'ausente',substituido:false};
  if(A.pj.iva.priceMode==='source')return M.origemPreco(String(c),A.pj.rg,db.uf.indexOf(A.pj.uf),cfg);
  const i=A.base.insIdx.get(/^\d+$/.test(String(c))?Number(c):String(c)),p=i==null?[null,false]:A.base.insPrice(i,A.base.ufIndex(A.pj.uf),A.pj.rg);
  return {valor:finite(p[0])?p[0]/100:null,origem:p[1]?'SP':A.pj.uf,substituido:!!p[1],motivo:p[1]?'Atribuição a SP da base ativa do orçamento':''};
 };
 // Custo e denominador de conciliação, em pós-ordem iterativa. Nenhum limite de níveis.
 T.node=(c)=>{
  c=String(c);if(graphCache.has(c))return graphCache.get(c);
  const active=new Set(),stack=[{c,pos:0}];
  while(stack.length){const f=stack[stack.length-1];if(graphCache.has(f.c)){stack.pop();continue;}
   if(!f.o){f.o=db.comp.get(f.c);if(!f.o||!f.o.it.length){const p=A.base.compCost(code(f.c),A.pj.uf,A.pj.rg);graphCache.set(f.c,{price:finite(p)?p/100:null,raw:0,k:1,complete:finite(p),terminal:true});stack.pop();continue;}active.add(f.c);}
   let pushed=false;
   while(f.pos<f.o.it.length){const x=f.o.it[f.pos++];if(x.k===0)continue;if(x.t==='C'&&!graphCache.has(x.c)){if(active.has(x.c)){f.cycle=true;continue;}stack.push({c:x.c,pos:0});pushed=true;break;}}
   if(pushed)continue;
   let raw=0,sum=0,ok=!f.cycle;
   for(const x of f.o.it){if(x.k===0)continue;if(!finite(x.k)||x.k<0||!['I','C'].includes(x.t)){ok=false;continue;}const n=x.t==='C'?graphCache.get(x.c):null,p=x.t==='I'?T.price(x.c).valor:n?.price;if(!finite(p)||(n&&!n.complete)){ok=false;continue;}raw+=x.k*p;sum+=M.trunc2(x.k*p);}
   const native=A.base.compCost(code(f.c),A.pj.uf,A.pj.rg);
   const p=ok?(A.pj.iva.priceMode==='budget'&&finite(native)?native/100:M.trunc2(sum)):null;
   graphCache.set(f.c,{price:p,raw,k:ok&&raw>0?p/raw:1,complete:ok,terminal:false});active.delete(f.c);stack.pop();
  }
  return graphCache.get(c);
 };
 const terminalKey=r=>JSON.stringify([r.type,r.source,String(r.code),r.unit]);
 T.terminalKey=terminalKey;
 T.fromABC=(abc)=>{
  T.setup();const m=abc.model,byId=new Map(m.items.map(x=>[x.id,x])),origins=new Map(abc.sources.map(x=>[x.id,x]));
  const oc=[],unknown=[],notes=new Set();
  // Cache linked paths: factors propagated once per path, not once per depth × leaf.
  const pathMemo=new WeakMap();
  const pathState=tail=>{
   if(pathMemo.has(tail))return pathMemo.get(tail);
   const pending=[];for(let p=tail;p&&!pathMemo.has(p);p=p.parent)pending.push(p);
   for(let j=pending.length-1;j>=0;j--){const p=pending[j],prev=p.parent?pathMemo.get(p.parent):{factor:1,ctx:'',operator:null,complete:true};
    let v={...prev};
    if(p.type==='C'){
     const dsc=db.comp.get(String(p.code))?.d||p.desc||'',norm=M.normal(dsc);
     if(!v.operator&&cfg.operadorParametrico&&/COM\s+ENCARGOS\s+COMPLEMENTARES|CURSO\s+DE\s+CAPACITA/.test(norm)&&['eqp','dep','jur','man','ise','ope'].includes(prev.ctx))v.operator={code:String(p.code),desc:dsc};
     v.ctx=T.context(dsc,prev.ctx);const n=T.node(p.code);v.factor*=n.k;v.complete=v.complete&&n.complete;
    }
    pathMemo.set(p,v);
   }
   return pathMemo.get(tail);
  };
  for(const r of abc.rows)for(const o of r.occurrences){
   const it=byId.get(o.originId),src=origins.get(o.originId),key=terminalKey(r),profileChoice=A.pj.iva.terminals[key];
   const chainState=pathState(o.path.parent||o.path);
   const leaf=db.ins.get(String(r.code));let profile=leaf?M.perfilBase(leaf):null;
   const info={abcKey:r.key,terminalKey:key,originId:it.id,service:it.num,serviceCode:String(it.node.code||''),leafCode:String(r.code),physicalQty:o.qty,physicalUnit:r.unit,path:o.path};
   let price=r.type==='I'?T.price(r.code):{valor:finite(r.price)?r.price/100:null,origem:r.source,substituido:false};
   const isTerminal=r.type!=='I'||r.incomplete;
   if(isTerminal){profile=profileChoice?.profile||null;}
   let ctx=chainState?.ctx||'',factor=chainState?.factor||1,operator=chainState?.operator;
   if(!isTerminal&&['dep','jur','man','ise'].includes(ctx))profile={dep:'depreciacao',jur:'juros',man:'manutencao',ise:'impSeg'}[ctx];
   if(operator&&!isTerminal)profile='operador';
   let amount=finite(price.valor)?o.qty*price.valor*factor:null;
   let scaling=1;
   const canExpand=OP.abc.canExpandItem(it).ok;
   if(A.pj.iva.valuation==='budget'&&canExpand){const root=it.node.resourceType==='I'?{complete:T.price(it.node.code).valor!=null,price:T.price(it.node.code).valor}:T.node(it.node.code);if(root.complete&&root.price>0&&finite(it.unitCost)&&it.qty>0)scaling=(it.direct/100)/(it.qty*root.price);else if(!root.complete)notes.add('Há composições parciais: suas parcelas conhecidas não foram ampliadas para cobrir valores sem preço.');}
   if(amount!=null)amount*=scaling;
   if(!finite(amount)||!profile||/ciclo|inválid/i.test(r.reason||'')){
    unknown.push({...info,cod:String(r.code),desc:r.desc,un:r.unit,qtd:o.qty,valor:amount,perfil:profile,reason:!finite(amount)?'Sem preço admitido pela política tributária':!profile?'Sem analítico ou perfil tributário definido':r.reason});continue;
   }
   if(!finite(factor)||!finite(scaling)||amount<0)throw new Error('Grandeza inválida na memória tributária.');
   const taxCode=operator&&!isTerminal?operator.code:String(r.code);
   oc.push({...info,cod:taxCode,tipo:operator?'C':r.type,desc:operator?operator.desc+' — parcela alocada a '+r.code+' ('+r.desc+')':r.desc,un:r.unit,qtd:o.qty,valor:amount,perfil:profile,ctx,
    caminho:'',origem:price.origem,substituido:!!price.substituido,preco:price.valor,cbAdRem:profile==='dieselRegra'||profile==='gasolina'?M.combustivelTipo(r.desc):null,
    reconciliation:factor,serviceScale:scaling,operator:!!operator,terminal:isTerminal,terminalNote:profileChoice?.note||'',inputValue:o.raw==null?null:o.raw/100});
   if(operator)notes.add('Modo operador paramétrico: equivalência da composição de operador distribuída nas folhas físicas, sem somar ambos.');
  }
  if(m.items.some(x=>x.fixo&&OP.abc.canExpandItem(x).ok))notes.add('Custo informado: analítico da base ativa como aproximação; não comprova preços ou coeficientes históricos.');
  const unlisted=new Set(oc.filter(x=>!M.matrizTributaria.insumos[x.leafCode]).map(x=>x.leafCode));if(unlisted.size)notes.add(unlisted.size+' código(s) físico(s) fora do acervo tributário específico do anexo: aplicam-se referências gerais por perfil/UF ou substituições explícitas, sem benefício descritivo presumido.');
  return {custo:m.tot.direct/100,oc,unknown,notes:[...notes],avisos:unknown.length?['Há parcelas sem crédito determinado; total conhecido parcial.']:[],abc,model:m};
 };
 const zero=()=>({creditCents:0,ibsCents:0,cbsCents:0,economic:0,current:0,rawCredit:0,base:0,residual:0,known:0,missing:0,complete:true});
 T.evaluate=(e,year,details=false)=>{
  T.setup();const lines=e.oc.map(oc=>M.avaliarOcorrencia(oc,cfg,A.pj.uf,year)),byService=new Map(),byABC=new Map(),total=zero();
  const weightsI=lines.map(x=>x.completo?x.creditoIbs:0),weightsC=lines.map(x=>x.completo?x.creditoCbs:0),sum=a=>a.reduce((s,v)=>s+v,0);
  const split=OP.abc.allocate([sum(weightsI),sum(weightsC)],Math.round((sum(weightsI)+sum(weightsC))*100))||[0,0],ai=OP.abc.allocate(weightsI,split[0])||weightsI.map(()=>0),ac=OP.abc.allocate(weightsC,split[1])||weightsC.map(()=>0);
  const add=(map,k)=>{if(!map.has(k))map.set(k,zero());return map.get(k);};
  lines.forEach((x,i)=>{x.ibsCents=ai[i];x.cbsCents=ac[i];x.creditCents=ai[i]+ac[i];for(const z of [total,add(byService,x.oc.originId),add(byABC,x.oc.abcKey)]){
   if(x.completo){z.ibsCents+=ai[i];z.cbsCents+=ac[i];z.creditCents+=ai[i]+ac[i];z.rawCredit+=x.credito;z.base+=x.baseCreditavel;z.residual+=x.residual;z.economic+=x.creditoEconomico;z.current+=x.creditoFiscal;z.known++;}else{z.missing++;z.complete=false;}
  }});
  for(const x of e.unknown)for(const z of [total,add(byService,x.originId),add(byABC,x.abcKey)]){z.missing++;z.complete=false;}
  const byStage=new Map();
  const stages=[];for(const r of e.model?.flat||[]){while(stages.length&&stages[stages.length-1].depth>=r.depth)stages.pop();if(r.isStage){const z=zero();byStage.set(r.id,z);stages.push({id:r.id,depth:r.depth});}else{const v=byService.get(r.id)||zero();for(const p of stages){const z=byStage.get(p.id);for(const k of ['creditCents','ibsCents','cbsCents','economic','current','rawCredit','base','residual','known','missing'])z[k]+=v[k];z.complete&&=v.complete;}}}
  const cc=OP.abc.allocate([total.current,total.economic],total.creditCents)||[0,0];total.currentCents=cc[0];total.economicCents=cc[1];
  const av=M.avaliar({custo:e.custo,oc:[],avisos:e.avisos},cfg,A.pj.uf,year); // shape shared with the source renderer
  for(const k of M.CAMPOS_SOMA)av.total[k]=sum(lines.filter(x=>x.completo).map(x=>x[k]||0));
  av.total.creditCents=total.creditCents;av.total.ibsCents=total.ibsCents;av.total.cbsCents=total.cbsCents;av.total.currentCents=total.currentCents;av.total.economicCents=total.economicCents;av.total.known=total.known;av.total.missing=total.missing;av.total.completo=total.complete;av.total.status=total.complete?'estimativa':'parcial';av.total.pctCredito=e.custo>0?av.total.credito/e.custo:0;av.total.pctBase=e.custo>0?av.total.baseCreditavel/e.custo:0;av.total.pendencias=total.missing;
  av.total.avisos=[...new Set([...e.avisos,...lines.flatMap(x=>x.avisos||[])])];av.total.origensSP=lines.filter(x=>x.oc.substituido).length;av.total.ocCombustivel=lines.filter(x=>x.natureza==='combustivel').length;
  av.linhas=details?lines:[];return {e,year,total,byService,byABC,byStage,av,lines:details?lines:undefined};
 };
 T.budget=m=>{T.setup();let c=modelCache.get(m);if(!c){const abc=OP.abc.compute(m);c={e:T.fromABC(abc),years:new Map()};modelCache.set(m,c);}const y=A.pj.iva.year;if(!c.years.has(y))c.years.set(y,T.evaluate(c.e,y));const q=c.years.get(y);q.cache=c;return q;};
 T.year=(m,y)=>{const b=T.budget(m),c=b.cache;if(!c.years.has(y))c.years.set(y,T.evaluate(c.e,y));return c.years.get(y);};
 T.series=(e)=>M.ANOS.map((year,i)=>{const v=T.evaluate(e,year);return {ano:year,ibs:cfg.ibs[i],cbs:cfg.cbs[i],iva:cfg.ibs[i]+cfg.cbs[i],resid:M.REMANESCENTE[i],...v.av.total,creditCents:v.total.creditCents,known:v.total.known,missing:v.total.missing};});
 T.forItem=(m,id)=>{const b=T.budget(m),r=m.byId.get(id);const filter=x=>x.originId===id;return {...b.e,custo:(r?.direct||0)/100,oc:b.e.oc.filter(filter),unknown:b.e.unknown.filter(filter),avisos:b.e.unknown.some(filter)?['Item com crédito parcial.']:[],model:null};};
 T.forCode=(c,type='C')=>{
  T.setup();const key=type+':'+c;if(detailCache.has(key))return detailCache.get(key);let e;
  if(type==='I'){
   const d=db.ins.get(String(c)),p=T.price(c),row={cod:String(c),leafCode:String(c),tipo:'I',desc:d?.d||String(c),un:db.un[d?.u]||'',qtd:1,physicalQty:1,physicalUnit:db.un[d?.u]||'',valor:p.valor,perfil:d?M.perfilBase(d):null,ctx:'',caminho:String(c),origem:p.origem,substituido:!!p.substituido,preco:p.valor,cbAdRem:d?M.combustivelTipo(d.d):null,abcKey:'I:'+c,originId:'I:'+c};
   e={custo:p.valor,oc:finite(p.valor)&&row.perfil?[row]:[],unknown:finite(p.valor)&&row.perfil?[]:[{...row,reason:finite(p.valor)?'Perfil tributário não definido':'Sem preço disponível'}],notes:M.matrizTributaria.insumos[String(c)]?[]:['Código fora do acervo tributário específico do anexo: aplica-se referência geral por perfil/UF ou substituição explícita.'],avisos:finite(p.valor)?[]:['Preço ausente'],model:null};
  }else{
   const comp=A.base.comp(code(c)),cost=A.base.compCost(code(c),A.pj.uf,A.pj.rg);
   const r={id:'C:'+c,num:'1',depth:0,node:{code:code(c),qty:1},qty:1,comp,unit:comp?.unit||'',desc:comp?.desc||String(c),fonte:comp?.src||'SINAPI',unitCost:cost,direct:cost||0,fixo:false};
   const model={base:A.base,uf:A.pj.uf,rg:A.pj.rg,pj:A.pj,items:[r],flat:[r],tot:{direct:cost||0}};
   e=T.fromABC(OP.abc.compute(model));e.model=null;e.custo=cost==null?null:cost/100;
  }
  if(detailCache.size>=128)detailCache.delete(detailCache.keys().next().value);detailCache.set(key,e);return e;
 };
 T.attach=m=>{const b=T.budget(m);for(const r of m.flat)r.iva=(r.isStage?b.byStage:b.byService).get(r.id)||zero();m.tot.iva=b.total;return m;};
 T.consolidate=av=>M.consolidar({...av,linhas:av.linhas.map(x=>({...x,oc:{...x.oc,cod:x.oc.leafCode||x.oc.cod,un:x.oc.physicalUnit||x.oc.un}}))});
 T.runTests=()=>{const active=T.db(),subset={...active,ins:new Map([...active.ins].filter(([c])=>M.matrizTributaria.insumos[c]))};let results;try{M.attachDB(subset);results=G.TESTES.executar().map(x=>({...x,nome:'Acervo de origem · '+x.nome}));}finally{M.attachDB(active);M.configurarPrecos(T.config().cfg);}results.push({nome:'Integração · acervo de origem preservado e códigos adicionais identificados separadamente',ok:subset.ins.size===Object.keys(M.matrizTributaria.insumos).length&&active.ins.size>=subset.ins.size});const m=OP.ui.model(),b=T.budget(m),sum=map=>[...map.values()].reduce((n,x)=>n+x.creditCents,0);results.push({nome:'Integração · soma de serviços = soma de insumos = total em centavos',ok:sum(b.byService)===b.total.creditCents&&sum(b.byABC)===b.total.creditCents&&b.total.creditCents===b.total.ibsCents+b.total.cbsCents});return results;};
 T.roundInfo='O crédito total é arredondado a centavos e conciliado pelo maior resto entre IBS e CBS; cada tributo é então distribuído entre suas ocorrências. As mesmas parcelas em centavos são somadas nos serviços, nas etapas e na ABC de insumos; diferença de exibição não altera preços nem coeficientes.';
 T.pathText=o=>o.caminho||(o.path?OP.abc.path(o.path).map(x=>x.code).join(' › '):String(o.cod));
 T.status=z=>!z?'Não calculado':!z.complete?(z.known?'Parcial':'Não determinado'):'Estimativa';
 T.safeMoney=z=>z&&(z.complete||z.known)?z.creditCents/100:null;
 T.abcValue=r=>{const b=T.budget(OP.ui.model());return b.byABC.get(r.key)||zero();};
 T.serviceValue=r=>{const m=OP.ui.model();return T.budget(m).byService.get(r.id||r.key)||zero();};
})(globalThis);

