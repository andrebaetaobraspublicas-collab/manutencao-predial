import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client';

export const RISK_ENGINE_VERSION = 'orcapro-risk-1.0.0';
export type RiskRow = { id: string; code: string; description: string; unit: string; qty: number; unitCostCents: string; directCents: string; abc: string };
export type RiskVariable = { id: string; selected: boolean; probability: number; min: number; mode: number; max: number; distribution: string; mean: number; sd: number; responsibility: string; type: string; justification: string };
export type RiskEvent = Omit<RiskVariable, 'type'|'selected'> & { description: string };
export type RiskConfig = { scope: string; iterations: number; seed: number; percentile: number; contract: string; quantityJustification: string; notes: string; variables: RiskVariable[]; events: RiskEvent[] };
const number = (v: unknown, min: number, max: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new BadRequestException('Parâmetro de risco fora do intervalo permitido.'); return v; };
const text = (v: unknown, max = 1000) => { if (typeof v !== 'string' || v.length > max) throw new BadRequestException('Texto de risco inválido.'); return v; };
const option = (v: unknown, values: string[]) => { if (typeof v !== 'string' || !values.includes(v)) throw new BadRequestException('Opção de risco inválida.'); return v; };
export function validateRiskConfig(value: unknown, rows: RiskRow[]): RiskConfig {
  const c = value as RiskConfig;
  if (!c || !Array.isArray(c.variables) || !Array.isArray(c.events) || c.variables.length > 1000 || c.events.length > 100) throw new BadRequestException('Modelo de riscos inválido.');
  const ids = new Set(rows.map(row => row.id)), seen = new Set<string>();
  const variable = (v: RiskVariable, event = false) => {
    if (!v || typeof v !== 'object') throw new BadRequestException('Variável de risco inválida.');
    const id = text(v.id,160);
    if (!/^[A-Za-z0-9_.:-]+$/.test(id) || seen.has(id) || (!event && !ids.has(id))) throw new BadRequestException('Variável de risco duplicada ou ausente na fotografia.');
    seen.add(id);
    const min = number(v.min,event ? 0 : -100,event ? 1e12 : 1000), mode = number(v.mode,min,event ? 1e12 : 1000), max = number(v.max,mode,event ? 1e12 : 1000);
    const distribution = option(v.distribution,['triangular','uniforme','pert','normal_truncada','lognormal','fixo']);
    const mean = number(v.mean,event ? 0 : -100,event ? 1e12 : 1000), sd = number(v.sd,0,event ? 1e12 : 1000);
    if (distribution === 'normal_truncada' && (mean < min || mean > max)) throw new BadRequestException('Média da normal deve estar entre mínimo e máximo.');
    if (distribution === 'lognormal' && mean <= 0) throw new BadRequestException('Lognormal exige média positiva.');
    return { id, probability:number(v.probability,0,100), min,mode,max,distribution,mean,sd,
      responsibility:option(v.responsibility,['contratado','compartilhado','administracao']), justification:text(v.justification) };
  };
  const variables = c.variables.map(v => { if (typeof v?.selected !== 'boolean') throw new BadRequestException('Seleção inválida.'); return { ...variable(v), selected:v.selected, type:option(v.type,['variacao_custo_unitario','variacao_quantitativo']) }; });
  const events = c.events.map(v => ({ ...variable(v as unknown as RiskVariable,true), description:text(v.description,300) }));
  const iterations = number(c.iterations,1000,100000), seed = number(c.seed,0,2147483647);
  if (!Number.isInteger(iterations) || !Number.isInteger(seed) || iterations * (variables.filter(v=>v.selected).length+events.length) > 10_000_000) throw new BadRequestException('Limite de 10 milhões de sorteios excedido. Reduza serviços ou iterações.');
  return { scope:option(c.scope,['A','AB','ALL']),iterations,seed,percentile:number(c.percentile,50,99),contract:option(c.contract,['global','preco_unitario']),
    quantityJustification:text(c.quantityJustification),notes:text(c.notes,4000),variables,events };
}
export function defaultRiskConfig(rows: RiskRow[]): RiskConfig {
  return { scope:'A',iterations:10000,seed:20261002,percentile:80,contract:'global',quantityJustification:'',notes:'',events:[],
    variables:rows.map(row=>({ id:row.id,selected:row.abc==='A',probability:100,min:-5,mode:5,max:10,distribution:'triangular',mean:5,sd:2.5,responsibility:'contratado',type:'variacao_custo_unitario',justification:'' })) };
}
export function classifyRows(rows: RiskRow[]): RiskRow[] {
  const result = [...rows].sort((a,b)=>Number(b.directCents)-Number(a.directCents));
  const total = result.reduce((v,row)=>v+BigInt(row.directCents),0n); let cumulative=0n;
  for (const row of result) { row.abc = total>0n && cumulative*100n<total*80n ? 'A' : total>0n && cumulative*100n<total*95n ? 'B' : 'C'; cumulative+=BigInt(row.directCents); }
  return result;
}
export const fingerprint = (referenceId:string,uf:string,regime:string,rows:RiskRow[]) => createHash('sha256').update(JSON.stringify({ referenceId,uf,regime,rows:[...rows].sort((a,b)=>a.id.localeCompare(b.id)) })).digest('hex');
export function simulationInput(config: RiskConfig, rows: RiskRow[]) {
  const byId = new Map(config.variables.map(v=>[v.id,v]));
  const services = rows.map(row=>{
    const v=byId.get(row.id), inScope=config.scope==='ALL' || row.abc==='A' || (config.scope==='AB' && row.abc==='B');
    return { id_risco_servico:row.id,descricao:row.description,quantidade:row.qty,custo_unitario:Number(row.unitCostCents)/100,valor_base:Number(row.directCents)/100,
      selecionado:v?.selected && inScope ? 1:0,incluir_contingencia:1,responsavel:v?.responsibility || 'contratado',tipo_risco:v?.type || 'variacao_custo_unitario',
      probabilidade:v?.probability ?? 0,minimo:v?.distribution==='fixo'?v.mode:v?.min ?? 0,mais_provavel:v?.mode ?? 0,maximo:v?.distribution==='fixo'?v.mode:v?.max ?? 0,distribuicao:v?.distribution || 'fixo',media:v?.mean ?? 0,desvio_padrao:v?.sd ?? 0 };
  });
  const events=config.events.map(v=>({ id_evento_risco:v.id,descricao:v.description,probabilidade:v.probability,incluir_contingencia:1,responsavel:v.responsibility,
    impacto_minimo:v.distribution==='fixo'?v.mode:v.min,impacto_mais_provavel:v.mode,impacto_maximo:v.distribution==='fixo'?v.mode:v.max,distribuicao_impacto:v.distribution,media:v.mean,desvio_padrao:v.sd,estrategia_mitigacao:v.justification }));
  // All fixed rows remain in the budget. Scope controls selection, never the denominator.
  return { analysis:{ metodo_escopo:'full',iteracoes:config.iterations,semente:config.seed,percentil_alvo:config.percentile,
    regime_execucao:config.contract,justificativa_variacao_quantidade:config.quantityJustification,incluir_eventos:1,incluir_quantitativos:1 },services,events };
}
export function exactContingency(target: number, baseCents: string) {
  if (!Number.isFinite(target) || target<0 || target*100>Number.MAX_SAFE_INTEGER) throw new BadRequestException('Resultado excede a precisão monetária permitida. Reduza os impactos do modelo.');
  const base = new Prisma.Decimal(baseCents);
  const targetCents = new Prisma.Decimal(target.toString()).mul(100).toDecimalPlaces(0,Prisma.Decimal.ROUND_HALF_UP);
  const contingency = Prisma.Decimal.max(0,targetCents.sub(base));
  return { contingencyCents:contingency.toFixed(0),rate:base.gt(0)?contingency.div(base).toFixed(10):'0',targetCents:targetCents.toFixed(0) };
}
