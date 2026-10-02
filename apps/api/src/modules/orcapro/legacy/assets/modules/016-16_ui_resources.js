/* ==== 16_ui_resources.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 16_ui_resources.js
 * Histogramas de mão de obra e equipamentos (semanal/mensal, datas
 * cedo/tarde), Curva S físico-financeira e cronograma físico-financeiro.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app; const esc = U.esc;
  const expBtns = (k) => `<span class="row"><button class="btn ghost sm" data-act="expSVG" data-k="${k}">SVG</button><button class="btn ghost sm" data-act="expPNG" data-k="${k}">PNG</button></span>`;
  UI.views.resources = { render: () => {
    const m = UI.model(); if (!m.items.length) return '<div class="empty">Adicione serviços ao orçamento para gerar histogramas e Curva S.</div>';
    const per = A.sel.rper || 'week', sch = A.sel.rsch || 'early', bdi = A.sel.rbdi !== false;
    const o = { sched: sch, support: A.sel.rsup !== false, operators: A.sel.rop !== false };
    const B = OP.res.buckets(m, per); const dl = OP.res.daily(m, o);
    const lab = OP.res.aggregate(dl.labor, B), eqp = OP.res.aggregate(dl.equip, B);
    const tl = OP.res.total(dl.labor, dl.T), te = OP.res.total(dl.equip, dl.T);
    const peakOf = (tot) => B.map((b) => Math.max(...b.days.map((t) => tot[t])));
    let imax = 0; tl.forEach((v, t) => { if (v > tl[imax]) imax = t; });
    const H1 = OP.charts.hist({ B, series: lab, unit: 'pessoas', peak: peakOf(tl) });
    const H2 = eqp.length ? OP.charts.hist({ B, series: eqp, unit: 'unidades', peak: peakOf(te) }) : '';
    const sc = OP.res.scurve(m, B, bdi); const S = OP.charts.scurve({ rows: sc.rows });
    A.svgs.histMO = () => H1; A.svgs.histEQ = () => H2; A.svgs.curvaS = () => S;
    const BM = OP.res.buckets(m, 'month'); const ff = OP.res.fisfin(m, BM, bdi);
    const actAvg = (s) => { let n = 0, sum = 0; s.daily.forEach((v) => { if (v > 0) { n++; sum += v; } }); return n ? sum / n : 0; };
    const seg = (k, v, list) => `<div class="seg">${list.map(([x, t]) => `<button class="${v === x ? 'on' : ''}" data-act="rset" data-k="${k}" data-v="${x}">${t}</button>`).join('')}</div>`;
    return `<div class="vh"><div><h1>Recursos e Curva S</h1><p class="muted">Pico de mão de obra: <b>${U.num(tl[imax] || 0, 0)} pessoas</b> em ${U.fmtDate(m.cal.date(imax))} · barras = média ${per === 'week' ? 'semanal' : 'mensal'} por função · traço = pico diário</p></div>
      <div class="vh-a"><button class="btn ghost" data-act="exportXLSX">${UI.icon('dl')} Excel</button><button class="btn ghost" data-act="print">${UI.icon('pdf')} PDF</button></div></div>
      <div class="toolbar">${seg('rper', per, [['week', 'Semanal'], ['month', 'Mensal']])}${seg('rsch', sch, [['early', 'Datas mais cedo'], ['late', 'Datas mais tarde']])}
      <label class="ck"><input type="checkbox" data-ch="rsup" ${o.support ? 'checked' : ''}> Equipes de apoio</label><label class="ck"><input type="checkbox" data-ch="rop" ${o.operators ? 'checked' : ''}> Operadores de equipamentos</label><label class="ck"><input type="checkbox" data-ch="rbdi" ${bdi ? 'checked' : ''}> Valores com BDI</label></div>
      <div class="chartbox"><h3>Histograma de mão de obra ${expBtns('histMO')}</h3><div class="chart">${H1}</div></div>
      <div class="chartbox"><h3>Mão de obra por função</h3><div class="tblw"><table class="tbl sm"><thead><tr><th>Função</th><th class="r">Horas (coeficientes SINAPI)</th><th class="r">Pico diário</th><th class="r">Média nos dias com atuação</th></tr></thead><tbody>${lab.map((s) => `<tr><td><i class="dot ${s.kind === 'op' ? 'eq' : 'mo'}"></i>${esc(s.name)}${s.kind === 'op' ? ' <small class="muted">(operador)</small>' : ''}</td><td class="r">${U.num(s.hours, 1)}</td><td class="r">${U.num(s.max, s.max % 1 ? 1 : 0)}</td><td class="r">${U.num(actAvg(s), 1)}</td></tr>`).join('')}</tbody></table></div></div>
      ${H2 ? `<div class="chartbox"><h3>Histograma de equipamentos ${expBtns('histEQ')}</h3><div class="chart">${H2}</div></div>` : ''}
      <div class="chartbox"><h3>Curva S físico-financeira ${expBtns('curvaS')}</h3><div class="chart">${S}</div></div>
      <div class="chartbox"><h3>Cronograma físico-financeiro (mensal, datas mais cedo${bdi ? ', com BDI' : ', custo direto'})</h3><div class="tblw"><table class="tbl sm"><thead><tr><th>Etapa</th>${BM.map((b) => `<th class="r">${esc(b.label)}</th>`).join('')}<th class="r">Total</th></tr></thead>
      <tbody>${ff.rows.map((r) => `<tr><td><b>${esc(r.num)}</b> ${esc(U.cap(r.name))}</td>${r.vals.map((v) => `<td class="r">${v ? U.num(v / 100, 2) : ''}</td>`).join('')}<td class="r"><b>${U.num(r.total / 100, 2)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total no mês</td>${ff.col.map((v) => `<td class="r">${U.num(v / 100, 2)}</td>`).join('')}<td class="r">${U.num(ff.total / 100, 2)}</td></tr><tr><td>% no mês · acumulado</td>${ff.pct.map((q, i) => `<td class="r">${U.pct(q)} · ${U.pct(ff.cum[i])}</td>`).join('')}<td class="r">100%</td></tr></tfoot></table></div></div>`;
  } };
  UI.act.rset = (el) => { A.sel[el.dataset.k] = el.dataset.v; UI.render(); };
  UI.chg.rsup = (el) => { A.sel.rsup = el.checked; UI.render(); };
  UI.chg.rop = (el) => { A.sel.rop = el.checked; UI.render(); };
  UI.chg.rbdi = (el) => { A.sel.rbdi = el.checked; UI.render(); };
})(typeof window !== 'undefined' ? window : globalThis);

