/* ==== 14_ui_crews.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 14_ui_crews.js
 * Dimensionamento de equipes por serviço: coeficientes (h/un), equipe
 * por recurso, nº de equipes, prazo-alvo, duração manual, gargalo,
 * ocupação e horas produtivas/improdutivas (CHP/CHI) dos equipamentos.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app; const E = OP.engine; const esc = U.esc;
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const crewLine = (r) => (r.prod.noProd ? 'sem produtividade — duração manual' : r.prod.rows.map((x) => `${x.n} ${x.name}`).join(' + ') + (r.prod.m > 1 ? ` × ${r.prod.m} equipes` : ''));
  function detail(r, m) {
    const P = r.prod, it = r.node, u = esc(r.unit), J = m.J;
    const head = `<div class="panel"><div class="rc-h"><span class="muted">${r.num}</span><button class="lnk code" data-act="${it.resourceType==='I'?'regInspectInput':'openComp'}" data-code="${esc(it.code)}">${esc(it.code)}</button><span class="un">${u}</span>${r.crit ? '<span class="tag crit">caminho crítico</span>' : `<span class="tag">folga total ${r.TF} d</span>`}</div><p class="rc-d">${esc(r.desc)}</p>
      <div class="pform"><label class="fld"><span>Quantidade (${u})</span><input data-fk="cq-${r.id}" data-in="qty" data-ch="qty" data-id="${r.id}" inputmode="decimal" value="${U.num(r.qty, 4, 2)}"></label>
      <label class="fld"><span>Equipes simultâneas</span><input data-fk="ct-${r.id}" data-ch="teams" data-id="${r.id}" inputmode="numeric" value="${P.m}" ${it.target > 0 ? 'disabled title="Definido pelo prazo desejado"' : ''}></label>
      <label class="fld"><span>Prazo desejado (dias úteis)</span><input data-fk="cg-${r.id}" data-ch="target" data-id="${r.id}" inputmode="numeric" placeholder="livre" value="${it.target > 0 ? it.target : ''}"></label>
      <label class="fld"><span>Duração manual (dias)</span><input data-fk="cd-${r.id}" data-ch="dur" data-id="${r.id}" inputmode="numeric" placeholder="automática" value="${it.dur > 0 ? it.dur : ''}"></label>
      <button class="btn ghost" data-act="crewReset" data-id="${r.id}">Restaurar equipe base</button></div></div>`;
    if (P.noProd && m.execution) return head + OP.revision183.supportHTML(r,m);
    if (P.noProd) return head + '<div class="empty">A composição não possui mão de obra nem equipamentos diretos; a duração padrão é 1 dia útil. Informe a duração manual acima.</div>';
    const bn = P.rows.find((x) => x.key === P.bottleneck);
    const kpis = `<div class="cards"><div class="card hl"><small>Duração</small><b>${m.execution ? P.days : r.days} dias úteis</b><span class="muted">${U.num(P.Dt, 1)} h por equipe${it.dur > 0 ? ' · manual' : ''}</span></div>
      <div class="card"><small>Produção (${P.m} equipe${P.m > 1 ? 's' : ''})</small><b>${U.num(P.prodDay, 2)} ${u}/dia</b><span class="muted">${U.num(P.prodHour, 3)} ${u}/h</span></div>
      <div class="card"><small>Horas de equipe por ${u} (T)</small><b>${U.num(P.T, 6, 4)}</b><span class="muted">gargalo: ${esc(bn ? bn.name : '—')}</span></div>
      <div class="card"><small>Eficiência da equipe</small><b>${U.pct(P.eff, 0)}</b><span class="muted">horas SICRO ÷ horas alocadas</span></div></div>`;
    const tbl = `<div class="panel"><h3>Composição da equipe</h3><div class="tblw"><table class="tbl sm"><thead><tr><th>Recurso</th><th class="r">Coef. (h/${u})</th><th class="r">Horas SICRO (Q×h)</th><th class="r">Qtde por equipe</th><th>Ocupação</th><th class="r">Horas prod. / improd.</th></tr></thead><tbody>${P.rows.map((x) => `<tr>
      <td><i class="dot ${x.kind}"></i>${esc(x.name)}${x.key === P.bottleneck ? ' <span class="tag crit sm">gargalo</span>' : ''}${x.kind === 'eq' ? `<br><small class="muted">CHP ${U.num(x.chp, 7, 4)} + CHI ${U.num(x.chi, 7, 4)}${x.operator ? ' · operador: ' + esc(x.operator) : ''}</small>` : ''}</td>
      <td class="r mono">${U.num(x.h, 7, 4)}</td><td class="r">${U.num(x.H, 1)}</td>
      <td class="r"><input class="qty sm" data-fk="n-${r.id}-${esc(x.key)}" data-ch="crewN" data-id="${r.id}" data-k="${esc(x.key)}" inputmode="numeric" value="${x.n}" aria-label="Quantidade por equipe"></td>
      <td><div class="ubar"><i style="width:${Math.min(100, x.util * 100).toFixed(0)}%"></i><span>${U.pct(x.util, 0)}</span></div></td>
      <td class="r">${x.kind === 'eq' ? `${U.num(x.HP, 1)} / ${U.num(x.HI, 1)}` : ''}</td></tr>`).join('')}</tbody></table></div>
      <p class="note" style="margin:8px 0 0">Ocupação = horas de trabalho ÷ horas alocadas (qtde × equipes × duração). Para equipamentos, considera só as horas produtivas (CHP).</p></div>`;
    const eqs = P.rows.filter((x) => x.kind === 'eq' && x.chp > 0);
    const mech = eqs.length ? `<div class="panel"><h3>Equipes mecânicas — horas produtivas (CHP) e improdutivas (CHI)</h3><div class="formula">Produção da(s) equipe(s): P = m / T = ${P.m} / ${U.num(P.T, 6, 4)} = ${U.num(P.prodHour, 3)} ${u}/h
${eqs.map((x) => `${x.name}
  utilização u = CHP / (CHP + CHI) = ${U.num(x.chp, 7, 4)} / ${U.num(x.h, 7, 4)} = ${U.pct(x.chp / x.h, 1)}
  produção por hora produtiva = 1 / CHP = ${U.num(1 / x.chp, 2)} ${u}/h
  horas produtivas = Q × CHP = ${U.num(x.HP, 1)} h · alocadas = n × m × D = ${U.num(x.avail, 1)} h · improdutivas = ${U.num(x.HI, 1)} h`).join('\n')}</div></div>` : '';
    const sup = P.support.length ? `<div class="panel"><h3>Equipes de apoio (subcomposições auxiliares)</h3><p class="note">Entram nos histogramas pela média H ÷ (D × J).</p><div class="tblw"><table class="tbl sm"><thead><tr><th>Recurso</th><th class="r">h/${u}</th><th class="r">Horas no serviço</th><th class="r">Média durante o serviço</th></tr></thead><tbody>${P.support.map((x) => `<tr><td><i class="dot ${x.kind}"></i>${esc(x.name)}</td><td class="r mono">${U.num(x.h, 7, 4)}</td><td class="r">${U.num(x.H, 1)}</td><td class="r">${(r.activeDays || r.days) ? U.num(x.H / ((r.activeDays || r.days) * J), 2) : '—'}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    return head + (m.execution ? OP.revision183.crewContext(r,m) : '') + kpis + tbl + mech + sup;
  }
  UI.views.crews = { render: () => {
    const m = UI.model();
    if (!m.items.length) return '<div class="empty">Adicione serviços ao orçamento para dimensionar equipes.</div>';
    let sel = m.byId.get(A.sel.item); if (!sel || sel.isStage) sel = m.items[0]; A.sel.item = sel.id;
    return `<div class="vh"><div><h1>Equipes e produtividade</h1><p class="muted">Duração = quantidade ÷ (produção da equipe SICRO × equipes × ${U.num(m.J, 1)} h/dia) · produção = 1 ÷ maior h/un por integrante (gargalo)</p></div>
      <div class="vh-a"><button class="btn ghost" data-act="crewResetAll">Restaurar equipes base de todos</button></div></div>
      <div class="split"><div class="slist" data-keep="slist">${m.items.map((r) => `<button class="si ${r.id === sel.id ? 'on' : ''} ${r.crit ? 'is-crit' : ''}" data-act="selItem" data-id="${r.id}"><span class="num">${r.num}</span><span class="sd" title="${esc(r.desc)}">${esc(short(r.desc, 70))}</span><span class="sdays">${r.days} d</span><span class="screw">${esc(crewLine(r))}</span></button>`).join('')}</div>
      <div class="sdet">${detail(sel, m)}</div></div>`;
  } };
  const itemOf = (el) => { const f = E.find(A.pj, el.dataset.id); return f && f.node; };
  UI.act.selItem = (el) => { A.sel.item = el.dataset.id; UI.render(); };
  UI.chg.teams = (el) => { const it = itemOf(el); const v = Math.round(U.parseNum(el.value)); if (!it) return; if (!(v >= 1 && v <= 200)) { UI.toast('Informe de 1 a 200 equipes', 'warn'); UI.render(); return; } it.teams = v; it.target = null; UI.commit(); };
  UI.chg.target = (el) => { const it = itemOf(el); if (!it) return; const v = Math.round(U.parseNum(el.value)); it.target = v > 0 ? v : null; UI.commit(); };
  UI.chg.fit = (el) => { const it = itemOf(el); if (!it) return; const v = U.parseNum(el.value || '0'); if (!Number.isFinite(v) || v < 0 || v > 100) return UI.toast('FIT inválido (0 a 100%)', 'warn'); it.fit = v > 0 ? v / 100 : null; UI.commit(); };
  UI.chg.dur = (el) => { const it = itemOf(el); if (!it) return; const v = Math.round(U.parseNum(el.value)); it.dur = v > 0 ? v : null; UI.commit(); };
  UI.chg.crewN = (el) => {
    const it = itemOf(el); if (!it) return; const v = Math.round(U.parseNum(el.value));
    if (!(v >= 1 && v <= 500)) { UI.toast('A quantidade mínima por equipe é 1', 'warn'); UI.render(); return; }
    const r = UI.model().byId.get(it.id); const counts = {}; r.prod.rows.forEach((x) => (counts[x.key] = x.n)); counts[el.dataset.k] = v; it.crew = counts; UI.commit();
  };
  UI.act.crewReset = (el) => { const it = itemOf(el); if (!it) return; it.crew = null; it.teams = 1; it.target = null; it.dur = null; UI.commit(); };
  UI.act.crewResetAll = () => { if (!confirm('Restaurar a equipe base (1 equipe, sem prazo-alvo) em todos os serviços?')) return; UI.model().items.forEach((r) => Object.assign(r.node, { crew: null, teams: 1, target: null, dur: null })); UI.commit(); };
})(typeof window !== 'undefined' ? window : globalThis);


