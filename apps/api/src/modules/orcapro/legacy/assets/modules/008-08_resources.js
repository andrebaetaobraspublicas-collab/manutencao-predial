/* ==== 08_resources.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 08_resources.js
 * Histogramas de mão de obra e equipamentos, Curva S e cronograma
 * físico-financeiro a partir do modelo calculado (09_engine).
 *  Efetivo diário da função r = Σ n_r × m das atividades em andamento
 *  Apoio (subcomposições auxiliares): média H / (D × J)
 *  Custo: distribuído igualmente nos dias úteis de cada atividade.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util;
  const R = (OP.res = {});
  R.buckets = function (model, period) {
    const T = Math.max(1, model.T); const out = []; const map = new Map();
    for (let t = 0; t < T; t++) {
      const d = model.cal.date(t); let key, label;
      if (period === 'month') { key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); label = U.MESES[d.getMonth()] + '/' + String(d.getFullYear()).slice(2); }
      else { const mon = U.addDays(d, -((d.getDay() + 6) % 7)); key = U.iso(mon); label = String(mon.getDate()).padStart(2, '0') + '/' + String(mon.getMonth() + 1).padStart(2, '0'); }
      let b = map.get(key); if (!b) { b = { key, label, days: [], i: out.length }; map.set(key, b); out.push(b); }
      b.days.push(t);
    }
    out.dayIdx = new Int32Array(T); out.forEach((b) => b.days.forEach((t) => (out.dayIdx[t] = b.i)));
    return out;
  };
  R.daily = function (model, o = {}) {
    const late = o.sched === 'late'; const T = Math.max(1, model.T);
    const labor = new Map(), equip = new Map(); const cost = new Float64Array(T), price = new Float64Array(T);
    const add = (map, key, name, kind, t0, t1, v, hours) => {
      let s = map.get(key); if (!s) { s = { key, name, kind, daily: new Float64Array(T), hours: 0 }; map.set(key, s); }
      s.hours += hours || 0; for (let t = Math.max(0, t0); t < t1 && t < T; t++) s.daily[t] += v;
    };
    for (const r of model.items) {
      const D = r.days; const t0 = late ? r.LS : r.ES; const t1 = t0 + D; const P = r.prod; const m = P.m || 1;
      if (D > 0) {
        for (const x of P.rows) {
          if (x.kind === 'mo') add(labor, 'L:' + x.name, x.name, 'mo', t0, t1, x.n * m, x.H);
          else {
            add(equip, 'E:' + x.name, x.name, 'eq', t0, t1, x.n * m, x.H);
            if (o.operators !== false && x.operator) add(labor, 'L:' + x.operator, x.operator, 'op', t0, t1, x.n * m, x.avail);
          }
        }
        if (o.support !== false) for (const x of P.support) {
          const avg = x.H / (D * model.J); if (!(avg > 0)) continue;
          add(x.kind === 'mo' ? labor : equip, (x.kind === 'mo' ? 'L:' : 'E:') + x.name, x.name, x.kind, t0, t1, avg, x.H);
        }
        const dc = r.direct / D, dp = r.total / D;
        for (let t = t0; t < t1 && t < T; t++) { cost[t] += dc; price[t] += dp; }
      } else { const t = Math.min(Math.max(0, t0), T - 1); cost[t] += r.direct; price[t] += r.total; }
    }
    const sortS = (a, b) => b.hours - a.hours;
    return { T, labor: [...labor.values()].sort(sortS), equip: [...equip.values()].sort(sortS), cost, price };
  };
  R.aggregate = (series, B) => series.map((s) => ({ key: s.key, name: s.name, kind: s.kind, hours: s.hours, daily: s.daily,
    avg: B.map((b) => U.sum(b.days, (t) => s.daily[t]) / b.days.length), peak: B.map((b) => Math.max(...b.days.map((t) => s.daily[t]))),
    max: Math.max(0, ...s.daily) }));
  R.total = (series, T) => { const d = new Float64Array(T); series.forEach((s) => s.daily.forEach((v, t) => (d[t] += v))); return d; };
  R.scurve = function (model, B, withBDI) {
    const e = R.daily(model, { sched: 'early' }), l = R.daily(model, { sched: 'late' });
    const ve = withBDI ? e.price : e.cost, vl = withBDI ? l.price : l.cost;
    const tot = U.sum([...ve]); let ce = 0, cl = 0;
    return { total: tot, rows: B.map((b) => { const pe = U.sum(b.days, (t) => ve[t]), pl = U.sum(b.days, (t) => vl[t]); ce += pe; cl += pl;
      return { key: b.key, label: b.label, pe, pl, ce, cl, pce: ce / (tot || 1), pcl: cl / (tot || 1) }; }) };
  };
  R.fisfin = function (model, B, withBDI) {
    const top = model.flat.filter((r) => !r.parent);
    const rows = top.map((s) => {
      const leaf = s.isStage ? s.leaf : [s]; const vals = B.map(() => 0);
      leaf.forEach((r) => { const v = withBDI ? r.total : r.direct; const D = r.days;
        if (D > 0) { for (let t = r.ES; t < r.EF; t++) vals[B.dayIdx[Math.min(t, B.dayIdx.length - 1)]] += v / D; }
        else vals[B.dayIdx[Math.min(r.ES, B.dayIdx.length - 1)]] += v; });
      return { num: s.num, name: s.isStage ? s.node.name : s.desc, vals, total: U.sum(vals) };
    });
    const col = B.map((_, i) => U.sum(rows, (r) => r.vals[i])); const total = U.sum(col);
    let acc = 0; const cum = col.map((v) => (acc += v) / (total || 1));
    return { rows, col, total, pct: col.map((v) => v / (total || 1)), cum };
  };
})(typeof window !== 'undefined' ? window : globalThis);

