/* ==== 22_ui_bdi.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 22_ui_bdi.js
 * Menu BDI — interface do OrçaPro sobre o motor do BDIPro (21_bdi_core).
 * Parte 1: estado no projeto, barra "aplicar ao orçamento", campos,
 * gráficos SVG, método PARAMÉTRICO e ações comuns.
 * (Parte 2, 23_ui_bdi2.js: métodos EXATO e SIMPLES NACIONAL, relatórios.)
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app; const BD = OP.bdi; const esc = U.esc;
  const W = (OP.bdiui = {});
  /* ---------- formatos (iguais aos da tela original) ---------- */
  const P2 = (W.P2 = (x, d = 2) => (Number.isFinite(x) ? (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : '—'));
  const RS = (W.RS = (x) => (Number.isFinite(x) ? x.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'));
  const N6 = (W.N6 = (x) => (Number.isFinite(x) ? x.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 }) : '—'));
  const PE = (W.PE = (x) => (Number(x || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 }));
  const MV = (W.MV = (x) => Number(x || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pnum = (s) => { const raw = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(raw) ? raw : 0; };
  W.PARSE = {
    param: { pct: (s) => pnum(s) / 100, money: (s) => { const v = U.parseNum(s); return isFinite(v) ? v : 0; } },
    exato: { pct: (s) => BD.B.parsePercent(s), money: (s) => BD.B.num(s) },
    simples: { pct: (s) => BD.A.parseSimPct(s), money: (s) => BD.A.parseSimNum(s) },
  };
  W.MODES = [['param', 'Paramétrico'], ['exato', 'Exato (matriz de creditamento)'], ['simples', 'Simples Nacional']];
  W.LABEL = { param: 'paramétrico', exato: 'exato', simples: 'Simples Nacional' };
  W.NOTA_2026 = 'Nos termos do art. 348 da Lei Complementar 214/2025, em 2026, os valores das alíquotas-teste de CBS e IBS, de 0,90% e 0,10%, respectivamente, poderão ser compensados com os valores recolhidos de outros tributos, não representando carga tributária efetiva sobre o contribuinte.';
  W.NOTA_RED = 'Para itens com BDI reduzido de fornecimento de materiais, o sistema aplica apenas as parcelas reduzidas previstas no Acórdão TCU 2.622/2013. O IVAeq permanece único para o contrato, apurado pela composição global dos custos diretos.';
  W.M = {}; // registro dos métodos: { view(c,k), out(c,k), live(c,k), calc(c) }

  /* ---------- estado salvo no projeto ---------- */
  W.defaultsFor = (tot) => {
    const c = { v: 1, mode: 'param', tab: { param: 'res', exato: 'res', simples: 'aliq' }, open: {}, cmp: { A: null, B: null }, simplesAplicado: null,
      applied: {}, round: 'r2', param: BD.paramDefaults(), exato: BD.exatoDefaults(), simples: BD.simplesDefaults() };
    if (tot && tot.price > 0) c.param.valorContrato = c.exato.valorContrato = Math.round(tot.price) / 100;
    if (tot && tot.direct > 0) c.simples.custoDireto = Math.round(tot.direct) / 100;
    return c;
  };
  W.cfg = () => { const pj = A.pj; if (!pj.bdiCfg || pj.bdiCfg.v !== 1) pj.bdiCfg = W.defaultsFor(UI.model().tot); return pj.bdiCfg; };
  W.calc = () => { const c = W.cfg(); return W.M[c.mode].calc(c); };
  W.valorAplicado = (c, bdi) => (c.round === 'full' ? bdi : Math.round(bdi * 10000) / 10000);

  /* ---------- campos ---------- */
  W.tipos = () => Object.entries(BD.A.tabelaBdi).map(([k, v]) => [k, v.nome]);
  W.quartis = (curto) => [['q1', curto ? '1º quartil' : 'Primeiro Quartil'], ['medio', 'Média'], ['q3', curto ? '3º quartil' : 'Terceiro Quartil']];
  W.card = (c, id, n, title, body, fechado) => { const open = c.open[id] != null ? c.open[id] : !fechado; return `<details class="bdicard"${open ? ' open' : ''}><summary data-act="bdiDet" data-id="${id}"><span class="stepn">${n}</span>${title}</summary><div class="bc">${body}</div></details>`; };
  W.sel = (m, k, label, opts, val, help, dis) => `<label class="fld"><span>${label}</span><select data-ch="bdiSel" data-m="${m}" data-k="${k}"${dis ? ' disabled' : ''}>${opts.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>${help ? `<small class="muted">${help}</small>` : ''}</label>`;
  W.pct = (m, k, label, val, o = {}) => `<label class="fld"><span>${label}${o.auto ? ' <em class="auto">auto</em>' : ''}</span><div class="inpx"><input data-fk="b-${m}-${k}" data-in="bdiIn" data-ch="bdiFmt" data-m="${m}" data-k="${k}" data-t="pct" inputmode="decimal" value="${PE(val)}"${o.disabled ? ' disabled' : ''}><i>%</i></div>${o.slider ? `<input type="range" class="rng" data-in="bdiRng" data-m="${m}" data-k="${k}" min="0" max="${o.slider}" step="0.1" value="${Math.min(o.slider, Math.max(0, (val || 0) * 100))}"${o.disabled ? ' disabled' : ''} aria-label="${esc(label)}">` : ''}${o.help ? `<small class="muted">${o.help}</small>` : ''}</label>`;
  W.money = (m, k, label, val, act) => `<label class="fld"><span>${label}</span><div class="inpx"><i>R$</i><input data-fk="b-${m}-${k}" data-in="bdiIn" data-ch="bdiFmt" data-m="${m}" data-k="${k}" data-t="money" inputmode="decimal" value="${MV(val)}"></div>${act ? `<button class="lnk sm" data-act="${act}" data-m="${m}">usar valor do orçamento</button>` : ''}</label>`;
  W.txt = (m, k, label, val) => `<label class="fld"><span>${label}</span><input data-fk="b-${m}-${k}" data-in="bdiIn" data-m="${m}" data-k="${k}" data-t="txt" value="${esc(val || '')}"></label>`;
  W.chk = (m, k, label, val) => `<label class="ck"><input type="checkbox" data-ch="bdiChk" data-m="${m}" data-k="${k}"${val ? ' checked' : ''}> ${label}</label>`;
  W.tabs = (m, list, cur) => `<div class="tabs bdi-tabs">${list.map(([k, t]) => `<button class="tab ${cur === k ? 'on' : ''}" data-act="bdiTab" data-m="${m}" data-v="${k}">${t}</button>`).join('')}</div>`;
  W.kpis = (list) => `<div class="cards bdik">${list.map(([t, v, d, cl]) => `<div class="card ${cl || ''}"><small>${t}</small><b>${v}</b>${d ? `<span class="muted">${d}</span>` : ''}</div>`).join('')}</div>`;
  W.memo = (rows) => `<div class="tblw"><table class="tbl sm memo"><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="r"><b>${r[1]}</b></td></tr>`).join('')}</tbody></table></div>`;
  /* Composição do BDI (bdiBreakdownRows do original) */
  W.breakdown = (rows, ano, eq) => `<div><div class="tblw"><table class="tbl sm brk"><thead><tr><th>Discriminação <span class="muted">(ano: ${Number(ano) >= 2033 ? 'a partir de 2033' : ano})</span></th><th class="r">Taxa (%)</th></tr></thead><tbody>${rows.map(([l, v, c1]) => `<tr class="${c1}"><td>${esc(l)}</td><td class="r">${P2(v)}</td></tr>`).join('')}</tbody></table></div><div class="formula">${esc(eq)}</div></div>`;

  /* ---------- gráficos SVG ---------- */
  W.line = (series, o = {}) => {
    const p = OP.charts.pal(); const w = o.w || 720, h = o.h || 250, ml = 58, mr = 18, mt = 14, mb = 36;
    const all = series.flatMap((s) => s.pts); if (!all.length) return '<div class="empty">Sem dados para exibir.</div>';
    const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]).concat(o.mark ? [o.mark[1]] : []);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (y1 - y0 < 1e-6) { y0 -= 0.005; y1 += 0.005; } const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
    const X = (v) => ml + (v - x0) / ((x1 - x0) || 1) * (w - ml - mr), Y = (v) => mt + (1 - (v - y0) / ((y1 - y0) || 1)) * (h - mt - mb);
    const fx = o.fx || ((v) => P2(v, 0)), fy = o.fy || ((v) => P2(v, 1));
    let s = `<svg class="bdisvg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px" font-family="'Barlow Semi Condensed',Arial,sans-serif" font-size="11"><rect width="${w}" height="${h}" fill="${p.bg}"/>`;
    for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4; s += `<line x1="${ml}" x2="${w - mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${p.line2}"/><text x="${ml - 6}" y="${Y(v) + 4}" text-anchor="end" fill="${p.ink3}">${fy(v)}</text>`; }
    const tx = o.xticks || [0, 1, 2, 3, 4, 5].map((i) => x0 + (x1 - x0) * i / 5);
    tx.forEach((v) => (s += `<text x="${X(v)}" y="${h - mb + 16}" text-anchor="middle" fill="${p.ink3}">${fx(v)}</text>`));
    if (o.xlabel) s += `<text x="${(ml + w - mr) / 2}" y="${h - 4}" text-anchor="middle" fill="${p.ink3}">${esc(o.xlabel)}</text>`;
    series.forEach((se) => { s += `<path d="${se.pts.map((q, i) => (i ? 'L' : 'M') + X(q[0]).toFixed(1) + ',' + Y(q[1]).toFixed(1)).join('')}" fill="none" stroke="${se.color}" stroke-width="2.4" stroke-linejoin="round"${se.dash ? ' stroke-dasharray="6 4"' : ''}/>`;
      if (o.dots) se.pts.forEach((q) => (s += `<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="3" fill="${se.color}"><title>${fx(q[0])}: ${fy(q[1])}</title></circle>`)); });
    if (o.mark) s += `<circle cx="${X(o.mark[0])}" cy="${Y(o.mark[1])}" r="5" fill="${p.accent}" stroke="${p.ink}" stroke-width="1.5"><title>Cenário atual: ${fx(o.mark[0])} → ${fy(o.mark[1])}</title></circle>`;
    if (series.length > 1 || o.legend) series.forEach((se, i) => (s += `<rect x="${ml + 8 + i * 150}" y="${mt}" width="14" height="4" fill="${se.color}"/><text x="${ml + 26 + i * 150}" y="${mt + 6}" fill="${p.ink2}">${esc(se.label || '')}</text>`));
    return s + '</svg>';
  };
  W.bars = (rows, o = {}) => {
    const p = OP.charts.pal(); const w = o.w || 520, h = o.h || 240, ml = 50, mb = 40, mt = 14; const mx = Math.max(0.0001, ...rows.map((r) => r[1])) * 1.15;
    const bw = (w - ml - 20) / rows.length; const Y = (v) => mt + (1 - v / mx) * (h - mt - mb);
    let s = `<svg class="bdisvg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px" font-family="'Barlow Semi Condensed',Arial,sans-serif" font-size="11"><rect width="${w}" height="${h}" fill="${p.bg}"/>`;
    for (let i = 0; i <= 4; i++) { const v = mx * i / 4; s += `<line x1="${ml}" x2="${w - 16}" y1="${Y(v)}" y2="${Y(v)}" stroke="${p.line2}"/><text x="${ml - 6}" y="${Y(v) + 4}" text-anchor="end" fill="${p.ink3}">${P2(v, 0)}</text>`; }
    rows.forEach(([l, v], i) => { const x = ml + i * bw + bw * 0.18, bwi = bw * 0.64; s += `<rect x="${x}" y="${Y(v)}" width="${bwi}" height="${Math.max(0.5, Y(0) - Y(v))}" fill="${OP.charts.SERIES[i % 10]}" rx="2"/><text x="${x + bwi / 2}" y="${Y(v) - 5}" text-anchor="middle" font-weight="700" fill="${p.ink}">${P2(v)}</text><text x="${x + bwi / 2}" y="${h - mb + 16}" text-anchor="middle" fill="${p.ink2}">${esc(l)}</text>`; });
    return s + '</svg>';
  };
  W.donut = (rows, o = {}) => {
    const p = OP.charts.pal(); const w = o.w || 520, h = o.h || 230, cx = 115, cy = h / 2, R = 92, r0 = 54; const tot = rows.reduce((a, x) => a + x[1], 0) || 1; let a0 = -Math.PI / 2;
    let s = `<svg class="bdisvg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px" font-family="'Barlow Semi Condensed',Arial,sans-serif" font-size="11.5"><rect width="${w}" height="${h}" fill="${p.bg}"/>`;
    rows.forEach(([l, v], i) => {
      const a1 = a0 + (v / tot) * Math.PI * 2; const big = a1 - a0 > Math.PI ? 1 : 0; const col = OP.charts.SERIES[i % 10];
      const pt = (rr, a) => `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
      s += rows.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${(R + r0) / 2}" fill="none" stroke="${col}" stroke-width="${R - r0}"/>` : `<path d="M${pt(R, a0)}A${R},${R} 0 ${big} 1 ${pt(R, a1)}L${pt(r0, a1)}A${r0},${r0} 0 ${big} 0 ${pt(r0, a0)}Z" fill="${col}"><title>${esc(l)}: ${P2(v)}</title></path>`;
      s += `<rect x="248" y="${16 + i * 21}" width="11" height="11" rx="2" fill="${col}"/><text x="265" y="${26 + i * 21}" fill="${p.ink2}">${esc(l)} · <tspan font-weight="700" fill="${p.ink}">${P2(v)}</tspan> (${P2(v / tot, 1)} do total)</text>`;
      a0 = a1;
    });
    return s + `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" font-weight="700" fill="${p.ink}">${P2(tot)}</text></svg>`;
  };

  /* ---------- barra "aplicar ao orçamento" ---------- */
  W.bar = (c, k) => {
    const pj = A.pj; const v = W.valorAplicado(c, k.bdi); const igual = Math.abs((+pj.bdi || 0) - v) < 1e-9;
    return `<div class="bdibar"><div class="bb-main"><small>BDI calculado · método ${W.LABEL[c.mode]} · ano ${k.ano}</small><b>${P2(k.bdi)}</b><span class="muted">IVA equivalente ${P2(k.ivaeq)}${c.round === 'full' ? '' : ` · aplicado como ${P2(v)}`}</span></div>
      <div class="bb-cur"><small>BDI do orçamento</small><div>Principal <b>${P2(+pj.bdi || 0)}</b>${igual ? ' <span class="tag okt">= calculado</span>' : ''}</div><div>Diferenciado <b>${pj.bdi2 != null ? P2(pj.bdi2) : '—'}</b>${pj.bdi2 != null ? ' <button class="lnk" data-act="bdiDifOff">remover</button>' : ''}</div></div>
      <div class="bb-act"><label class="fld"><span>Aplicar com</span><select data-ch="bdiRound"><option value="r2"${c.round !== 'full' ? ' selected' : ''}>2 casas decimais</option><option value="full"${c.round === 'full' ? ' selected' : ''}>precisão total</option></select></label>
      <button class="btn pri" data-act="bdiApply" data-k="p">${UI.icon('ok')} Aplicar como BDI principal</button>
      <button class="btn${k.dif ? ' dark' : ''}" data-act="bdiApply" data-k="d" title="BDI reduzido para itens de fornecimento de materiais e equipamentos; marque os itens na tela Orçamento">Aplicar como BDI diferenciado</button></div></div>`;
  };

  /* ---------- visão e atualização parcial (reatividade sem perder o foco) ---------- */
  UI.views.bdi = { render: () => {
    const c = W.cfg(); const k = W.calc(); W.last = k;
    return `<div class="vh"><div><h1>BDI</h1><p class="muted">Motor de cálculo do BDIPro com as regras de transição da Reforma Tributária (LC 214/2025). Edite a composição e aplique o resultado ao orçamento.</p></div>
      <div class="vh-a"><div class="seg">${W.MODES.map(([m, t]) => `<button class="${c.mode === m ? 'on' : ''}" data-act="bdiMode" data-v="${m}">${t}</button>`).join('')}</div>
      <button class="btn ghost" data-act="bdiReport">${UI.icon('pdf')} Relatório</button><button class="btn ghost" data-act="bdiWord">${UI.icon('dl')} Word</button><button class="btn ghost" data-act="bdiCsv">${UI.icon('dl')} CSV</button>
      <button class="btn ghost" data-act="bdiReset" title="Restaurar os valores iniciais deste método">Padrão</button></div></div>
      <div id="bdiBar">${W.bar(c, k)}</div>${W.M[c.mode].view(c, k)}`;
  } };
  W.refresh = () => {
    if (A.view !== 'bdi' || !document.getElementById('bdiOut')) return;
    const c = W.cfg(); const k = W.calc(); W.last = k;
    const ae = document.activeElement; const fk = ae && ae.getAttribute && ae.getAttribute('data-fk'); const st = fk ? { v: ae.value, s: ae.selectionStart, e: ae.selectionEnd } : null;
    document.getElementById('bdiBar').innerHTML = W.bar(c, k);
    document.getElementById('bdiOut').innerHTML = W.M[c.mode].out(c, k);
    if (W.M[c.mode].live) W.M[c.mode].live(c, k);
    if (fk && (!document.activeElement || document.activeElement === document.body)) {
      const el = UI.$(`[data-fk="${G.CSS && CSS.escape ? CSS.escape(fk) : fk}"]`);
      if (el) { el.focus(); if (st && el.tagName === 'INPUT') { el.value = st.v; try { el.setSelectionRange(st.s, st.e); } catch (e) { /* sem seleção */ } } }
    }
    UI.saveSoon();
  };
  const soon = U.debounce(() => W.refresh(), 90);
  W.soon = soon;
  let raf = 0; const now = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; W.refresh(); }); };

  /* ---------- eventos comuns ---------- */
  UI.inp.bdiIn = (el) => {
    const c = W.cfg(), m = el.dataset.m, k = el.dataset.k, t = el.dataset.t; const st = c[m];
    st[k] = t === 'txt' ? el.value : W.PARSE[m][t](el.value);
    if (t === 'pct') { const r = UI.$(`input.rng[data-m="${m}"][data-k="${k}"]`); if (r) r.value = Math.min(+r.max, Math.max(0, st[k] * 100)); }
    if (W.M[m].onInput && W.M[m].onInput(c, k)) { UI.later('bdiFull', () => UI.render(), 250); return; }
    soon();
  };
  UI.inp.bdiRng = (el) => {
    const c = W.cfg(), m = el.dataset.m, k = el.dataset.k; c[m][k] = parseFloat(el.value) / 100;
    const t = UI.$(`[data-fk="b-${m}-${k}"]`); if (t) t.value = PE(c[m][k]);
    if (W.M[m].onInput) W.M[m].onInput(c, k); now();
  };
  // ao sair do campo, só reformata o próprio campo (re-renderizar a tela engoliria o clique que causou a saída)
  UI.chg.bdiFmt = (el) => { const v = W.cfg()[el.dataset.m][el.dataset.k]; if (el.dataset.t === 'pct') el.value = PE(v); else if (el.dataset.t === 'money') el.value = MV(v); };
  UI.chg.bdiSel = (el) => {
    const c = W.cfg(), m = el.dataset.m, k = el.dataset.k; const st = c[m]; let v = el.value;
    if (['ano', 'anoOrigem', 'usarBdiOriginal'].includes(k)) v = v === '' ? '' : Number(v);
    if (k === 'cprbOpt') v = v === 'sim';
    st[k] = v; if (W.M[m].onSelect) W.M[m].onSelect(c, k);
    UI.saveSoon(); UI.render();
  };
  UI.chg.bdiChk = (el) => { const c = W.cfg(); c[el.dataset.m][el.dataset.k] = el.checked ? 1 : 0; UI.saveSoon(); UI.render(); };
  UI.chg.bdiRound = (el) => { W.cfg().round = el.value; UI.saveSoon(); W.refresh(); };
  UI.act.bdiMode = (el) => { W.cfg().mode = el.dataset.v; UI.saveSoon(); UI.render(); UI.$('#main').scrollTop = 0; };
  UI.act.bdiTab = (el) => { W.cfg().tab[el.dataset.m] = el.dataset.v; UI.saveSoon(); W.refresh(); };
  UI.act.bdiDet = (el) => { const d = el.parentElement; d.open = !d.open; W.cfg().open[el.dataset.id] = d.open; UI.saveSoon(); };
  UI.act.bdiReset = () => {
    const c = W.cfg(); if (!confirm(`Restaurar os valores iniciais do método ${W.LABEL[c.mode]}?`)) return;
    const m = UI.model();
    if (c.mode === 'param') { c.param = BD.paramDefaults(); if (m.tot.price > 0) c.param.valorContrato = Math.round(m.tot.price) / 100; c.cmp = { A: null, B: null }; }
    else if (c.mode === 'exato') { c.exato = BD.exatoDefaults(); if (m.tot.price > 0) c.exato.valorContrato = Math.round(m.tot.price) / 100; }
    else { c.simples = BD.simplesDefaults(); if (m.tot.direct > 0) c.simples.custoDireto = Math.round(m.tot.direct) / 100; }
    UI.saveSoon(); UI.render(); UI.toast('Valores padrão restaurados.');
  };
  /* aplicar ao orçamento */
  UI.act.bdiApply = (el) => {
    const c = W.cfg(); const k = W.calc(); const kind = el.dataset.k === 'd' ? 'd' : 'p';
    if (!(k.bdi > -1) || !isFinite(k.bdi)) { UI.toast('BDI inválido — revise os parâmetros.', 'warn'); return; }
    const v = W.valorAplicado(c, k.bdi);
    if (kind === 'd') A.pj.bdi2 = v; else A.pj.bdi = v;
    c.applied[kind] = { mode: c.mode, metodo: W.LABEL[c.mode], ano: k.ano, bdi: k.bdi, valor: v, ivaeq: k.ivaeq, date: Date.now(), rows: k.rows.map((r) => [r[0], r[1], r[2]]), eq: k.eq, memoria: k.memoria || [] };
    UI.commit();
    UI.toast(`BDI ${P2(v)} aplicado como ${kind === 'd' ? 'BDI diferenciado — marque os itens de fornecimento na tela Orçamento' : 'BDI principal do orçamento'}.`);
  };
  UI.act.bdiDifOff = () => { A.pj.bdi2 = null; if (A.pj.bdiCfg) delete A.pj.bdiCfg.applied.d; UI.commit(); UI.toast('BDI diferenciado removido; todos os itens usam o BDI principal.'); };
  UI.act.bdiUseTotal = (el) => { const m = UI.model(); W.cfg()[el.dataset.m].valorContrato = Math.round(m.tot.price) / 100; UI.saveSoon(); UI.render(); };

  /* =================== MÉTODO PARAMÉTRICO =================== */
  const pa = BD.A;
  const paramMem = (o, res) => [['Ano', o.ano], ['Tipo de obra', pa.tabelaBdi[o.tipoObra]?.nome || o.tipoObra], ['Quartil do BDI', BD.QUARTIS[o.quartilBdi] || o.quartilBdi], ['Referência creditável', o.tipoRefCredito],
    ['IVAt nominal', pa.pct(res.ivatNominal)], ['IVAt efetivo para cálculo', pa.pct(res.ivat)], ['Fator efetivo (f) = (1−redutor setorial)×(1−redutor governamental)', pa.pct(res.fatorEfetivo)], ['IVAt × f', pa.pct(res.ivatEfetivo)],
    ['ISS municipal aplicado', pa.pct(res.iss)], ['Redução de ISS pela transição (ano)', pa.pct(1 - res.issFator)], ['ISS_BDI = ISS×(1−α)', pa.pct(res.issBdi)], ['PIS/COFINS (tabela anual)', pa.pct(res.pisCofins)],
    ['CPRB efetiva', pa.pct(res.cprbEfetiva)], ['T = ISS_BDI + CPRB + PIS/COFINS', pa.pct(res.T)], ['K', pa.num(res.K)], ['MAT/CD', pa.pct(o.matcd)], ['MO/CD', pa.pct(o.mocd)], ['EQ/CD', pa.pct(o.eqcd)],
    ['% Crédito no BDI', pa.pct(res.creditoBdi)], ['Alíquota média de ICMS em 2027', pa.pct(o.icms2027)], ['ICMS residual aplicado ao ano', pa.pct(res.icmsResidual)], ['%MATcd bruto', pa.pct(res.matcd)],
    ['%MATcd ajustado = %MATcd × (1 − ICMS residual)', pa.pct(res.matcdAjustado)], ['IVAeq = max(0; IVAt × (K × f − %MATcd ajustado) / K)', pa.pct(res.ivaeq)], ['BDI clássico sem IVAeq', pa.pct(res.bdiClassico)], ['BDI pós-reforma', pa.pct(res.bdi)]];
  const reeqMem = (res) => [['Valor contratual/remanescente', pa.moeda(res.valorBase)], ['BDI de origem', pa.pct(res.bdiOriginal)], ['Origem do BDI', res.origemBdiOriginal], ['BDI pós-reforma', pa.pct(res.bdi)],
    ['Fator de reequilíbrio', pa.pct(res.fatorReeq)], ['Valor reequilibrado estimado', pa.moeda(res.valorAjustado)], ['Diferença estimada', pa.moeda(res.diferencaReeq)],
    ['Interpretação', res.fatorReeq > 0 ? 'Acréscimo estimado para recomposição.' : (res.fatorReeq < 0 ? 'Redução estimada em favor da Administração.' : 'Neutralidade econômica.')]];
  W.paramMem = paramMem; W.reeqMem = reeqMem;
  const FORMULAS = [['K', '(1 + AC + R + S+G) × (1 + DF) × (1 + L)'], ['ISS_BDI', 'ISS municipal × (1 − α)'], ['T', 'ISS_BDI + CPRB + PIS/COFINS'], ['%MATcd', 'MAT/CD + 0,10 × MO/CD + %credEQ × EQ/CD + %Créd. BDI'],
    ['%MATcd ajustado', '%MATcd × (1 − ICMS residual)'], ['f', '(1 − redutor setorial) × (1 − redutor governamental)'], ['Alíquota efetiva IBS/CBS', 'nominal × f'], ['IVAeq', 'max(0; IVAt × (K × f − %MATcd ajustado) / K)'],
    ['BDI', 'K × (1 + IVAeq) / (1 − T) − 1'], ['Fator de reequilíbrio', '((1 + BDI) / (1 + BDI original)) − 1'], ['Valor reequilibrado', 'Valor contratual × (1 + Fator de reequilíbrio)']];
  W.M.param = {
    calc: (c) => {
      const o = c.param; const r = BD.paramCompute(o, c.simplesAplicado); const res = r.res;
      const rows = pa.bdiBreakdownRows({ ano: o.ano, ac: o.ac, r: o.r, sg: o.sg, df: o.df, lucro: o.lucro, T: res.T, issBdi: res.issBdi, pisCofins: res.pisCofins, cprbEfetiva: res.cprbEfetiva, ivaeq: res.ivaeq, bdi: res.bdi });
      return { mode: 'param', r, o, bdi: res.bdi, ivaeq: res.ivaeq, ano: o.ano, rows, eq: pa.bdiEquationHtml(o.ano), dif: o.tipoObra === 'bdi_materiais', memoria: paramMem(o, res) };
    },
    view: (c, k) => `<div class="bdi-grid"><aside class="bdi-in">${paramIn(c)}</aside><section class="bdi-out" id="bdiOut">${W.M.param.out(c, k)}</section></div>`,
    out: (c, k) => {
      const o = c.param, res = k.r.res, tab = c.tab.param || 'res'; const sa = c.simplesAplicado; const saOn = sa && Number(sa.ano) === Number(o.ano);
      const tabs = [['res', 'Resultado'], ['cmp', 'Comparar'], ['reeq', 'Reequilíbrio'], ['par', 'Tabela paramétrica'], ['anual', 'Tabela anual'], ['curva', 'Curva 2026–2033'], ['refs', 'Referências'], ['form', 'Fórmulas']];
      return W.kpis([['BDI', P2(res.bdi), `BDI clássico, sem IVAeq: ${P2(res.bdiClassico)}`, 'hl'], ['IVA equivalente', P2(res.ivaeq), `IVAt ${P2(res.ivat)} × f ${P2(res.fatorEfetivo)}`], ['Fator de reequilíbrio', P2(res.fatorReeq), `BDI de origem ${P2(res.bdiOriginal)}`], ['%MATcd', P2(k.r.matcdTotal), `ajustado ${P2(res.matcdAjustado)}`]])
        + (res.teste2026 ? `<p class="note bdi-note">${W.NOTA_2026}</p>` : '')
        + (sa ? `<p class="note bdi-note${saOn ? ' on' : ''}">IVAeq do Simples Nacional (${P2(sa.ivaeq)}, ano ${sa.ano}) aplicado ao cálculo paramétrico${saOn ? '' : ' — sem efeito no ano selecionado'}. <button class="lnk" data-act="bdiSimplesOff">remover</button></p>` : '')
        + W.tabs('param', tabs, tab) + `<div class="bdi-tab">${PT[tab](c, k)}</div>`;
    },
    live: (c) => {
      const o = c.param; const lm = UI.$('#bdiLiveMat'); if (lm) lm.textContent = P2(BD.matcdTotal(o));
      const soma = Number(o.matcd || 0) + Number(o.mocd || 0) + Number(o.eqcd || 0); const al = UI.$('#bdiAlert');
      if (al) { al.hidden = Math.abs(soma - 1) <= 0.0001; al.textContent = `Atenção: MAT/CD + MO/CD + EQ/CD soma ${pa.pct(soma)}. O sistema permite continuar, mas recomenda revisar a composição para que a soma seja 100,00%.`; }
    },
    onSelect: (c, k) => { const o = c.param; if (k === 'tipoObra' || k === 'quartilBdi') BD.paramTipo(o); else if (k === 'tipoRefCredito') BD.paramRef(o, true); if (k === 'ano') BD.paramNormaliza(o); },
  };
  function paramIn(c) {
    const o = c.param; const m = UI.model(); const t = m.tot; const bloq = Number(o.ano) >= 2028; const ref = BD.refCredito(o.tipoRefCredito);
    const orig = BD.anosOrigem(o.ano); const soma = Number(o.matcd || 0) + Number(o.mocd || 0) + Number(o.eqcd || 0);
    const sh = t.direct > 0 ? { mat: (t.mat + t.out) / t.direct, mo: t.mo / t.direct, eq: t.eq / t.direct } : null;
    return W.card(c, 'p1', '1', 'Obra e período', `<div class="fg">${W.sel('param', 'ano', 'Ano de referência', pa.transicao.map((x) => [x.ano, x.ano]), o.ano, 'Tabela de transição: IVA, PIS/Cofins, ISS e ICMS')}
        ${W.sel('param', 'tipoObra', 'Tipo de obra', W.tipos(), o.tipoObra)}${W.sel('param', 'quartilBdi', 'Quartil do BDI', W.quartis(), o.quartilBdi)}</div>${o.tipoObra === 'bdi_materiais' ? `<p class="note bdi-note">${W.NOTA_RED}</p>` : ''}`)
      + W.card(c, 'p2', '2', 'Composição creditável', `${W.sel('param', 'tipoRefCredito', 'Referência típica da obra', pa.referenciasCredito.map((x) => [x.tipo, x.tipo]), o.tipoRefCredito, 'Preenche MAT/CD, MO/CD, EQ/CD e o crédito de equipamentos')}
        <div class="refbox"><b>${esc(ref.tipo)}</b> — ${esc(ref.situacao)}<br><span class="muted">Tipo TCU: ${esc(ref.tipoTcu)} · MAT/CD ${P2(ref.matcd)} · MO/CD ${P2(ref.mocd)} · EQ/CD ${P2(ref.eqcd)} · crédito eq. ${P2(ref.credEqSug)} · %MATcd típico ${P2(ref.matcdTipico)}<br>${esc(ref.obs)}</span></div>
        ${sh ? `<button class="btn ghost sm wide" data-act="bdiUseComp" title="Proporções de materiais, mão de obra e equipamentos do custo direto do orçamento">${UI.icon('budget', 15)} Usar composição do orçamento: MAT ${P2(sh.mat, 1)} · MO ${P2(sh.mo, 1)} · EQ ${P2(sh.eq, 1)}</button>` : ''}
        <div class="fg">${W.pct('param', 'matcd', 'MAT/CD — materiais', o.matcd, { auto: 1 })}${W.pct('param', 'mocd', 'MO/CD — mão de obra', o.mocd, { auto: 1 })}${W.pct('param', 'eqcd', 'EQ/CD — equipamentos', o.eqcd, { auto: 1 })}
        ${W.pct('param', 'credeq', '% crédito de equipamentos', o.credeq, { auto: 1 })}${W.pct('param', 'credBdi', '% crédito direto no BDI', o.credBdi, { help: 'Crédito adicional aplicado ao IVAeq (opcional)' })}</div>
        <div class="live">%MATcd resultante <b id="bdiLiveMat">${P2(BD.matcdTotal(o))}</b></div>
        <div id="bdiAlert" class="alertbox"${Math.abs(soma - 1) > 0.0001 ? '' : ' hidden'}>Atenção: MAT/CD + MO/CD + EQ/CD soma ${pa.pct(soma)}. O sistema permite continuar, mas recomenda revisar a composição para que a soma seja 100,00%.</div>`)
      + W.card(c, 'p3', '3', 'Parâmetros do BDI', `<p class="note">Preenchidos pelo tipo de obra e quartil; ajuste pelo campo ou pelo controle deslizante.</p><div class="fg">${[['ac', 'Administração central — AC', 20], ['r', 'Risco — R', 20], ['sg', 'Seguros + garantias — S+G', 20], ['df', 'Despesas financeiras — DF', 20], ['lucro', 'Lucro — L', 25]].map(([key, lab, mx]) => W.pct('param', key, lab, o[key], { auto: 1, slider: mx })).join('')}</div>`)
      + W.card(c, 'p4', '4', 'Tributos e reduções', `<div class="fg">${W.pct('param', 'alpha', '% de materiais na obra — α', o.alpha, { slider: 100, help: 'ISS_BDI = ISS × (1 − α)' })}${W.pct('param', 'f', 'Fator setorial f', o.f, { slider: 100, help: 'Redução setorial sobre IBS/CBS' })}
        ${W.pct('param', 'redutor', 'Redutor de compras governamentais', o.redutor, { slider: 100, help: 'Aplicado nas contratações públicas' })}${W.pct('param', 'icms2027', 'Alíquota média de ICMS em 2027', o.icms2027, { slider: 30, help: 'Mantida em 2028, reduzida de 2029 a 2032, zero a partir de 2033' })}
        ${W.pct('param', 'cprb', 'CPRB', o.cprb, { slider: 10, disabled: bloq, help: bloq ? 'Considerada zero a partir de 2028' : 'Contribuição previdenciária sobre a receita bruta' })}</div>
        ${W.chk('param', 'usarIssManual', 'Informar ISS manualmente', o.usarIssManual)}${o.usarIssManual ? `<div class="fg">${W.pct('param', 'issManual', 'ISS municipal', o.issManual, { slider: 10 })}</div>` : '<p class="note">Desligado: usa o ISS da tabela anual do ano selecionado.</p>'}
        ${W.chk('param', 'usarIvatManual', 'Informar IVAt manualmente', o.usarIvatManual)}${o.usarIvatManual ? `<div class="fg">${W.pct('param', 'ivatManual', 'IVAt', o.ivatManual, { slider: 30 })}</div>` : '<p class="note">Desligado: usa o IVA da tabela anual do ano selecionado.</p>'}`, true)
      + W.card(c, 'p5', '5', 'Reequilíbrio do contrato', `<div class="fg">${W.money('param', 'valorContrato', 'Valor contratual/remanescente', o.valorContrato, t.price > 0 ? 'bdiUseTotal' : null)}
        ${W.sel('param', 'anoOrigem', 'Ano de origem do BDI', orig.length ? orig.map((a) => [a, a]) : [['', 'Sem ano anterior']], o.anoOrigem, 'Usado quando o BDI original manual está desligado', !orig.length)}</div>
        ${W.chk('param', 'usarBdiOriginal', 'Informar BDI original manualmente', o.usarBdiOriginal)}${o.usarBdiOriginal ? `<div class="fg">${W.pct('param', 'bdiOriginalManual', 'BDI original', o.bdiOriginalManual, { slider: 50 })}</div>` : ''}`, true);
  }
  const PT = {
    res: (c, k) => { const res = k.r.res; const pal = OP.charts.pal();
      return `<div class="bdi-two">${W.breakdown(k.rows, c.param.ano, k.eq)}<div><h4 class="sub" style="margin-top:0">Memória de cálculo do cenário</h4>${W.memo(k.memoria)}</div></div>
        <h4 class="sub">BDI em função do %MATcd</h4>${W.line([{ pts: k.r.pts.map((p) => [p.matcd, p.bdi]), color: pal.blue, label: 'BDI' }], { mark: [k.r.matcdTotal, res.bdi], xlabel: '%MATcd bruto' })}
        <h4 class="sub">IVAeq em função do %MATcd</h4>${W.line([{ pts: k.r.pts.map((p) => [p.matcd, p.ivaeq]), color: '#0F9F7A', label: 'IVAeq' }], { mark: [k.r.matcdTotal, res.ivaeq], xlabel: '%MATcd bruto', fy: (v) => P2(v, 2) })}`; },
    cmp: (c, k) => {
      const snap = (o) => { if (!o) return null; const s = BD.paramCompute(BD.clone(o), c.simplesAplicado); s.o = o; return s; };
      const a = snap(c.cmp.A), b = snap(c.cmp.B); const base = a ? (a.res.valorBase || 0) : (b ? (b.res.valorBase || 0) : 0);
      if (a) { a.valorComparado = base; a.diferencaComparada = 0; }
      if (b) { const bdiA = a ? a.res.bdi : 0; b.valorComparado = base * (1 + b.res.bdi) / (1 + bdiA); b.diferencaComparada = b.valorComparado - base; }
      const rot = (s) => (s ? `${s.o.ano} · ${pa.tabelaBdi[s.o.tipoObra]?.nome || s.o.tipoObra} · BDI ${pa.pct(s.res.bdi)}` : '— não definido —');
      const rows = !a && !b ? '<tr><td colspan="4" class="muted" style="text-align:center">Capture os cenários A e B para comparar.</td></tr>' : pa.cmpRows.map(([label, get, fmt]) => {
        let d = '?'; if (a && b) { const dv = get(b) - get(a); d = (dv > 0 ? '+' : '') + fmt(dv); }
        return `<tr><td>${label}</td><td class="r">${a ? fmt(get(a)) : '?'}</td><td class="r">${b ? fmt(get(b)) : '?'}</td><td class="r"><b>${d}</b></td></tr>`; }).join('');
      const series = []; if (a) series.push({ pts: a.pts.map((p) => [p.matcd, p.bdi]), color: OP.charts.pal().blue, label: 'Cenário A' }); if (b) series.push({ pts: b.pts.map((p) => [p.matcd, p.bdi]), color: '#DC2626', label: 'Cenário B' });
      return `<p class="note">Configure os parâmetros e capture o cenário A; depois altere o que quiser (por exemplo, o ano de 2027 para 2033) e capture o B.</p>
        <div class="row" style="margin-bottom:6px"><button class="btn sm pri" data-act="bdiCap" data-s="A">Capturar como A</button><span class="cmp-l a">A: ${esc(rot(a))}</span></div>
        <div class="row" style="margin-bottom:10px"><button class="btn sm pri" data-act="bdiCap" data-s="B">Capturar como B</button><span class="cmp-l b">B: ${esc(rot(b))}</span><button class="btn ghost sm" data-act="bdiCmpClear">Limpar</button></div>
        <div class="tblw"><table class="tbl sm"><thead><tr><th>Indicador</th><th class="r">Cenário A</th><th class="r">Cenário B</th><th class="r">Δ (B − A)</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${series.length ? `<h4 class="sub">Curvas sobrepostas — BDI × %MATcd</h4>${W.line(series, { legend: 1, xlabel: '%MATcd bruto' })}` : ''}`;
    },
    reeq: (c, k) => `${W.memo(reeqMem(k.r.res))}<p class="note" style="margin-top:8px">Fator de reequilíbrio = [(1 + BDI pós-reforma) / (1 + BDI original)] − 1. Valor reequilibrado = valor contratual × (1 + fator).</p>`,
    par: (c, k) => `<div class="row" style="justify-content:space-between;margin-bottom:8px"><p class="note" style="margin:0">O %MATcd varia de 5% a 80%, reproduzindo a lógica paramétrica da planilha.</p><button class="btn ghost sm" data-act="bdiParCsv">${UI.icon('dl', 15)} Exportar CSV</button></div>
      <div class="tblw" style="max-height:460px"><table class="tbl sm"><thead><tr><th class="r">%MATcd bruto</th><th class="r">%MATcd ajustado</th><th class="r">IVAeq</th><th class="r">BDI</th></tr></thead><tbody>${k.r.pts.map((p) => `<tr${Math.abs(p.matcd - k.r.matcdTotal) < 0.005 ? ' class="hlrow"' : ''}><td class="r">${pa.pct(p.matcd)}</td><td class="r">${pa.pct(p.matcdAjustado)}</td><td class="r">${pa.pct(p.ivaeq)}</td><td class="r"><b>${pa.pct(p.bdi)}</b></td></tr>`).join('')}</tbody></table></div>`,
    anual: (c) => { const ib = Number.isFinite(c.param.icms2027) ? c.param.icms2027 : pa.defaults.icms2027; const f = (x) => (typeof x === 'number' ? pa.pct(x) : x);
      return `<div class="tblw"><table class="tbl sm"><thead><tr><th>Ano</th><th class="r">ICMS residual</th><th class="r">IVA</th><th class="r">CBS</th><th class="r">IBS</th><th class="r">PIS/COFINS</th><th class="r">ISS</th></tr></thead><tbody>${pa.transicao.map((x) => `<tr${x.ano === Number(c.param.ano) ? ' class="hlrow"' : ''}><td>${x.ano}</td><td class="r">${pa.pct(pa.icmsResidualPorAno(x.ano, ib))}</td><td class="r">${f(x.iva)}</td><td class="r">${f(x.cbs)}</td><td class="r">${f(x.ibs)}</td><td class="r">${f(x.pis)}</td><td class="r">${f(x.iss)}</td></tr>`).join('')}</tbody></table></div>`; },
    curva: (c, k) => { const pts = BD.paramCurva(c.param, k.r.matcdTotal, c.simplesAplicado); const fx = (v) => String(Math.round(v)); const xt = pts.map((p) => p.ano);
      return `<p class="note">Projeção ano a ano com a composição de custos, os parâmetros do BDI e as opções tributárias preenchidas.</p><div class="bdi-two"><div class="tblw"><table class="tbl sm"><thead><tr><th>Ano</th><th class="r">IVAeq</th><th class="r">BDI</th></tr></thead><tbody>${pts.map((p) => `<tr><td>${p.ano}</td><td class="r">${pa.pct(p.ivaeq)}</td><td class="r"><b>${pa.pct(p.bdi)}</b></td></tr>`).join('')}</tbody></table></div>
        <div><h4 class="sub" style="margin-top:0">Curva do IVAeq</h4>${W.line([{ pts: pts.map((p) => [p.ano, p.ivaeq]), color: '#0F9F7A', label: 'IVAeq' }], { fx, xticks: xt, dots: 1, fy: (v) => P2(v, 2), w: 520, h: 200 })}
        <h4 class="sub">Curva do BDI</h4>${W.line([{ pts: pts.map((p) => [p.ano, p.bdi]), color: OP.charts.pal().blue, label: 'BDI' }], { fx, xticks: xt, dots: 1, w: 520, h: 200 })}</div></div>`; },
    refs: () => `<p class="note">Valores típicos que orientam o preenchimento automático; podem ser substituídos nos campos de entrada.</p><div class="tblw" style="max-height:480px"><table class="tbl sm"><thead><tr><th>Tipo</th><th>Situação predominante</th><th>Tipo TCU</th><th class="r">MAT/CD</th><th class="r">MO/CD</th><th class="r">EQ/CD</th><th class="r">Créd. mín</th><th class="r">Créd. máx</th><th class="r">Créd. sug.</th><th class="r">%MATcd típ.</th><th>Observação</th></tr></thead><tbody>${pa.referenciasCredito.map((x) => `<tr><td><b>${esc(x.tipo)}</b></td><td>${esc(x.situacao)}</td><td>${esc(x.tipoTcu)}</td><td class="r">${pa.pct(x.matcd)}</td><td class="r">${pa.pct(x.mocd)}</td><td class="r">${pa.pct(x.eqcd)}</td><td class="r">${pa.pct(x.credEqMin)}</td><td class="r">${pa.pct(x.credEqMax)}</td><td class="r"><b>${pa.pct(x.credEqSug)}</b></td><td class="r">${pa.pct(x.matcdTipico)}</td><td>${esc(x.obs)}</td></tr>`).join('')}</tbody></table></div>`,
    form: () => `<div class="formula">${FORMULAS.map(([a, b]) => `${a} = ${b}`).join('\n')}</div><p class="note">O sistema aplica a tabela de transição, o fator redutor da operação e o redutor de compras governamentais para estimar a carga líquida equivalente de CBS/IBS incorporada ao BDI.</p>`,
  };
  W.FORMULAS = FORMULAS;
  UI.act.bdiUseComp = () => {
    const t = UI.model().tot; if (!(t.direct > 0)) return; const o = W.cfg().param;
    o.matcd = (t.mat + t.out) / t.direct; o.mocd = t.mo / t.direct; o.eqcd = t.eq / t.direct; UI.saveSoon(); UI.render();
    UI.toast('MAT/CD, MO/CD e EQ/CD preenchidos com a composição do custo direto do orçamento.');
  };
  UI.act.bdiCap = (el) => { const c = W.cfg(); c.cmp[el.dataset.s] = BD.clone(c.param); UI.saveSoon(); W.refresh(); UI.toast(`Cenário ${el.dataset.s} capturado.`); };
  UI.act.bdiCmpClear = () => { W.cfg().cmp = { A: null, B: null }; UI.saveSoon(); W.refresh(); };
  UI.act.bdiSimplesOff = () => { W.cfg().simplesAplicado = null; UI.saveSoon(); UI.render(); };
  UI.act.bdiParCsv = () => {
    const k = W.calc(); if (k.mode !== 'param') return;
    const rows = [['%MATcd bruto', '%MATcd ajustado', 'IVAeq', 'BDI']].concat(k.r.pts.map((p) => [pa.pct(p.matcd), pa.pct(p.matcdAjustado), pa.pct(p.ivaeq), pa.pct(p.bdi)].map((x) => x.replace('%', ''))));
    OP.exp.download('tabela_bdi_reforma_tributaria.csv', '\uFEFF' + rows.map((r) => r.join(';')).join('\n'), 'text/csv;charset=utf-8');
  };
})(typeof window !== 'undefined' ? window : globalThis);


