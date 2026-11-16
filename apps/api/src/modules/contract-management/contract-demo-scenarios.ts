import { amendmentQuantity, indexedPrice, newServicePrice, unitMeasurement, globalMeasurement } from './contract-engine';
import { applyAction, initialState, planningComparison, summary } from './contract-state';

/** A four-storey training contract: values are deliberately round and fictional,
 * while the actions use exactly the same engine as the real contract ledger. */
export function calculatedGlobalAmendmentScenario(){
 const original={regime:'GLOBAL_PRICE',originalValue:'400000.00',paradigmOriginal:'400000.00',examples:[],items:[{id:'building',code:'DID-4P',description:'Edifício didático de quatro pavimentos',unit:'M2',originalQuantity:'4000',quantity:'4000',unitPrice:'100',referencePrice:'100',originalTotal:'400000.00',measured:'0'}],events:[{id:'building',name:'Edifício',value:'400000.00',accepted:false,measured:false},...[1,2,3,4].map(n=>({id:`floor-${n}`,parentId:'building',name:`Pavimento ${n}`,value:'100000.00',deadline:n*60,accepted:false,measured:false}))]};
 const state=initialState(original),actions:any[]=[];
 const act=(id:string,kind:string,payload:any)=>{const result=applyAction(state,kind,payload,id);actions.push({id,kind,payload,result:structuredClone(result)});return result;};
 const measure=(id:string,event:string,day:string)=>{act(id,'measurement',{title:'Medição de pavimento fictício',period:id,executionDate:day,evidence:'Aceite fictício documentado para treinamento.',eventIds:[event]});act(`approve-${id}`,'approve-measurement',{measurementId:id,accepted:true});};
 const pay=(id:string,amount:string,day:string)=>act(`pay-${id}`,'payment',{measurementId:id,amount,date:day,reference:'Pagamento demonstrativo, sem transferência'});
 measure('m1','floor-1','2026-01-02');pay('m1','50000','2026-01-03');
 act('A1','amendment',{title:'Ampliação e prorrogação fictícias',effectiveDate:'2026-01-04',reason:'Revisão do escopo de dois pavimentos.',formalReference:'Termo didático A1',lines:[{itemId:'building',quantityDelta:'100'}],eventChanges:[{eventId:'building',value:'410000'},{eventId:'floor-2',value:'105000'},{eventId:'floor-4',value:'105000',deadline:300}]});
 act('R1','price-rule',{title:'Índice do pavimento 2',effectiveDate:'2026-01-04',targetType:'EVENT',eventId:'floor-2',mode:'INDEX',baseIndex:'100',currentIndex:'105',reason:'Índice fictício contratual.'});
 measure('m2','floor-2','2026-01-05');pay('m2','110250','2026-01-06');
 act('R2','price-rule',{title:'Cesta retroativa do pavimento 2',effectiveDate:'2026-01-05',targetType:'EVENT',eventId:'floor-2',mode:'BASKET',components:[{weight:'0.6',baseIndex:'100',currentIndex:'108'},{weight:'0.4',baseIndex:'100',currentIndex:'105'}],retroactive:true,formalReference:'Apostila didática R2',reason:'Diferença formalmente reconhecida, preservando a medição original.'});
 act('D1','difference-measurement',{title:'Boletim complementar fictício',period:'D1',executionDate:'2026-01-06',reason:'Diferença da cesta formal, sem novas quantidades.',originalMeasurementIds:['m2']});act('approve-D1','approve-measurement',{measurementId:'D1'});pay('D1','1890','2026-01-07');
 act('R3','price-rule',{title:'Reequilíbrio do pavimento 3',effectiveDate:'2026-01-06',targetType:'EVENT',eventId:'floor-3',mode:'REEQUILIBRIUM',newPrice:'108000',reason:'Decisão fictícia com memória de novo preço.'});
 act('R4','price-rule',{title:'Índice após reequilíbrio',effectiveDate:'2026-01-07',targetType:'EVENT',eventId:'floor-3',mode:'INDEX',anchorRuleId:'R3',baseIndex:'100',currentIndex:'110',formalReference:'Termo didático de nova âncora',reason:'Nova base explicitamente aprovada.'});
 measure('m3','floor-3','2026-01-08');pay('m3','59400','2026-01-09');
 act('A2','amendment',{title:'Revisão de prazo do pavimento 4',effectiveDate:'2026-01-09',reason:'Prorrogação fictícia do evento restante.',formalReference:'Termo didático A2',lines:[],eventChanges:[{eventId:'floor-4',deadline:330}],limitsMemory:{originalUpdatedValue:'425600',additionsUpdatedValue:'10340',suppressionsUpdatedValue:'0',referenceDate:'2026-01-09',justification:'Original: 400.000 + 6.800 da cesta + 18.800 do reequilíbrio/indexação. Acréscimos: 5.000 × 1,068 + 5.000.',documentReference:'Memória didática anexa ao A2'}});
 act('progress','progress',{date:'2026-01-09',plannedPercent:'80',executedPercent:'75',reason:'Apontamento fictício independente da liquidação.'});
 return {fictional:true,original,actions,measurements:state.measurements,events:state.events,eventVersions:state.eventVersions,priceRules:state.priceRules,finalSummary:summary(state),planning:planningComparison(state)};
}

/** Isolated, explicitly fictional training worksheet. Never modifies a source
 * project or persists actions. Each result is calculated by the production
 * domain functions, so demonstrations also exercise their actual invariants. */
export function calculatedCompensationScenario() {
  const original = {
    regime:'UNIT_PRICE',originalValue:'90000.00',paradigmOriginal:'100000.00',examples:[],events:[],
    items:[
      {id:'training-a',code:'DID-A',description:'Serviço didático A — acréscimos e supressões',unit:'M2',originalQuantity:'1000',quantity:'1000',unitPrice:'50',referencePrice:'20',originalTotal:'50000.00',measured:'0'},
      {id:'training-b',code:'DID-B',description:'Serviço didático B — saldo de execução',unit:'M2',originalQuantity:'4000',quantity:'4000',unitPrice:'10',referencePrice:'20',originalTotal:'40000.00',measured:'0'},
    ],
  };
  const state=initialState(original),actions:{id:string;kind:string;payload:Record<string,unknown>;result:unknown}[]=[],stages:any[]=[];
  const act=(id:string,kind:string,payload:Record<string,unknown>)=>{
    const result=applyAction(state,kind,payload,id);actions.push({id,kind,payload,result:structuredClone(result)});return result;
  };
  const measure=(id:string,period:string,itemId:string,quantity:string,day:string)=>{
    act(id,'measurement',{title:`Medição didática ${period}`,period,executionDate:day,evidence:'Memória fictícia para treinamento, sem execução real.',lines:[{itemId,quantity}]});
    act(`approve-${id}`,'approve-measurement',{measurementId:id,accepted:true});
    return state.measurements.find(m=>m.id===id)!;
  };
  const pay=(id:string,m:any,day:string)=>act(id,'payment',{measurementId:m.id,amount:m.net,date:day,reference:'Liquidação demonstrativa, sem transferência bancária'});
  const amend=(id:string,delta:string,day:string)=>{
    act(id,'amendment',{title:`Aditivo didático ${id}`,effectiveDate:day,reason:'Alteração fictícia de quantitativo para demonstrar preservação do desconto.',lines:[{itemId:'training-a',quantityDelta:delta}]});
    stages.push({id,summary:summary(state),items:structuredClone(state.items),milestone:structuredClone(state.milestone)});
  };
  // Prior execution leaves exactly R$100,000 eligible after the first amendment.
  pay('pay-opening',measure('opening','Abertura','training-a','112.5','2026-01-02'),'2026-01-03');
  amend('A1','312.5','2026-01-04');
  pay('pay-m1',measure('m1','1','training-a','200','2026-01-05'),'2026-01-06');
  stages.push({id:'retention-1000',summary:summary(state)});
  amend('A2','125','2026-01-07');
  // R$37,019.23 / R$96,250 * R$13,000 = R$5,000.00 after cent rounding.
  pay('pay-m2',measure('m2','2','training-b','3701.923','2026-01-08'),'2026-01-09');
  stages.push({id:'retention-6000',summary:summary(state)});
  amend('A3','-312.5','2026-01-10');
  act('refund-2000','refund',{amount:'2000',date:'2026-01-11',reason:'Restituição fictícia do excesso retido após A3.'});
  stages.push({id:'refund-2000',summary:summary(state)});
  amend('A4','-125','2026-01-12');
  act('refund-4000','refund',{amount:'4000',date:'2026-01-13',reason:'Restituição fictícia do saldo após A4.'});
  stages.push({id:'settled',summary:summary(state)});
  return {fictional:true,original,actions,stages,finalSummary:summary(state)};
}

export function calculatedDemoExamples() {
  const compensationScenario=calculatedCompensationScenario();
  const globalScenario=calculatedGlobalAmendmentScenario();
  const unitInput={contractQuantity:'1000',previousQuantity:'0',presentedQuantity:'200',approvedQuantity:'200',unitPrice:'50'};
  const glosaInput={...unitInput,presentedQuantity:'100',approvedQuantity:'90'};
  const amendmentInput={original:'1000',additions:['100'],suppressions:['50'],measured:'200'};
  const single={basePrice:'50',components:[{weight:'1',baseIndex:'100',currentIndex:'105'}]};
  const basket={basePrice:'50',components:[{weight:'0.6',baseIndex:'100',currentIndex:'108'},{weight:'0.4',baseIndex:'100',currentIndex:'105'}]};
  const events=[{id:'training-event',amount:'100000',accepted:true}];
  const compactBaseline={regime:'UNIT_PRICE',originalValue:'8000.00',paradigmOriginal:'8000.00',examples:[],events:[],items:[{id:'item',code:'DID-C',description:'Serviço didático C',unit:'UN',originalQuantity:'100',quantity:'100',unitPrice:'80',referencePrice:'80',originalTotal:'8000.00',measured:'0'}]};
  const equilibriumState=initialState(compactBaseline);
  const equilibriumInput={itemId:'item',effectiveDate:'2026-02-01',title:'Reequilíbrio didático',reason:'Decisão e memória fictícias para treinamento.',mode:'REEQUILIBRIUM',newPrice:'88'};
  const equilibriumResult=applyAction(equilibriumState,'price-rule',equilibriumInput,'equilibrium');
  const progressState=initialState(compactBaseline);
  applyAction(progressState,'measurement',{title:'Boletim didático',period:'1',executionDate:'2026-02-01',evidence:'20 unidades fictícias aceitas.',lines:[{itemId:'item',quantity:'20'}]},'progress-m');
  applyAction(progressState,'approve-measurement',{measurementId:'progress-m',accepted:true},'progress-approve');
  applyAction(progressState,'payment',{measurementId:'progress-m',amount:'1200',date:'2026-02-02',reference:'Pagamento parcial fictício'},'progress-pay');
  const progressInput={date:'2026-02-02',plannedPercent:'30',executedPercent:'25',reason:'Mesma data de corte e base contratual fixa de R$8.000.'};
  const progress=applyAction(progressState,'progress',progressInput,'progress');
  const progressTotals=summary(progressState);
  return [
    {id:'unit',title:'Medição unitária',kind:'measurement',description:'Planilha fictícia de treinamento: 1.000 m² contratados a R$50; 200 m² aceitos.',inputs:unitInput,result:unitMeasurement(unitInput),expected:'R$ 10.000,00; saldo 800 m²',fictional:true},
    {id:'glosa',title:'Glosa na conferência',kind:'measurement',description:'100 m² apresentados e 90 m² aprovados; somente o aprovado consome saldo.',inputs:glosaInput,result:unitMeasurement(glosaInput),expected:'Glosa de 10 m²; valor R$4.500,00',fictional:true},
    {id:'amendment',title:'Acréscimo e supressão',kind:'amendment',description:'Acréscimos e supressões acumulados preservam as medições anteriores.',inputs:amendmentInput,result:amendmentQuantity(amendmentInput),expected:'Quantidade vigente 1.050 m²; saldo 850 m²',fictional:true},
    {id:'new-service',title:'Serviço novo e desconto',kind:'amendment',description:'Proposta original de R$90 mil e paradigma de R$100 mil; novo preço referencial R$100.',inputs:{originalContract:'90000',originalReference:'100000',referencePrice:'100'},result:newServicePrice({originalContract:'90000',originalReference:'100000',referencePrice:'100'}),expected:'Preço proposto R$90,00',fictional:true},
    {id:'index',title:'Reajuste por índice',kind:'price-rule',description:'Preço-base R$50; índice 100 para 105.',inputs:single,result:indexedPrice(single),expected:'R$52,50',fictional:true},
    {id:'basket',title:'Cesta de índices',kind:'price-rule',description:'Pesos de 60% e 40%; fatores de 1,08 e 1,05.',inputs:basket,result:indexedPrice(basket),expected:'Fator 1,068; preço R$ 53,40',fictional:true},
    {id:'equilibrium',title:'Reequilíbrio de serviço específico',kind:'price-rule',description:'Preço de R$ 80 para R$ 88, com decisão e vigência fictícias preservadas.',inputs:{baseline:compactBaseline,rule:equilibriumInput},result:equilibriumResult,expected:'Preço vigente R$ 88,00 a partir de 01/02/2026',fictional:true},
    {id:'global',title:'Medição por evento aceito',kind:'measurement',description:'O aceite integral do evento contratual habilita a medição; avanço informado de 60% sozinho não habilita pagamento parcial.',inputs:{events,selectedIds:['training-event'],previouslyMeasuredIds:[]},result:globalMeasurement({events,selectedIds:['training-event'],previouslyMeasuredIds:[]}),expected:'R$ 100.000,00 pelo evento integral aceito',fictional:true},
    {id:'compensation',title:'Aditivos sucessivos, retenções e restituições',kind:'refund',description:'Sequência calculada de necessidade: 10.000 → 14.000 → 4.000 → 0, com medições, pagamentos e devoluções. Planilha didática independente do orçamento real.',inputs:compensationScenario.original,result:compensationScenario,expected:'Retenções de R$ 6.000; restituições de R$ 2.000 e R$ 4.000; saldo zero',fictional:true},
    {id:'progress',title:'Planejado, executado, medido e pago',kind:'progress',description:'Contrato fictício de R$ 8.000; 20 unidades medidas a R$ 80 e pagamento parcial de R$ 1.200. Avanço físico e planejamento registrados separadamente.',inputs:{baseline:compactBaseline,progress:progressInput,approvedQuantity:'20',paidAmount:'1200'},result:{progress,summary:progressTotals,measurements:progressState.measurements,payments:progressState.payments},expected:'Planejado: 30%; executado: 25%; medido: 20%; pago: 15%; saldo do boletim: R$ 400',fictional:true},
    {id:'global-lifecycle',title:'Quatro pavimentos: aditivos, preços e diferenças',kind:'amendment',description:'Contrato didático de quatro pavimentos. Revisa valores e prazos do eventograma, mantém evento já aceito, aplica índice e cesta, emite diferença retroativa de R$ 1.890, ancora índice em reequilíbrio e registra pagamentos parciais.',inputs:globalScenario.original,result:globalScenario,expected:'Escopo-base R$410.000; preço do pavimento 3 R$118.800; medido-base R$305.000; pago-base R$205.000; originais preservados',fictional:true},
  ];
}
