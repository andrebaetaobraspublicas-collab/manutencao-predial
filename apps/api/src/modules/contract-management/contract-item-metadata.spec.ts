import { ConflictException, NotFoundException } from '@nestjs/common';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolveContractItemMetadata, presentContractMetadata } from './contract-item-metadata';
import { applyAction, initialState, summary } from './contract-state';
import { ContractService } from './contract.service';

const owner:any={userId:'owner',tenantId:'tenant'};
const codes=['10775','10779','10776','20193','38168','102146','102132','41480','5044'];
function fixture(){
 const nodes=Array.from({length:283},(_,n)=>({id:'i'+n,kind:'item',code:codes[n]||'CP-'+n,resourceType:[5,6].includes(n)?'C':n<9?'I':'C'}));
 const project:any={id:'source',name:'Edifício demonstrativo',version:21,referenceId:'reference',uf:'SP',regime:'CD',data:{root:{kind:'stage',id:'root',children:nodes},catalog:{compositions:nodes.slice(9).map((n,i)=>({code:n.code,desc:'Serviço '+(i+9),unit:'M2'})),inputs:[]}}};
 const definitions:any[]=nodes.slice(0,9).map((n,i)=>({id:'definition-'+n.code,description:i<3?'LOCAÇÃO DE CONTÊINER '+n.code:'Definição oficial '+n.code,unit:i<3?'MES':'UN',...(n.resourceType==='I'?{input:{code:n.code}}:{composition:{code:n.code}})}));
 const graph=jest.fn(async()=>({inputs:definitions.filter(r=>r.input),compositions:definitions.filter(r=>r.composition)}));
 const base={regime:'UNIT_PRICE',originalValue:'28300.00',paradigmOriginal:'28300.00',baseDate:'2026-01-01',examples:[],events:[],items:nodes.map((n,i)=>({id:n.id,code:n.code,description:i<9?n.code:'Serviço '+i,unit:i<9?'UN':'M2',originalQuantity:'10',quantity:'10',unitPrice:'10',referencePrice:'10',originalTotal:'100.00',measured:'0'}))};
 const calculation={version:21,summary:{start:'2026-01-01',items:nodes.map(n=>({code:n.code,qty:10,total:10000}))}};
 const document={project,calculation},content_hash=createHash('sha256').update(JSON.stringify(document)).digest('hex');
 const row:any={id:'contract',source_id:'source-record',owner_id:'owner',tenant_id:'tenant',product:'ORCAPRO',baseline:base,regime:'UNIT_PRICE',version:1,demo:true,content_hash};
 const actions:any[]=[],query=jest.fn(async(sql:string,args:any[])=>{
  if(sql.startsWith('SELECT c.'))return args[0]==='contract'&&args[1]==='tenant'&&args[2]==='owner'?[structuredClone(row)]:[];
  if(sql.includes('FROM GcSource')){expect(sql).toContain('tenant_id=? AND owner_id=?');expect(args).toEqual(['source-record','tenant','owner']);return [{document_gz:gzipSync(Buffer.from(JSON.stringify(document))),content_hash}];}
  if(sql.includes('FROM GcAction'))return actions;
  throw new Error('Unexpected database write: '+sql);
 });
 const db:any={query,transaction:jest.fn((fn:any)=>fn({query}))},orcapro:any={graph,project:async()=>project,calculation:async()=>calculation},service=new ContractService(db,orcapro,{enabledFor:async()=>true} as any,{} as any);
 return {project,definitions,graph,base,calculation,document,row,actions,query,db,service};
}

describe('Versioned item metadata without financial mutation',()=>{
 it('checks all 283 source items and resolves only the nine missing descriptors from the captured reference',async()=>{
  const f=fixture(),before=structuredClone(f.project),result=await resolveContractItemMetadata(f.project,f.graph);
  expect(result.size).toBe(283);expect([...result.values()].every(i=>i.description&&i.unit)).toBe(true);
  expect(f.graph).toHaveBeenCalledWith('reference',['102146','102132'],['10775','10779','10776','20193','38168','41480','5044'],'SP','CD');
  expect(result.get('i0')).toMatchObject({description:'LOCAÇÃO DE CONTÊINER 10775',unit:'MES',provenance:{descriptionSource:'SINAPI_REFERENCE',definitionVersionId:'definition-10775'}});
  expect(result.get('i10')).toMatchObject({description:'Serviço 10',unit:'M2',provenance:{descriptionSource:'PRIVATE_CATALOG'}});expect(f.project).toEqual(before);
 });
 it('does not mix identical codes from input and composition catalogs',async()=>{
  const project={referenceId:'ref',data:{root:{children:[{id:'input',kind:'item',code:'1',resourceType:'I'},{id:'composition',kind:'item',code:'1',resourceType:'C'}]},catalog:{inputs:[{code:'1',desc:'Material',unit:'KG'}],compositions:[{code:'1',desc:'Serviço',unit:'M2'}]}}};
  const result=await resolveContractItemMetadata(project);expect(result.get('input')).toMatchObject({description:'Material',unit:'KG'});expect(result.get('composition')).toMatchObject({description:'Serviço',unit:'M2'});
 });
 it('returns an authorized read-only plan and rejects foreign tenant or unresolved definitions',async()=>{
  const f=fixture(),preview=await f.service.metadataPreview(owner,'contract');expect(preview).toMatchObject({checkedSourceItems:283,ready:true,unresolved:[],expectedVersion:1});expect(preview.changes).toHaveLength(9);expect(f.db.transaction).not.toHaveBeenCalled();expect(f.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
  await expect(f.service.metadataPreview({...owner,tenantId:'foreign'},'contract')).rejects.toBeInstanceOf(NotFoundException);
  f.graph.mockResolvedValueOnce({inputs:[],compositions:[]} as any);expect(await f.service.metadataPreview(owner,'contract')).toMatchObject({ready:false,unresolved:expect.arrayContaining([{itemId:'i0',code:'10775',descriptionMissing:true,unitMissing:true}])});
 });
 it('changes only descriptions and unit labels, preserving all financial state and original measurement memory',async()=>{
  const f=fixture(),p=await f.service.metadataPreview(owner,'contract'),s=initialState(f.base);
  applyAction(s,'measurement',{title:'BM01',period:'01/2026',executionDate:'2026-01-02',evidence:'Execução',lines:[{itemId:'i0',quantity:'2'}]},'m');applyAction(s,'approve-measurement',{measurementId:'m'},'approve');
  const old=structuredClone(s),totals=summary(s),result=applyAction(s,p.kind,p.payload,p.requestId);
  expect(summary(s)).toEqual(totals);expect(s.measurements).toEqual(old.measurements);expect(s.milestone).toEqual(old.milestone);expect(s.payments).toEqual(old.payments);expect(result.changes).toHaveLength(9);
  for(const [n,item] of s.items.entries()){const {description,unit,metadataProvenance,descriptionAtSnapshot,unitAtSnapshot,...financial}=item;const {description:d,unit:u,...oldFinancial}=old.items[n];expect(financial).toEqual(oldFinancial);}
  expect(s.items[0]).toMatchObject({descriptionAtSnapshot:'10775',unitAtSnapshot:'UN',unit:'MES',quantity:'10',measured:'2',unitPrice:'10'});
  const before=structuredClone(s);expect(()=>applyAction(s,p.kind,{...p.payload,lines:[{...p.payload.lines[0],expectedUnit:'WRONG'}]},'invalid')).toThrow(/divergentes/);expect(s).toEqual(before);
 });
 it('rejects forged or augmented enrichment payloads before any action insert',async()=>{
  const f=fixture(),p=await f.service.metadataPreview(owner,'contract');
  const originalQuery=f.query.getMockImplementation()!;f.query.mockImplementation(async(sql,args)=>sql.startsWith('SELECT request_hash')?[]:originalQuery(sql,args));
  await expect(f.service.action(owner,'contract',{requestId:p.requestId,expectedVersion:1,kind:p.kind,payload:{...p.payload,lines:p.changes.map((l:any,n:number)=>n?l:{...l,description:'Texto inventado',unitPrice:'0'})}})).rejects.toBeInstanceOf(ConflictException);
  expect(f.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 });
 it('annotates historical measurement and amendment worksheets without rewriting historical financial rows',async()=>{
  const f=fixture(),p=await f.service.metadataPreview(owner,'contract');
  f.actions.push({id:'a',kind:'amendment',version:2,payload:{title:'TA01',reason:'Ampliação',effectiveDate:'2026-01-02',lines:[{itemId:'i0',quantityDelta:'1'}]}});
  f.actions.push({id:'m',kind:'measurement',version:3,payload:{title:'BM01',period:'01/2026',executionDate:'2026-01-03',evidence:'Execução',lines:[{itemId:'i0',quantity:'2'}]}});
  f.actions.push({id:'approve',kind:'approve-measurement',version:4,payload:{measurementId:'m'}});f.row.version=4;
  const old=await f.service.worksheet(owner,'contract',undefined,'m');f.actions.push({id:p.requestId,kind:p.kind,version:5,payload:p.payload});f.row.version=5;
  const next=await f.service.worksheet(owner,'contract',undefined,'m'),amendment=await f.service.worksheet(owner,'contract',undefined,undefined,'a');
  expect(next.rows[0]).toMatchObject({description:'LOCAÇÃO DE CONTÊINER 10775',unit:'MES',descriptionAtSnapshot:'10775',unitAtSnapshot:'UN',contractQuantity:'11',periodQuantity:'2',periodAmount:'20.00',metadataProvenance:{contractVersion:5,actionId:p.requestId}});
  expect(next.summary).toEqual(old.summary);expect(next.measurement).toEqual(old.measurement);expect(next.version).toBe(4);expect(amendment.before.items[0]).toMatchObject({unit:'MES',quantity:'10'});expect(amendment.items[0]).toMatchObject({unit:'MES',quantity:'11'});expect(amendment.amendment.lines[0].unit).toBe('UN');
  const raw=structuredClone(old);presentContractMetadata(old,f.actions);expect(old).toEqual(raw);
 });
 it('resolves future captures without changing source hash, quantities or any source object',async()=>{
  const f=fixture(),documentBefore=structuredClone(f.document),preview:any=await f.service.preview(owner,'ORCAPRO','source');
  expect(preview.sourceHash).toBe(f.row.content_hash);expect(preview.originalValue).toBe('28300.00');expect(preview.items[0]).toMatchObject({description:'LOCAÇÃO DE CONTÊINER 10775',unit:'MES',quantity:'10',unitPrice:'10.000000',originalTotal:'100.00'});expect(f.document).toEqual(documentBefore);expect(f.db.transaction).not.toHaveBeenCalled();
 });
});
