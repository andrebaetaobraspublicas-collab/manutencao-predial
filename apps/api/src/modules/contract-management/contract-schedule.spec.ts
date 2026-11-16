import { applyAction, initialState, summary } from './contract-state';
import { proposeSchedule, scheduleCurve, workCalendar } from './contract-schedule';
import { contractPlanning } from './contract-planning';

const source={project:{data:{calendar:{workdays:[1,2,3,4,5],holidays:true},root:{children:[{id:'a',kind:'item',code:'1'}]}}},calculation:{summary:{items:[{start:'2026-10-05',end:'2026-10-30',days:20,productivity:{teams:2}}]}}};
function fixture(){
 const s=initialState({regime:'UNIT_PRICE',originalValue:'1000.00',paradigmOriginal:'1000.00',sourceStart:'2026-10-05',sourceEnd:'2026-10-30',events:[],items:[{id:'a',number:'1.1',code:'1',description:'Estrutura',unit:'m3',originalQuantity:'10',quantity:'10',unitPrice:'100',referencePrice:'100',originalTotal:'1000.00',measured:'0',start:'2026-10-05',end:'2026-10-30'}],planningBaseline:{total:100000,monetaryUnit:'CENT',rows:[{key:'2026-10',ce:100000}]}});
 applyAction(s,'progress-items',{date:'2026-10-30',reason:'Execução antes do aditivo',lines:[{itemId:'a',executedPercent:'50',actualStart:'2026-10-05',forecastEnd:'2026-11-30'}]},'p1');
 applyAction(s,'amendment',{title:'TA 01',effectiveDate:'2026-11-01',reason:'Ampliação e serviço novo',lines:[{itemId:'a',quantityDelta:'2'},{description:'Serviço novo',unit:'un',quantity:'1',unitPrice:'10',referencePrice:'10'}]},'a1');
 applyAction(s,'progress-items',{date:'2026-11-14',reason:'Novo serviço ainda não iniciado',lines:[{itemId:'a1-1',executedPercent:'0'}]},'p2');
 return s;
}
function payload(s=fixture(),day='2026-11-14'){
 const proposal=proposeSchedule(s,contractPlanning(s,source,day),day);
 return {...proposal,title:'Revisão após TA 01',reason:'Prazo do saldo conferido',formalReference:'Autorização QA 01',lines:proposal.lines.map(l=>l.itemId==='a1-1'?{...l,start:'2026-11-16',end:'2026-11-18'}:l)};
}
describe('Schedule revisions after amendments',()=>{
 it('reconciles cents at the aggregate instead of rounding each schedule weight first',()=>{
  const s=initialState({regime:'UNIT_PRICE',originalValue:'0.68',paradigmOriginal:'0.68',events:[],items:['a','b'].map(id=>({id,number:id,code:id,description:id,unit:'un',quantity:'2',originalQuantity:'1',unitPrice:'0.335',referencePrice:'0.335',originalTotal:'0.34',measured:'0'}))});
  s.amendments.push({id:'term',title:'Aditivo de teste',effectiveDate:'2026-11-14'});applyAction(s,'progress-items',{date:'2026-11-14',reason:'Sem execução',lines:s.items.map(i=>({itemId:i.id,executedPercent:'0'}))},'p');
  const r=applyAction(s,'schedule-revision',{title:'Revisão',reason:'Conferência de centavos',formalReference:'QA',effectiveDate:'2026-11-14',amendmentId:'term',calendar:{workdays:[1,2,3,4,5]},lines:s.items.map(i=>({itemId:i.id,start:'2026-11-16',end:'2026-11-17',teams:'1'}))},'r');
  expect(r).toMatchObject({baseValue:'1.35',lineSumBaseValue:'1.36',baseRoundingAdjustment:'-0.01'});expect(scheduleCurve(r,r.end)).toBe('1.35');expect(scheduleCurve(r,'2026-11-16')).toBe('0.68');
 });
 it('reopens only added quantities of a completed service without overwriting its previous actual completion',()=>{
  const s=fixture();applyAction(s,'progress-items',{date:'2026-11-14',reason:'Conclusão do escopo anterior',lines:[{itemId:'a',executedPercent:'100',actualStart:'2026-10-05',actualEnd:'2026-11-13'}]},'complete');
  applyAction(s,'amendment',{title:'TA 02',effectiveDate:'2026-11-15',reason:'Quantidade complementar',lines:[{itemId:'a',quantityDelta:'0.1'}]},'a2');
  const plan=contractPlanning(s,source,'2026-11-16');expect(plan.rows[0].actualEnd).toBeNull();const p=proposeSchedule(s,plan,'2026-11-16');expect(p.lines[0].status).toBe('REMAINING');
  applyAction(s,'progress-items',{date:'2026-11-16',reason:'Saldo complementar em execução',lines:[{itemId:'a',executedPercent:'99.5',actualStart:'2026-10-05',forecastEnd:'2026-11-18'}]},'new-work');
  expect(s.itemProgress.find((p:any)=>p.id==='complete').lines[0].actualEnd).toBe('2026-11-13');expect(s.itemProgress.at(-1).lines[0].actualEnd).toBeUndefined();
 });
 it('reprograms only remaining quantities, includes new services, and preserves original and financial history',()=>{
  const s=fixture(),before=structuredClone(s),plan=payload(s),revision=applyAction(s,'schedule-revision',plan,'r1');
  expect(s.items).toEqual(before.items);expect(s.planningBaseline).toEqual(before.planningBaseline);expect(s.itemProgress).toEqual(before.itemProgress);expect(summary(s)).toEqual(summary(before));
  expect(revision.lines[0]).toMatchObject({quantity:'12',executedQuantity:'5',start:'2026-11-16',teams:'2',baseValue:'1200.00'});
  expect(revision.lines[1]).toMatchObject({quantity:'1',executedQuantity:'0',baseValue:'10.00'});
  expect(scheduleCurve(revision,'2026-11-14')).toBe('500.00');expect(scheduleCurve(revision,revision.end)).toBe('1210.00');
  const tracking=contractPlanning(s,source,revision.end);expect(tracking.curves.at(-1)?.reprogrammedPercent).toBe('100.00');expect(tracking.revision?.currentScope).toBe(true);
  expect(contractPlanning(s,source,'2026-11-14').rows[0]).toMatchObject({start:'2026-10-05',end:'2026-10-30',reprogrammedStart:'2026-11-16'});
 });
 it('does not invent duration or execution for new/unreported services',()=>{
  const s=fixture(),proposal=proposeSchedule(s,contractPlanning(s,source),'2026-11-14');expect(proposal.lines[1].end).toBeNull();expect(proposal.warnings).toHaveLength(1);
  delete s.itemProgress;expect(()=>applyAction(s,'schedule-revision',payload(s),'r')).toThrow(/sem apontamento/);
 });
 it('freezes completed actual dates and rejects changes to them atomically',()=>{
  const s=fixture();applyAction(s,'progress-items',{date:'2026-11-14',reason:'Conclusão',lines:[{itemId:'a',executedPercent:'100',actualStart:'2026-10-05',actualEnd:'2026-11-13'}]},'p3');const p=payload(s),before=structuredClone(s);
  expect(p.lines[0]).toMatchObject({status:'COMPLETE',start:'2026-10-05',end:'2026-11-13'});p.lines[0].end='2026-11-16';expect(()=>applyAction(s,'schedule-revision',p,'r')).toThrow(/preservar/);expect(s).toEqual(before);
 });
 it('requires complete unique scope, valid workdays and formal current amendment',()=>{
  const s=fixture(),p=payload(s);
  for(const bad of [{...p,amendmentId:'other'},{...p,formalReference:''},{...p,lines:p.lines.slice(1)},{...p,lines:[p.lines[0],p.lines[0]]},{...p,lines:[{...p.lines[0],start:'2026-11-14'},p.lines[1]]},{...p,lines:[{...p.lines[0],end:'2026-11-20'},p.lines[1]]}])expect(()=>applyAction(s,'schedule-revision',bad,'r')).toThrow();
  expect(s.scheduleRevisions).toBeUndefined();
 });
 it('retains previous revisions and flags a subsequent amendment as stale without rewriting curves',()=>{
  const s=fixture(),r1=applyAction(s,'schedule-revision',payload(s),'r1'),frozen=JSON.stringify(r1),before=contractPlanning(s,source,'2026-11-14','r1').curves;
  applyAction(s,'amendment',{title:'TA 02',effectiveDate:'2026-11-15',reason:'Ajuste de saldo',lines:[{itemId:'a',quantityDelta:'0.1'}]},'a2');
  expect(contractPlanning(s,source,'2026-11-16','r1').revision?.currentScope).toBe(false);expect(contractPlanning(s,source,'2026-11-16','r1').metrics.reprogrammedVariancePoints).toBeNull();
  const p=payload(s,'2026-11-16');p.lines[1].start='2026-11-17';p.lines[1].end='2026-11-18';applyAction(s,'schedule-revision',p,'r2');
  expect(JSON.stringify(s.scheduleRevisions[0])).toBe(frozen);expect(s.scheduleRevisions).toHaveLength(2);expect(contractPlanning(s,source,'2026-11-16').revision?.id).toBe('r2');
  expect(before.find(r=>r.date===r1.end)?.reprogrammedValue).toBe('1210.00');expect(scheduleCurve(s.scheduleRevisions[0],r1.end)).toBe('1210.00');
  expect(contractPlanning(s,source,'2026-11-14').revision?.id).toBe('r1');expect(contractPlanning(s,source,'2026-11-16','ORIGINAL').revision).toBeNull();expect(()=>contractPlanning(s,source,'2026-11-16','another-contract-revision')).toThrow(/não encontrada/);
 });
 it('does not turn global reprogramming into event acceptance, payment or price changes',()=>{
  const s=fixture();s.regime='GLOBAL_PRICE';s.events=[{id:'1',value:'1210',accepted:false,measured:false}];const before=structuredClone(s),p=payload(s);applyAction(s,'schedule-revision',p,'r');expect(s.events).toEqual(before.events);expect(summary(s)).toEqual(summary(before));expect(s.measurements).toEqual(before.measurements);
 });
 it('preserves suppressed services as zero-weight rows',()=>{
  const s=fixture();applyAction(s,'amendment',{title:'TA 02',effectiveDate:'2026-11-15',reason:'Suprimir item novo',lines:[{itemId:'a1-1',quantityDelta:'-1'}]},'a2');const p=payload(s,'2026-11-16'),r=applyAction(s,'schedule-revision',p,'r');expect(r.lines[1]).toMatchObject({status:'SUPPRESSED',quantity:'0',start:null,end:null});expect(scheduleCurve(r,r.end)).toBe('1200.00');
 });
 it('uses holidays/weekends and exact cent totals without artificial initial progress',()=>{
  const cal=workCalendar({workdays:[1,2,3,4,5],holidays:true});expect(cal.end('2026-11-19',2)).toBe('2026-11-23');expect(cal.count('2026-11-19','2026-11-23')).toBe(2);
  const s=fixture(),r=applyAction(s,'schedule-revision',payload(s),'r');expect(scheduleCurve(r,'2026-11-15')).toBe('500.00');expect(Number(scheduleCurve(r,'2026-11-16'))).toBeGreaterThan(500);expect(scheduleCurve(r,'2026-10-01')).toBeNull();
 });
 it('rejects chronological reversal and a revision before its selected cutoff',()=>{
  const s=fixture();expect(()=>payload(s,'2026-11-13')).toThrow(/último/);applyAction(s,'schedule-revision',payload(s),'r');expect(()=>contractPlanning(s,source,'2026-11-13','r')).toThrow(/alcançar/);
 });
});
