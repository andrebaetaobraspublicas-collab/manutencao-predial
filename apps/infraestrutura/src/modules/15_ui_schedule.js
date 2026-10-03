/* ==== 15_ui_schedule.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 15_ui_schedule.js
 * Cronograma: Gantt (setas de dependência, folgas, datas cedo/tarde),
 * rede PERT e tabela CPM com edição de predecessoras (TI/II/TT/IT ± dias).
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app; const esc = U.esc;
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  function cpmTable(m) {
    const num = new Map(m.items.map((r) => [r.id, r.seq])); const preds = new Map();
    m.cpm.links.forEach((l) => { if (!l.skip) { if (!preds.has(l.to)) preds.set(l.to, []); preds.get(l.to).push(l); } });
    return `<div class="tblw" data-keep="cpm"><table class="tbl sm cpm"><thead><tr><th>Nº</th><th>EAP</th><th>Atividade</th><th class="r" title="Duração em dias úteis">Dur.</th><th class="r" title="Primeira data de início (Early Start)">PDI</th><th class="r" title="Primeira data de término (Early Finish)">PDT</th><th class="r" title="Última data de início (Late Start)">UDI</th><th class="r" title="Última data de término (Late Finish)">UDT</th><th class="r" title="Folga total">FT</th><th class="r" title="Folga livre">FL</th><th>Início</th><th>Término</th><th>Predecessoras</th></tr></thead>
      <tbody>${m.items.map((r) => `<tr class="${r.crit ? 'is-crit' : ''}"><td>${r.seq}</td><td class="muted">${r.num}</td><td class="desc" title="${esc(r.desc)}">${esc(short(r.desc, 70))}</td><td class="r">${r.days}</td><td class="r">${r.ES}</td><td class="r">${r.EF}</td><td class="r">${r.LS}</td><td class="r">${r.LF}</td><td class="r"><b>${r.TF}</b></td><td class="r">${r.FF}</td><td>${U.fmtDate(r.start)}</td><td>${U.fmtDate(r.end)}</td>
      <td><input class="pred" data-fk="pred-${r.id}" data-ch="pred" data-id="${r.id}" value="${esc((preds.get(r.id) || []).map((l) => OP.cpm.fmtPred(l, (id) => num.get(id))).join('; '))}" placeholder="ex.: 2; 3II+2"></td></tr>`).join('')}</tbody></table></div>
      <p class="note" style="margin-top:8px">Datas em dias úteis a partir do início (0 = primeiro dia). Predecessoras: nº da atividade + tipo (TI término→início, padrão; II início→início; TT término→término; IT início→término) + defasagem em dias. Ex.: <b>3; 5II+2; 7TT-1</b>.</p>`;
  }
  function detailPanel(m) {
    const r = A.sel.item && m.byId.get(A.sel.item);
    if (!r || r.isStage) return '<p class="note" style="margin-top:10px">Clique numa barra, nó ou linha para ver datas e folgas e editar as predecessoras.</p>';
    const num = new Map(m.items.map((x) => [x.id, x.seq]));
    const preds = m.cpm.links.filter((l) => l.to === r.id && !l.skip), succs = m.cpm.links.filter((l) => l.from === r.id && !l.skip);
    return `<div class="panel" style="margin-top:12px"><div class="vh" style="margin:0 0 8px"><div><h3 style="margin:0">${r.seq}. ${esc(r.desc)}</h3><p class="muted">${r.num} · ${U.num(r.qty, 2)} ${esc(r.unit)} · ${esc(OP.prod.crewText(r.prod) || 'sem equipe')}</p></div>
      <div class="vh-a"><button class="btn ghost sm" data-act="crewOf" data-id="${r.id}">${UI.icon('crew', 16)} Equipe</button><button class="ib" data-act="selItem" data-id="" title="Fechar">${UI.icon('x')}</button></div></div>
      <div class="kv"><div><small>Duração</small><b>${r.days} d</b></div><div><small>Datas cedo</small><b>${U.fmtDate(r.start)} → ${U.fmtDate(r.end)}</b></div><div><small>Datas tarde</small><b>${U.fmtDate(r.lstart)} → ${U.fmtDate(r.lend)}</b></div><div><small>Folga total</small><b class="${r.crit ? 'crit' : ''}">${r.TF} d</b></div><div><small>Folga livre</small><b>${r.FF} d</b></div></div>
      <div class="pform"><label class="fld"><span>Predecessoras</span><input class="pred" style="width:260px" data-fk="pd-${r.id}" data-ch="pred" data-id="${r.id}" value="${esc(preds.map((l) => OP.cpm.fmtPred(l, (id) => num.get(id))).join('; '))}" placeholder="ex.: 3; 5II+2; 7TT-1"></label>
      <div class="note" style="margin:0">Sucessoras: ${succs.length ? succs.map((l) => num.get(l.to) + OP.cpm.fmtPred({ from: '', type: l.type, lag: l.lag }, () => '')).join('; ') : '—'}<br>Tipos: TI término→início (padrão) · II início→início · TT término→término · IT início→término · defasagem em dias úteis.</div></div></div>`;
  }
  UI.views.schedule = { render: () => {
    const m = UI.model(); const pj = A.pj; const sv = A.sel.sv || 'gantt'; const cal = pj.calendar;
    if (!m.items.length) return '<div class="empty">Adicione serviços ao orçamento para gerar o cronograma.</div>';
    const ncrit = m.items.filter((r) => r.crit).length; let body;
    if (sv === 'pert') { A.svgs.sched = () => OP.charts.pert(m, {}); body = `<div class="pert" data-keep="pert">${OP.charts.pert(m, { sel: A.sel.item })}</div>`; }
    else if (sv === 'cpm') { A.svgs.sched = null; body = cpmTable(m); }
    else {
      const o = { scale: A.sel.gscale || 'week', late: !!A.sel.glate, sel: A.sel.item }; const g = OP.charts.gantt(m, o);
      A.svgs.sched = () => OP.charts.gantt(m, Object.assign({}, o, { sel: null })).full;
      body = `<div class="gwrap" data-keep="gantt"><div class="gleft">${g.left}</div><div class="gright">${g.right}</div></div>`;
    }
    return `<div class="vh"><div><h1>Cronograma</h1><p class="muted">Prazo <b>${m.T} dias úteis</b> · ${U.fmtDate(m.start)} → ${U.fmtDate(m.end)} · ${ncrit} de ${m.items.length} serviços críticos${m.cpm.cycle ? ' · <b class="crit">vínculo circular ignorado — revise as predecessoras</b>' : ''}</p></div>
      <div class="vh-a"><div class="seg">${[['gantt', 'Gantt'], ['pert', 'Rede PERT'], ['cpm', 'Tabela CPM']].map(([k, t]) => `<button class="${sv === k ? 'on' : ''}" data-act="sv" data-v="${k}">${t}</button>`).join('')}</div>
      ${sv !== 'cpm' ? `<button class="btn ghost" data-act="expSVG" data-k="sched">${UI.icon('img')} SVG</button><button class="btn ghost" data-act="expPNG" data-k="sched">${UI.icon('img')} PNG</button>` : `<button class="btn ghost" data-act="exportXLSX">${UI.icon('dl')} Excel</button>`}
      <button class="btn ghost" data-act="print">${UI.icon('pdf')} PDF</button></div></div>
      <div class="toolbar"><label class="fld"><span>Início da obra</span><input type="date" data-ch="start" value="${esc(pj.start)}"></label>
      <label class="fld"><span>Sequenciamento</span><select data-ch="seq">${Object.entries(OP.engine.SEQ).map(([k, t]) => `<option value="${k}" ${pj.seq === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="fld"><span>Semana</span><select data-ch="wdays"><option value="5" ${cal.workdays.length !== 6 ? 'selected' : ''}>segunda a sexta</option><option value="6" ${cal.workdays.length === 6 ? 'selected' : ''}>segunda a sábado</option></select></label>
      <label class="fld"><span>Horas/dia</span><input data-ch="hpd" inputmode="decimal" value="${U.num(cal.hpd, 2)}" style="width:70px"></label>
      <label class="ck"><input type="checkbox" data-ch="hol" ${cal.holidays ? 'checked' : ''}> Feriados nacionais</label><label class="ck"><input type="checkbox" data-ch="carn" ${cal.carnaval ? 'checked' : ''}> Carnaval</label>
      ${sv === 'gantt' ? `<label class="fld"><span>Escala</span><select data-ch="gscale">${[['day', 'dias'], ['week', 'semanas'], ['month', 'meses']].map(([k, t]) => `<option value="${k}" ${(A.sel.gscale || 'week') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="ck"><input type="checkbox" data-ch="glate" ${A.sel.glate ? 'checked' : ''}> Mostrar datas mais tarde</label>` : ''}</div>
      ${body}${detailPanel(m)}`;
  } };
  UI.act.sv = (el) => { A.sel.sv = el.dataset.v; UI.render(); };
  UI.chg.start = (el) => { if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) { A.pj.start = el.value; UI.commit(); } };
  UI.chg.seq = (el) => {
    const v = el.value;
    if (v === 'manual' && A.pj.seq !== 'manual') A.pj.links = UI.model().cpm.links.filter((l) => !l.skip).map(({ from, to, type, lag }) => ({ id: U.uid('lk'), from, to, type, lag }));
    A.pj.seq = v; UI.commit();
  };
  UI.chg.wdays = (el) => { A.pj.calendar.workdays = el.value === '6' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]; UI.commit(); };
  UI.chg.hpd = (el) => { const v = U.parseNum(el.value); if (v > 0 && v <= 24) { A.pj.calendar.hpd = v; UI.commit(); } else { UI.toast('Horas por dia inválidas', 'warn'); UI.render(); } };
  UI.chg.hol = (el) => { A.pj.calendar.holidays = el.checked; UI.commit(); };
  UI.chg.carn = (el) => { A.pj.calendar.carnaval = el.checked; UI.commit(); };
  UI.chg.gscale = (el) => { A.sel.gscale = el.value; UI.render(); };
  UI.chg.glate = (el) => { A.sel.glate = el.checked; UI.render(); };
  UI.chg.pred = (el) => {
    const m = UI.model(); const id = el.dataset.id; const byNum = new Map(m.items.map((r) => [r.seq, r.id]));
    const res = OP.cpm.parsePred(el.value, (n) => byNum.get(n));
    if (res.errs.length) UI.toast('Não entendi: ' + res.errs.join(', ') + ' — use 3, 3II+2, 5TT-1', 'warn');
    if (A.pj.seq !== 'manual') { A.pj.links = m.cpm.links.filter((l) => !l.skip).map(({ from, to, type, lag }) => ({ id: U.uid('lk'), from, to, type, lag })); A.pj.seq = 'manual'; UI.toast('Sequenciamento alterado para “Manual”: os vínculos automáticos foram mantidos para edição.'); }
    A.pj.links = A.pj.links.filter((l) => l.to !== id).concat(res.links.filter((l) => l.from !== id).map((l) => ({ id: U.uid('lk'), from: l.from, to: id, type: l.type, lag: l.lag })));
    UI.commit();
  };
})(typeof window !== 'undefined' ? window : globalThis);


