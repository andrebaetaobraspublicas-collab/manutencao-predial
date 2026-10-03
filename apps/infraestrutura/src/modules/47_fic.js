/* ==== 47_fic.js — FIC: Fator de Influência de Chuvas (SICRO, Manual de Custos — Volume 04, 2ª ed., 2025) ==== */
/* FIC = fa × {1 + [(1 − C) × fr]} × nd (Eq. 8), aplicado ao custo unitário improdutivo (Eq. 9 e 10).
 * nd padrão/geotécnico por UF (Tomo 1), coeficiente de deflúvio C (Tabelas 3 e 4), fator de retenção fr
 * (Tabelas 5 e 6) e etapas de execução (Tomo 2). A etapa e o tipo de nd de cada composição são
 * identificados a partir do FIC publicado na base de referência (inversão da Eq. 8). */
(function (G) {
  'use strict';
  const OP = G.OP, U = OP.util, UI = OP.ui, A = OP.app, S = OP.sicro, esc = U.esc;
  const F = (OP.fic = { version: '1.0' });
  /* Tomo 1 — nd padrão e geotécnico por UF (média ponderada das mesobacias) */
  const ND = { AC: [0.04587, 0.14856], AP: [0.06102, 0.21885], AM: [0.05588, 0.18815], PA: [0.04695, 0.15974], RO: [0.04893, 0.14712], RR: [0.04168, 0.15507], TO: [0.03857, 0.12289],
    AL: [0.01439, 0.06735], BA: [0.01531, 0.05751], CE: [0.01622, 0.06007], MA: [0.03133, 0.10719], PB: [0.01365, 0.05057], PE: [0.01224, 0.04856], PI: [0.02031, 0.07160], RN: [0.01410, 0.05277], SE: [0.01547, 0.06999],
    DF: [0.02844, 0.11011], GO: [0.03229, 0.11377], MT: [0.04299, 0.13678], MS: [0.03632, 0.11084], ES: [0.02404, 0.08549], MG: [0.02535, 0.09071], RJ: [0.03159, 0.11228], SP: [0.03143, 0.11205],
    PR: [0.04209, 0.13310], RS: [0.04203, 0.12348], SC: [0.04074, 0.14180] };
  /* Tabelas 4 e 6 — solo predominante por UF (argilo-arenoso nas UF abaixo; argiloso nas demais) */
  const AA = ['AL', 'BA', 'MA', 'MS', 'PR', 'RN', 'SP'];
  const SOILS = { ar: 'Solo arenoso', aa: 'Solo argilo-arenoso', ag: 'Solo argiloso' };
  /* Tabela 3 — coeficiente de deflúvio C (declividade < 5% | 5% a 10%) e Tabela 5 — fator de retenção */
  const CT = { 1: { ar: [0.10, 0.25], aa: [0.30, 0.35], ag: [0.40, 0.50] }, 2: { ar: [0.37, 0.43], aa: [0.67, 0.73], ag: [0.74, 0.80] } };
  const FR = { ar: 0.50, aa: 0.75, ag: 1.00 };
  const ETAPAS = { 1: 'Etapa 1 — da implantação ao final do desmatamento', 2: 'Etapa 2 — após o desmatamento até a regularização do subleito', 3: 'Etapa 3 — da regularização do subleito à impermeabilização da base/sub-base', 4: 'Etapa 4 — após a impermeabilização da base/sub-base, incluindo manutenção e conservação', 5: 'Etapa 5 — serviços manuais e outros' };
  F.ND = ND; F.ETAPAS = ETAPAS; F.SOILS = SOILS;
  /* arredondamento decimal "meio para cima" imune a ruído binário (1,30 × 0,11205 = 0,145665 → 0,14567) */
  const rnd = (x, n) => { const f = 10 ** n; return Math.round(parseFloat((Math.abs(x) * f).toPrecision(15))) / f * (x < 0 ? -1 : 1); };
  F.rnd = rnd;
  /* parâmetros referenciais (Tabelas 4 e 6): etapas 1–2 com declividade de 5% a 10%; etapas 3–4 abaixo de 5% */
  F.reference = (uf, soil, slope) => {
    soil = soil || (AA.includes(uf) ? 'aa' : 'ag'); const k = slope === 'lt5' ? 0 : 1;
    const C = { 1: CT[1][soil][k], 2: CT[2][soil][k], 3: 0.70, 4: 0.95, 5: 1.00 }, fr = { 1: FR[soil], 2: FR[soil], 3: 1, 4: 1, 5: 1 };
    return { uf, soil, slope: slope || '5-10', nd: ND[uf] || [0, 0], C, fr };
  };
  F.cfg = (pj) => { const b = A.base; pj.fic = Object.assign({ mode: 'published', uf: b ? b.ufs[0] : 'SP', soil: '', slope: '5-10', ndP: null, ndG: null, C: {}, fr: {} }, pj.fic || {}); return pj.fic; };
  /* parâmetros efetivos do projeto */
  F.params = (pj) => {
    const c = F.cfg(pj), ref = F.reference(c.uf, c.soil || null, c.slope), C = {}, fr = {}, fac = {};
    for (let e = 1; e <= 5; e++) { C[e] = c.C[e] != null ? +c.C[e] : ref.C[e]; fr[e] = c.fr[e] != null ? +c.fr[e] : ref.fr[e]; fac[e] = 1 + (1 - C[e]) * fr[e]; }
    const nd = [c.ndP != null ? +c.ndP : ref.nd[0], c.ndG != null ? +c.ndG : ref.nd[1]];
    return { ref, C, fr, fac, nd, fic: (e, t) => rnd(fac[e] * nd[t === 'g' ? 1 : 0], 5) };
  };
  /* classificação (etapa, nd padrão/geotécnico) pela inversão da Eq. 8 com os parâmetros da UF da base */
  F.classify = (base) => {
    if (base._ficCls) return base._ficCls;
    const ref = F.reference(base.ufs[0]), cand = [];
    for (const t of ['p', 'g']) for (let e = 1; e <= 5; e++) cand.push({ t, e, v: rnd((1 + (1 - ref.C[e]) * ref.fr[e]) * ref.nd[t === 'g' ? 1 : 0], 5) });
    const out = base.raw.comp.F.map((f) => { if (!f) return null; const c = cand.find((x) => Math.abs(x.v - f) < 5e-7); return c ? { t: c.t, e: c.e } : { t: '?', e: 0 }; });
    Object.defineProperty(base, '_ficCls', { value: out, configurable: true, writable: true }); return out;
  };
  /* vetor de FIC do projeto para o motor de custos (null = FIC publicado) */
  F.overrides = (pj, base) => {
    const c = F.cfg(pj); if (c.mode !== 'project') return null;
    const P = F.params(pj), cls = F.classify(base), Fp = base.raw.comp.F;
    const arr = cls.map((x, j) => (!x ? 0 : x.e ? P.fic(x.e, x.t) : Fp[j]));
    return { sig: JSON.stringify([c.uf, c.soil, c.slope, P.nd, P.C, P.fr]), arr };
  };
  F.selfTests = () => {
    const b = A.base, out = [], add = (name, expected, actual, pass) => out.push({ group: 'Volume 04', name, expected, actual, pass });
    const cls = F.classify(b), withF = cls.filter(Boolean), ok = withF.filter((x) => x.e).length;
    add('FIC publicados identificados pela Eq. 8 (etapa e tipo de nd)', withF.length, ok, ok === withF.length);
    add('nd padrão de SP (Tomo 1, Tabela 4)', 0.03143, ND.SP[0], ND.SP[0] === 0.03143); add('nd geotécnico de SP (Tomo 1, Tabela 9)', 0.11205, ND.SP[1], ND.SP[1] === 0.11205);
    const r = F.reference('SP'); add('Etapa 4, SP: 1,05 × 0,03143', 0.033, rnd((1 + (1 - r.C[4]) * r.fr[4]) * 0.03143, 5), rnd(1.05 * 0.03143, 5) === 0.033);
    add('Etapa 3, SP, nd geotécnico: 1,30 × 0,11205 (arredondamento)', 0.14567, rnd(1.3 * 0.11205, 5), rnd(1.3 * 0.11205, 5) === 0.14567);
    add('Etapa 2, SP: 1 + (1 − 0,73) × 0,75', 1.2025, 1 + (1 - r.C[2]) * r.fr[2], Math.abs(1 + (1 - r.C[2]) * r.fr[2] - 1.2025) < 1e-12);
    const ufb = b.ufs[0], pjx = { fic: { mode: 'project', uf: ufb, soil: '', slope: '5-10', ndP: null, ndG: null, C: {}, fr: {} } }, o = F.overrides(pjx, b);
    const same = o.arr.filter((v, j) => Math.abs(v - (b.raw.comp.F[j] || 0)) < 5e-7).length; add('Recálculo com os referenciais da UF reproduz o FIC publicado', b.nComp, same, same === b.nComp);
    return out;
  };
  /* ---------------- tela ---------------- */
  const n = (v, d = 5) => U.num(v, d);
  UI.views.fic = { render: () => {
    const pj = A.pj, m = UI.model(), b = m.base, c = F.cfg(pj), P = F.params(pj), cls = F.classify(b), ufs = Object.keys(ND).sort();
    const nCls = cls.filter((x) => x && x.e).length, nZero = cls.filter((x) => !x).length;
    const inp = (k, e, v, ph, d = 2) => `<input class="qty sm" style="width:72px" data-ch="ficSet" data-k="${k}" data-e="${e}" inputmode="decimal" value="${v == null ? '' : U.num(+v, d)}" placeholder="${U.num(+ph, d)}">`;
    const rows = []; let tot = 0;
    for (const r of m.items) {
      const code = String(r.node.code); if (!/^\d{7}$/.test(code) || !(r.qty > 0)) continue; const j = b.compIdx.get(code); if (j == null) continue;
      const x = cls[j], pub = b.raw.comp.F[j] || 0, eff = x ? (c.mode === 'project' && x.e ? P.fic(x.e, x.t) : pub) : 0, an = b.analytic(code, m.uf, m.rg), cf = an ? Number(an.ficV) / 1e4 : 0; tot += cf * r.qty;
      rows.push(`<tr><td>${esc(r.num)}</td><td><button class="lnk code" data-act="openComp" data-code="${esc(code)}">${esc(code)}</button></td><td>${esc(r.desc.slice(0, 64))}</td><td>${x ? (x.e ? 'Etapa ' + x.e : '—') : '<span class="muted">fa = 0</span>'}</td><td>${x ? (x.t === 'g' ? 'geotécnico' : x.t === 'p' ? 'padrão' : '?') : ''}</td><td class="r">${x ? n(pub) : '—'}</td><td class="r"><b>${x ? n(eff) : '—'}</b></td><td class="r">${cf ? U.num(cf, 4) : '—'}</td><td class="r">${cf ? U.brl(cf * r.qty) : '—'}</td></tr>`);
    }
    const t = F._t || (F._t = F.selfTests()), ok = t.filter((x) => x.pass).length;
    return `<div class="vh"><div><h1>FIC — Fator de Influência de Chuvas</h1><p class="muted">Manual de Custos de Infraestrutura de Transportes — Volume 04 (SICRO/DNIT): FIC = fa × {1 + [(1 − C) × fr]} × nd (Eq. 8), aplicado ao custo unitário improdutivo Ci = (custo horário da mão de obra + Σ quantidade × CHI) ÷ produção (Eq. 9); custo do FIC = FIC × Ci (Eq. 10).</p></div></div>
      <div class="cards"><div class="card hl"><small>FIC no orçamento</small><b>${c.mode === 'project' ? 'Recalculado para o projeto' : 'Publicado na base SICRO'}</b><span class="muted">${esc(S.UF_NAMES[c.uf] || c.uf)} · ${esc(SOILS[P.ref.soil])}</span></div>
        <div class="card"><small>nd padrão · geotécnico</small><b>${n(P.nd[0])} · ${n(P.nd[1])}</b><span class="muted">Tomo 1 (média ponderada das mesobacias da UF)</span></div>
        <div class="card"><small>Custo do FIC nos serviços</small><b>${U.brl(tot)}</b><span class="muted">${m.tot.direct ? U.pct(tot / (m.tot.direct / 100), 2) + ' do custo direto' : ''} · parcela dos itens do orçamento</span></div>
        <div class="card"><small>Composições com FIC</small><b>${U.int(nCls)} de ${U.int(b.nComp)}</b><span class="muted">${U.int(nZero)} com fa = 0 · conferência ${ok}/${t.length}</span></div></div>
      <div class="panel"><h3>Parâmetros</h3><div class="pform">
        <label class="fld"><span>FIC aplicado ao orçamento</span><select data-ch="ficCfg" data-k="mode"><option value="published"${c.mode !== 'project' ? ' selected' : ''}>Publicado na base SICRO (${esc(b.ufs[0])})</option><option value="project"${c.mode === 'project' ? ' selected' : ''}>Recalculado com os parâmetros abaixo</option></select></label>
        <label class="fld"><span>UF do empreendimento</span><select data-ch="ficCfg" data-k="uf">${ufs.map((u) => `<option value="${u}"${u === c.uf ? ' selected' : ''}>${esc(S.UF_NAMES[u] || u)}</option>`).join('')}</select></label>
        <label class="fld"><span>Solo predominante (etapas 1 e 2)</span><select data-ch="ficCfg" data-k="soil"><option value="">Referencial da UF (${esc(SOILS[AA.includes(c.uf) ? 'aa' : 'ag'])})</option>${Object.entries(SOILS).map(([k, v]) => `<option value="${k}"${k === c.soil ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="fld"><span>Declividade (etapas 1 e 2)</span><select data-ch="ficCfg" data-k="slope"><option value="5-10"${c.slope !== 'lt5' ? ' selected' : ''}>5% a 10% (referencial)</option><option value="lt5"${c.slope === 'lt5' ? ' selected' : ''}>Menor que 5%</option></select></label>
        <label class="fld"><span>nd padrão</span>${inp('ndP', 0, c.ndP, P.ref.nd[0], 5)}<small class="muted">vazio = UF; use a mesobacia do Tomo 1 quando o projeto justificar</small></label>
        <label class="fld"><span>nd geotécnico</span>${inp('ndG', 0, c.ndG, P.ref.nd[1], 5)}<small class="muted">compactação e movimentação de solos</small></label></div>
        <div class="tblw"><table class="tbl sm"><thead><tr><th>Etapa de execução (Tomo 2)</th><th class="r">C (deflúvio)</th><th class="r">fr (retenção)</th><th class="r">1 + (1 − C) × fr</th><th class="r">FIC · nd padrão</th><th class="r">FIC · nd geotécnico</th></tr></thead><tbody>${[1, 2, 3, 4, 5].map((e) => `<tr><td>${esc(ETAPAS[e])}</td><td class="r">${inp('C', e, c.C[e], P.ref.C[e])}</td><td class="r">${inp('fr', e, c.fr[e], P.ref.fr[e])}</td><td class="r">${U.num(P.fac[e], 4)}</td><td class="r"><b>${n(P.fic(e, 'p'))}</b></td><td class="r"><b>${n(P.fic(e, 'g'))}</b></td></tr>`).join('')}</tbody></table></div>
        <p class="note">Valores vazios usam os referenciais das Tabelas 3 a 6 (passíveis de adaptação às condições do projeto). A etapa e o tipo de nd de cada composição são identificados pelo FIC publicado na base de referência; serviços com fa = 0 (sem paralisação por chuva) não recebem FIC.${c.mode !== 'project' ? ' <b>Para aplicar estes parâmetros ao orçamento, selecione “Recalculado”.</b>' : ''}</p></div>
      <div class="panel"><h3>Serviços do orçamento</h3><div class="tblw"><table class="tbl sm"><thead><tr><th>Item</th><th>Código</th><th>Serviço</th><th>Etapa</th><th>nd</th><th class="r">FIC publicado</th><th class="r">FIC aplicado</th><th class="r">Custo FIC (R$/un)</th><th class="r">Custo FIC no item</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>
      <div class="panel"><h3>Conferência</h3><div class="tblw"><table class="tbl sm"><thead><tr><th>Verificação</th><th class="r">Esperado</th><th class="r">Obtido</th><th>Resultado</th></tr></thead><tbody>${t.map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${typeof x.expected === 'number' ? U.num(x.expected, x.expected % 1 ? 5 : 0) : esc(x.expected)}</td><td class="r">${typeof x.actual === 'number' ? U.num(x.actual, x.actual % 1 ? 5 : 0) : esc(x.actual)}</td><td>${x.pass ? '<b class="ok">confere</b>' : '<b class="bad">diverge</b>'}</td></tr>`).join('')}</tbody></table></div></div>`;
  } };
  UI.chg.ficCfg = (el) => { const c = F.cfg(A.pj); c[el.dataset.k] = el.value; if (el.dataset.k === 'uf') { c.ndP = c.ndG = null; c.soil = ''; } UI.commit(); };
  UI.chg.ficSet = (el) => {
    const c = F.cfg(A.pj), k = el.dataset.k, e = el.dataset.e, raw = el.value.trim();
    const v = raw === '' ? null : U.parseNum(raw); if (v != null && (!Number.isFinite(v) || v < 0 || (k !== 'ndP' && k !== 'ndG' && v > 1) || ((k === 'ndP' || k === 'ndG') && v >= 1))) return UI.toast('Valor inválido', 'warn');
    if (k === 'ndP' || k === 'ndG') c[k] = v; else { if (v == null) delete c[k][e]; else c[k][e] = v; }
    UI.commit();
  };
})(typeof window !== 'undefined' ? window : globalThis);

