/* ==== 25_ui_evento.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 25_ui_evento.js
 * Menu EVENTOGRAMA: eventos e atribuição dos itens, etapas de cálculo
 * (sem/com custos diluídos, final com retenção para recebimento),
 * prazos e multas (com simulação de atraso) e curva de pagamentos.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app; const V = OP.evt; const esc = U.esc;
  const EU = (OP.evtui = {});
  const RS = (c) => U.brl(c / 100);
  const PC = (x, d = 2) => (Number.isFinite(x) ? (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : '—');
  const F6 = (x) => (Number.isFinite(x) ? x.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 }) : '—');
  const TABS = [['map', '1. Eventos e atribuição'], ['sem', '2. Sem custos diluídos'], ['com', '3. Com custos diluídos'], ['fin', '4. Eventograma final'], ['pz', '5. Prazos e multas']];
  EU.calc = () => { const m = UI.model(); return { m, E: V.compute(m, A.pj) }; };
  const badge = (x) => (x.status === 'ok' ? `<span class="evb ok">${esc(x.codes.join(' · '))}</span>` : x.status === 'dil' ? '<span class="evb dil">diluído</span>'
    : x.status === 'none' ? '<span class="evb none">sem evento → diluído</span>' : `<span class="evb err">código inválido: ${esc(x.bad.join(', ') || x.a)}</span>`);
  const tree = (E, vk, pk, T, extra) => `<div class="tblw evtbl"><table class="tbl sm"><thead><tr><th>Etapa</th><th>Descrição</th><th class="r">Percentual</th><th class="r">Valor da etapa (R$)</th></tr></thead><tbody>${E.events.map((e) => `<tr class="${e.leaf ? '' : 'par'} d${Math.min(e.depth, 3)}"><td>${esc(e.code)}</td><td style="padding-left:${8 + e.depth * 18}px">${esc(e.desc)}</td><td class="r">${PC(e[pk], 4)}</td><td class="r">${U.num(e[vk] / 100, 2)}</td></tr>`).join('')}${extra || ''}</tbody>
    <tfoot><tr><td colspan="2">TOTAL</td><td class="r">${PC(1, 4)}</td><td class="r">${U.num(T / 100, 2)}</td></tr></tfoot></table></div>`;
  const curva = (series) => {
    const p = OP.charts.pal(); const w = 760, h = 250, ml = 50, mr = 16, mt = 14, mb = 34; const all = series.flatMap((s) => s.pts); if (!all.length) return '';
    const xmax = Math.max(10, ...all.map((q) => q[0])) * 1.04; const X = (v) => ml + v / xmax * (w - ml - mr), Y = (v) => mt + (1 - v) * (h - mt - mb);
    let s = `<svg class="bdisvg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px" font-family="'Barlow Semi Condensed',Arial,sans-serif" font-size="11"><rect width="${w}" height="${h}" fill="${p.bg}"/>`;
    [0, .25, .5, .75, 1].forEach((f) => (s += `<line x1="${ml}" x2="${w - mr}" y1="${Y(f)}" y2="${Y(f)}" stroke="${p.line2}"/><text x="${ml - 6}" y="${Y(f) + 4}" text-anchor="end" fill="${p.ink3}">${Math.round(f * 100)}%</text>`));
    for (let i = 0; i <= 6; i++) { const d = Math.round(xmax * i / 6); s += `<text x="${X(d)}" y="${h - mb + 16}" text-anchor="middle" fill="${p.ink3}">${d} d</text>`; }
    series.forEach((se, k) => { let d = `M${X(0)},${Y(0)}`; let yv = 0; se.pts.forEach(([x, y]) => { d += `H${X(x).toFixed(1)}V${Y(y).toFixed(1)}`; yv = y; }); d += `H${X(xmax)}`;
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2.2"${se.dash ? ' stroke-dasharray="6 4"' : ''}/>`; se.pts.forEach(([x, y, t]) => (s += `<circle cx="${X(x)}" cy="${Y(y)}" r="3" fill="${se.color}"><title>${esc(t || '')} · dia ${x} · ${PC(y)}</title></circle>`));
      s += `<rect x="${ml + 10 + k * 230}" y="${mt}" width="14" height="4" fill="${se.color}"/><text x="${ml + 28 + k * 230}" y="${mt + 6}" fill="${p.ink2}">${esc(se.label)}</text>`; });
    return s + `<text x="${(ml + w - mr) / 2}" y="${h - 4}" text-anchor="middle" fill="${p.ink3}">dias corridos desde o início da obra</text></svg>`;
  };
  const PANES = {
    map: (m, E, cfg) => {
      const f = cfg.filt || 'all'; const list = `<datalist id="evList">${E.events.map((e) => `<option value="${esc(e.code)}">${esc(e.desc)}</option>`).join('')}<option value="Diluído">custo diluído entre os eventos</option></datalist>`;
      const evRows = E.events.length ? E.events.map((e) => `<tr class="${e.leaf ? '' : 'par'}"><td><input class="evc" data-fk="ec-${esc(e.code)}" data-ch="evCode" data-c="${esc(e.code)}" value="${esc(e.code)}" style="margin-left:${e.depth * 12}px" aria-label="Código do evento"></td>
        <td><input class="evd" data-fk="ed-${esc(e.code)}" data-in="evDesc" data-c="${esc(e.code)}" value="${esc(e.desc)}" aria-label="Descrição do evento"></td><td class="r">${U.num(e.v1 / 100, 2)}</td><td class="r">${PC(e.p1)}</td>
        <td class="acts"><button class="ib sm" data-act="evSub" data-c="${esc(e.code)}" title="Adicionar subevento">${UI.icon('plus', 14)}</button><button class="ib sm danger" data-act="evDel" data-c="${esc(e.code)}" title="Excluir o evento e seus subeventos">${UI.icon('trash', 14)}</button></td></tr>`).join('')
        : '<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">Nenhum evento. Use “Gerar a partir da EAP” ou “+ Evento”.</td></tr>';
      const vis = (x) => f === 'all' || x.status === f;
      const rows = m.flat.map((r) => {
        if (r.isStage) return f === 'all' ? `<tr class="st"><td class="num">${r.num}</td><td colspan="2"><b>${esc(r.node.name)}</b></td><td class="r">${U.num(r.total / 100, 2)}</td><td><input class="eva" list="evList" data-fk="ea-${r.id}" data-ch="evAssign" data-id="${r.id}" value="${esc(r.node.evento || '')}" placeholder="—" aria-label="Evento da etapa"></td><td class="muted">etapa</td></tr>` : '';
        const x = E.rows.get(r.id); if (!vis(x)) return '';
        return `<tr><td class="num">${r.num}</td><td class="code">${esc(r.node.code || '—')}</td><td class="desc" title="${esc(r.desc)}">${esc(r.desc)}</td><td class="r">${U.num(r.total / 100, 2)}</td>
          <td><input class="eva" list="evList" data-fk="ea-${r.id}" data-ch="evAssign" data-id="${r.id}" value="${esc(r.node.evento || '')}" placeholder="${x.src && x.src !== 'item' ? esc('herda (' + x.src + '): ' + x.a) : '—'}" aria-label="Evento do item"></td><td>${badge(x)}${x.status === 'none' && r.node.sug ? ` <button class="lnk sm" data-act="evSug" data-id="${r.id}" title="Evento indicado na coluna “Eventograma” da planilha, mas ausente das fórmulas">usar sugestão: ${esc(r.node.sug)}</button>` : ''}</td></tr>`;
      }).join('');
      return `${list}<div class="evmap"><section class="panel"><div class="vh" style="margin:0 0 8px"><h3 style="margin:0">Eventos</h3><div class="vh-a"><button class="btn sm" data-act="evAdd">${UI.icon('plus', 15)} Evento</button><button class="btn ghost sm" data-act="evGen" title="Cria um evento por etapa da EAP e atribui as etapas">Gerar a partir da EAP</button></div></div>
          <p class="note">Código hierárquico (1, 2, 2.1, 2.1.1…). Valor de um evento-pai = soma dos subeventos.</p><div class="tblw evscroll" data-keep="evl"><table class="tbl sm"><thead><tr><th>Código</th><th>Descrição</th><th class="r">Valor s/ diluídos</th><th class="r">%</th><th></th></tr></thead><tbody>${evRows}</tbody></table></div></section>
        <section class="panel"><div class="vh" style="margin:0 0 8px"><h3 style="margin:0">Atribuição dos itens do orçamento</h3><div class="seg">${[['all', 'Todos'], ['none', `Sem evento (${E.cnt.none})`], ['dil', `Diluídos (${E.cnt.dil})`], ['err', `Inválidos (${E.cnt.err})`]].map(([k, t]) => `<button class="${f === k ? 'on' : ''}" data-act="evFilt" data-v="${k}">${t}</button>`).join('')}</div></div>
          <p class="note">Digite o código do evento; vários separados por “;” dividem o item igualmente (ex.: <b>9.1.1; 9.2.1; 9.3.1; 9.4.1</b>); um evento com subeventos divide igualmente entre eles; <b>Diluído</b> rateia o custo entre todos os eventos. Itens sem atribuição herdam a da etapa.</p>
          <div class="tblw evscroll" data-keep="eva"><table class="tbl sm"><thead><tr><th>Item</th><th>Código</th><th>Descrição</th><th class="r">Valor (R$)</th><th>Evento</th><th>Situação</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">Nenhum item neste filtro.</td></tr>'}</tbody></table></div></section></div>`;
    },
    sem: (m, E) => `<p class="note">Valor de cada evento = soma dos itens atribuídos (preço com BDI). Percentual sobre a soma dos eventos, <b>sem</b> os custos diluídos (${RS(E.dil)}).</p>${tree(E, 'v1', 'p1', E.S)}`,
    com: (m, E) => `<div class="formula">Valor com custos diluídos = valor sem diluídos × f\nf = valor global ${RS(E.T)} ÷ Σ eventos ${RS(E.S)} = ${F6(E.f)}\nCustos diluídos (itens “Diluído” ou sem evento): ${RS(E.dil)} — rateados proporcionalmente ao valor de cada evento</div>${tree(E, 'v2', 'p2', E.T)}`,
    fin: (m, E, cfg) => {
      const fx = E.fixos.map((x, i) => `<tr class="fx"><td>${esc(x.code)}</td><td style="padding-left:8px"><input class="evd" data-fk="fd-${i}" data-in="fxDesc" data-i="${i}" value="${esc(x.desc)}" aria-label="Evento de recebimento"></td>
        <td class="r"><div class="inpx" style="width:110px;margin-left:auto"><input data-fk="fp-${i}" data-ch="fxPct" data-i="${i}" inputmode="decimal" value="${U.num(x.p3 * 100, 4, 2)}" aria-label="Percentual"><i>%</i></div></td><td class="r">${U.num(x.v3 / 100, 2)} <button class="ib sm danger" data-act="fxDel" data-i="${i}" title="Remover">${UI.icon('trash', 13)}</button></td></tr>`).join('');
      return `<div class="formula">Eventos de execução = valor com custos diluídos × (1 − retenção)  ·  retenção = ${PC(E.R)}\nEventos de recebimento = percentual fixo × valor global ${RS(E.T)}</div>
        ${tree(E, 'v3', 'p3', E.T, fx + `<tr><td colspan="4"><button class="btn ghost sm" data-act="fxAdd">${UI.icon('plus', 14)} Evento de recebimento (percentual fixo)</button></td></tr>`)}`;
    },
    pz: (m, E, cfg) => {
      const prev = V.previsto(m, E); const d0 = m.start; const sim = cfg.sim || {};
      const top = E.events.filter((e) => !e.parent).concat(E.fixos); let totM = 0;
      const rows = top.map((e) => {
        const pz = +e.prazo > 0 ? +e.prazo : null; const lim = pz ? U.addDays(d0, pz - 1) : null; const d = sim[e.code]; const mm = V.multa(e, d); totM += mm.valor; const fx = e.fixo ? '1' : '';
        return `<tr${e.fixo ? ' class="fx"' : ''}><td>${esc(e.code)}</td><td>${esc(e.desc)}</td><td class="r">${PC(e.p3, 4)}</td><td class="r">${U.num(e.v3 / 100, 2)}</td>
          <td class="r"><input class="qty sm" data-fk="pz-${esc(e.code)}" data-ch="evPrazo" data-c="${esc(e.code)}" data-fx="${fx}" inputmode="numeric" value="${pz || ''}" placeholder="—" aria-label="Prazo em dias"></td><td>${lim ? U.fmtDate(lim) : '—'}</td>
          <td class="r"><div class="inpx" style="width:96px;margin-left:auto"><input data-fk="mu-${esc(e.code)}" data-ch="evMulta" data-c="${esc(e.code)}" data-fx="${fx}" inputmode="decimal" value="${e.multa != null && e.multa !== '' ? U.num(e.multa * 100, 4, 2) : ''}" aria-label="Multa por dia"><i>%</i></div></td>
          <td class="r">${prev.has(e.code) ? prev.get(e.code) + ' d' : '—'}${pz && prev.get(e.code) > pz ? ' <span class="evb err">após o prazo</span>' : ''}</td>
          <td class="r"><input class="qty sm" data-fk="sm-${esc(e.code)}" data-ch="evSim" data-c="${esc(e.code)}" inputmode="numeric" value="${d || ''}" placeholder="dia" aria-label="Conclusão real (dia)"></td><td class="r">${mm.atraso || ''}</td><td class="r">${mm.valor ? U.num(mm.valor / 100, 2) : ''}</td></tr>`;
      }).join('');
      const pts = (fn) => { const arr = top.map((e) => [fn(e), e.p3, e.code + ' ' + e.desc]).filter((q) => q[0] > 0).sort((a, b) => a[0] - b[0]); let acc = 0; return arr.map(([x, y, t]) => [x, (acc += y), t]); };
      const s1 = pts((e) => +e.prazo || 0), s2 = pts((e) => prev.get(e.code) || 0);
      return `<div class="row" style="margin-bottom:8px;justify-content:space-between"><p class="note" style="margin:0">Prazo em dias corridos contados do início da obra (${U.fmtDate(d0)}). Multa por dia de atraso aplicada sobre o valor do evento. Informe o dia de conclusão real para simular.</p>
        <div class="row"><button class="btn ghost sm" data-act="evPrazoCron" title="Usa, para cada evento, o dia de conclusão previsto no cronograma">Aplicar prazos do cronograma</button><button class="btn ghost sm" data-act="evSimClear">Limpar simulação</button></div></div>
        <div class="tblw"><table class="tbl sm"><thead><tr><th>Etapa</th><th>Descrição</th><th class="r">Percentual</th><th class="r">Valor (R$)</th><th class="r">Prazo (dias)</th><th>Data-limite</th><th class="r">Multa (%/dia)</th><th class="r">Previsto no cronograma</th><th class="r">Conclusão real (dia)</th><th class="r">Atraso (d)</th><th class="r">Multa (R$)</th></tr></thead>
        <tbody>${rows}</tbody><tfoot><tr><td colspan="10">Multa total simulada</td><td class="r">${U.num(totM / 100, 2)}</td></tr></tfoot></table></div>
        <h4 class="sub">Curva de pagamentos do eventograma</h4>${curva([s1.length ? { pts: s1, color: OP.charts.pal().blue, label: 'pelos prazos contratuais' } : null, s2.length ? { pts: s2, color: '#DC2626', label: 'pelo cronograma (previsto)', dash: 1 } : null].filter(Boolean)) || '<div class="empty">Informe os prazos para ver a curva de pagamentos.</div>'}`;
    },
  };
  UI.views.evento = { render: () => {
    const { m, E } = EU.calc(); const cfg = V.cfg(A.pj); const tab = cfg.tab || 'map';
    if (!m.items.length) return `<div class="hero"><h1>Eventograma</h1><p>Monte o orçamento primeiro. Para ver um exemplo completo, carregue o edifício residencial da planilha do Curso SINAPI Avançado.</p><div class="row"><button class="btn pri" data-act="demo2">Carregar exemplo com eventograma</button></div></div>`;
    const warn = E.cnt.none || E.cnt.err ? `<div class="alertbox evwarn">${E.cnt.none ? `${E.cnt.none} item(ns) sem evento — somados aos custos diluídos. <button class="lnk" data-act="evFilt" data-v="none">ver</button>${m.items.some((r) => r.node.sug && !r.node.evento) ? ' · <button class="lnk" data-act="evSugAll">aplicar as sugestões da planilha</button>' : ''} ` : ''}${E.cnt.err ? `${E.cnt.err} item(ns) com código de evento inexistente. <button class="lnk" data-act="evFilt" data-v="err">ver</button>` : ''}</div>` : '';
    const cor = (cfg.correcoes || []).length ? `<p class="note bdi-note">Na planilha de origem, ${cfg.correcoes.map((c) => `o item ${esc(c.item)} (${esc(U.cap(c.desc).slice(0, 60))}…, ${U.brl(c.valor)}) era somado nos eventos ${esc(c.eventos.join(' e '))}`).join('; ')}. Aqui cada item conta uma vez: mantido no evento ${esc(cfg.correcoes.map((c) => c.mantido).join(', '))}, que o referencia explicitamente.</p>` : '';
    const pipe = [['Σ eventos (sem custos diluídos)', RS(E.S), `${E.cnt.ok} itens atribuídos`], ['Custos diluídos', RS(E.dil), `${E.cnt.dil} diluídos${E.cnt.none ? ` · ${E.cnt.none} sem evento` : ''}`], ['Fator de diluição f', F6(E.f), 'valor global ÷ Σ eventos'],
      ['Retenção p/ recebimento', PC(E.R), `${E.fixos.length} evento(s) de recebimento`], ['Valor global', RS(E.T), Math.abs(E.total3 - E.T) > 1 && E.S > 0 ? 'atenção: soma dos eventos ≠ valor global' : 'eventograma final = 100%']];
    return `<div class="vh"><div><h1>Eventograma</h1><p class="muted">Pagamento por eventos a partir do orçamento: eventos → custos diluídos → retenção para recebimento → prazos e multas.</p></div>
      <div class="vh-a"><button class="btn ghost" data-act="evtXlsx">${UI.icon('dl')} Excel</button><button class="btn ghost" data-act="evtCsv">${UI.icon('dl')} CSV</button><button class="btn ghost" data-act="print">${UI.icon('pdf')} PDF</button></div></div>
      <div class="evpipe">${pipe.map(([t, v, d], i) => `<div class="evp${i === 4 ? ' hl' : ''}"><small>${t}</small><b>${v}</b><span class="muted">${d}</span></div>${i < 4 ? '<i class="evarr">→</i>' : ''}`).join('')}</div>
      ${warn}${cor}<div class="seg evtabs">${TABS.map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-act="evtTab" data-v="${k}">${t}</button>`).join('')}</div><div class="evbody">${PANES[tab](m, E, cfg)}</div>`;
  } };
  /* ---------- ações ---------- */
  const cfg = () => V.cfg(A.pj);
  const redo = () => { UI.saveSoon(); UI.render(); };
  UI.act.evtTab = (el) => { cfg().tab = el.dataset.v; redo(); };
  UI.act.evFilt = (el) => { const c = cfg(); c.filt = el.dataset.v; c.tab = 'map'; redo(); };
  UI.chg.evAssign = (el) => { const f = OP.engine.find(A.pj, el.dataset.id); if (!f) return; f.node.evento = el.value.trim(); redo(); };
  UI.act.evSug = (el) => { const f = OP.engine.find(A.pj, el.dataset.id); if (!f || !f.node.sug) return; f.node.evento = f.node.sug; delete f.node.sug; redo(); };
  UI.act.evSugAll = () => { let n = 0; UI.model().items.forEach((r) => { if (r.node.sug && !r.node.evento) { r.node.evento = r.node.sug; delete r.node.sug; n++; } }); redo(); UI.toast(`${n} sugestão(ões) aplicada(s).`); };
  UI.inp.evDesc = (el) => { const e = cfg().events.find((x) => String(x.code) === el.dataset.c); if (e) { e.desc = el.value; UI.saveSoon(); } };
  UI.chg.evCode = (el) => {
    const old = el.dataset.c, nv = el.value.trim().replace(/\s+/g, '');
    if (!nv || nv === old) { el.value = old; return; }
    if (!/^[0-9A-Za-z]+(\.[0-9A-Za-z]+)*$/.test(nv) || cfg().events.some((x) => String(x.code) === nv)) { UI.toast('Código inválido ou já existente.', 'warn'); el.value = old; return; }
    V.renomear(A.pj, old, nv); redo(); UI.toast(`Evento ${old} renomeado para ${nv}; atribuições atualizadas.`);
  };
  const nextRoot = () => { const c = cfg(); const ints = c.events.concat(c.fixos).map((e) => String(e.code)).filter((x) => /^\d+$/.test(x)).map(Number); return String((ints.length ? Math.max(...ints) : 0) + 1); };
  UI.act.evAdd = () => { const c = cfg(); c.events.push({ code: nextRoot(), desc: 'NOVO EVENTO', prazo: null, multa: 0.0002 }); redo(); };
  UI.act.evSub = (el) => { const c = cfg(); const p = el.dataset.c; const ks = c.events.map((e) => String(e.code)).filter((x) => x.startsWith(p + '.') && !x.slice(p.length + 1).includes('.')).map((x) => +x.slice(p.length + 1)).filter(Number.isFinite);
    c.events.push({ code: `${p}.${(ks.length ? Math.max(...ks) : 0) + 1}`, desc: 'NOVO SUBEVENTO' }); redo(); };
  UI.act.evDel = (el) => { const code = el.dataset.c; if (!confirm(`Excluir o evento ${code} e seus subeventos? As atribuições a eles serão removidas.`)) return; V.remover(A.pj, code); redo(); };
  UI.act.evGen = () => { const c = cfg(); if (c.events.length && !confirm('Substituir os eventos atuais por um evento para cada etapa da EAP? As atribuições das etapas serão refeitas.')) return; V.fromEAP(A.pj, UI.model()); c.tab = 'map'; redo(); UI.toast('Eventos criados a partir da EAP, com 5% + 5% para os recebimentos provisório e definitivo.'); };
  UI.inp.fxDesc = (el) => { const x = cfg().fixos[+el.dataset.i]; if (x) { x.desc = el.value; UI.saveSoon(); } };
  UI.chg.fxPct = (el) => { const x = cfg().fixos[+el.dataset.i]; const v = U.parseNum(el.value); if (!x || !isFinite(v) || v < 0 || v >= 100) { UI.toast('Percentual inválido.', 'warn'); UI.render(); return; } x.pct = v / 100; redo(); };
  UI.act.fxAdd = () => { const c = cfg(); c.fixos.push({ code: nextRoot(), desc: 'Evento de recebimento', pct: 0.05, prazo: null, multa: 0.0007 }); redo(); };
  UI.act.fxDel = (el) => { cfg().fixos.splice(+el.dataset.i, 1); redo(); };
  const evByCode = (code, fx) => (fx ? cfg().fixos : cfg().events).find((x) => String(x.code) === code);
  UI.chg.evPrazo = (el) => { const e = evByCode(el.dataset.c, el.dataset.fx); if (!e) return; const v = Math.round(U.parseNum(el.value)); e.prazo = v > 0 ? v : null; redo(); };
  UI.chg.evMulta = (el) => { const e = evByCode(el.dataset.c, el.dataset.fx); if (!e) return; const v = U.parseNum(el.value); e.multa = isFinite(v) && v >= 0 ? v / 100 : null; redo(); };
  UI.chg.evSim = (el) => { const c = cfg(); const v = Math.round(U.parseNum(el.value)); if (v > 0) c.sim[el.dataset.c] = v; else delete c.sim[el.dataset.c]; redo(); };
  UI.act.evSimClear = () => { cfg().sim = {}; redo(); };
  UI.act.evPrazoCron = () => {
    const { m, E } = EU.calc(); const prev = V.previsto(m, E); let n = 0;
    cfg().events.forEach((e) => { const c = String(e.code); if (!c.includes('.') && prev.has(c)) { e.prazo = prev.get(c); n++; } });
    redo(); UI.toast(`${n} prazo(s) preenchidos com a conclusão prevista no cronograma.`);
  };
  /* ---------- exportações ---------- */
  EU.sheets = () => {
    const { m, E } = EU.calc(); const h = (v) => ({ v, s: 'h' }); const pc = (v) => ({ v, s: 'pct' }), mo = (v) => ({ v: v / 100, s: 'money' });
    const tab = (vk, pk, extra) => [['Etapa', 'Descrição', 'Percentual', 'Valor da etapa (R$)'].map(h)].concat(E.events.map((e) => [e.code, (e.depth ? '    '.repeat(e.depth) : '') + e.desc, pc(e[pk]), mo(e[vk])]), extra || []);
    const fin = E.fixos.map((x) => [x.code, x.desc, pc(x.p3), mo(x.v3)]);
    const pz = [['Etapa', 'Descrição', 'Percentual', 'Valor da etapa (R$)', 'Prazo de execução (dias)', 'Multa (% por dia de atraso)'].map(h)]
      .concat(E.events.map((e) => [e.code, e.desc, pc(e.p3), mo(e.v3), e.prazo || '', e.multa != null && e.multa !== '' ? { v: +e.multa, s: 'pct' } : '']), E.fixos.map((x) => [x.code, x.desc, pc(x.p3), mo(x.v3), x.prazo || '', x.multa != null ? { v: +x.multa, s: 'pct' } : '']));
    const atr = [['Item', 'Código', 'Fonte', 'Descrição', 'Valor (R$)', 'Evento (efetivo)', 'Origem da atribuição', 'Situação'].map(h)]
      .concat(m.items.map((r) => { const x = E.rows.get(r.id); return [r.num, String(r.node.code || ''), r.fonte || '', r.desc, mo(r.total), x.a, x.src || '', { ok: 'atribuído', dil: 'diluído', none: 'sem evento (diluído)', err: 'código inválido' }[x.status]]; }));
    return [{ name: 'Eventograma final', rows: tab('v3', 'p3', fin.concat([[{ v: 'Total', s: 'bold' }, '', pc(1), mo(E.T)]])), cols: [8, 70, 12, 16], freeze: 1 },
      { name: 'Prazos e multas', rows: pz, cols: [8, 70, 12, 16, 14, 14], freeze: 1 },
      { name: 'Sem custos diluídos', rows: tab('v1', 'p1', [[{ v: 'Total', s: 'bold' }, '', pc(1), mo(E.S)]]), cols: [8, 70, 12, 16], freeze: 1 },
      { name: 'Com custos diluídos', rows: tab('v2', 'p2', [[{ v: 'Total', s: 'bold' }, '', pc(1), mo(E.T)], [], [`Fator de diluição f = ${F6(E.f)} (valor global ÷ Σ eventos); custos diluídos ${RS(E.dil)}`]]), cols: [8, 70, 12, 16], freeze: 1 },
      { name: 'Atribuição dos itens', rows: atr, cols: [8, 10, 12, 60, 14, 18, 14, 18], freeze: 1 }];
  };
  const fname = () => 'Eventograma_' + (U.deaccent(A.pj.name || 'orcamento').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'orcamento');
  UI.act.evtXlsx = async () => {
    try { const out = await OP.xlsx.writeWorkbook(EU.sheets()); OP.exp.download(fname() + '.xlsx', out instanceof Blob ? out : new Blob([out])); UI.toast('Eventograma exportado (5 abas).'); }
    catch (e) { console.error(e); UI.toast('Erro ao gerar Excel: ' + e.message, 'warn'); }
  };
  UI.act.evtCsv = () => {
    const { E } = EU.calc(); const n2 = (v, d = 2) => v.toFixed(d).replace('.', ',');
    const L = [['Etapa', 'Descrição', 'Percentual (%)', 'Valor (R$)', 'Prazo (dias)', 'Multa (%/dia)'].join(';')].concat(E.events.concat(E.fixos).map((e) => [e.code, `"${String(e.desc).replace(/"/g, '""')}"`, n2(e.p3 * 100, 6), n2(e.v3 / 100), e.prazo || '', e.multa != null && e.multa !== '' ? n2(e.multa * 100, 4) : ''].join(';')));
    OP.exp.download(fname() + '.csv', '\uFEFF' + L.join('\r\n'), 'text/csv;charset=utf-8');
  };
})(typeof window !== 'undefined' ? window : globalThis);

