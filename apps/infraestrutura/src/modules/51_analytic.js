/* ==== 51_analytic.js — composições analíticas de Administração Local, Mobilização e Canteiro ==== */
/* As calculadoras passam a gravar no orçamento composições próprias ANALÍTICAS (não mais valores cotados):
 * insumos e custos horários do SICRO com os coeficientes calculados pelas premissas de cada manual, e insumos
 * próprios para as parcelas sem insumo SICRO (custos diversos, pedágios, áreas do canteiro). Uma linha de
 * conciliação garante que o custo da composição seja exatamente o resultado da calculadora. */
(function (G) {
  'use strict';
  const OP = G.OP, A = OP.app, S = OP.sicro;
  const AN = (OP.analytic = {});
  const r2 = (v) => Math.round(v * 100) / 100;
  const leaves = (pj) => { const out = []; const walk = (n) => { for (const c of n.children || []) { if (c.kind === 'stage') walk(c); else out.push(c); } }; walk(pj.root); return out; };
  /* soma das parcelas pela regra das composições próprias (centavos) */
  const partsCents = (items, inputs, uf, rg) => {
    const b = A.base; let t = 0;
    for (const x of items) {
      let p = null;
      if (x.type === 'C') p = b.compCost(x.code, uf, rg);
      else { const own = inputs.find((y) => y.code === x.code); if (own) p = Math.round(r2(own.price) * 100); else { const i = b.insIdx.get(x.code); if (i != null) p = b.insPrice(i, 0, rg)[0]; } }
      if (p != null && Number.isFinite(p)) t += S.ownPart(x.coef, p);
    }
    return t;
  };
  AN.write = (pj, o) => {
    const live = A.pj === pj && Array.isArray(A.customs) && Array.isArray(A.inputs);
    const cat = (pj.catalog = pj.catalog || { v: 1, inputs: [], compositions: [] });
    const ins = live ? A.inputs : (cat.inputs = cat.inputs || []), comps = live ? A.customs : cat.compositions;
    /* conciliação exata com o resultado da calculadora */
    const target = Math.round(o.total * 100), sum = partsCents(o.items, o.inputs, pj.uf, pj.rg), res = target - sum;
    const inputs = o.inputs.map((x) => Object.assign({}, x, { price: r2(x.price) })), items = o.items.slice();
    if (Math.abs(res) >= 0.5) {
      /* a diferença é absorvida por um insumo próprio de coeficiente 1 (custos diversos, pedágios, canteiro industrial); sem ele, cria-se a linha de conciliação */
      const adj = inputs.find((x) => items.some((y) => y.code === x.code && y.coef === 1) && x.price + res / 100 > 0);
      if (adj) adj.price = r2(adj.price + Math.round(res) / 100);
      else if (res > 0) { const code = o.prefix + '-CONC'; inputs.push({ code, desc: 'Conciliação com o resultado da calculadora (arredondamentos e preços de referência)', unit: 'un', price: Math.round(res) / 100 }); items.push({ type: 'I', code, coef: 1 }); }
    }
    for (let k = ins.length - 1; k >= 0; k--) if (String(ins[k].code).startsWith(o.prefix + '-') && !inputs.some((x) => x.code === ins[k].code)) ins.splice(k, 1);
    for (const x of inputs) {
      const v = { id: x.code, code: x.code, desc: x.desc, unit: x.unit, cls: x.cls || 'SERVIÇOS', taxProfile: x.taxProfile || '', prices: [{ uf: '*', ref: '', base: r2(x.price), source: o.source }], src: 'PRÓPRIA', revision: 1, history: [], created: Date.now(), archived: false };
      const k = ins.findIndex((y) => y.code === x.code); if (k >= 0) Object.assign(ins[k], v, { revision: (ins[k].revision || 1) + 1 }); else ins.push(v);
    }
    const comp = { id: o.code, code: o.code, desc: o.desc, unit: 'un', group: 'Composições próprias', mode: 'analytic', items, src: 'PRÓPRIA', revision: 1, history: [], quote: null, quoteUF: '*', quoteRef: '', quoteSource: o.source, notes: o.notes || '', resourceKind: 'service' };
    const k = comps.findIndex((x) => x.code === o.code); if (k >= 0) { comp.revision = (comps[k].revision || 1) + 1; comps[k] = Object.assign(comps[k], comp); delete comps[k].quote; } else comps.push(comp);
    const it = leaves(pj).find((x) => [o.code, ...(o.olds || [])].includes(String(x.code)));
    if (it) { it.code = o.code; it.qty = 1; it.memo = null; } else { const st = pj.root.children.find((x) => x.kind === 'stage') || pj.root; const ni = OP.engine.item(o.code, 1); ni.dur = o.dur || 10; st.children.unshift(ni); }
    if (!live) for (const c of o.olds || []) { const i = comps.findIndex((x) => x.code === c); if (i >= 0) comps.splice(i, 1); }
    if (live) OP.register.rebuild();
    return { items: items.length, conc: res / 100 };
  };
  /* Administração Local: profissionais (meses), veículos (horas produtivas e improdutivas) e custos diversos */
  AN.al = (pj, r) => {
    const items = [], acc = new Map(), add = (type, code, coef) => { if (!(coef > 0)) return; const key = type + '|' + code; acc.set(key, (acc.get(key) || 0) + coef); };
    const a = pj.al.params;
    for (const g of r.groups) {
      if (!(g.qty > 0)) continue;
      for (const x of g.details) {
        const q = g.qty * (x.q || 0);
        if (x.kind === 'labor') { const i = A.base.insIdx.get(x.code), pc = i != null ? A.base.insPrice(i, 0, pj.rg)[0] : null; add('I', x.code, pc > 0 && x.unitRate > 0 ? q * x.unitRate / (pc / 100) : q); }
        else if (x.kind === 'vehicle') { add('C', x.code + '-CHP', q * (x.hop != null ? x.hop : a.hop)); add('C', x.code + '-CHI', q * (x.hip != null ? x.hip : a.hip)); }
        else if (x.kind === 'productive') { const chp = (A.base.compCost(x.code + '-CHP', pj.uf, pj.rg) || 0) / 100; add('C', x.code + '-CHP', chp > 0 && x.unitRate > 0 ? q * x.unitRate / chp : q * (x.hop != null ? x.hop : a.hop)); }
        else if (x.kind === 'composition') add('C', x.code, q);
      }
    }
    for (const [key, coef] of acc) { const [type, code] = key.split('|'); items.push({ type, code, coef: Math.round(coef * 1e6) / 1e6 }); }
    const inputs = []; if (r.misc > 0) { inputs.push({ code: 'IP-AL-DIV', desc: 'Custos diversos da administração local (' + (a.miscMode === 'percent' ? a.miscPct + '% do subtotal' : 'detalhados') + ')', unit: 'un', price: r.misc }); items.push({ type: 'I', code: 'IP-AL-DIV', coef: 1 }); }
    return { items, inputs, total: r.total };
  };
  /* Mobilização: horas produtivas (viagem) e improdutivas (descanso) dos transportadores e veículos, ida e volta */
  AN.mob = (pj, r) => {
    const acc = new Map(), add = (code, coef) => { if (coef > 0) acc.set(code, (acc.get(code) || 0) + coef); }; let other = 0;
    for (const x of r.equipment.concat(r.labor)) {
      if (!(x.cost > 0)) continue; const tr = x.transporterCode || x.code, tv = (x.route && x.route.time) || 0, eq = x.eq || 0, k = x.k || 2;
      const hp = eq * tv * k, hi = eq * (x.td || 0) * k; add(tr + '-CHP', hp); add(tr + '-CHI', hi);
      other += x.cost - (hp * (x.chp || 0) + hi * (x.chi || 0));
    }
    other += r.complementTotal || 0;
    const items = [...acc].map(([code, coef]) => ({ type: 'C', code, coef: Math.round(coef * 1e6) / 1e6 })), inputs = [];
    if (other > 0.005) { inputs.push({ code: 'IP-MOB-OUT', desc: 'Pedágios, custos fixos e complementos da mobilização e desmobilização', unit: 'un', price: other }); items.push({ type: 'I', code: 'IP-MOB-OUT', coef: 1 }); }
    return { items, inputs, total: r.direct };
  };
  /* Canteiro: áreas equivalentes (coberta e descoberta) pelo custo paramétrico e canteiros das instalações industriais */
  AN.can = (pj, r) => {
    const items = [], inputs = [], put = (code, desc, unit, coef, value) => { if (!(value > 0) || !(coef > 0)) return; inputs.push({ code, desc, unit, price: value / coef }); items.push({ type: 'I', code, coef: Math.round(coef * 1e4) / 1e4 }); };
    put('IP-CAN-AC', 'Área coberta equivalente do canteiro — construção, manutenção e desmobilização (CMCC e fatores do manual)', 'm²', r.eq || r.ac, r.coveredCost);
    put('IP-CAN-AD', 'Área descoberta do canteiro — pátios, acessos e áreas de estocagem', 'm²', r.ad, r.uncoveredCost);
    (r.industrials || []).forEach((x, k) => put('IP-CAN-IND' + (k + 1), 'Canteiro da instalação industrial — ' + ((x.def && x.def.label) || 'instalação'), 'un', 1, x.total));
    put('IP-CAN-CPL', 'Canteiros complementares', 'un', 1, r.complementaryCost);
    return { items, inputs, total: r.grandTotal != null ? r.grandTotal : r.mainCost };
  };
})(typeof window !== 'undefined' ? window : globalThis);

