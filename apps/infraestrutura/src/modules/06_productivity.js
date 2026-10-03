/* ==== 06_productivity.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 06_productivity.js
 * Dimensionamento de equipes e durações a partir dos coeficientes SICRO.
 *
 *  Mão de obra r:  c_r = h/un   ->  H_r = c_r × Q
 *  Equipamento e:  h_e = CHP_e + CHI_e  (horas de equipe por unidade)
 *  Equipe com n_i recursos:  T = max_i (h_i / n_i)      [h/un, gargalo]
 *  m equipes:  Dh = Q × T / m   ;   dias = ⌈Dh / J⌉  (J = h/dia)
 *  Prazo-alvo D*:  m = ⌈Q × T / (D* × J)⌉
 *  Equipamento: horas produtivas = Q × CHP ; improdutivas = n·m·Dh − Q × CHP
 *  Equipe base: menor k (unidades do recurso de maior h) com eficiência
 *  Σh / (T × Σn) ≥ 80 %,  n_i = max(1, round(k · h_i / h_max)).
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util;
  const P = (OP.prod = {});
  P.EFF_MIN = 0.8;
  const cache = new WeakMap();
  P.resources = function (base, code) {
    let m = cache.get(base); if (!m) cache.set(base, (m = new Map()));
    const k = String(code); if (m.has(k)) return m.get(k);
    const r = base.resources(OP.code(code));
    r.direct.sort((a, b) => b.h - a.h); r.support.sort((a, b) => b.h - a.h);
    m.set(k, r); return r;
  };
  P.clearCache = (base) => cache.delete(base);
  /* equipe base equilibrada */
  P.baseCrew = function (res) {
    const list = res.filter((r) => r.h > 0 && !r.monthly);
    /* SICRO: a equipe base é a equipe publicada na composição (quantidades de mão de obra
       e de equipamentos arredondadas para cima); T = 1 / produção da equipe. */
    if (list.length && list.every((r) => r.q > 0)) {
      const n = list.map((r) => Math.max(1, r.kind === 'eq' ? Math.ceil(r.q - 1e-9) : Math.round(r.q)));
      const T = Math.max(...list.map((r, i) => r.h / n[i])); const H = U.sum(list, (r) => r.h);
      const counts = {}; list.forEach((r, i) => (counts[r.key] = n[i]));
      return { counts, T, eff: T > 0 ? H / (T * U.sum(n)) : 0, k: 1, sicro: true };
    }
    if (!list.length) return { counts: {}, T: 0, eff: 0, k: 0 };
    const hmax = Math.max(...list.map((r) => r.h)); const H = U.sum(list, (r) => r.h);
    let best = null;
    for (let k = 1; k <= 10; k++) {
      const n = list.map((r) => Math.max(1, Math.round(k * r.h / hmax)));
      const T = Math.max(...list.map((r, i) => r.h / n[i]));
      const eff = H / (T * U.sum(n));
      const cand = { k, n, T, eff };
      if (eff >= P.EFF_MIN - 1e-9) { best = cand; break; }
      if (!best || eff > best.eff + 1e-9) best = cand;
    }
    const counts = {}; list.forEach((r, i) => (counts[r.key] = best.n[i]));
    return { counts, T: best.T, eff: best.eff, k: best.k };
  };
  /* cálculo completo de um item do orçamento */
  P.calc = function (base, it, J) {
    J = +J || 8.8;
    const Q = Math.max(0, +it.qty || 0);
    const res = P.resources(base, it.code);
    const bc = P.baseCrew(res.direct);
    const crew = it.crew || {};
    const rows = res.direct.filter((r) => r.h > 0 && !r.monthly).map((r) => ({ key: r.key, kind: r.kind, name: r.name, operator: r.operator || null, team: r.q || null,
      h: r.h, chp: r.chp || 0, chi: r.chi || 0,
      n: Math.max(1, Math.round(+(crew[r.key] != null ? crew[r.key] : bc.counts[r.key]) || 1)) }));
    let T = 0, bottleneck = null;
    rows.forEach((x) => { const t = x.h / x.n; if (t > T + 1e-12) { T = t; bottleneck = x.key; } });
    const noProd = !(T > 0);
    let m = Math.max(1, Math.round(+it.teams || 1));
    if (+it.target > 0 && !noProd && Q > 0) m = Math.max(1, Math.ceil(Q * T / (+it.target * J) - 1e-9));
    const Dh = noProd ? 0 : Q * T / m;
    let days = Q > 0 ? (noProd ? 1 : Math.max(1, Math.ceil(Dh / J - 1e-9))) : 0;
    if (+it.dur > 0) days = Math.round(+it.dur);
    const Dt = +it.dur > 0 ? days * J : Dh;
    rows.forEach((x) => {
      x.H = Q * x.h; x.avail = x.n * m * Dt;
      x.util = x.avail > 0 ? (x.kind === 'eq' ? Q * x.chp : x.H) / x.avail : 0;
      if (x.kind === 'eq') { x.HP = Q * x.chp; x.HI = Math.max(0, x.avail - x.HP); }
    });
    const sumH = U.sum(rows, (x) => x.H), sumAv = U.sum(rows, (x) => x.avail);
    const support = res.support.filter((r) => r.h > 0).map((r) => ({ key: r.key, kind: r.kind, name: r.name, h: r.h, H: Q * r.h }));
    return { Q, T, m, Dh, Dt, days, J, noProd, bottleneck, rows, support, mech: rows.some((x) => x.kind === 'eq'),
      prodHour: Dt > 0 ? Q / Dt : 0, prodDay: Dt > 0 ? Q / Dt * J : 0, eff: sumAv > 0 ? sumH / sumAv : 0, base: bc, custom: !!it.crew };
  };
  P.empty = (Q, dur, J = 8.8) => ({ Q, T: 0, m: 1, Dh: 0, Dt: dur > 0 ? Math.round(dur) * J : 0, J, days: dur > 0 ? Math.max(1, Math.round(dur)) : (Q > 0 ? 1 : 0), noProd: true, bottleneck: null, rows: [], support: [], mech: false,
    prodHour: 0, prodDay: 0, eff: 0, base: { counts: {}, T: 0, eff: 0 } });
  P.crewText = (p) => p.rows.map((x) => `${x.n * p.m} ${x.name}`).join(' + ');
})(typeof window !== 'undefined' ? window : globalThis);


