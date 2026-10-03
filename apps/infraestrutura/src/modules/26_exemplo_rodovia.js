/* ==== 26_exemplo_rodovia.js — exemplo: construção de rodovia em SP (SICRO SP 07/2026) ==== */
/* Trecho de 6,0 km em pista simples (2 × 3,60 m) com acostamentos de 2,50 m, terraplenagem,
 * drenagem e OAC, pavimentação, ponte de 40 m em vigas pré-moldadas protendidas,
 * contenções, sinalização e obras complementares. Quantidades e premissas são de um
 * projeto-tipo didático; preços e produções vêm da base SICRO ativa (nada é digitado). */
(function (G) {
  'use strict';
  const O = G.OP, U = O.util, E = O.engine, S = O.sicro;
  const X = (O.examples = O.examples || {});
  const NAME = 'Rodovia SP — construção do trecho km 0+000 ao km 6+000 (exemplo)';
  const START = '2026-11-02';
  /* Materiais betuminosos com preço referencial zerado (PRZ) no SICRO: fornecimento em
     itens próprios com BDI diferenciado. Valores ilustrativos — substituir pela cotação
     ou pela referência ANP/DNIT do mês da base. */
  const ASF = {
    M1943: ['IP-CAP-5070', 'Cimento asfáltico de petróleo CAP 50/70 — fornecimento', 4250],
    M0104: ['IP-CM-30', 'Asfalto diluído de petróleo CM-30 — fornecimento', 6150],
    M1946: ['IP-RR-1C', 'Emulsão asfáltica RR-1C — fornecimento', 3350],
    M2097: ['IP-RR-2C', 'Emulsão asfáltica RR-2C — fornecimento', 3450],
  };
  const DIST_ASF = 180; // km pavimentados da distribuidora até o canteiro (premissa do exemplo)
  /* [chave, código, quantidade, opções] — dur: duração manual (dias úteis); teams: equipes simultâneas */
  const TREE = [
    ['SERVIÇOS PRELIMINARES, CANTEIRO E ADMINISTRAÇÃO', 1, [
      ['mob', 'CP-ROD-MOB', 1, { dur: 10, memo: 'mob' }],
      ['can', 'CP-ROD-CAN', 1, { dur: 0, memo: 'can' }],
      ['usina', '0903810', 1, { dur: 20 }],
      ['central', '0903804', 1, { dur: 15 }],
      ['adm', 'CP-ROD-ADM', 0, { dur: 0, ev: 'Diluído', memo: 'adm' }]]],
    ['TERRAPLENAGEM', 2, [
      ['lim', '5501700', 240000, { memo: 'terra', ev: '2.1' }],
      ['c1', '5502110', 185000, { teams: 2, memo: 'terra', ev: '2.2' }],
      ['c2', '5502587', 42000, { memo: 'terra', ev: '2.2' }],
      ['c3', '5501978', 9500, { memo: 'terra', ev: '2.2' }],
      ['bota', '5915319', 100800, { memo: 'terra', ev: '2.2' }],
      ['at', '5502978', 168000, { teams: 2, memo: 'terra', ev: '2.2' }],
      ['cf', '5503041', 50400, { memo: 'terra', ev: '2.3' }]]],
    ['DRENAGEM E OBRAS DE ARTE CORRENTES', 3, [
      ['bstc', '0820031', 252, { dur: 40, ev: '3.1' }],
      ['bstcb', '0804395', 28, { dur: 30, ev: '3.1' }],
      ['bdcc', '0705273', 26, { dur: 35, ev: '3.1' }],
      ['bdccb', '0705322', 2, { dur: 15, ev: '3.1' }],
      ['valeta', '2003309', 3400, { dur: 35, ev: '3.2' }],
      ['descida', '2003411', 640, { dur: 30, ev: '3.2' }],
      ['eda', '2003103', 64, { dur: 20, ev: '3.2' }],
      ['deb', '2003453', 64, { dur: 20, ev: '3.2' }],
      ['sarj', '2003257', 7200, { dur: 60, ev: '3.2' }],
      ['ccs', '2003477', 36, { dur: 25, ev: '3.2' }],
      ['dreno', '2003843', 3600, { dur: 45, ev: '3.3' }]]],
    ['PAVIMENTAÇÃO', 4, [
      ['reg', '4011209', 84000, { memo: 'pav', ev: '4.1' }],
      ['sb', '4011227', 16080, { memo: 'pav', ev: '4.1' }],
      ['base', '4011276', 11340, { memo: 'pav', ev: '4.1' }],
      ['impr', '4011351', 73200, { memo: 'pav', ev: '4.2' }],
      ['binder', '4011459', 5292, { memo: 'pav', ev: '4.2' }],
      ['lig', '4011353', 43200, { memo: 'pav', ev: '4.2' }],
      ['capa', '4011463', 4234, { memo: 'pav', ev: '4.2' }],
      ['tsd', '4011372', 30000, { memo: 'pav', ev: '4.3' }]]],
    ['MATERIAIS BETUMINOSOS — FORNECIMENTO E TRANSPORTE (BDI DIFERENCIADO)', 4, []], // preenchido pelo cálculo
    ['OBRAS DE ARTE ESPECIAIS — PONTE SOBRE O CÓRREGO (L = 40 m)', 5, [
      ['est', '2306001', 512, { memo: 'oae', ev: '5.1' }],
      ['fv', '3106427', 520, { dur: 30, memo: 'oae', ev: '5.2' }],
      ['forma', '3108008', 1680, { dur: 70, memo: 'oae', ev: '5.2' }],
      ['arm', '0407819', 50400, { dur: 70, memo: 'oae', ev: '5.2' }],
      ['conc', '1107890', 420, { dur: 60, memo: 'oae', ev: '5.2' }],
      ['lanc', '1106061', 420, { dur: 60, memo: 'oae', ev: '5.2' }],
      ['esc', '2106235', 1040, { dur: 40, memo: 'oae', ev: '5.3' }],
      ['bainha', '4507835', 340, { dur: 12, memo: 'oae', ev: '5.2' }],
      ['cord', '4507956', 4050, { dur: 12, memo: 'oae', ev: '5.2' }],
      ['anc', '4507755', 32, { dur: 10, memo: 'oae', ev: '5.2' }],
      ['apoio', '0307732', 96, { memo: 'oae', ev: '5.2' }],
      ['viga', '3806422', 8, { dur: 4, memo: 'oae', ev: '5.2' }],
      ['junta', '0307734', 39, { memo: 'oae', ev: '5.3' }],
      ['barr', '3713904', 80, { dur: 3, memo: 'oae', ev: '5.3' }]]],
    ['CONTENÇÕES', 6, [
      ['gab', '3205864', 1250, {}],
      ['gramp', '5605895', 2880, {}],
      ['tela', '0408067', 2860, { dur: 15 }],
      ['cproj', '1207711', 52, {}],
      ['dsh', '2003614', 360, { dur: 12 }]]],
    ['SINALIZAÇÃO E SEGURANÇA VIÁRIA', 7, [
      ['faixa', '5213401', 2520, {}],
      ['tacha', '5213360', 1130, {}],
      ['suporte', '5213869', 36, {}],
      ['placa', '5213489', 36, {}],
      ['defensa', '3713604', 1680, {}],
      ['term', '3713689', 28, {}]]],
    ['OBRAS COMPLEMENTARES E PROTEÇÃO AMBIENTAL', 8, [
      ['cerca', '3713610', 12000, { teams: 2 }],
      ['hidro', '4413905', 118000, {}],
      ['enleiv', '4413996', 9500, {}]]],
  ];
  /* precedências técnicas: [de, para, tipo, defasagem em dias úteis] */
  const LINKS = [
    ['mob', 'lim', 'SS', 5], ['mob', 'usina', 'FS', 0], ['mob', 'central', 'SS', 3], ['mob', 'est', 'SS', 10],
    ['lim', 'c1', 'SS', 6], ['lim', 'c1', 'FF', 8], ['c1', 'c2', 'SS', 25], ['c2', 'c3', 'SS', 15], ['c1', 'bota', 'SS', 10], ['c1', 'bota', 'FF', 5],
    ['c1', 'at', 'SS', 4], ['c1', 'at', 'FF', 6], ['at', 'cf', 'SS', 35], ['at', 'cf', 'FF', 10],
    ['lim', 'bstc', 'SS', 10], ['bstc', 'bstcb', 'SS', 10], ['bstc', 'bstcb', 'FF', 8], ['lim', 'bdcc', 'SS', 15], ['bdcc', 'bdccb', 'SS', 20], ['bdcc', 'bdccb', 'FF', 5],
    ['bstc', 'at', 'SS', 8], ['c1', 'valeta', 'SS', 30], ['at', 'descida', 'SS', 50], ['descida', 'eda', 'SS', 5], ['descida', 'deb', 'SS', 5],
    ['c2', 'dreno', 'SS', 10], ['dreno', 'reg', 'SS', 15],
    ['cf', 'reg', 'SS', 12], ['cf', 'reg', 'FF', 4], ['reg', 'sb', 'SS', 4], ['reg', 'sb', 'FF', 4], ['sb', 'base', 'SS', 6], ['sb', 'base', 'FF', 5],
    ['usina', 'base', 'FS', 0], ['base', 'impr', 'SS', 4], ['base', 'impr', 'FF', 3], ['impr', 'binder', 'SS', 6], ['impr', 'binder', 'FF', 4],
    ['binder', 'lig', 'SS', 3], ['binder', 'lig', 'FF', 2], ['lig', 'capa', 'SS', 2], ['lig', 'capa', 'FF', 2], ['base', 'tsd', 'SS', 15], ['base', 'tsd', 'FF', 10],
    ['base', 'sarj', 'SS', 5], ['sarj', 'ccs', 'SS', 10], ['sarj', 'ccs', 'FF', 5],
    ['est', 'forma', 'SS', 8], ['forma', 'arm', 'SS', 3], ['forma', 'arm', 'FF', 3], ['central', 'conc', 'FS', 0], ['arm', 'conc', 'SS', 6], ['conc', 'lanc', 'SS', 0], ['conc', 'lanc', 'FF', 0],
    ['est', 'fv', 'SS', 10], ['fv', 'bainha', 'SS', 12], ['bainha', 'cord', 'SS', 2], ['cord', 'anc', 'SS', 4], ['anc', 'apoio', 'FS', 0], ['apoio', 'viga', 'FS', 0], ['forma', 'esc', 'SS', 35],
    ['viga', 'esc', 'FS', 0], ['esc', 'junta', 'FS', 0], ['junta', 'barr', 'FS', 0], ['barr', 'capa', 'FS', 0],
    ['c1', 'gab', 'SS', 30], ['c2', 'gramp', 'SS', 10], ['gramp', 'tela', 'SS', 4], ['gramp', 'tela', 'FF', 2], ['tela', 'cproj', 'SS', 4], ['tela', 'cproj', 'FF', 2], ['gramp', 'dsh', 'SS', 8],
    ['capa', 'faixa', 'FS', 5], ['faixa', 'tacha', 'FS', 0], ['capa', 'suporte', 'SS', 5], ['suporte', 'placa', 'SS', 1], ['suporte', 'placa', 'FF', 1], ['capa', 'defensa', 'SS', 5], ['defensa', 'term', 'FF', 0],
    ['lim', 'cerca', 'SS', 20], ['cf', 'hidro', 'SS', 15], ['cf', 'hidro', 'FF', 20], ['hidro', 'enleiv', 'SS', 10],
  ];
  const EVENTS = [
    ['1', 'Mobilização, canteiro e instalações industriais (usina e central de concreto)'], ['2', 'Terraplenagem'], ['2.1', 'Limpeza da faixa'], ['2.2', 'Cortes, aterros, bota-fora e compactação'], ['2.3', 'Camada final de terraplenagem'],
    ['3', 'Drenagem e obras de arte correntes'], ['3.1', 'Bueiros (BSTC e BDCC) com bocas'], ['3.2', 'Drenagem superficial'], ['3.3', 'Drenagem profunda'],
    ['4', 'Pavimentação'], ['4.1', 'Regularização, sub-base e base'], ['4.2', 'Imprimação e revestimento asfáltico'], ['4.3', 'Acostamentos (TSD)'],
    ['5', 'Ponte sobre o córrego'], ['5.1', 'Fundações (estacas)'], ['5.2', 'Mesoestrutura, vigas e aparelhos de apoio'], ['5.3', 'Tabuleiro, juntas e barreiras'],
    ['6', 'Contenções'], ['7', 'Sinalização e segurança viária'], ['8', 'Obras complementares e proteção ambiental']];
  const own = () => ({
    inputs: Object.entries(ASF).map(([m, [code, desc, price]]) => ({ id: code, code, desc: desc + ' (material ' + m + ' do SICRO com preço referencial zerado; valor ilustrativo do exemplo — substitua pela cotação/ANP do mês)', unit: 't', cls: 'MATERIAL', taxProfile: 'material',
      prices: [{ uf: '*', ref: '', base: price, source: 'Valor ilustrativo do exemplo — substituir por cotação ou referência ANP/DNIT' }], src: 'PRÓPRIA', revision: 1, history: [], created: Date.now(), archived: false })),
    compositions: [
      { id: 'CP-ROD-MOB', code: 'CP-ROD-MOB', desc: 'Mobilização e desmobilização de equipamentos e pessoal — trecho de 6 km (estimativa do exemplo)', unit: 'un', group: 'Composições próprias', mode: 'quoted', quote: 720000, quoteUF: '*', quoteRef: '', quoteSource: 'Estimativa paramétrica do exemplo — substituir pela memória de mobilização', src: 'PRÓPRIA', revision: 1, history: [], items: [] },
      { id: 'CP-ROD-CAN', code: 'CP-ROD-CAN', desc: 'Canteiro de obras — escritório, almoxarifado, laboratório, oficina e alojamento: instalação, manutenção e desmobilização (estimativa do exemplo)', unit: 'un', group: 'Composições próprias', mode: 'quoted', quote: 1150000, quoteUF: '*', quoteRef: '', quoteSource: 'Estimativa paramétrica do exemplo — substituir pelo projeto do canteiro', src: 'PRÓPRIA', revision: 1, history: [], items: [] },
      { id: 'CP-ROD-ADM', code: 'CP-ROD-ADM', desc: 'Administração local da obra — equipe técnica mensalista e veículos de apoio (mês)', unit: 'mês', group: 'Composições próprias', mode: 'analytic', src: 'PRÓPRIA', revision: 1, history: [],
        items: [['P9955', 1], ['P9812', 2], ['P9864', 0.5], ['P9876', 1], ['P9889', 1], ['P9897', 1], ['P9949', 2], ['P9858', 2], ['P9840', 1], ['P9884', 1], ['P9893', 1], ['P9869', 1], ['P9804', 2], ['P9803', 1], ['P9806', 2], ['P9827', 4]]
          .map(([code, coef]) => ({ type: 'I', code, coef })).concat([{ type: 'C', code: 'E9684-CHP', coef: 3 * 176 }]) },
    ],
  });
  /* DMT por item transportado, conforme a fonte (premissas do exemplo) */
  const dmtRule = (desc) => {
    const d = U.norm(desc);
    if (/^USINAGEM/.test(d)) return { LN: 0, RP: 3, P: 0, FE: 0 };           // usina no canteiro → frente de serviço
    if (/JAZIDA/.test(d)) return { LN: 2.5, RP: 0, P: 0, FE: 0 };              // jazida lindeira ao trecho
    if (/^CONCRETO|^ARGAMASSA|^MICROCONCRETO/.test(d)) return { LN: 0, RP: 1.5, P: 0, FE: 0 }; // central de concreto
    if (/BRITA|PO DE PEDRA|PEDRISCO|PEDRA DE MAO|RACHAO|PEDRA/.test(d)) return { LN: 1, RP: 0, P: 28, FE: 0 }; // pedreira comercial
    if (/AREIA/.test(d)) return { LN: 2, RP: 0, P: 35, FE: 0 };                // areal comercial
    return null;                                                               // demais: DMT padrão (comércio regional)
  };
  X.rodovia = { name: NAME };
  X.buildRodovia = function (base) {
    const pj = E.newProject(NAME);
    Object.assign(pj, { exemplo: 'rodovia', uf: base.ufs[0], rg: 'SD', bdi: 0.2097, bdi2: 0.1402, round: 'round', start: START, seq: 'manual', sicroPriceQuotes: [] });
    pj.calendar = Object.assign({}, O.cal.DEFAULT, pj.calendar);
    const cat = own(); pj.catalog = { v: 1, inputs: cat.inputs, compositions: cat.compositions };
    const ids = {}, nodes = {};
    pj.root.children = TREE.map(([name, ev, list]) => {
      const st = E.stage(name); st.evento = String(ev);
      st.children = list.map(([key, code, qty, o]) => { const it = E.item(code, qty); if (o.teams) it.teams = o.teams; if (o.dur) it.dur = o.dur; if (o.memo) it.memo = o.memo; if (o.ev) it.evento = o.ev; ids[key] = it.id; nodes[key] = it; return it; });
      return st;
    });
    /* materiais betuminosos: consumo das composições do orçamento (seção C, inclusive auxiliares) */
    const asfStage = pj.root.children[4]; const tons = {}; let totT = 0;
    for (const st of pj.root.children) for (const it of st.children) {
      if (!/^\d{7}$/.test(String(it.code))) continue; const u = base.usage(it.code);
      for (const m of Object.keys(ASF)) { const q = (u.mat.get(m) || 0) * it.qty; if (q > 0) tons[m] = (tons[m] || 0) + q; }
    }
    const rowsAsf = [['Material SICRO', 'Item próprio', 'Serviços que consomem', 'Quantidade (t)', 'Preço ilustrativo (R$/t)']];
    for (const [m, [code, desc, price]] of Object.entries(ASF)) {
      if (!tons[m]) continue; const q = Math.round(tons[m] * 100) / 100; totT += q;
      const it = E.item(code, q); it.resourceType = 'I'; it.bdiDif = true; it.memo = 'asf'; it.evento = '4.2'; it.dur = 30; ids['asf_' + m] = it.id; nodes['asf_' + m] = it; asfStage.children.push(it);
      rowsAsf.push([m, code, desc, U.num(q, 2), U.num(price, 2)]);
    }
    const trA = E.item('5914622', Math.round(totT * DIST_ASF)); trA.memo = 'asf'; trA.evento = '4.2'; trA.dur = 30; ids.trasf = trA.id; nodes.trasf = trA; asfStage.children.push(trA);
    for (const k of Object.keys(ASF)) if (ids['asf_' + k]) LINKS.push(['impr', 'asf_' + k, 'SS', 0], ['asf_' + k, 'capa', 'FF', 0]);
    LINKS.push(['impr', 'trasf', 'SS', 0], ['trasf', 'capa', 'FF', 0]);
    /* DMT: regra por fonte para cada item transportado nas composições do orçamento */
    pj.dmt = { def: { LN: 0, RP: 0, P: 52, U: 8, FE: 0 }, byMat: {} }; // comércio regional: 52 km rurais + 8 km urbanos (FIT)
    const tmat = base.raw.tmat || {};
    for (const st of pj.root.children) for (const it of st.children) {
      if (!/^\d{7}$/.test(String(it.code))) continue;
      for (const m of base.usage(it.code).tr.keys()) { if (pj.dmt.byMat[m]) continue; const r = dmtRule((tmat[m] || [])[0] || ''); if (r) pj.dmt.byMat[m] = r; }
    }
    pj.links = LINKS.filter(([a, b]) => ids[a] && ids[b]).map(([a, b, type, lag]) => ({ id: U.uid('lk'), from: ids[a], to: ids[b], type, lag }));
    /* prazo: administração local e canteiro acompanham toda a obra */
    let m = E.compute(base, pj);
    const T = m.T; nodes.adm.dur = T; nodes.can.dur = T; nodes.adm.span = true; nodes.can.span = true; // acompanham o prazo da obra
    pj.links.push({ id: U.uid('lk'), from: ids.mob, to: ids.adm, type: 'SS', lag: 0 }, { id: U.uid('lk'), from: ids.mob, to: ids.can, type: 'SS', lag: 0 });
    m = E.compute(base, pj);
    const months = Math.round(((m.end - m.start) / 864e5 + 1) / 30.4375 * 100) / 100; nodes.adm.qty = months;
    /* eventograma: prazos sugeridos pelo fim dos serviços de cada evento */
    const evEnd = {}; for (const r of m.items) { const e = String(r.node.evento || '').split('.')[0] || ''; if (e && e !== 'Diluído') evEnd[e] = Math.max(evEnd[e] || 0, r.EF); }
    pj.evt = { events: EVENTS.map(([code, desc]) => ({ code, desc, prazo: !code.includes('.') ? Math.ceil(((evEnd[code] || m.T) + 5) / 5) * 5 : null, multa: !code.includes('.') ? 0.0002 : null })),
      fixos: [{ code: '9', desc: 'Recebimento provisório', pct: 0.05, prazo: m.T + 15, multa: 0.0005 }, { code: '10', desc: 'Recebimento definitivo', pct: 0.05, prazo: m.T + 90, multa: 0.0005 }], sim: {}, tab: 'map' };
    /* memórias de quantidade */
    pj.memos = {
      terra: { titulo: 'Memória — terraplenagem (projeto-tipo)', rows: [['Serviço', 'Base de cálculo', 'Quantidade'], ['Limpeza da faixa', '6.000 m × 40 m (faixa de domínio a ser limpa)', '240.000 m²'], ['Cortes de 1ª categoria', 'Notas de serviço — volume geométrico', '185.000 m³'], ['Cortes de 2ª categoria', 'Sondagens — horizonte alterado', '42.000 m³'], ['Cortes de 3ª categoria', 'Rocha sã no km 4', '9.500 m³'], ['Compactação a 100% PN', 'Corpo de aterro', '168.000 m³'], ['Camada final a 100% PI', '6.000 m × 14,0 m × 0,60 m', '50.400 m³'], ['Bota-fora', '18.000 m³ × 1,6 t/m³ × 3,5 km (leito natural)', '100.800 tkm']] },
      pav: { titulo: 'Memória — pavimentação (seção-tipo)', rows: [['Camada', 'Extensão × largura × espessura', 'Quantidade'], ['Regularização do subleito', '6.000 × 14,0 m', '84.000 m²'], ['Sub-base de solo de jazida', '6.000 × 13,4 × 0,20 m', '16.080 m³'], ['Base de BGS (brita comercial)', '6.000 × 12,6 × 0,15 m', '11.340 m³'], ['Imprimação (CM-30)', '6.000 × 12,2 m', '73.200 m²'], ['Concreto asfáltico faixa B (binder)', '6.000 × 7,2 × 0,05 m × 2,45 t/m³', '5.292 t'], ['Pintura de ligação (RR-1C)', '6.000 × 7,2 m', '43.200 m²'], ['Concreto asfáltico faixa C (capa)', '6.000 × 7,2 × 0,04 m × 2,45 t/m³', '4.234 t'], ['TSD nos acostamentos', '6.000 × 2 × 2,50 m', '30.000 m²']] },
      oae: { titulo: 'Memória — ponte de 40 m (2 vãos de 20 m, 4 vigas por vão)', rows: [['Elemento', 'Critério', 'Quantidade'], ['Estacas pré-moldadas 170 t', '4 apoios × 8 estacas × 16 m', '512 m'], ['Concreto fck 30 MPa', 'blocos 96 + pilares e travessas 48 + vigas 72 + laje 130 + cortinas, alas e transição 74', '420 m³'], ['Armação CA-50', '420 m³ × 120 kg/m³', '50.400 kg'], ['Fôrmas de compensado', 'blocos, pilares, travessas, laje e cortinas', '1.680 m²'], ['Fôrma metálica das vigas', '8 vigas × 65 m²', '520 m²'], ['Escoramento metálico', 'volume escorado sob a laje e travessas', '1.040 m³'], ['Protensão', '8 vigas × 2 cabos de 12 cordoalhas Ø12,7 mm', '32 ancoragens · 340 m de bainha · 4.050 kg'], ['Aparelhos de apoio', '16 aparelhos × 6 dm³', '96 dm³'], ['Juntas de dilatação', '3 juntas × 13 m', '39 m'], ['Barreiras New Jersey', '2 × 40 m', '80 m']] },
      asf: { titulo: 'Memória — materiais betuminosos (consumo das composições SICRO do orçamento)', rows: rowsAsf.concat([['Transporte', '5914622 — caminhão tanque distribuidor, rodovia pavimentada', U.num(totT, 2) + ' t × ' + DIST_ASF + ' km', U.num(Math.round(totT * DIST_ASF), 0) + ' tkm', '']]) },
      mob: { titulo: 'Composição própria — mobilização e desmobilização', rows: [['Parcela', 'Critério', 'Valor (R$)'], ['Equipamentos pesados', 'transporte em prancha de 38 equipamentos, ida e volta', '486.000,00'], ['Usina de asfalto e central de concreto', 'transporte especial, montagem fora das composições de instalação', '154.000,00'], ['Pessoal', 'deslocamento inicial e final das equipes', '80.000,00'], ['Total', 'estimativa do exemplo — substituir pela memória de mobilização', '720.000,00']] },
      can: { titulo: 'Composição própria — canteiro de obras', rows: [['Parcela', 'Critério', 'Valor (R$)'], ['Instalações provisórias', 'escritório, almoxarifado, laboratório, oficina, alojamento e refeitório (módulos)', '780.000,00'], ['Manutenção', 'energia, água, limpeza e conservação durante a obra', '270.000,00'], ['Desmobilização', 'retirada e recuperação da área', '100.000,00'], ['Total', 'estimativa do exemplo — substituir pelo projeto do canteiro', '1.150.000,00']] },
      adm: { titulo: 'Composição própria — administração local (por mês)', rows: [['Função / recurso', 'Código SICRO', 'Quantidade'], ['Engenheiro chefe', 'P9955', '1'], ['Engenheiros de produção', 'P9812', '2'], ['Engenheiro de segurança (meio período)', 'P9864', '0,5'], ['Técnicos de segurança, qualidade e meio ambiente', 'P9876 · P9889 · P9897', '1 + 1 + 1'], ['Topógrafos e laboratoristas', 'P9949 · P9858', '2 + 2'], ['Encarregados (geral, terraplenagem, pavimentação, OAE)', 'P9840 · P9884 · P9893 · P9869', '4'], ['Apontadores, almoxarife, auxiliares administrativos e vigias', 'P9804 · P9803 · P9806 · P9827', '2 + 1 + 2 + 4'], ['Picapes 4 × 4 com motorista', 'E9684 — 3 × 176 h produtivas/mês', '528 h']] },
    };
    /* administração local calculada pelo menu Administração Local (SICRO, vol. 07) */
    if (O.al && O.al.initExample) { try { O.al.initExample(pj, m); } catch (e) { console.warn('AL do exemplo:', e); } }
    /* canteiro (áreas → AL) e mobilização (frota do cronograma + efetivo da AL), pelos menus próprios */
    if (O.can && O.can.initExample) { try { O.can.initExample(pj, m); if (pj.memos) delete pj.memos.can; } catch (e) { console.warn('Canteiro do exemplo:', e); } }
    if (O.mob && O.mob.initExample) { try { O.mob.initExample(pj, m); if (pj.memos) delete pj.memos.mob; } catch (e) { console.warn('Mobilização do exemplo:', e); } }
    return pj;
  };
  const prev = X.build;
  X.build = function (key, base) { if (key === 'rodovia' || key === 'edificio' || !prev) return X.buildRodovia(base); return prev(key, base); };
})(typeof window !== 'undefined' ? window : globalThis);

