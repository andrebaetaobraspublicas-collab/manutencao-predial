/* ==== 48_pem.js — Demonstrativo de Produções Horárias (Produção de Equipe Mecânica — SICRO) ==== */
/* Demonstrativos (PEM) de 29 grupos extraídos dos cadernos do DNIT: variáveis
 * intervenientes, fórmulas, número de unidades e utilizações. Editar uma variável recalcula a produção
 * horária de cada equipamento, a produção da equipe e as utilizações operativa e improdutiva, que
 * passam a valer na composição (custo, coeficientes, equipes e cronograma). */
(function (G) {
'use strict';
const OP = G.OP, U = OP.util, UI = OP.ui, A = OP.app, esc = U.esc;
const PM = (OP.pem = { version: '1.0' });
const PD = G.OP_DATA.pem;
const GRP = {"03": "Aparelhos de apoio", "04": "Armação", "06": "Bueiros metálicos", "08": "Bueiros tubulares", "09": "Instalações industriais", "11": "Concreto", "12": "Concreto projetado", "14": "Corte", "15": "Contenções", "16": "Demolição", "17": "Derrocagem", "18": "Levantamentos hidrográficos", "19": "Dragagem", "20": "Drenagem", "21": "Escoramento", "23": "Estacas", "24": "Estrutura metálica", "26": "Ferrovia — AMV", "28": "Ferrovia — demolição", "29": "Correção geométrica", "30": "Grade ferroviária", "31": "Fôrmas", "36": "Molhes", "37": "Obras complementares", "38": "Reforço, alargamento e manutenção de OAE", "40": "Pavimentação", "42": "Ponte estaiada", "44": "Proteção ambiental", "45": "Protensão", "48": "Serviços auxiliares", "49": "Manutenção", "53": "Sinalização náutica", "54": "Solo reforçado com fita", "55": "Terraplenagem", "56": "Tirantes", "59": "Transportes", "61": "Tubulões", "62": "Túneis", "64": "Usinagem", "68": "Bueiros pré-moldados", "71": "IP4 — instalações portuárias"};
const BY = new Map(PD.pem.map((p) => [p.c, p]));
PM.data = PD; PM.byCode = BY; PM.GRP = GRP;
const rnd = (x, n) => { const f = 10 ** n; return Math.round(parseFloat((Math.abs(x) * f).toPrecision(15))) / f * (x < 0 ? -1 : 1); };
/* fórmula do DNIT ("." = multiplicação; letras = variáveis da coluna) */
PM.evalF = (fx, vars) => { const e = String(fx).replace(/\./g, '*'); if (!/^[0-9a-z*/()+\-]+$/.test(e)) return null; try { return Function('v', '"use strict";return ' + e.replace(/[a-z]/g, (m) => '(v.' + m + '||0)'))(vars); } catch (x) { return null; } };
/* cálculo do demonstrativo com as edições (chaves "coluna|letra", "coluna|n" e "coluna|P") */
PM.compute = (p, ed) => {
  const noEd = !ed; ed = ed || {};
  const L = PM.letters(p);
  const cols = p.e.map(([ec, n, uo, ui, fx, pv, pdec], k) => {
    const vars = {}; for (const [l, , , vals] of p.v) { const key = k + '|' + l; vars[l] = ed[key] != null ? +ed[key] : vals[k] != null ? vals[k] : 0; }
    /* variáveis derivadas (tempos de ida/volta e de ciclo), quando o demonstrativo publicado confirma a relação */
    const dv = PM.derived(p, k); const set = (l, v) => { if (l && ed[k + '|' + l] == null && Number.isFinite(v)) vars[l] = rnd(v, 2); };
    if (dv.ida) set(L.ida, vars[L.dist] / vars[L.vi]); if (dv.volta) set(L.volta, vars[L.dist] / vars[L.vr]); if (dv.ciclo) set(L.ciclo, L.tempos.reduce((a, l) => a + (vars[l] || 0), 0));
    const nn = ed[k + '|n'] != null ? +ed[k + '|n'] : n; let P = null, src = '';
    if (fx) { const c = PM.evalF(fx, vars); P = c == null ? pv : rnd(c, pdec || 2); src = 'fórmula'; }
    else if (pv != null) { P = ed[k + '|P'] != null ? +ed[k + '|P'] : pv; src = 'informada'; }
    return { k, ec, n: nn, n0: n, uo0: uo, ui0: ui, fx, P, P0: pv, src, vars };
  });
  const prod = cols.filter((c) => c.P != null && c.P > 0 && c.n > 0);
  const lead = prod.find((c) => c.ec === p.L);
  /* produção da equipe: a do líder; equipamentos que passem a produzir menos que o líder (por ajuste) limitam a equipe.
     Os que já ficavam abaixo do líder no demonstrativo publicado não são considerados (regra do DNIT). */
  const rule = (cs) => { const pr = cs.filter((c) => c.P != null && c.P > 0 && c.n > 0), ld = pr.find((c) => c.ec === p.L); if (!ld) return pr.length ? Math.min(...pr.map((c) => c.n * c.P)) : p.P;
    const base = (ld.n0 || 1) * (ld.P0 || 0), oth = pr.filter((c) => c !== ld && !((c.n0 || 0) * (c.P0 || 0) < base - 1e-9)); return Math.min(ld.n * ld.P, ...oth.map((c) => c.n * c.P)); };
  let Pt = rule(cols), calib = false;
  /* quando a regra geral não reproduz a produção publicada, o ajuste é proporcional (calibrado) */
  if (Object.keys(ed).length) { const b0 = PM._base || (PM._base = new Map()); let base0 = b0.get(p.c); if (base0 == null) { base0 = rule(PM.compute(p, null).cols); b0.set(p.c, base0); } if (base0 > 0 && rnd(base0, p.pd || 2) !== p.P) { Pt = p.P * Pt / base0; calib = true; } }
  Pt = rnd(Pt, p.pd || 2);
  /* produção vinculada ao desempenho da mão de obra (número de unidades fracionário, n × P = produção da equipe):
     a produção da equipe permanece; o número de unidades dos equipamentos é recalculado (n = produção da equipe ÷ P) */
  const main = cols.find((c) => c.fx && c.n0 > 0 && c.n0 < 1 && c.P0 > 0 && Math.abs(c.n0 * c.P0 - p.P) <= Math.max(1e-4, p.P * 0.002));
  const laborBound = !!main && (/desempenho da m[aã]o de obra/i.test((PD.obs || [])[p.oi] || '') || !p.L);
  if (laborBound) { Pt = p.P; calib = false; const nm = main.P > 0 ? rnd(Pt / main.P, 5) : main.n0; for (const c of cols) if (Math.abs(c.n0 - main.n0) < 1e-9 && ed[c.k + '|n'] == null) c.n = nm; }
  for (const c of cols) { if (c.P != null && c.P > 0 && c.n > 0) { c.uo = Math.min(1, rnd(Pt / (c.n * c.P), 2)); c.ui = rnd(1 - c.uo, 2); } else { c.uo = c.uo0; c.ui = c.ui0; } }
  return { cols, P: Pt, P0: p.P, calib, laborBound };
};
/* letras por nome de variável e verificação das relações derivadas no demonstrativo publicado */
PM.letters = (p) => { if (p._L) return p._L; const nm = (l) => U.norm(PD.names[(p.v.find((x) => x[0] === l) || [])[1]] || ''), L = { tempos: [] };
  for (const [l] of p.v) { const n0 = nm(l); if (n0 === 'DISTANCIA') L.dist = l; else if (n0 === 'VELOCIDADE DE IDA') L.vi = l; else if (n0 === 'VELOCIDADE DE RETORNO') L.vr = l; else if (n0 === 'TEMPO DE IDA') L.ida = l; else if (n0 === 'TEMPO DE VOLTA' || n0 === 'TEMPO DE RETORNO') L.volta = l; else if (n0 === 'TEMPO TOTAL DE CICLO') L.ciclo = l; if (/^TEMPO /.test(n0) && n0 !== 'TEMPO TOTAL DE CICLO') L.tempos.push(l); }
  return (p._L = L); };
PM.derived = (p, k) => { p._D = p._D || {}; if (p._D[k]) return p._D[k]; const L = PM.letters(p), v = (l) => { const r = p.v.find((x) => x[0] === l); return r ? r[3][k] : null; }, ok = (a, b) => a != null && b != null && Math.abs(a - b) <= 0.011;
  const d = { ida: !!(L.ida && v(L.dist) && v(L.vi) && ok(v(L.ida), v(L.dist) / v(L.vi))), volta: !!(L.volta && v(L.dist) && v(L.vr) && ok(v(L.volta), v(L.dist) / v(L.vr))), ciclo: !!(L.ciclo && L.tempos.length && ok(v(L.ciclo), L.tempos.reduce((a, l) => a + (v(l) || 0), 0))) };
  return (p._D[k] = d); };
PM.edits = (pj) => { pj.pem = pj.pem || {}; pj.pem.ed = pj.pem.ed || {}; return pj.pem.ed; };
/* substituições para o motor: só demonstrativos editados */
PM.overrides = (pj, base) => {
  const all = (pj.pem && pj.pem.ed) || {}, map = new Map(); let sig = [];
  for (const [code, ed] of Object.entries(all)) {
    if (!ed || !Object.keys(ed).length) continue; const p = BY.get(code), j = base.compIdx.get(code); if (!p || j == null) continue;
    const r = PM.compute(p, ed), used = new Set();
    const Aj = base.raw.comp.A[j].map(([i, q, uo, ui]) => { const ec = base.raw.ins.c[i], c = r.cols.find((x) => x.ec === ec && !used.has(x.k)); if (!c) return [i, q, uo, ui]; used.add(c.k); return [i, c.n != null ? c.n : q, c.uo, c.ui]; });
    map.set(j, { P: r.P, A: Aj }); sig.push(code + ':' + JSON.stringify(ed));
  }
  return map.size ? { sig: sig.join(';'), map } : null;
};
PM.selfTests = () => {
  let cols = 0, okc = 0, pems = 0, okp = 0, inBase = 0, okBase = 0; const b = A.base;
  for (const p of PD.pem) {
    const r = PM.compute(p, {}); pems++; if (r.P === p.P) okp++;
    for (const c of r.cols) if (c.fx) { cols++; if (c.P === c.P0) okc++; }
    const j = b && b.compIdx.get(p.c); if (j != null) { inBase++; if (Math.abs(b.raw.comp.P[j] - p.P) < 1e-9) okBase++; }
  }
  return [{ name: 'Fórmulas que reproduzem a produção horária publicada do equipamento', expected: cols, actual: okc, pass: okc === cols },
    { name: 'Produção da equipe pela regra geral (líder ou menor produção) igual à publicada — nos demais, ajuste proporcional', expected: pems, actual: okp, pass: okp / pems > 0.9 },
    { name: 'Produção da equipe do demonstrativo igual à da composição na base ativa', expected: inBase, actual: okBase, pass: okBase / Math.max(1, inBase) > 0.98 }];
};
/* ---------------- tela ---------------- */
const n2 = (v, d = 2) => (v == null ? '—' : U.num(v, d));
PM.baseOf = (c) => { if (!c) return null; const cp = A.base && A.base.custom.get(c.code); const code = (c.sicro && c.sicro.base) || (cp && cp.sicro && cp.sicro.base) || c.code; return BY.has(code) ? code : null; };
/* Regra: o catálogo SICRO não é alterado. Editar um demonstrativo cria (ou atualiza) a composição própria CP-<código>,
   calculada pela regra do SICRO com a nova produção e as novas utilizações, e a substitui no orçamento. */
PM.applyCustom = (pj, code) => {
  const b = A.base, ed = (pj.pem && pj.pem.ed && pj.pem.ed[code]) || {}, cpCode = 'CP-' + code, live = A.pj === pj && Array.isArray(A.customs);
  const list = live ? A.customs : (pj.catalog = pj.catalog || { v: 1, inputs: [], compositions: [] }).compositions;
  const items = []; const walk = (n) => { for (const c of n.children || []) { if (c.kind === 'stage') walk(c); else items.push(c); } }; walk(pj.root);
  const k = list.findIndex((x) => x.code === cpCode);
  if (!Object.keys(ed).length) { if (k >= 0) list.splice(k, 1); for (const it of items) if (String(it.code) === cpCode) it.code = code; if (live) OP.register.rebuild(); return null; }
  const p = BY.get(code), j = b.compIdx.get(code); if (!p || j == null) return null;
  const r = PM.compute(p, ed), used = new Set();
  const Aj = b.raw.comp.A[j].map(([i, q, uo, ui]) => { const ec = b.raw.ins.c[i], c = r.cols.find((x) => x.ec === ec && !used.has(x.k)); if (!c) return [i, q, uo, ui]; used.add(c.k); return [i, c.n != null ? c.n : q, c.uo, c.ui]; });
  const sic = { base: code, P: r.P, A: Aj, ed: Object.assign({}, ed) };
  const cp = { id: cpCode, code: cpCode, desc: b.raw.comp.d[j] + ' — produção ajustada no demonstrativo (' + U.num(r.P, p.pd || 2) + ' ' + b.unit(j) + '/h)', unit: b.unit(j), group: 'Composições próprias', mode: 'sicro', sicro: sic,
    items: b.flatItems(j, sic).map(([c, coef, t]) => ({ type: t, code: c, coef })), src: 'PRÓPRIA', source: 'Derivada da composição SICRO ' + code + ' — demonstrativo de produção horária editado', notes: '', revision: 1, history: [], resourceKind: 'service', quote: null, quoteUF: '*', quoteRef: '', taxProfile: '' };
  if (k >= 0) { cp.revision = (list[k].revision || 1) + 1; Object.assign(list[k], cp); } else list.push(cp);
  let n = 0; for (const it of items) if (String(it.code) === code || String(it.code) === cpCode) { it.code = cpCode; n++; }
  if (live) OP.register.rebuild(); return { cp, n };
};
PM.sheet = (code) => {
  const pj = A.pj, m = UI.model(), b = m.base, ED = PM.edits(pj), sel = BY.get(code); if (!sel) return '<div class="empty">Esta composição não tem demonstrativo de produção horária nos cadernos incorporados.</div>';
  const inBudget = new Set(m.items.map((r) => String(r.node.code))), own = b.custom.get('CP-' + sel.c) || null, nOwn = m.items.filter((r) => String(r.node.code) === 'CP-' + sel.c).length;

    const ed = ED[sel.c] || {}, r = PM.compute(sel, ed), cols = r.cols, j = b.compIdx.get(sel.c), edited = Object.keys(ed).length > 0;
    const cost = j != null ? b.compCost(sel.c, m.uf, m.rg) : null, off = j != null ? b.officialCost(sel.c) : null;
    const inp = (k, key, v, v0, d = 2) => `<input class="qty sm" style="width:84px${(ed[k + '|' + key] != null) ? ';background:rgba(255,194,26,.18)' : ''}" data-ch="pemSet" data-c="${esc(sel.c)}" data-k="${k}|${key}" inputmode="decimal" value="${v == null ? '' : U.num(v, d, 0)}" title="Publicado: ${v0 == null ? '—' : U.num(v0, d, 0)}">`;
    return `<div class="panel"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 style="margin:0">${esc(sel.c)} · ${esc((b.comp(sel.c) || {}).desc || sel.d || '')}</h3><small class="muted">${esc(GRP[sel.g] || sel.g)} · unidade ${esc(sel.u)}${inBudget.has(sel.c) ? ' · <b>no orçamento</b>' : ''}</small></div>
      <div class="row">${j != null ? `<button class="btn sm" data-act="openComp" data-code="${esc(sel.c)}">Abrir composição</button>` : ''}${edited ? `<button class="btn sm" data-act="pemReset" data-c="${esc(sel.c)}">Restaurar original</button>` : ''}</div></div>
      <div class="cards"><div class="card hl"><small>Produção da equipe</small><b>${n2(r.P, sel.pd || 2)} ${esc(sel.u)}/h</b><span class="muted">publicada ${n2(sel.P, sel.pd || 2)}${edited ? ' · <b>ajustada</b>' + (r.calib ? ' (proporcional ao demonstrativo publicado)' : '') : ''}${r.laborBound ? ' · vinculada à mão de obra: ajustes alteram o número de unidades dos equipamentos' : ''}</span></div>
        <div class="card"><small>${own ? 'Composição própria ' + esc(own.code) : 'Custo unitário (SICRO)'}</small><b>${own ? U.brl((b.compCost(own.code, m.uf, m.rg) || 0) / 100) : cost == null ? '—' : U.brl(cost / 100)}</b>${own ? `<span class="muted">aplicada a ${nOwn} item(ns) do orçamento · SICRO ${esc(sel.c)} preservada no catálogo: ${cost == null ? '—' : U.brl(cost / 100)}</span>` : ''}<span class="muted">${off == null ? '' : 'publicado ' + U.brl(off / 100) + ' (sem transporte)' + (cost != null && cost !== off ? ' · diferença ' + U.brl((cost - off) / 100) + ' (DMT, FIC e ajustes do projeto)' : '')}</span></div>
        <div class="card"><small>Equipamento líder</small><b>${esc(sel.L || '—')}</b><span class="muted">produção da equipe = ${sel.L ? 'produção do líder × unidades' : 'menor produção × unidades'}</span></div></div>
      <div class="tblw"><table class="tbl sm"><thead><tr><th></th><th>Variáveis intervenientes</th><th>Unid.</th>${cols.map((c) => `<th class="r">${esc(c.ec)}<br><small class="muted">${esc(((b.ins(c.ec) || {}).desc || '').slice(0, 28))}</small></th>`).join('')}</tr></thead><tbody>
      ${sel.v.map(([l, ni, u, vals]) => { const Lx = PM.letters(sel); return `<tr><td>${l}</td><td>${esc(PD.names[ni] || '')}</td><td>${esc(u || '')}</td>${cols.map((c, k) => { const D = PM.derived(sel, k), auto = (l === Lx.ida && D.ida) || (l === Lx.volta && D.volta) || (l === Lx.ciclo && D.ciclo); return `<td class="r">${vals[k] == null && ed[k + '|' + l] == null ? '' : auto && ed[k + '|' + l] == null ? `<span title="Calculado a partir das demais variáveis">${U.num(c.vars[l], 2)} <small class="muted">auto</small></span>` : inp(k, l, ed[k + '|' + l] != null ? ed[k + '|' + l] : vals[k], vals[k], 5)}</td>`; }).join('')}</tr>`; }).join('')}
      <tr class="stage"><td colspan="3">Fórmula</td>${cols.map((c) => `<td class="r"><code>${c.fx ? 'P = ' + esc(c.fx) : c.P0 != null ? 'informada' : ''}</code></td>`).join('')}</tr>
      <tr><td colspan="3"><b>Produção horária</b></td>${cols.map((c, k) => `<td class="r">${c.fx ? `<b>${n2(c.P, 5)}</b>${c.P !== c.P0 ? `<br><small class="muted">publ. ${n2(c.P0, 5)}</small>` : ''}` : c.P0 != null ? inp(k, 'P', c.P, c.P0, 5) : ''}</td>`).join('')}</tr>
      <tr><td colspan="3">Número de unidades</td>${cols.map((c, k) => `<td class="r">${inp(k, 'n', c.n, c.n0)}</td>`).join('')}</tr>
      <tr><td colspan="3">Utilização operativa</td>${cols.map((c) => `<td class="r"><b>${n2(c.uo)}</b>${c.uo !== c.uo0 ? `<br><small class="muted">publ. ${n2(c.uo0)}</small>` : ''}</td>`).join('')}</tr>
      <tr><td colspan="3">Utilização improdutiva</td>${cols.map((c) => `<td class="r"><b>${n2(c.ui)}</b>${c.ui !== c.ui0 ? `<br><small class="muted">publ. ${n2(c.ui0)}</small>` : ''}</td>`).join('')}</tr></tbody></table></div>
      ${PD.obs && PD.obs[sel.oi] ? `<p class="note">${esc(PD.obs[sel.oi])}</p>` : ''}<p class="note">Campos destacados foram alterados; valores “auto” (tempos de ida, volta e ciclo) são recalculados a partir da distância, das velocidades e dos demais tempos quando o demonstrativo publicado confirma essas relações. A produção da equipe é a do equipamento líder (ou a menor entre os equipamentos com produção); utilização operativa = produção da equipe ÷ (unidades × produção do equipamento), em 2 casas; improdutiva = 1 − operativa. Ao alterar, a composição do SICRO permanece inalterada no catálogo; é criada a composição própria CP-código, calculada pela regra do SICRO com a nova produção e as novas utilizações, que substitui a original nos itens do orçamento (custo, FIC, coeficientes, equipes e cronograma). Restaurar o demonstrativo remove a composição própria e devolve a original ao orçamento.</p></div>`;
};
UI.views.pem = { render: () => {
  const pj = A.pj, m = UI.model(), b = m.base, st = (pj.pem = pj.pem || {}), ED = PM.edits(pj), q = U.norm(st.q || ''), g = st.g || '';
  const inBudget = new Set(m.items.map((r) => String(r.node.code)));
  const sk = (p) => p._s || (p._s = U.norm(p.c + ' ' + ((b.comp(p.c) || {}).desc || p.d || ''))); const list = PD.pem.filter((p) => (!g || p.g === g) && (!q || sk(p).includes(q))).sort((x, y) => (inBudget.has(y.c) - inBudget.has(x.c)) || x.c.localeCompare(y.c));
  const sel = BY.get(st.sel) || list[0]; if (sel && !st.sel) st.sel = sel.c;
  const nEd = Object.values(ED).filter((x) => x && Object.keys(x).length).length;
  const sheet = sel ? PM.sheet(sel.c) : '<div class="empty">Selecione um demonstrativo.</div>';
  const t = PM._t || (PM._t = PM.selfTests());
  return `<div class="vh"><div><h1>Demonstrativo de Produções Horárias</h1><p class="muted">Produção de equipe mecânica (PEM) do SICRO · ${U.int(PD.pem.length)} demonstrativos de ${new Set(PD.pem.map((p) => p.g)).size} grupos · ${nEd} ajustado(s) neste projeto · conferência ${t.filter((x) => x.pass).length}/${t.length}</p></div>${nEd ? '<div class="row"><button class="btn" data-act="pemResetAll">Restaurar todos</button></div>' : ''}</div>
    <div class="row" style="gap:10px;align-items:flex-end;margin-bottom:10px"><label class="fld"><span>Grupo</span><select data-ch="pemG"><option value="">Todos</option>${Object.entries(GRP).map(([k, v]) => `<option value="${k}"${k === g ? ' selected' : ''}>${k} · ${v}</option>`).join('')}</select></label>
      <label class="fld" style="flex:1"><span>Buscar (código ou descrição)</span><input data-ch="pemQ" value="${esc(st.q || '')}" placeholder="ex.: 4011209, compactação, usinagem"></label>
      <label class="fld" style="flex:2"><span>Demonstrativo (${U.int(list.length)}; os do orçamento primeiro)</span><select data-ch="pemSel">${list.slice(0, 400).map((p) => `<option value="${p.c}"${sel && p.c === sel.c ? ' selected' : ''}>${inBudget.has(p.c) ? '● ' : ''}${ED[p.c] && Object.keys(ED[p.c]).length ? '✎ ' : ''}${p.c} · ${esc(((b.comp(p.c) || {}).desc || p.d || '').slice(0, 90))}</option>`).join('')}</select></label></div>
    ${sheet}
    <div class="panel"><h3>Conferência da extração</h3><div class="tblw"><table class="tbl sm"><thead><tr><th>Verificação</th><th class="r">Total</th><th class="r">Conferem</th><th>Resultado</th></tr></thead><tbody>${t.map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${U.int(x.expected)}</td><td class="r">${U.int(x.actual)}</td><td>${x.pass ? '<b class="ok">aprovado</b>' : '<b class="bad">revisar</b>'}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">Colunas sem fórmula identificada mantêm a produção informada no demonstrativo (editável). Fonte: cadernos de Produção de Equipe Mecânica do DNIT (grupos enviados nesta etapa).</p></div>`;
} };
UI.chg.pemG = (el) => { A.pj.pem = A.pj.pem || {}; A.pj.pem.g = el.value; A.pj.pem.sel = null; UI.render(); };
UI.chg.pemQ = (el) => { A.pj.pem = A.pj.pem || {}; A.pj.pem.q = el.value; A.pj.pem.sel = null; UI.render(); };
UI.chg.pemSel = (el) => { A.pj.pem.sel = el.value; UI.render(); };
UI.chg.pemSet = (el) => { const ED = PM.edits(A.pj), c = el.dataset.c, k = el.dataset.k, v = U.parseNum(el.value); if (!Number.isFinite(v) || v < 0) return UI.toast('Valor inválido', 'warn'); const p = BY.get(c), [col, key] = k.split('|'); let orig = key === 'n' ? p.e[col][1] : key === 'P' ? p.e[col][5] : (p.v.find((x) => x[0] === key) || [, , , []])[3][col]; const e = (ED[c] = ED[c] || {}); if (orig != null && Math.abs(v - orig) < 1e-12) delete e[k]; else e[k] = v; if (!Object.keys(e).length) delete ED[c]; const res = PM.applyCustom(A.pj, c); UI.commit(); if (res) UI.toast('Composição própria ' + res.cp.code + ' atualizada e aplicada a ' + res.n + ' item(ns) do orçamento; a ' + c + ' do SICRO permanece inalterada.'); };
UI.act.pemReset = (el) => { delete PM.edits(A.pj)[el.dataset.c]; PM.applyCustom(A.pj, el.dataset.c); UI.commit(); UI.toast('Demonstrativo restaurado: o orçamento volta a usar a composição ' + el.dataset.c + ' do SICRO.'); };
UI.act.pemResetAll = () => { if (confirm('Restaurar todos os demonstrativos aos valores publicados? As composições próprias derivadas serão removidas e o orçamento voltará a usar as composições do SICRO.')) { const codes = Object.keys(A.pj.pem.ed || {}); A.pj.pem.ed = {}; for (const c of codes) PM.applyCustom(A.pj, c); UI.commit(); } };
if (OP.drawer && OP.drawer.tabs) OP.drawer.tabs.pem = (c) => PM.sheet(PM.baseOf(c));
})(typeof window !== 'undefined' ? window : globalThis);

