import { RawSinapi, validateRawSinapi } from './orcapro-domain';
import { compareSinapi, comparisonSummary, differenceMatches, differencesCsv } from './orcapro-import-comparison';
import { loadLegacyRuntime } from './legacy/legacy-runtime';
import { protectLegacyXlsx } from './orcapro-upload';
import { sinapiWorkbookFixture } from './sinapi-workbook.fixture';

function base(): RawSinapi {
  return { v: 1, fonte: 'SINAPI', ref: '08/2036', emissao: '', ufs: ['SP','DF'], encargos: {}, ct: [''], grupos: ['Grupo'], cls: ['MATERIAL','MAO DE OBRA'], un: ['KG','H'],
    ins: { c: [1,2], k: [0,1], d: ['Material','Operário'], u: [0,1], o: [0,0], p: [[100,null],[1000,2000]], lab: { '2': { CD: [800,1600], SE: [600,1200] } } },
    comp: { c: [10,20], g: [0,0], d: ['Serviço','Auxiliar'], u: [0,0], s: [0,0], it: [[[1,2],[2,0.5]],[[-10,1]]] } };
}
function compare(next: RawSinapi, old = base(), known = new Set(['1','2'])) { return compareSinapi(next, old, { id: 'baseline', label: old.ref }, known, new Set(['10','20'])); }

describe('SINAPI import comparison and real XLSX reader', () => {
  it('decodes UTF-8 workbook entries and imports an official-layout Excel inside the isolated runtime', async () => {
    const runtime = loadLegacyRuntime(), file = await sinapiWorkbookFixture();
    protectLegacyXlsx(runtime, file);
    const phases: number[] = [];
    const raw = validateRawSinapi(await runtime.OP.sinapi.importXlsx(new Blob([new Uint8Array(file)]), (_phase: string,p: number) => phases.push(p)));
    expect(raw.ref).toBe('09/2036'); expect(raw.ins.d).toEqual(['Aço — material de teste']);
    expect(raw.ins.p).toEqual([[10000,20000]]); expect(raw.comp.it).toEqual([[[991001,2]]]);
    expect(raw.valid).toMatchObject({ total: 2, ok: 2 }); expect(phases.at(-1)).toBe(1);
  });
  it('ignores UF, dictionary and analytical occurrence ordering without changing historical arrays', () => {
    const old = base(), next = structuredClone(old), frozen = JSON.stringify(old);
    next.ref = '09/2036'; next.ufs.reverse(); next.ins.p.forEach(values => values?.reverse());
    Object.values(next.ins.lab).forEach(prices => Object.values(prices).forEach(values => values?.reverse()));
    next.comp.it[0].reverse();
    const result = compare(next,old); expect(result.items).toEqual([]); expect(JSON.stringify(old)).toBe(frozen);
  });
  it('distinguishes absent from zero prices, preserves each regime, and detects propagated composition costs', () => {
    const next = base(); next.ins.p[0]![1] = 0;
    const result = compare(next);
    expect(result.inputs.priceChanged).toBe(1); expect(result.compositions.priceChanged).toBe(2);
    expect(result.compositions.analyticChanged).toBe(0);
    const input = result.items.find(row => row.kind === 'I')!;
    expect(input.priceContexts).toBe(3); expect(input.priceUfs).toEqual(['DF']); expect(input.priceRegimes).toEqual(['SD','CD','SE']);
  });
  it('counts a new identity separately from a reintroduced identity and retains removed historical records', () => {
    const old = base(), next = base();
    next.ins.c.push(3,4); next.ins.k.push(0,0); next.ins.d.push('Novo','Reintroduzido'); next.ins.u.push(0,0); next.ins.o.push(0,0); next.ins.p.push([200,300],[200,300]);
    next.comp.c.pop(); next.comp.d.pop(); next.comp.g.pop(); next.comp.u.pop(); next.comp.s.pop(); next.comp.it.pop();
    const result = compare(next, old, new Set(['1','2','4']));
    expect(result.inputs).toMatchObject({ added: 2, globallyNew: 1 }); expect(result.compositions.removed).toBe(1);
    expect(result.items.find(row => row.code === '4')).toMatchObject({ globallyNew: false, status: 'ADDED' });
    expect(result.items.find(row => row.code === '20')).toMatchObject({ after: null, status: 'REMOVED' }); expect(old.comp.c).toEqual([10,20]);
  });
  it('finds coefficients and duplicate analytical occurrence changes even with equal total cost', () => {
    const next = base(); next.comp.it[0] = [[1,1],[1,1],[2,0.5]];
    const result = compare(next); expect(result.compositions.analyticChanged).toBe(1);
    expect(result.items.find(row => row.code === '10')?.analyticChanges).toEqual([{ item: 'I:1', before: ['2.000000000000'], after: ['1.000000000000','1.000000000000'] }]);
    expect(result.compositions.priceChanged).toBe(0);
  });
  it('detects descriptions/units/classification without pretending a new identity exists', () => {
    const next = base(); next.ins.d[0] = 'Material revisto'; next.ins.k[0] = 1; next.ins.u[0] = 1;
    const result = compare(next); expect(result.inputs.globallyNew).toBe(0);
    expect(result.items.find(row => row.kind === 'I')?.fields).toEqual(['description','unit','nature']);
  });
  it('supports first import, safe CSV, search and a summary without the full item list', () => {
    const next = base(); next.ins.d[0] = '=HYPERLINK("unsafe")';
    const result = compareSinapi(next,null,null,new Set(),new Set());
    expect(result.inputs.globallyNew).toBe(2); expect(comparisonSummary(result)).not.toHaveProperty('items');
    expect(differenceMatches(result.items[0],{ kind: 'I',status: 'NEW',search: 'hyperlink' })).toBe(true);
    expect(differencesCsv(result.items)).toContain('"\'=HYPERLINK');
    expect(differencesCsv(result.items)).toContain('Cadastro anterior');
  });
});
