/* ==== 03_factors.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 03_factors.js
 * Gera automaticamente as "árvores de fatores" (como nos Cadernos Técnicos
 * do SINAPI) a partir das descrições padronizadas das composições.
 *
 * Ideia: composições de um mesmo serviço repetem a mesma frase-modelo e só
 * mudam em alguns trechos (diâmetro, espessura, preparo, equipamento...).
 *  1. normaliza a descrição (acentos, abreviações, números, faixas);
 *  2. divide em ORAÇÕES (", "  ". "  " - ") — a 1ª é o núcleo do serviço;
 *  3. agrupa em FAMÍLIAS pelo início do núcleo (dentro do caderno);
 *  4. núcleo: alinhamento por LCS ponderado -> trechos variáveis = fatores
 *     (trechos vizinhos dependentes são fundidos: "DE 1,5 M ATÉ 3,0 M");
 *  5. demais orações: tipadas pela 1ª palavra relevante ("PREPARO",
 *     "ESPESSURA", "LARG."...); tipos mutuamente exclusivos na mesma posição
 *     viram um só fator (ESCAVADEIRA | RETROESCAVADEIRA);
 *  6. rotula fatores, ordena valores, remove fatores redundantes e ordena
 *     do mais "grosso" ao mais "fino" (como na árvore do caderno).
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util;
  const F = (OP.factors = {});

  const STOP = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'COM', 'PARA', 'A', 'O', 'AS', 'OS', 'NA', 'NO', 'NAS', 'NOS',
    'POR', 'AO', 'AOS', 'OU', '-', '=', 'SEM', 'ATE', 'INCLUSO', 'EXCLUSIVE', 'TIPO', 'UTILIZANDO', 'COMO', 'UM', 'UMA']);
  const LEAD = new Set(['SEM', 'COM', 'INCLUSO', 'EXCLUSIVE', 'NAO', 'EM', 'PARA', 'DE', 'DA', 'DO', 'NA', 'NO', 'NAS', 'NOS',
    'A', 'O', 'E', 'POR', 'AO', 'OU', 'UTILIZANDO', 'SOBRE', 'ENTRE']);
  const PUNCT = new Set([',', ';', ':', '(', ')', '.', '/', '"']);
  const ABBR = { PROFUNDIDADE: 'PROF', LARGURA: 'LARG', RETROESCAVADEIRA: 'RETROESCAV', ESPESSURA: 'ESP', DIAMETRO: 'DIAM',
    COMPRIMENTO: 'COMPR', CAPACIDADE: 'CAP', APROXIMADAMENTE: 'APROX', INCLUSIVE: 'INCLUSO', INCLUINDO: 'INCLUSO', INCL: 'INCLUSO',
    APLICADO: 'APLICADA', APLICACAO: 'APLICADA', MECANICO: 'MECANICA', MECANIZADO: 'MECANIZADA' };

  /* ---------- Normalização ---------- */
  F.cleanText = function (d) {
    return String(d || '')
      .replace(/\.?\s*AF_\d{2}\/\d{4}\S*\s*$/, '')
      .replace(/\s*,(?=[^\s\d])/g, ', ').replace(/\s+,/g, ',')
      .replace(/(\S)\(/g, '$1 (').replace(/\)(?=[^\s,.;:)])/g, ') ')
      .replace(/\s*=\s*/g, ' = ')
      .replace(/\.(?=[A-ZÀ-Ú]{2})/g, '. ')
      .replace(/(\d)(MM|CM|M2|M3|MPA|KG|KN|KW|KVA|HP|CV|PCM|L|M|T|W|V)\b/g, '$1 $2')
      .replace(/([^,\s-])\s+(INCLUSO|INCLUSIVE|EXCLUSIVE)\b/g, '$1, $2')
      .replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
  };
  const numKey = (t) => {
    if (!/^\d+(,\d+)?$/.test(t)) return t;
    const n = parseFloat(t.replace(',', '.'));
    return String(n).replace('.', ',');
  };
  const isNum = (k) => /^\d/.test(k);
  F.tokenize = function (text) {
    const out = [];
    for (let w of text.split(' ')) {
      if (!w) continue;
      const pre = []; const post = [];
      while (w.length > 1 && (w[0] === '(' || w[0] === '"')) { pre.push(w[0]); w = w.slice(1); }
      while (w.length > 1 && /[),;:]$/.test(w)) { post.unshift(w[w.length - 1]); w = w.slice(0, -1); }
      for (const p of pre) out.push({ t: p, k: p });
      let k = U.deaccent(w).toUpperCase();
      if (/^[A-Z]{2,}\.$/.test(k)) k = k.slice(0, -1);
      k = ABBR[k] || k; k = numKey(k);
      out.push({ t: w, k });
      for (const p of post) out.push({ t: p, k: p });
    }
    // faixas: "MENOR QUE X" = "ATÉ X"; "MAIOR QUE X ... ATÉ Y" = "DE X ... ATÉ Y"; "X A Y" = "X ATÉ Y"
    for (let i = 0; i < out.length; i++) {
      const k = out[i].k, nx = out[i + 1] && out[i + 1].k;
      if (k === 'MENOR' && nx === 'QUE') { out[i].k = 'ATE'; out[i + 1].k = ''; }
      else if (k === 'MAIOR' && nx === 'QUE' && out.slice(i + 2, i + 7).some((x) => x.k === 'ATE')) { out[i].k = 'DE'; out[i + 1].k = ''; }
      else if (k === 'A' && i > 0 && out[i + 1] && isNum(out[i + 1].k) && (isNum(out[i - 1].k) || (out[i - 2] && isNum(out[i - 2].k)))) out[i].k = 'ATE';
    }
    // tokens com chave vazia são absorvidos pelo anterior (mantém o texto original)
    const res = [];
    for (const x of out) { if (x.k === '' && res.length) res[res.length - 1].t += ' ' + x.t; else if (x.k !== '') res.push(x); }
    return res;
  };
  const weight = (k) => PUNCT.has(k) ? 0.2 : STOP.has(k) ? 0.5 : isNum(k) ? 1.2 : 2;
  const meaningful = (k) => !PUNCT.has(k) && !STOP.has(k);

  // "PROF. ATÉ" / "LARG. DE" não encerram a oração; "PEDREIRO. ARGAMASSA" encerra
  const NOT_END = new Set(['RETROESCAV', 'APROXIM', 'AUTOMAT', 'ESPECIF', 'EQUIVAL']);
  const sentenceEnd = (cur) => { if (/\)\s*$/.test(cur)) return true; const m = /([A-ZÀ-Úa-zà-ú]+)$/.exec(cur); if (!m) return false; const w = U.deaccent(m[1]).toUpperCase(); return w.length >= 6 && !NOT_END.has(w); };
  /* Divide em orações no nível 0 de parênteses. Após " - " (escopo:
   * "FORNECIMENTO E INSTALAÇÃO", "EXCLUSIVE ...") não divide mais por vírgula. */
  F.splitClauses = function (text) {
    const out = []; let depth = 0, cur = '', tail = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1);
      if (depth === 0) {
        if (!tail && (ch === ',' || ch === ';') && text[i + 1] === ' ') { out.push(cur); cur = ''; i++; continue; }
        if (!tail && ch === '.' && text[i + 1] === ' ' && /[A-ZÀ-Ú]/.test(text[i + 2] || '') && sentenceEnd(cur)) { out.push(cur); cur = ''; i++; continue; }
        if (ch === ' ' && text[i + 1] === '-' && text[i + 2] === ' ' && /[A-ZÀ-Ú]/.test(text[i + 3] || '')) { out.push(cur); cur = ''; i += 2; tail = true; continue; }
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim()).filter(Boolean);
  };

  /* Levenshtein ≤ 1 (erros de digitação como TRANVERSAL/TRANSVERSAL) */
  function near1(a, b) {
    if (a === b) return true; const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, e = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++e > 1) return false;
      if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
    return e + (la - i) + (lb - j) <= 1;
  }
  function fuzzyCanon(seqs) {
    const freq = new Map();
    seqs.forEach((s) => s.forEach((x) => freq.set(x.k, (freq.get(x.k) || 0) + 1)));
    const words = [...freq.keys()].filter((k) => k.length >= 7 && /^[A-Z]+$/.test(k)).sort((a, b) => freq.get(b) - freq.get(a));
    const map = new Map();
    for (let i = 0; i < words.length; i++) {
      if (map.has(words[i])) continue;
      for (let j = i + 1; j < words.length; j++) if (!map.has(words[j]) && near1(words[i], words[j])) map.set(words[j], words[i]);
    }
    if (map.size) seqs.forEach((s) => s.forEach((x) => { if (map.has(x.k)) x.k = map.get(x.k); }));
  }

  /* ---------- LCS ponderado: para cada índice de a, o índice casado em b (ou -1) ---------- */
  function align(a, b) {
    const n = a.length, m = b.length; const W = new Float64Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      const d = a[i].k === b[j].k ? W[(i + 1) * (m + 1) + j + 1] + weight(a[i].k) : -1;
      const r = W[(i + 1) * (m + 1) + j], c = W[i * (m + 1) + j + 1];
      W[i * (m + 1) + j] = Math.max(d, r, c);
    }
    const map = new Int32Array(n).fill(-1); let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i].k === b[j].k && W[i * (m + 1) + j] === W[(i + 1) * (m + 1) + j + 1] + weight(a[i].k)) {
        // palavras fracas (DE, EM, pontuação) casam o mais tarde possível: "VAZADOS DE CONCRETO DE 9X19"
        if (weight(a[i].k) < 1 && W[i * (m + 1) + j + 1] === W[i * (m + 1) + j]) { j++; continue; }
        map[i] = j; i++; j++;
      }
      else if (W[(i + 1) * (m + 1) + j] >= W[i * (m + 1) + j + 1]) i++; else j++;
    }
    return map;
  }

  /* ---------- trechos -> chave e texto ---------- */
  function trimTokens(toks) {
    let s = 0, e = toks.length;
    while (s < e && (PUNCT.has(toks[s].k) || (STOP.has(toks[s].k) && toks[s].k !== 'SEM' && toks[s].k !== 'INCLUSO' && toks[s].k !== 'ATE'))) s++;
    while (e > s && (PUNCT.has(toks[e - 1].k) || (STOP.has(toks[e - 1].k)))) e--;
    const t = toks.slice(s, e);
    // fecha/abre parênteses que ficaram soltos nas pontas
    const open = t.filter((x) => x.k === '(').length, close = t.filter((x) => x.k === ')').length;
    if (open > close && t.length && t[t.length - 1].k !== ')') t.push({ t: ')', k: ')' });
    return t;
  }
  const joinText = (toks) => toks.map((x) => x.t).join(' ')
    .replace(/\s+([,;:)])/g, '$1').replace(/\(\s+/g, '(').trim()
    .replace(/^([^()]*)\)$/, '$1');
  const SOFT = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'NA', 'NO', 'NAS', 'NOS', 'A', 'O', 'AS', 'OS', 'AO', 'AOS', '=', '-']);
  const keyOf = (toks) => toks.filter((x) => !PUNCT.has(x.k) && !SOFT.has(x.k)).map((x) => x.k).join(' ');

  /* ---------- rótulos ---------- */
  const LABEL_KEY = { PREPARO: 'Preparo', APLICADA: 'Aplicação', ESP: 'Espessura', LARG: 'Largura', PROF: 'Profundidade',
    DIAM: 'Diâmetro', DN: 'Diâmetro (DN)', BITOLA: 'Bitola', SOLO: 'Solo', LOCAIS: 'Interferência', ACESSO: 'Acesso',
    FCK: 'Resistência (fck)', TRACO: 'Traço', ARGAMASSA: 'Argamassa', PADRAO: 'Padrão', ALTURA: 'Altura', COMPR: 'Comprimento',
    CAP: 'Capacidade', POTENCIA: 'Potência', DMT: 'Distância (DMT)', INSTALADO: 'Instalação', INSTALADA: 'Instalação',
    DEMAO: 'Demãos', DEMAOS: 'Demãos', COR: 'Cores', CORES: 'Cores', UTILIZACOES: 'Utilizações', UTILIZACAO: 'Utilizações',
    FIXACAO: 'Fixação', ACABAMENTO: 'Acabamento', ASSENTAMENTO: 'Assentamento', EXECUCAO: 'Execução', REJUNTE: 'Rejunte',
    TELA: 'Tela', ARMADURA: 'Armadura', AREA: 'Área', VAO: 'Vão', CARGA: 'Carga', TENSAO: 'Tensão',
    SECAO: 'Seção', PLACAS: 'Placas', PECAS: 'Peças', MODULO: 'Módulo', CLASSE: 'Classe', FAIXA: 'Faixa', MISTURA: 'Mistura',
    CAMADA: 'Camada', CAMADAS: 'Camadas', ACO: 'Aço', CONCRETO: 'Concreto', BLOCOS: 'Blocos', MADEIRA: 'Madeira' };
  const EQUIP_RE = /ESCAVADEIRA|RETROESCAV|TRATOR|MOTONIVELADORA|\bROLO\b|CAMINH|GUINDASTE|CARREGADEIRA|VIBROACABADORA|COMPACTADOR|PERFURATRIZ|BOMBA/;
  function valueLabelRules(vkeys) {
    const v = vkeys.join(' | ');
    if (/SOLDA/.test(v)) return 'Pontos de solda';
    if (/\bFCK\b/.test(v)) return 'Resistência (fck)';
    if (/BETONEIRA|MISTURADOR|PREPARO/.test(v)) return 'Preparo';
    if (/CATEGORIA|\bSOLO\b|ROCHA|ARGILOSO|ARENOSO/.test(v)) return 'Material';
    if (/INTERFERENCIA/.test(v)) return 'Interferência';
    if (EQUIP_RE.test(v)) return 'Equipamento';
    if (/\bDEMA(O|OS)\b/.test(v)) return 'Demãos';
    if (/\bCOR(ES)?\b/.test(v)) return 'Cores';
    if (/UTILIZAC/.test(v)) return 'Utilizações';
    if (/^(MANUAL|MECANIZADA|MECANICA)( \| (MANUAL|MECANIZADA|MECANICA))*$/.test(v)) return 'Execução';
    if (/\d+(,\d+)? ?X ?\d/.test(v)) return 'Dimensões';
    if (/\bDN\b|\bDIAM\b|BITOLA/.test(v)) return 'Diâmetro';
    if (/\bESP\b/.test(v)) return 'Espessura';
    if (/FACHADA|SACADA|PAREDES|PANOS|SUPERFICIES|AMBIENTES|\bTETO\b|\bPISO\b/.test(v) && vkeys.every((k) => /FACHADA|SACADA|PAREDE|PANOS|SUPERFICIE|AMBIENTE|TETO|PISO|INTERN|EXTERN/.test(k))) return 'Local';
    if (/^SECAO /.test(v) && vkeys.every((k) => /^SECAO /.test(k))) return 'Seção';
    if (/PAVIMENTO|TERREA|UNIFAMILIAR|MULTIFAMILIAR|EDIFICAC/.test(v)) return 'Edificação';
    return null;
  }
  const niceWord = (k) => LABEL_KEY[k] || U.cap(k);
  const UNITS = new Set(['M', 'CM', 'MM', 'M2', 'M3', 'KG', 'L', 'T', 'UN', 'H', 'KW', 'KN', 'MPA', 'W', 'V', 'HP', 'CV']);
  const TAIL = new Set(['PROF', 'LARG', 'ESP', 'DIAM', 'DN', 'FCK', 'COMPR', 'CAP', 'TRACO']);

  /* ---------- alinhamento de um conjunto de sequências ---------- */
  function analyze(seqs) {
    const n = seqs.length;
    if (n === 1) return { anchors: [], slots: [], R: seqs[0], maps: [Int32Array.from(seqs[0], (_, x) => x)], avgLen: 0 };
    let ref = 0;
    if (n > 2) {
      const idx = [...seqs.keys()]; const sample = n > 20 ? idx.filter((i) => i % Math.ceil(n / 20) === 0) : idx;
      let best = -Infinity;
      for (const c of sample) {
        let s = 0;
        for (const d of sample) if (d !== c) { const m = align(seqs[c], seqs[d]); m.forEach((x, i) => { if (x >= 0) s += weight(seqs[c][i].k); }); }
        s -= seqs[c].length * 0.01;
        if (s > best) { best = s; ref = c; }
      }
    }
    const R = seqs[ref];
    const maps = seqs.map((c, i) => i === ref ? Int32Array.from(R, (_, x) => x) : align(R, c));
    const anchors = [];
    for (let i = 0; i < R.length; i++) if (maps.every((m) => m[i] >= 0)) anchors.push(i);
    const bounds = [-1, ...anchors, R.length];
    const valsOf = (a, b) => seqs.map((c, idx) => {
      const from = a < 0 ? 0 : maps[idx][a] + 1; const to = b >= R.length ? c.length : maps[idx][b];
      const toks = trimTokens(c.slice(from, to));
      return { key: keyOf(toks), text: joinText(toks), len: toks.length };
    });
    const slots = [];
    for (let s = 0; s < bounds.length - 1; s++) {
      const a = bounds[s], b = bounds[s + 1];
      const vals = valsOf(a, b);
      if (new Set(vals.map((v) => v.key)).size > 1) slots.push({ a, b, vals });
    }
    // funde trechos vizinhos dependentes separados por ≤ 2 palavras ("ATÉ 1,5 M" | "DE 1,5 M ATÉ 3,0 M")
    const dep = (X, Y) => { const m = new Map(); for (let i = 0; i < n; i++) { const k = X.vals[i].key; if (m.has(k) && m.get(k) !== Y.vals[i].key) return false; m.set(k, Y.vals[i].key); } return true; };
    let changed = true;
    while (changed) {
      changed = false;
      for (let s = 0; s < slots.length - 1; s++) {
        const X = slots[s], Y = slots[s + 1];
        if (Y.a === X.b && (dep(X, Y) || dep(Y, X))) {
          const between = R.slice(X.b, Y.a + 1).filter((x) => meaningful(x.k)).length;
          if (between <= 2) { slots.splice(s, 2, { a: X.a, b: Y.b, vals: valsOf(X.a, Y.b) }); changed = true; break; }
        }
      }
    }
    const avgLen = slots.length ? Math.max(...slots.map((s) => U.sum(s.vals, (v) => v.len) / n)) : 0;
    return { anchors, slots, R, maps, avgLen };
  }

  /* Subdivide uma oração longa em 2-3 fatores (só membros não vazios):
   *  1º por alinhamento (LCS); 2º pela 1ª preposição de lugar ("MANUALMENTE | EM PANOS DE FACHADA") */
  const PREP = new Set(['EM', 'NA', 'NO', 'NAS', 'NOS', 'SOBRE']);
  function subSplit(tl) {
    const idx = tl.map((t, i) => (t.length ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 4) return null;
    const wrap = (parts) => parts.map((p) => { const out = tl.map(() => ({ key: '', text: '', len: 0 })); idx.forEach((i, q) => (out[i] = p.vals[q])); return { vals: out, label: p.label }; });
    const A = analyze(idx.map((i) => tl[i]));
    if (A.slots.length >= 2 && A.slots.length <= 3 && A.anchors.some((i) => meaningful(A.R[i].k)) &&
        !A.slots.some((s) => U.sum(s.vals, (v) => v.len) / idx.length > 8)) {
      return wrap(A.slots.map((s) => {
        const keys = [...new Set(s.vals.map((v) => v.key).filter(Boolean))];
        const before = s.a >= 0 ? A.R.slice(0, s.a + 1).filter((x) => meaningful(x.k) && !UNITS.has(x.k)) : [];
        const lb = before.length ? before[before.length - 1] : null;
        return { vals: s.vals, label: valueLabelRules(keys) || (lb && (LABEL_KEY[lb.k] || U.cap(lb.t.replace(/\.$/, '')))) || null };
      }));
    }
    // divisão pela preposição de lugar
    const heads = [], tails = []; let hits = 0;
    idx.forEach((i) => {
      const t = tl[i]; let depth = 0, cut = -1;
      for (let q = 1; q < t.length; q++) { if (t[q].k === '(') depth++; else if (t[q].k === ')') depth--; else if (depth === 0 && PREP.has(t[q].k)) { cut = q; break; } }
      const h = cut > 0 ? t.slice(0, cut) : t, tt = cut > 0 ? trimTokens(t.slice(cut)) : [];
      if (cut > 0) hits++;
      heads.push({ key: keyOf(h), text: joinText(trimTokens(h)), len: h.length }); tails.push({ key: keyOf(tt), text: joinText(tt), len: tt.length });
    });
    const nh = new Set(heads.map((v) => v.key)).size, nt = new Set(tails.map((v) => v.key)).size;
    const combos = new Set(heads.map((h, q) => h.key + '|' + tails[q].key)).size;
    if (hits >= 0.6 * idx.length && nh >= 2 && nt >= 2 && combos > Math.max(nh, nt)) {
      const tk = [...new Set(tails.map((v) => v.key).filter(Boolean))];
      return wrap([{ vals: heads, label: null }, { vals: tails, label: valueLabelRules(tk) || 'Local' }]);
    }
    return null;
  }

  /* ---------- tipo de uma oração (1ª palavra relevante) ---------- */
  function clauseType(toks) {
    for (let i = 0; i < toks.length; i++) {
      const k = toks[i].k;
      if (PUNCT.has(k) || LEAD.has(k) || k === 'ATE' || k === '=') continue;
      if (isNum(k)) { const nx = toks[i + 1]; const u = nx && !isNum(nx.k) && !PUNCT.has(nx.k) && !STOP.has(nx.k) ? nx.k : ''; return '#' + u; }
      return k;
    }
    return '∅';
  }

  /* ---------- rótulo "vazio" ---------- */
  function emptyLabel(nonEmpty) {
    if (nonEmpty.length === 1) {
      const t = nonEmpty[0].label; let m;
      if ((m = /^(INCLUSO|INCLUSIVE|INCLUINDO|COM)\s+(.+)$/i.exec(t))) return 'SEM ' + m[2];
      if (/^TRANSVERSAL$/i.test(t)) return 'LONGITUDINAL';
    }
    return 'Não especificado';
  }

  /* ---------- monta um fator a partir dos valores por membro ---------- */
  function buildFactor(vals, label) {
    const counts = new Map();
    vals.forEach((v) => { const e = counts.get(v.key) || { key: v.key, texts: new Map(), count: 0 }; e.count++; e.texts.set(v.text, (e.texts.get(v.text) || 0) + 1); counts.set(v.key, e); });
    const values = [...counts.values()].map((e) => ({ key: e.key, label: [...e.texts.entries()].sort((a, b) => b[1] - a[1])[0][0], count: e.count }));
    const nonEmpty = values.filter((v) => v.key);
    values.forEach((v) => { if (!v.key) { v.label = emptyLabel(nonEmpty); v.empty = true; } });
    const firstNum = (k) => { const m = /(\d+(?:,\d+)?)/.exec(k); return m ? parseFloat(m[1].replace(',', '.')) : Infinity; };
    const numeric = nonEmpty.filter((v) => isFinite(firstNum(v.key)) && v.key.split(' ').length <= 6).length >= 0.7 * nonEmpty.length;
    const rank = (k) => { const t = k.split(' '); const i = t.findIndex(isNum); return i > 0 && t[i - 1] === 'ATE' ? 0 : 1; }; // "ATÉ 1,5" antes de "DE 1,5 ATÉ 3,0"
    values.sort((a, b) => (a.empty - b.empty) || (numeric ? (firstNum(a.key) - firstNum(b.key)) || (rank(a.key) - rank(b.key)) || a.key.localeCompare(b.key) : a.label.localeCompare(b.label, 'pt-BR')));
    refine(values, label);
    return { label: values._label || label, values, vals };
  }
  /* Palavra inicial comum ("SEÇÃO CIRCULAR | SEÇÃO RETANGULAR") vira o rótulo do fator e sai dos valores */
  function refine(values, label) {
    const ne = values.filter((v) => !v.empty);
    if (ne.length < 2) return;
    const toks = ne.map((v) => F.tokenize(v.label));
    const w = toks[0][0] && toks[0][0].k;
    if (!w || isNum(w) || !meaningful(w) || !toks.every((t) => t.length > 1 && t[0].k === w)) return;
    if (!LABEL_KEY[w] && label && !/^Tipo|Opção$/.test(label) && label.toUpperCase() !== w) return;
    values._label = LABEL_KEY[w] || U.cap(toks[0][0].t.replace(/\.$/, ''));
    ne.forEach((v, i) => {
      let t = toks[i].slice(1);
      const rng = t.some((x) => x.k === 'ATE');
      while (t.length > 1 && (t[0].k === '=' || t[0].k === ':' || (!rng && (t[0].k === 'DE' || t[0].k === 'POR' || t[0].k === 'EM')))) t = t.slice(1);
      v.label = joinText(t);
    });
  }

  /* ---------- constrói uma família (árvore) ---------- */
  function makeFamily(list, base) {
    const n = list.length;
    // 1) núcleo
    const A = analyze(list.map((c) => c.head));
    const R = A.R;
    const factors = [];
    A.slots.forEach((s) => {
      const vkeys = [...new Set(s.vals.map((v) => v.key).filter(Boolean))];
      const before = s.a >= 0 ? R.slice(0, s.a + 1).filter((x) => meaningful(x.k) && !UNITS.has(x.k)) : [];
      const after = R.slice(s.b).filter((x) => meaningful(x.k) && !UNITS.has(x.k));
      const neVals = s.vals.filter((v) => v.key);
      if (new Set(neVals.map((v) => v.key)).size === 1 && neVals[0].len <= 3 && !valueLabelRules([neVals[0].key])) {
        const f = buildFactor(s.vals, U.cap(neVals[0].text)); f.src = 'head'; factors.push(f); return;
      }
      let label = valueLabelRules(vkeys);
      const lastB = before.length ? before[before.length - 1].k : '';
      if (!label && LABEL_KEY[lastB]) label = LABEL_KEY[lastB];
      if (!label && before.length) label = U.cap(joinText(before.slice(-1)));
      if (!label && after.length) label = U.cap(joinText(after.slice(0, 1)));
      const f = buildFactor(s.vals, label || 'Tipo'); f.src = 'head'; factors.push(f);
    });
    // 2) orações tipadas
    const typeInfo = new Map();
    list.forEach((c, idx) => c.rest.forEach((cl, p) => {
      const e = typeInfo.get(cl.type) || { t: cl.type, pos: 0, cnt: 0, members: new Set() };
      e.pos += (p + 1) / (c.rest.length + 1); e.cnt++; e.members.add(idx); typeInfo.set(cl.type, e);
    }));
    const types = [...typeInfo.values()].sort((a, b) => a.pos / a.cnt - b.pos / b.cnt);
    const groups = [];
    for (const t of types) {
      const last = groups[groups.length - 1];
      if (last && t.members.size < n && last.members.size < n && [...t.members].every((m) => !last.members.has(m))) {
        last.types.push(t.t); t.members.forEach((m) => last.members.add(m));
      } else groups.push({ types: [t.t], members: new Set(t.members) });
    }
    const constClauses = [];
    const GENERIC = new Set(['USO', 'TIPO', 'MODELO', 'SISTEMA', 'CONJUNTO', 'PARA']);
    for (const g of groups) {
      const tl = list.map((c) => {
        const cls = c.rest.filter((cl) => g.types.includes(cl.type));
        return cls.length ? trimTokens(cls.flatMap((cl, i) => i ? [{ t: ',', k: ',' }, ...cl.toks] : cl.toks)) : [];
      });
      const vals = tl.map((toks) => ({ key: keyOf(toks), text: joinText(toks), len: toks.length }));
      if (new Set(vals.map((v) => v.key)).size <= 1) { constClauses.push(vals[0].text); continue; }
      const vkeys = [...new Set(vals.map((v) => v.key).filter(Boolean))];
      let label = valueLabelRules(vkeys);
      const t0 = g.types[0];
      const firstTok = (() => { for (const t of tl) { const x = t.find((y) => y.k === t0); if (x) return x; } return null; })();
      if (!label && g.types.length === 1 && LABEL_KEY[t0]) label = LABEL_KEY[t0];
      if (!label && g.types.length === 1 && t0[0] === '#') label = t0.length > 1 ? 'Medida (' + t0.slice(1).toLowerCase() + ')' : 'Medida';
      if (!label && g.types.length === 1 && GENERIC.has(t0)) {
        const t = tl.find((x) => x.length); const i = t.findIndex((y) => y.k === t0);
        let e = i + 1, mc = 0; while (e < t.length && mc < 2 && !PUNCT.has(t[e].k)) { if (meaningful(t[e].k)) mc++; e++; }
        label = U.cap(joinText(t.slice(i, e)));
      }
      if (!label && g.types.length === 1) label = firstTok ? U.cap(firstTok.t.replace(/\.$/, '')) : niceWord(t0);
      // oração longa com 2-3 aspectos ("APLICADA MANUALMENTE | EM PANOS DE FACHADA...") -> subdivide
      const avgWords = U.sum(vals, (v) => v.len) / Math.max(1, vals.filter((v) => v.len).length);
      const sub = vkeys.length >= 4 && avgWords > 6 ? subSplit(tl) : null;
      if (sub) {
        sub.forEach((sv, q) => {
          const lab = sv.label && !(q === 0 && label && sv.label === sub[1 % sub.length].label) ? sv.label : (q === 0 ? label : 'Detalhe');
          const f = buildFactor(sv.vals, lab || 'Opção'); f.src = 'clause'; factors.push(f);
        });
        continue;
      }
      const f = buildFactor(vals, label || 'Opção'); f.src = 'clause'; factors.push(f);
    }
    // unidade como fator quando a família mistura unidades (ex.: H × MES)
    const unitsOf = list.map((c) => base.unit(c.j));
    if (new Set(unitsOf).size > 1) { const f = buildFactor(unitsOf.map((u) => ({ key: u, text: u, len: 1 })), 'Unidade'); f.src = 'unit'; factors.push(f); }
    // 3) matriz membro -> índice do valor
    const rows = list.map((c, idx) => ({ j: c.j, v: factors.map((f) => f.values.findIndex((x) => x.key === f.vals[idx].key)) }));
    // 4) redundâncias (bijeções) e ordem "grosso -> fino"
    const det = (fx, fy) => { const m = new Map(); for (const r of rows) { const k = r.v[fx]; if (m.has(k) && m.get(k) !== r.v[fy]) return false; m.set(k, r.v[fy]); } return true; };
    const keep = factors.map(() => true);
    const hasEmpty = (i) => factors[i].values.some((v) => v.empty);
    for (let x = 0; x < factors.length; x++) for (let y = x + 1; y < factors.length; y++) {
      if (!keep[x] || !keep[y]) continue;
      if (det(x, y) && det(y, x)) keep[hasEmpty(y) && !hasEmpty(x) ? y : hasEmpty(x) && !hasEmpty(y) ? x : y] = false;
    }
    const order = factors.map((f, i) => i).filter((i) => keep[i]);
    for (let pass = 0; pass < 3; pass++) {
      for (let a = 0; a < order.length; a++) for (let b = a + 1; b < order.length; b++) {
        const X = order[a], Y = order[b];
        if (det(X, Y) && !det(Y, X) && factors[Y].values.length < factors[X].values.length) { order.splice(b, 1); order.splice(a, 0, Y); }
      }
    }
    const fin = order.map((i, pos) => { const f = factors[i]; return { id: pos, label: f.label, values: f.values.map(({ key, label, count, empty }) => ({ key, label, count, empty: !!empty })) }; });
    const members = rows.map((r) => ({ j: r.j, v: order.map((i) => r.v[i]) }));
    // 5) título = trechos constantes do núcleo até ter ≥ 3 palavras relevantes
    const parts = []; let last = -1;
    for (const s of A.slots) { parts.push(R.slice(last + 1, Math.max(last + 1, s.a + 1))); last = s.b - 1; }
    parts.push(R.slice(last + 1));
    let tt = [];
    for (const p of parts) {
      let q = p; const cut = q.findIndex((x) => x.k === '(' || x.k === ','); if (cut >= 0) q = q.slice(0, cut);
      tt = tt.concat(q);
      if (tt.filter((x) => meaningful(x.k) && !TAIL.has(x.k)).length >= 3 || cut >= 0) break;
    }
    while (tt.length && (PUNCT.has(tt[tt.length - 1].k) || STOP.has(tt[tt.length - 1].k) || TAIL.has(tt[tt.length - 1].k))) tt.pop();
    let title = joinText(tt);
    if (title.split(' ').length <= 2) {
      const extra = constClauses.filter(Boolean).slice(0, 3).filter((t) => t.split(' ').length <= 4);
      if (extra.length) title += ', ' + extra.join(', ');
    }
    const units = [...new Set(list.map((c) => base.unit(c.j)))];
    return { title: title || 'Serviço', factors: fin, members, units, size: n };
  }

  /* ---------- agrupamento recursivo por início do núcleo ---------- */
  function cluster(list, k, base, out, depth) {
    const groups = new Map();
    for (const c of list) { const key = c.head.slice(0, k).filter((x) => !PUNCT.has(x.k)).map((x) => x.k).join(' '); (groups.get(key) || groups.set(key, []).get(key)).push(c); }
    for (const [, g] of groups) {
      const fam = makeFamily(g, base);
      if (g.length > 1 && depth < 8) {
        const long = fam.factors.some((f) => f.values.length > 1 && U.sum(f.values, (v) => (v.label || '').split(' ').length) / f.values.length > 9);
        const bad = fam.factors.length > 6 || long || fam.members.length !== new Set(fam.members.map((m) => m.v.join())).size;
        if (bad && g.some((c) => c.head.length > k)) { cluster(g, k + 1, base, out, depth + 1); continue; }
      }
      out.push(fam);
    }
  }

  /* Prepara as descrições de um conjunto de composições */
  function prep(base, js) {
    const C = base.raw.comp;
    const list = js.map((j) => {
      const text = F.cleanText(C.d[j]);
      const cls = F.splitClauses(text).map((s) => F.tokenize(s));
      return { j, text, head: cls[0] || [], rest: cls.slice(1).map((toks) => ({ toks })) };
    });
    fuzzyCanon(list.flatMap((c) => [c.head, ...c.rest.map((r) => r.toks)]));
    list.forEach((c) => c.rest.forEach((r) => (r.type = clauseType(r.toks))));
    return list;
  }

  /* API: famílias (árvores) de um caderno/grupo — com cache */
  const cache = new WeakMap();
  F.forGroup = function (base, gi) {
    let m = cache.get(base); if (!m) cache.set(base, (m = new Map()));
    if (m.has(gi)) return m.get(gi);
    const C = base.raw.comp; const js = [];
    for (let j = 0; j < base.nComp; j++) if (C.g[j] === gi) js.push(j);
    const list = prep(base, js);
    list.sort((a, b) => keyOf(a.head).localeCompare(keyOf(b.head)));
    const fams = []; cluster(list, 1, base, fams, 0);
    fams.sort((a, b) => (b.size > 1) - (a.size > 1) || a.title.localeCompare(b.title, 'pt-BR'));
    fams.forEach((f, i) => { f.id = i; f.gi = gi; });
    const res = { gi, name: base.raw.grupos[gi], url: base.raw.ct[gi], families: fams, count: list.length };
    m.set(gi, res); return res;
  };
  F.cached = (base, gi) => { const m = cache.get(base); return !!(m && m.has(gi)); };

  /* Localiza a família e o caminho (valores) de uma composição */
  F.locate = function (base, code) {
    const j = base.compIdx.get(+code); if (j == null) return null;
    const g = F.forGroup(base, base.raw.comp.g[j]);
    for (const f of g.families) { const m = f.members.find((x) => x.j === j); if (m) return { group: g, family: f, path: m.v.slice() }; }
    return null;
  };
  /* Opções disponíveis de um fator dado um caminho parcial (null = livre) */
  F.available = function (fam, path, fi) {
    const ok = new Set();
    for (const m of fam.members) {
      let match = true;
      for (let q = 0; q < fam.factors.length; q++) if (q !== fi && path[q] != null && m.v[q] !== path[q]) { match = false; break; }
      if (match) ok.add(m.v[fi]);
    }
    return ok;
  };
  F.matches = (fam, path) => fam.members.filter((m) => m.v.every((v, q) => path[q] == null || path[q] === v));
  /* Completa automaticamente fatores com uma única opção possível */
  F.autoFill = function (fam, path) {
    const p = path.slice(); let changed = true;
    while (changed) {
      changed = false;
      for (let q = 0; q < fam.factors.length; q++) {
        if (p[q] != null) continue;
        const av = F.available(fam, p, q); if (av.size === 1) { p[q] = [...av][0]; changed = true; }
      }
    }
    return p;
  };
})(typeof window !== 'undefined' ? window : globalThis);

