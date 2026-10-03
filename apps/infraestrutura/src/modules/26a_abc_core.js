/* ==== 26a_abc_core.js — núcleo das Curvas ABC (do OrçaPro, adaptado ao SICRO) ==== */
/* =====================================================================
 * OrçaPro — ABC de insumos, revisão 1.1 (29/09/2026)
 * Motor independente da interface. DFS iterativa por RAMO, sem teto de
 * profundidade, conserva os caminhos repetidos e não soma pais expandidos.
 * Referência: quantidade acumulada × preço da folha, sem truncar os fatores.
 * Apropriado: rateio explícito do custo direto de cada serviço por maior
 * resto. Só disponível se todas as folhas e todos os serviços têm custo.
 * Não presume crédito tributário, compra integral nem validade de cotação.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP, U = OP.util;
  const ABC = OP.abc = { version: '1.1' };
  const numCode = (v) => OP.code(v);
  const valid = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const cents = (v) => Math.round(v + 1e-8);
  const safe = (v, label) => { if (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER) throw new Error(label + ': grandeza fora da precisão numérica suportada. Revise quantidades e coeficientes.'); return v; };
  ABC.quantity = (v) => v !== 0 && Math.abs(v) < 1e-9 ? v.toExponential(6).replace('.', ',') : U.num(v, 10, 0);
  ABC.path = (tail) => { const out = []; for (let p = tail; p; p = p.parent) out.push(p); return out.reverse(); };
  // Fonte diferente ou unidade incompatível não autoriza explodir um código homônimo SICRO.
  ABC.canExpandItem = (r) => {
    if (r.node.resourceType === 'I' && r.input) return {ok:true,reason:''};
    const c = r.comp; if (!c) return { ok: false, reason: r.fixo ? 'Custo informado sem composição vinculada' : 'Composição não encontrada na base ativa' };
    const fonte = U.norm(r.node.fonte || '');
    if (/COTAC/.test(fonte)) return { ok: false, reason: 'Cotação sem analítico vinculado' };
    if (c.src === 'SICRO' && fonte && !/^SICRO\b/.test(fonte)) return { ok: false, reason: 'Fonte informada diferente de SICRO; código homônimo não foi decomposto' };
    if (r.node.unit && U.norm(r.node.unit) !== U.norm(c.unit)) return { ok: false, reason: 'Unidade do item diferente da composição vinculada' };
    return { ok: true };
  };
  // Alocação de centavos por maior resto; empates mantêm ordem determinística.
  ABC.allocate = (weights, target) => {
    if (!Number.isSafeInteger(target) || target < 0) throw new Error('Custo direto inválido para apropriação.');
    const sum = weights.reduce((s, w) => s + w, 0);
    if (!(sum > 0)) return target === 0 ? weights.map(() => 0) : null;
    const exact = weights.map((w) => target * (w / sum)), out = exact.map(Math.floor);
    let delta = target - out.reduce((s, v) => s + v, 0);
    const order = exact.map((v, i) => ({ i, rem: v - out[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i);
    if (Math.abs(delta) > weights.length + 1) throw new Error('Não foi possível conciliar os centavos da apropriação.');
    for (let i = 0; delta > 0; i++, delta--) out[order[i % order.length].i]++;
    for (let i = order.length - 1; delta < 0; i--, delta++) out[order[(i + order.length) % order.length].i]--;
    return out;
  };
  ABC.rank = (rows, mode = 'reference') => {
    const ranked = rows.map((r) => ({ ...r, value: mode === 'budget' ? r.allocated : r.reference }));
    ranked.sort((a, b) => (a.value == null) - (b.value == null) || (b.value || 0) - (a.value || 0) || String(a.code).localeCompare(String(b.code), 'pt-BR', { numeric: true }) || a.key.localeCompare(b.key));
    const total = ranked.reduce((s, r) => s + (r.value || 0), 0); let acc = 0;
    ranked.forEach((r, i) => { const prev = total ? acc / total : 0; acc += r.value || 0; r.rank = i + 1;
      r.cls = r.value == null ? 'S/C' : !(r.value > 0) || !total ? '—' : prev < 0.8 - 1e-12 ? 'A' : prev < 0.95 - 1e-12 ? 'B' : 'C';
      r.share = total && r.value != null ? r.value / total : null; r.cumulative = total && r.value != null ? acc / total : null;
    });
    return { rows: ranked, total };
  };
  ABC.generate = function* (model) {
    const base = model.base, uf = model.uf, rg = model.rg, ui = base.ufIndex(uf);
    const cache = new Map(), groups = new Map(), sources = [], issues = [];
    let maxDepth = 0, visited = 0, skipped = 0, canAllocate = true;
    const describe = (type, code) => {
      code = numCode(code); const key = type + ':' + code; if (cache.has(key)) return cache.get(key);
      let d;
      const ps = type === 'I' && base.pseudoIns ? base.pseudoIns(code, rg) : null;
      if (ps) d = { type, code, desc: ps.desc, unit: ps.unit, source: 'SICRO', nature: ps.cls, price: valid(ps.price) ? ps.price : null, sp: false, incomplete: false, reason: '', children: null };
      else if (type === 'I') {
        const i = base.ins(code), p = i ? base.insPrice(i.i, ui, rg) : [null, false];
        d = { type, code, desc: i ? i.desc : 'Insumo não encontrado na base ativa', unit: i ? i.unit : '',
          source: i?.src || base.raw.fonte || 'SICRO', nature: i ? i.cls || 'Outros' : 'Não identificado', price: valid(p[0]) ? p[0] : null,
          sp: !!p[1], incomplete: !i, reason: i ? '' : 'Cadastro de insumo ausente', children: null };
      } else {
        const c = base.comp(code), p = c ? base.compCost(code, uf, rg) : null;
        let children = null;
        if (c) {
          if (base.custom.has(code)) children = (c.mode==='quoted'?[]:c.items || []).map((x) => ({ type: x.type, code: numCode(x.code), coef: x.coef }));
          else if (c.j != null) children = OP.sicro.itOf(base, c.j).map((x) => { const t = OP.sicro.itx(x); return { type: t.type, code: t.code, coef: t.coef }; });
          else children = base.itemsOf(code, uf, rg).map((x) => ({ type: x.type, code: x.code, coef: x.coef }));
        }
        d = { type, code, desc: c ? c.desc : 'Composição não encontrada na base ativa', unit: c ? c.unit : '',
          source: c && c.src !== 'SICRO' ? c.src || 'PRÓPRIA' : base.raw.fonte || 'SICRO', nature: 'Composição sem detalhamento',
          price: valid(p) ? p : null, sp: false, incomplete: true,
          reason: !c ? 'Composição auxiliar não encontrada' : !children.length ? 'Analítico indisponível' : '', children };
      }
      cache.set(key, d); return d;
    };
    for (let itemIndex = 0; itemIndex < model.items.length; itemIndex++) {
      const r = model.items[itemIndex]; if (!(r.qty > 0)) { skipped++; continue; }
      const origin = { id: r.id, num: r.num, code: r.node.code, desc: r.desc, unit: r.unit, qty: r.qty,
        source: r.fonte, direct: valid(r.unitCost) ? r.direct : null, raw: 0, unpriced: 0,
        incomplete: 0, maxDepth: 0, entries: new Map(), notes: [], fixed: !!r.fixo, eligible: true };
      sources.push(origin);
      const add = (desc, qty, path, reason, terminalId) => {
        const price = valid(desc.price) ? desc.price : null;
        const key = JSON.stringify([desc.type, desc.source, String(desc.code), desc.unit, price, terminalId || '', reason || '']);
        const rawValue = price == null ? null : safe(qty * price, 'Custo analítico');
        let g = groups.get(key);
        if (!g) { g = { key, type: desc.type, code: desc.code, desc: desc.desc, unit: desc.unit, source: desc.source, nature: desc.nature,
          price, qty: 0, raw: 0, reference: null, allocated: 0, sp: desc.sp, incomplete: desc.incomplete,
          reason: reason || desc.reason, occurrences: [], origins: new Map(), maxDepth: 0 }; groups.set(key, g); }
        safe(g.qty += qty, 'Quantidade acumulada'); if (rawValue != null) safe(g.raw += rawValue, 'Custo acumulado');
        g.sp = g.sp || desc.sp; g.maxDepth = Math.max(g.maxDepth, path.depth); maxDepth = Math.max(maxDepth, path.depth); origin.maxDepth = Math.max(origin.maxDepth, path.depth);
        const occ = { originId: r.id, qty, raw: rawValue, path }; g.occurrences.push(occ);
        let entry = origin.entries.get(key);
        if (!entry) { entry = { key, originId: r.id, qty: 0, raw: 0, allocated: null, unpriced: price == null, paths: [] }; origin.entries.set(key, entry); g.origins.set(r.id, entry); }
        entry.qty += qty; entry.paths.push(occ); if (rawValue != null) { entry.raw += rawValue; origin.raw += rawValue; }
        if (price == null) { origin.unpriced++; origin.eligible = false; }
        if (desc.incomplete) origin.incomplete++;
        if (/ciclo|inválid/i.test(reason || '')) origin.eligible = false;
      };
      const link = { parent: null, code: r.node.code || r.num, type: r.node.resourceType === 'I' ? 'I' : 'C', coef: 1, depth: 0, desc: r.desc };
      const expand = ABC.canExpandItem(r);
      if (!expand.ok) {
        add({ type: r.comp || !r.fixo ? 'C' : 'F', code: r.node.code || 'ITEM ' + r.num, desc: r.desc,
          unit: r.unit, source: r.fonte || 'Informado', nature: /COTAC/.test(U.norm(r.fonte)) ? 'Cotação' : 'Custo informado / não detalhado',
          price: valid(r.unitCost) ? r.unitCost : null, sp: false, incomplete: true }, r.qty, link, expand.reason, r.id);
        origin.notes.push(expand.reason);
      } else {
        if (r.fixo) origin.notes.push('Árvore da base ativa; custo unitário do orçamento foi informado. O rateio não valida coeficientes ou preços históricos.');
        const active = new Set();
        const stack = [{ type: r.node.resourceType === 'I' ? 'I' : 'C', code: r.node.code, qty: r.qty, path: link }];
        while (stack.length) {
          const f = stack.pop();
          if (f.exit) { active.delete(f.key); continue; }
          visited++;
          const d = describe(f.type, f.code); const key = 'C:' + d.code;
          if (f.type === 'I') add(d, f.qty, f.path, d.reason);
          else if (active.has(key)) {
            add(d, f.qty, f.path, 'Ciclo de composições; ramo interrompido');
            issues.push({ num: r.num, code: d.code, reason: 'Ciclo de composições', path: f.path });
          } else if (!d.children || !d.children.length) {
            add(f.path.depth === 0 ? { ...d, price: r.unitCost } : d, f.qty, f.path, d.reason || 'Analítico indisponível');
          } else if (d.children.some((x) => !['I', 'C'].includes(x.type) || !valid(x.coef))) {
            add(d, f.qty, f.path, 'Coeficiente ou tipo inválido; ramo preservado sem expansão');
            issues.push({ num: r.num, code: d.code, reason: 'Coeficiente ou tipo inválido', path: f.path });
          } else {
            active.add(key); stack.push({ exit: true, key });
            const children = d.children.filter((x) => x.coef !== 0);
            if (!children.length) add({ ...d, incomplete: true }, f.qty, f.path, 'Composição com todos os coeficientes nulos');
            for (let i = children.length - 1; i >= 0; i--) {
              const x = children[i], qty = safe(f.qty * x.coef, 'Produto dos coeficientes');
              if (!qty && f.qty && x.coef) throw new Error('Produto dos coeficientes abaixo da precisão suportada; cálculo interrompido para não omitir o ramo.');
              stack.push({ type: x.type, code: x.code, qty, path: { parent: f.path, code: x.code, type: x.type, coef: x.coef, depth: f.path.depth + 1 } });
            }
          }
          if (visited % 1200 === 0) yield { item: itemIndex, count: model.items.length, visited };
        }
      }
      if (origin.direct == null || !Number.isSafeInteger(origin.direct) || origin.direct < 0) origin.eligible = false;
      if (!(origin.raw > 0) && origin.direct > 0) origin.eligible = false;
      if (origin.unpriced) origin.notes.push('Há folhas sem preço: custo de referência parcial e apropriação indisponível.');
      if (origin.direct == null) origin.notes.push('O item não tem custo no orçamento; não confundir montante conhecido das folhas com um custo completo.');
      if (!origin.notes.length) origin.notes.push('Diferença de referência decorre do truncamento entre níveis e do arredondamento do custo direto.');
      if (origin.eligible) {
        const entries = [...origin.entries.values()], allocations = ABC.allocate(entries.map((x) => x.raw), origin.direct);
        if (allocations) entries.forEach((e, i) => { e.allocated = allocations[i]; groups.get(e.key).allocated += allocations[i]; });
        else origin.eligible = false;
      }
      canAllocate = canAllocate && origin.eligible;
      yield { item: itemIndex + 1, count: model.items.length, visited };
    }
    const rows = [...groups.values()];
    rows.forEach((r) => { r.reference = r.price == null ? null : cents(r.raw); if (!canAllocate) r.allocated = null; });
    const referenceTotal = rows.reduce((s, r) => s + (r.reference || 0), 0), rawReference = sources.reduce((s, r) => s + r.raw, 0);
    safe(referenceTotal, 'Total da ABC');
    const directTotal = model.tot.direct;
    if (canAllocate && rows.reduce((s, r) => s + r.allocated, 0) !== directTotal) throw new Error('Falha de conciliação: a apropriação não fecha com o custo direto.');
    return { rows, sources, issues, canAllocate, maxDepth, visited, skipped, referenceTotal, rawReference,
      directTotal, roundingDelta: referenceTotal - rawReference, missingPrices: rows.filter((r) => r.price == null).length,
      terminalCount: rows.filter((r) => r.incomplete).length, model,
      metadata: { project: model.pj.name, uf, regime: OP.sicro.REGIMES[rg], ref: base.raw.ref, base: base.raw.fonte || 'SICRO', created: new Date().toISOString() } };
  };
  ABC.compute = (model) => { const gen = ABC.generate(model); let s; do { s = gen.next(); } while (!s.done); return s.value; };
  ABC.computeAsync = async (model, progress, cancelled) => {
    const gen = ABC.generate(model); let t = Date.now(), state;
    while (!(state = gen.next()).done) {
      if (cancelled && cancelled()) { gen.return(); return null; }
      if (Date.now() - t >= 18) { if (progress) progress(state.value); await new Promise((resolve) => setTimeout(resolve, 0)); t = Date.now(); }
    }
    return cancelled && cancelled() ? null : state.value;
  };
})(typeof window !== 'undefined' ? window : globalThis);


