/* ==== 07_cpm.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 07_cpm.js
 * Calendário de dias úteis (feriados nacionais, Páscoa) e CPM com
 * vínculos TI/II/TT/IT (FS/SS/FF/SF) e defasagens.
 *
 *  Ida:   FS: ES_j ≥ EF_i + L    SS: ES_j ≥ ES_i + L
 *         FF: ES_j ≥ EF_i + L − D_j    SF: ES_j ≥ ES_i + L − D_j
 *  Volta: FS: LF_i ≤ LS_j − L    SS: LF_i ≤ LS_j − L + D_i
 *         FF: LF_i ≤ LF_j − L    SF: LF_i ≤ LF_j − L + D_i
 *  Folga total FT = LS − ES ; folga livre FL = menor sobra até os sucessores.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util;
  const C = (OP.cal = {});
  C.easter = (y) => { // Meeus/Jones/Butcher
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day, 12);
  };
  C.holidays = (y, o = {}) => {
    const fx = [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'], ['09-07', 'Independência'],
      ['10-12', 'N. Sra. Aparecida'], ['11-02', 'Finados'], ['11-15', 'Proclamação da República'], ['11-20', 'Consciência Negra'], ['12-25', 'Natal']];
    const out = new Map(fx.map(([md, n]) => [`${y}-${md}`, n]));
    const e = C.easter(y);
    out.set(U.iso(U.addDays(e, -2)), 'Sexta-feira Santa');
    if (o.carnaval) { out.set(U.iso(U.addDays(e, -48)), 'Carnaval'); out.set(U.iso(U.addDays(e, -47)), 'Carnaval'); }
    if (o.corpus) out.set(U.iso(U.addDays(e, 60)), 'Corpus Christi');
    return out;
  };
  C.DEFAULT = { workdays: [1, 2, 3, 4, 5], hpd: 8.8, holidays: true, carnaval: false, corpus: false, extra: [] };
  /* calendário: date(n) = n-ésimo dia útil (0 = início) */
  C.make = function (cfg, startISO) {
    cfg = Object.assign({}, C.DEFAULT, cfg || {});
    if (!cfg.workdays || !cfg.workdays.length) cfg.workdays = [1, 2, 3, 4, 5];
    const hol = new Map(); const years = new Set();
    const holidayName = (d) => {
      if (!cfg.holidays) return null;
      const y = d.getFullYear(); if (!years.has(y)) { years.add(y); C.holidays(y, cfg).forEach((n, k) => hol.set(k, n)); }
      return hol.get(U.iso(d)) || null;
    };
    const isWork = (d) => cfg.workdays.includes(d.getDay()) && !holidayName(d) && !(cfg.extra || []).includes(U.iso(d));
    let d0 = U.parseISO(startISO || U.iso(new Date())); let g = 0;
    while (!isWork(d0) && g++ < 60) d0 = U.addDays(d0, 1);
    const days = [d0];
    const date = (n) => {
      n = Math.max(0, Math.floor(n));
      while (days.length <= n) { let d = U.addDays(days[days.length - 1], 1); let q = 0; while (!isWork(d) && q++ < 60) d = U.addDays(d, 1); days.push(d); }
      return days[n];
    };
    return { cfg, hpd: +cfg.hpd || 8.8, start: d0, date, isWork, holidayName };
  };

  const CPM = (OP.cpm = {});
  CPM.run = function (acts, links, options = {}) {
    const n = acts.length; const idx = new Map(acts.map((a, i) => [a.id, i]));
    const D = acts.map((a) => Math.max(0, (options.fractional ? +a.dur || 0 : Math.round(+a.dur || 0))));
    const L = links.filter((l) => idx.has(l.from) && idx.has(l.to) && l.from !== l.to)
      .map((l) => ({ id: l.id, from: l.from, to: l.to, i: idx.get(l.from), j: idx.get(l.to), type: String(l.type || 'FS').toUpperCase(), lag: options.fractional ? +l.lag || 0 : Math.round(+l.lag || 0), auto: !!l.auto, skip: false }));
    const topo = () => {
      const succ = acts.map(() => []), indeg = new Array(n).fill(0);
      L.forEach((l) => { if (!l.skip) { succ[l.i].push(l); indeg[l.j]++; } });
      const q = []; indeg.forEach((d, i) => { if (!d) q.push(i); });
      const order = []; let h = 0;
      while (h < q.length) { const i = q[h++]; order.push(i); for (const l of succ[i]) if (--indeg[l.j] === 0) q.push(l.j); }
      return { order, indeg };
    };
    let { order, indeg } = topo(); let cycle = null;
    if (order.length < n) { // vínculo circular: registra e ignora as ligações internas ao ciclo
      const bad = new Set(); indeg.forEach((d, i) => { if (d > 0) bad.add(i); });
      cycle = [...bad].map((i) => acts[i].id);
      L.forEach((l) => { if (bad.has(l.i) && bad.has(l.j)) l.skip = true; });
      order = topo().order;
    }
    const pred = acts.map(() => []), succ = acts.map(() => []);
    L.forEach((l) => { if (!l.skip) { pred[l.j].push(l); succ[l.i].push(l); } });
    const ES = new Array(n).fill(0), EF = new Array(n).fill(0);
    for (const j of order) {
      let es = 0;
      for (const l of pred[j]) {
        const i = l.i; let v;
        if (l.type === 'SS') v = ES[i] + l.lag; else if (l.type === 'FF') v = EF[i] + l.lag - D[j]; else if (l.type === 'SF') v = ES[i] + l.lag - D[j]; else v = EF[i] + l.lag;
        if (v > es) es = v;
      }
      ES[j] = es; EF[j] = es + D[j];
    }
    const T = n ? Math.max(0, ...EF) : 0;
    const LS = new Array(n).fill(0), LF = new Array(n).fill(T);
    for (let q = order.length - 1; q >= 0; q--) {
      const i = order[q]; let lf = T;
      for (const l of succ[i]) {
        const j = l.j; let v;
        if (l.type === 'SS') v = LS[j] - l.lag + D[i]; else if (l.type === 'FF') v = LF[j] - l.lag; else if (l.type === 'SF') v = LF[j] - l.lag + D[i]; else v = LS[j] - l.lag;
        if (v < lf) lf = v;
      }
      LF[i] = lf; LS[i] = lf - D[i];
    }
    const TF = acts.map((_, i) => LS[i] - ES[i]);
    const FF = acts.map((_, i) => {
      let ff = T - EF[i];
      for (const l of succ[i]) {
        const j = l.j; let v;
        if (l.type === 'SS') v = ES[j] - l.lag - ES[i]; else if (l.type === 'FF') v = EF[j] - l.lag - EF[i]; else if (l.type === 'SF') v = EF[j] - l.lag - ES[i]; else v = ES[j] - l.lag - EF[i];
        if (v < ff) ff = v;
      }
      return Math.max(0, Math.min(ff, TF[i]));
    });
    return { order, ES, EF, LS, LF, TF, FF, crit: TF.map((t) => t <= 0), T, cycle, links: L, D };
  };
  /* "3; 4II+2; 7TT-1" <-> vínculos (TI=FS, II=SS, TT=FF, IT=SF) */
  const PT = { TI: 'FS', II: 'SS', TT: 'FF', IT: 'SF', FS: 'FS', SS: 'SS', FF: 'FF', SF: 'SF' };
  const TP = { FS: '', SS: 'II', FF: 'TT', SF: 'IT' };
  CPM.parsePred = function (str, numToId) {
    const links = [], errs = [];
    String(str || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
      const m = /^(\d+)\s*(FS|SS|FF|SF|TI|II|TT|IT)?\s*(?:([+-])\s*(\d+)\s*(?:d|dias?)?)?$/i.exec(s);
      const id = m && numToId(+m[1]);
      if (!m || !id) { errs.push(s); return; }
      links.push({ from: id, type: PT[(m[2] || 'FS').toUpperCase()], lag: m[3] ? (m[3] === '-' ? -1 : 1) * +m[4] : 0 });
    });
    return { links, errs };
  };
  CPM.fmtPred = (l, idToNum) => `${idToNum(l.from)}${TP[l.type] || ''}${l.lag ? (l.lag > 0 ? '+' : '') + l.lag : ''}`;
  CPM.typeName = (t) => ({ FS: 'Término→Início', SS: 'Início→Início', FF: 'Término→Término', SF: 'Início→Término' }[t] || t);
})(typeof window !== 'undefined' ? window : globalThis);


