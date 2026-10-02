import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertContext, calculateAnalyticCosts, mulTrunc, RawSinapi, scaledDecimal, validateAnalyticGraph, validateProjectData, validateRawSinapi } from './orcapro-domain';
import { loadLegacyRuntime } from './legacy/legacy-runtime';

const fixtureRoot = resolve(__dirname,'../../../../../legacy/orcaplan-1.8.3');
const raw = JSON.parse(readFileSync(resolve(fixtureRoot,'sinapi-2026-08.raw.json'),'utf8')) as RawSinapi;
const stage = { id: 'root',kind: 'stage',children: [] };

describe('OrçaPro global SINAPI invariants', () => {
  it('validates the actual global source, including absent price vectors', () => {
    expect(validateRawSinapi(raw).comp.c).toHaveLength(10547);
    expect(raw.ins.p.filter(p => p === null)).toHaveLength(1244);
  });
  it('calculates exact scaled cents and truncates each analytical occurrence', () => {
    expect(mulTrunc('0.123456785000',100000000n)).toBe(12345679n);
    expect(scaledDecimal('999999999999.999999',6)).toBe(999999999999999999n);
    const result = calculateAnalyticCosts([{ code: '10',items: [{ type: 'I',code: '1',coefficient: '0.3' },{ type: 'I',code: '1',coefficient: '0.3' }] },{ code: '20',items: [{ type: 'C',code: '10',coefficient: '1.5' }] }],new Map([['1',101n]]));
    expect(result.get('10')).toBe(60n); expect(result.get('20')).toBe(90n);
  });
  it('distinguishes zero, absent prices and zero coefficients', () => {
    const nodes = [{ code: '1',items: [{ type: 'I' as const,code: '2',coefficient: '1' }] }];
    expect(calculateAnalyticCosts(nodes,new Map([['2',0n]])).get('1')).toBe(0n);
    expect(calculateAnalyticCosts(nodes,new Map([['2',null]])).get('1')).toBeNull();
    nodes[0].items[0].coefficient = '0';
    expect(calculateAnalyticCosts(nodes,new Map([['2',null]])).get('1')).toBe(0n);
  });
  it('rejects circular, dangling, negative and invalid-context graphs', () => {
    expect(() => validateAnalyticGraph([{ code: '1',items: [{ type: 'C',code: '2',coefficient: '1' }] },{ code: '2',items: [{ type: 'C',code: '1',coefficient: '1' }] }],new Set())).toThrow(/circular/);
    expect(() => validateAnalyticGraph([{ code: '1',items: [{ type: 'I',code: '2',coefficient: '1' }] }],new Set())).toThrow(/ausente/);
    expect(() => mulTrunc('-1',100n)).toThrow(); expect(() => assertContext('XX','SD')).toThrow(); expect(() => assertContext('SP','OTHER')).toThrow();
  });
  it.each([['SP','SD'],['DF','SD'],['SP','CD'],['DF','CD'],['SP','SE']] as const)('matches all 10,547 original compositions for %s/%s', (uf,regime) => {
    const base = loadLegacyRuntime().createBase(raw,'fixed-reference');
    const ui = raw.ufs.indexOf(uf), sp = raw.ufs.indexOf('SP');
    const prices = new Map(raw.ins.c.map((code,i) => {
      const values = regime === 'SD' ? raw.ins.p[i] : raw.ins.lab[String(code)]?.[regime] ?? raw.ins.p[i];
      const price = values?.[ui] ?? values?.[sp] ?? null;
      return [String(code),price == null ? null : BigInt(price)] as const;
    }));
    const nodes = raw.comp.c.map((code,i) => ({ code: String(code),items: raw.comp.it[i].map(x => ({ type: x[0] > 0 ? 'I' as const : 'C' as const,code: String(Math.abs(x[0])),coefficient: x[1].toFixed(12) })) }));
    const result = calculateAnalyticCosts(nodes,prices), original = base.costTable(uf,regime).cost;
    expect(nodes.map((n,i) => [n.code,result.get(n.code)?.toString() ?? null])).toEqual(nodes.map((n,i) => [n.code,original[i] == null ? null : String(original[i])]));
  },30000);
});

describe('OrçaPro private document validation', () => {
  it.each(['demo','edificio'])('preserves every private field of %s without duplicating the global catalogue',(key) => {
    const project = JSON.parse(readFileSync(resolve(fixtureRoot,`fixtures/${key}.project.json`),'utf8'));
    expect(validateProjectData(project)).toEqual(project);
  });
  it('rejects an official catalogue copied into a project and unsafe JSON keys',() => {
    expect(() => validateProjectData({ root: stage,raw })).toThrow(/duplicado/);
    expect(() => validateProjectData(JSON.parse('{"root":{"id":"root","kind":"stage","children":[]},"__proto__":{}}'))).toThrow(/Chave JSON/);
    expect(() => validateProjectData({ root: stage,catalog: { compositions: [{ code: '94964' }] } })).toThrow(/somente/);
  });
  it('rejects own composition cycles and accepts small coefficients used by the original engine',() => {
    const a = { code: 'CP-A',desc: 'A',unit: 'UN',items: [{ type: 'C',code: 'CP-B',coef: 1 }] };
    const b = { code: 'CP-B',desc: 'B',unit: 'UN',items: [{ type: 'C',code: 'CP-A',coef: 1 }] };
    expect(() => validateProjectData({ root: stage,catalog: { compositions: [a,b] } })).toThrow(/circular/);
    a.items = [{ type: 'I',code: '100',coef: 0.0000001 }];
    expect(validateProjectData({ root: stage,catalog: { compositions: [a],inputs: [] } })).toHaveProperty('catalog');
  });
  it('rejects attribute-breaking identifiers and nonnumeric revision history before the preserved editor can render them',() => {
    expect(() => validateProjectData({ root: { ...stage,id: 'root\" onclick=\"alert(1)' } })).toThrow(/Identificador/);
    expect(() => validateProjectData({ root: stage,evt: { events: [{ id: '\"><img src=x onerror=alert(1)>' }] } })).toThrow(/Identificador/);
    expect(() => validateProjectData({ root: stage,links: [{ from: 'a\" onclick=\"alert(1)',to: 'root' }] })).toThrow(/vínculo/);
    expect(() => validateProjectData({ root: stage,catalog: { compositions: [{ code: 'CP-A',desc: 'A',unit: 'UN',revision: '<img>',items: [] }] } })).toThrow(/revisão/);
    expect(() => validateProjectData({ root: stage,catalog: { compositions: [{ code: 'CP-A',desc: 'A',unit: 'UN',revision: 1,history: [{ rev: '<img>' }],items: [] }] } })).toThrow(/revisão/);
  });
});
