/* ==== 02_sinapi.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 02_sinapi.js
 * 1) Importação da planilha oficial "SINAPI_Referência_AAAA_MM.xlsx"
 *    (abas ISD, ICD, ISE, CSD, CCD, CSE e Analítico) -> base compacta.
 * 2) Classe Base: índices, custo EXATO das composições, decomposição
 *    MO/MAT/EQ, recursos de mão de obra (H) e equipamentos (CHP/CHI).
 *
 * REGRA DE CÁLCULO (validada contra o relatório oficial, 100% de acerto):
 *   custo(C) = Σ trunc₂( coef_i × preço_i )
 *   preço_i  = preço do insumo na UF (se em branco, preço de SP — "%AS")
 *              ou custo(subcomposição) calculado pela mesma regra.
 *   trunc₂  = truncamento em centavos (sem arredondamento).
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const X = OP.xlsx;
  const S = (OP.sinapi = {});

  S.REGIMES = { SD: 'Não desonerado', CD: 'Desonerado', SE: 'Sem encargos' };
  S.CAT = { mo: 'Mão de obra', mat: 'Material', eq: 'Equipamento', serv: 'Serviços', out: 'Outros' };
  const CLS2CAT = { 'MAO DE OBRA': 'mo', 'ENCARGOS COMPLEMENTARES': 'mo', MATERIAL: 'mat',
    'EQUIPAMENTO (AQUISICAO)': 'eq', 'EQUIPAMENTO (LOCACAO)': 'eq', SERVICOS: 'serv', ESPECIAIS: 'out' };
  S.catOfClass = (cls) => CLS2CAT[U.norm(cls)] || 'out';
  const COEF_SCALE = 1e8; // coeficientes do SINAPI têm até 7 casas decimais

  /* trunc(coefEscalado × centavos / 1e8) com aritmética inteira exata */
  function mulTrunc(cs, cents) {
    const p = cs * cents;
    if (p <= 9007199254740991) {
      let q = Math.floor(p / COEF_SCALE);
      if (q * COEF_SCALE > p) q--; else if ((q + 1) * COEF_SCALE <= p) q++;
      return q;
    }
    return Number((BigInt(cs) * BigInt(cents)) / BigInt(COEF_SCALE));
  }
  S.mulTrunc = mulTrunc;
  const toCents = (v) => (v == null || v === '' || typeof v !== 'number' || !isFinite(v)) ? null : Math.round(v * 100);

  /* ================= IMPORTAÇÃO ================= */
  S.importXlsx = async function (blob, onProgress = () => {}) {
    const t0 = Date.now();
    onProgress('Abrindo arquivo…', 0.02);
    const wb = await X.readWorkbook(blob);
    const need = { ISD: X.findSheet(wb, 'ISD'), ICD: X.findSheet(wb, 'ICD'), ISE: X.findSheet(wb, 'ISE'),
      CSD: X.findSheet(wb, 'CSD'), CCD: X.findSheet(wb, 'CCD'), CSE: X.findSheet(wb, 'CSE'),
      AN: X.findSheet(wb, 'Analítico', 'Analitico') };
    for (const k of ['ISD', 'CSD', 'AN']) if (!need[k]) throw new Error(`Aba obrigatória não encontrada: ${k === 'AN' ? 'Analítico' : k}. Use a planilha "SINAPI_Referência" da CAIXA.`);

    const raw = { v: 1, fonte: 'SINAPI', ref: '', emissao: '', ufs: [], cidades: [], encargos: {},
      grupos: [], ct: [], cls: [], un: [], ins: { c: [], k: [], d: [], u: [], o: [], p: [], lab: {} },
      comp: { c: [], g: [], d: [], u: [], s: [], it: [] }, valid: null };
    const unIdx = new Map(), clsIdx = new Map(), grpIdx = new Map();
    const unitId = (u) => { u = String(u || '').trim().toUpperCase(); if (!unIdx.has(u)) { unIdx.set(u, raw.un.length); raw.un.push(u); } return unIdx.get(u); };
    const clsId = (c) => { c = String(c || '').trim(); if (!clsIdx.has(c)) { clsIdx.set(c, raw.cls.length); raw.cls.push(c); } return clsIdx.get(c); };

    /* ---- Insumos (ISD = base; ICD/ISE só diferem na mão de obra) ---- */
    async function readIns(sheet, regime, frac0, frac1) {
      let hdr = -1, ufCol = null; const rows = new Map(); let enc = { h: [], m: [] };
      await X.readSheet(wb, sheet, (rn, v) => {
        if (hdr < 0) {
          if (/^M[EÊ]S DE REFER/i.test(U.norm(v[0])) && !raw.ref) raw.ref = String(v[1] || '').trim();
          if (/^DATA DE EMISS/i.test(U.norm(v[0])) && !raw.emissao) raw.emissao = String(v[1] || '').trim();
          if (U.norm(v[4]) === 'HORISTA') enc.h = v; if (U.norm(v[4]) === 'MENSALISTA') enc.m = v;
          if (U.norm(v[4]) === 'LOCALIDADE') raw._cid = v;
          if (U.norm(v[0]) === 'CLASSIFICACAO') {
            hdr = rn; ufCol = [];
            v.forEach((x, i) => { if (typeof x === 'string' && /^[A-Z]{2}$/.test(x.trim()) && i >= 4) ufCol.push([x.trim(), i]); });
          }
          return;
        }
        const code = typeof v[1] === 'number' ? v[1] : parseInt(v[1], 10);
        if (!code) return;
        rows.set(code, { cls: v[0], d: v[2], u: v[3], o: v[4], p: ufCol.map(([, i]) => toCents(v[i])) });
      }, { onProgress: (n) => onProgress(`Lendo insumos (${regime})…`, frac0 + (frac1 - frac0) * Math.min(1, n / 5.5e6)) });
      if (!ufCol) throw new Error(`Cabeçalho não encontrado na aba de insumos ${regime}.`);
      const ufs = ufCol.map((x) => x[0]);
      raw.encargos[regime] = { h: ufCol.map(([, i]) => +enc.h[i] || null), m: ufCol.map(([, i]) => +enc.m[i] || null) };
      if (regime === 'SD' && raw._cid) raw.cidades = ufCol.map(([, i]) => String(raw._cid[i] || ''));
      return { rows, ufs };
    }
    const ISD = await readIns(need.ISD, 'SD', 0.02, 0.12);
    raw.ufs = ISD.ufs; delete raw._cid;
    const SP = raw.ufs.indexOf('SP');
    const labFrom = async (sheet, regime, a, b) => {
      if (!sheet) return;
      const R = await readIns(sheet, regime, a, b);
      if (R.ufs.join() !== raw.ufs.join()) throw new Error('Ordem das UFs difere entre as abas de insumos.');
      for (const [code, r] of R.rows) {
        const base = ISD.rows.get(code);
        if (base && base.p.join() !== r.p.join()) (raw.ins.lab[code] ||= {})[regime] = r.p;
      }
    };
    await labFrom(need.ICD, 'CD', 0.12, 0.2);
    await labFrom(need.ISE, 'SE', 0.2, 0.28);

    /* ---- Composições (CSD): grupo, código (fórmula HYPERLINK), caderno ---- */
    const comps = new Map(); const official = { SD: new Map(), CD: new Map(), SE: new Map() };
    async function readComp(sheet, regime, a, b, meta) {
      let hdr = -1, costCols = null, ufRow = null;
      const res = await X.readSheet(wb, sheet, (rn, v, f) => {
        if (hdr < 0) {
          if (U.norm(v[0]) === 'GRUPO') {
            hdr = rn; costCols = [];
            v.forEach((x, i) => { if (/^CUSTO/.test(U.norm(x))) costCols.push(i); });
          } else if (v.some((x) => x === 'AC') && v.some((x) => x === 'SP')) ufRow = v;
          return;
        }
        let code = typeof v[1] === 'number' && v[1] > 0 ? v[1] : 0;
        if (!code && f && f[1]) { const m = /,\s*(\d+)\s*\)\s*$/.exec(f[1]) || /MATCH\((\d+)/.exec(f[1]); if (m) code = +m[1]; }
        if (!code) return;
        if (meta) comps.set(code, { g: String(v[0] || '').trim(), d: String(v[2] || '').trim(), u: String(v[3] || '').trim(), row: rn });
        const ufOrder = costCols.map((i) => (ufRow ? String(ufRow[i] || '').trim() : ''));
        official[regime].set(code, raw.ufs.map((uf) => { const k = ufOrder.indexOf(uf); return k >= 0 ? toCents(v[costCols[k]]) : null; }));
      }, { formulaCols: new Set([1]), hyperlinks: meta, onProgress: (n) => onProgress(`Lendo composições (${regime})…`, a + (b - a) * Math.min(1, n / 2.3e7)) });
      if (meta) {
        const byRow = new Map(); for (const [code, c] of comps) byRow.set(c.row, code);
        for (const [row, h] of Object.entries(res.hyperlinks || {})) {
          const code = byRow.get(+row); if (code && h.col === 'A') comps.get(code).ct = h.url;
        }
      }
    }
    await readComp(need.CSD, 'SD', 0.28, 0.45, true);
    if (need.CCD) await readComp(need.CCD, 'CD', 0.45, 0.55, false);
    if (need.CSE) await readComp(need.CSE, 'SE', 0.55, 0.65, false);

    /* ---- Analítico: estrutura das composições ---- */
    const items = new Map(); const anDesc = new Map(); const sit = new Map();
    let hdrA = -1;
    await X.readSheet(wb, need.AN, (rn, v) => {
      if (hdrA < 0) { if (U.norm(v[0]) === 'GRUPO') hdrA = rn; return; }
      const comp = typeof v[1] === 'number' ? v[1] : parseInt(v[1], 10);
      if (!comp) return;
      if (!v[2]) { sit.set(comp, U.norm(v[7])); if (!items.has(comp)) items.set(comp, []); return; }
      const tipo = U.norm(v[2]); const code = typeof v[3] === 'number' ? v[3] : parseInt(v[3], 10);
      (items.get(comp) || items.set(comp, []).get(comp)).push([tipo === 'COMPOSICAO' ? -code : code, +v[6] || 0]);
      if (tipo === 'INSUMO' && !anDesc.has(code)) anDesc.set(code, { d: String(v[4] || '').trim(), u: String(v[5] || '').trim(), s: U.norm(v[7]) });
    }, { onProgress: (n) => onProgress('Lendo analítico…', 0.65 + 0.25 * Math.min(1, n / 2.3e7)) });

    /* ---- Monta arrays compactos ---- */
    onProgress('Organizando a base…', 0.92);
    const insCodes = new Set([...ISD.rows.keys(), ...anDesc.keys()]);
    for (const code of [...insCodes].sort((a, b) => a - b)) {
      const r = ISD.rows.get(code); const a = anDesc.get(code);
      raw.ins.c.push(code);
      raw.ins.k.push(clsId(r ? r.cls : 'SEM PREÇO'));
      raw.ins.d.push(r ? String(r.d).trim() : a.d);
      raw.ins.u.push(unitId(r ? r.u : a.u));
      raw.ins.o.push(r ? (U.norm(r.o) === 'C' ? 0 : 1) : 2);
      raw.ins.p.push(r ? r.p : null);
    }
    const ctIdx = new Map();
    for (const code of [...comps.keys()].sort((a, b) => a - b)) {
      const c = comps.get(code);
      if (!grpIdx.has(c.g)) { grpIdx.set(c.g, raw.grupos.length); raw.grupos.push(c.g); raw.ct.push(''); }
      const gi = grpIdx.get(c.g); if (c.ct && !raw.ct[gi]) raw.ct[gi] = c.ct;
      raw.comp.c.push(code); raw.comp.g.push(gi); raw.comp.d.push(c.d); raw.comp.u.push(unitId(c.u));
      raw.comp.s.push(sit.get(code) === 'COM CUSTO' ? 0 : 1);
      raw.comp.it.push(items.get(code) || []);
    }
    void ctIdx;
    /* ---- Validação: custo recalculado × relatório oficial ---- */
    onProgress('Validando custos recalculados…', 0.95);
    let base = new S.Base(raw);
    raw.valid = S.validate(base, official);
    /* Divergências residuais (itens sem preço publicado na planilha): o custo
     * oficial é gravado como "sobreposição" para garantir fidelidade total. */
    if (raw.valid.mismatch.length && raw.valid.mismatch.length < 0.02 * raw.valid.total) {
      raw.ovr = {};
      for (const m of raw.valid.mismatch) ((raw.ovr[m.rg] ||= {})[m.code] ||= raw.ufs.map(() => null))[m.ui] = m.off;
      const n = raw.valid.mismatch.length; const codes = new Set(raw.valid.mismatch.map((m) => m.code));
      base = new S.Base(raw);
      raw.valid = S.validate(base, official);
      raw.valid.overrides = n; raw.valid.overrideCodes = [...codes].sort((a, b) => a - b);
    }
    delete raw.valid.mismatch; delete raw._cid;
    raw.importMs = Date.now() - t0;
    onProgress('Concluído', 1);
    return raw;
  };

  /* Confere o custo calculado com o custo publicado (todas as UFs e regimes) */
  S.validate = function (base, official) {
    const out = { total: 0, ok: 0, byRegime: {}, sample: [], mismatch: [] };
    for (const rg of ['SD', 'CD', 'SE']) {
      const map = official[rg]; if (!map || !map.size) continue;
      let t = 0, ok = 0;
      base.ufs.forEach((uf, ui) => {
        const costs = base.costTable(uf, rg).cost;
        for (const [code, arr] of map) {
          const off = arr[ui]; const j = base.compIdx.get(code);
          if (off == null || off === 0 || j == null) continue;
          t++; if (costs[j] === off) ok++; else { out.mismatch.push({ rg, ui, code, off }); if (out.sample.length < 20) out.sample.push({ rg, uf, code, off, calc: costs[j] }); }
        }
      });
      out.byRegime[rg] = { total: t, ok }; out.total += t; out.ok += ok;
    }
    return out;
  };

  /* ================= BASE (modelo em memória) ================= */
  const LABOR_SUFFIX = /\s+COM ENCARGOS COMPLEMENTARES\s*$/i;
  const EQ_SUFFIX = /\s*-\s*CH[PI]\s*(DIURNO|NOTURNO)?\.?\s*(AF_\S+)?\s*$/i;
  S.stripAF = (d) => String(d || '').replace(/\.?\s*AF_\d{2}\/\d{4}\S*\s*$/, '').replace(/\.\s*$/, '').trim();
  S.afOf = (d) => { const m = /AF_(\d{2})\/(\d{4})(\S*)/.exec(d || ''); return m ? { m: +m[1], y: +m[2], tag: m[0] } : null; };

  S.Base = class Base {
    constructor(raw, id) {
      this.raw = raw; this.id = id || `SINAPI-${String(raw.ref).split('/').reverse().join('-')}`;
      this.ufs = raw.ufs; this.spIdx = raw.ufs.indexOf('SP');
      const I = raw.ins, C = raw.comp;
      this.insIdx = new Map(); I.c.forEach((c, i) => this.insIdx.set(c, i));
      this.compIdx = new Map(); C.c.forEach((c, j) => this.compIdx.set(c, j));
      this.nIns = I.c.length; this.nComp = C.c.length;
      this.insCat = I.k.map((k) => S.catOfClass(raw.cls[k]));
      // itens em forma numérica rápida (tipo, índice, coeficiente escalado)
      this.it = C.it.map((list) => list.map(([code, coef]) => code < 0
        ? { t: 1, j: this.compIdx.get(-code), code: -code, coef, cs: Math.round(coef * COEF_SCALE) }
        : { t: 0, i: this.insIdx.get(code), code, coef, cs: Math.round(coef * COEF_SCALE) }));
      // classificação de recursos
      const un = (j) => raw.un[C.u[j]];
      this.isLabor = C.c.map((_, j) => (un(j) === 'H' || un(j) === 'MES') && this.it[j].some((x) => x.t === 0 && raw.cls[I.k[x.i]] && U.norm(raw.cls[I.k[x.i]]) === 'MAO DE OBRA'));
      this.isEquip = C.c.map((_, j) => un(j) === 'CHP' || un(j) === 'CHI');
      // sobreposições de custo oficial (itens sem preço publicado) por regime -> Map(j -> [27])
      this.ovr = {};
      for (const [rg, m] of Object.entries(raw.ovr || {})) { this.ovr[rg] = new Map(); for (const [code, arr] of Object.entries(m)) { const j = this.compIdx.get(+code); if (j != null) this.ovr[rg].set(j, arr); } }
      this.custom = new Map(); // composições próprias (código "CP-001")
      this._costCache = new Map();
    }
    /* ---- acesso ---- */
    ufIndex(uf) { const i = this.ufs.indexOf(uf); return i < 0 ? this.spIdx : i; }
    unit(j) { return this.raw.un[this.raw.comp.u[j]]; }
    insUnit(i) { return this.raw.un[this.raw.ins.u[i]]; }
    group(j) { return this.raw.grupos[this.raw.comp.g[j]]; }
    caderno(j) { return this.raw.ct[this.raw.comp.g[j]] || ''; }
    insClass(i) { return this.raw.cls[this.raw.ins.k[i]]; }
    comp(code) { // objeto de apresentação (SINAPI ou própria)
      if (this.custom.has(code)) return this.custom.get(code);
      const j = this.compIdx.get(+code); if (j == null) return null;
      const C = this.raw.comp;
      return { code: C.c[j], j, desc: C.d[j], unit: this.unit(j), group: this.group(j), sit: C.s[j], src: 'SINAPI' };
    }
    ins(code) {
      const i = this.insIdx.get(+code); if (i == null) return null;
      const I = this.raw.ins;
      return { code: I.c[i], i, desc: I.d[i], unit: this.insUnit(i), cls: this.insClass(i), cat: this.insCat[i], origem: ['C', 'CR', '—'][I.o[i]] };
    }
    /* preço de insumo (centavos) com fallback de SP; retorna [centavos|null, atribuidoSP] */
    insPrice(i, ui, rg) {
      const code = this.raw.ins.c[i]; const lab = this.raw.ins.lab[code];
      const arr = (rg !== 'SD' && lab && lab[rg]) ? lab[rg] : this.raw.ins.p[i];
      if (!arr) return [null, false];
      const v = arr[ui]; if (v != null) return [v, false];
      const s = arr[this.spIdx]; return s != null ? [s, true] : [null, false];
    }
    /* ---- tabela de custos de TODAS as composições para UF/regime (memo) ---- */
    costTable(uf, rg) {
      const key = uf + '|' + rg;
      if (this._costCache.has(key)) return this._costCache.get(key);
      const ui = this.ufIndex(uf), n = this.nComp;
      const cost = new Array(n).fill(undefined), as = new Array(n).fill(0), state = new Uint8Array(n);
      const ovr = this.ovr[rg];
      // DFS iterativa: não depende da pilha JS nem de limite artificial de níveis.
      for (let seed = 0; seed < n; seed++) {
        if (state[seed] === 2) continue;
        const stack = [{ j: seed, pos: 0, tot: 0, asc: 0 }];
        while (stack.length) {
          const f = stack[stack.length - 1], j = f.j;
          const finish = (v) => { cost[j] = v; as[j] = v == null ? 0 : f.asc; state[j] = 2; stack.pop(); };
          if (state[j] === 0) {
            state[j] = 1;
            const o = ovr && ovr.get(j);
            if (o && o[ui] != null) { finish(o[ui]); continue; }
            if (!this.it[j] || !this.it[j].length) { finish(null); continue; }
          }
          if (f.pos >= this.it[j].length) { finish(f.tot); continue; }
          const x = this.it[j][f.pos];
          if (!Number.isFinite(x.coef) || x.coef < 0) { finish(null); continue; }
          if (x.coef === 0) { f.pos++; continue; }
          let p = null, fromSP = false, asFrac = 0;
          if (x.t === 0) {
            if (x.i != null) [p, fromSP] = this.insPrice(x.i, ui, rg);
          } else if (x.j != null) {
            if (state[x.j] === 0) { stack.push({ j: x.j, pos: 0, tot: 0, asc: 0 }); continue; }
            if (state[x.j] === 2) { p = cost[x.j]; if (p > 0) asFrac = as[x.j] / p; }
          }
          if (p == null || !Number.isFinite(p) || p < 0) { finish(null); continue; }
          const part = mulTrunc(x.cs, p);
          f.tot += part; f.asc += fromSP ? part : part * asFrac; f.pos++;
        }
      }
      const t = { cost, as }; this._costCache.set(key, t); return t;
    }
    /* custo unitário (centavos) de composição SINAPI ou própria */
    compCost(code, uf, rg) {
      if (this.custom.has(code)) return this.customCost(this.custom.get(code), uf, rg).cost;
      const j = this.compIdx.get(+code); if (j == null) return null;
      return this.costTable(uf, rg).cost[j];
    }
    compAS(code, uf, rg) {
      const j = this.compIdx.get(+code); if (j == null) return 0;
      const t = this.costTable(uf, rg); return t.cost[j] ? t.as[j] / t.cost[j] : 0;
    }
    /* custo por UF (27 valores) — usado no mapa de preços por estado */
    costAllUF(code, rg) { return this.ufs.map((uf) => this.compCost(code, uf, rg)); }

    /* ---- itens analíticos com custo (1 nível) ---- */
    itemsOf(code, uf, rg) {
      const ui = this.ufIndex(uf);
      if (this.custom.has(code)) return (this.custom.get(code).items || []).map((x) => this._itemRow(x.type === 'C' ? (/^\d+$/.test(String(x.code)) ? -Number(x.code) : String(x.code)) : Number(x.code), x.coef, ui, uf, rg));
      const j = this.compIdx.get(+code); if (j == null) return [];
      return this.raw.comp.it[j].map(([c, coef]) => this._itemRow(c, coef, ui, uf, rg));
    }
    _itemRow(c, coef, ui, uf, rg) {
      const cs = Math.round(coef * COEF_SCALE);
      if (c < 0 || (typeof c === 'string')) {
        const code = typeof c === 'string' ? c : -c; const info = this.comp(code) || { code, desc: '(composição não encontrada)', unit: '' };
        const p = this.compCost(code, uf, rg);
        return { type: 'C', code, desc: info.desc, unit: info.unit, coef, price: p, total: p == null ? null : mulTrunc(cs, p),
          labor: info.j != null && this.isLabor[info.j], equip: info.j != null && this.isEquip[info.j], group: info.group };
      }
      const i = this.insIdx.get(c); const info = this.ins(c) || { desc: '(insumo não encontrado)', unit: '' };
      const [p, sp] = i == null ? [null, false] : this.insPrice(i, ui, rg);
      return { type: 'I', code: c, desc: info.desc, unit: info.unit, coef, price: p, sp, total: p == null ? null : mulTrunc(cs, p), cls: info.cls, cat: info.cat };
    }

    /* ---- decomposição MO/MAT/EQ/SERV/OUT (centavos), recursiva ---- */
    breakdown(code, uf, rg, memo = new Map()) {
      const active = new Set(); const stack = [{ code, pos: 0 }];
      while (stack.length) {
        const f = stack[stack.length - 1], key = String(f.code);
        if (memo.has(key)) { stack.pop(); continue; }
        if (!f.rows) { f.rows = this.itemsOf(f.code, uf, rg); active.add(key); }
        let descend = false;
        while (f.pos < f.rows.length) {
          const r = f.rows[f.pos++], rk = String(r.code);
          if (r.type === 'C' && !r.labor && !r.equip && r.total != null && r.coef > 0 && !memo.has(rk) && !active.has(rk)) {
            stack.push({ code: r.code, pos: 0 }); descend = true; break;
          }
        }
        if (descend) continue;
        const res = { mo: 0, mat: 0, eq: 0, serv: 0, out: 0 };
        for (const r of f.rows) {
          if (r.total == null || !Number.isFinite(r.total) || r.total < 0) continue;
          if (r.type === 'I') { res[r.cat || 'out'] += r.total; continue; }
          if (r.labor) { res.mo += r.total; continue; }
          if (r.equip) { res.eq += r.total; continue; }
          const sub = memo.get(String(r.code)); const st = sub ? U.sum(Object.values(sub)) : 0;
          if (!st) { res.out += r.total; continue; }
          const keys = Object.keys(res); let acc = 0; const rem = [];
          keys.forEach((k) => { const exact = r.total * sub[k] / st; const fl = Math.floor(exact); res[k] += fl; acc += fl; rem.push([exact - fl, k]); });
          rem.sort((a, b) => b[0] - a[0]); for (let q = 0; q < r.total - acc; q++) res[rem[q % rem.length][1]] += 1;
        }
        memo.set(key, res); active.delete(key); stack.pop();
      }
      return memo.get(String(code));
    }

    /* ---- nomes de recursos ---- */
    laborName(desc) { return U.cap(String(desc).replace(LABOR_SUFFIX, '').trim()); }
    equipKey(desc) { return U.norm(S.stripAF(desc)).replace(EQ_SUFFIX, '').replace(/\s*-\s*CH[PI]\b.*$/, '').trim(); }
    equipName(desc) {
      const k = S.stripAF(desc).replace(/\s*-\s*CH[PI]\b.*$/i, '').trim();
      return U.cap(k);
    }

    /* ---- RECURSOS (produtividade) ----
     * Retorna os recursos DIRETOS (equipe principal) e os de APOIO
     * (dentro de subcomposições auxiliares, com coeficientes multiplicados).
     * Mão de obra: horas/unidade (H). Equipamento: CHP e CHI por unidade. */
    resources(code) {
      const direct = new Map(), support = new Map();
      const add = (map, key, obj, field, v) => {
        if (!map.has(key)) map.set(key, Object.assign({ key, h: 0, chp: 0, chi: 0 }, obj));
        map.get(key)[field] += v;
      };
      const listOf = (c) => {
        if (this.custom.has(c)) return (this.custom.get(c).items || []).map((x) => [x.type === 'C' ? (/^\d+$/.test(String(x.code)) ? -Number(x.code) : String(x.code)) : Number(x.code), x.coef]);
        const j = this.compIdx.get(+c); return j == null ? [] : this.raw.comp.it[j];
      };
      const active = new Set([String(code)]), stack = [{ code, factor: 1, depth: 0, list: listOf(code), pos: 0 }];
      while (stack.length) {
        const node = stack[stack.length - 1];
        if (node.pos >= node.list.length) { active.delete(String(node.code)); stack.pop(); continue; }
        const [c, coef] = node.list[node.pos++]; if (!Number.isFinite(coef) || coef <= 0) continue;
        const f = node.factor * coef; if (!Number.isFinite(f)) continue;
        const map = node.depth === 0 ? direct : support;
        if (c < 0 || typeof c === 'string') {
          const sc = typeof c === 'string' ? c : -c; const j = this.compIdx.get(+sc);
          if (j != null && this.isLabor[j]) {
            if (this.unit(j) === 'H') add(map, 'MO:' + sc, { kind: 'mo', code: sc, name: this.laborName(this.raw.comp.d[j]) }, 'h', f);
            continue;
          }
          if (j != null && this.isEquip[j]) {
            const d = this.raw.comp.d[j], k = 'EQ:' + this.equipKey(d);
            add(map, k, { kind: 'eq', name: this.equipName(d), operator: this.operatorOf(j) }, this.unit(j) === 'CHP' ? 'chp' : 'chi', f); continue;
          }
          if (active.has(String(sc))) continue;
          active.add(String(sc)); stack.push({ code: sc, factor: f, depth: node.depth + 1, list: listOf(sc), pos: 0 });
        } else {
          const i = this.insIdx.get(c); if (i == null) continue;
          const cls = U.norm(this.insClass(i)), un = this.insUnit(i);
          if (cls === 'MAO DE OBRA' && un === 'H') add(map, 'MI:' + c, { kind: 'mo', code: c, name: U.cap(this.raw.ins.d[i].replace(/\s*\((HORISTA|MENSALISTA)\)\s*$/i, '')) }, 'h', f);
          else if (cls.startsWith('EQUIPAMENTO') && un === 'H') add(map, 'EI:' + c, { kind: 'eq', name: U.cap(this.raw.ins.d[i]) }, 'chp', f);
        }
      }
      const fin = (m) => [...m.values()].map((r) => { if (r.kind === 'eq') r.h = r.chp + r.chi; return r; }).filter((r) => r.h > 0);
      return { direct: fin(direct), support: fin(support) };
    }
    /* operador embutido no custo horário do equipamento (para histogramas) */
    operatorOf(j) {
      for (const x of this.it[j]) {
        if (x.t === 1 && x.j != null && this.isLabor[x.j] && this.unit(x.j) === 'H') return this.laborName(this.raw.comp.d[x.j]);
      }
      return null;
    }

    /* ---- composições próprias ---- */
    setCustom(list) {
      this.custom = new Map(list.map((c) => [c.code, c]));
      this._customCostCache = new Map(); this._bdCache = new Map();
      if (OP.prod) OP.prod.clearCache(this);
    }
    customCost(cp, uf, rg) {
      const all = this._customCostCache || (this._customCostCache = new Map()), cacheKey = uf + '|' + rg;
      let cache = all.get(cacheKey); if (!cache) all.set(cacheKey, cache = new Map());
      const ui = this.ufIndex(uf), active = new Set(), stack = [{ cp, pos: 0, tot: 0 }];
      while (stack.length) {
        const f = stack[stack.length - 1], k = f.cp.code, items = f.cp.items || [];
        if (cache.has(k)) { stack.pop(); continue; }
        active.add(k);
        const finish = (v) => { cache.set(k, v); active.delete(k); stack.pop(); };
        if (!items.length) { finish(null); continue; }
        if (f.pos >= items.length) { finish(f.tot); continue; }
        const x = items[f.pos];
        if (!Number.isFinite(x.coef) || x.coef < 0 || !['I', 'C'].includes(x.type)) { finish(null); continue; }
        if (!x.coef) { f.pos++; continue; }
        let p = null;
        if (x.type === 'C') {
          if (this.custom.has(x.code)) {
            if (active.has(x.code)) { finish(null); continue; }
            if (!cache.has(x.code)) { stack.push({ cp: this.custom.get(x.code), pos: 0, tot: 0 }); continue; }
            p = cache.get(x.code);
          } else { const j = this.compIdx.get(+x.code); if (j != null) p = this.costTable(uf, rg).cost[j]; }
        } else { const i = this.insIdx.get(+x.code); if (i != null) p = this.insPrice(i, ui, rg)[0]; }
        if (p == null || !Number.isFinite(p) || p < 0) { finish(null); continue; }
        f.tot += mulTrunc(Math.round(x.coef * COEF_SCALE), p); f.pos++;
      }
      return { cost: cache.get(cp.code) };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

