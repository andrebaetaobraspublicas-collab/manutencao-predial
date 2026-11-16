import { date, decimal, money, planningComparison, currentTotals, State, sum } from './contract-state';
import { BadRequestException } from '@nestjs/common';
import { scheduleCurve, scheduleScope, scheduleItemValue } from './contract-schedule';

const dayMs=86400000;
const validDay=(v:any)=>{try{return date(v);}catch{return null;}};
const diff=(a:string,b:string)=>Math.round((Date.parse(b)-Date.parse(a))/dayMs);
const pct=(n:any,d:any)=>decimal(d).eq(0)?null:decimal(n).mul(100).div(d).toFixed(2);
const numberOrNull=(n:any)=>n!==undefined&&n!==null&&Number.isFinite(Number(n))?Number(n):null;
function leaves(root:any){const result:any[]=[];const visit=(n:any)=>{if(!n)return;if(Array.isArray(n.children))n.children.forEach(visit);else if(n.kind==='item'||n.code!==undefined)result.push(n);};visit(root);return result;}
function interpolate(points:any[],day:string){
 if(!points.length)return null;if(day<points[0].date)return '0.00';
 const after=points.findIndex(p=>p.date>=day);if(after<0)return points.at(-1).amount;if(after===0||points[after].date===day)return points[after].amount;
 const a=points[after-1],b=points[after];return money(decimal(a.amount).plus(decimal(b.amount).minus(a.amount).mul(diff(a.date,day)).div(diff(a.date,b.date))));
}
/** A read model over the immutable, already stored source. No SINAPI/SICRO
 * catalogue is copied and no live project is silently substituted for it. */
export function contractPlanning(s:State,document:any,requestedDay?:string,revisionId?:string){
 const data=document?.project?.data||{},source=document?.calculation?.summary||{},infra=document?.sourcePlanning;
 const nodes=leaves(data.root),calc=infra?.items||source.items||[],byId=new Map(nodes.map((n:any,index:number)=>[n.id,{node:n,row:calc.find((r:any)=>r.id===n.id)||calc[index]||{}}]));
 const recordedDates=[...s.progress.map(r=>r.date),...(s.itemProgress||[]).map((r:any)=>r.date),...s.measurements.filter(m=>m.status==='APPROVED').map(m=>m.executionDate),...s.payments.map(p=>p.date),...s.refunds.map(r=>r.date),...(s.scheduleRevisions||[]).map((r:any)=>r.effectiveDate)];
 const asOf=requestedDay?date(requestedDay):recordedDates.sort().at(-1)||new Date().toISOString().slice(0,10);
 const revisions=s.scheduleRevisions||[],revision=revisionId==='ORIGINAL'?null:revisionId?revisions.find((r:any)=>r.id===revisionId):revisions.filter((r:any)=>r.effectiveDate<=asOf).at(-1);
 if(revisionId&&revisionId!=='ORIGINAL'&&!revision)throw new BadRequestException('Revisão não encontrada neste contrato.');
 if(revision&&revision.effectiveDate>asOf)throw new BadRequestException('A data de corte deve alcançar a revisão selecionada.');
 const revisionCurrent=!!revision&&revision.scopeHash===scheduleScope(s);
 const approved=s.measurements.filter(m=>m.status==='APPROVED'&&m.kind!=='DIFFERENCE'&&m.executionDate<=asOf);
 const acceptedEvents=new Set<string>(approved.flatMap(m=>m.eventIds||[])),activeEvents=s.events.filter(e=>!e.archived),eventProgress=new Map<string,string|null>();
 const ancestors=(e:any)=>{const ids=[e.id];let parent=e.parentId;while(parent&&!ids.includes(parent)){ids.push(parent);parent=activeEvents.find(x=>x.id===parent)?.parentId;}return ids;};
 const eventPercent=(link:string|null)=>{
  if(!link)return null;if(eventProgress.has(link))return eventProgress.get(link)!;
  const targets=link.split(';').map(x=>x.trim()).filter(id=>activeEvents.some(e=>e.id===id));
  if(!targets.length){eventProgress.set(link,null);return null;}
  const linkedLeaves=activeEvents.filter(e=>!activeEvents.some(c=>c.parentId===e.id)&&ancestors(e).some(id=>targets.includes(id)));
  const accepted=linkedLeaves.filter(e=>ancestors(e).some(id=>acceptedEvents.has(id))),result=pct(sum(accepted.map(e=>e.value)),sum(linkedLeaves.map(e=>e.value)));eventProgress.set(link,result);return result;
 };
 const reports=(s.itemProgress||[]).filter((r:any)=>r.date<=asOf).sort((a:any,b:any)=>a.date.localeCompare(b.date));
 const latest=new Map<string,any>();for(const report of reports)for(const line of report.lines)latest.set(line.itemId,{...line,date:report.date});
 const rows=s.items.map(item=>{
  const captured:any=byId.get(item.id),r=captured?.row||{},node=captured?.node||{},report=latest.get(item.id);
  const completeAtCurrentQuantity=report&&decimal(report.executedPercent).mul(report.quantityAtRecord??item.quantity).eq(decimal(item.quantity).mul(100));
  const start=validDay(item.start)||validDay(r.start),end=validDay(item.end)||validDay(r.end),actualStart=report?.actualStart||null,actualEnd=completeAtCurrentQuantity?report?.actualEnd||null:null,forecastEnd=report?.forecastEnd||null;
  const measured=s.regime==='UNIT_PRICE'?sum(approved.flatMap(m=>m.lines.filter((l:any)=>l.itemId===item.id).map((l:any)=>l.quantity))):null;
  const eventId=node.evento?String(node.evento):null;
  const production=r.productivity||r.production||{},physical=decimal(item.quantity).eq(0)?'0.00':report?(decimal(report.quantityAtRecord??item.quantity).eq(item.quantity)?report.executedPercent:decimal(report.quantityAtRecord).mul(report.executedPercent).div(item.quantity).mul(1000000).ceil().div(1000000).toFixed()):null;
  const delay=!decimal(item.quantity).eq(0)&&end&&(actualEnd||forecastEnd||physical!==null&&Number(physical)<100&&asOf>end)?diff(end,actualEnd||forecastEnd||asOf):null;
  return {itemId:item.id,number:item.number||item.code,code:item.code,description:item.description,unit:item.unit,groupId:item.groupId,groupName:item.groupName,groupPath:item.groupPath||[],quantity:item.quantity,baseValue:scheduleItemValue(item),originalValue:item.originalTotal,start,end,actualStart,actualEnd,forecastEnd,reportDate:report?.date||null,executedPercent:physical,measuredQuantity:measured?.toFixed(6)??null,measuredPercent:measured?pct(measured,item.quantity):eventPercent(eventId),eventId,delayDays:delay,startVarianceDays:start&&actualStart?diff(start,actualStart):null,critical:r.critical===true||r.crit===true,floatDays:numberOrNull(r.TF),durationDays:numberOrNull(r.days),teams:numberOrNull(production.teams??node.teams),actualTeams:report?.actualTeams??null,productionHours:numberOrNull(production.hours),durationHours:numberOrNull(production.durationHours),plannedQuantity:item.originalQuantity,crew:(production.rows||[]).map((p:any)=>({name:p.name,kind:p.kind,count:p.n,hours:p.H,utilization:p.util})),status:decimal(item.quantity).eq(0)?'SUPPRESSED':!start||!end?'UNSCHEDULED':physical===null?'UNREPORTED':Number(physical)===100?'COMPLETE':delay!==null&&delay>0?'LATE':'IN_PROGRESS',scopeChanged:!decimal(item.quantity).eq(item.originalQuantity)};
 });
 for(const row of rows){
  const line=revision?.lines.find((r:any)=>r.itemId===row.itemId),reprogrammedDelayDays=line?.end&&!decimal(row.quantity).eq(0)&&(row.actualEnd||row.forecastEnd||row.executedPercent!==null&&Number(row.executedPercent)<100&&asOf>line.end)?diff(line.end,row.actualEnd||row.forecastEnd||asOf):null;
  Object.assign(row,{reprogrammedStart:line?.start??null,reprogrammedEnd:line?.end??null,reprogrammedTeams:line?.teams??null,reprogrammedDelayDays,reprogrammedShiftDays:line?.end&&row.end?diff(row.end,line.end):null,revisionStatus:line?.status??null});
 }
 const denominator=currentTotals(s).contract,sourcePoints:any[]=[],plan=s.planningBaseline||infra?.scurve;
 const divisor=plan?.monetaryUnit==='CENT'||!s.planningBaseline&&infra?.scurve?100:1;
 if(plan?.rows)for(const point of plan.rows){
  const key=point.key,day=typeof key==='string'&&/^\d{4}-\d{2}$/.test(key)?new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5,7)),0)).toISOString().slice(0,10):validDay(key);
  if(day)sourcePoints.push({date:day,amount:money(decimal(point.ce??decimal(point.pce).mul(plan.total)).div(divisor))});
 }
 const start=validDay(s.sourceStart)||validDay(infra?.start),end=validDay(s.sourceEnd)||validDay(infra?.end);
 if(start&&sourcePoints.length){sourcePoints.unshift({date:new Date(Date.parse(start)-dayMs).toISOString().slice(0,10),amount:'0.00'});if(end&&sourcePoints.at(-1).date>end)sourcePoints[sourcePoints.length-1].date=end;}
 sourcePoints.sort((a,b)=>a.date.localeCompare(b.date));
 const revisedDates:string[]=revision?[revision.effectiveDate,revision.end,...revision.history.map((r:any)=>r.date)]:[];
 if(revision)for(let d=revision.effectiveDate;d<revision.end;){const next=new Date(Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7)),0)).toISOString().slice(0,10);if(next>d){revisedDates.push(next);d=next;}else d=new Date(Date.parse(d)+dayMs).toISOString().slice(0,10);}
 const comparison=planningComparison(s),dates=[...new Set([...sourcePoints.map(p=>p.date),...comparison.rows.map(r=>r.date),...(s.itemProgress||[]).map((r:any)=>r.date),...revisedDates,asOf])].sort();
 const curves=dates.map(day=>{
  const old=comparison.rows.filter(r=>r.date<=day).at(-1),cut=day<=asOf;
  const physicalReports=(s.itemProgress||[]).filter((r:any)=>r.date<=day).sort((a:any,b:any)=>a.date.localeCompare(b.date)),at=new Map<string,any>();for(const report of physicalReports)for(const line of report.lines)at.set(line.itemId,line);
  const complete=rows.every(r=>decimal(r.quantity).eq(0)||at.has(r.itemId));
  const detailedValue=complete&&at.size?money(sum(rows.map(r=>at.has(r.itemId)?decimal(r.baseValue).mul(at.get(r.itemId).executedPercent).mul(at.get(r.itemId).quantityAtRecord??r.quantity).div(decimal(r.quantity).eq(0)?1:r.quantity).div(100):'0'))):null;
  const executedValue=cut?(at.size?detailedValue:old?.executedValue??null):null,plannedValue=interpolate(sourcePoints,day);
  const reprogrammedValue=revision?scheduleCurve(revision,day):null;
  return {date:day,plannedValue,plannedPercent:plannedValue===null?null:pct(plannedValue,denominator),reprogrammedValue,reprogrammedPercent:reprogrammedValue===null?null:pct(reprogrammedValue,denominator),executedValue,executedPercent:executedValue===null?null:pct(executedValue,denominator),measuredValue:cut?old?.measuredValue??'0.00':null,measuredPercent:cut?pct(old?.measuredValue??'0',denominator):null,paidPercent:cut?pct(old?.paidValue??'0',denominator):null,cashPaid:cut?old?.cashPaid??'0.00':null,cashRefunded:cut?old?.cashRefunded??'0.00':null,physicalSource:at.size?'ITEM_REPORTS':old?.executedValue!==null&&old?.executedValue!==undefined?'CONSOLIDATED_REPORT':null};
 });
 const scopeChanged=rows.some(r=>r.scopeChanged);
 const current=curves.find(r=>r.date===asOf)!,delayed=rows.filter(r=>r.delayDays!==null&&r.delayDays>0),covered=rows.filter(r=>r.executedPercent!==null);
 const resources=new Map<string,any>();for(const row of rows)for(const p of row.crew){const key=`${p.kind}:${p.name}`,entry=resources.get(key)||{name:p.name,kind:p.kind,hours:decimal(0),services:0};entry.hours=entry.hours.plus(String(p.hours||0));entry.services++;resources.set(key,entry);}
 const resourceRows=[...resources.values()].map(r=>({...r,hours:r.hours.toFixed(2)})).sort((a,b)=>Number(b.hours)-Number(a.hours));
 const notes=[
  'Previsto: fotografia do orçamento na contratação. Interpolação linear entre fechamentos mensais; não é uma nova simulação de produtividade.',
  'Preço global: a coluna medida por serviço mostra o aceite financeiro dos eventos vinculados, ponderado por suas folhas e sem duplicar subtotais; não representa quantidade executada do serviço. Vínculo não estruturado permanece sem percentual.',
  'Executado: apontamentos físicos da fiscalização. Medido: boletins aprovados. Pagamentos e restituições não criam avanço físico.',
  'Desvios de datas são expressos em dias corridos. Folgas e durações previstas preservam os dias úteis calculados na origem.',
  'Alterações de quantitativos não reprogramam automaticamente a fotografia original. Serviços novos sem datas são destacados.',
 ];
 if(scopeChanged)notes.push('Os aditivos alteraram o escopo em relação à curva original. Compare o desempenho com uma revisão que cubra o escopo vigente; os desvios em relação à origem continuam disponíveis.');
 if(revision)notes.push(`Revisão ${revision.number}: saldo distribuído linearmente pelos dias úteis de cada serviço, com execução anterior congelada na revisão. ${revisionCurrent?'Escopo compatível com o contrato vigente.':'Escopo desatualizado após aditivo: registre nova revisão para recuperar indicadores comparáveis.'} Reprogramação não altera medições, preços, aceite dos eventos ou cronograma do orçamento de origem.`);
 if(covered.length<rows.length)notes.push(`${rows.length-covered.length} serviços sem apontamento físico detalhado. O Gantt não presume início ou término real a partir de pagamentos; os apontamentos consolidados existentes aparecem apenas na curva S.`);
 if(!sourcePoints.length)notes.push('Esta captura não contém curva S da origem. É necessário constituir uma captura com o cronograma calculado; os percentuais previstos não serão inventados.');
 const {lines:revisionLines,history:revisionHistory,...revisionMetadata}=revision||{};
 return {asOf,source:{product:s.contract?.sourceProduct,version:s.contract?.sourceVersion,start,end,workDays:s.sourceDays||infra?.workDays,immutable:true,calendar:data.calendar||null},baseValue:money(denominator),originalValue:s.originalValue,sourcePlanValue:plan?.total?money(decimal(plan.total).div(divisor)):null,curves,rows,resources:resourceRows,revision:revision?{...revisionMetadata,currentScope:revisionCurrent}:null,revisions:revisions.map(({lines,history,...r}:any)=>r),metrics:{...current,scopeChanged,revisionCurrent,reprogrammedVariancePoints:!revisionCurrent||current.executedPercent===null||current.reprogrammedPercent===null?null:decimal(current.executedPercent).minus(current.reprogrammedPercent).toFixed(2),reprogrammedDelayed:rows.filter((r:any)=>r.reprogrammedDelayDays!==null&&r.reprogrammedDelayDays>0).length,variancePoints:scopeChanged||current.executedPercent===null||current.plannedPercent===null?null:decimal(current.executedPercent).minus(current.plannedPercent).toFixed(2),performanceIndex:scopeChanged||current.executedPercent===null||!current.plannedPercent||decimal(current.plannedPercent).eq(0)?null:decimal(current.executedPercent).div(current.plannedPercent).toFixed(3),delayed:delayed.length,criticalDelayed:delayed.filter(r=>r.critical).length,unreported:rows.length-covered.length,unscheduled:rows.filter(r=>!r.start||!r.end).length,coveragePercent:pct(sum(covered.map(r=>r.baseValue)),denominator),forecastEnd:rows.map(r=>r.actualEnd||r.forecastEnd).filter(Boolean).sort().at(-1)||null,forecastCoverage:rows.filter(r=>r.actualEnd||r.forecastEnd).length},notes};
}
