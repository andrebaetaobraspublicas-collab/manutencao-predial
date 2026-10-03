/* ==== 17_export.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 17_export.js
 * Exportações: CSV (;), Excel .xlsx real (orçamento, cronograma,
 * físico-financeiro, histograma), SVG/PNG dos gráficos, PDF (impressão)
 * e projeto .json (backup/transferência).
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app;
  const X = (OP.exp = {});
  X.download = (name, data, type) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  };
  const fbase = () => U.deaccent(A.pj.name || 'orcamento').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'orcamento';
  const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const n2 = (v, d = 2) => (v == null || !isFinite(v) ? '' : v.toFixed(d).replace('.', ','));
  X.csv = () => {
    const m = UI.model(); const dif = A.pj.bdi2 != null;
    const L = [['Item', 'Código', 'Fonte', 'Descrição', 'Unidade', 'Quantidade', 'Custo unitário', 'Preço unitário c/ BDI', 'Total', 'Peso (%)', 'Dias úteis', 'Início', 'Término'].concat(dif ? ['BDI (%)'] : []).join(';')];
    m.flat.forEach((r) => L.push((r.isStage ? [r.num, '', '', q(r.node.name), '', '', '', '', n2(r.total / 100), n2(r.weight * 100), r.days, U.fmtDate(r.start), U.fmtDate(r.end)]
      : [r.num, r.node.code, q(r.fonte || ''), q(r.desc), r.unit, n2(r.qty, 4), r.unitCost == null ? '' : n2(r.unitCost / 100), r.unitPrice == null ? '' : n2(r.unitPrice / 100), n2(r.total / 100), n2(r.weight * 100), r.days, U.fmtDate(r.start), U.fmtDate(r.end)].concat(dif ? [n2((r.bdiDif ? A.pj.bdi2 : A.pj.bdi) * 100)] : [])).join(';')));
    L.push(['', '', '', q('CUSTO DIRETO'), '', '', '', '', n2(m.tot.direct / 100)].join(';'), ['', '', '', q('BDI'), '', '', '', '', n2(m.tot.bdi / 100)].join(';'), ['', '', '', q('PREÇO TOTAL'), '', '', '', '', n2(m.tot.price / 100), '100,00', m.T].join(';'));
    X.download(fbase() + '.csv', '\uFEFF' + L.join('\r\n'), 'text/csv;charset=utf-8'); UI.toast('CSV gerado (separador ponto e vírgula).');
  };
  X.xlsx = async () => {
    const m = UI.model(), pj = A.pj; const h = (v) => ({ v, s: 'h' });
    const orc = [[{ v: 'ORÇAMENTO — ' + pj.name, s: 'bold' }], [`Base ${A.base.raw.fonte || 'SICRO'} ${A.base.raw.ref} · UF ${pj.uf} · ${OP.sicro.REGIMES[pj.rg]} · BDI ${U.num(pj.bdi * 100, 2)}% · preço unitário ${pj.round === 'none' ? 'sem arredondar (total truncado)' : pj.round === 'trunc' ? 'truncado' : 'arredondado'}`], [],
      ['Item', 'Código', 'Fonte', 'Descrição', 'Und', 'Quantidade', 'Custo unit.', 'Preço unit.', 'Total', 'Peso', 'Dias úteis'].map(h)];
    m.flat.forEach((r) => orc.push(r.isStage ? [{ v: r.num, s: 'bold' }, '', '', { v: r.node.name, s: 'bold' }, '', '', '', '', { v: r.total / 100, s: 'moneyBold' }, { v: r.weight, s: 'pct' }, r.days]
      : [r.num, String(r.node.code), r.fonte || '', r.desc, r.unit, { v: r.qty, s: 'num4' }, r.unitCost == null ? '' : { v: r.unitCost / 100, s: 'money' }, r.unitPrice == null ? '' : { v: r.unitPrice / 100, s: 'money' }, { v: r.total / 100, s: 'money' }, { v: r.weight, s: 'pct' }, r.days]));
    orc.push([], ['', '', '', { v: 'CUSTO DIRETO', s: 'bold' }, '', '', '', '', { v: m.tot.direct / 100, s: 'moneyBold' }], ['', '', '', { v: 'BDI', s: 'bold' }, '', '', '', '', { v: m.tot.bdi / 100, s: 'moneyBold' }], ['', '', '', { v: 'PREÇO TOTAL', s: 'bold' }, '', '', '', '', { v: m.tot.price / 100, s: 'moneyBold' }]);
    const cr = [['Nº', 'EAP', 'Atividade', 'Dur. (dias úteis)', 'PDI', 'PDT', 'UDI', 'UDT', 'Folga total', 'Folga livre', 'Crítica', 'Início', 'Término', 'Equipes', 'Equipe total'].map(h)];
    m.items.forEach((r) => cr.push([r.seq, r.num, r.desc, r.days, r.ES, r.EF, r.LS, r.LF, r.TF, r.FF, r.crit ? 'SIM' : '', U.fmtDate(r.start), U.fmtDate(r.end), r.prod.m, OP.prod.crewText(r.prod)]));
    const BM = OP.res.buckets(m, 'month'); const ff = OP.res.fisfin(m, BM, true);
    const fs = [['Etapa', ...BM.map((b) => b.label), 'Total'].map(h)];
    ff.rows.forEach((r) => fs.push([r.num + ' ' + r.name, ...r.vals.map((v) => ({ v: v / 100, s: 'money' })), { v: r.total / 100, s: 'moneyBold' }]));
    fs.push([{ v: 'Total no mês', s: 'bold' }, ...ff.col.map((v) => ({ v: v / 100, s: 'moneyBold' })), { v: ff.total / 100, s: 'moneyBold' }], [{ v: '% acumulado', s: 'bold' }, ...ff.cum.map((v) => ({ v, s: 'pct' }))]);
    const BW = OP.res.buckets(m, 'week'); const lab = OP.res.aggregate(OP.res.daily(m, {}).labor, BW);
    const hs = [['Função', 'Horas SICRO', 'Pico diário', ...BW.map((b) => 'Sem. ' + b.label)].map(h)];
    lab.forEach((s) => hs.push([s.name, { v: Math.round(s.hours * 100) / 100, s: 'num2' }, { v: Math.round(s.max * 100) / 100, s: 'num2' }, ...s.avg.map((v) => ({ v: Math.round(v * 100) / 100, s: 'num2' }))]));
    const out = await OP.xlsx.writeWorkbook([{ name: 'Orçamento', rows: orc, cols: [8, 10, 14, 70, 6, 12, 13, 13, 15, 8, 9], freeze: 4 },
      { name: 'Cronograma CPM', rows: cr, cols: [5, 8, 60, 10, 6, 6, 6, 6, 8, 8, 7, 11, 11, 8, 40], freeze: 1 },
      { name: 'Físico-financeiro', rows: fs, cols: [40, ...BM.map(() => 14), 15], freeze: 1 },
      { name: 'Histograma MO', rows: hs, cols: [34, 12, 10, ...BW.map(() => 10)], freeze: 1 }].concat(bdiSheet(), evtSheets()));
    X.download(fbase() + '.xlsx', out instanceof Blob ? out : new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    UI.toast('Planilha Excel gerada com as abas do orçamento e os módulos aplicados.');
  };
  const evtSheets = () => { const c = A.pj.evt; if (!c || !(c.events || []).length || !OP.evtui) return []; return OP.evtui.sheets().slice(0, 2).map((s) => ({ ...s, name: 'Eventograma ' + (s.name === 'Eventograma final' ? 'final' : '- prazos e multas') })); };
  const bdiSheet = () => {
    const ap = (A.pj.bdiCfg && A.pj.bdiCfg.applied) || {}; const rows = [];
    [['p', 'BDI PRINCIPAL'], ['d', 'BDI DIFERENCIADO']].forEach(([kk, tt]) => {
      const a = ap[kk]; if (!a) return;
      rows.push([{ v: `${tt} — método ${a.metodo}, ano ${a.ano} (aplicado em ${new Date(a.date).toLocaleDateString('pt-BR')})`, s: 'bold' }], [{ v: 'Discriminação', s: 'h' }, { v: 'Taxa', s: 'h' }]);
      a.rows.forEach(([l, v, c1]) => rows.push([{ v: (c1 === 'sub' ? '    ' : '') + l, s: c1 === 'sub' ? '' : 'bold' }, { v: Number(v) || 0, s: 'pct' }]));
      rows.push([{ v: 'Valor aplicado ao orçamento', s: 'bold' }, { v: a.valor, s: 'pct' }], [a.eq || ''], []);
      if (a.memoria && a.memoria.length) { rows.push([{ v: 'Memória de cálculo', s: 'bold' }]); a.memoria.forEach((r) => rows.push([String(r[0]), String(r[1])])); rows.push([]); }
    });
    return rows.length ? [{ name: 'Composição do BDI', rows, cols: [74, 24] }] : [];
  };
  const withFonts = (s) => s.replace(/^<svg[^>]*>/, (t) => t + UI.svgFonts());
  const svgOf = (k) => { const f = A.svgs && A.svgs[k]; if (!f) { UI.toast('Gráfico indisponível nesta visualização.', 'warn'); return null; } const s = f(); return s ? withFonts(typeof s === 'string' ? s : s.full) : null; };
  X.svg = (k) => { const s = svgOf(k); if (s) X.download(`${fbase()}_${k}.svg`, s, 'image/svg+xml'); };
  X.png = (k) => {
    const s = svgOf(k); if (!s) return;
    const w = +(/width="([\d.]+)"/.exec(s) || [0, 1200])[1], h = +(/height="([\d.]+)"/.exec(s) || [0, 600])[1]; const sc = Math.min(2, 16000 / Math.max(w, h));
    const img = new Image(); const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
    img.onload = () => { const cv = document.createElement('canvas'); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc); const g = cv.getContext('2d'); g.scale(sc, sc); g.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? X.download(`${fbase()}_${k}.png`, b) : UI.toast('Falha ao gerar PNG', 'warn')), 'image/png'); };
    img.onerror = () => { URL.revokeObjectURL(url); UI.toast('Falha ao gerar PNG', 'warn'); }; img.src = url;
  };
  X.json = () => X.download(fbase() + '.orcaplan.json', JSON.stringify({ app: 'OrçaPro SICRO', v: 1, saved: new Date().toISOString(), baseRef: A.base.raw.ref, project: A.pj, custom: A.customs }, null, 1), 'application/json');
  X.importJSON = async () => {
    const f = await UI.pickFile('.json,application/json'); if (!f) return;
    try {
      const d = JSON.parse(await f.text()); const pj = d.project || d;
      if (!pj || !pj.root || !Array.isArray(pj.root.children)) throw new Error('o arquivo não é um projeto OrçaPro');
      (d.custom || []).forEach((c) => { if (c && c.code && !A.customs.some((x) => x.code === c.code)) { A.customs.push(c); OP.store.put('custom', c).catch(() => {}); } });
      OP.drawer.applyCustoms(); if (!pj.id) pj.id = U.uid('pj'); OP.main.openProject(pj); UI.toast(`Projeto “${pj.name}” aberto.`);
    } catch (e) { UI.toast('Não foi possível abrir: ' + e.message, 'warn'); }
  };
  UI.act.exportCSV = () => X.csv();
  UI.act.exportXLSX = () => X.xlsx().catch((e) => { console.error(e); UI.toast('Erro ao gerar Excel: ' + e.message, 'warn'); });
  UI.act.exportJSON = () => X.json();
  UI.act.importJSON = () => X.importJSON();
  UI.act.expSVG = (el) => X.svg(el.dataset.k);
  UI.act.expPNG = (el) => X.png(el.dataset.k);
  UI.act.print = () => { UI.toast('Na janela de impressão, escolha “Salvar como PDF”.'); setTimeout(() => G.print(), 400); };
})(typeof window !== 'undefined' ? window : globalThis);


