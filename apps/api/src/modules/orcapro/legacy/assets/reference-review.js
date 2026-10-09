/* Reference-scoped interpretation overlay. Preserved legacy modules stay intact. */
(function (G) {
  'use strict';
  const O = G.OP, M = G.MOTOR;
  const reviewed = new WeakSet(), originalGroup = O.factors.forGroup;
  O.factors.forGroup = function (base, gi) {
    const group = originalGroup(base, gi);
    if (base.raw.ref !== '09/2026' || reviewed.has(group)) return group;
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
    if (O.app.base?.raw.ref === '09/2026' && !input?.ownInput &&
      ['45809', '45810'].includes(String(input?.c)) && /^BATE-ESTACAS HIDRAULICO SOBRE ESTEIRAS/.test(input.d)) return 'equipamento';
    return originalProfile(input);
  };
  O.referenceReview = { version: 'sinapi-2026-09.1', missingEquipmentPrices: ['45809', '45810'] };
})(typeof window !== 'undefined' ? window : globalThis);
