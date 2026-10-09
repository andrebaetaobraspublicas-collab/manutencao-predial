import { RawSinapi, REGIMES } from './orcapro-domain';
import { loadLegacyRuntime } from './legacy/legacy-runtime';

export type Difference = {
  kind: 'I'|'C'; code: string; status: 'ADDED'|'CHANGED'|'REMOVED'; globallyNew: boolean;
  description: string; unit: string; fields: string[];
  before: Record<string, string | number> | null; after: Record<string, string | number> | null;
  priceContexts: number; priceUfs: string[]; priceRegimes: string[];
  analyticChanges?: Array<{ item: string; before: string[]; after: string[] }>;
};
export type Comparison = {
  baseline: { id: string; label: string } | null;
  inputs: { added: number; changed: number; removed: number; globallyNew: number; priceChanged: number };
  compositions: { added: number; changed: number; removed: number; globallyNew: number; analyticChanged: number; priceChanged: number };
  items: Difference[];
};
const counters = () => ({ added: 0, changed: 0, removed: 0, globallyNew: 0 });
const origins = ['C', 'CR', '—'];
const inputFields = (r: RawSinapi, i: number) => ({ description: r.ins.d[i], unit: r.un[r.ins.u[i]], nature: r.cls[r.ins.k[i]], origin: origins[r.ins.o[i]] ?? '—' });
const compFields = (r: RawSinapi, i: number) => ({ description: r.comp.d[i], unit: r.un[r.comp.u[i]], group: r.grupos[r.comp.g[i]], situation: String(r.comp.s[i]), analyticItems: r.comp.it[i].length });
function analytic(r: RawSinapi, i: number) {
  const result = new Map<string, string[]>();
  for (const [code, coefficient] of r.comp.it[i]) {
    const key = `${code < 0 ? 'C' : 'I'}:${Math.abs(code)}`;
    const values = result.get(key) ?? []; values.push(coefficient.toFixed(12)); result.set(key, values);
  }
  for (const values of result.values()) values.sort();
  return result;
}
const changedFields = (a: Record<string,string|number>, b: Record<string,string|number>) => Object.keys(b).filter(key => a[key] !== b[key]);

/** Compare identities and analytical occurrences, independently of array order.
 * Prices are exact cents and always keep UF/regime; null never equals zero. */
export function compareSinapi(incoming: RawSinapi, previous: RawSinapi | null, baseline: Comparison['baseline'], knownInputs: Set<string>, knownCompositions: Set<string>): Comparison {
  const result: Comparison = { baseline, inputs: { ...counters(), priceChanged: 0 }, compositions: { ...counters(), analyticChanged: 0, priceChanged: 0 }, items: [] };
  const compositionPrices = new Map<string, { count: number; ufs: Set<string>; regimes: Set<string> }>();
  if (previous) {
    const runtime = loadLegacyRuntime(), a = new runtime.OP.sinapi.Base(previous), b = new runtime.OP.sinapi.Base(incoming);
    for (const regime of REGIMES) for (const uf of new Set([...previous.ufs, ...incoming.ufs])) {
      const ac = previous.ufs.includes(uf) ? a.costTable(uf, regime).cost : [], bc = incoming.ufs.includes(uf) ? b.costTable(uf, regime).cost : [];
      for (const code of incoming.comp.c) {
        const ai = a.compIdx.get(Number(code)), bi = b.compIdx.get(Number(code));
        if (ai === undefined || (ac[ai] ?? null) === (bc[bi] ?? null)) continue;
        const change = compositionPrices.get(String(code)) ?? { count: 0, ufs: new Set<string>(), regimes: new Set<string>() };
        change.count++; change.ufs.add(uf); change.regimes.add(regime); compositionPrices.set(String(code), change);
      }
    }
  }
  for (const kind of ['I','C'] as const) {
    const nextCodes = kind === 'I' ? incoming.ins.c : incoming.comp.c;
    const oldCodes = previous ? kind === 'I' ? previous.ins.c : previous.comp.c : [];
    const nextMap = new Map(nextCodes.map((code, i) => [String(code), i]));
    const oldMap = new Map(oldCodes.map((code, i) => [String(code), i]));
    const known = kind === 'I' ? knownInputs : knownCompositions;
    const summary = kind === 'I' ? result.inputs : result.compositions;
    for (const code of [...new Set([...nextMap.keys(), ...oldMap.keys()])].sort((a,b) => a.localeCompare(b, 'en', { numeric: true }))) {
      const ni = nextMap.get(code), oi = oldMap.get(code);
      const before = oi === undefined || !previous ? null : kind === 'I' ? inputFields(previous, oi) : compFields(previous, oi);
      const after = ni === undefined ? null : kind === 'I' ? inputFields(incoming, ni) : compFields(incoming, ni);
      const fields = before && after ? changedFields(before, after) : [];
      let priceContexts = 0;
      const priceUfs = new Set<string>(), priceRegimes = new Set<string>();
      let analyticChanges: Difference['analyticChanges'];
      if (before && after && previous && oi !== undefined && ni !== undefined) {
        if (kind === 'I') {
          for (const regime of REGIMES) {
            const a = regime === 'SD' ? previous.ins.p[oi] : previous.ins.lab[code]?.[regime] ?? previous.ins.p[oi];
            const b = regime === 'SD' ? incoming.ins.p[ni] : incoming.ins.lab[code]?.[regime] ?? incoming.ins.p[ni];
            for (const uf of new Set([...previous.ufs, ...incoming.ufs])) {
              if ((a?.[previous.ufs.indexOf(uf)] ?? null) !== (b?.[incoming.ufs.indexOf(uf)] ?? null)) {
                priceContexts++; priceUfs.add(uf); priceRegimes.add(regime);
              }
            }
          }
          if (priceContexts) { fields.push('prices'); result.inputs.priceChanged++; }
        } else {
          const prices = compositionPrices.get(code);
          if (prices) { priceContexts = prices.count; prices.ufs.forEach(uf => priceUfs.add(uf)); prices.regimes.forEach(rg => priceRegimes.add(rg)); fields.push('prices'); result.compositions.priceChanged++; }
          const a = analytic(previous, oi), b = analytic(incoming, ni);
          analyticChanges = [];
          for (const item of [...new Set([...a.keys(), ...b.keys()])].sort()) {
            const av = a.get(item) ?? [], bv = b.get(item) ?? [];
            if (JSON.stringify(av) !== JSON.stringify(bv)) analyticChanges.push({ item, before: av, after: bv });
          }
          if (analyticChanges.length) { fields.push('analytic'); result.compositions.analyticChanged++; }
        }
      }
      if (before && after && !fields.length) continue;
      const status = !before ? 'ADDED' : !after ? 'REMOVED' : 'CHANGED';
      summary[status === 'ADDED' ? 'added' : status === 'REMOVED' ? 'removed' : 'changed']++;
      const globallyNew = !!after && !known.has(code);
      if (globallyNew) summary.globallyNew++;
      result.items.push({ kind, code, status, globallyNew, description: String((after ?? before)!.description), unit: String((after ?? before)!.unit), fields, before, after, priceContexts, priceUfs: [...priceUfs].sort(), priceRegimes: [...priceRegimes], ...(analyticChanges?.length ? { analyticChanges } : {}) });
    }
  }
  return result;
}

export function comparisonSummary(comparison: Comparison) {
  const { items, ...summary } = comparison; return { ...summary, total: items.length };
}
export function differenceMatches(row: Difference, query: { kind?: string; status?: string; search?: string }) {
  return (!query.kind || row.kind === query.kind) && (!query.status || (query.status === 'NEW' ? row.globallyNew : row.status === query.status)) &&
    (!query.search || `${row.code} ${row.description}`.toLocaleLowerCase('pt-BR').includes(query.search.toLocaleLowerCase('pt-BR')));
}
const csvCell = (value: unknown) => {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"','""')}"`;
};
export function differencesCsv(items: Difference[]) {
  const rows: unknown[][] = [['Tipo','Código','Situação','Novo no catálogo','Descrição anterior','Descrição nova','Unidade anterior','Unidade nova','Cadastro anterior','Cadastro novo','Campos alterados','Contextos de preço alterados','UFs','Regimes','Alterações analíticas']];
  for (const item of items) rows.push([item.kind === 'I' ? 'Insumo' : 'Composição', item.code, item.status, item.globallyNew ? 'Sim' : 'Não', item.before?.description, item.after?.description, item.before?.unit, item.after?.unit, item.before ? JSON.stringify(item.before) : '', item.after ? JSON.stringify(item.after) : '', item.fields.join(', '), item.priceContexts, item.priceUfs.join(', '), item.priceRegimes.join(', '), item.analyticChanges ? JSON.stringify(item.analyticChanges) : '']);
  return '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
