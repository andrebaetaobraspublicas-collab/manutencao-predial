import { applyAction, initialState, summary } from './contract-state';
const base=()=>initialState({regime:'UNIT_PRICE',originalValue:'50000.00',paradigmOriginal:'50000.00',items:[{id:'a',code:'1',description:'Piso',unit:'M2',originalQuantity:'1000',quantity:'1000',unitPrice:'50',referencePrice:'50',originalTotal:'50000.00',measured:'0'}],events:[],examples:[]});
const draft={title:'Medição',period:'11/2026',executionDate:'2026-11-14',evidence:'Memória conferida',lines:[{itemId:'a',quantity:'200',presentedQuantity:'210'}]};
describe('Contract operational lifecycle',()=>{
 it('keeps draft out of execution, approves quantities and separately records partial payment',()=>{
  const s=base();applyAction(s,'measurement',draft,'m');expect(s.items[0].measured).toBe('0');
  applyAction(s,'approve-measurement',{measurementId:'m'},'approve');expect(s.items[0].measured).toBe('200');expect(s.measurements[0].lines[0].disallowedQuantity).toBe('10');
  applyAction(s,'payment',{measurementId:'m',amount:'4000',date:'2026-11-15',reference:'Parcela 1'},'p');
  expect(summary(s)).toMatchObject({approved:'10000.00',paid:'4000.00',outstanding:'6000.00'});
  expect(()=>applyAction(s,'payment',{measurementId:'m',amount:'6000.01',date:'2026-11-15',reference:'Excesso'},'bad')).toThrow();
 });
 it('uses original anchor for successive index updates',()=>{
  const s=base(),p={itemId:'a',title:'Reajuste',reason:'Índice contratual',mode:'INDEX',baseIndex:'100'};
  applyAction(s,'price-rule',{...p,effectiveDate:'2026-01-01',currentIndex:'105'},'r1');
  applyAction(s,'price-rule',{...p,effectiveDate:'2027-01-01',currentIndex:'110'},'r2');
  expect(s.priceRules[1].price).toBe('55.00');
 });
 it('cancels draft without erasing history and permits corrected period',()=>{
  const s=base();applyAction(s,'measurement',draft,'m');applyAction(s,'cancel-measurement',{measurementId:'m',reason:'Corrigir quantidades'},'cancel');
  applyAction(s,'measurement',draft,'replacement');expect(s.measurements).toHaveLength(2);expect(s.measurements[0].status).toBe('CANCELED');
 });
 it('requires explicit event acceptance and blocks parent-child duplicate payment',()=>{
  const s=base();s.regime='GLOBAL_PRICE';s.events=[{id:'1',value:'100',name:'Estrutura',accepted:false,measured:false},{id:'1.1',parentId:'1',value:'100',name:'Pavimento',accepted:false,measured:false}];
  applyAction(s,'measurement',{...draft,lines:[],eventIds:['1.1']},'m');expect(()=>applyAction(s,'approve-measurement',{measurementId:'m'},'no')).toThrow(/explicitamente/);
  applyAction(s,'approve-measurement',{measurementId:'m',accepted:true},'yes');
  expect(()=>applyAction(s,'measurement',{...draft,period:'12/2026',eventIds:['1']},'dup')).toThrow();
 });
 it('preserves adopted line cents on final measurement with explicit rounding',()=>{
  const s=base();s.items=[{...s.items[0],quantity:'3',originalQuantity:'3',unitPrice:'0.333333',referencePrice:'0.333333',originalTotal:'1.00'}];s.originalValue='1.00';s.paradigmOriginal='1.00';
  for(let i=1;i<=3;i++){applyAction(s,'measurement',{...draft,period:String(i),lines:[{itemId:'a',quantity:'1'}]},'m'+i);applyAction(s,'approve-measurement',{measurementId:'m'+i},'a'+i);}
  expect(summary(s).approved).toBe('1.00');expect(s.measurements[2].lines[0].roundingAdjustment).toBe('0.01');
 });
});
