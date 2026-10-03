import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrcaproService } from './orcapro.service';
import { loadLegacyRuntime } from './legacy/legacy-runtime';
import { projectOfficialCodes, type JsonRecord } from './orcapro-domain';
import { classifyRows, defaultRiskConfig, exactContingency, fingerprint, RISK_ENGINE_VERSION, simulationInput, validateRiskConfig, type RiskRow } from './risks/risk-core';
import { RiskBdiDto } from './orcapro-risk.dto';

type Document = Record<string,any>;
const clone = (v: unknown): Document => JSON.parse(JSON.stringify(v));
@Injectable()
export class OrcaproRiskService {
  private running = new Set<string>();
  constructor(private readonly projects: OrcaproService, private readonly prisma: PrismaService) {}
  private rows(raw: Document, project: Document) {
    const runtime=loadLegacyRuntime(), calc=runtime.calculateProject(raw,project,{referenceId:project.sinapiReferenceId});
    const items=calc.model.items as Document[];
    if (!items.length || items.length>1000 || items.some(row=>row.unitCost==null || !Number.isSafeInteger(row.unitCost) || !Number.isSafeInteger(row.direct) || row.direct<0 || !Number.isFinite(row.qty) || row.qty<0)) throw new BadRequestException('A análise exige orçamento com 1 a 1.000 itens e custos preenchidos dentro da precisão permitida. Resolva as pendências de preço antes de criar a fotografia.');
    const rows=classifyRows(items.map(row=>({ id:row.id,code:String(row.node.code || ''),description:row.desc,unit:row.unit,qty:row.qty,
      unitCostCents:String(row.unitCost),directCents:String(row.direct),abc:'' })));
    const total=rows.reduce((sum,row)=>sum+BigInt(row.directCents),0n);
    if (total<=0n || total>BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestException('Custo direto deve ser positivo e estar dentro da precisão permitida.');
    return { rows,total:total.toString(),runtime,calc };
  }
  private module(data: Document) { return data.risks?.v===1 && Array.isArray(data.risks.analyses) ? data.risks : {v:1,analyses:[]}; }
  private analysis(data: Document, riskId:string) { const a=this.module(data).analyses.find((row:Document)=>row.id===riskId && !row.archivedAt); if(!a)throw new NotFoundException('Análise de riscos não encontrada.');return a as Document; }
  private checkVersion(actual:number,expected:number) { if(actual!==expected)throw new ConflictException('Orçamento alterado em outra sessão. Reabra antes de continuar.'); }
  private save(user:AuthenticatedUser,project:Document,data:Document,action:string,metadata:Document) {
    return this.projects.saveProject(user,project.id,{expectedVersion:project.version,data},false,{action,metadata});
  }
  async create(user:AuthenticatedUser,id:string,expectedVersion:number,name:string) {
    const context=await this.projects.projectContext(user,id);this.checkVersion(context.project.version,expectedVersion);
    const data=clone(context.project.data), source=this.rows(context.raw,data), module=this.module(data);
    if(module.analyses.length>=20)throw new BadRequestException('Limite de 20 análises por orçamento.');
    if(!name.trim())throw new BadRequestException('Nome da análise obrigatório.');
    const riskId=randomUUID();
    module.analyses.push({id:riskId,name:name.trim(),createdAt:new Date().toISOString(),engineVersion:RISK_ENGINE_VERSION,
      snapshot:{projectVersion:context.project.version,referenceId:context.project.referenceId,uf:context.project.uf,regime:context.project.regime,
        baseCents:source.total,fingerprint:fingerprint(context.project.referenceId,context.project.uf,context.project.regime,source.rows),rows:source.rows},
      config:defaultRiskConfig(source.rows),result:null,applications:[]});data.risks=module;
    return {project:await this.save(user,context.project,data,'risk.create',{riskId,sourceVersion:context.project.version}),riskId};
  }
  async configure(user:AuthenticatedUser,id:string,riskId:string,expectedVersion:number,value:unknown) {
    const project=await this.projects.project(user,id);this.checkVersion(project.version,expectedVersion);
    const data=clone(project.data),analysis=this.analysis(data,riskId), canonical=await this.canonical(id,analysis);
    analysis.config=validateRiskConfig(value,canonical.rows);analysis.result=null;analysis.updatedAt=new Date().toISOString();
    return {project:await this.save(user,project,data,'risk.configure',{riskId})};
  }
  private async canonical(id:string,analysis:Document) {
    if(!Number.isSafeInteger(analysis.snapshot?.projectVersion) || analysis.snapshot.projectVersion<1)throw new BadRequestException('Versão de origem da análise inválida.');
    const version=await this.prisma.orcaproProjectVersion.findUnique({where:{projectId_version:{projectId:id,version:analysis.snapshot?.projectVersion}}});
    if(!version)throw new BadRequestException('Versão de origem da análise indisponível.');
    const data=version.data as JsonRecord,codes=projectOfficialCodes(data);
    const graph=await this.projects.graph(version.referenceId,codes.compositions,codes.inputs,version.uf,version.regime,this.prisma,false,new Set(codes.optional));
    const source=this.rows(graph.raw,data);
    if(fingerprint(version.referenceId,version.uf,version.regime,source.rows)!==analysis.snapshot.fingerprint)throw new ConflictException('Fotografia da análise foi alterada. Crie uma nova análise.');
    return source;
  }
  private async run(key:string,config:unknown,rows:RiskRow[]) {
    const valid=validateRiskConfig(config,rows), input=simulationInput(valid,rows);
    const included=input.services.filter(v=>v.selecionado && v.responsavel!=='administracao' && (v.tipo_risco!=='variacao_quantitativo'||valid.contract!=='preco_unitario'||valid.quantityJustification.trim()));
    if(!included.length && !input.events.some(v=>v.responsavel!=='administracao'))throw new BadRequestException('Selecione ao menos um risco incluído no escopo ou cadastre um evento.');
    if(this.running.has(key)||this.running.size>=4)throw new ServiceUnavailableException('Simulação em andamento. Aguarde antes de iniciar outra.');
    this.running.add(key);
    try { return await new Promise<Document>((resolve,reject)=>{
      const worker=new Worker(join(__dirname,'risks/assets/worker.cjs'),{workerData:input,resourceLimits:{maxOldGenerationSizeMb:96}});
      let settled=false;
      const finish=(error:Error|null,value?:Document)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(value!);};
      const timer=setTimeout(()=>finish(new ServiceUnavailableException('A simulação excedeu 30 segundos. Reduza serviços ou iterações.')),30000);
      worker.once('message',value=>finish(value.error?new BadRequestException(value.error):null,value));
      worker.once('error',error=>finish(error));worker.once('exit',code=>{if(!settled)finish(new ServiceUnavailableException(`Simulação interrompida (${code}).`));});
    }); } finally {this.running.delete(key);}
  }
  private summarize(output:Document,baseCents:string) {
    const exact=exactContingency(output.summary.valor_percentil_alvo,baseCents);
    return { ...output,...exact,baseCents,engineVersion:RISK_ENGINE_VERSION,computedAt:new Date().toISOString(),
      assumptions:['Variáveis independentes; não há matriz de correlação.','Base: custo direto completo. Serviços fora do escopo permanecem fixos.','RMS é a raiz da média dos quadrados dos VME; indicador auxiliar, sem nível de confiança.'] };
  }
  async simulate(user:AuthenticatedUser,id:string,riskId:string,expectedVersion:number) {
    const project=await this.projects.project(user,id);this.checkVersion(project.version,expectedVersion);
    const data=clone(project.data),analysis=this.analysis(data,riskId),source=await this.canonical(id,analysis);
    analysis.config=validateRiskConfig(analysis.config,source.rows);
    analysis.result=this.summarize(await this.run(user.userId,analysis.config,source.rows),source.total);
    return {project:await this.save(user,project,data,'risk.simulate',{riskId,iterations:analysis.config.iterations,seed:analysis.config.seed,contingencyCents:analysis.result.contingencyCents})};
  }
  async bdi(user:AuthenticatedUser,id:string,riskId:string,dto:RiskBdiDto,apply=false) {
    const context=await this.projects.projectContext(user,id);this.checkVersion(context.project.version,dto.expectedVersion);
    const data=clone(context.project.data),analysis=this.analysis(data,riskId);
    if(!analysis.result)throw new BadRequestException('Execute e salve a simulação antes de aplicar ao BDI.');
    const current=this.rows(context.raw,data);
    if(fingerprint(context.project.referenceId,context.project.uf,context.project.regime,current.rows)!==analysis.snapshot.fingerprint)throw new ConflictException('Quantidades, custos ou referência mudaram. Crie uma nova análise para o orçamento atual.');
    // Never trust a rate submitted by the client or an edited project JSON.
    const result=this.summarize(await this.run(user.userId,analysis.config,current.rows),current.total), rate=Number(result.rate);
    const OP=current.runtime.OP,W=OP.bdiui;
    const previousCfg=clone(data.bdiCfg?.v===1?data.bdiCfg:W.defaultsFor(current.calc.model.tot)), cfg=clone(previousCfg);
    cfg.mode=dto.method;
    const key=dto.method==='exato'?'risco':'r',parameters=cfg[dto.method];
    const oldRisk=Number(parameters[key]||0);
    if(!Number.isFinite(oldRisk)||oldRisk<0||oldRisk>10)throw new BadRequestException('Parcela de risco anterior inválida.');
    if(dto.mode==='add' && oldRisk>0 && !dto.confirmDoubleCounting)throw new ConflictException('Já existe risco no BDI. Confirme expressamente a soma para evitar dupla contagem.');
    parameters[key]=dto.mode==='add'?oldRisk+rate:rate;
    const calculated=W.M[dto.method].calc(cfg),newBdi=W.valorAplicado(cfg,calculated.bdi);
    if(!Number.isFinite(newBdi)||newBdi<0||newBdi>10)throw new BadRequestException('BDI calculado inválido. Revise os parâmetros do menu BDI.');
    const previewData={...data,bdiCfg:cfg,bdi:newBdi};
    const newModel=current.runtime.calculateProject(context.raw,previewData,{referenceId:context.project.referenceId}).model;
    const preview={method:dto.method,mode:dto.mode,oldRisk,newRisk:parameters[key],rate:result.rate,contingencyCents:result.contingencyCents,
      oldBdi:Number(data.bdi),newBdi,oldPriceCents:String(current.calc.model.tot.price),newPriceCents:String(newModel.tot.price),differentiatedBdiPreserved:data.bdi2!=null};
    if(!apply)return preview;
    if(typeof dto.reason!=='string' || !dto.reason.trim())throw new BadRequestException('Informe a justificativa da aplicação ao BDI.');
    cfg.applied.p={mode:dto.method,metodo:W.LABEL[dto.method],ano:calculated.ano,bdi:calculated.bdi,valor:newBdi,ivaeq:calculated.ivaeq,date:Date.now(),
      rows:calculated.rows,eq:calculated.eq,memoria:calculated.memoria||[],riskAnalysisId:riskId};
    data.bdiCfg=cfg;data.bdi=newBdi;analysis.result=result;
    if(analysis.applications.length>=100)throw new BadRequestException('Limite de 100 aplicações por análise. Crie uma nova análise.');
    analysis.applications.push({...preview,id:randomUUID(),createdAt:new Date().toISOString(),reason:dto.reason.trim(),previousCfg});
    return {project:await this.save(user,context.project,data,'risk.bdi.apply',{riskId,...preview,reason:dto.reason.trim()}),preview};
  }
}
