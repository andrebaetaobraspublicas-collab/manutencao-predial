import { classifyRows, defaultRiskConfig, exactContingency, fingerprint, simulationInput, validateRiskConfig, type RiskRow } from './risk-core';
// The adapted stochastic engine is a installed JavaScript asset.
const engine = require('./assets/engine.cjs');
const rows = () => classifyRows([80000,15000,5000].map((cost,i)=>({id:'service-'+i,code:String(i+1),description:'Serviço '+i,unit:'UN',qty:1,unitCostCents:String(cost),directCents:String(cost),abc:''})));
const fixed = () => { const r=rows(),c=defaultRiskConfig(r);c.iterations=1000;for(const v of c.variables){v.min=v.mode=v.max=10;v.distribution='fixo';}return {r,c}; };
const simulate = (c:ReturnType<typeof defaultRiskConfig>,r:RiskRow[]) => { const input=simulationInput(validateRiskConfig(c,r),r);return {...engine.simulateMonteCarlo(input.analysis,input.services,input.events),tornado:engine.buildTornado(input.analysis,input.services,input.events),expected:engine.expectedMonetaryValue(input.analysis,input.services,input.events)}; };

describe('Riscos OrçaPro — regras e motor adaptado',()=>{
  it('conserva o orçamento completo e o denominador ao selecionar apenas A ou A+B',()=>{
    const {r,c}=fixed();expect(r.map(v=>v.abc)).toEqual(['A','B','C']);
    let result=simulate(c,r);expect(result.resumo.orcamento_base).toBe(1000);expect(result.resumo.p80).toBe(1080);expect(result.tornado.rows).toHaveLength(1);
    c.scope='AB';c.variables.forEach(v=>v.selected=true);result=simulate(c,r);expect(result.resumo.p80).toBe(1095);expect(result.tornado.rows).toHaveLength(2);
    c.scope='ALL';expect(simulate(c,r).resumo.p80).toBe(1100);
  });
  it('exclui Administração e quantitativos não justificados dos dois cálculos',()=>{
    const {r,c}=fixed();c.variables[0].responsibility='administracao';expect(simulate(c,r).resumo.p80).toBe(1000);expect(simulate(c,r).tornado.rows).toHaveLength(0);
    c.variables[0].responsibility='contratado';c.variables[0].type='variacao_quantitativo';c.contract='preco_unitario';expect(simulate(c,r).resumo.p80).toBe(1000);expect(simulate(c,r).tornado.rows).toHaveLength(0);
    c.quantityJustification='Risco contratualmente alocado';expect(simulate(c,r).resumo.p80).toBe(1080);expect(simulate(c,r).tornado.rows).toHaveLength(1);
  });
  it('mantém zero fixo como zero mesmo com outros extremos cadastrados',()=>{
    const {r,c}=fixed();c.variables[0].min=-5;c.variables[0].mode=0;c.variables[0].max=10;expect(simulate(c,r).resumo.p80).toBe(1000);expect(simulate(c,r).tornado.rows[0].amplitude).toBe(0);
  });
  it('reproduz exatamente uma simulação com a mesma semente',()=>{
    const r=rows(),c=defaultRiskConfig(r);c.iterations=1000;const a=simulate(c,r),b=simulate(c,r);expect(a.resumo).toEqual(b.resumo);expect(a.values).toEqual(b.values);c.seed++;expect(simulate(c,r).resumo.p80).not.toBe(a.resumo.p80);
  });
  it.each([0,0.5,1,20,100])('interpreta %s como porcentagem na ocorrência Bernoulli',p=>{
    const rng=engine.createRng(42);let count=0;for(let i=0;i<100000;i++)if(engine.sampleBernoulli(p,rng))count++;
    expect(Math.abs(count-p*1000)).toBeLessThanOrEqual(p===0||p===100?0:500);
  });
  it('combina evento em reais com variação percentual e explicita RMS dos VME',()=>{
    const {r,c}=fixed();c.events.push({id:'event-1',description:'Evento',probability:100,min:20,mode:20,max:20,distribution:'fixo',mean:20,sd:0,responsibility:'contratado',justification:'Independente'});
    const out=simulate(c,r);expect(out.resumo.p80).toBe(1100);expect(out.expected.contingencia_total).toBe(100);expect(out.expected.contingencia_rms).toBeCloseTo(Math.sqrt((80**2+20**2)/2));expect(out.tornado.rows).toHaveLength(2);
  });
  it('arredonda a contingência em centavos antes de obter a taxa, com Decimal',()=>{
    expect(exactContingency(1080.005,'100000')).toEqual({targetCents:'108001',contingencyCents:'8001',rate:'0.0800100000'});
    expect(exactContingency(900,'100000').contingencyCents).toBe('0');expect(()=>exactContingency(Infinity,'100000')).toThrow();
  });
  it('bloqueia dados inválidos, IDs estranhos e carga excessiva',()=>{
    const {r,c}=fixed();c.variables[0].id='foreign';expect(()=>validateRiskConfig(c,r)).toThrow(/ausente/);c.variables[0].id=r[0].id;c.variables[0].mode=NaN;expect(()=>validateRiskConfig(c,r)).toThrow();
    c.variables[0].mode=10;c.events=[null as never];expect(()=>validateRiskConfig(c,r)).toThrow();c.events=[];c.variables.push({...c.variables[0]});expect(()=>validateRiskConfig(c,r)).toThrow(/duplicada/);
    const many=Array.from({length:101},(_,i)=>({...r[0],id:'s-'+i})),cfg=defaultRiskConfig(many);cfg.iterations=100000;expect(()=>validateRiskConfig(cfg,many)).toThrow(/10 milhões/);
  });
  it('identifica mudanças de referência, UF, regime, quantidade e custo',()=>{
    const r=rows(),f=fingerprint('ref','SP','SD',r);expect(fingerprint('ref','SP','SD',[...r].reverse())).toBe(f);
    for(const context of [['other','SP','SD'],['ref','DF','SD'],['ref','SP','CD']])expect(fingerprint(context[0],context[1],context[2],r)).not.toBe(f);
    expect(fingerprint('ref','SP','SD',r.map((v,i)=>i===0?{...v,qty:2}:v))).not.toBe(f);
  });
});
