/* ==== 19_macro.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 19_macro.js
 * Agrupa os ~170 cadernos técnicos em macrocategorias de obra.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util;
  const MC = (OP.macro = {});
  MC.RULES = [
    ['aux', 'Auxiliares: custos horários, mão de obra, parâmetros', /CUSTOS HORARIOS|DEPRECIACAO|LIVRO SINAPI|^ARGAMASSAS$|DOSAGEM|^CONCRETOS?$|AUXILIAR/],
    ['transp', 'Transportes e cargas', /TRANSPORTE|CARGA E DESCARGA|FLUVIAL/],
    ['prel', 'Serviços preliminares e canteiro', /CANTEIRO|TAPUME|LOCACAO DE OBRA|LIMPEZA|DEMOLI|REMOC|SONDAGEM|PLACA|PROTECAO COLETIVA|MOBILIZACAO|ADMINISTRA/],
    ['terra', 'Movimento de terra', /ESCAVAC|ATERRO|REATERRO|TERRAPLEN|BOTA-FORA|COMPACTAC|DESMATAMENTO|ROCADO|ESCORAMENTO DE VALA/],
    ['fund', 'Fundações e contenções', /ESTACA|FUNDAC|SAPATA|TIRANTE|CONTENC|RADIER|COROAMENTO|CORTINA|MURO|GABIAO|SOLO GRAMPEADO/],
    ['cob', 'Coberturas', /COBERTURA|TELHA|TRAMA|CALHA|RUFO|CUMEEIRA|TELHAMENTO/],
    ['estr', 'Estruturas', /FORMA|ARMACAO|CONCRETAGEM|ESTRUTURA|LAJE|PILAR|VIGA|PAREDES DE CONCRETO|ESCADA|CIMBRAMENTO|PRE-?MOLDAD|PROTENS/],
    ['alv', 'Alvenarias e vedações', /ALVENARIA|VEDAC|DRYWALL|DIVISORIA|VERGA|COBOGO|ELEMENTO VAZADO|PAREDE/],
    ['esq', 'Esquadrias, vidros e ferragens', /ESQUADRIA|PORTA|JANELA|VIDRO|ESPELHO|FERRAGE|PORTAO|GRADIL|GUARDA-CORPO|CORRIMAO/],
    ['imp', 'Impermeabilização', /IMPERMEABILIZ/],
    ['rev', 'Revestimentos, pisos e forros', /CHAPISCO|EMBOCO|MASSA UNICA|REBOCO|REVESTIMENTO|CERAMIC|AZULEJ|FORRO|GESSO|CONTRAPISO|PISO|RODAPE|SOLEIRA|PEITORIL|GRANITO|MARMORE|PORCELANATO/],
    ['pint', 'Pinturas', /PINTURA|TEXTURA|SELADOR|VERNIZ|ESMALTE/],
    ['urb', 'Pavimentação, drenagem e redes', /PAVIMENT|\bBASES?\b|SUB-?BASE|IMPRIMAC|MEIO-FIO|GUIA|SARJETA|CALCADA|DRENO|DRENAGEM|BUEIRO|BOCA|POCOS? DE VISITA|REDES|ASSENTAMENTO DE TUBOS|TUBULACAO|HDD|PERFURACAO HORIZONTAL|RECOMPOSICAO|LIGAC/],
    ['esp', 'Incêndio, gás e climatização', /INCENDIO|\bGAS\b|AR CONDICIONADO|CLIMATIZ|EXAUST|VENTILAC/],
    ['hid', 'Instalações hidrossanitárias', /AGUA|ESGOTO|PVC|PEX|CPVC|PPR|COBRE|LOUCAS|METAIS|REGISTRO|VALVULA|RESERVAC|RECALQUE|PLUVIA|HIDRAULIC|SANITARI|CAIXAS|FOSSA|SUMIDOURO/],
    ['ele', 'Instalações elétricas, SPDA e dados', /ELETRIC|ELETRODUT|CABO|QUADRO|DISJUNTOR|ILUMINAC|LUMINARIA|SPDA|ATERRAMENTO|LOGICA|TELEFONIA|ELETROCALHA|MEDICAO|POSTE|SUBESTAC|TOMADA|INTERRUPTOR/],
    ['paisag', 'Urbanização e paisagismo', /PAISAGIS|GRAMA|PLANTIO|URBANIZ|MOBILIARIO|CERCA|ALAMBRADO|QUADRA|PLAYGROUND|ARBORIZ/],
    ['outros', 'Outros serviços', /./],
  ];
  MC.of = (name) => { const n = U.norm(name); for (const [k, t, re] of MC.RULES) if (re.test(n)) return k; return 'outros'; };
  MC.groups = function (base) {
    if (base._macro) return base._macro;
    const cnt = new Array(base.raw.grupos.length).fill(0); base.raw.comp.g.forEach((g) => cnt[g]++);
    const by = new Map(MC.RULES.map(([k, t]) => [k, { key: k, name: t, items: [] }]));
    base.raw.grupos.forEach((g, gi) => by.get(MC.of(g)).items.push({ gi, name: g, count: cnt[gi] }));
    const order = ['prel', 'terra', 'fund', 'estr', 'alv', 'cob', 'esq', 'imp', 'rev', 'pint', 'hid', 'ele', 'esp', 'urb', 'paisag', 'transp', 'outros', 'aux'];
    base._macro = order.map((k) => by.get(k)).filter((m) => m.items.length).map((m) => (m.items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), m));
    return base._macro;
  };
})(typeof window !== 'undefined' ? window : globalThis);

