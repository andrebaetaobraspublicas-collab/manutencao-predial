import { BadRequestException } from '@nestjs/common';
import { applyAction, decimal, initialState, money, State, text } from './contract-state';
export type ContractJournalEntry={id:string;kind:string;payload:any;actor_id?:string;version?:number;created_at?:unknown};
const payload=(a:ContractJournalEntry)=>typeof a.payload==='string'?JSON.parse(a.payload):a.payload;
/** Revisions append to the journal. Original actions and cash movements are never rewritten. */
export function replayContract(base:any,actions:ContractJournalEntry[],owner:string):State {
 const overrides=new Map<string,any>(),editors=new Map<string,string>(),cash=new Map<string,any>();
 const deleted=new Set<string>();const revisions:any[]=[];let state=initialState(base);
 function apply(s:State,a:ContractJournalEntry){
  if(['revise-measurement','revise-record','delete-record'].includes(a.kind)||deleted.has(a.id))return;
  if(deleted.has(payload(a).measurementId)&&['approve-measurement','cancel-measurement'].includes(a.kind))return;
  const p=overrides.get(a.id)||payload(a);
  if(a.kind==='payment'&&cash.has(a.id)){
   const recorded=structuredClone(cash.get(a.id)),m=s.measurements.find(x=>x.id===recorded.measurementId);
   if(recorded.measurementId&&!m)recorded.deletedMeasurement=true;
   if(m){m.paid=money(decimal(m.paid).plus(recorded.amount));m.retained=money(decimal(m.retained).plus(recorded.retained));if(recorded.noCashSettlement)m.settled=true;}
   s.retained=money(decimal(s.retained).plus(recorded.retained));s.payments.push(recorded);return;
  }
  applyAction(s,a.kind,p,a.id);
  if(['measurement','difference-measurement'].includes(a.kind)){const m=s.measurements.find(x=>x.id===a.id);if(m)m.createdBy=editors.get(a.id)||a.actor_id||owner;}
 }
 for(let index=0;index<actions.length;index++){
  const a=actions[index];if(!['revise-measurement','revise-record','delete-record'].includes(a.kind)){apply(state,a);continue;}
  const p=payload(a),target=actions.slice(0,index).find(x=>x.id===(p.measurementId||p.recordId)&&['measurement','difference-measurement','amendment','price-rule','price-batch'].includes(x.kind));
  if(target&&a.kind==='revise-measurement'&&!['measurement','difference-measurement'].includes(target.kind))throw new BadRequestException('Selecione uma medição.');
  const previous=state.measurements.find(m=>m.id===p.measurementId);
  if(!target||deleted.has(target.id)||(a.kind==='revise-measurement'&&(!previous||previous.status==='CANCELED')))throw new BadRequestException('Selecione uma medição ativa para retificar.');
  const reason=text(p.revisionReason,2000);
  if(a.kind!=='delete-record'&&(!p.replacement||typeof p.replacement!=='object'))throw new BadRequestException('Informe os dados corrigidos.');
  const before=structuredClone(state.measurements);
  for(const payment of state.payments)cash.set(payment.id,structuredClone(payment));
  if(a.kind==='delete-record')deleted.add(target.id);else overrides.set(target.id,p.replacement);editors.set(target.id,a.actor_id||owner);
  const rebuilt=initialState(base);
  try{for(const prior of actions.slice(0,index))apply(rebuilt,prior);}catch(error){throw new BadRequestException(`A correção conflita com registros vinculados: ${error instanceof Error?error.message:'confira os quantitativos e datas.'}`);}
  state=rebuilt;
  revisions.push({id:a.id,measurementId:target.id,reason,actorId:a.actor_id||owner,version:a.version,createdAt:a.created_at,before,after:structuredClone(state.measurements)});
 }
 state.measurementRevisions=revisions;state.editableRecords=actions.filter(a=>['amendment','price-rule','price-batch'].includes(a.kind)&&!deleted.has(a.id)).map(a=>({id:a.id,kind:a.kind,payload:overrides.get(a.id)||payload(a)}));return state;
}
