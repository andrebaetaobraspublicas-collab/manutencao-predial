import { gzipSync } from 'node:zlib';
import { contractPlanning } from './contract-planning';
import { applyAction, initialState } from './contract-state';
import { ContractService } from './contract.service';
const base=()=>initialState({regime:'UNIT_PRICE',sourceStart:'2026-01-01',sourceEnd:'2026-01-31',originalValue:'1000.00',paradigmOriginal:'1000.00',events:[],items:[{id:'a',number:'1.1',code:'1',description:'Fundação',unit:'m3',quantity:'10',originalQuantity:'10',unitPrice:'100',referencePrice:'100',originalTotal:'1000',measured:'0',start:'2026-01-01',end:'2026-01-20'}],planningBaseline:{total:100000,monetaryUnit:'CENT',rows:[{key:'2026-01',ce:100000}]}});
const source={project:{data:{root:{children:[{id:'a',kind:'item',code:'1',evento:'2'}]}}},calculation:{summary:{items:[{start:'2026-01-01',end:'2026-01-20',critical:true,TF:0,days:14,productivity:{teams:2,durationHours:50,rows:[{kind:'mo',name:'Pedreiro',n:3,H:150}]}}]}}};
describe('Contract schedule tracking',()=>{
 it('does not classify fully suppressed services as missing physical reports',()=>{
  const s=base();s.items[0].quantity='0';const p=contractPlanning(s,source,'2026-01-25');expect(p.rows[0]).toMatchObject({executedPercent:'0.00',status:'SUPPRESSED',delayDays:null});expect(p.metrics.unreported).toBe(0);
 });
 it('does not claim schedule improvement when amendments increase the measured scope',()=>{
  const s=base();s.items[0].quantity='20';applyAction(s,'progress-items',{date:'2026-02-01',reason:'Medição física do escopo ampliado',lines:[{itemId:'a',executedPercent:'90',actualStart:'2026-01-01',forecastEnd:'2026-02-10'}]},'p');
  const p=contractPlanning(s,source,'2026-02-01');expect(p.metrics).toMatchObject({scopeChanged:true,variancePoints:null,performanceIndex:null});expect(p.rows[0].delayDays).toBe(21);
 });
 it('preserves missing physical observations and excludes future receipts at a cutoff',()=>{
  const s=base();s.measurements.push({id:'m',status:'APPROVED',executionDate:'2026-02-01',eligible:'1000',gross:'1000',deduction:'0',lines:[{itemId:'a',quantity:'10'}]});
  const p=contractPlanning(s,source,'2026-01-15');expect(p.rows[0]).toMatchObject({status:'UNREPORTED',executedPercent:null,delayDays:null,measuredPercent:'0.00',teams:2});expect(p.metrics.executedPercent).toBeNull();expect(p.metrics.measuredPercent).toBe('0.00');expect(p.resources[0].hours).toBe('150.00');
 });
 it('uses recorded physical dates for delays without converting measurement or cash into execution',()=>{
  const s=base();applyAction(s,'progress-items',{date:'2026-01-25',reason:'Conferência de campo',lines:[{itemId:'a',executedPercent:'50',actualStart:'2026-01-05',forecastEnd:'2026-02-01',actualTeams:'1'}]},'p1');
  const p=contractPlanning(s,source,'2026-01-25');expect(p.rows[0]).toMatchObject({executedPercent:'50',delayDays:12,startVarianceDays:4,actualTeams:'1'});expect(p.metrics).toMatchObject({executedPercent:'50.00',measuredPercent:'0.00',delayed:1,criticalDelayed:1});expect(p.curves.at(-1)?.executedPercent).toBeNull();
  expect(()=>applyAction(s,'progress-items',{date:'2026-01-24',reason:'Data anterior',lines:[{itemId:'a',executedPercent:'60',actualStart:'2026-01-05'}]},'p2')).toThrow(/posterior/);
  expect(()=>applyAction(s,'progress-items',{date:'2026-01-26',reason:'Sem conclusão',lines:[{itemId:'a',executedPercent:'100'}]},'p3')).toThrow(/Conclusão/);
 });
 it('never reports a complete aggregate from a partial item survey',()=>{
  const s=base();s.items.push({...s.items[0],id:'b'});applyAction(s,'progress-items',{date:'2026-01-25',reason:'Conferido somente um serviço',lines:[{itemId:'a',executedPercent:'100',actualStart:'2026-01-01',actualEnd:'2026-01-20'}]},'p');
  const p=contractPlanning(s,source,'2026-01-25');expect(p.metrics.executedPercent).toBeNull();expect(p.metrics.coveragePercent).toBe('50.00');
 });
 it('preserves precise physical progress when editing only the crew size',()=>{
  const s=base();applyAction(s,'progress-items',{date:'2026-01-15',reason:'Apontamento inicial',lines:[{itemId:'a',executedPercent:'50.1234',actualStart:'2026-01-01',actualTeams:'1'}]},'p');
  const row=contractPlanning(s,source,'2026-01-15').rows[0];expect(row.executedPercent).toBe('50.1234');
  expect(()=>applyAction(s,'progress-items',{date:'2026-01-15',reason:'Conferência da equipe',lines:[{itemId:'a',executedPercent:row.executedPercent,actualStart:row.actualStart,actualTeams:'3'}]},'p2')).not.toThrow();
 });
 it('reads Infra dates, crews and curve from its captured calculation',()=>{
  const s=base();delete s.planningBaseline;const doc={project:source.project,sourcePlanning:{items:source.calculation.summary.items,scurve:{total:100000,rows:[{key:'2026-01',ce:100000}]}}};
  expect(contractPlanning(s,doc,'2026-01-31')).toMatchObject({sourcePlanValue:'1000.00',metrics:{plannedPercent:'100.00'}});
 });
 it('rolls child acceptances into the linked parent without inferring unit quantities',()=>{
  const s=base();s.regime='GLOBAL_PRICE';s.events=[{id:'2',value:'1000'},{id:'2.1',parentId:'2',value:'400'},{id:'2.2',parentId:'2',value:'600'}];
  s.measurements.push({id:'m',status:'APPROVED',executionDate:'2026-01-10',gross:'400',eligible:'400',deduction:'0',eventIds:['2.1'],lines:[]});
  const p=contractPlanning(s,source,'2026-01-20');expect(p.rows[0]).toMatchObject({measuredQuantity:null,measuredPercent:'40.00',executedPercent:null});
  const unknown=structuredClone(source);unknown.project.data.root.children[0].evento='Diluído';expect(contractPlanning(s,unknown,'2026-01-20').rows[0].measuredPercent).toBeNull();
 });
 it('authorizes the contract before reading a source and scopes its compressed source to tenant and owner',async()=>{
  const queries:any[]=[];const db:any={query:jest.fn(async(q:string,args:any[])=>{queries.push([q,args]);if(q.includes('JOIN GcSource'))return args.includes('tenant-a')?[{id:'c',tenant_id:'tenant-a',owner_id:'owner',source_id:'source',product:'ORCAPRO',baseline:base(),content_hash:'h',version:1,original_value:'1000'}]:[];if(q.includes('FROM GcAction'))return [];if(q.includes('document_gz'))return [{content_hash:'h',document_gz:gzipSync(JSON.stringify(source))}];return [];})};
  const service=new ContractService(db,{} as any,{} as any,{} as any);
  await service.planning({userId:'owner',tenantId:'tenant-a'} as any,'c','2026-01-25');expect(queries.find(([q])=>q.includes('document_gz'))[1]).toEqual(['source','tenant-a','owner']);
  queries.length=0;await expect(service.planning({userId:'owner',tenantId:'tenant-b'} as any,'c')).rejects.toThrow(/não encontrado/);expect(queries).toHaveLength(1);
 });
});
