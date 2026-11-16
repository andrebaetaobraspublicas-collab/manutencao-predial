import { BadRequestException } from '@nestjs/common';
import { recordScheduleRevision } from './contract-schedule';
import { Prisma } from '../../generated/prisma/client';
import { amountProduct, compensation, compensationInstallment, globalMeasurement, indexedPrice, unitMeasurement } from './contract-engine';
const D=Prisma.Decimal.clone({precision:60,rounding:Prisma.Decimal.ROUND_HALF_UP});
export const decimal=(x:unknown)=>new D(String(x));
export const money=(x:unknown)=>decimal(x).toFixed(2);
export const sum=(xs:unknown[])=>xs.reduce<Prisma.Decimal>((a,b)=>a.plus(decimal(b)),new D(0));
export function value(x:unknown,positive=false):string { if(typeof x!=='string'||!/^\d{1,12}(\.\d{1,6})?$/.test(x)||(positive&&decimal(x).lte(0)))throw new BadRequestException('Informe um decimal não negativo válido, com até seis casas.');return x; }
export function text(x:unknown,max=500):string { if(typeof x!=='string'||!x.trim()||x.length>max)throw new BadRequestException('Texto obrigatório ou longo demais.');return x.trim(); }
export function date(x:unknown):string { const s=text(x,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw new BadRequestException('Data inválida.');return s; }
export type Item={id:string;code:string;description:string;unit:string;originalQuantity:string;quantity:string;unitPrice:string;referencePrice:string;originalTotal:string;measured:string;start?:string;end?:string;number?:string;groupId?:string;groupName?:string;groupPath?:{id:string;number:string;name:string}[];sourceOrder?:number;sourceUnitPrice?:string;sourceTotal?:string;sourceRow?:number;sourceSheet?:string;introducedOn?:string;descriptionAtSnapshot?:string;unitAtSnapshot?:string;metadataProvenance?:any};
export type State={items:Item[];events:any[];amendments:any[];priceRules:any[];measurements:any[];payments:any[];progress:any[];refunds:any[];originalValue:string;paradigmOriginal:string;compensationRequired:string;retained:string;refunded:string;milestone:{balance:string;eligible:string;measured:string;allocated:string};regime:string;examples:any[];[key:string]:any};
export const initialState=(base:any):State=>({...structuredClone(base),amendments:[],priceRules:[],measurements:[],payments:[],progress:[],refunds:[],retained:'0.00',refunded:'0.00',compensationRequired:'0.00',milestone:{balance:'0.00',eligible:'0.00',measured:'0.00',allocated:'0.00'}});
const maxZero=(x:unknown)=>decimal(x).lt(0)?new D(0):decimal(x);
const approved=(s:State)=>s.measurements.filter(m=>m.status==='APPROVED');
export const effectiveDeduction=(m:any)=>money(decimal(m.deduction).plus(sum((m.compensationAdjustments||[]).map((a:any)=>a.delta))));
export const effectiveNet=(m:any)=>money(decimal(m.gross).minus(effectiveDeduction(m)));
function requireFormal(p:any){return text(p.formalReference,1000);}
function targetsRule(r:any,targetType:string,targetId:string){return (r.targetType||'ITEM')===targetType&&(targetType==='EVENT'?r.eventId:r.itemId)===targetId;}
function targetPrice(s:State,targetType:string,target:any,day:string){
 const rules=s.priceRules.filter(r=>targetsRule(r,targetType,target.id)&&r.effectiveDate<=day).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.sequence-b.sequence);
 return rules.at(-1)?.price||(targetType==='EVENT'?target.value:target.unitPrice);
}
function ancestorIds(s:State,event:any):string[]{
 const result:string[]=[],seen=new Set<string>([event.id]);let parent=event.parentId;
 while(parent){if(seen.has(parent))throw new BadRequestException('Ciclo no eventograma.');seen.add(parent);const node=s.events.find(e=>e.id===parent&&!e.archived);if(!node)throw new BadRequestException('Evento-pai inexistente.');result.push(parent);parent=node.parentId;}return result;
}
function eventLeaves(s:State,event:any):any[]{
 const children=s.events.filter(e=>!e.archived&&e.parentId===event.id);return children.length?children.flatMap(e=>eventLeaves(s,e)):[event];
}
function unpaidEventLeaves(s:State){return validateEvents(s.events).filter(e=>!e.measured&&!ancestorIds(s,e).some(id=>s.events.find(x=>x.id===id)?.measured));}
function eventPrice(s:State,event:any,day:string){return money(decimal(event.value).plus(sum(eventLeaves(s,event).map(e=>decimal(targetPrice(s,'EVENT',e,day)).minus(e.value)))));}
function eventPricing(s:State,ids:string[],day:string){
 const active=s.events.filter(e=>!e.archived);
 globalMeasurement({events:active.map(e=>({...e,amount:e.value,accepted:true})),selectedIds:ids,previouslyMeasuredIds:active.filter(e=>e.measured).map(e=>e.id)});
 return ids.map(id=>{const event=active.find(e=>e.id===id)!;return {eventId:id,baseAmount:money(event.value),amount:eventPrice(s,event,day),revision:event.revision||1,leaves:eventLeaves(s,event).map(e=>({eventId:e.id,revision:e.revision||1,baseAmount:money(e.value),amount:money(targetPrice(s,'EVENT',e,day))}))};});
}
/** Difference bulletins are value-only adjustments. Their reference prices are
 * recomputed at the original execution date, never at the bulletin issue date. */
function differenceLines(s:State,ids:string[]){
 if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)throw new BadRequestException('Selecione boletins originais distintos.');
 const result:any[]=[];
 for(const id of ids){const original=s.measurements.find(m=>m.id===id&&m.status==='APPROVED'&&m.kind!=='DIFFERENCE');if(!original)throw new BadRequestException('Boletim original aprovado não encontrado.');
  const rows=original.eventIds.length?(original.eventLines||original.eventIds.map((eventId:string)=>({eventId,amount:s.events.find(e=>e.id===eventId)?.value}))):original.lines;
  for(const row of rows){const targetId=row.itemId||row.eventId,targetType=row.itemId?'ITEM':'EVENT';
   const item=targetType==='ITEM'?s.items.find(i=>i.id===targetId):s.events.find(e=>e.id===targetId);if(!item)throw new BadRequestException('Origem da diferença não encontrada.');
   const eligibleRules=s.priceRules.filter(r=>r.retroactive&&r.effectiveDate<=original.executionDate&&(targetType==='ITEM'?targetsRule(r,'ITEM',targetId):eventLeaves(s,item).some(e=>targetsRule(r,'EVENT',e.id))));
   if(!eligibleRules.length)continue;
   const current=targetType==='ITEM'?amountProduct(row.quantity,priceAt(s,item as Item,original.executionDate)):eventPrice(s,item,original.executionDate);
   const prior=sum(approved(s).filter(m=>m.kind==='DIFFERENCE').flatMap(m=>m.lines.filter((l:any)=>l.originalMeasurementId===id&&l.targetType===targetType&&l.targetId===targetId).map((l:any)=>l.amount)));
   const amount=money(decimal(current).minus(row.amount).minus(prior));if(decimal(amount).eq(0))continue;
   result.push({originalMeasurementId:id,targetType,targetId,itemId:row.itemId,eventId:row.eventId,executionDate:original.executionDate,quantity:row.quantity,originalAmount:row.amount,previousDifference:money(prior),currentAmount:current,amount,ruleIds:eligibleRules.map(r=>r.id)});
  }
 }
 if(!result.length||sum(result.map(l=>l.amount)).eq(0))throw new BadRequestException('Não existem diferenças líquidas a aprovar.');return result;
}
function reconcileReservations(s:State,required:string,amendmentId:string){
 const netRetained=decimal(s.retained).minus(s.refunded),remaining=maxZero(decimal(required).minus(netRetained));
 const rows=approved(s).filter(m=>m.kind!=='DIFFERENCE').map(m=>({m,reserve:maxZero(decimal(effectiveDeduction(m)).minus(m.retained))})).filter(r=>r.reserve.gt(0));
 const reserved=sum(rows.map(r=>r.reserve)),target=remaining.lt(reserved)?remaining:reserved;let running=new D(0),allocated=new D(0);
 const changes:any[]=[];
 for(const row of rows){running=running.plus(row.reserve);const cumulative=reserved.eq(0)?new D(0):target.mul(running).div(reserved).toDecimalPlaces(2),next=cumulative.minus(allocated);allocated=cumulative;
  const delta=money(next.minus(row.reserve));if(delta!=='0.00'){const adjustment={amendmentId,delta,reason:'Conciliação da reserva não efetivada após novo aditivo'};(row.m.compensationAdjustments??=[]).push(adjustment);changes.push({measurementId:row.m.id,...adjustment});}
  row.m.effectiveDeduction=effectiveDeduction(row.m);row.m.effectiveNet=effectiveNet(row.m);
 }
 return {changes,reserved:money(target),unreserved:money(remaining.minus(target))};
}
function remainingEligible(s:State){return s.regime==='GLOBAL_PRICE'?money(sum(unpaidEventLeaves(s).map(e=>e.value))):money(decimal(currentTotals(s).contract).minus(sum(approved(s).filter(m=>m.kind!=='DIFFERENCE').map(m=>m.eligible))));}
function resetCompensationMilestone(s:State,required:string,allowOutstanding=false){
 const reserved=sum(approved(s).map(m=>maxZero(decimal(effectiveDeduction(m)).minus(m.retained)))),needed=maxZero(decimal(required).minus(decimal(s.retained).minus(s.refunded)).minus(reserved)),eligible=maxZero(remainingEligible(s));
 if(needed.gt(eligible)&&!allowOutstanding)throw new BadRequestException('Saldo elegível insuficiente; confirme conciliação manual para registrar o saldo a acertar.');
 const balance=needed.gt(eligible)?eligible:needed;s.outstandingReconciliation=money(needed.minus(balance));s.milestone={balance:money(balance),eligible:money(eligible),measured:'0.00',allocated:'0.00'};
 return {reserved:money(reserved),futureBalance:money(balance),eligible:money(eligible),outstandingReconciliation:s.outstandingReconciliation};
}
function amendmentLimits(s:State,p:any,lines:any[],effectiveDate:string){
 const previousPolicy=s.amendments.at(-1)?.limits,additionLimitPercent=String(p.additionLimitPercent||previousPolicy?.additionLimitPercent||'25');
 if(!['25','50'].includes(additionLimitPercent))throw new BadRequestException('Limite de acréscimo deve ser 25% ou 50%.');
 const renovationJustification=additionLimitPercent==='50'?text(p.renovationJustification||previousPolicy?.renovationJustification,2000):undefined;
 if(additionLimitPercent==='50'&&!previousPolicy?.renovationJustification)requireFormal(p);
 const itemPrice=(item:Item)=>s.regime==='UNIT_PRICE'?priceAt(s,item,effectiveDate):item.unitPrice;
 let initialUpdatedValue=money(sum(s.items.map(i=>decimal(i.originalQuantity).eq(0)?'0':s.priceRules.some(r=>targetsRule(r,'ITEM',i.id)&&r.effectiveDate<=effectiveDate)?amountProduct(i.originalQuantity,itemPrice(i)):i.originalTotal)));
 if(decimal(initialUpdatedValue).lte(0))throw new BadRequestException('Valor inicial atualizado deve ser positivo para os limites.');
 const additions:any[]=[],suppressions:any[]=[];
 for(const line of [...s.amendments.flatMap(a=>a.lines),...lines]){
  const item=s.items.find(i=>i.id===(line.itemId||line.newItem?.id));if(!item)continue;
  if(line.newItem)additions.push(amountProduct(line.newItem.quantity,itemPrice(item)));
  else if(decimal(line.quantityDelta).gt(0))additions.push(amountProduct(line.quantityDelta,itemPrice(item)));
  else if(decimal(line.quantityDelta).lt(0))suppressions.push(amountProduct(decimal(line.quantityDelta).abs().toFixed(),itemPrice(item)));
 }
 let additionValue=money(sum(additions)),suppressionValue=money(sum(suppressions));
 const globalPriceReview=s.regime==='GLOBAL_PRICE'&&s.priceRules.some(r=>r.effectiveDate<=effectiveDate);let manualMemory:any;
 if(globalPriceReview){
  const memory=p.limitsMemory;if(!memory)throw new BadRequestException('Contrato global com preço atualizado exige memória formal dos limites, vinculando índices e serviços.');
  initialUpdatedValue=money(value(memory.originalUpdatedValue,true));additionValue=money(value(memory.additionsUpdatedValue));suppressionValue=money(value(memory.suppressionsUpdatedValue));
  if(decimal(initialUpdatedValue).lte(0))throw new BadRequestException('Valor inicial atualizado deve ser positivo.');
  if(date(memory.referenceDate)!==effectiveDate)throw new BadRequestException('Memória dos limites deve usar a mesma data de referência do aditivo.');
  manualMemory={originalUpdatedValue:initialUpdatedValue,additionsUpdatedValue:additionValue,suppressionsUpdatedValue:suppressionValue,referenceDate:effectiveDate,justification:text(memory.justification,2000),documentReference:text(memory.documentReference,1000)};
 }
 const additionPercent=decimal(additionValue).mul(100).div(initialUpdatedValue),suppressionPercent=decimal(suppressionValue).mul(100).div(initialUpdatedValue);
 const exceeds=additionPercent.gt(additionLimitPercent)||suppressionPercent.gt(25);if(exceeds&&!p.limitExceptionReason)throw new BadRequestException('Limites cumulativos de acréscimos ou supressões excedidos; exige justificativa de exceção e referência formal.');const exceptionReason=exceeds?text(p.limitExceptionReason,2000):undefined;
 if(exceeds)requireFormal(p);
 return {basis:'CURRENT_PRICES_AT_AMENDMENT_DATE',source:globalPriceReview?'MANUAL_FORMAL_MEMORY':'CALCULATED_ITEM_PRICES',manualMemory,effectiveDate,initialUpdatedValue,additionValue,suppressionValue,additionPercent:additionPercent.toFixed(6),suppressionPercent:suppressionPercent.toFixed(6),additionLimitPercent,suppressionLimitPercent:'25',renovationJustification,exceptionReason,status:exceeds?'LEGAL_REVIEW_REQUIRED':'WITHIN_CONFIGURED_LIMITS',notice:globalPriceReview?'Valores atualizados informados em memória formal pelo responsável; o sistema confere percentuais, sem presumir mapeamento automático de índices nem regularidade jurídica.':'Controle aritmético; enquadramento e exceções dependem de análise jurídica formal.'};
}
function validateEvents(events:any[]){
 const active=events.filter(e=>!e.archived),ids=new Set<string>();
 for(const e of active){if(ids.has(e.id))throw new BadRequestException('Código de evento duplicado.');ids.add(e.id);value(e.value);}
 for(const e of active){const seen=new Set<string>([e.id]);let parent=e.parentId;while(parent){if(seen.has(parent))throw new BadRequestException('Ciclo no eventograma.');const p=active.find(x=>x.id===parent);if(!p)throw new BadRequestException('Evento-pai inexistente ou suprimido.');seen.add(parent);parent=p.parentId;}}
 const leaves=active.filter(e=>!active.some(child=>child.parentId===e.id));
 for(const e of active){const children=active.filter(c=>c.parentId===e.id);if(children.length&&!decimal(e.value).eq(sum(children.map(c=>c.value))))throw new BadRequestException(`Valor do evento ${e.id} deve igualar a soma de seus subeventos.`);}
 return leaves;
}
function reviseEvents(s:State,p:any,actionId:string,contractValue:string){
 const formalReference=requireFormal(p);if(!Array.isArray(p.eventChanges)||!p.eventChanges.length||p.eventChanges.length>500)throw new BadRequestException('Informe a revisão formal dos eventos.');
 const changes:any[]=[],seen=new Set<string>();
 for(const c of p.eventChanges){const key=text(c.eventId||c.id,80);if(seen.has(key))throw new BadRequestException('Evento repetido na revisão.');seen.add(key);
  const old=s.events.find(e=>e.id===key);if(c.eventId&&!old)throw new BadRequestException('Evento não encontrado.');if(!c.eventId&&old)throw new BadRequestException('Código do novo evento já utilizado.');
  if(old&&(old.measured||ancestorIds(s,old).some(id=>s.events.find(e=>e.id===id)?.measured)))throw new BadRequestException('Evento já medido deve ser preservado, inclusive seus subeventos.');
  if(old&&c.value!==undefined&&!decimal(c.value).eq(old.value)&&s.priceRules.some(r=>targetsRule(r,'EVENT',old.id)))throw new BadRequestException('Evento com atualização de preço exige substituição formal por novo evento para alterar sua base; preserve a memória da regra.');
  const before=old?structuredClone(old):null;
  if(c.remove===true){if(!old)throw new BadRequestException('Evento inexistente.');old.archived=true;changes.push({eventId:key,before,after:structuredClone(old)});continue;}
  const next={...(old||{id:key,accepted:false,measured:false}),name:c.name===undefined?old?.name:text(c.name,500),value:c.value===undefined?old?.value:money(value(c.value)),parentId:c.parentId===undefined?old?.parentId:c.parentId===null?undefined:text(c.parentId,80),deadline:c.deadline===undefined?old?.deadline:c.deadline,archived:false,revision:(old?.revision||1)+1};
  if(!next.name||next.value===undefined)throw new BadRequestException('Nome e valor são obrigatórios para novo evento.');
  if(next.deadline!==undefined&&next.deadline!==null&&(!Number.isInteger(next.deadline)||next.deadline<0||next.deadline>36500))throw new BadRequestException('Prazo do evento inválido.');
  if(old)Object.assign(old,next);else s.events.push(next);changes.push({eventId:key,before,after:structuredClone(next)});
 }
 const leaves=validateEvents(s.events),eventTotal=money(sum(leaves.map(e=>e.value)));
 for(const r of s.priceRules.filter(r=>(r.targetType||'ITEM')==='EVENT'))if(s.events.some(e=>!e.archived&&e.parentId===r.eventId))throw new BadRequestException('Evento com regra de preço deve continuar como folha; crie uma substituição formal para mudar a estrutura.');
 if(eventTotal!==contractValue)throw new BadRequestException(`Eventos atualizados somam R$ ${eventTotal}; devem reconciliar com o escopo de R$ ${contractValue}.`);
 for(const change of changes){const e=s.events.find(x=>x.id===change.eventId);if(e&&!e.archived&&ancestorIds(s,e).some(id=>s.events.find(x=>x.id===id)?.measured))throw new BadRequestException('Não inserir nem modificar subeventos em escopo já medido.');}
 const version={id:actionId,version:(s.eventVersions?.length||0)+1,effectiveDate:p.effectiveDate,formalReference,changes,total:eventTotal};
 (s.eventVersions??=[]).push(version);return version;
}
export function currentTotals(s:State){
 const contract=sum(s.items.map(i=>decimal(i.originalTotal).plus(decimal(i.quantity).minus(i.originalQuantity).mul(i.unitPrice))));
 const reference=sum(s.items.map(i=>amountProduct(i.quantity,i.referencePrice)));
 return {contract:money(contract),reference:money(reference)};
}
export function summary(s:State){
 const totals=currentTotals(s),approved=sum(s.measurements.filter(m=>m.status==='APPROVED').map(m=>m.gross)),paid=sum(s.payments.map(p=>p.amount));
 const reserved=sum(s.measurements.filter(m=>m.status==='APPROVED').map(m=>maxZero(decimal(effectiveDeduction(m)).minus(m.retained))));
 const comp=compensation({originalContract:s.originalValue,originalReference:s.paradigmOriginal,currentContract:totals.contract,currentReference:totals.reference,retained:s.retained,refunded:s.refunded});
 const priceReferenceDate=[...s.priceRules.map(r=>r.effectiveDate),...s.amendments.map(a=>a.effectiveDate),s.baseDate||s.sourceStart||'0001-01-01'].sort().at(-1)!;
 const currentPricedValue=s.regime==='GLOBAL_PRICE'?money(decimal(totals.contract).plus(sum(s.events.filter(e=>!e.archived&&!s.events.some(c=>!c.archived&&c.parentId===e.id)).map(e=>decimal(targetPrice(s,'EVENT',e,priceReferenceDate)).minus(e.value))))):money(sum(s.items.map(i=>s.priceRules.some(r=>targetsRule(r,'ITEM',i.id)&&r.effectiveDate<=priceReferenceDate)?amountProduct(i.quantity,priceAt(s,i,priceReferenceDate)):decimal(i.originalTotal).plus(decimal(i.quantity).minus(i.originalQuantity).mul(i.unitPrice)))));
 const priceAdjustmentValue=money(decimal(currentPricedValue).minus(totals.contract));
 return {originalValue:s.originalValue,currentValue:totals.contract,currentPricedValue,priceAdjustmentValue,priceReferenceDate,paradigmValue:totals.reference,approved:money(approved),paid:money(paid),outstanding:money(sum(s.measurements.filter(m=>m.status==='APPROVED').map(m=>decimal(effectiveNet(m)).minus(m.paid)))),compensationDue:money(decimal(comp.toRecover).minus(reserved).lt(0)?0:decimal(comp.toRecover).minus(reserved)),refundDue:comp.toRefund,compensationRequired:comp.required,retained:s.retained,refunded:s.refunded,reserved:money(reserved),outstandingReconciliation:s.outstandingReconciliation||'0.00',originalDiscount:comp.originalDiscount,currentDiscount:comp.currentDiscount};
}
/** Four comparable curves in base-date BRL. Price differences and refunds are
 * shown as cash movements separately; they never manufacture physical progress.
 * A missing plan/physical report stays null rather than becoming a guessed 0. */
export function planningComparison(s:State){
 const baseValue=currentTotals(s).contract,denominator=decimal(baseValue),sourceRows=Array.isArray(s.planningBaseline?.rows)?s.planningBaseline.rows:[],baseline:any[]=[],sourceDivisor=s.planningBaseline?.monetaryUnit==='CENT'?100:1;
 for(const row of sourceRows){
  if(typeof row.key!=='string'||!/^\d{4}-\d{2}(?:-\d{2})?$/.test(row.key))continue;
  const day=row.key.length===7?new Date(Date.UTC(Number(row.key.slice(0,4)),Number(row.key.slice(5,7)),0)).toISOString().slice(0,10):row.key;
  try{date(day);const cumulative=decimal(row.ce??decimal(row.pce).mul(s.planningBaseline.total)).div(sourceDivisor);if(!cumulative.isFinite()||cumulative.lt(0))continue;baseline.push({date:day,amount:money(cumulative)});}catch{continue;}
 }
 const allDates=[...new Set([...baseline.map(r=>r.date),...s.progress.map(r=>r.date),...approved(s).map(m=>m.executionDate),...s.payments.map(p=>p.date),...s.refunds.map(r=>r.date),...s.amendments.map(a=>a.effectiveDate)])].sort();
 const pct=(x:any)=>x===null?null:denominator.eq(0)?'0.00':decimal(x).mul(100).div(denominator).toFixed(2);
 const rows=allDates.map(day=>{
  const manual=s.progress.filter(r=>r.date<=day).sort((a,b)=>a.date.localeCompare(b.date)).at(-1),source=baseline.filter(r=>r.date<=day).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
  const plannedValue=manual?money(decimal(manual.plannedPercent).div(100).mul(manual.baseValue||s.originalValue)):source?.amount??null;
  const executedValue=manual?money(decimal(manual.executedPercent).div(100).mul(manual.baseValue||s.originalValue)):null;
  const ordinary=approved(s).filter(m=>m.kind!=='DIFFERENCE'&&m.executionDate<=day),measuredValue=money(sum(ordinary.map(m=>m.eligible)));
  const paidValue=money(sum(ordinary.map(m=>{
   const cash=sum(s.payments.filter(p=>p.measurementId===m.id&&p.date<=day).map(p=>p.amount)),adjustments=sum((m.compensationAdjustments||[]).filter((a:any)=>(a.date||s.amendments.find(x=>x.id===a.amendmentId)?.effectiveDate)<=day).map((a:any)=>a.delta));
   const net=decimal(m.gross).minus(decimal(m.deduction).plus(adjustments));if(net.eq(0))return s.payments.some(p=>p.measurementId===m.id&&p.noCashSettlement&&p.date<=day)?m.eligible:'0';
   return decimal(m.eligible).mul(cash).div(net);
  })));
  const cashPaid=money(sum(s.payments.filter(p=>p.date<=day).map(p=>p.amount))),cashRefunded=money(sum(s.refunds.filter(r=>r.date<=day).map(r=>r.amount)));
  return {date:day,baseValue,plannedPercent:pct(plannedValue),executedPercent:pct(executedValue),measuredPercent:pct(measuredValue),paidPercent:pct(paidValue),plannedValue,executedValue,measuredValue,paidValue,cashPaid,cashRefunded,plannedSource:manual?'CONTRACT_PROGRESS':source?'SOURCE_SCHEDULE':null,executedSource:manual?'CONTRACT_PROGRESS':null};
 });
 return {baseValue,basis:'CURRENT_SCOPE_AT_BASE_PRICES',sourcePlanValue:s.planningBaseline?.total?money(decimal(s.planningBaseline.total).div(sourceDivisor)):null,rows,latest:rows.at(-1)||null};
}
function priceAt(s:State,item:Item,day:string){return targetPrice(s,'ITEM',item,day);}
/** A worksheet is a read model, reconstructed from dated quantities and price
 * rules. It never substitutes today's price for an earlier execution date. */
export function contractWorksheet(s:State,requestedDate?:string){
 const day=requestedDate?date(requestedDate):[...s.amendments.map(a=>a.effectiveDate),...s.priceRules.map(r=>r.effectiveDate),...s.measurements.map(m=>m.executionDate),s.baseDate||s.sourceStart||new Date().toISOString().slice(0,10)].sort().at(-1)!;
 const historical=structuredClone(s);historical.amendments=s.amendments.filter(a=>a.effectiveDate<=day);historical.priceRules=s.priceRules.filter(r=>r.effectiveDate<=day);
 for(const version of [...(s.eventVersions||[])].reverse().filter(v=>v.effectiveDate>day))for(const change of [...version.changes].reverse()){
  const n=historical.events.findIndex(e=>e.id===change.eventId);if(change.before){if(n<0)historical.events.push(structuredClone(change.before));else historical.events[n]=structuredClone(change.before);}else if(n>=0)historical.events.splice(n,1);
 }
 const rows=s.items.flatMap((item,n)=>{
  const creation=s.amendments.find(a=>a.lines.some((l:any)=>l.newItem?.id===item.id));if(creation&&creation.effectiveDate>day)return [];
  const changes=historical.amendments.flatMap(a=>a.lines.filter((l:any)=>(l.itemId||l.newItem?.id)===item.id));
  const additionQuantity=sum(changes.map(l=>l.newItem?l.newItem.quantity:decimal(l.quantityDelta).gt(0)?l.quantityDelta:'0')).toFixed();
  const suppressionQuantity=sum(changes.map(l=>!l.newItem&&decimal(l.quantityDelta).lt(0)?decimal(l.quantityDelta).abs():'0')).toFixed();
  const quantity=decimal(item.originalQuantity).plus(additionQuantity).minus(suppressionQuantity).toFixed();
  const measuredQuantity=sum(approved(s).filter(m=>m.kind!=='DIFFERENCE'&&m.executionDate<=day).flatMap(m=>m.lines.filter((l:any)=>l.itemId===item.id).map((l:any)=>l.quantity))).toFixed();
  const currentPrice=priceAt(historical,item,day),rule=historical.priceRules.filter(r=>targetsRule(r,'ITEM',item.id)).at(-1),baseTotal=money(decimal(item.originalTotal).plus(decimal(quantity).minus(item.originalQuantity).mul(item.unitPrice)));
  const referenceTotal=amountProduct(quantity,item.referencePrice),originalReferenceTotal=amountProduct(item.originalQuantity,item.referencePrice);
  return [{...item,number:item.number||String(n+1),sourceOrder:item.sourceOrder??n,quantity,measured:measuredQuantity,measuredQuantity,remainingQuantity:decimal(quantity).minus(measuredQuantity).toFixed(),additionQuantity,suppressionQuantity,currentPrice,currentTotal:rule?amountProduct(quantity,currentPrice):baseTotal,baseTotal,referenceTotal,currentReferencePrice:item.referencePrice,currentReferenceTotal:referenceTotal,originalContractTotal:item.originalTotal,originalReferenceTotal,originalDiscountPercent:decimal(originalReferenceTotal).eq(0)?null:decimal(1).minus(decimal(item.originalTotal).div(originalReferenceTotal)).mul(100).toFixed(6),currentDiscountPercent:decimal(referenceTotal).eq(0)?null:decimal(1).minus(decimal(baseTotal).div(referenceTotal)).mul(100).toFixed(6),priceRuleId:rule?.id||null,priceMemory:rule||null}];
 });
 historical.items=rows;
 for(const event of historical.events)event.measured=approved(s).some(m=>m.kind!=='DIFFERENCE'&&m.executionDate<=day&&m.eventIds.includes(event.id));
 const events=historical.events.filter(e=>!e.archived).map(e=>({...e,baseValue:e.value,currentPrice:eventPrice(historical,e,day),currentTotal:eventPrice(historical,e,day)}));
 // Keep the ledger's aggregate rounding policy. Rounded display lines can
 // differ by cents; expose that reconciliation instead of changing history.
 const baseValue=currentTotals(historical).contract,lineSumBaseValue=money(sum(rows.map(i=>i.baseTotal))),paradigmValue=money(sum(rows.map(i=>i.referenceTotal)));
 const leaves=events.filter(e=>!events.some(c=>c.parentId===e.id));
 const pricedValue=s.regime==='GLOBAL_PRICE'?money(decimal(baseValue).plus(sum(leaves.map(e=>decimal(e.currentPrice).minus(e.baseValue))))):money(sum(rows.map(i=>i.priceRuleId?i.currentTotal:decimal(i.originalTotal).plus(decimal(i.quantity).minus(i.originalQuantity).mul(i.unitPrice)))));
 const lineSumPricedValue=money(sum(s.regime==='GLOBAL_PRICE'?leaves.map(e=>e.currentTotal):rows.map(i=>i.currentTotal)));
 return {date:day,items:rows,events,groups:structuredClone(s.groups||[]),summary:{originalValue:s.originalValue,originalParadigmValue:s.paradigmOriginal,currentValue:baseValue,currentPricedValue:pricedValue,lineSumBaseValue,baseRoundingAdjustment:money(decimal(baseValue).minus(lineSumBaseValue)),lineSumPricedValue,priceRoundingAdjustment:money(decimal(pricedValue).minus(lineSumPricedValue)),paradigmValue,originalDiscountPercent:decimal(1).minus(decimal(s.originalValue).div(s.paradigmOriginal)).mul(100).toFixed(6),currentDiscountPercent:decimal(paradigmValue).eq(0)?null:decimal(1).minus(decimal(baseValue).div(paradigmValue)).mul(100).toFixed(6)}};
}
/** Call with the ledger replayed only through this bulletin's approval (or its
 * creation for a draft) when an immutable historical document is required. */
export function measurementWorksheet(s:State,measurementId:string){
 const m=s.measurements.find(x=>x.id===measurementId);if(!m)throw new BadRequestException('Boletim não encontrado.');
 const index=s.measurements.indexOf(m),previous=approved(s).filter(x=>x.id!==m.id&&x.kind!=='DIFFERENCE'&&(m.approvalSequence?x.approvalSequence<m.approvalSequence:s.measurements.indexOf(x)<index));
 const worksheet=contractWorksheet(s,m.executionDate),baseSummary={periodGross:m.gross,previousGross:money(sum(previous.map(x=>x.gross))),accumulatedGross:money(sum([...previous.map(x=>x.gross),m.gross])),deduction:effectiveDeduction(m),net:effectiveNet(m),paid:m.paid,outstanding:money(decimal(effectiveNet(m)).minus(m.paid))};
 if(m.kind==='DIFFERENCE')return {kind:'DIFFERENCE',date:m.executionDate,measurement:structuredClone(m),groups:worksheet.groups,rows:m.lines.map((l:any)=>{const item=s.items.find(i=>i.id===l.itemId);return {...(item||{}),...l,periodAmount:l.amount,amount:l.amount};}),summary:baseSummary};
 if(s.regime==='UNIT_PRICE'){
  const rows=worksheet.items.map(item=>{const line=m.lines.find((l:any)=>l.itemId===item.id),priorLines=previous.flatMap(x=>x.lines.filter((l:any)=>l.itemId===item.id)),previousQuantity=line?.previousQuantity??sum(priorLines.map((l:any)=>l.quantity)).toFixed(),periodQuantity=line?.quantity||'0',accumulatedQuantity=decimal(previousQuantity).plus(periodQuantity).toFixed(),previousAmount=money(sum(priorLines.map((l:any)=>l.amount))),periodAmount=line?.amount||'0.00';
   return {...item,itemId:item.id,contractQuantity:line?.contractQuantity||item.quantity,previousQuantity,presentedQuantity:line?.presentedQuantity||'0',periodQuantity,accumulatedQuantity,remainingQuantity:decimal(line?.contractQuantity||item.quantity).minus(accumulatedQuantity).toFixed(),originalUnitPrice:item.unitPrice,unitPrice:line?.unitPrice||item.currentPrice,previousAmount,periodAmount,amount:periodAmount,accumulatedAmount:money(decimal(previousAmount).plus(periodAmount)),disallowedQuantity:line?.disallowedQuantity||'0',roundingAdjustment:line?.roundingAdjustment||'0.00'};
  });return {kind:'UNIT_PRICE',date:m.executionDate,measurement:structuredClone(m),groups:worksheet.groups,rows,summary:baseSummary};
 }
 const priorSelected=previous.flatMap(x=>x.eventIds),currentSelected=m.eventIds;
 const rows=worksheet.events.map(event=>{
  const prior=previous.filter(x=>x.eventIds.includes(event.id)),selected=currentSelected.includes(event.id),previousQuantity=prior.length?'1':'0',periodQuantity=selected?'1':'0',ancestors=ancestorIds(s,event),coveredByParent=[...priorSelected,...currentSelected].some(id=>ancestors.includes(id));
  const descendants=eventLeaves(s,event),complete=coveredByParent||priorSelected.includes(event.id)||selected;
  const previousAmount=money(sum(prior.map(x=>x.eventLines?.find((l:any)=>l.eventId===event.id)?.amount||event.value))),periodAmount=selected?(m.eventLines?.find((l:any)=>l.eventId===event.id)?.amount||event.value):'0.00';
  const remainingValue=complete?'0.00':money(sum(descendants.filter(e=>![...priorSelected,...currentSelected].includes(e.id)&&!ancestorIds(s,e).some(id=>[...priorSelected,...currentSelected].includes(id))).map(e=>targetPrice(s,'EVENT',e,m.executionDate))));
  const firstChange=(s.eventVersions||[]).flatMap((v:any)=>v.changes).find((c:any)=>c.eventId===event.id);
  return {...event,eventId:event.id,number:event.id,code:event.id,description:event.name,unit:'EV',isAggregate:worksheet.events.some(e=>e.parentId===event.id),contractQuantity:'1',previousQuantity,presentedQuantity:periodQuantity,periodQuantity,accumulatedQuantity:complete?'1':decimal(previousQuantity).plus(periodQuantity).toFixed(),remainingQuantity:complete?'0':'1',originalValue:firstChange?(firstChange.before?.value||'0.00'):event.value,currentValue:event.currentPrice,unitPrice:event.currentPrice,previousAmount,periodAmount,amount:periodAmount,accumulatedAmount:money(decimal(previousAmount).plus(periodAmount)),remainingValue,accepted:selected?m.status==='APPROVED':prior.length>0,coveredByParent,directlyMeasuredPreviously:prior.length>0,directlyMeasuredInPeriod:selected,aggregationMode:coveredByParent?'COVERED_BY_PARENT':selected||prior.length?'DIRECT_MEASUREMENT':'CHILDREN_SUBTOTAL'};
 });
 // Presentation only: parents consolidate immediate children bottom-up. A
 // directly measured parent owns its recorded amount; covered descendants
 // remain zero rather than inventing an allocation of the accepted price.
 const aggregate=(row:any)=>{const children=rows.filter(r=>r.parentId===row.id);for(const child of children)aggregate(child);if(!children.length)return;
  for(const key of ['originalValue','baseValue','currentValue'])row[key]=money(sum(children.map((child:any)=>child[key])));
  row.currentPrice=row.currentValue;row.currentTotal=row.currentValue;row.unitPrice=row.currentValue;
  if(!row.directlyMeasuredPreviously)row.previousAmount=money(sum(children.map(child=>child.previousAmount)));
  if(!row.directlyMeasuredInPeriod)row.periodAmount=money(sum(children.map(child=>child.periodAmount)));
  row.amount=row.periodAmount;row.accumulatedAmount=money(decimal(row.previousAmount).plus(row.periodAmount));
  if(!row.coveredByParent&&!row.directlyMeasuredPreviously&&!row.directlyMeasuredInPeriod)row.remainingValue=money(sum(children.map(child=>child.remainingValue)));
  if(!row.coveredByParent&&!row.directlyMeasuredPreviously&&!row.directlyMeasuredInPeriod&&children.every(child=>child.accumulatedQuantity==='1')){row.accumulatedQuantity='1';row.remainingQuantity='0';row.accepted=children.every(child=>child.accepted);}
 };
 for(const root of rows.filter(r=>!r.parentId))aggregate(root);
 return {kind:'GLOBAL_PRICE',date:m.executionDate,measurement:structuredClone(m),groups:[],rows,summary:baseSummary};
}
export function applyAction(s:State,kind:string,p:any,id:string):any {
 const draft=structuredClone(s),result=applyActionUnsafe(draft,kind,p,id);Object.assign(s,draft);return result;
}
function applyActionUnsafe(s:State,kind:string,p:any,id:string):any {
 try {
  if(kind==='schedule-revision')return recordScheduleRevision(s,p,id);
  if(kind==='metadata-enrichment'){
   const reason=text(p.reason,2000),sourceHash=text(p.sourceHash,64),sourceReferenceId=text(p.sourceReferenceId,80);
   if(!/^[a-f0-9]{64}$/.test(sourceHash)||!Number.isInteger(p.checkedSourceItems)||p.checkedSourceItems<1||!Array.isArray(p.lines)||!p.lines.length||p.lines.length>1000||p.lines.length>p.checkedSourceItems)throw new BadRequestException('Conferência cadastral inválida.');
   const seen=new Set<string>(),changes=p.lines.map((line:any)=>{
    if(seen.has(line.itemId))throw new BadRequestException('Item cadastral repetido.');seen.add(line.itemId);const item=s.items.find(i=>i.id===line.itemId);
    if(!item||item.code!==line.expectedCode||item.description!==line.expectedDescription||item.unit!==line.expectedUnit)throw new BadRequestException('Identificação ou metadados anteriores divergentes.');
    const description=text(line.description,5000),unit=text(line.unit,20),provenance=structuredClone(line.provenance);
    if(!provenance||provenance.code!==item.code||provenance.referenceId!==sourceReferenceId||!['I','C'].includes(provenance.resourceType)||!['PROJECT_SNAPSHOT','PRIVATE_CATALOG','SINAPI_REFERENCE'].includes(provenance.descriptionSource)||!['PROJECT_SNAPSHOT','PRIVATE_CATALOG','SINAPI_REFERENCE'].includes(provenance.unitSource))throw new BadRequestException('Proveniência cadastral inválida.');
    const before={description:item.description,unit:item.unit};item.descriptionAtSnapshot??=item.description;item.unitAtSnapshot??=item.unit;item.description=description;item.unit=unit;item.metadataProvenance={...provenance,actionId:id,sourceHash};
    return {itemId:item.id,code:item.code,before,after:{description,unit},provenance};
   });
   const enrichment={id,reason,sourceHash,sourceReferenceId,checkedSourceItems:p.checkedSourceItems,changes};(s.metadataEnrichments??=[]).push(enrichment);return enrichment;
  }
  if(kind==='amendment'){
   const title=text(p.title,150),effectiveDate=date(p.effectiveDate),reason=text(p.reason,2000);
   if(s.measurements.some(m=>m.status==='APPROVED'&&m.executionDate>=effectiveDate))throw new BadRequestException('Aditivo deve produzir efeitos após a execução já medida; retroatividade requer conciliação específica.');
   if(s.amendments.some(a=>a.effectiveDate>effectiveDate))throw new BadRequestException('Aditivo retroativo exige conciliação específica.');
   if(!Array.isArray(p.lines)||(!p.lines.length&&s.regime!=='GLOBAL_PRICE')||p.lines.length>1000)throw new BadRequestException('Informe até 1.000 alterações de serviços; aditivo global permite revisão apenas de eventos.');
   const seen=new Set<string>(),lines=p.lines.map((l:any,n:number)=>{
    if(l.itemId){if(seen.has(l.itemId))throw new BadRequestException('Item repetido.');seen.add(l.itemId);const item=s.items.find(i=>i.id===l.itemId);if(!item)throw new BadRequestException('Item não encontrado.');
     if(typeof l.quantityDelta!=='string'||! /^-?\d{1,12}(\.\d{1,6})?$/.test(l.quantityDelta))throw new BadRequestException('Variação de quantidade inválida.');const next=decimal(item.quantity).plus(l.quantityDelta);if(next.lt(item.measured)||next.lt(0))throw new BadRequestException('Supressão alcança quantidade já medida.');const before=item.quantity;item.quantity=next.toFixed();const addition=decimal(l.quantityDelta).gt(0)?l.quantityDelta:'0',suppression=decimal(l.quantityDelta).lt(0)?decimal(l.quantityDelta).abs().toFixed():'0';return {itemId:item.id,description:item.description,unit:item.unit,originalQuantity:item.originalQuantity,unitPrice:item.unitPrice,originalTotal:item.originalTotal,quantityDelta:l.quantityDelta,before,after:item.quantity,beforeTotal:money(decimal(item.originalTotal).plus(decimal(before).minus(item.originalQuantity).mul(item.unitPrice))),afterTotal:money(decimal(item.originalTotal).plus(decimal(item.quantity).minus(item.originalQuantity).mul(item.unitPrice))),additionQuantity:addition,additionValue:amountProduct(addition,item.unitPrice),suppressionQuantity:suppression,suppressionValue:amountProduct(suppression,item.unitPrice)};}
    const q=value(l.quantity,true),unitPrice=value(l.unitPrice),referencePrice=value(l.referencePrice,true);
    const expected=decimal(referencePrice).mul(s.originalValue).div(s.paradigmOriginal).toFixed(2);if(decimal(unitPrice).gt(expected))throw new BadRequestException('Preço do serviço novo supera referência com desconto original.');
    const group=l.groupId?(s.groups||[]).find((g:any)=>g.id===l.groupId):undefined;if(l.groupId&&!group)throw new BadRequestException('Grupo do novo serviço não encontrado.');
    const number=l.number?text(l.number,40):`NOVO-${s.items.length+1}`;if(s.items.some(i=>i.number===number)||(s.groups||[]).some((g:any)=>g.number===number))throw new BadRequestException('Número de item ou grupo já utilizado.');
    const groupPath:any[]=[];let ancestor=group;const visited=new Set();while(ancestor){if(visited.has(ancestor.id))throw new BadRequestException('Hierarquia de grupos inválida.');visited.add(ancestor.id);groupPath.unshift({id:ancestor.id,number:ancestor.number,name:ancestor.name});ancestor=(s.groups||[]).find((g:any)=>g.id===ancestor.parentId);}
    const item:Item={id:`${id}-${n}`,code:l.code?text(l.code,80):`NOVO-${s.items.length+1}`,number,groupId:group?.id,groupName:group?.name,groupPath,sourceOrder:s.items.length,introducedOn:effectiveDate,description:text(l.description),unit:text(l.unit,20),originalQuantity:'0',quantity:q,unitPrice,referencePrice,originalTotal:'0.00',measured:'0'};s.items.push(item);return {newItem:structuredClone(item),itemId:item.id,number:item.number,code:item.code,groupId:item.groupId,description:item.description,unit:item.unit,originalQuantity:'0',unitPrice:item.unitPrice,originalTotal:'0.00',quantityDelta:q,before:'0',after:q,beforeTotal:'0.00',afterTotal:amountProduct(q,item.unitPrice),additionQuantity:q,additionValue:amountProduct(q,item.unitPrice),suppressionQuantity:'0',suppressionValue:'0.00'};});
   const limits=amendmentLimits(s,p,lines,effectiveDate),totals=currentTotals(s),eventRevision=s.regime==='GLOBAL_PRICE'?reviseEvents(s,p,id,totals.contract):undefined;
   const c=compensation({originalContract:s.originalValue,originalReference:s.paradigmOriginal,currentContract:totals.contract,currentReference:totals.reference,retained:s.retained,refunded:s.refunded});
   const reconciliation=reconcileReservations(s,c.required,id);
   const milestone=resetCompensationMilestone(s,c.required,p.compensationResolution==='MANUAL_RECONCILIATION');
   s.compensationRequired=c.required;const a={id,title,effectiveDate,reason,lines,...totals,compensation:c,eventRevision,reservationReconciliation:reconciliation,milestone,limits};s.amendments.push(a);return a;
  }
  if(kind==='price-batch'){
   if(!Array.isArray(p.targets)||!p.targets.length||p.targets.length>1000)throw new BadRequestException('Selecione entre um e 1.000 itens ou eventos para o lote.');
   const title=text(p.title,150),effectiveDate=date(p.effectiveDate),seen=new Set<string>(),before=summary(s),rules:any[]=[];
   for(const [n,target] of p.targets.entries()){
    const targetType=target.targetType||(target.eventId?'EVENT':'ITEM'),targetId=targetType==='EVENT'?target.eventId:target.itemId,key=`${targetType}:${targetId}`;
    if(seen.has(key))throw new BadRequestException('Item ou evento repetido no lote.');seen.add(key);
    const rule=applyActionUnsafe(s,'price-rule',{...p,targetType,itemId:target.itemId,eventId:target.eventId,anchorRuleId:target.anchorRuleId??p.anchorRuleId,newPrice:target.newPrice??p.newPrice},`${id}-${n}`);rule.batchId=id;rules.push(rule);
   }
   const after=summary(s),batch={id,title,effectiveDate,mode:p.mode,targetCount:rules.length,ruleIds:rules.map(r=>r.id),beforeValue:before.currentPricedValue,afterValue:after.currentPricedValue,difference:money(decimal(after.currentPricedValue).minus(before.currentPricedValue))};(s.priceBatches??=[]).push(batch);return {...batch,rules};
  }
  if(kind==='price-rule'){
   const targetType=p.targetType||(p.eventId?'EVENT':'ITEM');if(!['ITEM','EVENT'].includes(targetType))throw new BadRequestException('Alvo da regra inválido.');
   if((s.regime==='GLOBAL_PRICE')!==(targetType==='EVENT'))throw new BadRequestException('Atualização deve seguir o regime do contrato.');
   const item=targetType==='EVENT'?s.events.find(e=>e.id===p.eventId&&!e.archived):s.items.find(i=>i.id===p.itemId);if(!item)throw new BadRequestException('Item ou evento não encontrado.');const effectiveDate=date(p.effectiveDate);
   if(targetType==='EVENT'&&s.events.some(e=>!e.archived&&e.parentId===item.id))throw new BadRequestException('Atualize os eventos-folha; o valor do evento-pai é calculado pelos subeventos.');
   const affectsApproved=approved(s).some(m=>m.kind!=='DIFFERENCE'&&m.executionDate>=effectiveDate&&(targetType==='EVENT'?m.eventIds.some((eventId:string)=>eventId===item.id||ancestorIds(s,item).includes(eventId)):m.lines.some((l:any)=>l.itemId===item.id)));
   if(affectsApproved&&p.retroactive!==true)throw new BadRequestException('Atualização retroativa requer autorização e boletim de diferenças; não reescreva medições aprovadas.');
   const formalReference=affectsApproved||p.anchorRuleId?requireFormal(p):p.formalReference?text(p.formalReference,1000):undefined;
   if(s.priceRules.some(r=>targetsRule(r,targetType,item.id)&&r.effectiveDate>=effectiveDate))throw new BadRequestException('Já existe regra nesta data ou posterior; revise a sequência.');
   const latestEquilibrium=s.priceRules.filter(r=>targetsRule(r,targetType,item.id)&&r.mode==='REEQUILIBRIUM').at(-1);
   let basePrice=targetType==='EVENT'?item.value:item.unitPrice;
   if(p.anchorRuleId){const anchor=s.priceRules.find(r=>r.id===p.anchorRuleId&&targetsRule(r,targetType,item.id));if(!anchor||anchor.mode!=='REEQUILIBRIUM'||anchor.effectiveDate>=effectiveDate||anchor.id!==latestEquilibrium?.id)throw new BadRequestException('Âncora deve ser o último reequilíbrio formal deste serviço ou evento.');basePrice=anchor.price;}
   let price:string,components:any[]=[],factor:any=null;
   if(p.mode==='REEQUILIBRIUM')price=money(value(p.newPrice));
   else {if(!['INDEX','BASKET'].includes(p.mode))throw new BadRequestException('Modalidade inválida.');if(latestEquilibrium&&!p.anchorRuleId)throw new BadRequestException('Reajuste após reequilíbrio exige âncora formal explícita.');components=p.mode==='INDEX'?[{weight:'1',baseIndex:value(p.baseIndex,true),currentIndex:value(p.currentIndex,true)}]:p.components;if(!Array.isArray(components)||!components.length||components.length>12)throw new BadRequestException('Cesta inválida.');components=components.map(c=>({weight:value(c.weight),baseIndex:value(c.baseIndex,true),currentIndex:value(c.currentIndex,true)}));factor=indexedPrice({basePrice,components});price=factor.price;}
   const r={id,itemId:targetType==='ITEM'?item.id:undefined,eventId:targetType==='EVENT'?item.id:undefined,targetType,title:text(p.title,150),effectiveDate,reason:text(p.reason,2000),mode:p.mode,price,components,factor,basePrice,anchorRuleId:p.anchorRuleId||null,formalReference,retroactive:affectsApproved,sequence:s.priceRules.length};s.priceRules.push(r);return r;
  }
  if(kind==='difference-measurement'){
   const m:any={id,kind:'DIFFERENCE',title:text(p.title,150),period:text(p.period,30),executionDate:date(p.executionDate),evidence:text(p.reason,3000),status:'DRAFT',originalMeasurementIds:p.originalMeasurementIds,lines:differenceLines(s,p.originalMeasurementIds),eventIds:[],gross:'0.00',eligible:'0.00',deduction:'0.00',net:'0.00',paid:'0.00',retained:'0.00'};
   if(s.measurements.some(x=>x.period===m.period&&x.status!=='CANCELED'))throw new BadRequestException('Período já cadastrado.');
   if(m.lines.some((l:any)=>l.executionDate>m.executionDate))throw new BadRequestException('Boletim de diferenças não pode anteceder a execução original.');
   m.gross=money(sum(m.lines.map((l:any)=>l.amount)));m.net=m.gross;s.measurements.push(m);return m;
  }
  if(kind==='measurement'){
   const m:any={id,title:text(p.title,150),period:text(p.period,30),executionDate:date(p.executionDate),evidence:text(p.evidence,3000),status:'DRAFT',lines:[],eventIds:[],gross:'0.00',eligible:'0.00',deduction:'0.00',net:'0.00',paid:'0.00',retained:'0.00'};
   if(s.measurements.some(x=>x.period===m.period&&x.status!=='CANCELED'))throw new BadRequestException('Período já cadastrado.');
   if(s.amendments.some(a=>a.effectiveDate>m.executionDate))throw new BadRequestException('Medição anterior ao último aditivo exige conciliação histórica.');
   if(s.regime==='UNIT_PRICE'){
    if(!Array.isArray(p.lines)||!p.lines.length||p.lines.length>1000)throw new BadRequestException('Informe entre uma e 1.000 linhas.');const seen=new Set<string>();
    m.lines=p.lines.map((l:any)=>{if(seen.has(l.itemId))throw new BadRequestException('Item repetido.');seen.add(l.itemId);const i=s.items.find(x=>x.id===l.itemId);if(!i)throw new BadRequestException('Item não encontrado.');const quantity=value(l.quantity,true),presentedQuantity=value(l.presentedQuantity??quantity,true),unitPrice=priceAt(s,i,m.executionDate),r=unitMeasurement({contractQuantity:i.quantity,previousQuantity:i.measured,presentedQuantity,approvedQuantity:quantity,unitPrice});return {itemId:i.id,quantity,presentedQuantity,unitPrice,contractQuantity:i.quantity,previousQuantity:i.measured,accumulatedQuantity:r.accumulatedQuantity,remainingQuantity:r.remainingQuantity,baseAmount:amountProduct(quantity,i.unitPrice),amount:r.amount,disallowedQuantity:r.disallowedQuantity};});
    m.gross=money(sum(m.lines.map((l:any)=>l.amount)));m.eligible=money(sum(m.lines.map((l:any)=>l.baseAmount)));
   }else{if(!Array.isArray(p.eventIds)||!p.eventIds.length)throw new BadRequestException('Escolha eventos.');m.eventLines=eventPricing(s,p.eventIds,m.executionDate);m.eventIds=[...p.eventIds];m.gross=money(sum(m.eventLines.map((l:any)=>l.amount)));m.eligible=money(sum(m.eventLines.map((l:any)=>l.baseAmount)));}
   m.net=m.gross;s.measurements.push(m);return m;
  }
  if(kind==='approve-measurement'){
   const m=s.measurements.find(x=>x.id===p.measurementId);if(!m||m.status!=='DRAFT')throw new BadRequestException('Boletim não está em rascunho.');
   if(m.kind==='DIFFERENCE'){
    const recalculated=differenceLines(s,m.originalMeasurementIds);if(JSON.stringify(recalculated)!==JSON.stringify(m.lines))throw new BadRequestException('Diferença mudou após rascunho; cancele e recrie o boletim.');
    m.approvalSequence=approved(s).length+1;m.status='APPROVED';return {measurementId:m.id,deduction:'0.00',net:m.net,kind:m.kind};
   }
   if(s.amendments.some(a=>a.effectiveDate>m.executionDate))throw new BadRequestException('Rascunho anterior ao aditivo vigente exige conciliação histórica.');
   if(s.regime==='UNIT_PRICE'){for(const l of m.lines){const i=s.items.find(x=>x.id===l.itemId)!;if(priceAt(s,i,m.executionDate)!==l.unitPrice)throw new BadRequestException('Preço mudou após rascunho; cancele e crie novo boletim após conferência.');const r=unitMeasurement({contractQuantity:i.quantity,previousQuantity:i.measured,presentedQuantity:l.presentedQuantity,approvedQuantity:l.quantity,unitPrice:l.unitPrice});l.previousQuantity=i.measured;l.contractQuantity=i.quantity;l.accumulatedQuantity=r.accumulatedQuantity;l.remainingQuantity=r.remainingQuantity;i.measured=r.accumulatedQuantity;
    if(decimal(i.measured).eq(i.quantity)&&!s.priceRules.some(rule=>rule.itemId===i.id)){
     const expected=money(decimal(i.originalTotal).plus(decimal(i.quantity).minus(i.originalQuantity).mul(i.unitPrice))),previous=sum(s.measurements.filter(x=>x.status==='APPROVED').flatMap(x=>x.lines.filter((line:any)=>line.itemId===i.id).map((line:any)=>line.amount))),final=money(decimal(expected).minus(previous));l.roundingAdjustment=money(decimal(final).minus(l.amount));l.amount=final;l.baseAmount=final;
    }
   }m.gross=money(sum(m.lines.map((l:any)=>l.amount)));m.eligible=money(sum(m.lines.map((l:any)=>l.baseAmount)));}
   else{if(p.accepted!==true)throw new BadRequestException('Confirme explicitamente o aceite dos eventos e suas evidências.');const current=eventPricing(s,m.eventIds,m.executionDate);if(m.eventLines&&JSON.stringify(current)!==JSON.stringify(m.eventLines))throw new BadRequestException('Evento ou preço mudou após rascunho; cancele e recrie o boletim.');for(const e of s.events)if(m.eventIds.includes(e.id)){e.accepted=true;e.measured=true;}}
   if(decimal(s.milestone.balance).gt(0)){const cumulative=money(decimal(s.milestone.measured).plus(m.eligible)),r=compensationInstallment({balanceAtMilestone:s.milestone.balance,eligibleBalanceAtMilestone:s.milestone.eligible,measuredAtMilestone:cumulative,previousAllocated:s.milestone.allocated});m.deduction=r.deduction;s.milestone.measured=cumulative;s.milestone.allocated=r.cumulativeAllocated;}
   m.net=money(decimal(m.gross).minus(m.deduction));if(decimal(m.net).lt(0)||decimal(m.gross).lte(0))throw new BadRequestException('Compensação excede o valor bruto do boletim; necessário acerto específico.');m.approvalSequence=approved(s).length+1;m.status='APPROVED';return {measurementId:m.id,deduction:m.deduction,net:m.net};
  }
  if(kind==='cancel-measurement'){const m=s.measurements.find(x=>x.id===p.measurementId);if(!m||m.status!=='DRAFT')throw new BadRequestException('Apenas rascunhos podem ser cancelados.');m.status='CANCELED';m.cancelReason=text(p.reason,2000);return {measurementId:m.id,reason:m.cancelReason};}
  if(kind==='payment'){
   const m=s.measurements.find(x=>x.id===p.measurementId);if(!m||m.status!=='APPROVED')throw new BadRequestException('Aprovação obrigatória.');
   const paymentDate=date(p.date);if(paymentDate<m.executionDate)throw new BadRequestException('Pagamento não pode anteceder a execução do boletim.');
   const adjustmentDate=(m.compensationAdjustments||[]).map((a:any)=>a.date||s.amendments.find(x=>x.id===a.amendmentId)?.effectiveDate).filter(Boolean).sort().at(-1);
   if(adjustmentDate&&paymentDate<adjustmentDate)throw new BadRequestException('Pagamento não pode anteceder o ajuste da parcela compensatória aplicado ao boletim.');
   const lastFinancialDate=[...s.payments.map(x=>x.date),...s.refunds.map(x=>x.date)].sort().at(-1);
   if(lastFinancialDate&&paymentDate<lastFinancialDate)throw new BadRequestException('Registre os movimentos financeiros em ordem cronológica.');
   const net=decimal(effectiveNet(m)),deduction=decimal(effectiveDeduction(m));let amount=money(value(p.amount)),retained='0.00';
   if(net.eq(0)){
    if(p.noCashSettlement!==true||!decimal(amount).eq(0)||m.settled||deduction.lte(0))throw new BadRequestException('Liquidação sem desembolso exige confirmação e retenção pendente.');
    retained=money(deduction.minus(m.retained));if(decimal(retained).lte(0))throw new BadRequestException('Retenção já efetivada.');m.retained=money(deduction);m.settled=true;
   }else if(net.lt(0)){
    if(m.kind!=='DIFFERENCE'||p.direction!=='RECOVERY'||decimal(amount).lte(0)||decimal(amount).gt(net.minus(m.paid).abs()))throw new BadRequestException('Diferença negativa exige recuperação positiva limitada ao saldo.');
    amount=money(decimal(amount).negated());m.paid=money(decimal(m.paid).plus(amount));
   }else{
    const paid=decimal(m.paid).plus(amount),remaining=net.minus(m.paid);
    if(p.direction==='RECOVERY'||decimal(amount).lte(0)||paid.gt(net))throw new BadRequestException('Pagamento nulo ou superior ao saldo líquido.');
    const cumulative=paid.eq(net)?deduction:m.compensationAdjustments?.length?decimal(m.retained).plus(deduction.minus(m.retained).mul(amount).div(remaining).toDecimalPlaces(2)):deduction.mul(paid).div(net).toDecimalPlaces(2);
    retained=money(cumulative.minus(m.retained));m.paid=money(paid);m.retained=money(cumulative);
   }
   s.retained=money(decimal(s.retained).plus(retained));const r={id,measurementId:m.id,amount,retained,date:paymentDate,reference:text(p.reference,200),...(net.lt(0)?{direction:'RECOVERY'}:{}),...(net.eq(0)?{noCashSettlement:true}:{})};s.payments.push(r);return r;
  }
  if(kind==='refund'){
   const refundDate=date(p.date),minimumDate=[...s.amendments.map(a=>a.effectiveDate),...s.payments.map(a=>a.date),...s.refunds.map(a=>a.date)].filter(Boolean).sort().at(-1);
   if(minimumDate&&refundDate<minimumDate)throw new BadRequestException('Restituição não pode anteceder o aditivo vigente nem os movimentos financeiros já registrados.');
   const available=summary(s).refundDue,amount=money(value(p.amount,true));if(decimal(amount).lte(0)||decimal(amount).gt(available))throw new BadRequestException('Restituição nula ou superior ao excesso efetivamente retido.');const r={id,amount,date:refundDate,reason:text(p.reason,2000)};s.refunded=money(decimal(s.refunded).plus(amount));s.refunds.push(r);return r;
  }
  if(kind==='compensation-reconciliation'){
   const reason=text(p.reason,2000),formalReference=requireFormal(p),changes:any[]=[];let payment:any;
   if(p.mode==='REALLOCATE'){
    if(!Array.isArray(p.allocations)||!p.allocations.length||p.allocations.length>100)throw new BadRequestException('Informe alocações para boletins aprovados.');const seen=new Set<string>();
    for(const allocation of p.allocations){const m=s.measurements.find(m=>m.id===allocation.measurementId&&m.status==='APPROVED'&&m.kind!=='DIFFERENCE');if(!m||seen.has(m.id))throw new BadRequestException('Boletim inválido ou repetido.');seen.add(m.id);
     const deduction=decimal(money(value(allocation.deduction)));if(deduction.lt(m.retained)||deduction.gt(decimal(m.gross).minus(m.paid)))throw new BadRequestException('Dedução deve preservar o já retido e o valor já pago.');
     const delta=money(deduction.minus(effectiveDeduction(m)));if(delta==='0.00')continue;const adjustment={reconciliationId:id,delta,reason,formalReference,date:p.date?date(p.date):s.amendments.at(-1)?.effectiveDate||m.executionDate};(m.compensationAdjustments??=[]).push(adjustment);m.effectiveDeduction=effectiveDeduction(m);m.effectiveNet=effectiveNet(m);changes.push({measurementId:m.id,...adjustment});
    }
    const reserved=sum(approved(s).map(m=>maxZero(decimal(effectiveDeduction(m)).minus(m.retained)))),available=maxZero(decimal(s.compensationRequired).minus(decimal(s.retained).minus(s.refunded)));if(reserved.gt(available))throw new BadRequestException('Reservas excedem a compensação ainda necessária.');
   }else if(p.mode==='RECOVERY'){
    const amount=money(value(p.amount,true));if(decimal(amount).lte(0)||decimal(amount).gt(summary(s).compensationDue))throw new BadRequestException('Recuperação deve limitar-se ao saldo compensatório não reservado.');
    const paymentDate=date(p.date);if(s.amendments.at(-1)?.effectiveDate>paymentDate)throw new BadRequestException('Recuperação não pode anteceder o aditivo vigente.');
    s.retained=money(decimal(s.retained).plus(amount));payment={id,measurementId:null,type:'COMPENSATION_RECOVERY',amount:money(decimal(amount).negated()),retained:amount,date:paymentDate,reference:text(p.reference,200),reason,formalReference};s.payments.push(payment);
   }else throw new BadRequestException('Conciliação deve realocar reservas ou registrar recuperação.');
   const milestone=resetCompensationMilestone(s,s.compensationRequired,true),r={id,mode:p.mode,reason,formalReference,changes,payment,milestone};(s.compensationReconciliations??=[]).push(r);return r;
  }
  if(kind==='progress'){
   const planned=value(p.plannedPercent),executed=value(p.executedPercent);if(decimal(planned).gt(100)||decimal(executed).gt(100))throw new BadRequestException('Percentual superior a 100%.');const r={id,date:date(p.date),plannedPercent:planned,executedPercent:executed,baseValue:currentTotals(s).contract,reason:text(p.reason,2000)};s.progress.push(r);return r;
  }
  if(kind==='progress-items'){
   const day=date(p.date),reason=text(p.reason,2000);
   if(!Array.isArray(p.lines)||!p.lines.length||p.lines.length>10000)throw new BadRequestException('Informe os serviços acompanhados.');
   const seen=new Set<string>();
   const lines=p.lines.map((line:any)=>{
    const item=s.items.find(i=>i.id===line.itemId);if(!item||seen.has(item.id))throw new BadRequestException('Serviço inexistente ou repetido.');seen.add(item.id);
    const percent=value(line.executedPercent);if(decimal(percent).gt(100))throw new BadRequestException('Avanço físico superior a 100%.');
    const previous=(s.itemProgress||[]).filter((r:any)=>r.date<=day).flatMap((r:any)=>r.lines.filter((l:any)=>l.itemId===item.id).map((l:any)=>({...l,date:r.date}))).sort((a:any,b:any)=>a.date.localeCompare(b.date)).at(-1);
    if((s.itemProgress||[]).some((r:any)=>r.date>day&&r.lines.some((l:any)=>l.itemId===item.id)))throw new BadRequestException('Há apontamento posterior para este serviço. Registre a correção na data atual do acompanhamento.');
    if(item.introducedOn&&day<item.introducedOn)throw new BadRequestException('Apontamento anterior à inclusão do serviço.');
    if(previous&&decimal(percent).mul(item.quantity).lt(decimal(previous.executedPercent).mul(previous.quantityAtRecord??item.quantity)))throw new BadRequestException('Quantidade física acumulada não pode diminuir.');
    // Added quantities can reopen a formerly completed service. Keep its prior
    // completion in history, but never apply it to the new, unfinished scope.
    const sameScope=!previous||decimal(previous.quantityAtRecord??item.quantity).eq(item.quantity);
    const actualStart=line.actualStart?date(line.actualStart):previous?.actualStart,actualEnd=line.actualEnd?date(line.actualEnd):sameScope?previous?.actualEnd:undefined,forecastEnd=line.forecastEnd?date(line.forecastEnd):undefined;
    if(decimal(percent).gt(0)&&!actualStart)throw new BadRequestException('Informe o início real dos serviços iniciados.');
    if(actualStart&&actualStart>day||actualEnd&&(!actualStart||actualEnd<actualStart||actualEnd>day))throw new BadRequestException('Datas reais incompatíveis com a data de corte.');
    if(actualEnd&&!decimal(percent).eq(100)||decimal(percent).eq(100)&&!actualEnd)throw new BadRequestException('Conclusão exige 100% e data de término real.');
    if(forecastEnd&&(forecastEnd<day||actualEnd))throw new BadRequestException('Previsão de término deve ser futura e exclusiva de serviço não concluído.');
    const actualTeams=line.actualTeams===undefined?undefined:value(line.actualTeams);
    return {itemId:item.id,executedPercent:percent,actualStart,actualEnd,forecastEnd,actualTeams,quantityAtRecord:item.quantity,baseTotal:money(decimal(item.quantity).mul(item.unitPrice))};
   });
   const r={id,date:day,reason,lines};(s.itemProgress??=[]).push(r);return r;
  }
  throw new BadRequestException('Operação ainda não implementada.');
 }catch(e){if(e instanceof BadRequestException)throw e;throw new BadRequestException(e instanceof Error?e.message:'Cálculo inválido.');}
}
