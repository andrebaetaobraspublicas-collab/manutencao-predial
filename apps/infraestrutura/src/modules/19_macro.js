/* ==== 19_macro.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 19_macro.js
 * Agrupa os grupos do SICRO em macrocategorias de obras de infraestrutura.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util;
  const MC = (OP.macro = {});
  /* Macrocategorias de infraestrutura pelo prefixo do grupo SICRO, informado entre parênteses */
  MC.RULES = [
    ['prel', 'Canteiro, edificações e instalações', ['09']], ['terra', 'Terraplenagem e escavações', ['55', '61', '21']],
    ['dren', 'Drenagem e obras de arte correntes', ['20', '48', '06', '07', '08', '68']], ['pav', 'Pavimentação e usinagem', ['40', '64']],
    ['oae', 'Obras de arte especiais', ['03', '04', '23', '31', '38', '42', '45', '14', '24']], ['cont', 'Contenções e geotecnia', ['54', '32', '56', '15', '12']],
    ['conc', 'Concretos e argamassas', ['11']], ['sinal', 'Sinalização e segurança viária', ['52', '37']],
    ['compl', 'Conservação, demolições e meio ambiente', ['49', '44', '16', '53']], ['ferro', 'Ferrovias', ['26', '28', '29', '30']],
    ['tunel', 'Túneis', ['62']], ['aqua', 'Portos, hidrovias e dragagem', ['17', '18', '19', '36', '71']], ['transp', 'Transportes, cargas e descargas', ['59']],
    ['outros', 'Outros serviços', []],
  ];
  MC.of = (name) => { const m = /\((\d{2})\)\s*$/.exec(String(name)); const p = m ? m[1] : ''; for (const [k, , list] of MC.RULES) if (list.includes(p)) return k; return 'outros'; };
  MC.groups = function (base) {
    if (base._macro) return base._macro;
    const cnt = new Array(base.raw.grupos.length).fill(0); base.raw.comp.g.forEach((g) => cnt[g]++);
    const by = new Map(MC.RULES.map(([k, t]) => [k, { key: k, name: t, items: [] }]));
    base.raw.grupos.forEach((g, gi) => by.get(MC.of(g)).items.push({ gi, name: g, count: cnt[gi] }));
    const order = ['prel', 'terra', 'dren', 'pav', 'oae', 'cont', 'conc', 'sinal', 'compl', 'transp', 'ferro', 'tunel', 'aqua', 'outros'];
    base._macro = order.map((k) => by.get(k)).filter((m) => m.items.length).map((m) => (m.items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), m));
    return base._macro;
  };
})(typeof window !== 'undefined' ? window : globalThis);


