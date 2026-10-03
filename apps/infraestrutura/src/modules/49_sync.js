/* ==== 49_sync.js — sincronização automática do cronograma com os demais menus ==== */
/* Sempre que o cronograma muda (equipes, produções, demonstrativos editados, vínculos, calendário, regime),
 * os itens que acompanham o prazo da obra (administração local e canteiro) são reajustados e as calculadoras
 * já aplicadas ao orçamento (Administração Local, Canteiro de Obras e Mobilização) são recalculadas e reaplicadas. */
(function (G) {
  'use strict';
  const OP = G.OP, A = OP.app;
  const SY = (OP.sync = { busy: false });
  const leaves = (pj) => { const out = []; const walk = (n) => { for (const c of n.children || []) { if (c.kind === 'stage') walk(c); else out.push(c); } }; walk(pj.root); return out; };
  /* itens com "span": duração = prazo dos demais serviços a partir do seu início */
  SY.spans = (pj, m) => {
    const sp = leaves(pj).filter((it) => it.span); if (!sp.length) return false;
    const ids = new Set(sp.map((x) => x.id)); let T = 0; for (const r of m.items) if (!ids.has(r.node.id)) T = Math.max(T, r.EF || 0);
    let ch = false; for (const r of m.items) if (ids.has(r.node.id)) { const d = Math.max(1, T - (r.ES || 0)); if (T > 0 && r.node.dur !== d) { r.node.dur = d; ch = true; } }
    return ch;
  };
  SY.sig = (m) => JSON.stringify([m.T, +m.start, m.uf, m.rg, A.base && A.base.id, m.items.map((r) => [r.node.id, r.ES, r.EF, r.days, r.prod && r.prod.m])]);
  SY.run = (pj, m0) => {
    if (SY.busy || !pj) return false; SY.busy = true; let changed = false, m = m0;
    try {
      if (SY.spans(pj, m)) { changed = true; m = OP.engine.compute(A.base, pj); }
      const sig = SY.sig(m); pj.sync = pj.sync || {};
      if (pj.sync.sig === sig || pj.autoSync === false) { pj.sync.sig = sig; return changed; }
      const log = [];
      if (OP.al && pj.al && pj.al.applied) { OP.al.syncSchedule(pj, m); OP.al.apply(pj, m, OP.al.result(pj, m)); log.push('Administração Local'); }
      if (OP.can && pj.can && pj.can.applied) { OP.can.sync(pj, m); OP.can.apply(pj, m); log.push('Canteiro de Obras'); }
      if (OP.mob && pj.mob && pj.mob.applied) { OP.mob.sync(pj, m); OP.mob.apply(pj, m); log.push('Mobilização'); }
      pj.sync = { sig, at: Date.now(), menus: log, T: m.T };
      return changed || log.length > 0;
    } catch (e) { console.warn('Sincronização com o cronograma:', e); return changed; } finally { SY.busy = false; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

