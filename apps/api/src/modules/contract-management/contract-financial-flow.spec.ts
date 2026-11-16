import { applyAction, initialState, summary } from './contract-state';
const baseline=()=>({regime:'UNIT_PRICE',originalValue:'90000.00',paradigmOriginal:'100000.00',examples:[],events:[],items:[
 {id:'a',code:'A',description:'Serviço A',unit:'M2',originalQuantity:'1000',quantity:'1000',unitPrice:'50',referencePrice:'20',originalTotal:'50000.00',measured:'0'},
 {id:'b',code:'B',description:'Serviço B',unit:'M2',originalQuantity:'4000',quantity:'4000',unitPrice:'10',referencePrice:'20',originalTotal:'40000.00',measured:'0'},
]});
const amendment=(delta:string,day:string)=>({title:'Aditivo',effectiveDate:day,reason:'Justificativa demonstrativa aprovada',lines:[{itemId:'a',quantityDelta:delta}]});
const measured=(period:string,quantity:string,executionDate:string)=>({title:'Boletim',period,executionDate,evidence:'Memória conferida pelo fiscal',lines:[{itemId:'a',quantity}]});
describe('Contract compensation financial reconciliation',()=>{
 it('reconciles partial-payment retention and outstanding reservations before another amendment',()=>{
  const source=baseline(),s=initialState(source);
  applyAction(s,'measurement',measured('1','200','2026-01-10'),'m1');
  applyAction(s,'approve-measurement',{measurementId:'m1',accepted:true},'approve1');
  applyAction(s,'payment',{measurementId:'m1',amount:'10000',date:'2026-01-11',reference:'P1'},'p1');
  applyAction(s,'amendment',amendment('200','2026-01-15'),'a1');
  expect(summary(s)).toMatchObject({currentValue:'100000.00',paradigmValue:'104000.00',compensationRequired:'6400.00'});
  applyAction(s,'measurement',measured('2','100','2026-01-20'),'m2');
  applyAction(s,'approve-measurement',{measurementId:'m2',accepted:true},'approve2');
  expect(s.measurements[1]).toMatchObject({gross:'5000.00',deduction:'355.56',net:'4644.44'});
  applyAction(s,'payment',{measurementId:'m2',amount:'2322.22',date:'2026-01-21',reference:'Parcial'},'p2');
  expect(summary(s)).toMatchObject({retained:'177.78',reserved:'177.78',outstanding:'2322.22'});
  applyAction(s,'amendment',amendment('-200','2026-01-22'),'a2');
  expect(s.measurements[1]).toMatchObject({deduction:'355.56',net:'4644.44',effectiveDeduction:'177.78',effectiveNet:'4822.22'});
  expect(s.measurements[1].compensationAdjustments).toEqual([expect.objectContaining({amendmentId:'a2',delta:'-177.78'})]);
  applyAction(s,'payment',{measurementId:'m2',amount:'2500',date:'2026-01-23',reference:'Saldo após liberação da reserva'},'p3');
  expect(summary(s)).toMatchObject({compensationRequired:'0.00',refundDue:'177.78',retained:'177.78',reserved:'0.00',outstanding:'0.00'});
  expect(()=>applyAction(s,'refund',{amount:'177.78',date:'2026-01-20',reason:'Data anterior ao direito'},'invalid-refund')).toThrow(/anteceder/);
  expect(summary(s).refunded).toBe('0.00');
  applyAction(s,'refund',{amount:'177.78',date:'2026-01-25',reason:'Restituição autorizada do excesso'},'r1');
  expect(summary(s)).toMatchObject({refundDue:'0.00',refunded:'177.78'});
  expect(()=>applyAction(s,'refund',{amount:'0.01',date:'2026-01-26',reason:'Duplicação'},'r2')).toThrow(/excesso/);
  expect(source).toEqual(baseline());
 });
 it('rejects cash dated before the amendment that released an unpaid reservation',()=>{
  const s=initialState(baseline());applyAction(s,'amendment',amendment('200','2026-01-15'),'a1');
  applyAction(s,'measurement',measured('1','100','2026-01-20'),'m1');applyAction(s,'approve-measurement',{measurementId:'m1',accepted:true},'approve1');
  applyAction(s,'amendment',amendment('-200','2026-01-25'),'a2');
  expect(()=>applyAction(s,'payment',{measurementId:'m1',amount:'5000',date:'2026-01-22',reference:'Pagamento retroativo'},'p')).toThrow(/ajuste da parcela/);
 });
 it('revalidates quantities at approval across competing drafts',()=>{
  const s=initialState(baseline());
  applyAction(s,'measurement',measured('1','700','2026-01-10'),'m1');
  applyAction(s,'measurement',measured('2','700','2026-01-11'),'m2');
  applyAction(s,'approve-measurement',{measurementId:'m1',accepted:true},'approve1');
  expect(()=>applyAction(s,'approve-measurement',{measurementId:'m2',accepted:true},'approve2')).toThrow(/quantidade vigente/);
 });
 it('rejects a positive subcent payment that rounds to zero',()=>{
  const s=initialState(baseline());
  applyAction(s,'measurement',measured('1','100','2026-02-10'),'m');
  applyAction(s,'approve-measurement',{measurementId:'m',accepted:true},'a');
  expect(()=>applyAction(s,'payment',{measurementId:'m',amount:'0.001',date:'2026-02-11',reference:'Subcentavo'},'p')).toThrow(/nulo/);
 });
});
