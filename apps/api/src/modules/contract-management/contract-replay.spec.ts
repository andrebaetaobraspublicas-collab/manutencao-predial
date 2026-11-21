import { replayContract, ContractJournalEntry } from './contract-replay';
import { summary } from './contract-state';
const base={regime:'UNIT_PRICE',originalValue:'1000',paradigmOriginal:'1000',events:[],items:[{id:'i',code:'1',description:'Serviço',unit:'UN',originalQuantity:'100',quantity:'100',unitPrice:'10',referencePrice:'10',originalTotal:'1000',measured:'0'}]};
const draft=(quantity='10',period='1')=>({title:'Medição '+period,period,executionDate:'2026-11-01',evidence:'Conferido',lines:[{itemId:'i',quantity,presentedQuantity:quantity}]});
const action=(id:string,kind:string,payload:any):ContractJournalEntry=>({id,kind,payload,actor_id:'owner'});
const revise=(id:string,measurementId:string,replacement:any)=>action(id,'revise-measurement',{measurementId,replacement,revisionReason:'Corrigir cadastro'});
describe('Retificação com histórico preservado',()=>{
 it('edits drafts without approving them or mutating the journal',()=>{
  const actions=[action('m','measurement',draft()),revise('r','m',draft('20'))],original=JSON.stringify(actions);
  const state=replayContract(base,actions,'owner');expect(state.measurements[0]).toMatchObject({status:'DRAFT',gross:'200.00'});expect(state.items[0].measured).toBe('0');expect(JSON.stringify(actions)).toBe(original);expect(state.measurementRevisions[0].before[0].gross).toBe('100.00');
 });
 it('recalculates approved quantities and later bulletins while preserving cash and showing overpayment',()=>{
  const actions=[action('m','measurement',draft()),action('a','approve-measurement',{measurementId:'m'}),action('p','payment',{measurementId:'m',amount:'100',date:'2026-11-02',reference:'Comprovante'}),action('m2','measurement',draft('5','2')),action('a2','approve-measurement',{measurementId:'m2'}),revise('r','m',draft('4'))];
  const original=replayContract(base,actions.slice(0,-1),'owner'),state=replayContract(base,actions,'owner');
  expect(state.payments).toEqual(original.payments);expect(state.measurements[0]).toMatchObject({status:'APPROVED',gross:'40.00',paid:'100.00'});expect(state.measurements[1].lines[0].previousQuantity).toBe('4');expect(state.items[0].measured).toBe('9');expect(summary(state)).toMatchObject({approved:'90.00',paid:'100.00',outstanding:'-10.00'});
  const again=replayContract(base,[...actions,revise('r2','m',draft('6'))],'owner');expect(again.items[0].measured).toBe('11');expect(again.measurementRevisions).toHaveLength(2);expect(again.measurementRevisions[1].before[0].gross).toBe('40.00');
 });
 it('rejects conflicting quantities without changing source data',()=>{
  const actions=[action('m','measurement',draft()),action('a','approve-measurement',{measurementId:'m'}),revise('r','m',draft('101'))];expect(()=>replayContract(base,actions,'owner')).toThrow();expect(base.items[0].measured).toBe('0');
 });
 it('supports global approved event corrections',()=>{
  const global={...base,regime:'GLOBAL_PRICE',events:[{id:'e1',name:'Um',value:'100',measured:false,accepted:false},{id:'e2',name:'Dois',value:'200',measured:false,accepted:false}]};
  const first={...draft(),lines:[],eventIds:['e1']};const state=replayContract(global,[action('m','measurement',first),action('a','approve-measurement',{measurementId:'m',accepted:true}),revise('r','m',{...first,eventIds:['e2']})],'owner');expect(state.measurements[0].gross).toBe('200.00');expect(state.events.map(e=>e.measured)).toEqual([false,true]);
 });
});


describe('Correções gerenciais de lançamentos',()=>{
 const amendment={title:'TA',effectiveDate:'2027-01-01',reason:'Ajuste',formalReference:'TA1',lines:[{itemId:'i',quantityDelta:'5'}]};
 it('aprova rascunho anterior ao aditivo sem incompatibilidade quantitativa',()=>{
  const s=replayContract(base,[action('m','measurement',draft()),action('ta','amendment',amendment),action('a','approve-measurement',{measurementId:'m'})],'owner');expect(s.measurements[0].status).toBe('APPROVED');
 });
 it('retifica e exclui aditivo sem apagar o diário',()=>{
  const journal=[action('ta','amendment',amendment),action('r','revise-record',{recordId:'ta',revisionReason:'Corrigir',replacement:{...amendment,lines:[{itemId:'i',quantityDelta:'8'}]}})];
  expect(replayContract(base,journal,'owner').items[0].quantity).toBe('108');
  const s=replayContract(base,[...journal,action('d','delete-record',{recordId:'ta',revisionReason:'Excluir cadastro errado'})],'owner');expect(s.items[0].quantity).toBe('100');expect(s.amendments).toHaveLength(0);expect(journal).toHaveLength(2);
 });
 it('exclui medição aprovada e mantém o movimento financeiro registrado',()=>{
  const s=replayContract(base,[action('m','measurement',draft()),action('a','approve-measurement',{measurementId:'m'}),action('p','payment',{measurementId:'m',amount:'100',date:'2026-11-02',reference:'QA'}),action('d','delete-record',{recordId:'m',revisionReason:'Cadastro incorreto'})],'owner');expect(s.measurements).toHaveLength(0);expect(s.items[0].measured).toBe('0');expect(s.payments[0].amount).toBe('100.00');
 });
 it('continua impedindo quantidade superior ao saldo suprimido',()=>{
  expect(()=>replayContract(base,[action('m','measurement',draft('99')),action('ta','amendment',{...amendment,lines:[{itemId:'i',quantityDelta:'-2'}]}),action('a','approve-measurement',{measurementId:'m'})],'owner')).toThrow();
 });
 it('corrige e exclui regra de preço',()=>{
 const rule={title:'Reajuste',effectiveDate:'2026-10-01',reason:'Índice',mode:'INDEX',itemId:'i',baseIndex:'100',currentIndex:'110'};
 const journal=[action('p','price-rule',rule),action('r','revise-record',{recordId:'p',revisionReason:'Índice correto',replacement:{...rule,currentIndex:'120'}})];expect(replayContract(base,journal,'owner').priceRules[0].price).toBe('12.00');expect(replayContract(base,[...journal,action('d','delete-record',{recordId:'p',revisionReason:'Excluir'})],'owner').priceRules).toHaveLength(0);
 });
});
