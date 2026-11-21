import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as XLSX from '@e965/xlsx';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ContractAccess } from './contract-access';
import { ContractFiles } from './contract-files';
import { ContractImport, importDecimal, mapContractRows, mapMeasurementRows } from './contract-import';
import { ContractService } from './contract.service';
import { ContractGuard } from './contract.guard';
import { ContractExport } from './contract-export';

const user:any={userId:'author',tenantId:'org',email:'author@example.com'};
const mapping={code:0,description:1,unit:2,quantity:3,unitPrice:4,referencePrice:5};
describe('Contract operations authorization and import integrity',()=>{
 it('parses Brazilian decimals exactly and keeps missing paradigm unresolved',()=>{
  expect(importDecimal('R$ 1.234,56')).toBe('1234.56');
  const result=mapContractRows({rows:[['header'],['1','Concreto','m3','2,5','123,45','130'],['2','Pintura','m2','3','50',null]]},mapping,1);
  expect(result.total).toBe('458.63');expect(result.ready).toBe(false);expect(result.errors[0].row).toBe(3);
  expect(()=>importDecimal('=SUM(A1)')).toThrow();
 });
 it('keeps repeated codes as separate source rows instead of combining quantities',()=>{
  const result=mapContractRows({rows:[['header'],['1','A','UN','1','10','12'],['1','B','UN','2','20','22']]},mapping,1);
  expect(result.ready).toBe(true);expect(result.rows).toHaveLength(2);expect(result.rows[0].id).not.toBe(result.rows[1].id);expect(result.warnings[0].row).toBe(3);
 });
 it('accepts explicit reference completion and hashes only fully validated rows for confirmation',()=>{
  const sheet={rows:[['header'],['1','A','UN','2','10',null],['item','repeated header','unit','quantity','price',null]]};
  const result=mapContractRows(sheet,{...mapping,referencePrice:-1},1,{referenceOverrides:[{row:2,price:'12.50'}],excludedRows:[3],exclusionReason:'Cabeçalho repetido da segunda página'});
  expect(result.ready).toBe(true);expect(result.rows[0].referencePrice).toBe('12.50');expect(result.total).toBe('20.00');
  expect(()=>mapContractRows(sheet,mapping,1,{excludedRows:[3]})).toThrow();
 });
 it('imports only current quantities, requires ambiguous mappings and never takes spreadsheet prices',()=>{
  const detail:any={contract:{regime:'UNIT_PRICE',version:3},items:[{id:'a',code:'1',description:'First',quantity:'10',measured:'2'},{id:'b',code:'1',description:'Second',quantity:'20',measured:'0'}]};
  const sheet={name:'MED 20',rows:[['Item','Período','Preço'],['1',3,999999],['1',0,888888]]},body={mapping:{code:0,quantity:1},headerRow:1};
  const preview=mapMeasurementRows(sheet,body,detail,'hash');expect(preview.ready).toBe(false);expect(preview.rows[0].candidates).toHaveLength(2);expect(preview.zeroRowsIgnored).toBe(1);
  const mapped=mapMeasurementRows(sheet,{...body,itemMappings:[{row:2,itemId:'b'}]},detail,'hash');expect(mapped.ready).toBe(true);expect(mapped.rows[0]).toMatchObject({itemId:'b',quantity:'3'});expect(mapped.rows[0]).not.toHaveProperty('unitPrice');
  expect(mapMeasurementRows({...sheet,rows:[sheet.rows[0],['1',21,1]]},{...body,itemMappings:[{row:2,itemId:'b'}]},detail,'hash').ready).toBe(false);
 });
 it('resolves the same imported source by row and preserves exact contract/version scope',()=>{
  const detail:any={contract:{regime:'UNIT_PRICE',version:3,sourceProduct:'IMPORT',sourceHash:'hash'},items:[{id:'a',code:'1',description:'First',quantity:'10',measured:'0',sourceRow:2,sourceSheet:'MED 20'},{id:'b',code:'1',description:'Second',quantity:'10',measured:'0',sourceRow:3,sourceSheet:'MED 20'}]};
  const sheet={name:'MED 20',rows:[['Item','Período'],['1',3],['1',4]]};
  const mapped=mapMeasurementRows(sheet,{mapping:{code:0,quantity:1},headerRow:1},detail,'hash');expect(mapped.ready).toBe(true);expect(mapped.rows.map(r=>r.itemId)).toEqual(['a','b']);
  expect(mapMeasurementRows(sheet,{mapping:{code:0,quantity:1},headerRow:1},detail,'other-file-hash').ready).toBe(false);
 });
 it('previews useful columns even when XLSX formatting extends to XFD',async()=>{
  const sheet=XLSX.utils.aoa_to_sheet([['Item','Descrição','Unidade','Quantidade','Preço','Referência'],['1','Concreto','m3',2,40,50]]);sheet['!ref']='A1:XFD2';
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,'Orçamento');const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}) as Buffer;
  const files:any={identify:()=>({ext:'xlsx',name:'planilha.xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),store:jest.fn().mockResolvedValue({key:'key',contentHash:'hash'})};
  const query=jest.fn().mockResolvedValue([]),service=new ContractImport({query} as any,files);
  const result=await service.preview(user,{buffer,size:buffer.length,originalname:'planilha.xlsx'} as any);
  expect(result.sheets[0].truncatedColumns).toBe(true);expect(result.sheets[0].rows[1][1]).toBe('Concreto');expect(query.mock.calls[0][1].slice(1,3)).toEqual(['org','author']);
 });
 it('does not disclose another tenant contract or download its private bytes',async()=>{
  const query=jest.fn().mockResolvedValue([]),access=new ContractAccess({query} as any,{} as any,{} as any);
  await expect(access.role(user,'foreign')).rejects.toBeInstanceOf(NotFoundException);
  expect(query.mock.calls[0][1]).toEqual(['author','foreign','org']);
  const files=new ContractFiles({get:()=>'/private/contracts'} as any,{query} as any,access);const read=jest.spyOn(files,'read');
  await expect(files.download(user,'foreign','attachment')).rejects.toBeInstanceOf(NotFoundException);expect(read).not.toHaveBeenCalled();
  expect(()=>files.filePath('../../secret')).toThrow();
 });
 it('revoked members cannot access contracts even while their subscription remains active',async()=>{
  const access=new ContractAccess({query:async()=>[{owner_id:'another-owner',role:'REVOKED'}]} as any,{} as any,{} as any);
  await expect(access.role(user,'contract')).rejects.toBeInstanceOf(NotFoundException);
 });
 it('locks tenant quota and refuses an oversized private blob before writing it',async()=>{
  const query=jest.fn(async(sql:string)=>sql.includes('SUM(size_bytes)')?[{used:100}]:[]),db:any={transaction:async(fn:any)=>fn({query})};
  const files=new ContractFiles({get:(k:string)=>k==='GESTAO_STORAGE_ROOT'?path.join(tmpdir(),'contract-files-test'):100} as any,db,{} as any);
  await expect(files.store(user,Buffer.from('x'),'pdf')).rejects.toBeInstanceOf(BadRequestException);
  expect(query.mock.calls.some(([sql])=>sql.endsWith('FOR UPDATE'))).toBe(true);
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO GcBlob'))).toBe(false);
 });
 it('exports legacy global bulletins with their event lines and an explicit demonstration label',async()=>{
  const data:any={contract:{id:'c',name:'Contrato',version:2,demo:true,sourceHash:'abc',regime:'GLOBAL_PRICE'},measurements:[{id:'m',period:'Novembro',executionDate:'2026-11-01',status:'APPROVED',eventIds:['e'],gross:'100.00',deduction:'0.00',net:'100.00',paid:'0.00'}],events:[{id:'e',name:'Fundação',value:'100.00'}],items:[]};
  const exports=new ContractExport({detail:async()=>data,worksheet:async()=>({kind:'GLOBAL_PRICE',version:2,rows:[{id:'e',number:'e',description:'Fundação',baseValue:'100.00',currentValue:'100.00',periodAmount:'100.00',previousAmount:'0.00',accumulatedAmount:'100.00',remainingValue:'0.00',accepted:true}],measurement:data.measurements[0]})} as any),xlsx=await exports.measurement(user,'c','m','xlsx');
  const wb=XLSX.read(xlsx.buffer,{type:'buffer'}),rows=XLSX.utils.sheet_to_json(wb.Sheets.Itens,{header:1});
  expect(rows).toContainEqual(['e','Fundação',100,'Confirmado']);expect(JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets.Boletim,{header:1}))).toContain('sem efeito contratual');
  const pdf=await exports.measurement(user,'c','m','pdf');expect(pdf.buffer.subarray(0,5).toString()).toBe('%PDF-');
 });
 it.each([['owner',false],['author',true]])('owner %s controls self approval (allowed %s)',async(owner,allowed)=>{
  const baseline={regime:'UNIT_PRICE',originalValue:'100',paradigmOriginal:'100',events:[],items:[{id:'i',code:'1',description:'Service',unit:'UN',originalQuantity:'10',quantity:'10',unitPrice:'10',referencePrice:'10',originalTotal:'100',measured:'0'}]};
  const row={id:'c',owner_id:owner,baseline,version:2,demo:false,regime:'UNIT_PRICE'};
  const draft={id:'draft',kind:'measurement',actor_id:'author',payload:{title:'Medição',period:'2026-11',executionDate:'2026-11-10',evidence:'Conferência',lines:[{itemId:'i',quantity:'1'}]}};
  const query=jest.fn(async(sql:string)=>sql.startsWith('SELECT c.')?[row]:sql.startsWith('SELECT id,version')?[draft]:[]);
  const db:any={query,transaction:async(fn:any)=>fn({query})},access:any={role:async()=> 'MANAGER',require:async()=> 'MANAGER'};
  const service=new ContractService(db,{} as any,{} as any,{} as any,access);
  const operation=service.action(user,'c',{requestId:'approval',expectedVersion:2,kind:'approve-measurement',payload:{measurementId:'draft'}});
  if(allowed)await expect(operation).resolves.toBeDefined();else await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(allowed);
 });
 it('confirms measurement import, source attachment and receipt in the same transaction without approval',async()=>{
  const baseline={regime:'UNIT_PRICE',originalValue:'100',paradigmOriginal:'100',events:[],items:[{id:'i',code:'1',description:'Service',unit:'UN',originalQuantity:'10',quantity:'10',unitPrice:'10',referencePrice:'10',originalTotal:'100',measured:'0'}]};
  const row:any={id:'c',owner_id:'author',baseline,version:1,demo:false,regime:'UNIT_PRICE'},actions:any[]=[];
  const imported:any={mapping_hash:'map-hash',mapping:{type:'MEASUREMENT',contractId:'c'},content_hash:'file-hash',file_name:'medicao.xlsx',media_type:'xlsx',size_bytes:12,original_storage_key:'private-key'};
  const query=jest.fn(async(sql:string,args:any[]=[])=>{if(sql.startsWith('SELECT c.'))return[row];if(sql.startsWith('SELECT id,version'))return actions;if(sql.startsWith('SELECT * FROM GcImport'))return[imported];if(sql.startsWith('INSERT INTO GcAction'))actions.push({id:args[0],kind:args[6],payload:args[7],actor_id:args[4],version:args[5]});if(sql.startsWith('UPDATE GcContract'))row.version++;return[];});
  const transaction=jest.fn(async(fn:any)=>fn({query})),access:any={role:async()=> 'FISCAL',require:async()=> 'FISCAL'},service=new ContractService({query,transaction} as any,{} as any,{} as any,{} as any,access);
  const result=await service.action(user,'c',{requestId:'draft',expectedVersion:1,kind:'measurement',payload:{title:'M20',period:'Novembro',executionDate:'2026-11-10',evidence:'Planilha conferida',lines:[{itemId:'i',quantity:'2'}]}},{id:'import',hash:'map-hash'});
  expect(transaction).toHaveBeenCalledTimes(1);expect(result.measurements[0]).toMatchObject({status:'DRAFT',gross:'20.00',createdBy:'author'});expect(result.items[0].measured).toBe('0');expect(result.payments).toEqual([]);
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO GcAttachment'))).toBe(true);expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE GcImport SET confirmed_contract_id=?,confirmed_action_id=?'))).toBe(true);
 });
 it('allows shared-contract access without granting the member their own creation licence',async()=>{
  const allowed=jest.fn().mockResolvedValue(true),allowedOwn=jest.fn().mockResolvedValue(false),guard=new ContractGuard({enabled:()=>true} as any,{get:(k:string)=>k==='CORS_ORIGINS'?'https://gestaodepredios.com.br':''} as any,{allowed,allowedOwn});
  const ctx=(method:string,path:string):any=>({switchToHttp:()=>({getRequest:()=>({user,method,path,headers:{origin:'https://gestaodepredios.com.br'}})})});
  await expect(guard.canActivate(ctx('GET','/api/v1/contract-management/contracts'))).resolves.toBe(true);
  await expect(guard.canActivate(ctx('POST','/api/v1/contract-management/contracts'))).rejects.toBeInstanceOf(ForbiddenException);
  expect(guard.canActivate(ctx('GET','/api/v1/contract-management/access'))).toBe(true);
 });
 it('uses only active and unexpired same-tenant candidates for membership',async()=>{
  const findMany=jest.fn().mockResolvedValue([{user:{id:'u1',name:'Ativo',email:'a@x',status:'ACTIVE'}},{user:{id:'u2',name:'Inativo',email:'b@x',status:'BLOCKED'}}]);
  const access=new ContractAccess({} as any,{tenantMembership:{findMany}} as any,{} as any);
  expect(await access.candidates(user)).toHaveLength(1);expect(findMany.mock.calls[0][0].where).toMatchObject({tenantId:'org',status:'ACTIVE'});
 });
});

describe('Measurement Excel links',()=>{
 const body={headerRow:1,mapping:{code:0,quantity:1}};
 it('links hundreds of repeated-code items by their explicit budget number',()=>{
  const items=Array.from({length:288},(_,n)=>({id:`i${n}`,number:`1.${n+1}`,code:'SAME',quantity:'10',measured:'2'})),detail={contract:{regime:'UNIT_PRICE',version:1},items};
  const sheet={rows:[['Item','Período'],...items.map(i=>[i.number,1])]};
  const mapped=mapMeasurementRows(sheet,{...body,identifierKind:'NUMBER'},detail,'hash');expect(mapped.ready).toBe(true);expect(mapped.rows.map(r=>r.itemId)).toEqual(items.map(i=>i.id));
  expect(mapMeasurementRows(sheet,body,detail,'hash').ready).toBe(false);
  expect(mapMeasurementRows({rows:[['Código','Qtd.'],['SAME',1]]},body,detail,'hash').rows[0].candidates).toHaveLength(288);
 });
 it('does not confuse an item number with another service composition code',()=>{
  const detail={contract:{regime:'UNIT_PRICE',version:1},items:[{id:'a',number:'1.1',code:'999',quantity:'10',measured:'0'},{id:'b',number:'2.1',code:'1.1',quantity:'10',measured:'0'}]},sheet={rows:[['Item','Qtd.'],['1.1',1]]};
  expect(mapMeasurementRows(sheet,body,detail,'h').rows[0].itemId).toBe('b');expect(mapMeasurementRows(sheet,{...body,identifierKind:'NUMBER'},detail,'h').rows[0].itemId).toBe('a');
  expect(()=>mapMeasurementRows(sheet,{...body,mapping:{code:0,quantity:0}},detail,'h')).toThrow('colunas diferentes');
 });
 it('blocks parent-child overlap and previously measured ancestors during preview',()=>{
  const detail={contract:{regime:'GLOBAL_PRICE',version:1},events:[{id:'P',value:'100',measured:false},{id:'C',parentId:'P',value:'100',measured:false}]};
  expect(mapMeasurementRows({rows:[['Evento','Indicador'],['P',1],['C',1]]},body,detail,'h').ready).toBe(false);
  detail.events[0].measured=true;const result=mapMeasurementRows({rows:[['Evento','Indicador'],['C',1]]},body,detail,'h');expect(result.ready).toBe(false);expect(result.errors[0].message).toMatch(/evento-pai/);
 });
 it('accepts integral unmeasured events but blocks duplicate, foreign and archived IDs',()=>{
  const detail={contract:{regime:'GLOBAL_PRICE',version:1},events:[{id:'1',value:'100',measured:false},{id:'2',value:'100',archived:true}]};
  const map=(lines:any[])=>mapMeasurementRows({rows:[['Evento','Indicador'],...lines]},body,detail,'h');
  expect(map([['1',1]]).ready).toBe(true);expect(map([['1',1],['1',1]]).ready).toBe(false);expect(map([['2',1]]).ready).toBe(false);expect(map([['foreign',1]]).ready).toBe(false);
 });
});


it('does not silently ignore Excel errors or formulas without a cached result in measurement columns',async()=>{
 const sheet=XLSX.utils.aoa_to_sheet([['Item','Quantidade'],['A',null],['A',null]]);sheet.B2={t:'n',f:'1+2'};sheet.B3={t:'e',v:23};
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,'Medição');const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
 const files:any={identify:()=>({ext:'xlsx',name:'formulas.xlsx',mime:'xlsx'}),store:async()=>({key:'k',contentHash:'h'})};
 const preview=await new ContractImport({query:async()=>[]} as any,files).preview(user,{buffer,size:buffer.length} as any);
 const mapped=mapMeasurementRows(preview.sheets[0],{headerRow:1,mapping:{code:0,quantity:1}},{contract:{regime:'UNIT_PRICE',version:1},items:[{id:'a',code:'A',quantity:'10',measured:'0'}]},'h');
 expect(mapped.ready).toBe(false);expect(mapped.errors.map(e=>e.row)).toEqual(expect.arrayContaining([2,3]));expect(mapped.zeroRowsIgnored).toBe(0);
});

it('preserves complete imported technical descriptions over 1000 characters without silently truncating',()=>{
 const description='Memória técnica detalhada. '.repeat(80),mapping={code:0,description:1,unit:2,quantity:3,unitPrice:4,referencePrice:5};
 const result=mapContractRows({rows:[['Código','Descrição','Unidade','Quantidade','Preço','Referência'],['GLP',description,'UN',1,2000,2200]]},mapping,1);
 expect(result.ready).toBe(true);expect(result.rows[0].description).toBe(description.trim());expect(result.total).toBe('2000.00');
 const excess=mapContractRows({rows:[[],['GLP','x'.repeat(10001),'UN',1,2000,2200]]},mapping,1);expect(excess.ready).toBe(false);
});


describe('Retificação exclusiva do proprietário',()=>{
 it.each(['MANAGER','FISCAL','READER'])('does not grant revision rights to shared role %s',async role=>{
  const row={id:'c',owner_id:'another',version:1,baseline:{regime:'UNIT_PRICE',originalValue:'100',paradigmOriginal:'100',items:[],events:[]}};
  const query=jest.fn(async(sql:string)=>sql.startsWith('SELECT c.')?[row]:[]);
  const access={role:async()=>role,require:async(_u:any,_id:any,roles:string[])=>{if(!roles.includes(role))throw new ForbiddenException();return role;}};
  const service=new ContractService({query,transaction:async(fn:any)=>fn({query})} as any,{} as any,{} as any,{} as any,access as any);
  const dto={kind:'revise-measurement',requestId:'r',expectedVersion:1,payload:{measurementId:'m',replacement:{},revisionReason:'Correção'}};
  await expect(service.previewAction(user,'c',dto)).rejects.toBeInstanceOf(ForbiddenException);
  await expect(service.action(user,'c',dto)).rejects.toBeInstanceOf(ForbiddenException);
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
});
