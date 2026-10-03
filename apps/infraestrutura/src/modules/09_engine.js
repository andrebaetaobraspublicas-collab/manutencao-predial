/* ==== 09_engine.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 09_engine.js
 * Modelo do projeto (EAP em árvore) e cálculo reativo completo:
 * custos (exatos SICRO) -> produtividade -> vínculos -> CPM -> datas.
 * Qualquer alteração (quantidade, equipe, UF, BDI, calendário...) gera
 * novo cálculo e todas as telas se atualizam.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util;
  const E = (OP.engine = {});
  E.SEQ = { escalonado: 'Escalonado: etapas em série, serviços sobrepostos (II + TT)', serie: 'Tudo em série (TI)',
    paralelo: 'Etapas em série, serviços em paralelo', manual: 'Manual (vínculos editados)' };
  const nextMonday = () => { const d = new Date(); d.setHours(12, 0, 0, 0); const add = ((8 - d.getDay()) % 7) || 7; return U.iso(U.addDays(d, add)); };
  E.newProject = (name) => ({ id: U.uid('pj'), name: name || 'Novo orçamento', uf: 'SP', rg: 'SD', bdi: 0.2097, dmt: { def: { LN: 0, RP: 0, P: 0, FE: 0 }, byMat: {} }, round: 'round', start: nextMonday(),
    calendar: Object.assign({}, OP.cal.DEFAULT), seq: 'escalonado', links: [], root: { id: 'root', kind: 'stage', name: '', children: [] },
    bdi2: null, created: Date.now(), updated: Date.now(), v: 1 });
  E.fix = (pj) => { const d = E.newProject(); for (const k of Object.keys(d)) if (pj[k] == null) pj[k] = d[k]; pj.calendar = Object.assign({}, OP.cal.DEFAULT, pj.calendar); return pj; };
  E.stage = (name) => ({ id: U.uid('st'), kind: 'stage', name: name || 'NOVA ETAPA', children: [] });
  E.item = (code, qty) => ({ id: U.uid('it'), kind: 'item', code, qty: +qty || 0, crew: null, teams: 1, target: null, dur: null });
  E.freeItem = (desc, unit, qty, custo, fonte) => Object.assign(E.item('', qty), { desc, unit, custo: +custo || 0, fonte: fonte || 'Cotação' });
  /* ---- operações na árvore ---- */
  E.find = (pj, id) => {
    let res = null;
    const walk = (n) => { for (let i = 0; i < n.children.length && !res; i++) { const c = n.children[i]; if (c.id === id) res = { node: c, parent: n, index: i }; else if (c.kind === 'stage') walk(c); } };
    walk(pj.root); return res;
  };
  E.move = (pj, id, dir) => { const f = E.find(pj, id); if (!f) return false; const a = f.parent.children, j = f.index + dir; if (j < 0 || j >= a.length) return false; [a[f.index], a[j]] = [a[j], a[f.index]]; return true; };
  E.indent = (pj, id) => { const f = E.find(pj, id); if (!f || f.index === 0) return false; const prev = f.parent.children[f.index - 1]; if (prev.kind !== 'stage') return false; f.parent.children.splice(f.index, 1); prev.children.push(f.node); return true; };
  E.outdent = (pj, id) => { const f = E.find(pj, id); if (!f || f.parent === pj.root) return false; const g = E.find(pj, f.parent.id); if (!g) return false; f.parent.children.splice(f.index, 1); g.parent.children.splice(g.index + 1, 0, f.node); return true; };
  E.remove = (pj, id) => {
    const f = E.find(pj, id); if (!f) return false; f.parent.children.splice(f.index, 1);
    const ids = new Set(); const col = (n) => { ids.add(n.id); (n.children || []).forEach(col); }; col(f.node);
    pj.links = pj.links.filter((l) => !ids.has(l.from) && !ids.has(l.to)); return true;
  };
  E.addStage = (pj, parentId, name) => { const p = parentId && E.find(pj, parentId); const parent = p && p.node.kind === 'stage' ? p.node : pj.root; const s = E.stage(name); parent.children.push(s); return s; };
  E.addItem = (pj, stageId, code, qty) => {
    const st = stageId && E.find(pj, stageId); let parent = st && st.node.kind === 'stage' ? st.node : null;
    if (!parent) { const last = (n) => { const s = n.children.filter((c) => c.kind === 'stage').slice(-1)[0]; return s ? last(s) : n; }; parent = last(pj.root); }
    if (parent === pj.root) { parent = E.stage('SERVIÇOS'); pj.root.children.push(parent); }
    const it = E.item(code, qty); parent.children.push(it); return { item: it, stage: parent };
  };
  /* ---- vínculos automáticos ---- */
  E.links = function (pj, flat, items) {
    const ids = new Set(items.map((r) => r.id));
    if (pj.seq === 'manual') return pj.links.filter((l) => ids.has(l.from) && ids.has(l.to));
    const L = []; const add = (a, b, type = 'FS', lag = 0) => L.push({ id: a.id + '>' + b.id + ':' + type, from: a.id, to: b.id, type, lag, auto: true });
    if (pj.seq === 'serie') { for (let i = 1; i < items.length; i++) add(items[i - 1], items[i]); return L; }
    const groups = []; let cur = null;
    flat.forEach((r) => { if (r.isStage) { cur = null; return; } if (!cur) { cur = []; groups.push(cur); } cur.push(r); });
    groups.forEach((g, gi) => {
      if (pj.seq === 'escalonado') for (let i = 1; i < g.length; i++) {
        const a = g[i - 1], b = g[i];
        if (a.days >= 2) { add(a, b, 'SS', Math.ceil(a.days / 3)); add(a, b, 'FF', b.days >= 2 ? 1 : 0); } else add(a, b, 'FS', 0);
      }
      if (gi > 0) { const prev = groups[gi - 1]; const tg = pj.seq === 'paralelo' ? g : [g[0]]; prev.forEach((a) => tg.forEach((b) => add(a, b, 'FS', 0))); }
    });
    return L;
  };
  /* ---- cálculo completo ---- */
  E.compute = function (base, pj) {
    if (base.setTransport) base.setTransport((OP.fit && OP.fit.effective(pj)) || pj.dmt || null);
    if (base.setPem) base.setPem('', null); // o catálogo SICRO permanece inalterado; ajustes viram composições próprias
    if (base.setFic && OP.fic) { const fo = OP.fic.overrides(pj, base); base.setFic(fo ? fo.sig : '', fo ? fo.arr : null); }
    if (!base.ufs.includes(pj.uf)) pj.uf = base.ufs[0];
    if (!OP.sicro.REGIMES[pj.rg]) pj.rg = 'SD';
    const J = +pj.calendar.hpd || 8.8, uf = pj.uf, rg = pj.rg, fB = 1 + (+pj.bdi || 0), fB2 = pj.bdi2 != null && isFinite(+pj.bdi2) ? 1 + (+pj.bdi2) : null;
    const flat = [], items = [], stages = [];
    const walk = (n, depth, prefix, parent) => n.children.forEach((c, i) => {
      const num = (prefix ? prefix + '.' : '') + (i + 1);
      const r = { id: c.id, node: c, depth, num, parent, isStage: c.kind === 'stage', kids: [] };
      if (parent) parent.kids.push(r);
      flat.push(r);
      if (r.isStage) { stages.push(r); walk(c, depth + 1, num, r); } else items.push(r);
    });
    walk(pj.root, 0, '', null);
    const byId = new Map(flat.map((r) => [r.id, r]));
    const bdc = base._bdCache || (base._bdCache = new Map());
    items.forEach((r, k) => {
      const it = r.node; r.seq = k + 1;
      const input = it.resourceType === 'I' ? base.ins(it.code) : null; r.input = input;
      const c = it.resourceType === 'I' ? null : base.comp(it.code); r.comp = c;
      const fixo = it.custo != null && it.custo !== '' && isFinite(+it.custo); r.fixo = fixo; r.memo = it.memo || null;
      r.fonte = it.fonte || (input ? (input.own ? 'PRÓPRIA' : 'SICRO') : c ? (c.src === 'SICRO' ? 'SICRO' : 'PRÓPRIA') : (fixo ? 'Informado' : ''));
      r.fit = +it.fit > 0 && c && c.src === 'SICRO' ? +it.fit : 0;
      r.desc = it.desc || (input ? input.desc : c ? c.desc : (fixo ? 'Item com custo informado' : `${it.resourceType === 'I' ? 'Insumo' : 'Composição'} ${it.code} não encontrado nesta base`));
      r.unit = it.unit || (input ? input.unit : c ? c.unit : '');
      let ucBase = input ? base.insPrice(input.i, base.ufIndex(uf), rg)[0] : c ? base.compCost(it.code, uf, rg) : null;
      if (r.fit && ucBase != null && base.compCostFit) { const v = base.compCostFit(it.code, uf, rg, r.fit); if (v != null) { r.fitCost = v - ucBase; ucBase = v; } }
      r.ucBase = ucBase;
      const ucR = fixo ? +it.custo : (ucBase == null ? null : ucBase / 100);          // custo unitário em reais
      const uc = ucR == null ? null : ucR * 100; r.unitCost = uc;                    // em centavos (pode ter fração)
      r.bdiDif = !!(it.bdiDif && fB2 != null); const fx = r.bdiDif ? fB2 : fB;
      r.qty = Math.max(0, +it.qty || 0);
      if (uc == null) { r.unitPrice = null; r.total = 0; }
      else if (pj.round === 'none') { const pr = ucR * fx; r.unitPrice = pr * 100; r.total = Math.floor(Number((pr * r.qty).toPrecision(15)) * 100 + 1e-7); } // como TRUNC(preço × qtd; 2) da planilha
      else { r.unitPrice = pj.round === 'trunc' ? Math.floor(uc * fx + 1e-6) : Math.round(uc * fx); r.total = Math.round(r.qty * r.unitPrice); }
      r.direct = uc == null ? 0 : Math.round(r.qty * uc);
      let bd = null;
      if (c && ucBase) { const key = it.code + '|' + uf + '|' + rg + '|' + (base._tsig || '') + '|' + (r.fit || 0); bd = bdc.get(key); if (!bd) { bd = base.breakdown(it.code, uf, rg); if (r.fitCost) { const ex = bd.mo + bd.eq; bd = Object.assign({}, bd); if (ex > 0) { bd.mo += r.fitCost * bd.mo / ex; bd.eq += r.fitCost * bd.eq / ex; } else bd.out += r.fitCost; } bdc.set(key, bd); } if (fixo) { const kf = uc / ucBase; bd = { mo: bd.mo * kf, mat: bd.mat * kf, eq: bd.eq * kf, serv: bd.serv * kf, out: bd.out * kf }; } }
      else if (uc != null) { bd = { mo: 0, mat: 0, eq: 0, serv: 0, out: 0 }; bd[input && ['mo','mat','eq','serv'].includes(input.cat) ? input.cat : 'out'] = uc; }
      r.bdUnit = bd;
      r.bd = bd ? { mo: r.qty * bd.mo, mat: r.qty * bd.mat, eq: r.qty * bd.eq, out: r.qty * (bd.serv + bd.out) } : { mo: 0, mat: 0, eq: 0, out: 0 };
      r.prod = c ? OP.prod.calc(base, it, J) : OP.prod.empty(r.qty, it.dur, J);
      r.days = r.prod.days;
    });
    const links = E.links(pj, flat, items);
    const cp = OP.cpm.run(items.map((r) => ({ id: r.id, dur: r.days })), links);
    const cal = OP.cal.make(pj.calendar, pj.start);
    items.forEach((r, i) => {
      r.ES = cp.ES[i]; r.EF = cp.EF[i]; r.LS = cp.LS[i]; r.LF = cp.LF[i]; r.TF = cp.TF[i]; r.FF = cp.FF[i]; r.crit = cp.crit[i];
      r.start = cal.date(r.ES); r.end = r.days > 0 ? cal.date(r.EF - 1) : r.start;
      r.lstart = cal.date(r.LS); r.lend = r.days > 0 ? cal.date(r.LF - 1) : r.lstart;
    });
    const tot = { direct: U.sum(items, (r) => r.direct), price: U.sum(items, (r) => r.total),
      mo: U.sum(items, (r) => r.bd.mo), mat: U.sum(items, (r) => r.bd.mat), eq: U.sum(items, (r) => r.bd.eq), out: U.sum(items, (r) => r.bd.out) };
    tot.bdi = tot.price - tot.direct;
    const agg = (s) => {
      const leaf = []; const col = (x) => (x.isStage ? x.kids.forEach(col) : leaf.push(x)); col(s);
      s.leaf = leaf; s.total = U.sum(leaf, (x) => x.total); s.direct = U.sum(leaf, (x) => x.direct);
      s.ES = leaf.length ? Math.min(...leaf.map((x) => x.ES)) : 0; s.EF = leaf.length ? Math.max(...leaf.map((x) => x.EF)) : 0;
      s.days = s.EF - s.ES; s.start = cal.date(s.ES); s.end = s.EF > s.ES ? cal.date(s.EF - 1) : s.start; s.crit = leaf.some((x) => x.crit);
    };
    stages.forEach(agg);
    flat.forEach((r) => (r.weight = tot.price ? r.total / tot.price : 0));
    return { pj, base, J, uf, rg, flat, items, stages, byId, links: cp.links, cpm: cp, cal, T: cp.T, tot,
      start: cal.date(0), end: cp.T > 0 ? cal.date(cp.T - 1) : cal.date(0) };
  };
  /* ---- projeto de demonstração (códigos localizados na base carregada) ---- */
  E.DEMO = [
    { st: ['INFRAESTRUTURA', 'MOVIMENTO DE TERRA E FUNDAÇÕES'], items: [
      ['esc', [/^ESCAVACAO MECANIZADA DE VALA COM PROF\. ATE 1,5 M .*ESCAVADEIRA \(0,8 M3\), LARG\. MENOR QUE 1,5 M, EM SOLO DE 1A CATEGORIA, (EM )?LOCAIS COM BAIXO/, /^ESCAVACAO MECANIZADA DE VALA/], 180],
      ['arme', [/^MONTAGEM DE ARMADURA DE ESTACAS, DIAMETRO = 16/], 950],
      ['conb', [/^CONCRETAGEM DE BLOCOS? DE COROAMENTO/, /^CONCRETAGEM DE SAPATA/, /BALDRAME/], 28],
      ['reat', [/^REATERRO MECANIZADO DE VALA/, /^REATERRO/], 90]] },
    { st: ['SUPERESTRUTURA'], items: [
      ['form', [/^MONTAGEM E DESMONTAGEM DE FORMA DE PILARES RETANGULARES/, /^FABRICACAO DE FORMA PARA PILARES/], 210, 2],
      ['armp', [/^ARMACAO DE PILAR OU VIGA .*CA-50 DE 10,0 MM/, /^ARMACAO DE PILAR/], 1800],
      ['conp', [/^CONCRETAGEM DE PILARES/], 24]] },
    { st: ['VEDAÇÕES'], items: [['alv', [/^ALVENARIA DE VEDACAO DE BLOCOS CERAMICOS FURADOS NA HORIZONTAL DE 9X19X19/, /^ALVENARIA DE VEDACAO DE BLOCOS CERAMICOS/], 820, 3]] },
    { st: ['REVESTIMENTOS E PISOS'], items: [
      ['chap', [/^CHAPISCO APLICADO EM ALVENARIAS E ESTRUTURAS DE CONCRETO INTERNAS, COM COLHER DE PEDREIRO/, /^CHAPISCO/], 1640],
      ['mas', [/^MASSA UNICA.*FACES INTERNAS/, /^EMBOCO.*FACES INTERNAS/, /^MASSA UNICA/], 1640, 2],
      ['cp', [/^CONTRAPISO EM ARGAMASSA/], 420],
      ['piso', [/^REVESTIMENTO CERAMICO PARA PISO/], 420]] },
    { st: ['PINTURA'], items: [['pint', [/^APLICACAO MANUAL DE PINTURA COM TINTA LATEX ACRILICA EM PAREDES/, /TINTA LATEX ACRILICA/], 1640]] },
  ];
  E.DEMO_LINKS = [['esc', 'conb', 'FS', 0], ['arme', 'conb', 'FS', 0], ['conb', 'reat', 'FS', 1], ['conb', 'form', 'FS', 2], ['form', 'armp', 'SS', 2],
    ['armp', 'conp', 'FS', 0], ['form', 'conp', 'FF', 1], ['conp', 'alv', 'SS', 3], ['conp', 'alv', 'FF', 5], ['alv', 'chap', 'SS', 8], ['alv', 'chap', 'FF', 2],
    ['chap', 'mas', 'SS', 3], ['chap', 'mas', 'FF', 4], ['alv', 'cp', 'FS', 0], ['cp', 'piso', 'FS', 2], ['mas', 'pint', 'FS', 0], ['piso', 'pint', 'FS', 0]];
  E.demo = function (base) {
    if (OP.examples && OP.examples.build) return OP.examples.build('rodovia', base);
    const pj = E.newProject('Demonstração'); pj.demo = true;
    const C = base.raw.comp; const norm = C.d.map((d) => U.norm(d)); const ids = {};
    const find = (res) => { for (const re of res) for (let j = 0; j < base.nComp; j++) if (!C.s[j] && re.test(norm[j])) return C.c[j]; return null; };
    for (const blk of E.DEMO) {
      let parent = pj.root;
      for (const name of blk.st) { let s = parent.children.find((c) => c.kind === 'stage' && c.name === name); if (!s) { s = E.stage(name); parent.children.push(s); } parent = s; }
      for (const [key, res, q, teams] of blk.items) { const code = find(res); if (code == null) continue; const it = E.item(code, q); if (teams) it.teams = teams; parent.children.push(it); ids[key] = it.id; }
    }
    pj.links = E.DEMO_LINKS.filter(([a, b]) => ids[a] && ids[b]).map(([a, b, type, lag]) => ({ id: U.uid('lk'), from: ids[a], to: ids[b], type, lag }));
    pj.seq = pj.links.length >= 8 ? 'manual' : 'escalonado';
    return pj;
  };
})(typeof window !== 'undefined' ? window : globalThis);


