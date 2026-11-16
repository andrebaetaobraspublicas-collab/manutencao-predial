import { applyAction, effectiveDeduction, effectiveNet, initialState, planningComparison, summary } from './contract-state';

const base=(regime='UNIT_PRICE')=>initialState({regime,originalValue:'10000.00',paradigmOriginal:'10000.00',examples:[],items:[{id:'a',code:'A',description:'Serviço',unit:'M2',originalQuantity:'100',quantity:'100',unitPrice:'100',referencePrice:'100',originalTotal:'10000.00',measured:'0'}],events:regime==='GLOBAL_PRICE'?[
 {id:'root',name:'Obra',value:'10000.00',accepted:false,measured:false},
 {id:'left',parentId:'root',name:'Etapa 1',value:'4000.00',accepted:false,measured:false},
 {id:'right',parentId:'root',name:'Etapa 2',value:'6000.00',accepted:false,measured:false},
]:[]});
const draft=(period:string,day='2026-01-10')=>({title:'Boletim',period,executionDate:day,evidence:'Memória conferida pelo fiscal',lines:[{itemId:'a',quantity:'10'}]});
const index=(effectiveDate:string,currentIndex='110')=>({title:'Reajuste formal',effectiveDate,reason:'Índice contratual documentado',mode:'INDEX',baseIndex:'100',currentIndex,itemId:'a'});
const amend=(day:string)=>({title:'Aditivo formal',effectiveDate:day,reason:'Revisão aprovada do escopo e prazo',formalReference:'Termo assinado 1/2026',lines:[] as any[],eventChanges:[] as any[]});
const approve=(s:any,id:string)=>applyAction(s,'approve-measurement',{measurementId:id,accepted:true},`approve-${id}`);
const pay=(s:any,id:string,amount:string,day='2026-01-20')=>applyAction(s,'payment',{measurementId:id,amount,date:day,reference:'Registro financeiro'},`pay-${s.payments.length}`);

describe('Complete contractual execution invariants',()=>{
 it('revises the global eventogram formally and preserves the approved event',()=>{
  const s=base('GLOBAL_PRICE');applyAction(s,'measurement',{...draft('1','2026-01-02'),eventIds:['left']},'m1');approve(s,'m1');const original=structuredClone(s.measurements[0]);
  const a=applyAction(s,'amendment',{...amend('2026-01-03'),lines:[{itemId:'a',quantityDelta:'10'}],eventChanges:[{eventId:'root',value:'11000',deadline:220},{eventId:'right',value:'7000',deadline:220}]},'a1');
  expect(a.eventRevision).toMatchObject({version:1,total:'11000.00',formalReference:'Termo assinado 1/2026'});expect(s.measurements[0]).toEqual(original);expect(s.events.find(e=>e.id==='left')).toMatchObject({value:'4000.00',measured:true});
  applyAction(s,'measurement',{...draft('2','2026-01-04'),eventIds:['right']},'m2');approve(s,'m2');expect(summary(s).approved).toBe('11000.00');
  expect(()=>applyAction(s,'measurement',{...draft('3','2026-01-05'),eventIds:['root']},'bad')).toThrow(/subevento|medido/);
 });
 it('supports event-only replacement and deadlines with immutable change memory',()=>{
  const s=base('GLOBAL_PRICE');const a=applyAction(s,'amendment',{...amend('2026-01-01'),eventChanges:[{eventId:'right',remove:true},{id:'new',parentId:'root',name:'Etapa substituta',value:'6000',deadline:240}]},'a');
  expect(a.lines).toHaveLength(0);expect(a.eventRevision.changes[0].before.archived).toBeUndefined();expect(s.events.find(e=>e.id==='right').archived).toBe(true);
  applyAction(s,'measurement',{...draft('1'),eventIds:['new']},'m');approve(s,'m');expect(summary(s).approved).toBe('6000.00');
 });
 it('rejects broken totals, cycles, descendants of measured parents and partially failing mutations atomically',()=>{
  const s=base('GLOBAL_PRICE'),before=structuredClone(s);
  expect(()=>applyAction(s,'amendment',{...amend('2026-01-01'),lines:[{itemId:'a',quantityDelta:'1'}],eventChanges:[{eventId:'right',value:'6001'}]},'bad')).toThrow(/soma|reconciliar/);expect(s).toEqual(before);
  expect(()=>applyAction(s,'amendment',{...amend('2026-01-01'),eventChanges:[{eventId:'root',parentId:'right'}]},'cycle')).toThrow(/Ciclo/);expect(s).toEqual(before);
  applyAction(s,'measurement',{...draft('1'),eventIds:['root']},'m');approve(s,'m');
  expect(()=>applyAction(s,'amendment',{...amend('2026-01-11'),eventChanges:[{eventId:'right',deadline:250}]},'badpaid')).toThrow(/medido/);
 });
 it('prices global leaves by basket and derives parent value without overlap',()=>{
  const s=base('GLOBAL_PRICE');applyAction(s,'price-rule',{...index('2026-01-01'),targetType:'EVENT',eventId:'right',mode:'BASKET',components:[{weight:'0.6',baseIndex:'100',currentIndex:'110'},{weight:'0.4',baseIndex:'100',currentIndex:'105'}]},'r');
  applyAction(s,'measurement',{...draft('1'),eventIds:['root']},'m');expect(s.measurements[0]).toMatchObject({gross:'10480.00',eligible:'10000.00'});approve(s,'m');
  expect(summary(s)).toMatchObject({currentValue:'10000.00',currentPricedValue:'10480.00',priceAdjustmentValue:'480.00'});
  expect(()=>applyAction(s,'price-rule',{...index('2026-02-01'),targetType:'EVENT',eventId:'root'},'parent')).toThrow(/eventos-folha/);
 });
 it('rejects stale global drafts and explicitly anchors an index after reequilibrium',()=>{
  const s=base('GLOBAL_PRICE');applyAction(s,'measurement',{...draft('1'),eventIds:['right']},'m');
  applyAction(s,'price-rule',{...index('2026-01-01'),targetType:'EVENT',eventId:'right',mode:'REEQUILIBRIUM',newPrice:'7000'},'equilibrium');
  expect(()=>approve(s,'m')).toThrow(/mudou/);
  expect(()=>applyAction(s,'price-rule',{...index('2026-02-01'),targetType:'EVENT',eventId:'right'},'bad')).toThrow(/âncora/);
  applyAction(s,'price-rule',{...index('2026-02-01'),targetType:'EVENT',eventId:'right',anchorRuleId:'equilibrium',formalReference:'Termo de nova base dos índices'},'index');expect(s.priceRules.at(-1).price).toBe('7700.00');
 });
 it('issues positive and negative retroactive differences without remeasuring quantities or rewriting originals',()=>{
  const s=base();applyAction(s,'measurement',draft('1'),'m');approve(s,'m');pay(s,'m','1000');const original=structuredClone(s.measurements[0]);
  expect(()=>applyAction(s,'price-rule',index('2026-01-01'),'bad')).toThrow(/retroativa/);
  applyAction(s,'price-rule',{...index('2026-01-01'),retroactive:true,formalReference:'Apostila 1'},'r1');
  const d={title:'Diferenças',period:'D1',executionDate:'2026-01-21',reason:'Apostila retroativa formal',originalMeasurementIds:['m']};
  applyAction(s,'difference-measurement',d,'d1');applyAction(s,'difference-measurement',{...d,period:'D2'},'duplicate');approve(s,'d1');expect(()=>approve(s,'duplicate')).toThrow(/diferenças|mudou/);pay(s,'d1','100','2026-01-22');
  applyAction(s,'price-rule',{...index('2026-01-05','90'),retroactive:true,formalReference:'Apostila 2, correção redutora'},'r2');
  applyAction(s,'difference-measurement',{...d,period:'D3',executionDate:'2026-01-23'},'d3');approve(s,'d3');expect(s.measurements.find(m=>m.id==='d3').net).toBe('-200.00');
  expect(()=>pay(s,'d3','200','2026-01-24')).toThrow(/recuperação/);
  for(const amount of ['50','150'])applyAction(s,'payment',{measurementId:'d3',amount,direction:'RECOVERY',date:'2026-01-24',reference:'Recuperação registrada'},`recovery-${amount}`);
  expect(s.measurements[0]).toEqual(original);expect(s.items[0].measured).toBe('10');expect(summary(s)).toMatchObject({approved:'900.00',paid:'900.00',outstanding:'0.00'});
 });
 it('reconciles a retroactive leaf index against an already measured parent',()=>{
  const s=base('GLOBAL_PRICE');applyAction(s,'measurement',{...draft('1'),eventIds:['root']},'m');approve(s,'m');
  applyAction(s,'price-rule',{...index('2026-01-01'),targetType:'EVENT',eventId:'right',retroactive:true,formalReference:'Apostila global'},'r');
  applyAction(s,'difference-measurement',{title:'Diferença global',period:'D',executionDate:'2026-01-20',reason:'Reajuste do subevento',originalMeasurementIds:['m']},'d');approve(s,'d');expect(s.measurements[1]).toMatchObject({gross:'600.00',eligible:'0.00'});expect(s.events.filter(e=>e.measured).map(e=>e.id)).toEqual(['root']);
 });
 it('counts additions and suppressions separately and never hides a limit excess by netting',()=>{
  const s=base(),common={title:'Aditivo',reason:'Revisão de quantidades',formalReference:'Termo'};
  applyAction(s,'amendment',{...common,effectiveDate:'2026-01-01',lines:[{itemId:'a',quantityDelta:'25'}]},'a1');
  applyAction(s,'amendment',{...common,effectiveDate:'2026-01-02',lines:[{itemId:'a',quantityDelta:'-25'}]},'a2');
  expect(()=>applyAction(s,'amendment',{...common,effectiveDate:'2026-01-03',lines:[{itemId:'a',quantityDelta:'1'}]},'bad')).toThrow(/Limites cumulativos/);
  const a=applyAction(s,'amendment',{...common,effectiveDate:'2026-01-03',lines:[{itemId:'a',quantityDelta:'1'}],limitExceptionReason:'Exceção submetida à análise jurídica competente'},'a3');expect(a.limits).toMatchObject({additionPercent:'26.000000',suppressionPercent:'25.000000',status:'LEGAL_REVIEW_REQUIRED'});
 });
 it('keeps the new-service amendment immutable after later suppression and supplies every financial table column',()=>{
  const s=base();applyAction(s,'amendment',{...amend('2026-01-01'),lines:[{description:'Novo serviço',unit:'UN',quantity:'1',unitPrice:'950',referencePrice:'1000'}]},'a1');
  const original=structuredClone(s.amendments[0].lines[0]);expect(original).toMatchObject({itemId:'a1-0',description:'Novo serviço',unit:'UN',originalQuantity:'0',unitPrice:'950',originalTotal:'0.00',additionQuantity:'1',additionValue:'950.00',suppressionQuantity:'0',suppressionValue:'0.00',after:'1',afterTotal:'950.00'});
  applyAction(s,'amendment',{...amend('2026-01-02'),lines:[{itemId:'a1-0',quantityDelta:'-0.5'}]},'a2');
  expect(s.amendments[0].lines[0]).toEqual(original);expect(s.items.find(i=>i.id==='a1-0')?.quantity).toBe('0.5');expect(s.amendments[1].limits).toMatchObject({additionValue:'950.00',suppressionValue:'475.00'});
 });
 it('requires formal renovation classification and updated global limit memory',()=>{
  const s=base();expect(()=>applyAction(s,'amendment',{...amend('2026-01-01'),lines:[{itemId:'a',quantityDelta:'40'}],additionLimitPercent:'50'},'bad')).toThrow();
  const a=applyAction(s,'amendment',{...amend('2026-01-01'),lines:[{itemId:'a',quantityDelta:'40'}],additionLimitPercent:'50',renovationJustification:'Reforma de edifício, enquadramento documentado'},'good');expect(a.limits.additionPercent).toBe('40.000000');
  const g=base('GLOBAL_PRICE');applyAction(g,'price-rule',{...index('2026-01-01'),targetType:'EVENT',eventId:'right'},'r');
  const ga={...amend('2026-02-01'),eventChanges:[{eventId:'right',deadline:300}]};expect(()=>applyAction(g,'amendment',ga,'missing')).toThrow(/memória formal/);
  const result=applyAction(g,'amendment',{...ga,limitsMemory:{originalUpdatedValue:'10600',additionsUpdatedValue:'0',suppressionsUpdatedValue:'0',referenceDate:'2026-02-01',justification:'Memória por evento conferida',documentReference:'Anexo 1 do termo'}},'memory');expect(result.limits).toMatchObject({source:'MANUAL_FORMAL_MEMORY',initialUpdatedValue:'10600.00'});
 });
 it('keeps all four planning curves on base prices and separates cash differences',()=>{
  const s=base();s.planningBaseline={total:10000,rows:[{key:'2026-01',ce:3000,pce:0.3}]};
  applyAction(s,'price-rule',index('2026-01-01'),'r');applyAction(s,'measurement',draft('1','2026-01-31'),'m');approve(s,'m');pay(s,'m','550','2026-01-31');
  applyAction(s,'progress',{date:'2026-01-31',plannedPercent:'30',executedPercent:'25',reason:'Apontamento físico independente'},'progress');
  expect(planningComparison(s).latest).toMatchObject({plannedPercent:'30.00',executedPercent:'25.00',measuredPercent:'10.00',paidPercent:'5.00',measuredValue:'1000.00',cashPaid:'550.00'});
  expect(summary(s)).toMatchObject({currentValue:'10000.00',currentPricedValue:'11000.00',priceAdjustmentValue:'1000.00'});
  expect(planningComparison(base()).latest).toBeNull();
 });
 it('converts the source schedule from integer cents once and leaves absent execution empty',()=>{
  const s=base();s.planningBaseline={monetaryUnit:'CENT',total:1000000,rows:[{key:'2026-01',ce:300000,pce:0.3}]};
  expect(planningComparison(s)).toMatchObject({sourcePlanValue:'10000.00',latest:{date:'2026-01-31',plannedValue:'3000.00',plannedPercent:'30.00',executedValue:null,executedPercent:null}});
 });
 it('reconciles indexed valuation cents with partially updated fractional quantities',()=>{
  const s=base();s.originalValue='2.00';s.paradigmOriginal='2.00';s.items=['a','b'].map((id,n)=>({id,code:id,description:id,unit:'UN',originalQuantity:'1',quantity:n?'1.001':'1.004',unitPrice:'1',referencePrice:'1',originalTotal:'1.00',measured:'0'}));
  applyAction(s,'price-rule',{...index('2026-01-01'),mode:'REEQUILIBRIUM',newPrice:'2'},'r');
  expect(summary(s)).toMatchObject({currentValue:'2.01',currentPricedValue:'3.01',priceAdjustmentValue:'1.00'});
 });
 it('closes zero-cash retention and direct recovery when future scope is insufficient',()=>{
  const s=initialState({regime:'UNIT_PRICE',originalValue:'90000.00',paradigmOriginal:'100000.00',examples:[],events:[],items:[
   {id:'a',code:'A',description:'A',unit:'M2',originalQuantity:'1000',quantity:'1000',unitPrice:'50',referencePrice:'20',originalTotal:'50000.00',measured:'0'},
   {id:'b',code:'B',description:'B',unit:'M2',originalQuantity:'4000',quantity:'4000',unitPrice:'10',referencePrice:'20',originalTotal:'40000.00',measured:'0'},
  ]});
  applyAction(s,'measurement',{...draft('1','2026-01-01'),lines:[{itemId:'a',quantity:'1000'}]},'m1');approve(s,'m1');pay(s,'m1','50000','2026-01-02');
  const amendment={...amend('2026-01-03'),lines:[{itemId:'b',quantityDelta:'-3000'}],limitExceptionReason:'Supressão consensual com análise jurídica registrada'};
  expect(()=>applyAction(s,'amendment',amendment,'blocked')).toThrow(/Saldo elegível/);
  applyAction(s,'amendment',{...amendment,compensationResolution:'MANUAL_RECONCILIATION'},'a');expect(summary(s)).toMatchObject({compensationRequired:'24000.00',outstandingReconciliation:'14000.00'});
  applyAction(s,'measurement',{...draft('2','2026-01-04'),lines:[{itemId:'b',quantity:'1000'}]},'m2');approve(s,'m2');expect(effectiveNet(s.measurements[1])).toBe('0.00');
  applyAction(s,'payment',{measurementId:'m2',amount:'0',noCashSettlement:true,date:'2026-01-05',reference:'Liquidação integral mediante retenção'},'zero');
  expect(()=>applyAction(s,'payment',{measurementId:'m2',amount:'0',noCashSettlement:true,date:'2026-01-05',reference:'Duplicação'},'repeat')).toThrow();
  applyAction(s,'compensation-reconciliation',{mode:'RECOVERY',amount:'14000',date:'2026-01-06',reference:'Recolhimento identificado',reason:'Acerto de saldo sem execução futura',formalReference:'Termo de acerto'},'recovery');
  expect(summary(s)).toMatchObject({paid:'36000.00',retained:'24000.00',compensationDue:'0.00',outstanding:'0.00',outstandingReconciliation:'0.00'});
 });
 it('reallocates only unpaid reservations and rejects consuming already paid money',()=>{
  const s=base();s.compensationRequired='1000.00';s.milestone={balance:'1000.00',eligible:'10000.00',measured:'0.00',allocated:'0.00'};
  applyAction(s,'measurement',draft('1'),'m');approve(s,'m');pay(s,'m','450');
  applyAction(s,'compensation-reconciliation',{mode:'REALLOCATE',allocations:[{measurementId:'m',deduction:'200'}],reason:'Readequação formal de reservas',formalReference:'Termo de conciliação',date:'2026-01-21'},'r');
  const m=s.measurements[0];expect(m.deduction).toBe('100.00');expect(effectiveDeduction(m)).toBe('200.00');expect(effectiveNet(m)).toBe('800.00');
  expect(()=>applyAction(s,'compensation-reconciliation',{mode:'REALLOCATE',allocations:[{measurementId:'m',deduction:'600'}],reason:'Excesso',formalReference:'Termo'},'bad')).toThrow(/já pago/);
  pay(s,'m','350','2026-01-22');expect(s.measurements[0]).toMatchObject({paid:'800.00',retained:'200.00'});
 });
});
