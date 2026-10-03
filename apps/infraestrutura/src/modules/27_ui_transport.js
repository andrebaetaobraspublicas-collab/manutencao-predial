/* ==== 27_ui_transport.js — Transportes (DMT): momento de transporte do SICRO ==== */
(function (G) {
  'use strict';
  const OP = G.OP, U = OP.util, UI = OP.ui, A = OP.app, S = OP.sicro, esc = U.esc;
  const T = (OP.transport = {});
  const cfg = (pj) => { if (!pj.dmt) pj.dmt = { def: { LN: 0, RP: 0, P: 0, FE: 0 }, byMat: {} }; pj.dmt.def = Object.assign({ LN: 0, RP: 0, P: 0, FE: 0 }, pj.dmt.def || {}); pj.dmt.byMat = pj.dmt.byMat || {}; return pj.dmt; };
  T.cfg = cfg;
  /* itens transportados no orçamento: tonelagem total por item (material ou produto) */
  T.usage = (m) => {
    const b = m.base, out = new Map();
    for (const r of m.items) {
      if (!r.comp || !(r.qty > 0)) continue;
      const u = b.usage(r.node.code);
      for (const [mat, o] of u.tr) {
        const x = out.get(mat) || { mat, q: 0, ks: {}, items: new Set() };
        x.q += o.q * r.qty; for (const k of S.DMT) if (o.ks[k] != null && x.ks[k] == null) x.ks[k] = o.ks[k]; x.items.add(r.num); out.set(mat, x);
      }
    }
    return [...out.values()].sort((a, z) => z.q - a.q);
  };
  /* custo de transporte do orçamento = Σ quantidade × (custo com DMT − custo sem DMT) */
  T.budgetCost = (m) => {
    const b = m.base; let tot = 0;
    for (const r of m.items) {
      if (!r.comp || !(r.qty > 0) || r.fixo || b.custom.has(r.node.code)) continue;
      const j = b.compIdx.get(r.node.code); if (j == null) continue;
      const w = b.costTable(m.uf, m.rg).cost[j], o = b.costTable(m.uf, m.rg, true).cost[j];
      if (w != null && o != null) tot += (w - o) * r.qty;
    }
    return tot;
  };
  const kmIn = (mat, k, v, ph, avail) => `<input class="qty sm dmt" data-ch="dmtSet" data-m="${esc(mat)}" data-k="${k}" inputmode="decimal" value="${v ? U.num(v, 2) : ''}" placeholder="${ph}" ${avail ? '' : 'disabled title="Sem composição de transporte para este tipo de via"'} aria-label="DMT ${S.DMT_NAME[k]} (km)">`;
  UI.views.transport = { render: () => {
    const m = UI.model(), b = m.base, d = cfg(A.pj), list = T.usage(m), tmat = b.raw.tmat || {};
    const cost = T.budgetCost(m), tkm = U.sum(list, (x) => { const dm = b.dmtFor(x.mat); return dm ? x.q * S.DMT.reduce((s, k) => s + (dm[k] || 0), 0) : 0; });
    const own = list.filter((x) => d.byMat[x.mat]).length;
    const rows = list.map((x) => {
      const v = tmat[x.mat] || [], spec = d.byMat[x.mat], dm = b.dmtFor(x.mat) || {};
      const est = S.DMT.reduce((s, k) => { const j = x.ks[k]; if (j == null || j < 0 || !(dm[k] > 0)) return s; const c = b.costTable(m.uf, m.rg).cost[j]; return s + (c || 0) / 100 * dm[k] * x.q; }, 0);
      const ins = b.ins(x.mat), cp = ins ? null : b.comp(x.mat);
      return `<tr><td><button class="lnk code" data-act="${ins ? 'regInspectInput' : 'openComp'}" data-code="${esc(x.mat)}">${esc(x.mat)}</button></td>
        <td>${esc(v[0] || ins?.desc || cp?.desc || '')}<br><small class="muted">${esc(v[1] || '')} · itens ${[...x.items].slice(0, 6).join(', ')}${x.items.size > 6 ? '…' : ''}</small></td>
        <td class="r">${U.num(x.q, 1)}</td>${S.DMT.map((k) => `<td class="r">${kmIn(x.mat, k, spec ? spec[k] : 0, spec ? '0' : (d.def[k] ? U.num(d.def[k], 2) : '0'), x.ks[k] != null && x.ks[k] >= 0)}</td>`).join('')}
        <td class="r">${OP.fit ? `<button class="lnk sm" data-act="nav" data-v="fit">${U.num(OP.fit.calc(A.pj, spec || d.def).FIT, 4)}</button>` : '—'}</td><td class="r">${U.num(x.q * S.DMT.reduce((s, k) => s + (dm[k] || 0), 0), 0)}</td><td class="r">${est ? U.num(est, 2) : '—'}</td>
        <td>${spec ? `<button class="lnk sm" data-act="dmtClear" data-m="${esc(x.mat)}" title="Voltar a usar a DMT padrão">padrão</button>` : '<span class="muted sm">padrão</span>'}</td></tr>`;
    }).join('');
    return `<div class="vh"><div><h1>Transportes (DMT)</h1><p class="muted">Momento de transporte do SICRO (seção F das composições): quantidade transportada × DMT por tipo de via × custo da composição de transporte. Sem DMT, o custo das composições coincide com o relatório publicado. A DMT pavimentada entra no custo como DMT fictícia (FIT × DMTp), calculada no menu FIT.</p></div>
      <div class="row"><button class="btn" data-act="dmtZero">Zerar todas as DMT</button></div></div>
      <div class="cards"><div class="card hl"><small>Transporte no custo direto</small><b>${U.brl(cost / 100)}</b><span class="muted">${m.tot.direct ? U.pct(cost / m.tot.direct, 2) + ' do custo direto' : ''}</span></div>
      <div class="card"><small>Itens transportados</small><b>${U.int(list.length)}</b><span class="muted">${own} com DMT específica</span></div>
      <div class="card"><small>Momento de transporte</small><b>${U.num(tkm, 0)} tkm</b><span class="muted">materiais e produtos das composições</span></div>
      <div class="card"><small>Fora desta tela</small><b>${U.int(m.items.filter((r) => r.comp && /^59/.test(String(r.node.code))).length)}</b><span class="muted">itens de transporte lançados no orçamento (bota-fora, betuminosos…)</span></div></div>
      <div class="panel"><h3>DMT padrão</h3><p class="note">Aplica-se a todo item transportado sem DMT específica. Distâncias em km por tipo de via: ${S.DMT.map((k) => `<b>${k}</b> = ${S.DMT_NAME[k].toLowerCase()}`).join(', ')}.</p>
        <div class="pform">${S.DMT.map((k) => `<label class="fld"><span>${S.DMT_NAME[k]} (km)</span><input class="qty" data-ch="dmtDef" data-k="${k}" inputmode="decimal" value="${d.def[k] ? U.num(d.def[k], 2) : ''}" placeholder="0"></label>`).join('')}</div></div>
      <div class="panel"><h3>DMT por item transportado</h3>${list.length ? `<div class="tblw"><table class="tbl sm"><thead><tr><th>Código</th><th>Item transportado / veículo</th><th class="r">Quantidade (t)</th>${S.DMT.map((k) => `<th class="r" title="${S.DMT_NAME[k]}">${k} (km)</th>`).join('')}<th class="r" title="Fator de Interferência de Tráfego (menu FIT)">FIT</th><th class="r">Momento (tkm)</th><th class="r">Custo ≈ R$</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="note">Quantidade = Σ quantidade do item × consumo por unidade (inclusive atividades auxiliares). O custo por item é estimado pela composição de transporte de cada via; o total do cartão é exato (diferença entre os custos com e sem DMT).</p>` : '<div class="empty">Nenhuma composição do orçamento tem momento de transporte.</div>'}</div>`;
  } };
  const km = (v) => { const x = U.parseNum(String(v || '0')); return Number.isFinite(x) && x >= 0 ? Math.round(x * 1000) / 1000 : null; };
  UI.chg.dmtSet = (el) => { const d = cfg(A.pj), v = km(el.value); if (v == null) return UI.toast('DMT inválida', 'warn'); const cur = d.byMat[el.dataset.m] || Object.assign({}, d.def); cur[el.dataset.k] = v; d.byMat[el.dataset.m] = cur; UI.commit(); };
  UI.chg.dmtDef = (el) => { const d = cfg(A.pj), v = km(el.value); if (v == null) return UI.toast('DMT inválida', 'warn'); d.def[el.dataset.k] = v; UI.commit(); };
  UI.act.dmtClear = (el) => { delete cfg(A.pj).byMat[el.dataset.m]; UI.commit(); };
  UI.act.dmtZero = () => { if (!confirm('Zerar todas as DMT deste orçamento? Os custos voltam ao relatório publicado (sem transporte).')) return; A.pj.dmt = { def: { LN: 0, RP: 0, P: 0, FE: 0 }, byMat: {} }; UI.commit(); };
})(typeof window !== 'undefined' ? window : globalThis);

