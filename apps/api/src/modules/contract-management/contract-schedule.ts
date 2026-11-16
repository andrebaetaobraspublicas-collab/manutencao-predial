import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { currentTotals, date, decimal, money, State, sum, text, value } from './contract-state';

const DAY=86400000;
export function scheduleItemValue(item:any){
 const amount=decimal(item.originalTotal).plus(decimal(item.quantity).minus(item.originalQuantity).mul(item.unitPrice));
 return amount.eq(money(amount))?money(amount):amount.toFixed();
}
export const shiftDay=(day:string,n:number)=>new Date(Date.parse(day)+n*DAY).toISOString().slice(0,10);
export function scheduleCalendar(input:any={}){
 const workdays=input.workdays??[1,2,3,4,5];
 if(!Array.isArray(workdays)||!workdays.length||workdays.length>7||workdays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(workdays).size!==workdays.length)throw new BadRequestException('Semana de trabalho inválida.');
 const extra=input.extra??[];if(!Array.isArray(extra)||extra.length>500)throw new BadRequestException('Calendário de exceções inválido.');
 return {workdays:[...workdays].sort(),holidays:input.holidays!==false,carnaval:input.carnaval===true,corpus:input.corpus===true,extra:[...new Set(extra.map(date))] as string[]};
}
/** Same national/optional holidays as the captured OrçaPro calendar, in UTC. */
export function workCalendar(input:any){
 const cfg=scheduleCalendar(input),years=new Map<number,Set<string>>();
 const isWork=(day:string)=>{
  if(!cfg.workdays.includes(new Date(day).getUTCDay())||cfg.extra.includes(day))return false;
  if(!cfg.holidays)return true;
  const y=Number(day.slice(0,4));if(!years.has(y)){
   const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),dayOfMonth=(h+l-7*m+114)%31+1;
   const easter=new Date(Date.UTC(y,month-1,dayOfMonth)).toISOString().slice(0,10),holidays=new Set(['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'].map(v=>`${y}-${v}`));holidays.add(shiftDay(easter,-2));
   if(cfg.carnaval){holidays.add(shiftDay(easter,-48));holidays.add(shiftDay(easter,-47));}if(cfg.corpus)holidays.add(shiftDay(easter,60));years.set(y,holidays);
  }return !years.get(y)!.has(day);
 };
 const next=(day:string)=>{for(let n=0;n<370;n++,day=shiftDay(day,1))if(isWork(day))return day;throw new BadRequestException('Calendário sem dia útil no horizonte.');};
 const count=(start:string,end:string)=>{let n=0;for(let d=start;d<=end;d=shiftDay(d,1))if(isWork(d))n++;return n;};
 const end=(start:string,days:number)=>{if(!Number.isInteger(days)||days<1||days>3660)throw new BadRequestException('Duração deve estar entre 1 e 3.660 dias úteis.');let d=next(start);for(let n=1;n<days;n++)d=next(shiftDay(d,1));return d;};
 return {cfg,isWork,next,count,end};
}
export function scheduleScope(s:State){return createHash('sha256').update(JSON.stringify({amendments:s.amendments.map(a=>a.id),items:s.items.map(i=>[i.id,i.quantity,i.originalTotal,i.unitPrice])})).digest('hex');}
function physicalAt(s:State,day:string){const latest=new Map<string,any>();for(const p of (s.itemProgress||[]).filter((p:any)=>p.date<=day).sort((a:any,b:any)=>a.date.localeCompare(b.date)))for(const line of p.lines)latest.set(line.itemId,{...line,date:p.date});return latest;}
function revisionDate(s:State,input:any){
 const day=date(input),latest=[...s.amendments.map(a=>a.effectiveDate),...(s.scheduleRevisions||[]).map((r:any)=>r.effectiveDate),...(s.itemProgress||[]).map((r:any)=>r.date),...s.progress.map(r=>r.date)].sort().at(-1);
 if(latest&&day<latest)throw new BadRequestException('A data da revisão deve alcançar o último aditivo, revisão e apontamento físico.');
 if(s.sourceStart&&day<s.sourceStart)throw new BadRequestException('Revisão anterior ao início do contrato.');return day;
}
export function proposeSchedule(s:State,plan:any,input:any){
 const effectiveDate=revisionDate(s,input),calendar=workCalendar(plan.source.calendar||{}),physical=physicalAt(s,effectiveDate),previous=s.scheduleRevisions?.at(-1),warnings:string[]=[];
 const lines=s.items.map(item=>{
  const p=physical.get(item.id),row=plan.rows.find((r:any)=>r.itemId===item.id),old=previous?.lines.find((r:any)=>r.itemId===item.id),qty=decimal(item.quantity),done=p?decimal(p.executedPercent).mul(p.quantityAtRecord??item.quantity).div(100):null;
  if(qty.eq(0))return {itemId:item.id,status:'SUPPRESSED',start:null,end:null,teams:null};
  if(done===null){warnings.push(`${item.number||item.code}: registre o apontamento físico, inclusive zero para serviço ainda não iniciado.`);return {itemId:item.id,status:'UNREPORTED',start:null,end:null,teams:row?.teams?String(row.teams):'1'};}
  if(done.gte(qty)&&p?.actualEnd)return {itemId:item.id,status:'COMPLETE',start:p.actualStart,end:p.actualEnd,teams:old?.teams||String(row?.teams||1)};
  const remaining=qty.minus(done),teams=old?.teams||String(row?.teams||1),oldRemaining=old?decimal(old.quantity).minus(old.executedQuantity):null;
  const duration=oldRemaining?.gt(0)&&old.start&&old.end?decimal(calendar.count(old.start,old.end)).mul(remaining).div(oldRemaining):row?.durationDays&&decimal(item.originalQuantity).gt(0)?decimal(row.durationDays).mul(remaining).div(item.originalQuantity):null;
  const start=calendar.next([shiftDay(effectiveDate,1),old?.start||row?.start||''].sort().at(-1)!);
  if(duration===null){warnings.push(`${item.number||item.code}: serviço novo ou sem duração na origem; informe o prazo do saldo.`);return {itemId:item.id,status:'REMAINING',start,end:null,teams};}
  const days=Math.max(1,Number(duration.ceil()));return {itemId:item.id,status:'REMAINING',start,end:calendar.end(start,days),teams};
 });
 return {effectiveDate,amendmentId:s.amendments.at(-1)?.id||'',calendar:calendar.cfg,lines,warnings,method:'REMAINING_QUANTITY_AT_CAPTURED_PRODUCTIVITY',notice:'Proposta por saldo quantitativo, duração e equipes da referência anterior. Confira frentes, precedências e disponibilidade de recursos antes de aprovar; serviços novos exigem prazo informado.'};
}
/** Creates an immutable, compact revision. No changes to items, events or finance. */
export function recordScheduleRevision(s:State,p:any,id:string){
 const effectiveDate=revisionDate(s,p.effectiveDate),title=text(p.title,150),reason=text(p.reason,2000),formalReference=text(p.formalReference,1000),amendment=s.amendments.at(-1);
 if(!amendment||p.amendmentId!==amendment.id)throw new BadRequestException('Vincule a revisão ao último aditivo do contrato.');
 if(!Array.isArray(p.lines)||p.lines.length!==s.items.length||p.lines.length>10000)throw new BadRequestException('A revisão deve conter todos os serviços, inclusive novos e suprimidos.');
 const calendar=workCalendar(p.calendar),physical=physicalAt(s,effectiveDate),seen=new Set<string>();
 const lines=p.lines.map((line:any)=>{
  const item=s.items.find(i=>i.id===line.itemId);if(!item||seen.has(item.id))throw new BadRequestException('Serviço inexistente ou duplicado na revisão.');seen.add(item.id);
  const quantity=item.quantity,baseValue=scheduleItemValue(item),report=physical.get(item.id),executed=report?decimal(report.executedPercent).mul(report.quantityAtRecord??quantity).div(100):decimal(0);
  if(decimal(quantity).eq(0))return {itemId:item.id,quantity,baseValue,executedQuantity:'0',status:'SUPPRESSED',start:null,end:null,teams:null};
  if(!report)throw new BadRequestException(`Serviço ${item.number||item.code} sem apontamento físico na revisão.`);
  if(executed.gt(quantity))throw new BadRequestException(`Execução do serviço ${item.number||item.code} excede o quantitativo vigente; concilie o apontamento antes de reprogramar.`);
  if(!line.start||!line.end)throw new BadRequestException(`Serviço ${item.number||item.code}: informe início e término da reprogramação.`);
  const start=date(line.start),end=date(line.end),teams=value(line.teams,true),complete=executed.eq(quantity);
  if(decimal(teams).gt(10000))throw new BadRequestException('Quantidade de equipes superior ao limite.');
  if(end<start||Date.parse(end)-Date.parse(start)>3660*DAY)throw new BadRequestException('Intervalo de reprogramação inválido ou superior a dez anos.');
  if(complete){if(!report.actualEnd||start!==report.actualStart||end!==report.actualEnd)throw new BadRequestException('Serviço concluído deve preservar início e término reais.');}
  else {
   if(start<=effectiveDate||end<=effectiveDate)throw new BadRequestException('O saldo a executar deve ficar após a data de corte da revisão.');
   if(!calendar.isWork(start)||!calendar.isWork(end))throw new BadRequestException(`Serviço ${item.number||item.code}: início e término do saldo devem ser dias úteis do calendário.`);
  }
  return {itemId:item.id,quantity,baseValue,executedQuantity:executed.toFixed(),actualStart:report.actualStart||null,actualEnd:complete?report.actualEnd:null,reportDate:report.date,status:complete?'COMPLETE':'REMAINING',start,end,teams};
 });
 const historyDates=[...new Set([...s.progress.filter(r=>r.date<=effectiveDate).map(r=>r.date),...(s.itemProgress||[]).filter((r:any)=>r.date<=effectiveDate).map((r:any)=>r.date),effectiveDate])].sort() as string[];
 const history=historyDates.map(day=>{
  const reports=physicalAt(s,day);let complete=true;
  const amounts=lines.map((l:any)=>{if(decimal(l.quantity).eq(0))return '0';const item=s.items.find(i=>i.id===l.itemId)!;if(item.introducedOn&&item.introducedOn>day)return '0';const report=reports.get(l.itemId);if(!report){complete=false;return '0';}return decimal(l.baseValue).mul(report.executedPercent).mul(report.quantityAtRecord??l.quantity).div(l.quantity).div(100);});
  return {date:day,amount:complete?money(sum(amounts)):null};
 });
 const baseValue=currentTotals(s).contract,lineSumBaseValue=money(sum(lines.map((l:any)=>money(l.baseValue))));
 const revision={id,number:(s.scheduleRevisions?.length||0)+1,title,reason,formalReference,effectiveDate,amendmentId:amendment.id,amendmentTitle:amendment.title,scopeHash:scheduleScope(s),baseValue,lineSumBaseValue,baseRoundingAdjustment:money(decimal(baseValue).minus(lineSumBaseValue)),calendar:calendar.cfg,method:'LINEAR_REMAINING_WORKDAYS',lines,history,end:lines.filter((l:any)=>l.end).map((l:any)=>l.end).sort().at(-1)||effectiveDate};
 (s.scheduleRevisions??=[]).push(revision);return revision;
}
export function scheduleCurve(revision:any,day:string){
 if(day<revision.effectiveDate)return revision.history.filter((p:any)=>p.date<=day).at(-1)?.amount??null;
 const calendar=workCalendar(revision.calendar);
 return money(sum(revision.lines.map((line:any)=>{
  if(decimal(line.quantity).eq(0))return '0';if(line.status==='COMPLETE'||day>=line.end)return line.baseValue;
  const done=decimal(line.executedQuantity).div(line.quantity),remaining=decimal(1).minus(done),elapsed=day<line.start?0:calendar.count(line.start,day),duration=calendar.count(line.start,line.end);
  return decimal(line.baseValue).mul(done.plus(remaining.mul(elapsed).div(duration||1)));
 })));
}
