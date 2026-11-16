import { ConflictException, NotFoundException } from '@nestjs/common';
import { applyAction, contractWorksheet, initialState, measurementWorksheet, summary, money, sum } from './contract-state';
import { contractEventDefinitions, contractSourceHierarchy, ContractService } from './contract.service';

const baseline=(count=283)=>({regime:'UNIT_PRICE',originalValue:String(count*10000)+'.00',paradigmOriginal:String(count*12000)+'.00',baseDate:'2026-01-01',examples:[],events:[],groups:[{id:'group',number:'1',name:'Serviços',depth:0}],items:Array.from({length:count},(_,n)=>({id:'item-'+n,code:String(n+1),number:'1.'+(n+1),groupId:'group',groupName:'Serviços',groupPath:[{id:'group',number:'1',name:'Serviços'}],sourceOrder:n,description:'Serviço '+n,unit:'M2',originalQuantity:'100',quantity:'100',unitPrice:'100',referencePrice:'120',originalTotal:'10000.00',measured:'0'}))});
const rule=(s:any,date='2026-01-02')=>({title:'Reajuste integral da planilha',reason:'Índice contratual uniforme com memória',effectiveDate:date,mode:'INDEX',baseIndex:'100',currentIndex:'105',targets:s.items.map((i:any)=>({targetType:'ITEM',itemId:i.id}))});
const measure=(id:string,quantity:string,day='2026-01-10')=>({title:'Boletim '+id,period:id,executionDate:day,evidence:'Memória quantitativa completa',lines:[{itemId:'item-0',quantity}]});
const owner:any={userId:'owner',tenantId:'tenant'};
function serviceFixture(base:any=baseline(3),actions:any[]=[]){
 const row:any={id:'contract',tenant_id:'tenant',owner_id:'owner',version:actions.length+1,baseline:structuredClone(base),regime:'UNIT_PRICE',original_value:base.originalValue,demo:true};let reads=0;
 const query=jest.fn(async(sql:string,args:any[])=>{
  if(sql.startsWith('SELECT c.')){reads++;return args[0]==='contract'&&args[1]===owner.tenantId&&args[2]===owner.userId?[structuredClone(row)]:[];}
  if(sql.includes('FROM GcAction')){expect(args.slice(0,3)).toEqual(['contract','tenant','owner']);return structuredClone(actions);}
  throw new Error('Unexpected database mutation/query in read-only fixture: '+sql);
 });
 const db:any={query,transaction:jest.fn()},service=new ContractService(db,{} as any,{} as any,{} as any);
 return {row,query,db,service,reads:()=>reads};
}
describe('Analytical contract worksheets and atomic batch prices',()=>{
 it('reconciles display cents to the immutable ledger total in dated unit and global worksheets',()=>{
  const base=baseline(2);base.originalValue='0.68';base.paradigmOriginal='2.00';
  base.items=base.items.map(i=>({...i,originalQuantity:'1',quantity:'1',unitPrice:'0.335',referencePrice:'1',originalTotal:'0.34'}));
  const s=initialState(base);
  applyAction(s,'amendment',{title:'Ampliação',reason:'Quantidades fracionadas',limitExceptionReason:'Cenário aritmético de teste',formalReference:'Teste de conciliação',effectiveDate:'2026-01-02',lines:s.items.map(i=>({itemId:i.id,quantityDelta:'1'}))},'a');
  const before=structuredClone(s),w=contractWorksheet(s,'2026-01-02');
  expect(w.summary).toMatchObject({currentValue:'1.35',lineSumBaseValue:'1.36',baseRoundingAdjustment:'-0.01',currentPricedValue:'1.35',lineSumPricedValue:'1.36',priceRoundingAdjustment:'-0.01'});
  expect(w.summary.currentValue).toBe(summary(s).currentValue);expect(s).toEqual(before);
  expect(contractWorksheet(s,'2026-01-01').summary).toMatchObject({currentValue:'0.68',baseRoundingAdjustment:'0.00'});
  s.regime='GLOBAL_PRICE';s.events=[{id:'e',name:'Entrega',value:'1.35',measured:false}];
  const global=contractWorksheet(s,'2026-01-02');
  expect(global.summary).toMatchObject({currentValue:'1.35',baseRoundingAdjustment:'-0.01',currentPricedValue:'1.35',lineSumPricedValue:'1.35',priceRoundingAdjustment:'0.00'});
 });
 it('reprices 283 items as one atomic batch and rolls back every rule if the last target fails',()=>{
  const s=initialState(baseline()),r=applyAction(s,'price-batch',rule(s),'batch');expect(r.targetCount).toBe(283);expect(s.priceBatches).toHaveLength(1);expect(s.priceRules[282]).toMatchObject({id:'batch-282',batchId:'batch',price:'105.00'});
  expect(summary(s).currentPricedValue).toBe('2971500.00');
  const before=structuredClone(s);expect(()=>applyAction(s,'price-batch',{...rule(s,'2026-02-01'),targets:[...rule(s).targets,{targetType:'ITEM',itemId:'missing'}]},'bad')).toThrow(/não encontrado/);expect(s).toEqual(before);
  expect(()=>applyAction(s,'price-batch',{...rule(s,'2026-02-01'),targets:[rule(s).targets[0],rule(s).targets[0]]},'duplicate')).toThrow(/repetido/);expect(s).toEqual(before);
 });
 it('uses dated prices and quantities and returns complete comparable discount columns',()=>{
  const s=initialState(baseline(2));applyAction(s,'price-batch',rule(s),'r');applyAction(s,'amendment',{title:'Ampliação',effectiveDate:'2026-01-05',reason:'Ampliação formal',lines:[{itemId:'item-0',quantityDelta:'10'}]},'a');
  const prior=contractWorksheet(s,'2026-01-01'),current=contractWorksheet(s,'2026-01-06');expect(prior.items[0]).toMatchObject({currentPrice:'100',quantity:'100',additionQuantity:'0'});
  expect(current.items[0]).toMatchObject({number:'1.1',groupName:'Serviços',currentPrice:'105.00',quantity:'110',remainingQuantity:'110',additionQuantity:'10',baseTotal:'11000.00',currentTotal:'11550.00',originalReferenceTotal:'12000.00',currentReferenceTotal:'13200.00',originalDiscountPercent:'16.666667'});
 });
 it('calculates 283-row measurement preview without persisting or consuming quantities',async()=>{
  const {service,query,db,row}=serviceFixture(baseline()),payload={...measure('M','1'),lines:row.baseline.items.map((i:any)=>({itemId:i.id,quantity:'1',presentedQuantity:'1.1'}))};
  const p=await service.previewAction(owner,'contract',{expectedVersion:1,kind:'measurement',payload});
  expect(p.result.lines).toHaveLength(283);expect(p.worksheet.items).toHaveLength(283);expect(p.approvalPreview).toMatchObject({hypothetical:true,requiresExplicitApproval:true,measurement:{gross:'28300.00',net:'28300.00'}});expect(p.before.summary.approved).toBe('0.00');expect(p.after.summary.approved).toBe('0.00');expect(p.previewHash).toMatch(/^[a-f0-9]{64}$/);
  expect(row.baseline.items.every((i:any)=>i.measured==='0')).toBe(true);expect(db.transaction).not.toHaveBeenCalled();expect(query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 });
 it('refuses foreign tenant/owner and stale preview before exposing worksheet data',async()=>{
  const {service,db}=serviceFixture();const body={expectedVersion:1,kind:'measurement',payload:measure('M','1')};
  await expect(service.previewAction({...owner,tenantId:'other'},'contract',body)).rejects.toBeInstanceOf(NotFoundException);
  await expect(service.worksheet({...owner,userId:'other'},'contract')).rejects.toBeInstanceOf(NotFoundException);
  await expect(service.previewAction(owner,'contract',{...body,expectedVersion:2})).rejects.toBeInstanceOf(ConflictException);expect(db.transaction).not.toHaveBeenCalled();
 });
 it('replays historical approval order and freezes even unmeasured rows before a later retroactive price',async()=>{
  const actions:any[]=[];const push=(id:string,kind:string,payload:any)=>actions.push({id,kind,payload,version:actions.length+2});
  push('first-draft','measurement',measure('M1','10'));
  push('second-draft','measurement',measure('M2','20','2026-01-05'));
  push('approve-second','approve-measurement',{measurementId:'second-draft'});
  push('approve-first','approve-measurement',{measurementId:'first-draft'});
  push('later-index','price-batch',{title:'Atualização posterior',reason:'Reconhecimento posterior ao boletim',effectiveDate:'2026-01-03',mode:'INDEX',baseIndex:'100',currentIndex:'115',retroactive:true,formalReference:'Apostila posterior',targets:[{targetType:'ITEM',itemId:'item-0'},{targetType:'ITEM',itemId:'item-1'}]});
  const {service}=serviceFixture(baseline(3),actions),historical=await service.worksheet(owner,'contract',undefined,'first-draft');
  expect(historical.rows).toHaveLength(3);expect(historical.version).toBe(5);expect(historical.rows[0]).toMatchObject({previousQuantity:'20',periodQuantity:'10',accumulatedQuantity:'30',remainingQuantity:'70',unitPrice:'100',periodAmount:'1000.00'});expect(historical.rows[1]).toMatchObject({periodQuantity:'0',unitPrice:'100'});
  expect((await service.worksheet(owner,'contract','2026-01-10')).items[1].currentPrice).toBe('115.00');
 });
 it('returns an amendment before/after worksheet without later amendments leaking backward',async()=>{
  const actions=[{id:'a1',kind:'amendment',version:2,payload:{title:'A1',effectiveDate:'2026-01-02',reason:'Acréscimo',lines:[{itemId:'item-0',quantityDelta:'10'}]}},{id:'a2',kind:'amendment',version:3,payload:{title:'A2',effectiveDate:'2026-01-03',reason:'Supressão',lines:[{itemId:'item-0',quantityDelta:'-5'}]}}];
  const {service}=serviceFixture(baseline(3),actions),snapshot=await service.worksheet(owner,'contract',undefined,undefined,'a1');expect(snapshot.before.items[0].quantity).toBe('100');expect(snapshot.items[0].quantity).toBe('110');expect(snapshot.version).toBe(2);expect(snapshot.amendment.id).toBe('a1');
 });
 it('preserves global parent selection without double counting child payments',()=>{
  const s=initialState({...baseline(1),regime:'GLOBAL_PRICE',events:[{id:'parent',name:'Obra',value:'10000.00',measured:false},{id:'a',parentId:'parent',name:'Etapa A',value:'4000.00',measured:false},{id:'b',parentId:'parent',name:'Etapa B',value:'6000.00',measured:false}]});
  applyAction(s,'measurement',{...measure('M','1'),eventIds:['parent']},'m');applyAction(s,'approve-measurement',{measurementId:'m',accepted:true},'approve');
  const w=measurementWorksheet(s,'m');expect(w.rows).toHaveLength(3);expect(w.rows[0]).toMatchObject({isAggregate:true,periodAmount:'10000.00'});expect(w.rows[1]).toMatchObject({coveredByParent:true,periodAmount:'0.00',remainingValue:'0.00'});expect(w.summary.periodGross).toBe('10000.00');
 });
 it('consolidates all 16 parent subtotals of an 86-event BG02 without changing the ledger',()=>{
  const events:any[]=[];for(let n=0;n<16;n++){const count=n<6?5:4;events.push({id:'p'+n,name:'Etapa '+n,value:String(count*100),measured:false});for(let c=0;c<count;c++)events.push({id:`p${n}.${c}`,parentId:'p'+n,name:'Evento',value:'100',measured:false});}
  const s=initialState({...baseline(1),regime:'GLOBAL_PRICE',originalValue:'7000.00',paradigmOriginal:'7000.00',events}),leaves=events.filter(e=>e.parentId);
  applyAction(s,'measurement',{title:'BG01',period:'G01',executionDate:'2026-01-02',evidence:'Aceites',eventIds:leaves.slice(0,25).map(e=>e.id)},'m1');applyAction(s,'approve-measurement',{measurementId:'m1',accepted:true},'a1');
  applyAction(s,'price-batch',{title:'Reajuste anual',reason:'Índice contratual',effectiveDate:'2026-02-01',mode:'INDEX',baseIndex:'100',currentIndex:'105.12',targets:leaves.slice(25).map(e=>({targetType:'EVENT',eventId:e.id}))},'index');
  applyAction(s,'measurement',{title:'BG02',period:'G02',executionDate:'2026-02-02',evidence:'Aceites',eventIds:leaves.slice(25,51).map(e=>e.id)},'m2');applyAction(s,'approve-measurement',{measurementId:'m2',accepted:true},'a2');
  const unchanged=structuredClone(s),w=measurementWorksheet(s,'m2'),roots=w.rows.filter((r:any)=>!r.parentId);
  expect(w.rows).toHaveLength(86);expect(roots).toHaveLength(16);expect(w.summary.periodGross).toBe('2733.12');
  expect(money(sum(roots.map((r:any)=>r.periodAmount)))).toBe(w.summary.periodGross);expect(money(sum(w.rows.filter((r:any)=>r.directlyMeasuredInPeriod).map((r:any)=>r.periodAmount)))).toBe(w.summary.periodGross);
  expect(money(sum(roots.map((r:any)=>r.previousAmount)))).toBe('2500.00');expect(money(sum(roots.map((r:any)=>r.accumulatedAmount)))).toBe('5233.12');expect(money(sum(roots.map((r:any)=>r.remainingValue)))).toBe('1997.28');expect(money(sum(roots.map((r:any)=>r.currentValue)))).toBe('7230.40');
  for(const row of roots)for(const key of ['originalValue','baseValue','currentValue','previousAmount','periodAmount','accumulatedAmount','remainingValue'])expect((row as any)[key]).toBe(money(sum(w.rows.filter((r:any)=>r.parentId===row.id).map((r:any)=>r[key]))));
  expect(s).toEqual(unchanged);
 });
 it('consolidates nested parents while preserving a directly measured subevent and unallocated descendants',()=>{
  const s=initialState({...baseline(1),regime:'GLOBAL_PRICE',events:[{id:'root',name:'Obra',value:'10000'},{id:'sub',parentId:'root',name:'Subetapa',value:'7000'},{id:'a',parentId:'sub',name:'A',value:'4000'},{id:'b',parentId:'sub',name:'B',value:'3000'},{id:'c',parentId:'root',name:'C',value:'3000'}]});
  applyAction(s,'price-rule',{title:'Reajuste',reason:'Índice',effectiveDate:'2026-01-01',mode:'INDEX',targetType:'EVENT',eventId:'a',baseIndex:'100',currentIndex:'110'},'r');
  applyAction(s,'measurement',{title:'BG01',period:'G01',executionDate:'2026-01-02',evidence:'Aceite',eventIds:['sub']},'m');applyAction(s,'approve-measurement',{measurementId:'m',accepted:true},'approve');
  const w=measurementWorksheet(s,'m');expect(w.rows.find((r:any)=>r.id==='root')).toMatchObject({currentValue:'10400.00',periodAmount:'7400.00',remainingValue:'3000.00',aggregationMode:'CHILDREN_SUBTOTAL'});
  expect(w.rows.find((r:any)=>r.id==='sub')).toMatchObject({currentValue:'7400.00',periodAmount:'7400.00',remainingValue:'0.00',directlyMeasuredInPeriod:true,aggregationMode:'DIRECT_MEASUREMENT'});
  for(const id of ['a','b'])expect(w.rows.find((r:any)=>r.id===id)).toMatchObject({periodAmount:'0.00',previousAmount:'0.00',accumulatedAmount:'0.00',remainingValue:'0.00',coveredByParent:true,aggregationMode:'COVERED_BY_PARENT'});
  expect(w.summary.periodGross).toBe('7400.00');
 });
 it('extracts source hierarchy independently of financial data',()=>{
  const tree={id:'root',kind:'stage',children:[{id:'g',kind:'stage',name:'Estrutura',children:[{id:'sub',kind:'stage',name:'Concreto',children:[{id:'i',kind:'item'}]}]}]};const h=contractSourceHierarchy(tree);
  expect(h.groups).toEqual([{id:'g',number:'1',name:'Estrutura',parentId:undefined,depth:0},{id:'sub',number:'1.1',name:'Concreto',parentId:'g',depth:1}]);expect(h.metadata.get('i')).toMatchObject({number:'1.1.1',groupId:'sub',groupName:'Concreto',sourceOrder:0});expect(tree.children[0].name).toBe('Estrutura');
 });
 it('rejects edited payloads or another actor reusing a preview hash before writing an action',async()=>{
  const {service,db,row}=serviceFixture(),state=initialState(row.baseline),detail={...state,contract:{version:1},summary:summary(state)};
  jest.spyOn(service as any,'view').mockResolvedValue(detail);jest.spyOn(service as any,'owned').mockResolvedValue(row);
  const query=jest.fn().mockResolvedValue([]);db.transaction.mockImplementation((f:any)=>f({query}));
  const body={expectedVersion:1,kind:'measurement',payload:measure('M','1')},p=await service.previewAction(owner,'contract',body);
  await expect(service.action(owner,'contract',{...body,requestId:p.requestId,previewHash:p.previewHash,payload:measure('M','2')})).rejects.toBeInstanceOf(ConflictException);
  await expect(service.action({...owner,userId:'different'},'contract',{...body,requestId:p.requestId,previewHash:p.previewHash})).rejects.toBeInstanceOf(ConflictException);
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT')||sql.startsWith('UPDATE'))).toBe(false);
 });
 it('creates and reuses an independent analytical demo without overwriting legacy captures or the source',async()=>{
  const source:any={id:'source',version:21,name:'Edifício',data:{root:{id:'root',kind:'stage',children:[{id:'group',kind:'stage',name:'Estrutura',children:[{id:'a',kind:'item',code:'CP-A',originalNumber:'1.1'},{id:'b',kind:'item',code:'CP-B',originalNumber:'1.2'}]}]},catalog:{compositions:[{code:'CP-A',desc:'Serviço próprio A',unit:'UN'},{code:'CP-B',desc:'Serviço próprio B',unit:'UN'}]}}};
  const unchanged=structuredClone(source),calculation={version:21,summary:{start:'2026-01-01',items:[{code:'CP-A',qty:1,total:10000},{code:'CP-B',qty:1,total:20000}],scurve:{total:30000,rows:[{key:'2026-01',ce:30000,cl:30000,pe:30000,pl:30000,pce:1,pcl:1}]}}};
  const stored:any[]=[{id:'legacy',baseline:{demoScenario:undefined}}],query=jest.fn(async(sql:string,args:any[])=>{
   if(sql.startsWith('SELECT id FROM GcSource'))return [{id:'shared-source'}];
   if(sql.startsWith('SELECT id,baseline FROM GcContract'))return stored;
   if(sql.startsWith('INSERT INTO GcContract')){stored.push({id:args[0],owner_id:args[2],baseline:JSON.parse(args[8]),version:1,regime:args[5],demo:true,original_value:args[7]});return [];}
   if(sql.startsWith('SELECT c.'))return stored.filter(r=>r.id===args[0]);
   if(sql.includes('FROM GcAction'))return [];
   throw new Error('Unexpected mutation: '+sql);
  });
  const db:any={query,transaction:(fn:any)=>fn({query})},service=new ContractService(db,{project:async()=>source,calculation:async()=>calculation} as any,{enabledFor:async()=>true} as any,{} as any);
  const dto:any={sourceProjectId:'source',sourceProduct:'ORCAPRO',regime:'UNIT_PRICE',expectedSourceVersion:21,demoScenario:'BUILDING_ANALYTICAL_V3',scenarioReason:'Proposta heterogênea fictícia para treinamento',proposalPrices:[{itemId:'a',price:'90.00'},{itemId:'b',price:'160.00'}]};
  const d:any=await service.demo(owner,dto),again:any=await service.demo(owner,dto);
  expect(d.demoScenario).toBe('BUILDING_ANALYTICAL_V3');expect(d.summary).toMatchObject({originalValue:'250.00',paradigmValue:'300.00'});expect(d.items[0]).toMatchObject({number:'1.1',groupName:'Estrutura',description:'Serviço próprio A',unit:'UN',sourceUnitPrice:'100.000000',sourceTotal:'100.00',unitPrice:'90.00'});expect(again.contract.id).toBe(d.contract.id);expect(stored).toHaveLength(2);expect(stored[0]).toEqual({id:'legacy',baseline:{demoScenario:undefined}});expect(source).toEqual(unchanged);
  expect(d.planningBaseline).toMatchObject({source:'SOURCE_SCHEDULE_SCALED_FOR_DEMONSTRATION',total:'25000',scaleMemory:{sourceTotal:'300.00',proposalTotal:'250.00'}});expect(d.planningComparison.latest.plannedPercent).toBe('100.00');expect(calculation.summary.scurve.total).toBe(30000);
  await expect(service.demo(owner,{...dto,proposalPrices:[{itemId:'a',price:'91'},{itemId:'b',price:'160'}]})).rejects.toBeInstanceOf(ConflictException);
  expect(query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO GcContract'))).toHaveLength(1);
  expect(query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO GcContract'))?.[1][9]).toBe('BUILDING_ANALYTICAL_V3');
 });
 it('captures global hierarchies without discarding parents or allowing inconsistent aggregates',()=>{
  const input=[{id:'p',name:'Etapa',value:'100'},{id:'c',name:'Evento',parentId:'p',value:'100',deadline:10}];
  expect(contractEventDefinitions(input)[1]).toMatchObject({parentId:'p',value:'100.00',deadline:10});
  expect(()=>contractEventDefinitions([{...input[0],value:'101'},input[1]])).toThrow(/subeventos/);
  expect(()=>contractEventDefinitions([{...input[0],parentId:'c'},input[1]])).toThrow(/Ciclo/);
 });
});

