/* ==== 24_evt_core.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 24_evt_core.js
 * EVENTOGRAMA — pagamento por eventos (marcos físicos), com a mesma
 * lógica da planilha do Curso SINAPI Avançado:
 *  1) sem custos diluídos: valor do evento = Σ itens atribuídos
 *     (item atribuído a evento com subeventos → rateio igual entre eles;
 *      lista "9.1.1; 9.2.1; ..." → rateio igual entre os listados);
 *  2) com custos diluídos: × fator f = valor global / Σ eventos
 *     (itens "Diluído" ou sem evento — adm. local, EPC... — rateados
 *      proporcionalmente);
 *  3) final: eventos de execução × (1 − retenção) + eventos de
 *     recebimento com % fixo do valor global (ex.: 5% + 5%);
 *  4) prazos (dias) e multas (% por dia de atraso) por evento.
 * Também: exemplo 2 (planilha do curso) e sugestão de prazos pelo CPM.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util;
  const V = (OP.evt = {});
  V.cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return d; } return String(a).localeCompare(String(b)); };
  /* "3" | "9.1.1; 9.2.1 e 9.3.1" | "Diluído" | "" */
  V.parse = (s) => {
    const t = String(s == null ? '' : s).trim(); if (!t) return null;
    if (/^dilu/i.test(U.deaccent(t))) return { dil: true, codes: [] };
    return { dil: false, codes: t.split(/\s*(?:;|,|\s+e\s+)\s*/i).map((x) => x.trim().replace(/\.$/, '')).filter(Boolean) };
  };
  V.cfg = (pj) => { if (!pj.evt) pj.evt = { events: [], fixos: [], sim: {}, tab: 'map' }; const e = pj.evt; e.events = e.events || []; e.fixos = e.fixos || []; e.sim = e.sim || {}; return e; };
  V.tree = (events) => {
    const list = events.filter((e) => e && String(e.code || '').trim());
    const by = new Map(); list.forEach((e) => { const c = String(e.code).trim(); if (!by.has(c)) by.set(c, { code: c, ev: e, kids: [], parent: null, depth: 0 }); });
    const parentOf = (c) => { let p = c; while (p.includes('.')) { p = p.slice(0, p.lastIndexOf('.')); if (by.has(p)) return p; } return null; };
    for (const n of by.values()) { n.parent = parentOf(n.code); if (n.parent) by.get(n.parent).kids.push(n.code); }
    for (const n of by.values()) { n.kids.sort(V.cmp); let d = 0, p = n.parent; while (p) { d++; p = by.get(p).parent; } n.depth = d; }
    const roots = [...by.values()].filter((n) => !n.parent).map((n) => n.code).sort(V.cmp);
    const dfs = []; const walk = (c) => { dfs.push(c); by.get(c).kids.forEach(walk); }; roots.forEach(walk);
    return { by, roots, dfs };
  };
  /* atribuição efetiva: a do item ou, se vazia, a da etapa mais próxima */
  V.efetiva = (r) => {
    const own = r.node.evento != null ? String(r.node.evento).trim() : '';
    if (own) return { a: own, src: 'item' };
    for (let p = r.parent; p; p = p.parent) { const a = p.node.evento != null ? String(p.node.evento).trim() : ''; if (a) return { a, src: 'etapa ' + p.num }; }
    return { a: '', src: '' };
  };
  V.compute = (model, pj) => {
    const cfg = V.cfg(pj); const tr = V.tree(cfg.events); const T = model.tot.price;
    const leaf = new Map(tr.dfs.map((c) => [c, 0])); const ids = new Map(tr.dfs.map((c) => [c, new Set()]));
    const dist = (c, amt, id) => { const n = tr.by.get(c); if (n.kids.length) n.kids.forEach((k) => dist(k, amt / n.kids.length, id)); else { leaf.set(c, leaf.get(c) + amt); ids.get(c).add(id); } };
    let dil = 0; const cnt = { ok: 0, dil: 0, none: 0, err: 0 }; const rows = new Map();
    for (const r of model.items) {
      const { a, src } = V.efetiva(r); const ps = V.parse(a); let status;
      if (!ps) status = 'none'; else if (ps.dil) status = 'dil';
      else if (!ps.codes.length || ps.codes.some((c) => !tr.by.has(c))) status = 'err';
      else status = 'ok';
      if (status === 'ok') ps.codes.forEach((c) => dist(c, r.total / ps.codes.length, r.id)); else dil += r.total;
      cnt[status]++; rows.set(r.id, { a, src, status, codes: ps && !ps.dil ? ps.codes : [], bad: ps && !ps.dil ? ps.codes.filter((c) => !tr.by.has(c)) : [] });
    }
    const v1 = new Map(); const itemsOf = new Map();
    const val = (c) => { const n = tr.by.get(c); let v; const s = new Set(ids.get(c)); if (n.kids.length) { v = 0; n.kids.forEach((k) => { v += val(k); itemsOf.get(k).forEach((x) => s.add(x)); }); } else v = leaf.get(c); v1.set(c, v); itemsOf.set(c, s); return v; };
    const S = tr.roots.reduce((s, c) => s + val(c), 0); const f = S > 0 ? T / S : 0;
    const fixos = cfg.fixos.filter((x) => x && String(x.code || '').trim()); const R = fixos.reduce((s, x) => s + (+x.pct || 0), 0);
    const events = tr.dfs.map((c) => { const n = tr.by.get(c), e = n.ev, a = v1.get(c), b = a * f, fin = b * (1 - R);
      return { code: c, desc: e.desc || '', depth: n.depth, leaf: !n.kids.length, parent: n.parent, v1: a, v2: b, v3: fin, p1: S ? a / S : 0, p2: T ? b / T : 0, p3: T ? fin / T : 0, prazo: e.prazo, multa: e.multa, ev: e, items: itemsOf.get(c) }; });
    const fx = fixos.map((x) => ({ code: String(x.code).trim(), desc: x.desc || '', v3: (+x.pct || 0) * T, p3: +x.pct || 0, prazo: x.prazo, multa: x.multa, fixo: true, ev: x }));
    return { tr, events, fixos: fx, byCode: new Map(events.map((e) => [e.code, e])), S, T, f, R, dil, cnt, rows, total3: events.filter((e) => !e.parent).reduce((s, e) => s + e.v3, 0) + fx.reduce((s, x) => s + x.v3, 0) };
  };
  /* dia (corrido, 1 = início) de conclusão previsto pelo cronograma para cada evento */
  V.previsto = (model, E) => {
    const byId = model.byId; const d0 = model.start; const out = new Map();
    for (const e of E.events) {
      let fim = null; e.items.forEach((id) => { const r = byId.get(id); if (r && r.end && (!fim || r.end > fim)) fim = r.end; });
      if (fim) out.set(e.code, Math.round((fim - d0) / 864e5) + 1);
    }
    return out;
  };
  V.multa = (e, dia) => { const pz = +e.prazo, m = +e.multa; if (!(dia > 0) || !(pz > 0)) return { atraso: 0, valor: 0 }; const atraso = Math.max(0, Math.round(dia) - pz); return { atraso, valor: atraso * (m || 0) * e.v3 }; };
  /* eventos a partir da EAP (etapas de 1º nível; subetapas viram subeventos quando a etapa não tem itens diretos) */
  V.fromEAP = (pj, model) => {
    const ev = []; const setEv = (r, code) => { r.node.evento = code; };
    model.flat.filter((r) => r.isStage && !r.parent).forEach((s) => {
      ev.push({ code: s.num, desc: U.cap(s.node.name), prazo: null, multa: 0.0002 }); setEv(s, s.num);
      const subs = s.kids.filter((k) => k.isStage), diretos = s.kids.filter((k) => !k.isStage);
      if (subs.length > 1 && !diretos.length) subs.forEach((k) => { ev.push({ code: k.num, desc: U.cap(k.node.name) }); setEv(k, k.num); });
      else subs.forEach((k) => (k.node.evento = ''));
    });
    const n = ev.filter((e) => !e.code.includes('.')).length;
    const cfg = V.cfg(pj); cfg.events = ev;
    cfg.fixos = [{ code: String(n + 1), desc: 'Recebimento provisório', pct: 0.05, prazo: null, multa: 0.0007 }, { code: String(n + 2), desc: 'Recebimento definitivo', pct: 0.05, prazo: null, multa: 0.0007 }];
    model.items.forEach((r) => { if (r.node.evento && !/^dilu/i.test(U.deaccent(String(r.node.evento)))) r.node.evento = ''; });
  };
  /* renomear código (e subárvore) atualizando as atribuições */
  V.renomear = (pj, antigo, novo) => {
    const cfg = V.cfg(pj); const re = (c) => (c === antigo || c.startsWith(antigo + '.') ? novo + c.slice(antigo.length) : c);
    cfg.events.forEach((e) => (e.code = re(String(e.code))));
    const fix = (n) => { if (n.evento) { const ps = V.parse(n.evento); if (ps && !ps.dil) n.evento = ps.codes.map(re).join('; '); } (n.children || []).forEach(fix); };
    pj.root.children.forEach(fix);
  };
  V.remover = (pj, code) => {
    const cfg = V.cfg(pj); const del = (c) => c === code || c.startsWith(code + '.');
    cfg.events = cfg.events.filter((e) => !del(String(e.code)));
    const fix = (n) => { if (n.evento) { const ps = V.parse(n.evento); if (ps && !ps.dil) n.evento = ps.codes.filter((c) => !del(c)).join('; '); } (n.children || []).forEach(fix); };
    pj.root.children.forEach(fix);
  };

  /* =================== exemplos incorporados =================== */
  const X = (OP.examples = OP.examples || {});
  X.build = (key, base) => {
    const ex = X[key]; const E = OP.engine;
    const pj = E.newProject(ex.meta.nome); Object.assign(pj, { uf: ex.meta.uf, rg: ex.meta.rg, bdi: ex.meta.bdi, round: 'none', exemplo: key });
    pj.info = { local: ex.meta.local, autor: ex.meta.autor, precoBase: ex.meta.precoBase, encargos: ex.meta.encargos };
    const mk = (n) => {
      if (n.s != null) { const st = E.stage(n.s); st.children = n.c.map(mk); return st; }
      const [code, fonte, desc, unit, qty, custo, evento, memo, sug] = n;
      const it = E.item(code, qty); Object.assign(it, { fonte, desc, unit, custo, evento: evento || '' }); if (memo) it.memo = memo; if (sug) it.sug = sug; return it;
    };
    pj.root.children = ex.tree.map(mk);
    pj.memos = JSON.parse(JSON.stringify(ex.memos));
    pj.evt = { events: ex.events.map((e) => ({ ...e })), fixos: ex.fixos.map((x) => ({ ...x })), sim: {}, tab: 'fin', correcoes: ex.correcoes || [] };
    // planejamento do exemplo: etapas em série, serviços em paralelo; equipes adicionais para nenhum serviço passar de 20 dias úteis (obra de ~10 meses, como na aba MCI-01)
    pj.seq = 'paralelo'; let m = E.compute(base, pj);
    m.items.forEach((r) => { if (r.days > 20) r.node.teams = Math.ceil(r.days / 20); }); m = E.compute(base, pj);
    if (OP.bdiui && OP.bdiui.defaultsFor) {
      pj.bdiCfg = OP.bdiui.defaultsFor(m.tot);
      pj.bdiCfg.applied.p = { mode: 'planilha', metodo: 'da planilha do exemplo', ano: '—', bdi: ex.meta.bdi, valor: ex.meta.bdi, ivaeq: 0, date: Date.now(), rows: ex.bdi.rows.map((r) => [r[0], r[1], r[2]]), eq: ex.bdi.eq, memoria: [['Origem', ex.bdi.titulo], ['Encargos sociais (horista / mensalista)', `${(ex.meta.encargos.horista * 100).toFixed(2).replace('.', ',')}% / ${(ex.meta.encargos.mensalista * 100).toFixed(2).replace('.', ',')}%`], ['Preço base', ex.meta.precoBase]] };
    }
    return pj;
  };
})(typeof window !== 'undefined' ? window : globalThis);

