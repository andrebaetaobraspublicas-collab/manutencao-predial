import { BadRequestException } from '@nestjs/common';

export const ORCAPRO_ENGINE_VERSION = 'orcaplan-1.8.3-cloud-v1';
export const REGIMES = ['SD', 'CD', 'SE'] as const;
export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
export type Regime = typeof REGIMES[number];
export type JsonRecord = Record<string, unknown>;
export type RawSinapi = {
  v: number; fonte: string; ref: string; emissao: string; ufs: string[];
  cidades?: string[]; encargos: JsonRecord; grupos: string[]; ct: string[]; cls: string[]; un: string[];
  ins: { c: Array<number|string>; k: number[]; d: string[]; u: number[]; o: number[];
    p: Array<Array<number|null>|null>; lab: Record<string, Partial<Record<Regime, Array<number|null>>>> };
  comp: { c: Array<number|string>; g: number[]; d: string[]; u: number[]; s: unknown[];
    it: Array<Array<[number, number]>> };
  [key: string]: unknown;
};

export function assertContext(uf: string, regime: string): asserts regime is Regime {
  if (!UFS.includes(uf) || !REGIMES.includes(regime as Regime)) throw new BadRequestException('UF ou regime SINAPI inválido.');
}
export function officialCode(value: unknown): string {
  const code = String(value ?? '').trim();
  if (!/^\d{1,12}$/.test(code)) throw new BadRequestException('Código oficial SINAPI inválido.');
  return code;
}
export function codeList(value: string | undefined, limit = 500): string[] {
  const codes = [...new Set((value ?? '').split(',').map(x => x.trim()).filter(Boolean))];
  if (codes.length > limit) throw new BadRequestException(`No máximo ${limit} códigos por consulta.`);
  return codes.map(officialCode);
}

// Decimal text -> exact scaled integer, half-up at the legacy coefficient scale (1e8).
export function scaledDecimal(value: string, scale: number, round = false): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new BadRequestException('Decimal não negativo inválido.');
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * 10n ** BigInt(scale) + BigInt((fraction.slice(0, scale).padEnd(scale, '0')) || '0');
  return result + (round && Number(fraction[scale] ?? '0') >= 5 ? 1n : 0n);
}
export function centsToAmount(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
export function mulTrunc(coefficient: string, cents: bigint): bigint {
  return scaledDecimal(coefficient, 8, true) * cents / 100_000_000n;
}

export type AnalyticNode = { code: string; items: Array<{ type: 'I'|'C'; code: string; coefficient: string }> };
export function validateAnalyticGraph(nodes: AnalyticNode[], inputCodes: Set<string>): void {
  const all = new Map(nodes.map(n => [n.code, n]));
  if (all.size !== nodes.length) throw new BadRequestException('Código de composição duplicado.');
  const state = new Map<string, number>();
  for (const seed of nodes) {
    if (state.get(seed.code) === 2) continue;
    const stack = [{ code: seed.code, position: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      state.set(frame.code, 1);
      const node = all.get(frame.code)!;
      if (frame.position >= node.items.length) { state.set(frame.code, 2); stack.pop(); continue; }
      const item = node.items[frame.position++];
      scaledDecimal(item.coefficient, 12);
      if (item.type === 'I') {
        if (!inputCodes.has(item.code)) throw new BadRequestException(`Insumo ${item.code} ausente no analítico ${node.code}.`);
      } else {
        if (!all.has(item.code)) throw new BadRequestException(`Subcomposição ${item.code} ausente.`);
        if (state.get(item.code) === 1) throw new BadRequestException(`Dependência circular na composição ${item.code}.`);
        if (state.get(item.code) !== 2) stack.push({ code: item.code, position: 0 });
      }
    }
  }
}

export function calculateAnalyticCosts(nodes: AnalyticNode[], prices: Map<string, bigint|null>): Map<string, bigint|null> {
  validateAnalyticGraph(nodes, new Set(prices.keys()));
  const all = new Map(nodes.map(n => [n.code, n]));
  const costs = new Map<string, bigint|null>();
  for (const seed of nodes) {
    const stack = [{ code: seed.code, position: 0, total: 0n, missing: false }];
    while (stack.length) {
      const f = stack[stack.length - 1];
      if (costs.has(f.code)) { stack.pop(); continue; }
      const node = all.get(f.code)!;
      if (f.position >= node.items.length) {
        costs.set(f.code, f.missing || !node.items.length ? null : f.total); stack.pop(); continue;
      }
      const item = node.items[f.position];
      if (scaledDecimal(item.coefficient, 12) === 0n) { f.position++; continue; }
      if (item.type === 'C' && !costs.has(item.code)) { stack.push({ code: item.code, position: 0, total: 0n, missing: false }); continue; }
      const price = item.type === 'I' ? prices.get(item.code) : costs.get(item.code);
      if (price == null) f.missing = true;
      else f.total += mulTrunc(item.coefficient, price);
      f.position++;
    }
  }
  return costs;
}

export function validateRawSinapi(value: unknown): RawSinapi {
  const raw = value as RawSinapi;
  if (!raw || typeof raw !== 'object' || !raw.ins || !raw.comp) throw new BadRequestException('Base SINAPI raw inválida.');
  if (!/^\d{2}\/\d{4}$/.test(raw.ref)) throw new BadRequestException('Referência deve ter formato MM/AAAA.');
  const month = Number(raw.ref.slice(0, 2));
  if (month < 1 || month > 12) throw new BadRequestException('Mês inválido.');
  for (const key of ['ufs','grupos','ct','cls','un'] as const) if (!Array.isArray(raw[key])) throw new BadRequestException(`Vetor ${key} ausente.`);
  for (const key of ['grupos','ct','cls','un'] as const) if (raw[key].some(v => typeof v !== 'string' || v.length > 500)) throw new BadRequestException(`Metadado ${key} inválido.`);
  if (!raw.ufs.length || raw.ufs.length > 27 || new Set(raw.ufs).size !== raw.ufs.length) throw new BadRequestException('Lista de UFs inválida.');
  raw.ufs.forEach(uf => assertContext(uf, 'SD'));
  const nI = raw.ins.c?.length, nC = raw.comp.c?.length;
  if (!nI || !nC || nI > 100_000 || nC > 100_000) throw new BadRequestException('Quantidade de registros inválida.');
  for (const key of ['k','d','u','o','p'] as const) if (!Array.isArray(raw.ins[key]) || raw.ins[key].length !== nI) throw new BadRequestException(`Vetor de insumos ${key} incompatível.`);
  for (const key of ['g','d','u','s','it'] as const) if (!Array.isArray(raw.comp[key]) || raw.comp[key].length !== nC) throw new BadRequestException(`Vetor de composições ${key} incompatível.`);
  const inputs = new Set(raw.ins.c.map(officialCode));
  if (inputs.size !== nI) throw new BadRequestException('Insumo duplicado.');
  const validatePrices = (arr: Array<number|null>) => {
    if (!Array.isArray(arr) || arr.length !== raw.ufs.length || arr.some(v => v !== null && (!Number.isSafeInteger(v) || Number(v) < 0))) throw new BadRequestException('Preço em centavos inválido.');
  };
  raw.ins.p.forEach(arr => { if (arr !== null) validatePrices(arr); });
  if (!raw.ins.lab || typeof raw.ins.lab !== 'object') throw new BadRequestException('Preços por regime ausentes.');
  Object.entries(raw.ins.lab).forEach(([code, regimes]) => {
    if (!inputs.has(code) || !regimes || typeof regimes !== 'object') throw new BadRequestException('Preço de mão de obra órfão.');
    Object.entries(regimes).forEach(([regime, arr]) => { if (!REGIMES.includes(regime as Regime)) throw new BadRequestException('Regime de mão de obra inválido.'); validatePrices(arr!); });
  });
  let itemCount = 0;
  const nodes = raw.comp.c.map((c, i): AnalyticNode => {
    if (!Array.isArray(raw.comp.it[i])) throw new BadRequestException('Analítico inválido.');
    itemCount += raw.comp.it[i].length;
    return { code: officialCode(c), items: raw.comp.it[i].map(x => {
      if (!Array.isArray(x) || x.length !== 2 || !Number.isSafeInteger(x[0]) || !x[0] || !Number.isFinite(x[1]) || x[1] < 0 || x[1] > 1e10) throw new BadRequestException('Item analítico inválido.');
      return { type: x[0] < 0 ? 'C' : 'I', code: officialCode(Math.abs(x[0])), coefficient: x[1].toFixed(12) };
    }) };
  });
  if (itemCount > 1_000_000) throw new BadRequestException('Base excede limite de linhas analíticas.');
  raw.ins.c.forEach((_, i) => {
    if (typeof raw.ins.d[i] !== 'string' || !raw.ins.d[i].trim() || raw.ins.d[i].length > 10000 || !raw.un[raw.ins.u[i]] || raw.cls[raw.ins.k[i]] === undefined) throw new BadRequestException('Metadado de insumo inválido.');
  });
  raw.comp.c.forEach((_, i) => {
    if (typeof raw.comp.d[i] !== 'string' || !raw.comp.d[i].trim() || raw.comp.d[i].length > 10000 || !raw.un[raw.comp.u[i]] || raw.grupos[raw.comp.g[i]] === undefined) throw new BadRequestException('Metadado de composição inválido.');
  });
  if (raw.ovr && Object.values(raw.ovr as JsonRecord).some(v => v && typeof v === 'object' && Object.keys(v).length)) throw new BadRequestException('Overrides oficiais exigem importador versionado específico; importação recusada.');
  validateAnalyticGraph(nodes, inputs);
  return raw;
}

export function validateProjectData(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Documento de projeto inválido.');
  const data = value as JsonRecord;
  for (const key of ['raw','base','bases','sinapi','sinapiCatalog']) if (key in data) throw new BadRequestException('O catálogo SINAPI não pode ser duplicado no projeto.');
  const encoded = JSON.stringify(data);
  if (Buffer.byteLength(encoded, 'utf8') > 15 * 1024 * 1024) throw new BadRequestException('Projeto excede limite de 15 MiB.');
  let visited = 0;
  const stack: Array<{ v: unknown; depth: number }> = [{ v: data, depth: 0 }];
  while (stack.length) {
    const { v, depth } = stack.pop()!;
    if (++visited > 250_000 || depth > 80) throw new BadRequestException('Projeto excede complexidade permitida.');
    if (typeof v === 'number' && !Number.isFinite(v)) throw new BadRequestException('Número não finito no projeto.');
    if (v && typeof v === 'object') for (const [key, child] of Object.entries(v)) {
      if (['__proto__','prototype','constructor'].includes(key)) throw new BadRequestException('Chave JSON inválida.');
      // The preserved interface interpolates identifiers into data-* attributes.
      // Reject attribute-breaking identifiers at the authoritative persistence boundary.
      if ((key === 'id' || /(?:Id|_id)$/.test(key)) && child != null && (typeof child !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(child))) throw new BadRequestException('Identificador do documento inválido.');
      if (['revision','rev'].includes(key) && (typeof child !== 'number' || !Number.isSafeInteger(child) || child < 0 || child > 1000000)) throw new BadRequestException('Número de revisão inválido.');
      if (key === 'links') {
        if (!Array.isArray(child) || child.length > 50000 || child.some(link => !link || typeof link !== 'object' || ['from','to'].some(endpoint => typeof link[endpoint] !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(link[endpoint])))) throw new BadRequestException('Identificador de vínculo inválido.');
      }
      stack.push({ v: child, depth: depth + 1 });
    }
  }
  const catalog = data.catalog as JsonRecord | undefined;
  if (catalog) {
    for (const [key, prefix] of [['inputs','IP-'],['compositions','CP-']] as const) {
      const entries = catalog[key];
      if (entries !== undefined && (!Array.isArray(entries) || entries.length > 10000 || entries.some((e: JsonRecord) => !String(e.code ?? '').startsWith(prefix)))) throw new BadRequestException('Snapshot deve conter somente cadastros próprios IP-/CP-.');
    }
    const ownComps = (catalog.compositions ?? []) as JsonRecord[];
    const ownInputs = (catalog.inputs ?? []) as JsonRecord[];
    for (const record of [...ownInputs,...ownComps]) {
      if (!/^(CP|IP)-[A-Z0-9_-]{1,54}$/.test(String(record.code)) || !String(record.desc ?? '').trim() || String(record.desc).length > 10000 || !String(record.unit ?? '').trim() || String(record.unit).length > 40) throw new BadRequestException('Código, descrição e unidade do cadastro próprio inválidos.');
    }
    for (const input of ownInputs) {
      if (!Array.isArray(input.prices) || input.prices.length > 300) throw new BadRequestException('Tabela de preços próprios inválida.');
      for (const row of input.prices as JsonRecord[]) {
        if (row.uf !== '*' && !UFS.includes(String(row.uf))) throw new BadRequestException('UF de preço próprio inválida.');
        if (row.ref && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(row.ref))) throw new BadRequestException('Referência de preço próprio inválida.');
        for (const key of ['base','sd','cd','se']) if (row[key] != null && (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || Number(row[key]) < 0 || Number(row[key]) > 1e12)) throw new BadRequestException('Preço próprio inválido.');
      }
    }
    const customNodes: AnalyticNode[] = ownComps.map(c => {
      if (c.mode && !['analytic','quoted'].includes(String(c.mode))) throw new BadRequestException('Modo de composição próprio inválido.');
      if (c.mode === 'quoted' && (typeof c.quote !== 'number' || !Number.isFinite(c.quote) || c.quote < 0 || c.quote > 1e12)) throw new BadRequestException('Cotação da composição inválida.');
      if (!Array.isArray(c.items) || c.items.length > 10000) throw new BadRequestException('Analítico próprio inválido.');
      return { code: String(c.code), items: (c.items as JsonRecord[]).map(x => {
        if (!['I','C'].includes(String(x.type)) || typeof x.coef !== 'number' || !Number.isFinite(x.coef) || x.coef < 0 || x.coef > 1e10 || !/^(\d{1,12}|CP-[A-Z0-9_-]{1,54}|IP-[A-Z0-9_-]{1,54})$/.test(String(x.code))) throw new BadRequestException('Componente próprio inválido.');
        return { type: x.type as 'I'|'C', code: String(x.code), coefficient: x.coef.toFixed(12) };
      }) };
    });
    const externalComps = new Set(customNodes.flatMap(n => n.items.filter(x => x.type === 'C' && !x.code.startsWith('CP-')).map(x => x.code)));
    const allInputs = new Set([...ownInputs.map(i => String(i.code)), ...customNodes.flatMap(n => n.items.filter(x => x.type === 'I' && !x.code.startsWith('IP-')).map(x => x.code))]);
    validateAnalyticGraph([...customNodes, ...[...externalComps].map(code => ({ code, items: [] }))], allInputs);
  }
  if (!data.root || typeof data.root !== 'object' || (data.root as JsonRecord).kind !== 'stage') throw new BadRequestException('EAP raiz inválida.');
  const ids = new Set<string>();
  const nodes = [data.root as JsonRecord];
  while (nodes.length) {
    const node = nodes.pop()!;
    const id = String(node.id ?? '');
    if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(id) || ids.has(id)) throw new BadRequestException('IDs da EAP ausentes, inválidos ou duplicados.');
    ids.add(id);
    if (node.kind === 'stage') {
      if (!Array.isArray(node.children)) throw new BadRequestException('Etapa sem filhos.');
      nodes.push(...node.children as JsonRecord[]);
    } else if (node.kind === 'item') {
      if (typeof node.qty !== 'number' || !Number.isFinite(node.qty) || node.qty < 0) throw new BadRequestException('Quantidade inválida.');
      if (node.code != null && !/^(\d{1,12}|CP-[\w.-]+|IP-[\w.-]+)$/.test(String(node.code))) {
        // The original example also includes direct quotations and codes from other bases.
        if (typeof node.custo !== 'number' || !Number.isFinite(node.custo) || node.custo < 0 || !String(node.desc ?? '').trim() || !/^[\w. -]{0,60}$/.test(String(node.code))) throw new BadRequestException('Item de outra base/cotação exige custo e descrição explícitos.');
      }
    } else throw new BadRequestException('Tipo de nó inválido na EAP.');
  }
  return JSON.parse(encoded) as JsonRecord;
}

export function projectOfficialCodes(project: JsonRecord): { compositions: string[]; inputs: string[]; optional: string[] } {
  const comps = new Set<string>(), inputs = new Set<string>(), optional = new Set<string>();
  const nodes = [project.root as JsonRecord];
  while (nodes.length) {
    const n = nodes.pop()!;
    if (n.kind === 'stage') nodes.push(...(n.children as JsonRecord[]));
    else if (/^\d+$/.test(String(n.code ?? ''))) {
      // Other-base quotations retain their original code but never become SINAPI records by coincidence.
      if (n.fonte && !String(n.fonte).toUpperCase().includes('SINAPI')) continue;
      const code = String(n.code); (n.resourceType === 'I' ? inputs : comps).add(code);
      if (typeof n.custo === 'number' && Number.isFinite(n.custo) && n.custo >= 0 && String(n.desc ?? '').trim()) optional.add(code);
    }
  }
  const catalog = project.catalog as JsonRecord | undefined;
  for (const comp of (catalog?.compositions ?? []) as JsonRecord[]) for (const x of (comp.items ?? []) as JsonRecord[]) {
    if (/^\d+$/.test(String(x.code))) (x.type === 'I' ? inputs : comps).add(String(x.code));
  }
  return { compositions: [...comps], inputs: [...inputs], optional: [...optional] };
}
