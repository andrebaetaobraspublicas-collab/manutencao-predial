/* ==== 04_search.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 04_search.js
 * Busca inteligente: sem acentos, por prefixo de palavra, com sinônimos
 * de obra ("reboco" -> emboço/massa única, "ferragem" -> armação),
 * singular/plural e busca direta por código.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util;
  const S = (OP.search = {});
  S.SYN = {
    REBOCO: ['EMBOCO', 'MASSA UNICA', 'REBOCO'], REBOCAR: ['EMBOCO', 'MASSA UNICA'], FERRAGEM: ['ARMACAO', 'ARMADURA', 'ACO CA'],
    FERRO: ['ARMACAO', 'ARMADURA', 'ACO CA'], TIJOLO: ['BLOCO CERAMICO', 'BLOCOS CERAMICOS', 'TIJOLO'],
    LAJOTA: ['CERAMIC', 'LAJOTA'], AZULEJO: ['REVESTIMENTO CERAMICO', 'AZULEJO'], BURACO: ['ESCAVAC'], CAVA: ['ESCAVAC'],
    TERRAPLENAGEM: ['ESCAVAC', 'ATERRO', 'TERRAPLENAGEM', 'COMPACTAC'], CANO: ['TUBO'], ENCANAMENTO: ['TUBO'],
    FIO: ['CABO', 'FIO'], FIACAO: ['CABO'], LUZ: ['LUMINARIA', 'ILUMINAC'], TINTA: ['PINTURA', 'TINTA'], PINTAR: ['PINTURA'],
    TELHADO: ['TELHAMENTO', 'COBERTURA', 'TRAMA', 'TELHA'], DRYWALL: ['DRYWALL', 'GESSO ACARTONADO'],
    CONCRETAR: ['CONCRETAGEM'], ASFALTO: ['CBUQ', 'CONCRETO BETUMINOSO', 'ASFALT', 'PAVIMENT'], CALCADA: ['CALCADA', 'PASSEIO'],
    MEIOFIO: ['MEIO-FIO', 'GUIA'], IMPERMEABILIZAR: ['IMPERMEABILIZAC'], MANTA: ['MANTA', 'IMPERMEABILIZAC'],
    DEMOLIR: ['DEMOLIC', 'REMOC'], LIMPEZA: ['LIMPEZA', 'ROCADO', 'CAPINA'], REGULARIZAC: ['CONTRAPISO', 'REGULARIZAC'],
    ESCORA: ['ESCORAMENTO', 'ESCORA', 'CIMBRAMENTO'], REATERRAR: ['REATERRO'], COMPACTAR: ['COMPACTAC'],
    RETRO: ['RETROESCAVADEIRA', 'RETRO'], SANCA: ['SANCA', 'MOLDURA'], PISO: ['PISO', 'CONTRAPISO'],
    CBUQ: ['CONCRETO ASFALTIC', 'CBUQ'], BGS: ['BRITA GRADUADA'], BGTC: ['BRITA GRADUADA TRATADA'], CAP: ['CIMENTO ASFALTIC', 'CAP'], PMF: ['PRE-MISTURADO A FRIO'],
    TSD: ['TRATAMENTO SUPERFICIAL DUPLO'], TSS: ['TRATAMENTO SUPERFICIAL SIMPLES'], BSTC: ['BSTC'], BDTC: ['BDTC'], BSCC: ['BSCC'], BDCC: ['BDCC'], BUEIRO: ['BUEIRO', 'BSTC', 'BSCC', 'CORPO DE B'],
    CORTE: ['ESCAVAC', 'CORTE'], BOTAFORA: ['BOTA-FORA', 'TRANSPORTE'], JAZIDA: ['JAZIDA'], PEDREIRA: ['PEDREIRA', 'BRITA PRODUZIDA'], USINA: ['USINAGEM', 'USINA'],
    NEOPRENE: ['NEOPRENE', 'APARELHO DE APOIO'], PONTE: ['OAE', 'VIGA PRE-MOLDADA', 'APARELHO DE APOIO', 'JUNTA DE DILATAC'], OAE: ['OAE', 'APARELHO DE APOIO', 'VIGA PRE-MOLDADA'],
    GABIAO: ['GABIAO'], GRAMPEADO: ['SOLO GRAMPEADO', 'GRAMPO'], TIRANTE: ['TIRANTE'], DEFENSA: ['DEFENSA'], FAIXA: ['PINTURA DE FAIXA', 'FAIXA'], TACHA: ['TACHA', 'TACHAO'],
    PLACA: ['PLACA'], SARJETA: ['SARJETA'], VALETA: ['VALETA'], MEIO: ['MEIO-FIO'], DRENAGEM: ['SARJETA', 'VALETA', 'DRENO', 'BUEIRO', 'CAIXA COLETORA', 'DESCIDA'],
    IMPRIMACAO: ['IMPRIMAC'], PINTURALIGACAO: ['PINTURA DE LIGAC'], HIDROSSEMEADURA: ['HIDROSSEMEADURA'], CERCA: ['CERCA'], DRAGAGEM: ['DRAGAGEM'], TUNEL: ['TUNEL', 'ESCAVACAO SUBTERRANEA'],
  };
  const STOPQ = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'COM', 'PARA', 'A', 'O', 'AS', 'OS', 'NA', 'NO', 'POR', 'UM', 'UMA']);
  /* radical simples: FUNDACOES/FUNDACAO -> FUNDAC ; BLOCOS -> BLOCO */
  S.stem = (t) => {
    if (/^\d/.test(t)) return t;
    if (t.length > 5 && /COES$/.test(t)) return t.slice(0, -3);
    if (t.length > 4 && /CAO$/.test(t)) return t.slice(0, -2);
    if (t.length > 4 && /(OES|AES|AOS)$/.test(t)) return t.slice(0, -3);
    if (t.length > 4 && /S$/.test(t)) return t.slice(0, -1);
    return t;
  };
  const clean = (s) => ' ' + U.norm(s).replace(/[^A-Z0-9,\-]+/g, ' ').replace(/ ,|, /g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  S.build = function (base) {
    const C = base.raw.comp;
    base._search = { txt: C.d.map(clean), gtxt: base.raw.grupos.map(clean), itxt: null };
  };
  S.parse = function (q) {
    const raw = U.norm(q).replace(/[^A-Z0-9,\-]+/g, ' ').trim();
    const toks = raw.split(' ').filter((t) => t && !STOPQ.has(t));
    const groups = toks.map((t) => { const st = S.stem(t); const alts = new Set([st]); (S.SYN[t] || S.SYN[st] || []).forEach((x) => alts.add(x)); return [...alts]; });
    return { raw, groups, terms: [...new Set(groups.flat())] };
  };
  function scoreText(s, gs, groups) {
    let score = 0;
    for (const alts of groups) {
      let best = 0;
      for (const a of alts) {
        const p = s.indexOf(' ' + a);
        if (p >= 0) { const sc = 10 + (p < 40 ? 4 : p < 90 ? 2 : 0) + (s.startsWith(' ' + a + ' ', p) ? 2 : 0); if (sc > best) best = sc; }
        else if (gs && gs.includes(' ' + a)) best = Math.max(best, 4);
      }
      if (!best) return 0;
      score += best;
    }
    return score;
  }
  /* Busca em composições SICRO e próprias. Retorna {list:[{j,score}], custom:[cp], total, terms} */
  S.query = function (base, q, limit = 60) {
    if (!base._search) S.build(base);
    const idx = base._search; const C = base.raw.comp;
    const P = S.parse(q); const out = { list: [], custom: [], total: 0, terms: P.terms };
    if (!P.raw) return out;
    for (const cp of base.custom.values()) {
      if(cp.archived)continue;
      const s = clean(cp.code + ' ' + cp.desc);
      if (scoreText(s, '', P.groups) || U.norm(cp.code).includes(P.raw)) out.custom.push(cp);
    }
    const res = [];
    if (/^\d{2,7}$/.test(P.raw)) {
      for (let j = 0; j < base.nComp; j++) { const c = String(C.c[j]); if (c.startsWith(P.raw) || c === P.raw.padStart(7, '0')) res.push({ j, score: c === P.raw.padStart(7, '0') ? 1000 : 500 - c.length }); }
    }
    if (!res.length) {
      for (let j = 0; j < base.nComp; j++) {
        let sc = scoreText(idx.txt[j], idx.gtxt[C.g[j]], P.groups);
        if (!sc) continue;
        sc -= idx.txt[j].length / 80; if (!C.s[j]) sc += 2;
        res.push({ j, score: sc });
      }
    }
    res.sort((a, b) => b.score - a.score || String(C.c[a.j]).localeCompare(String(C.c[b.j])));
    out.total = res.length; out.list = res.slice(0, limit);
    return out;
  };
  /* Insumos (editor de composições próprias) -> índices */
  S.insumos = function (base, q, limit = 12) {
    if (!base._search) S.build(base);
    const I = base.raw.ins; const P = S.parse(q); if (!P.raw) return [];
    const out = [];
    if (/^(\d{3,7}|[A-Z]\d{1,4}|IP-.*)$/.test(P.raw)) { for (let i = 0; i < base.nIns && out.length < limit; i++) if (String(I.c[i]).toUpperCase().startsWith(P.raw)) out.push(i); if (out.length) return out; }
    const it = base._search.itxt || (base._search.itxt = I.d.map(clean));
    const sc = [];
    for (let i = 0; i < base.nIns; i++) { const s = scoreText(it[i], '', P.groups); if (s) sc.push([i, s - it[i].length / 80 + (I.p[i] ? 2 : 0)]); }
    return sc.sort((a, b) => b[1] - a[1]).slice(0, limit).map((x) => x[0]);
  };
})(typeof window !== 'undefined' ? window : globalThis);


