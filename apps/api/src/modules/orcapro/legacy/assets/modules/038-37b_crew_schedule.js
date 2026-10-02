/* ==== 37b_crew_schedule.js — cronograma por serviço, calculado pelas equipes ==== */
(function(G){'use strict';
const O=G.OP,Q=O.revision183,P=O.sitePlan,E=O.engine,R=O.res,U=O.util,clone=O.register.clone;
const keys=r=>(r.prod.rows||[]).filter(x=>x.h>0).map(x=>x.kind==='eq'?'E:'+U.norm(x.name):'L:'+P.role(x.name,'mo'));
const jobDuration=(r,share)=>{if(!(r.qty>0))return 0;const p=r.prod;return Math.max(0,(p.noProd?(r.node.dur||1):p.Dt/(p.J||8.8))*share);};
Q.deadline=function(pj,cal){const end=U.parseISO(pj.start);end.setMonth(end.getMonth()+(pj.crewPlan.months||10));let i=0;while(i<3000&&cal.date(i)<end)i++;return {exclusive:U.iso(end),days:i,end:U.addDays(end,-1)};};
Q.schedule=function(m){
 const cfg=m.pj.crewPlan,phases=clone(cfg.phases),by=new Map(phases.map(p=>[p.id,p])),jobs=[],acts=[],links=[],issues=[],itemJobs=new Map(),eps=1e-8;
 const link=(a,b,lag=0,type='FS',why='')=>{if(a&&b&&a!==b)links.push({from:a,to:b,lag,type,id:'cp:'+links.length,auto:true,why});};
 for(const p of phases){p.entry='@'+p.id+':S';p.exit='@'+p.id+':F';p.jobs=[];acts.push({id:p.entry,dur:0},{id:p.exit,dur:0});link(p.entry,p.exit,Math.max(0,p.minDays||0),'FS','janela mínima documentada');}
 // Contract reserve is explicit. It is not productive work, fictitious staff or a cap on durations.
 acts.push({id:'@contract:S',dur:0},{id:'@contract:F',dur:0});
 const target=Q.deadline(m.pj,m.cal);link('@contract:S','@contract:F',cfg.reserveDays>0?target.days:0,'FS','prazo-base contratual / reserva explícita');
 if(cfg.reserveDays>0)link('@contract:S',by.get('handover').entry,Math.max(0,target.days-1),'FS','entrega no fim do prazo; reserva para ajustes');
 for(const l of cfg.links||[]){const a=by.get(l.from),b=by.get(l.to);if(!a||!b){issues.push('Vínculo de etapa inexistente: '+l.from+' → '+l.to);continue;}
  link(l.type==='SS'||l.type==='SF'?a.entry:a.exit,l.type==='FF'||l.type==='SF'?b.exit:b.entry,l.lag||0,'FS','precedência técnica '+l.type);
 }
 for(const r of m.items){r.workSegments=[];const w=r.node.work||{},slices=w.slices||[];itemJobs.set(r.id,[]);
  if(w.span)continue;
  if(slices.length&&Math.abs(P.sum(slices,s=>s.share)-1)>eps)issues.push('Frações do item '+r.num+' não somam 100%.');
  const valid=slices.length?slices:[{phase:'handover',share:1}];
  for(let ix=0;ix<valid.length;ix++){const s=valid[ix],ph=by.get(s.phase);if(!ph){issues.push('Etapa ausente no item '+r.num);continue;}
   const job={id:r.id+':'+ix,row:r.id,phase:ph.id,share:s.share,dur:jobDuration(r,s.share),resources:keys(r)};jobs.push(job);acts.push(job);ph.jobs.push(job);itemJobs.get(r.id).push(job);link(ph.entry,job.id);link(job.id,ph.exit);
  }
 }
 // Within each stage/campaign a trade's crew is reused, not duplicated for every service.
 // Same item across floors also uses the same crew. Cross-stage simultaneous crews are distinct
 // and their complete simultaneous demand is shown in the histogram (not hidden by a cap).
 const constructionRank=r=>{const d=U.norm(r.desc);if(/ESCAVAC|ARRASAMENTO|PREPARO DE FUNDO/.test(d))return 0;if(/LASTRO/.test(d))return 10;if(/FORMA|ESCORAMENTO/.test(d))return 20;if(/ARMACAO|ARMADURA/.test(d))return 30;if(/CONCRETAGEM/.test(d))return 40;if(/IMPERMEABILIZ/.test(d))return 50;if(/REATERRO/.test(d))return 60;return 25;};
 for(const p of phases){const constructive=/^(blocks|baldrame|blockExc|pill[1-4])$/.test(p.id);if(constructive)p.jobs.sort((a,b)=>constructionRank(m.byId.get(a.row))-constructionRank(m.byId.get(b.row)));const previous=new Map();let groups=new Map();for(const j of p.jobs){for(const k of new Set(j.resources)){link(previous.get(k),j.id,0,'FS','reutilização da equipe na etapa');previous.set(k,j.id);}if(constructive){const rk=constructionRank(m.byId.get(j.row));if(!groups.has(rk))groups.set(rk,[]);groups.get(rk).push(j);}}
 if(constructive){const g=[...groups.keys()].sort((a,b)=>a-b);for(let i=1;i<g.length;i++)for(const a of groups.get(g[i-1]))for(const b of groups.get(g[i]))link(a.id,b.id,0,'FS','ordem: escavação/lastro/fôrma/armação/concreto/reaterro');}link(p.exit,'@contract:F');} 
 // Same-service repeated campaigns are linked only where their phase order is already coherent.
 // A topological phase rank prevents accidental dependency inversion for installation/removal rows.
 const phaseCP=O.cpm.run(phases.map(p=>({id:p.id,dur:0})),cfg.links||[],{fractional:true});const rank=new Map(phaseCP.order.map((i,k)=>[phases[i].id,k]));
 for(const a of itemJobs.values()){a.sort((x,y)=>(rank.get(x.phase)||0)-(rank.get(y.phase)||0));for(let i=1;i<a.length;i++)link(a[i-1].id,a[i].id,0,'FS','mesmo serviço/equipe entre campanhas');}
 // User links edited through the original schedule interface remain active additions.
 for(const l of m.pj.links||[]){const aa=itemJobs.get(l.from)||[],bb=itemJobs.get(l.to)||[];if(!aa.length||!bb.length){issues.push('Vínculo manual envolve apoio sem campanha: conferir '+l.from);continue;}
  for(const a of aa)for(const b of bb)link(a.id,b.id,l.lag||0,l.type||'FS','vínculo manual do usuário');
 }
 const c=O.cpm.run(acts,links,{fractional:true});if(c.cycle)issues.push('Ciclo de precedências detectado: '+c.cycle.slice(0,8).join(', '));
 const idx=new Map(acts.map((a,i)=>[a.id,i]));
 for(const p of phases){const a=idx.get(p.entry),b=idx.get(p.exit);Object.assign(p,{ES:c.ES[a],EF:c.EF[b],LS:c.LS[a],LF:c.LF[b]});p.days=p.EF-p.ES;p.start=m.cal.date(p.ES);p.end=m.cal.date(Math.max(p.ES,Math.ceil(p.EF-eps)-1));}
 const T=Math.max(1,Math.ceil(c.T-eps));
 for(const j of jobs){const i=idx.get(j.id);Object.assign(j,...['ES','EF','LS','LF','TF','FF','crit'].map(k=>({[k]:c[k][i]})));m.byId.get(j.row).workSegments.push({...j});}
 for(const r of m.items){const w=r.node.work||{};if(w.span){const a=by.get(w.span.start),b=by.get(w.span.end);const start=w.span.start==='docs'?0:(a?.ES||0),end=w.span.end==='handover'?T:(b?.EF||T);r.workSegments=[{phase:'apoio',share:1,ES:Math.floor(start+eps),EF:Math.ceil(end-eps),LS:Math.floor(start+eps),LF:Math.ceil(end-eps),continuous:true}];}
  if(!r.workSegments.length)r.workSegments=[{phase:'handover',share:1,ES:T-1,EF:T,LS:T-1,LF:T}];
  const s=r.workSegments;r.ES=Math.floor(Math.min(...s.map(x=>x.ES))+eps);r.EF=Math.ceil(Math.max(...s.map(x=>x.EF))-eps);r.LS=Math.floor(Math.min(...s.map(x=>x.LS))+eps);r.LF=Math.ceil(Math.max(...s.map(x=>x.LF))-eps);r.TF=Math.max(0,Math.floor(Math.min(...s.map(x=>x.LS-x.ES))+eps));r.FF=r.TF;r.crit=!w.span&&s.some(x=>x.TF<=eps);r.days=r.EF-r.ES;
  r.activeDays=P.sum(s,x=>x.EF-x.ES);r.start=m.cal.date(r.ES);r.end=m.cal.date(Math.max(r.ES,r.EF-1));r.lstart=m.cal.date(r.LS);r.lend=m.cal.date(Math.max(r.LS,r.LF-1));r.referenceProdDays=r.prod.days;
  if(!r.prod.noProd&&r.prod.rows.some(x=>x.util>1+1e-6))issues.push('Equipe insuficiente para duração manual do item '+r.num+'. Ocupação excede 100%.');
 }
 m.T=T;m.start=m.cal.start;m.end=m.cal.date(T-1);m.execution={phases,by,jobs,cp:c,links,issues,target,productiveFinish:Math.max(0,...jobs.map(j=>j.EF)),reserve:Math.max(0,T-Math.max(0,...jobs.map(j=>j.EF))),contractT:T};
 // Service-level view stays intact. A matching network for display preserves the computed
 // envelope dates; detailed campaign constraints are available in the calculation memory.
 // Avoid rendering cycles induced by collapsing repeated campaigns into one envelope.
 m.links=(m.pj.links||[]).slice();m.cpm={order:m.items.map((_,i)=>i).sort((a,b)=>m.items[a].ES-m.items[b].ES),D:m.items.map(r=>r.days),...Object.fromEntries(['ES','EF','LS','LF','TF','FF','crit'].map(k=>[k,m.items.map(r=>r[k])])),T,cycle:c.cycle,links:m.links,campaignLevel:true};
 for(const st of m.stages){const rows=st.leaf;st.ES=rows.length?Math.min(...rows.map(r=>r.ES)):0;st.EF=rows.length?Math.max(...rows.map(r=>r.EF)):0;st.days=st.EF-st.ES;st.start=m.cal.date(st.ES);st.end=m.cal.date(Math.max(st.ES,st.EF-1));st.LS=st.ES;st.LF=st.EF;st.TF=0;st.FF=0;st.crit=rows.some(r=>r.crit);}
 return m;
};
// Factory calibration only. Once the example is created, editing a team never silently
// restores these values or compresses time to meet the target.
Q.prepareCrews=function(base,pj){
 base.planningAggregate=true;
 const cfg=pj.crewPlan,by=new Map(cfg.phases.map(p=>[p.id,p]));
 const hold={docs:2,site:3,survey:1,earth:2,pile:3,pileWait:5,blockExc:1,pit:1,blocks:2,baldrame:2,baldrameWater:2,elevBase:2,elevInstall:2,roofWood:2,roofTile:2,roofWater:3,roofEnd:1,scaffold:3,extChap:1,extPlaster:5,extDry:7,extPrimer:1,extPaint:3,scaffoldOut:2,elevOut:2,externalNetworks:2,spda:1,gas:3,wall:12,paving:3,landscape:2,safetyFinal:2,commission:4,cleanup:3,handover:1};
 for(const p of cfg.phases){const k=p.id.replace(/[1-4]$/,'');p.minDays=/^cure/.test(p.id)?5:/^dry/.test(p.id)?7:/^wetTest/.test(p.id)?3:/^roughTest/.test(p.id)?1:hold[p.id]??({pill:2,form:2,steel:2,pour:1,masonry:4,closing:2,rough:2,roughClose:1,chap:1,plaster:3,wet:1,baseFloor:1,tile:3,ceiling:1,frame:2,primer:1,putty:2,paint:2,finalFit:2}[k]||0);}
 let m=P.computeLegacy(base,pj);
 for(const r of m.items){const it=r.node,w=it.work||{};it.teams=1;it.target=null;it.dur=null;it.crew={};if(w.span){it.crew=null;continue;}
  const phases=(w.slices||[]).map(s=>by.get(s.phase)).filter(Boolean);
  for(const x of r.prod.rows){const role=P.role(x.name,x.kind),count=Math.max(1,...phases.map(p=>p.crew?.[role]||1));it.crew[x.key]=x.kind==='eq'?1:Math.min(count, r.prod.rows.reduce((sum,y)=>sum+y.H,0)<12?2:8);}
  if(r.prod.rows.length){const t=Math.max(...r.prod.rows.map(x=>x.h/it.crew[x.key]));for(const x of r.prod.rows)it.crew[x.key]=Math.max(1,Math.ceil(x.h/t-1e-8));}
  if(r.prod.noProd)it.dur=Math.max(1,...phases.map(p=>Math.min(p.minDays||1,5)));
 }
 const ownDur={'22.1':16,'19.8':12,'23.19':10,'23.20':7};for(const r of m.items)if(ownDur[r.num])r.node.dur=ownDur[r.num];
 // Documentation is developed during commissioning instead of waiting for demobilization.
 for(const n of ['23.19','23.20']){const r=m.items.find(r=>r.num===n);r.node.work={slices:[{phase:'commission',share:1}],reason:'Consolidação final de documentos iniciada no comissionamento, com equipe documental própria; fechamento antes da entrega.'};}
 let rounds=0;
 for(;rounds<25;rounds++){m=P.computeLegacy(base,pj);Q.schedule(m);if(m.execution.cp.cycle)break;if(m.T<=m.execution.target.days)break;
  const critical=new Set(m.execution.jobs.filter(j=>j.crit||j.TF<.05).map(j=>j.row));let changed=false;
  for(const id of critical){const r=m.byId.get(id),it=r.node;if(r.prod.noProd||it.dur)continue;const nextT=r.prod.T*.80;for(const x of r.prod.rows){const max=x.kind==='eq'?2:(r.prod.rows.reduce((sum,y)=>sum+y.H,0)<12?2:12),nn=Math.min(max,Math.max(1,Math.ceil(x.h/nextT-1e-8)));if(nn>(it.crew[x.key]||1)){it.crew[x.key]=nn;changed=true;}}}
  if(!changed)break;
 }
 // Preserve the remaining period as a real management/acceptance buffer, without making
 // workers available for activities not present in the schedule.
 m=P.computeLegacy(base,pj);Q.schedule(m);cfg.calibration={rounds,earliestDays:m.T,deadlineDays:m.execution.target.days,issue:m.T>m.execution.target.days?'Meta não alcançada com limites de equipes adotados.':''};cfg.reserveDays=m.execution.target.days;
 cfg.teamBasis=m.items.map(r=>({id:r.id,num:r.num,code:r.node.code,crew:clone(r.node.crew),teams:r.node.teams,dur:r.node.dur,hours:r.prod.Dh,reason:r.node.work?.reason||''}));
};
const compute0=E.compute;
E.compute=function(base,pj){if(pj.crewPlan?.v!==2)return compute0(base,pj);base.planningAggregate=true;P.syncPrices(base,pj);let m=P.computeLegacy(base,pj);Q.schedule(m);let changed=false;
 for(const r of m.items){const t=r.node.work?.periodic;if(!t||t.enabled===false){delete r.node.periodMemo;continue;}
  const days=Math.round((Date.UTC(r.end.getFullYear(),r.end.getMonth(),r.end.getDate())-Date.UTC(r.start.getFullYear(),r.start.getMonth(),r.start.getDate()))/86400000)+1;const qty=Math.round(days/30*t.multiplier*1e6)/1e6;
  if(Math.abs(r.node.qty-qty)>5e-7){r.node.qty=qty;changed=true;}r.node.periodMemo={calendarDays:days,months:days/30,multiplier:t.multiplier,quantity:qty,rule:'Meses equivalentes = dias corridos inclusivos/30 (hipótese do exemplo; confirmar faturamento)'};
 }
 if(changed){m=P.computeLegacy(base,pj);Q.schedule(m);}
 if(pj.crewPlan.syncEvents!==false&&pj.evt){const ev=O.evt.compute(m,pj),map=O.evt.previsto(m,ev);for(const e of pj.evt.events||[])if(map.has(e.code))e.prazo=map.get(e.code);const days=Math.round((Date.UTC(m.end.getFullYear(),m.end.getMonth(),m.end.getDate())-Date.UTC(m.start.getFullYear(),m.start.getMonth(),m.start.getDate()))/86400000)+1;for(const f of pj.evt.fixos||[])f.prazo=days+(/definitivo/i.test(f.desc)?30:0);}
 if(pj.sanitation)pj.sanitation.current={ref:base.raw.ref,uf:pj.uf,rg:pj.rg,direct:m.tot.direct,price:m.tot.price,days:m.T,start:U.iso(m.start),end:U.iso(m.end)};
 return m;
};
// Financial series in cents and crew series in equivalent daily demand.
Q.itemMoney=function(r,T,late,withBDI){const out=new Float64Array(T),parts=P.allocate(withBDI?r.total:r.direct,r.workSegments.map(s=>s.share));r.workSegments.forEach((s,i)=>{const a=late?s.LS:s.ES,b=late?s.LF:s.EF,first=Math.max(0,Math.floor(a)),last=Math.min(T,Math.ceil(b));const days=[],w=[];for(let t=first;t<last;t++){days.push(t);w.push(Math.max(0,Math.min(b,t+1)-Math.max(a,t)));}if(!days.length){out[Math.min(T-1,Math.max(0,first))]+=parts[i];return;}const alloc=P.allocate(parts[i],w);days.forEach((d,j)=>out[d]+=alloc[j]);});return out;};
const daily0=R.daily,ff0=R.fisfin,cache=new WeakMap();
R.daily=function(m,o={}){if(!m.execution)return daily0(m,o);const key=JSON.stringify(o);let cc=cache.get(m);if(!cc)cache.set(m,cc=new Map());if(cc.has(key))return cc.get(key);
 const T=m.T,late=o.sched==='late',labor=new Map(),equip=new Map(),cost=new Float64Array(T),price=new Float64Array(T);
 const add=(map,name,kind,rate,h,a,b,source='coeficiente analítico')=>{if(!(b>a)||!(rate>0))return;const key=(kind==='eq'?'E:':'L:')+U.norm(name),v=map.get(key)||{key,name,kind,daily:new Float64Array(T),hours:0,allocatedHours:0,sources:[]};v.hours+=h;v.allocatedHours+=rate*(b-a)*m.J;if(!v.sources.includes(source))v.sources.push(source);for(let d=Math.max(0,Math.floor(a));d<Math.min(T,Math.ceil(b));d++)v.daily[d]+=rate*Math.max(0,Math.min(b,d+1)-Math.max(a,d));map.set(key,v);};
 for(const r of m.items){const w=r.node.work||{},s=r.workSegments,dc=Q.itemMoney(r,T,late,false),dp=Q.itemMoney(r,T,late,true);for(let i=0;i<T;i++){cost[i]+=dc[i];price[i]+=dp[i];}
  for(const seg of s){const a=late?seg.LS:seg.ES,b=late?seg.LF:seg.EF;if(w.staff){for(const x of w.staff)add(labor,x.name,'mo',x.fte,x.fte*(b-a)*m.J,a,b,'posto administrativo equivalente; convenção de alocação');continue;}
   for(const x of w.availability||[])add(equip,x.name,'eq',x.units,x.units*(b-a)*m.J,a,b,'disponibilidade locada');
   for(const x of r.prod.rows){add(x.kind==='eq'?equip:labor,x.name,x.kind,x.n*r.prod.m,x.H*seg.share,a,b);if(x.kind==='eq'&&x.operator&&o.operators!==false)add(labor,x.operator,'op',x.n*r.prod.m,x.n*r.prod.m*(b-a)*m.J,a,b,'operador embutido no equipamento');}
   if(o.support!==false)for(const x of r.prod.support){const h=x.H*seg.share;add(x.kind==='eq'?equip:labor,x.name,x.kind,h/((b-a)*m.J||1),h,a,b,'coeficiente auxiliar');}
   if(r.prod.noProd&&!w.availability&&!w.staff)for(const x of w.estimated||[]){const h=r.qty*x.hPerUnit*seg.share;add(labor,x.name,'mo',h/((b-a)*m.J||1),h,a,b,'hipótese de planejamento, sem analítico');}
  }
 }
 const v={T,labor:[...labor.values()].sort((a,b)=>b.hours-a.hours),equip:[...equip.values()].sort((a,b)=>b.hours-a.hours),cost,price};cc.set(key,v);return v;
};
R.fisfin=function(m,B,bdi){if(!m.execution)return ff0(m,B,bdi);const rows=m.flat.filter(r=>!r.parent).map(s=>{const vals=B.map(()=>0);for(const r of s.isStage?s.leaf:[s]){const v=Q.itemMoney(r,m.T,false,bdi);for(let d=0;d<m.T;d++)vals[B.dayIdx[d]]+=v[d];}return{num:s.num,name:s.isStage?s.node.name:s.desc,vals,total:P.sum(vals)};});const col=B.map((_,i)=>P.sum(rows,r=>r.vals[i])),total=P.sum(col);let a=0;return{rows,col,total,pct:col.map(x=>x/(total||1)),cum:col.map(x=>(a+=x)/(total||1))};};
})(typeof window!=='undefined'?window:globalThis);

