/* ==== 46_fit.js — FIT: Fator de Interferência de Tráfego (SICRO, Manual de Custos — Volume 05) ==== */
/* Motor da "Calculadora do FIT" do usuário (equações 2 a 8 do Volume 05, 2ª ed., 2025), integrado ao
 * momento de transporte do OrçaPro: a DMT pavimentada de cada item transportado (rural + urbana)
 * passa a entrar no custo como DMT fictícia, DMTF = FIT × DMTp. */
(function (G) {
'use strict';
const OP = G.OP, U = OP.util, UI = OP.ui, A = OP.app, esc = U.esc;
const F = (OP.fit = { version: '2.0-orçaplan' });
  function rnd(x, n) {
    if (!isFinite(x)) return x;
    const f = Math.pow(10, n), a = Math.abs(x);
    return (x < 0 ? -1 : 1) * Math.round(parseFloat((a * f).toPrecision(15))) / f;
  }
  const r2 = x => rnd(x, 2), r4 = x => rnd(x, 4);
  const DEF = { Vu: 30, Vp: 60, lim: 100, a1Base: 70, a1Coef: 0.0035 };

  /* Eq. 3 — fator de conversão para vias urbanas (s/km) */
  function fatorConversao(Vu, Vp) { return (1 / Vu - 1 / Vp) * 3600; }
  /* Eq. 5 — fator padrão (s/km) */
  function fatorPadrao(Vp) { return 3600 / Vp; }
  /* Eq. 2 — atraso PARE e SIGA (s) */
  function atrasoA1(vmdf, p) { p = p || DEF; return p.a1Base + p.a1Coef * vmdf; }
  /* Eq. 4 — atraso em vias urbanas pavimentadas (s) */
  function atrasoA2(dmtu, Fc) { return Fc * dmtu; }

  /* Calcula DMTp, A1, A2, FIT (Eq. 7) e DMTF (Eq. 8) de uma rota.
     rota: {ln, rp, dmtr, dmtu, vmdf, passa, fit}
     ctx:  {pareSiga:boolean, Vu, Vp, lim, vmdfPadrao} */
  function calcRota(rota, ctx) {
    const p = Object.assign({}, DEF, ctx || {});
    const dmtr = +rota.dmtr || 0, dmtu = +rota.dmtu || 0;
    const DMTp = r2(dmtr + dmtu);
    const vmdf = (rota.vmdf === null || rota.vmdf === undefined || rota.vmdf === '') ? (+p.vmdfPadrao || 0) : +rota.vmdf;
    const Fc = fatorConversao(p.Vu, p.Vp), Fp = fatorPadrao(p.Vp);
    const out = { DMTp, vmdf, Fc, Fp, A1: 0, A2: 0, FIT: 1, DMTF: DMTp, motivo: '' };
    if (rota.fit === false) { out.motivo = 'FIT não aplicado (transporte não é do executor / CIF)'; return out; }
    if (DMTp <= 0) { out.motivo = 'Sem trecho pavimentado'; return out; }
    if (DMTp > p.lim) { out.motivo = 'DMT pavimentada acima de ' + p.lim + ' km — sem atraso (item 3.2.1)'; return out; }
    out.A1 = (p.pareSiga && rota.passa !== false) ? r2(atrasoA1(vmdf, p)) : 0;
    out.A2 = r2(atrasoA2(dmtu, Fc));
    out.FIT = r4(1 + (out.A1 + out.A2) / (DMTp * Fp));
    out.DMTF = out.FIT * DMTp;
    return out;
  }
const T10 = [['Areia média', 'M0082', 0, 2.5, 13.2, 0, 1665, 1.0957], ['Cimento Portland', 'M0424', 0, 1.5, 16, 10.2, 1665, 1.4376], ['Brita 1', 'M0191', 0, 3.5, 20.7, 14.4, 1665, 1.4463], ['Cal hidratada', 'M0344', 0, 1.5, 16, 10.2, 1665, 1.4376], ['Material usinado', '6416040', 0, 1.5, 21.34, 1.5, 1640, 1.1209], ['Massa asfáltica comercial', 'M0785', 0, 2, 38.41, 15.9, 1640, 1.3160], ['Revestimento asfáltico removido', 'M3507', 0, 1.5, 21.34, 1.5, 1640, 1.1209]];
F.DEF = DEF; F.calcRota = calcRota; F.fatorConversao = fatorConversao; F.fatorPadrao = fatorPadrao;
F.ctx = (pj) => { pj.fit = Object.assign({ pareSiga: false, Vu: 30, Vp: 60, lim: 100, vmdfPadrao: 0, a1Base: 70, a1Coef: 0.0035 }, pj.fit || {}); return pj.fit; };
F.route = (d) => ({ ln: +d.LN || 0, rp: +d.RP || 0, dmtr: +d.P || 0, dmtu: +d.U || 0, vmdf: d.vmdf == null || d.vmdf === '' ? null : +d.vmdf, passa: d.passa !== false, fit: d.fit !== false });
F.calc = (pj, d) => calcRota(F.route(d || {}), F.ctx(pj));
/* configuração efetiva para o motor de custos: P = DMT fictícia (FIT × DMTp) */
F.effective = (pj) => {
  if (!pj || !pj.dmt) return null; const ctx = F.ctx(pj);
  const eff = (d) => { if (!d) return d; const r = calcRota(F.route(d), ctx); return { LN: +d.LN || 0, RP: +d.RP || 0, P: r.DMTF, FE: +d.FE || 0 }; };
  const out = { def: eff(pj.dmt.def), byMat: {} }; for (const [k, v] of Object.entries(pj.dmt.byMat || {})) out.byMat[k] = eff(v); return out;
};
F.selfTests = () => T10.map((t) => { const r = calcRota({ ln: t[2], rp: t[3], dmtr: t[4], dmtu: t[5], vmdf: t[6], passa: true, fit: true }, { pareSiga: true, Vu: 30, Vp: 60, lim: 100 }); return { group: 'Volume 05, Tabela 10', name: t[0] + ' (' + t[1] + ')', expected: t[7], actual: r.FIT, pass: Math.abs(r.FIT - t[7]) < 1e-9 }; })
  .concat([{ group: 'Equações', name: 'Fc = (1/30 − 1/60) × 3600 = 60 s/km', expected: 60, actual: fatorConversao(30, 60), pass: Math.abs(fatorConversao(30, 60) - 60) < 1e-9 }, { group: 'Equações', name: 'Fp = 3600 / 60 = 60 s/km', expected: 60, actual: fatorPadrao(60), pass: fatorPadrao(60) === 60 }]);
/* ---------------- tela ---------------- */
const n2 = (v, d = 2) => U.num(v, d);
UI.views.fit = { render: () => {
  const pj = A.pj, m = UI.model(), c = F.ctx(pj), d = OP.transport.cfg(pj), list = OP.transport.usage(m), tm = m.base.raw.tmat || {};
  const rows = list.map((x) => { const spec = d.byMat[x.mat], src = spec || d.def, r = F.calc(pj, src); return { x, spec, src, r, desc: (tm[x.mat] || [])[0] || (m.base.ins(x.mat) || m.base.comp(x.mat) || {}).desc || '' }; });
  const pav = rows.filter((o) => o.r.DMTp > 0), wsum = U.sum(pav, (o) => o.x.q * o.r.DMTp), wfit = wsum ? U.sum(pav, (o) => o.x.q * o.r.DMTp * o.r.FIT) / wsum : 1;
  const inp = (mat, k, v, ph, w = 70) => `<input class="qty sm" style="width:${w}px" data-ch="fitSet" data-m="${esc(mat)}" data-k="${k}" inputmode="decimal" value="${v == null || v === '' ? '' : n2(+v, k === 'vmdf' ? 0 : 2)}" placeholder="${ph}">`;
  const chk = (mat, k, v) => `<input type="checkbox" data-ch="fitSet" data-m="${esc(mat)}" data-k="${k}"${v !== false ? ' checked' : ''}>`;
  const t = F._t || (F._t = F.selfTests()), ok = t.filter((x) => x.pass).length;
  const row = (mat, name, src, r, q) => `<tr${r.FIT > 1 ? '' : ' class="muted"'}><td>${mat === '*' ? '<b>padrão</b>' : `<button class="lnk code" data-act="${m.base.ins(mat) ? 'regInspectInput' : 'openComp'}" data-code="${esc(mat)}">${esc(mat)}</button>`}</td><td>${esc(String(name).slice(0, 56))}</td><td class="r">${q == null ? '' : n2(q, 1)}</td>
    <td class="r">${n2(src.P || 0)}</td><td class="r">${inp(mat, 'U', src.U, '0')}</td><td class="r">${inp(mat, 'vmdf', src.vmdf, c.vmdfPadrao ? n2(c.vmdfPadrao, 0) : '0', 78)}</td><td class="r">${chk(mat, 'passa', src.passa)}</td><td class="r">${chk(mat, 'fit', src.fit)}</td>
    <td class="r">${n2(r.DMTp)}</td><td class="r">${n2(r.A1)}</td><td class="r">${n2(r.A2)}</td><td class="r"><b>${n2(r.FIT, 4)}</b></td><td class="r">${n2(r.DMTF)}</td><td><small class="muted">${esc(r.motivo || '')}</small></td></tr>`;
  return `<div class="vh"><div><h1>FIT — Fator de Interferência de Tráfego</h1><p class="muted">Manual de Custos de Infraestrutura de Transportes — Volume 05 (SICRO/DNIT) · aplicado à DMT pavimentada do momento de transporte: DMTF = FIT × DMTp, com DMTp = DMT rural + DMT urbana.</p></div>
    <div class="row"><button class="btn" data-act="nav" data-v="transport">${UI.icon('swap')} Transportes (DMT)</button></div></div>
    <div class="cards"><div class="card hl"><small>FIT médio ponderado</small><b>${n2(wfit, 4)}</b><span class="muted">pela tonelagem × DMT pavimentada</span></div><div class="card"><small>Itens com FIT &gt; 1</small><b>${U.int(rows.filter((o) => o.r.FIT > 1).length)} de ${U.int(rows.length)}</b><span class="muted">itens transportados no orçamento</span></div>
      <div class="card"><small>Fatores</small><b>Fc ${n2(fatorConversao(c.Vu, c.Vp))} · Fp ${n2(fatorPadrao(c.Vp))}</b><span class="muted">s/km (Vu ${n2(c.Vu, 0)} e Vp ${n2(c.Vp, 0)} km/h)</span></div><div class="card"><small>Conferência (Tabela 10)</small><b>${ok} / ${t.length}</b><span class="muted">casos do manual reproduzidos</span></div></div>
    <div class="panel"><h3>Parâmetros do Volume 05</h3><p class="note">A1 (Eq. 2) = ${n2(c.a1Base, 0)} + ${U.num(c.a1Coef, 4)} × VMDf, em segundos, quando há sistema PARE e SIGA na rodovia e o transporte passa pela obra · A2 (Eq. 4) = Fc × DMT urbana · FIT (Eq. 7) = 1 + (A1 + A2) ÷ (DMTp × Fp), arredondado em 4 casas · sem FIT acima de ${n2(c.lim, 0)} km de DMT pavimentada (item 3.2.1) ou quando o transporte não é do executor.</p>
      <div class="pform"><label class="fld"><span>Sistema PARE e SIGA na obra</span><select data-ch="fitCtx" data-k="pareSiga"><option value="0"${!c.pareSiga ? ' selected' : ''}>Não</option><option value="1"${c.pareSiga ? ' selected' : ''}>Sim</option></select></label>
      ${[['VMDf padrão (veículos/dia)', 'vmdfPadrao', 0], ['Vu — velocidade urbana (km/h)', 'Vu', 0], ['Vp — velocidade padrão (km/h)', 'Vp', 0], ['Limite de DMTp (km)', 'lim', 0], ['A1 — parcela fixa (s)', 'a1Base', 0], ['A1 — coeficiente do VMDf (s)', 'a1Coef', 4]].map(([l, k, dd]) => `<label class="fld"><span>${l}</span><input class="qty" data-ch="fitCtx" data-k="${k}" inputmode="decimal" value="${U.num(c[k], dd)}"></label>`).join('')}</div></div>
    <div class="panel"><h3>FIT por item transportado</h3><p class="note">DMT rural pavimentada (P), leito natural e revestimento primário são informados em Transportes (DMT); aqui entram a parcela urbana, o VMDf e as condições do Volume 05. Itens sem DMT própria usam a linha “padrão”.</p>
      <div class="tblw"><table class="tbl sm"><thead><tr><th>Código</th><th>Item transportado</th><th class="r">t</th><th class="r">DMTr (km)</th><th class="r">DMTu (km)</th><th class="r">VMDf</th><th class="r">Passa na obra</th><th class="r">Aplica FIT</th><th class="r">DMTp</th><th class="r">A1 (s)</th><th class="r">A2 (s)</th><th class="r">FIT</th><th class="r">DMTF (km)</th><th>Observação</th></tr></thead><tbody>
      ${row('*', 'DMT padrão (itens sem DMT específica)', d.def, F.calc(pj, d.def), null)}${rows.map((o) => row(o.x.mat, o.desc + (o.spec ? '' : ' · padrão'), o.src, o.r, o.x.q)).join('')}</tbody></table></div></div>
    <div class="panel"><h3>Conferência com o Volume 05 (Tabela 10)</h3><div class="tblw"><table class="tbl sm"><thead><tr><th>Caso</th><th class="r">Esperado</th><th class="r">Obtido</th><th>Resultado</th></tr></thead><tbody>${t.map((x) => `<tr><td>${esc(x.group + ' — ' + x.name)}</td><td class="r">${U.num(x.expected, 4)}</td><td class="r">${U.num(x.actual, 4)}</td><td>${x.pass ? '<b class="ok">confere</b>' : '<b class="bad">diverge</b>'}</td></tr>`).join('')}</tbody></table></div></div>`;
} };
UI.chg.fitCtx = (el) => { const c = F.ctx(A.pj), k = el.dataset.k; if (k === 'pareSiga') c.pareSiga = el.value === '1'; else { const v = U.parseNum(el.value); if (!Number.isFinite(v) || v < 0 || (['Vu', 'Vp'].includes(k) && v <= 0)) return UI.toast('Valor inválido', 'warn'); c[k] = v; } UI.commit(); };
UI.chg.fitSet = (el) => {
  const d = OP.transport.cfg(A.pj), mat = el.dataset.m, k = el.dataset.k, o = mat === '*' ? d.def : (d.byMat[mat] = d.byMat[mat] || Object.assign({}, d.def));
  if (el.type === 'checkbox') o[k] = el.checked; else if (k === 'vmdf' && el.value.trim() === '') o.vmdf = null; else { const v = U.parseNum(el.value || '0'); if (!Number.isFinite(v) || v < 0) return UI.toast('Valor inválido', 'warn'); o[k] = v; }
  UI.commit();
};
})(typeof window !== 'undefined' ? window : globalThis);

