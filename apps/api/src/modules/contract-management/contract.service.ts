import { replayContract } from './contract-replay';
import { historySql, historyValues } from '../../common/version-retention';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { contractPlanning } from './contract-planning';
import { proposeSchedule } from './contract-schedule';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrcaproService } from '../orcapro/orcapro.service';
import { OrcaproAccess } from '../orcapro/orcapro.guard';
import { InfraService } from '../infraestrutura/infra.service';
import { ContractDatabase, ContractSql } from './contract-db';
import { ContractAccess } from './contract-access';
import { calculatedDemoExamples } from './contract-demo-scenarios';
import { presentContractMetadata, resolveContractItemMetadata } from './contract-item-metadata';
import { ContractActionDto, ContractPreviewDto, DemoContractDto } from './contract.dto';
import { applyAction, contractWorksheet, measurementWorksheet, currentTotals, date, decimal, initialState, Item, money, planningComparison, sum, summary, text, value } from './contract-state';
const parsed=(x:any)=>typeof x==='string'?JSON.parse(x):x;
const json=(x:any)=>JSON.stringify(x);
const digest=(x:any)=>createHash('sha256').update(json(x)).digest('hex');
const captureFingerprint=(baseline:any)=>{const copy=structuredClone(baseline);for(const item of copy.items||[]){delete item.description;delete item.unit;delete item.metadataProvenance;}return digest(copy);};
export function contractSourceHierarchy(root:any){
 const nodes:any[]=[],groups:any[]=[],metadata=new Map<string,any>();
 const visit=(node:any,path:number[]=[],ancestors:any[]=[])=>{
  const number=path.join('.');let current=ancestors;
  if(node.kind==='stage'&&path.length){const group={id:String(node.id),number,name:String(node.name||number),parentId:ancestors.at(-1)?.id,depth:ancestors.length};groups.push(group);current=[...ancestors,{id:group.id,number,name:group.name}];}
  if(node.kind==='item'){nodes.push(node);metadata.set(node.id,{number,groupId:current.at(-1)?.id,groupName:current.at(-1)?.name,groupPath:current,sourceOrder:nodes.length-1});}
  for(const [n,child] of (node.children||[]).entries())visit(child,[...path,n+1],current);
 };visit(root);return {nodes,groups,metadata};
}
export function contractEventDefinitions(input:any){
 if(!Array.isArray(input)||input.length>1000)throw new BadRequestException('Eventograma inválido.');
 const events=input.map(e=>{if(e.deadline!==undefined&&(!Number.isInteger(e.deadline)||e.deadline<0||e.deadline>36500))throw new BadRequestException('Prazo de evento deve ser um número de dias de 0 a 36.500.');return {id:text(e.id,80),name:text(e.name,200),parentId:e.parentId?text(e.parentId,80):undefined,value:money(value(e.value)),deadline:e.deadline,accepted:false,measured:false};});
 if(new Set(events.map(e=>e.id)).size!==events.length)throw new BadRequestException('Eventos repetidos.');
 for(const event of events){const seen=new Set([event.id]);let parent=event.parentId;while(parent){if(seen.has(parent))throw new BadRequestException('Ciclo no eventograma.');seen.add(parent);const e=events.find(x=>x.id===parent);if(!e)throw new BadRequestException('Evento-pai não encontrado.');parent=e.parentId;}const children=events.filter(e=>e.parentId===event.id);if(children.length&&!decimal(event.value).eq(sum(children.map(e=>e.value))))throw new BadRequestException('Valor do evento-pai deve igualar seus subeventos.');}
 return events;
}
export const CONTRACT_LIMITATIONS=[
 'Módulo restrito ao ambiente de desenvolvimento; cobranças somente em modo de teste.',
 'Demonstrações identificam sua proposta e seu paradigma didáticos; não representam uma contratação real.',
 'Contratos reais exigem paradigma informado. O proprietário pode aprovar suas próprias medições; colaboradores exigem outro aprovador.',
 'PDFs escaneados precisam de OCR externo; importações passam por prévia, mapeamento e conferência.',
 'Cada boletim recebe uma data de execução; divida períodos com preços diferentes em boletins distintos.',
 'Preços e reajustes dependem dos critérios formalizados no contrato; o programa preserva os movimentos e suas referências.',
];
@Injectable()
export class ContractService {
 constructor(private readonly db:ContractDatabase,private readonly orcapro:OrcaproService,private readonly sourceAccess:OrcaproAccess,private readonly infra:InfraService,@Optional() private readonly access?:ContractAccess){}
 async sources(user:AuthenticatedUser){
  const orcapro=await this.sourceAccess.enabledFor(user)?await this.orcapro.projects(user):[];
  // Services perform owner+tenant authorization. This preview never writes to the source applications.
  let infra:any[]=[];try{infra=(await this.infra.contractSources(user)).items;}catch{ /* product unavailable */ }
  return {orcapro:orcapro.map(x=>({id:x.id,name:x.name,version:x.version})),infra:infra.map(x=>({id:x.id,name:x.name,version:x.version})),infraImportAvailable:true};
 }
 private async owned(db:ContractSql,user:AuthenticatedUser,id:string,lock=false){if(this.access)await this.access.role(user,id,db);const rows=await db.query('SELECT c.*,s.product,s.project_id,s.source_version,s.content_hash FROM GcContract c JOIN GcSource s ON s.id=c.source_id WHERE c.id=? AND c.tenant_id=?'+(this.access?'':' AND c.owner_id=?')+' AND c.archived_at IS NULL'+(lock?' FOR UPDATE':''),this.access?[id,user.tenantId]:[id,user.tenantId,user.userId]);if(!rows[0])throw new NotFoundException('Contrato não encontrado nesta conta.');return rows[0];}
 private async view(db:ContractSql,user:AuthenticatedUser,row:any){
  const actions=await db.query('SELECT id,version,kind,payload,actor_id,created_at FROM GcAction WHERE contract_id=? AND tenant_id=? AND owner_id=? ORDER BY version',[row.id,user.tenantId,row.owner_id||user.userId]);
  const state=replayContract(parsed(row.baseline),actions,row.owner_id||user.userId);
  Object.assign(state,presentContractMetadata(state,actions));
  const role=this.access?await this.access.role(user,row.id,db):'MANAGER';
  for(const measurement of state.measurements)measurement.canApprove=measurement.status==='DRAFT'&&role!=='READER'&&(!!row.demo||row.owner_id===user.userId||measurement.createdBy!==user.userId);
  const administrativeAudit=this.access?await db.query('SELECT id,kind,details,actor_id AS actorId,created_at AS createdAt FROM GcAdministrativeAudit WHERE contract_id=? AND tenant_id=? ORDER BY created_at',[row.id,user.tenantId]):[];
  const totals=summary(state);
  return {contract:{id:row.id,name:row.name,regime:row.regime,version:row.version,demo:!!row.demo,role,isOwner:row.owner_id===user.userId,permissions:{manage:role==='MANAGER',measure:role!=='READER',approve:role!=='READER',pay:role==='MANAGER'},sourceProduct:row.product,sourceProjectId:row.project_id,sourceVersion:row.source_version,sourceHash:row.content_hash,originalValue:row.original_value,currentValue:totals.currentValue,paradigmOriginal:state.paradigmOriginal,compensationRequired:totals.compensationRequired,retained:state.retained,refunded:state.refunded,createdAt:row.created_at,updatedAt:row.updated_at,sourceSnapshot:{hash:row.content_hash,compressed:true,immutable:true}},...state,examples:calculatedDemoExamples(),planningComparison:planningComparison(state),summary:totals,audit:[...actions.map((a:any)=>({id:a.id,version:a.version,kind:a.kind,actorId:a.actor_id||row.owner_id,createdAt:a.created_at})),...administrativeAudit.map((a:any)=>({...a,details:parsed(a.details),version:null}))].sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()),compensations:state.amendments.map(a=>({id:a.id,title:a.title,...a.compensation})),limitations:this.db.production?.()?CONTRACT_LIMITATIONS.slice(1):CONTRACT_LIMITATIONS};
 }
 async list(user:AuthenticatedUser){const rows=await this.db.query<any[]>('SELECT c.*,s.product,s.project_id,s.source_version,s.content_hash FROM GcContract c JOIN GcSource s ON s.id=c.source_id WHERE c.tenant_id=? AND '+(this.access?'(c.owner_id=? OR EXISTS(SELECT 1 FROM GcMember m WHERE m.contract_id=c.id AND m.tenant_id=c.tenant_id AND m.user_id=? AND m.role IN (\'MANAGER\',\'FISCAL\',\'READER\')))':'c.owner_id=?')+' AND c.archived_at IS NULL ORDER BY c.updated_at DESC LIMIT 100',this.access?[user.tenantId,user.userId,user.userId]:[user.tenantId,user.userId]);const eligible=this.access?(await Promise.all(rows.map(async r=>await this.access!.licensed(user,r.id)?r:null))).filter(Boolean):rows;return Promise.all(eligible.map(async r=>(await this.view(this.db as ContractSql,user,r)).contract));}
 async detail(user:AuthenticatedUser,id:string){return this.view(this.db as ContractSql,user,await this.owned(this.db as ContractSql,user,id));}
 async planning(user:AuthenticatedUser,id:string,day?:string,revisionId?:string){
  const row=await this.owned(this.db as ContractSql,user,id),state=await this.view(this.db as ContractSql,user,row);
  const sources=await this.db.query<any[]>('SELECT document_gz,content_hash FROM GcSource WHERE id=? AND tenant_id=? AND owner_id=?',[row.source_id,user.tenantId,row.owner_id||user.userId]);
  if(!sources[0]||sources[0].content_hash!==row.content_hash)throw new NotFoundException('Fotografia autorizada não encontrada.');
  const document=JSON.parse(gunzipSync(sources[0].document_gz,{maxOutputLength:32*1024*1024}).toString('utf8'));
  return contractPlanning(state,document,day,revisionId);
 }
 async scheduleProposal(user:AuthenticatedUser,id:string,input:{expectedVersion:number;effectiveDate:string}){
  const row=await this.owned(this.db as ContractSql,user,id);if(this.access)await this.access.require(user,id,['MANAGER']);
  if(row.version!==input.expectedVersion)throw new ConflictException('Contrato mudou. Atualize antes de reprogramar.');
  const state=await this.view(this.db as ContractSql,user,row),plan=await this.planning(user,id,input.effectiveDate),proposal=proposeSchedule(state,plan,input.effectiveDate);
  const latest=await this.owned(this.db as ContractSql,user,id);if(latest.version!==row.version)throw new ConflictException('Contrato mudou durante a proposta. Recalcule.');
  return {...proposal,expectedVersion:row.version};
 }
 private async metadataPlan(user:AuthenticatedUser,row:any,state:any,db:ContractSql=this.db as ContractSql){
  if(row.product!=='ORCAPRO')throw new BadRequestException('Enriquecimento automático disponível para fotografias OrçaPro.');
  const sources=await db.query('SELECT document_gz,content_hash FROM GcSource WHERE id=? AND tenant_id=? AND owner_id=?',[row.source_id,user.tenantId,row.owner_id||user.userId]);if(!sources[0]||sources[0].content_hash!==row.content_hash)throw new NotFoundException('Fotografia autorizada não encontrada.');
  const document=JSON.parse(gunzipSync(sources[0].document_gz,{maxOutputLength:32*1024*1024}).toString('utf8'));
  const metadata=await resolveContractItemMetadata(document.project,typeof this.orcapro.graph==='function'?this.orcapro.graph.bind(this.orcapro):undefined),lines:any[]=[],unresolved:any[]=[];
  for(const record of metadata.values()){const item=state.items.find((i:any)=>i.id===record.itemId);if(!item||item.code!==record.code)throw new ConflictException('Identificação da fotografia diverge do item contratual.');
   if(!record.description||!record.unit){unresolved.push({itemId:item.id,code:item.code,descriptionMissing:!record.description,unitMissing:!record.unit});continue;}
   if(item.description!==record.description||item.unit!==record.unit)lines.push({itemId:item.id,expectedCode:item.code,expectedDescription:item.description,expectedUnit:item.unit,description:record.description,unit:record.unit,provenance:record.provenance});
  }
  return {checkedSourceItems:metadata.size,unresolved,payload:{reason:'Enriquecimento cadastral conferido na fotografia e na referência SINAPI: somente descrição e unidade, sem conversão ou alteração financeira.',sourceHash:row.content_hash,sourceReferenceId:document.project.referenceId,checkedSourceItems:metadata.size,lines}};
 }
 async metadataPreview(user:AuthenticatedUser,id:string){
  const row=await this.owned(this.db as ContractSql,user,id);if(this.access)await this.access.require(user,id,['MANAGER']);const state=await this.view(this.db as ContractSql,user,row),plan=await this.metadataPlan(user,row,state),requestId=randomUUID(),kind='metadata-enrichment',payloadHash=digest({kind,payload:plan.payload});
  const latest=await this.owned(this.db as ContractSql,user,id);if(latest.version!==row.version)throw new ConflictException('Contrato mudou durante a conferência de metadados.');
  return {requestId,expectedVersion:row.version,kind,payload:plan.payload,payloadHash,previewHash:this.previewDigest(user,id,row.version,requestId,payloadHash),checkedSourceItems:plan.checkedSourceItems,unresolved:plan.unresolved,changes:plan.payload.lines,ready:plan.payload.lines.length>0&&plan.unresolved.length===0};
 }
 async worksheet(user:AuthenticatedUser,id:string,day?:string,measurementId?:string,amendmentId?:string):Promise<any>{
  if([day,measurementId,amendmentId].filter(Boolean).length>1)throw new BadRequestException('Selecione data, medição ou aditivo, sem combinar cortes históricos.');
  if(!measurementId&&!amendmentId)return contractWorksheet(await this.detail(user,id) as any,day);
  const row=await this.owned(this.db as ContractSql,user,id),actions=await this.db.query('SELECT id,version,kind,payload,actor_id,created_at FROM GcAction WHERE contract_id=? AND tenant_id=? AND owner_id=? ORDER BY version',[id,user.tenantId,row.owner_id||user.userId]);
  if(amendmentId)for(const change of [...actions]){if(['revise-record','delete-record'].includes(change.kind)){const p=parsed(change.payload),at=actions.findIndex((a:any)=>a.id===p.recordId);if(at>=0){if(change.kind==='delete-record')actions.splice(at,1);else actions[at]={...actions[at],payload:p.replacement};}}}const target=actions.findIndex((a:any)=>a.id===(measurementId||amendmentId)&&(measurementId?['measurement','difference-measurement'].includes(a.kind):a.kind==='amendment'));if(target<0)throw new NotFoundException('Movimento histórico não encontrado neste contrato.');
  const revision=measurementId?actions.findLastIndex((a:any)=>['revise-measurement','revise-record','delete-record'].includes(a.kind)):-1;
  if(measurementId&&revision>=0){const state=replayContract(parsed(row.baseline),actions,row.owner_id||user.userId);return presentContractMetadata({...measurementWorksheet(state,measurementId),historical:true,version:row.version,currentStatus:state.measurements.find(m=>m.id===measurementId)?.status,revisions:state.measurementRevisions},actions);}
  const approval=measurementId?actions.findIndex((a:any)=>a.kind==='approve-measurement'&&parsed(a.payload).measurementId===measurementId):-1,cut=approval>=0?approval:target;
  const state=replayContract(parsed(row.baseline),actions.slice(0,cut+1).filter((a:any)=>!['revise-record','delete-record'].includes(a.kind)),row.owner_id||user.userId);const before=amendmentId?contractWorksheet(replayContract(parsed(row.baseline),actions.slice(0,target).filter((a:any)=>!['revise-record','delete-record'].includes(a.kind)),row.owner_id||user.userId),parsed(actions[target].payload).effectiveDate):undefined;
  if(measurementId){const currentStatus=actions.some((a:any)=>a.kind==='cancel-measurement'&&parsed(a.payload).measurementId===measurementId)?'CANCELED':state.measurements.find(m=>m.id===measurementId)?.status;return presentContractMetadata({...measurementWorksheet(state,measurementId),historical:true,version:actions[cut].version,currentStatus},actions);}
  const amendment=state.amendments.find(a=>a.id===amendmentId);
  if(state.regime==='UNIT_PRICE'&&state.events.length&&before){const sources=await this.db.query('SELECT document_gz FROM GcSource WHERE id=? AND tenant_id=? AND owner_id=?',[row.source_id,user.tenantId,row.owner_id]);if(sources[0]){const doc=JSON.parse(gunzipSync(sources[0].document_gz).toString('utf8'));const nodes=contractSourceHierarchy(doc.project?.data?.root||{}).nodes;const links=new Map(nodes.map(n=>[n.id,String(n.evento||'')]));const changes=new Map<string,any>();for(const line of state.items){let eventId=links.get(line.id);const seen=new Set<string>();while(eventId&&!seen.has(eventId)){seen.add(eventId);changes.set(eventId,decimal(changes.get(eventId)||0).plus(decimal(line.quantity).minus(line.originalQuantity).mul(line.unitPrice)));eventId=state.events.find(e=>e.id===eventId)?.parentId;}}for(const e of state.events){e.value=money(decimal(e.value).plus(changes.get(e.id)||0));}const priorChanges=new Map<string,any>();for(const item of before.items){let link=links.get(item.id);const seen=new Set<string>();while(link&&!seen.has(link)){seen.add(link);priorChanges.set(link,decimal(priorChanges.get(link)||0).plus(decimal(item.quantity).minus(item.originalQuantity).mul(item.unitPrice)));link=state.events.find(e=>e.id===link)?.parentId;}}for(const event of before.events)event.value=money(decimal(event.value).plus(priorChanges.get(event.id)||0));}}
  return presentContractMetadata({...contractWorksheet(state,amendment.effectiveDate),before,amendment,historical:true,version:actions[cut].version},actions);
 }
 private async revise(db:ContractSql,user:AuthenticatedUser,row:any,payload:any,id:string,kind='revise-measurement'){
  if(row.owner_id!==user.userId)throw new ForbiddenException('Somente o proprietário pode retificar medições.');
  const actions=await db.query('SELECT id,version,kind,payload,actor_id,created_at FROM GcAction WHERE contract_id=? AND tenant_id=? AND owner_id=? ORDER BY version',[row.id,user.tenantId,row.owner_id]);
  return replayContract(parsed(row.baseline),[...actions,{id,kind,payload,actor_id:user.userId,version:row.version+1}],row.owner_id);
 }
 private previewDigest(user:AuthenticatedUser,id:string,version:number,requestId:string,payloadHash:string){return digest({tenantId:user.tenantId,userId:user.userId,contractId:id,version,requestId,payloadHash});}
 async previewAction(user:AuthenticatedUser,id:string,dto:ContractPreviewDto){
  if(Buffer.byteLength(json(dto.payload))>512*1024)throw new BadRequestException('Operação muito grande.');
  const row=await this.owned(this.db as ContractSql,user,id);if(row.version!==dto.expectedVersion)throw new ConflictException('Contrato mudou; atualize a planilha antes da prévia.');
  if(this.access)await this.access.require(user,id,['measurement','difference-measurement'].includes(dto.kind)?['MANAGER','FISCAL']:['MANAGER']);
  if(['price-rule','price-batch'].includes(dto.kind)&&dto.payload.mode==='REEQUILIBRIUM')text(dto.payload.formalReference,1000);
  if(['revise-measurement','revise-record','delete-record'].includes(dto.kind)&&row.owner_id!==user.userId)throw new ForbiddenException('Somente o proprietário pode retificar medições.');
  const before=await this.view(this.db as ContractSql,user,row);let after=structuredClone(before);const requestId=dto.requestId||randomUUID(),payloadHash=digest({kind:dto.kind,payload:dto.payload});
  if(dto.kind==='metadata-enrichment'){const plan=await this.metadataPlan(user,row,before);if(plan.unresolved.length||digest(dto.payload)!==digest(plan.payload))throw new ConflictException('Metadados devem corresponder integralmente à conferência da fotografia.');}
  let result:any;if(['revise-measurement','revise-record','delete-record'].includes(dto.kind)){after={...after,...await this.revise(this.db as ContractSql,user,row,dto.payload,requestId,dto.kind)};result=after.measurements.find(m=>m.id===dto.payload.measurementId);}else result=applyAction(after as any,dto.kind,dto.payload,requestId);const afterSummary=summary(after as any);let approvalPreview:any;
  if(['measurement','difference-measurement'].includes(dto.kind)){
   const approved=structuredClone(after);applyAction(approved as any,'approve-measurement',{measurementId:requestId,accepted:true},`${requestId}-preview-approval`);
   approvalPreview={measurement:approved.measurements.find(m=>m.id===requestId),summary:summary(approved as any),hypothetical:true,requiresExplicitApproval:true};
  }
  const worksheet=contractWorksheet(after as any,dto.payload.executionDate||dto.payload.effectiveDate);
  // Catch a concurrent persisted action after the read/replay without acquiring
  // a write transaction or recording a preview as a business event.
  const latest=await this.owned(this.db as ContractSql,user,id);if(latest.version!==row.version)throw new ConflictException('Contrato mudou durante a prévia. Recalcule.');
  return {requestId,expectedVersion:row.version,kind:dto.kind,payloadHash,previewHash:this.previewDigest(user,id,row.version,requestId,payloadHash),before:{summary:before.summary},after:{summary:afterSummary},result,detail:{...after,summary:afterSummary,planningComparison:planningComparison(after as any),preview:true},worksheet,approvalPreview};
 }
 async preview(user:AuthenticatedUser,product:string,id:string){if(!['ORCAPRO','INFRA'].includes(product))throw new BadRequestException('Produto inválido.');const source=product==='ORCAPRO'?await this.orcapro.project(user,id):await this.infra.project(user,id);return this.demo(user,{sourceProduct:product as any,sourceProjectId:id,expectedSourceVersion:source.version,regime:'UNIT_PRICE'},{preview:true});}
 async create(user:AuthenticatedUser,body:any){return this.demo(user,body,{real:body});}
 async createImported(user:AuthenticatedUser,importId:string,body:any,input:any){
  if(input.contractId)return this.detail(user,input.contractId);
  const name=text(body.name,240),regime=body.regime,baseDate=date(body.baseDate),reason=text(body.reason,2000);
  if(!['UNIT_PRICE','GLOBAL_PRICE'].includes(regime))throw new BadRequestException('Regime inválido.');
  const items:Item[]=input.rows.map((r:any)=>({id:r.id,code:r.code,description:r.description,unit:r.unit,originalQuantity:r.quantity,quantity:r.quantity,unitPrice:r.unitPrice,referencePrice:r.referencePrice,originalTotal:r.originalTotal,measured:'0',sourceRow:r.sourceRow,sourceSheet:input.mapping?.sheet}));
  const originalValue=money(sum(items.map(i=>i.originalTotal))),paradigmOriginal=money(sum(items.map(i=>decimal(i.quantity).mul(i.referencePrice).toDecimalPlaces(2))));
  if(decimal(originalValue).lte(0)||decimal(paradigmOriginal).lte(0))throw new BadRequestException('Totais positivos obrigatórios.');
  const events=contractEventDefinitions(body.eventDefinitions||[]);
  if(regime==='GLOBAL_PRICE'&&money(sum(events.filter(e=>!events.some(c=>c.parentId===e.id)).map((e:any)=>e.value)))!==originalValue)throw new BadRequestException('Informe eventos-folha cujos valores somem exatamente o total contratual.');
  const baseline={regime,items,events,originalValue,paradigmOriginal,baseDate,paradigmStatus:'USER_CONFIRMED',paradigmReason:reason,planningBaseline:null,importReconciliation:{declaredTotal:input.declaredTotal,totalDifference:input.totalDifference,adoptedTotal:originalValue},captureWarnings:['Itens conferidos pelo usuário a partir do arquivo importado. Arquivo original preservado como anexo privado.'],examples:[]};
  const id=await this.db.transaction(async db=>{
   const records=await db.query('SELECT confirmed_contract_id,mapping_hash FROM GcImport WHERE id=? AND tenant_id=? AND user_id=? AND expires_at>CURRENT_TIMESTAMP(3) FOR UPDATE',[importId,user.tenantId,user.userId]);
   if(!records[0]||records[0].mapping_hash!==body.hash)throw new ConflictException('Prévia mudou ou expirou.');if(records[0].confirmed_contract_id)return records[0].confirmed_contract_id;
   const sourceId=randomUUID(),contractId=randomUUID(),document={importId,fileName:input.fileName,fileHash:input.sourceHash,mappingHash:body.hash,mapping:input.mapping,declaredTotal:input.declaredTotal,totalDifference:input.totalDifference,items:input.rows};
   await db.query('INSERT INTO GcSource(id,tenant_id,owner_id,product,project_id,source_version,content_hash,document_gz) VALUES(?,?,?,?,?,?,?,?)',[sourceId,user.tenantId,user.userId,'IMPORT',importId,1,input.sourceHash,gzipSync(Buffer.from(json(document)))]);
   await db.query('INSERT INTO GcContract(id,tenant_id,owner_id,source_id,name,regime,demo,original_value,baseline) VALUES(?,?,?,?,?,?,?,?,?)',[contractId,user.tenantId,user.userId,sourceId,name,regime,0,originalValue,json(baseline)]);
   await db.query('INSERT INTO GcAttachment(id,contract_id,tenant_id,uploaded_by,file_name,media_type,size_bytes,content_hash,storage_key) VALUES(?,?,?,?,?,?,?,?,?)',[randomUUID(),contractId,user.tenantId,user.userId,input.fileName,input.mediaType,input.sizeBytes,input.sourceHash,input.originalStorageKey]);
   await db.query('INSERT INTO GcAdministrativeAudit(id,contract_id,tenant_id,actor_id,kind,details) VALUES(?,?,?,?,?,?)',[randomUUID(),contractId,user.tenantId,user.userId,'import.confirm',json({importId,sourceHash:input.sourceHash,mappingHash:body.hash})]);
   await db.query('UPDATE GcImport SET confirmed_contract_id=? WHERE id=? AND tenant_id=? AND user_id=?',[contractId,importId,user.tenantId,user.userId]);return contractId;
  });return this.detail(user,id);
 }
 async demo(user:AuthenticatedUser,dto:DemoContractDto,options:{preview?:boolean;real?:any}={}){
  if(!['ORCAPRO','INFRA'].includes(dto.sourceProduct)||!['UNIT_PRICE','GLOBAL_PRICE'].includes(dto.regime))throw new BadRequestException('Produto ou regime inválido.');
  const scenario=dto.demoScenario;if(scenario&&options.real)throw new BadRequestException('Cenário didático deve usar a captura demonstrativa.');
  if((dto.proposalPrices||dto.referencePrices)&&!scenario&&!options.real)throw new BadRequestException('Preços simulados exigem identificação do cenário demonstrativo.');
  if(dto.sourceProduct==='ORCAPRO'&&!(await this.sourceAccess.enabledFor(user)))throw new NotFoundException('Origem não autorizada.');
  const infraCapture=dto.sourceProduct==='INFRA'?await this.infra.contractSnapshot(user,dto.sourceProjectId):null;
  const source:any=infraCapture?.project||await this.orcapro.project(user,dto.sourceProjectId);
  if(source.version!==dto.expectedSourceVersion)throw new ConflictException('Orçamento mudou. Atualize a prévia.');
  if(infraCapture&&infraCapture.calculation.items.some((item:any)=>!Number.isFinite(item.unitCostCents)||item.unitCostCents<0))throw new BadRequestException('Origem Infra contém serviço sem custo unitário definido. Resolva os custos pendentes no orçamento antes da captura.');
  const calculation:any=infraCapture?{version:source.version,summary:{items:infraCapture.calculation.items.map((i:any)=>({code:i.code,description:i.description,unit:i.unit,qty:i.quantity,total:i.priceCents,start:i.start,end:i.end,days:i.days,TF:i.TF,critical:i.critical,productivity:i.productivity})),scurve:infraCapture.calculation.scurve,days:infraCapture.calculation.workDays,start:infraCapture.calculation.start,end:infraCapture.calculation.end,events:{execution:[],fixed:[]}}}:await this.orcapro.calculation(user,source.id),s=calculation.summary as any,data=source.data as any;
  if(calculation.version!==source.version)throw new ConflictException('Orçamento mudou durante a captura.');
  const {nodes,groups,metadata}=contractSourceHierarchy(data.root);
  if(nodes.length!==s.items.length)throw new BadRequestException('Estrutura da origem exige conciliação antes da captura.');
  const captureWarnings:string[]=[];
  const catalog=new Map<string,any>([...(data.catalog?.compositions||[]),...(data.catalog?.inputs||[])].map((r:any)=>[String(r.code),r]));
  const resolvedMetadata=dto.sourceProduct==='ORCAPRO'?await resolveContractItemMetadata(source,typeof this.orcapro.graph==='function'?this.orcapro.graph.bind(this.orcapro):undefined):new Map<string,any>();
  const captureRows=s.items.map((r:any,n:number)=>({r,node:nodes[n]})).filter(({r,node}:any)=>{
   if(dto.sourceProduct==='INFRA'&&r.qty===0&&r.total===0&&String(r.code)===String(node.code)){
    captureWarnings.push(`Item ${metadata.get(node.id)?.number||node.id} · ${r.code}: quantidade e total zerados; não integra o contrato. Linha preservada na fotografia da origem.`);return false;
   }return true;
  });
  const items:Item[]=captureRows.map(({r,node}:any)=>{if(String(r.code)!==String(node.code)||!Number.isFinite(r.total)||r.total<0||!Number.isFinite(r.qty)||r.qty<=0)throw new BadRequestException('Origem tem código, quantidade ou preço pendente.');const q=decimal(String(r.qty)).toDecimalPlaces(6).toFixed();if(decimal(q).lte(0))throw new BadRequestException('Quantidade da origem fica zerada na precisão de seis casas; revise antes da captura.');if(!decimal(q).eq(String(r.qty)))captureWarnings.push(`Quantidade ${r.num}: ${r.qty} → ${q}; origem integral preservada.`);const price=decimal(String(r.total)).div(100).div(q).toFixed(6),total=money(decimal(String(r.total)).div(100));return {id:node.id,code:String(node.code),description:resolvedMetadata.get(node.id)?.description||r.description||node.desc||catalog.get(String(node.code))?.desc||String(node.code),unit:resolvedMetadata.get(node.id)?.unit||r.unit||node.unit||catalog.get(String(node.code))?.unit||'UN',metadataProvenance:resolvedMetadata.get(node.id)?.provenance,originalQuantity:q,quantity:q,unitPrice:price,referencePrice:price,originalTotal:total,sourceUnitPrice:price,sourceTotal:total,...metadata.get(node.id),number:String(node.originalNumber||r.num||metadata.get(node.id)?.number||node.id),measured:'0',start:r.start,end:r.end};});
  if(options.real){const prices=options.real.referencePrices;if(!Array.isArray(prices)||prices.length!==items.length||new Set(prices.map((p:any)=>p.itemId)).size!==items.length)throw new BadRequestException('Informe o paradigma de todos os itens, sem duplicação.');for(const item of items){const p=prices.find((p:any)=>p.itemId===item.id);item.referencePrice=value(p?.price);}}
  if(options.real?.contractedPrices!==undefined){const prices=options.real.contractedPrices;if(!Array.isArray(prices)||prices.length!==items.length||new Set(prices.map((p:any)=>p.itemId)).size!==items.length)throw new BadRequestException('Informe o preço contratado de todos os itens, sem duplicação.');for(const item of items){const price=value(prices.find((p:any)=>p.itemId===item.id)?.price);if(!decimal(price).eq(item.unitPrice)){item.unitPrice=price;item.originalTotal=money(decimal(item.quantity).mul(price));}}}
  if(scenario){
   text(dto.scenarioReason,2000);
   for(const field of ['proposalPrices','referencePrices'] as const){const prices=dto[field];if(!prices&&field==='referencePrices')continue;if(!Array.isArray(prices)||prices.length!==items.length||new Set(prices.map(p=>p.itemId)).size!==items.length)throw new BadRequestException('Cenário exige preços de todos os itens, sem duplicação.');
    for(const item of items){const price=value(prices.find(p=>p.itemId===item.id)?.price,true);if(field==='proposalPrices'){item.unitPrice=price;item.originalTotal=money(decimal(item.quantity).mul(price));}else item.referencePrice=price;}
   }
   captureWarnings.push('Proposta heterogênea integralmente fictícia para treinamento; preços e totais da fonte permanecem preservados e não foram alterados.');
  }
  const originalValue=money(sum(items.map(i=>i.originalTotal))),paradigmOriginal=money(sum(items.map(i=>decimal(i.quantity).mul(i.referencePrice).toDecimalPlaces(2))));
  if(!decimal(originalValue).isFinite()||!decimal(paradigmOriginal).isFinite()||decimal(originalValue).lte(0)||decimal(paradigmOriginal).lte(0))throw new BadRequestException('O orçamento e seu paradigma precisam ter valores totais positivos antes da captura.');
  const eventNames=new Map([...(data.evt?.events||[]),...(data.evt?.fixos||[])].map((e:any)=>[String(e.code),e.desc]));
  const events=(s.events?.execution||[]).map((e:any)=>({id:String(e.code),parentId:String(e.code).includes('.')?String(e.code).split('.').slice(0,-1).join('.'):undefined,name:eventNames.get(String(e.code))||String(e.code),value:money(decimal(String(e.v3)).div(100)),deadline:e.deadline,accepted:false,measured:false}));
  for(const e of s.events?.fixed||[])events.push({id:String(e.code),name:eventNames.get(String(e.code))||String(e.code),value:money(decimal(String(e.value)).div(100)),deadline:e.deadline,accepted:false,measured:false});
  if(options.real?.eventDefinitions||scenario&&dto.eventDefinitions)events.splice(0,events.length,...contractEventDefinitions(options.real?.eventDefinitions||dto.eventDefinitions));
  const leafEvents=events.filter((e:any)=>!events.some((child:any)=>child.parentId===e.id));
  const eventValue=money(sum(leafEvents.map((e:any)=>e.value))),eventDifference=money(decimal(eventValue).minus(originalValue));
  if(!options.preview&&dto.regime==='GLOBAL_PRICE'&&decimal(eventDifference).abs().gt(options.real?'0.00':'0.10'))throw new BadRequestException(`Eventograma diverge da planilha em R$ ${eventDifference}; revise os critérios antes da captura.`);
  captureWarnings.push('Preço unitário reconstruído com seis casas a partir do total adotado da linha; resíduos de centavos são identificados no fechamento de cada item.');
  if(!events.length)captureWarnings.push('Origem sem eventograma. Para preço global, cadastre eventos e critérios de aceite antes de constituir o contrato.');
  else if(eventDifference!=='0.00')captureWarnings.push(`Eventograma: diferença de arredondamento R$ ${eventDifference}, não compensada silenciosamente.`);
  let planningBaseline:any=s.scurve?{...s.scurve,monetaryUnit:'CENT'}:null;
  if(scenario&&planningBaseline&&decimal(planningBaseline.total).gt(0)){
   const originalPlan=planningBaseline,target=decimal(originalValue).mul(100);let previousEarly=decimal(0),previousLate=decimal(0);
   planningBaseline={...originalPlan,total:target.toFixed(0),source:'SOURCE_SCHEDULE_SCALED_FOR_DEMONSTRATION',scaleMemory:{sourceTotal:money(decimal(originalPlan.total).div(100)),proposalTotal:originalValue,method:'PROPORTIONAL_SOURCE_SCHEDULE'},rows:originalPlan.rows.map((r:any)=>{const ce=decimal(r.ce).mul(target).div(originalPlan.total).toDecimalPlaces(0),cl=decimal(r.cl??r.ce).mul(target).div(originalPlan.total).toDecimalPlaces(0),pe=ce.minus(previousEarly),pl=cl.minus(previousLate);previousEarly=ce;previousLate=cl;return {...r,ce:ce.toFixed(0),cl:cl.toFixed(0),pe:pe.toFixed(0),pl:pl.toFixed(0)};})};
   captureWarnings.push('Cronograma financeiro didático normalizado ao total da proposta; percentuais temporais da fonte preservados. Não é recálculo de produtividade ou calendário.');
  }
  const baseline={regime:dto.regime,items,groups,events,originalValue,paradigmOriginal,demoScenario:scenario,sourceStart:s.start,sourceEnd:s.end,sourceDays:s.days,planningBaseline,captureWarnings,eventValue,eventDifference,paradigmStatus:options.real?'USER_CONFIRMED':scenario?'DEMONSTRATION_HETEROGENEOUS_PROPOSAL':'DEMONSTRATION_ZERO_DISCOUNT',baseDate:options.real?date(options.real.baseDate):s.start,paradigmReason:options.real?text(options.real.reason,2000):scenario?text(dto.scenarioReason,2000):'Paradigma fictício de treinamento',examples:[]};
  const sourcePlanning=infraCapture?{...infraCapture.calculation}:null;if(sourcePlanning)delete sourcePlanning.project;
  const document={project:source,calculation,...(sourcePlanning?{sourcePlanning}:{})},hash=digest(document),gz=gzipSync(Buffer.from(json(document)));if(gz.length>8*1024*1024)throw new BadRequestException('Origem excede tamanho permitido.');
  if(options.preview)return {sourceProduct:dto.sourceProduct,sourceProjectId:source.id,sourceVersion:source.version,sourceHash:hash,name:source.name,items,groups,events,originalValue,paradigmOriginal,captureWarnings,eventDifference};
  if(options.real&&options.real.sourceHash!==hash)throw new ConflictException('Hash da origem mudou. Refaça a prévia.');
  const latest=dto.sourceProduct==='ORCAPRO'?await this.orcapro.project(user,source.id):await this.infra.project(user,source.id);if(latest.version!==source.version)throw new ConflictException('Origem mudou antes da confirmação.');
  const contractId=await this.db.transaction(async db=>{
   const rows=await db.query('SELECT id FROM GcSource WHERE tenant_id=? AND owner_id=? AND product=? AND project_id=? AND source_version=? AND content_hash=? FOR UPDATE',[user.tenantId,user.userId,dto.sourceProduct,source.id,source.version,hash]);
   const sourceId=rows[0]?.id||randomUUID();
   if(!rows.length)await db.query('INSERT INTO GcSource(id,tenant_id,owner_id,product,project_id,source_version,content_hash,document_gz) VALUES(?,?,?,?,?,?,?,?)',[sourceId,user.tenantId,user.userId,dto.sourceProduct,source.id,source.version,hash,gz]);
   const existing=await db.query('SELECT id,baseline FROM GcContract WHERE tenant_id=? AND owner_id=? AND source_id=? AND regime=? AND demo=? AND scenario_key=?',[user.tenantId,user.userId,sourceId,dto.regime,options.real?0:1,scenario||'LEGACY']);const match=existing.find((r:any)=>(parsed(r.baseline)?.demoScenario||null)===(scenario||null));if(match){if((options.real||scenario)&&captureFingerprint(parsed(match.baseline))!==captureFingerprint(baseline))throw new ConflictException('Já existe captura desta versão e cenário com parâmetros diferentes. Consulte o contrato existente.');return match.id;}
   const id=randomUUID();await db.query('INSERT INTO GcContract(id,tenant_id,owner_id,source_id,name,regime,demo,original_value,baseline,scenario_key) VALUES(?,?,?,?,?,?,?,?,?,?)',[id,user.tenantId,user.userId,sourceId,options.real?text(options.real.name,240):`Demonstração ${scenario?'analítica V3 ':''}${dto.regime==='UNIT_PRICE'?'unitária':'global'} — ${source.name}`.slice(0,240),dto.regime,options.real?0:1,originalValue,json(baseline),scenario||'LEGACY']);return id;
  });return this.detail(user,contractId);
 }
 async action(user:AuthenticatedUser,id:string,dto:ContractActionDto,importContext?:{id:string;hash:string}){
  if(dto.kind==='schedule-revision'&&!dto.previewHash)throw new BadRequestException('Confira a prévia da reprogramação antes de aprovar.');
  if(Buffer.byteLength(json(dto.payload))>512*1024)throw new BadRequestException('Operação muito grande.');const hash=digest({kind:dto.kind,payload:dto.payload});
  await this.db.transaction(async db=>{
   const row=await this.owned(db,user,id,true);if(this.access)await this.access.require(user,id,['measurement','difference-measurement','approve-measurement','cancel-measurement','progress','progress-items'].includes(dto.kind)?['MANAGER','FISCAL']:['MANAGER'],db);const prior=await db.query('SELECT request_hash,contract_id FROM GcAction WHERE id=? AND tenant_id=? AND owner_id=?',[dto.requestId,user.tenantId,row.owner_id||user.userId]);
   if(prior.length){if(prior[0].request_hash!==hash||prior[0].contract_id!==id)throw new ConflictException('Identificador já utilizado em outra operação.');return;}
   if(row.version!==dto.expectedVersion)throw new ConflictException('Contrato mudou em outra sessão. Atualize antes de confirmar.');
   if(dto.previewHash&&dto.previewHash!==this.previewDigest(user,id,row.version,dto.requestId,hash))throw new ConflictException('A prévia não corresponde à operação, versão ou responsável. Recalcule antes de confirmar.');
   let imported:any;
   if(importContext){const imports=await db.query('SELECT * FROM GcImport WHERE id=? AND tenant_id=? AND user_id=? AND expires_at>CURRENT_TIMESTAMP(3) FOR UPDATE',[importContext.id,user.tenantId,user.userId]);imported=imports[0];if(!imported||imported.mapping_hash!==importContext.hash||imported.confirmed_contract_id||parsed(imported.mapping)?.contractId!==id)throw new ConflictException('Prévia de medição mudou, expirou ou já foi utilizada.');}
   if(['revise-measurement','revise-record','delete-record'].includes(dto.kind)&&row.owner_id!==user.userId)throw new ForbiddenException('Somente o proprietário pode retificar medições.');
   if(['price-rule','price-batch'].includes(dto.kind)&&dto.payload.mode==='REEQUILIBRIUM')text(dto.payload.formalReference,1000);const view=await this.view(db,user,row);if(dto.kind==='approve-measurement'&&!row.demo&&row.owner_id!==user.userId&&view.measurements.find(m=>m.id===dto.payload.measurementId)?.createdBy===user.userId)throw new ForbiddenException('Somente o proprietário pode aprovar a própria medição em contrato real.');
   if(dto.kind==='metadata-enrichment'){const plan=await this.metadataPlan(user,row,view,db);if(plan.unresolved.length||digest(dto.payload)!==digest(plan.payload))throw new ConflictException('Metadados devem corresponder integralmente à conferência da fotografia.');}
   if(['revise-measurement','revise-record','delete-record'].includes(dto.kind))await this.revise(db,user,row,dto.payload,dto.requestId,dto.kind);else applyAction(view as any,dto.kind,dto.payload,dto.requestId);
   await db.query('INSERT INTO GcAction(id,contract_id,tenant_id,owner_id,actor_id,version,kind,payload,request_hash) VALUES(?,?,?,?,?,?,?,?,?)',[dto.requestId,id,user.tenantId,row.owner_id||user.userId,user.userId,row.version+1,dto.kind,json(dto.payload),hash]);
   if(this.db.retentionEnabled?.()) await db.query(historySql, historyValues(user,id,row.version+1,true));
   await db.query('UPDATE GcContract SET version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND tenant_id=? AND owner_id=? AND version=?',[id,user.tenantId,row.owner_id||user.userId,row.version]);
   if(imported){const priorFile=await db.query('SELECT id FROM GcAttachment WHERE contract_id=? AND tenant_id=? AND content_hash=?',[id,user.tenantId,imported.content_hash]);if(!priorFile.length)await db.query('INSERT INTO GcAttachment(id,contract_id,tenant_id,uploaded_by,file_name,media_type,size_bytes,content_hash,storage_key) VALUES(?,?,?,?,?,?,?,?,?)',[randomUUID(),id,user.tenantId,user.userId,imported.file_name,imported.media_type,imported.size_bytes,imported.content_hash,imported.original_storage_key]);await db.query('UPDATE GcImport SET confirmed_contract_id=?,confirmed_action_id=? WHERE id=? AND tenant_id=? AND user_id=?',[id,dto.requestId,importContext!.id,user.tenantId,user.userId]);await db.query('INSERT INTO GcAdministrativeAudit(id,contract_id,tenant_id,actor_id,kind,details) VALUES(?,?,?,?,?,?)',[randomUUID(),id,user.tenantId,user.userId,'measurement.import',json({importId:importContext!.id,measurementId:dto.requestId,mappingHash:importContext!.hash,fileHash:imported.content_hash,mapping:parsed(imported.mapping)})]);}
  });return this.detail(user,id);
 }
 async capacity(user:AuthenticatedUser){
  const rows=await this.db.query('SELECT COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0) AS bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  const count=await this.db.query('SELECT COUNT(*) AS total FROM GcContract WHERE tenant_id=? AND owner_id=?',[user.tenantId,user.userId]);return {bytes:String(rows[0].bytes),contracts:String(count[0].total),method:'MySQL data + indexes; hPanel physical quota may be higher',quotaBytes:'3221225472'};
 }
}

