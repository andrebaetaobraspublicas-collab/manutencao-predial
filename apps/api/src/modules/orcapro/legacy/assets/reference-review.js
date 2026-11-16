/* Reference-scoped interpretation overlay. Preserved legacy modules stay intact. */
(function (G) {
  'use strict';
  const O = G.OP, M = G.MOTOR;
  const reviewed = new WeakSet(), originalGroup = O.factors.forGroup;
  O.factors.forGroup = function (base, gi) {
    const group = originalGroup(base, gi);
    if (!['09/2026', '10/2026'].includes(base.raw.ref) || reviewed.has(group)) return group;
    reviewed.add(group);
    for (const family of group.families) {
      const paths = family.members.map(m => JSON.stringify(m.v));
      if (new Set(paths).size === paths.length) continue;
      const values = [], keys = new Map();
      for (const member of family.members) {
        const description = base.raw.comp.d[member.j];
        const qualifier = description.match(/\((SEM ESCAVAÇÃO PARA COLOCAÇÃO DE FÔRMAS|INCLUINDO ESCAVAÇÃO PARA COLOCAÇÃO DE FÔRMAS)\)/i)?.[1];
        const label = qualifier || description + ' · ' + base.raw.comp.c[member.j];
        if (!keys.has(label)) { keys.set(label, values.length); values.push({ key: label, label, count: 0, empty: false }); }
        const at = keys.get(label); values[at].count++; member.v.push(at);
      }
      family.factors.push({ id: 'reviewed-variant', label: 'VARIANTE', values });
    }
    return group;
  };
  const originalProfile = M.perfilBase;
  M.perfilBase = function (input) {
    // SEM PREÇO is a price status, not the economic nature of these two assets.
    // A missing official quotation remains missing. Contexts (depreciation,
    // interest, maintenance) are still resolved by the original IVA bridge.
    if (['09/2026', '10/2026'].includes(O.app.base?.raw.ref) && !input?.ownInput &&
      ['45809', '45810'].includes(String(input?.c)) && /^BATE-ESTACAS HIDRAULICO SOBRE ESTEIRAS/.test(input.d)) return 'equipamento';
    return originalProfile(input);
  };
  const originalEventDates = O.evt.previsto;
  O.evt.previsto = function (model, events) {
    const dates = originalEventDates(model, events);
    if (model.base?.raw.ref !== '10/2026') return dates;
    // A parent milestone cannot precede a child released after concrete curing.
    for (const code of events.tr.dfs.slice().reverse()) {
      const node = events.tr.by.get(code), end = dates.get(code);
      if (node.parent && end != null) dates.set(node.parent, Math.max(dates.get(node.parent) || 0, end));
    }
    return dates;
  };
  O.referenceReview = { version: 'sinapi-2026-10.2', missingEquipmentPrices: ['45809', '45810'] };
})(typeof window !== 'undefined' ? window : globalThis);
