/* ==== 11_ui_catalog.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 11_ui_catalog.js
 * Catálogo: macrocategorias -> cadernos técnicos -> famílias -> ÁRVORE
 * de fatores clicável (caminho escolhido em caixas pretas com setas, como
 * nos Cadernos Técnicos). Opções incompatíveis ficam esmaecidas e fatores
 * de opção única são preenchidos automaticamente.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app; const F = OP.factors; const esc = U.esc;
  const CAT = (OP.catalog = {});
  const costOf = (code) => A.base.compCost(code, A.pj.uf, A.pj.rg);
  function hl(d, terms) { // realce sem acento
    if (!terms || !terms.length) return esc(d);
    const up = U.deaccent(d).toUpperCase(); if (up.length !== d.length) return esc(d);
    const mk = new Uint8Array(d.length);
    for (const t of terms) { if (!t || t.length < 2) continue; let i = -1; while ((i = up.indexOf(t, i + 1)) >= 0) { if (i > 0 && /[A-Z0-9]/.test(up[i - 1])) continue; for (let k = i; k < i + t.length; k++) mk[k] = 1; } }
    let out = '', on = 0; for (let k = 0; k < d.length; k++) { if (mk[k] !== on) { out += mk[k] ? '<mark>' : '</mark>'; on = mk[k]; } out += esc(d[k]); }
    return out + (on ? '</mark>' : '');
  }
  CAT.row = (code, desc, unit, terms) => `<div class="res" data-act="openComp" data-code="${esc(code)}"><span class="code">${esc(code)}</span><span class="rd">${hl(desc, terms)}</span><span class="ru">${esc(unit)}</span><span class="rp">${UI.money(costOf(code))}</span><span class="ra"><button class="ib sm" data-act="treeOf" data-code="${esc(code)}" title="Abrir na árvore do caderno">${UI.icon('tree', 16)}</button><button class="ib sm" data-act="quickAdd" data-code="${esc(code)}" title="Adicionar ao orçamento">${UI.icon('plus', 16)}</button></span></div>`;
  const swapRow = (j) => { const C = A.base.raw.comp; const code = C.c[j]; return `<div class="res" data-act="openComp" data-code="${code}"><span class="code">${code}</span><span class="rd">${esc(C.d[j])}</span><span class="ru">${esc(A.base.unit(j))}</span><span class="rp">${UI.money(costOf(code))}</span><span class="ra"><button class="btn pri sm" data-act="swapApply" data-code="${code}">Usar</button></span></div>`; };
  const rowJ = (j, terms) => { const C = A.base.raw.comp; return CAT.row(C.c[j], C.d[j], A.base.unit(j), terms); };
  CAT.resultsHTML = function (q, o = {}) {
    if (!String(q || '').trim()) return '<div class="empty">Digite parte da descrição, um sinônimo ou o código. Exemplos: <b>reboco</b>, <b>ferragem 10 mm</b>, <b>vala escavadeira 1,5</b>, <b>90082</b>.</div>';
    const r = OP.search.query(A.base, q, o.limit || 60);
    if (!r.list.length && !r.custom.length) return `<div class="empty">Nada encontrado para “${esc(q)}”. Tente menos palavras ou um sinônimo.</div>`;
    const by = new Map(); r.list.forEach((x) => { const g = A.base.raw.comp.g[x.j]; if (!by.has(g)) by.set(g, []); by.get(g).push(x); });
    let h = `<div class="rsum">${U.int(r.total)} composições encontradas${r.total > r.list.length ? ` · exibindo as ${r.list.length} mais relevantes` : ''} · agrupadas por caderno técnico</div>`;
    if (r.custom.length) h += `<div class="rgrp"><div class="rg-h"><b>Composições próprias</b><small class="muted">${r.custom.length}</small></div><div class="rlist">${r.custom.map((c) => CAT.row(c.code, c.desc, c.unit, r.terms)).join('')}</div></div>`;
    for (const [gi, xs] of by) h += `<div class="rgrp"><div class="rg-h"><button class="lnk" data-act="pickGroup" data-gi="${gi}">${esc(A.base.raw.grupos[gi])}</button><small class="muted">${xs.length}</small></div><div class="rlist">${xs.map((x) => rowJ(x.j, r.terms)).join('')}</div></div>`;
    return h;
  };
  function leftHTML() {
    const q = U.norm(A.sel.gq || ''); const open = A.sel.open || (A.sel.open = {});
    return `<div class="catl"><div class="catl-h"><input class="inp" data-fk="gq" data-in="gq" placeholder="Filtrar cadernos técnicos…" value="${esc(A.sel.gq || '')}" aria-label="Filtrar cadernos"></div><div class="catl-b" data-keep="catl">${OP.macro.groups(A.base).map((m) => {
      const its = q ? m.items.filter((g) => U.norm(g.name).includes(q)) : m.items; if (!its.length) return '';
      const isOpen = !!q || open[m.key] || its.some((g) => g.gi === A.sel.gi);
      return `<details ${isOpen ? 'open' : ''}><summary data-act="mtoggle" data-k="${m.key}"><span>${esc(m.name)}</span><small>${its.length}</small></summary>${its.map((g) => `<button class="gi ${g.gi === A.sel.gi ? 'on' : ''}" data-act="pickGroup" data-gi="${g.gi}"><span>${esc(g.name)}</span><small>${g.count}</small></button>`).join('')}</details>`;
    }).join('')}</div></div>`;
  }
  const searchBar = () => `<div class="csearch">${UI.icon('search', 20)}<input data-fk="cq" data-in="cq" placeholder="Buscar em todo o SINAPI: descrição, sinônimo ou código (ex.: reboco, ferragem 10, vala 1,5 m, 90082)" value="${esc(A.sel.cq || '')}" autocomplete="off" spellcheck="false" aria-label="Buscar composição">${A.sel.cq ? `<button class="ib" data-act="cqClear" title="Limpar busca">${UI.icon('x')}</button>` : ''}</div>`;
  const QUICK = ['Escavação de Valas', 'Armação de Estacas', 'Fôrmas para Estruturas', 'Armação para Estruturas', 'Alvenaria de Vedação', 'Chapisco', 'Massa Única', 'Contrapiso', 'Revestimento Cerâmico', 'Pintura Interna', 'Instalações Prediais de Água Fria', 'Aterros, Bases'];
  function homeHTML() {
    const b = A.base, raw = b.raw, v = raw.valid || {};
    const quick = QUICK.map((q) => { const gi = raw.grupos.findIndex((g) => U.norm(g).startsWith(U.norm(q))); return gi < 0 ? '' : `<button data-act="pickGroup" data-gi="${gi}">${esc(raw.grupos[gi])}</button>`; }).join('');
    return `<div class="hero"><h1>Encontre a composição certa em poucos cliques</h1><p>Navegue pelos <b>cadernos técnicos</b> e escolha os fatores da <b>árvore de composições</b> — diâmetro, espessura, equipamento, solo… — ou use a busca com sinônimos. Cada composição mostra custo por UF, parcelas de MO/MAT/EQ, analítico e equipe/produtividade.</p>
      <div class="stats"><div><b>${U.int(b.nComp)}</b><span>composições</span></div><div><b>${U.int(b.nIns)}</b><span>insumos</span></div><div><b>${raw.grupos.length}</b><span>cadernos técnicos</span></div><div><b>${v.total ? U.pct(v.ok / v.total, 2) : '—'}</b><span>custos conferidos com o oficial</span></div></div>
      <h4 class="sub">Cadernos mais usados</h4><div class="quick">${quick}</div></div>`;
  }
  function groupHTML() {
    const g = F.forGroup(A.base, A.sel.gi);
    const fams = g.families.filter((f) => f.size > 1), singles = g.families.filter((f) => f.size === 1);
    return `<div class="gh"><div class="bc"><button class="lnk" data-act="catHome">Cadernos</button> › <span>${esc(g.name)}</span></div><h2>${esc(g.name)}</h2>
      <div class="gh-m"><span>${g.count} composições · ${fams.length} famílias com árvore${singles.length ? ` · ${singles.length} serviços avulsos` : ''}</span>${g.url ? `<a class="btn ghost sm" href="${esc(g.url)}" target="_blank" rel="noopener">${UI.icon('pdf', 16)} Caderno técnico (PDF)</a>` : ''}</div></div>
      ${fams.length ? `<div class="fams">${fams.map((f) => `<button class="fam" data-act="pickFam" data-f="${f.id}"><b>${esc(f.title)}</b><span class="fm">${f.size} composições · ${esc(f.units.join(', '))}</span><span class="fl">${f.factors.map((x) => `<i>${esc(x.label)} · ${x.values.length}</i>`).join('')}</span></button>`).join('')}</div>` : ''}
      ${singles.length ? `<h4 class="sub">Serviços avulsos</h4><div class="rlist">${singles.map((f) => rowJ(f.members[0].j)).join('')}</div>` : ''}`;
  }
  function famTable(fam, path) {
    const C = A.base.raw.comp;
    return `<p class="note">Todas as ${fam.size} variantes da família. Esmaecidas: incompatíveis com as escolhas atuais da árvore.</p><div class="tblw"><table class="tbl sm"><thead><tr><th>Código</th>${fam.factors.map((f) => `<th>${esc(f.label)}</th>`).join('')}<th>Und</th><th class="r">Custo ${A.pj.uf}</th><th></th></tr></thead><tbody>${fam.members.map((m) => {
      const code = C.c[m.j]; const okp = m.v.every((v, q) => path[q] == null || path[q] === v);
      return `<tr style="${okp ? '' : 'opacity:.42'}"><td><button class="lnk code" data-act="openComp" data-code="${code}">${code}</button></td>${fam.factors.map((f, q) => `<td>${esc(f.values[m.v[q]].label)}</td>`).join('')}<td>${esc(A.base.unit(m.j))}</td><td class="r">${UI.money(costOf(code))}</td><td><button class="ib sm" data-act="quickAdd" data-code="${code}" title="Adicionar ao orçamento">${UI.icon('plus', 15)}</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function familyHTML() {
    const T = A.trees.main; const g = F.forGroup(A.base, T.gi); const fam = g.families[T.fam]; const view = A.sel.catView || 'tree';
    return `<div class="gh"><div class="bc"><button class="lnk" data-act="catHome">Cadernos</button> › <button class="lnk" data-act="pickGroup" data-gi="${g.gi}">${esc(g.name)}</button> › <span>família</span></div>
      <div class="vh" style="margin:6px 0 0"><h2 style="margin:0">${esc(fam.title)}</h2><div class="vh-a"><div class="seg"><button class="${view === 'tree' ? 'on' : ''}" data-act="catView" data-v="tree">Árvore</button><button class="${view === 'list' ? 'on' : ''}" data-act="catView" data-v="list">Tabela</button></div>
      <button class="btn ghost sm" data-act="treeReset" data-ctx="main">Limpar escolhas</button>${g.url ? `<a class="btn ghost sm" href="${esc(g.url)}" target="_blank" rel="noopener">${UI.icon('pdf', 16)} Caderno</a>` : ''}</div></div></div>
      ${view === 'list' ? famTable(fam, T.path) : CAT.treeHTML('main')}`;
  }
  CAT.treeHTML = function (ctx) {
    const T = A.trees[ctx]; const g = F.forGroup(A.base, T.gi); const fam = g.families[T.fam]; const path = T.path;
    let h = `<div class="ftree" id="ftree-${ctx}"><div class="frow"><div class="flabel">Serviço</div><div><div class="fnode root">${esc(fam.title)}<small>${fam.size} composições · ${esc(g.name)}</small></div></div></div>`;
    fam.factors.forEach((f, fi) => {
      const av = F.available(fam, path, fi);
      if (av.size === 1 && path[fi] != null && f.values[path[fi]].empty) return; // nível sem escolha real
      h += `<div class="frow"><div class="flabel">${esc(f.label)}</div><div class="fopts">${f.values.map((v, vi) => `<button class="fopt${path[fi] === vi ? ' sel' : ''}${av.has(vi) ? '' : ' off'}${v.empty ? ' emp' : ''}" data-act="fpick" data-ctx="${ctx}" data-f="${fi}" data-v="${vi}" title="${v.count} composição(ões)${av.has(vi) ? '' : ' — incompatível com as escolhas atuais'}">${esc(v.label)}</button>`).join('')}</div></div>`;
    });
    const ms = F.matches(fam, path); const C = A.base.raw.comp;
    const res = !ms.length ? '<div class="fcount warn">Nenhuma composição com essa combinação.</div>' : ms.length === 1 ? CAT.card(C.c[ms[0].j], ctx)
      : `<div class="fcount">${ms.length} composições atendem às escolhas — continue escolhendo ou selecione:</div><div class="rlist">${ms.slice(0, 60).map((m) => (ctx === 'swap' ? swapRow(m.j) : rowJ(m.j))).join('')}</div>`;
    return h + `<div class="frow"><div class="flabel">Composição</div><div>${res}</div></div><svg class="farrows" aria-hidden="true"></svg></div>`;
  };
  CAT.bdBar = (bd) => {
    const tot = bd.mo + bd.mat + bd.eq + bd.serv + bd.out || 1;
    const parts = [['mo', 'MO', bd.mo], ['mat', 'MAT', bd.mat], ['eq', 'EQ', bd.eq], ['out', 'Outros', bd.serv + bd.out]].filter((x) => x[2] > 0);
    return `<div class="bdw"><div class="stk">${parts.map(([k, t, v]) => `<i class="${k}" style="width:${(v / tot * 100).toFixed(2)}%" title="${t} ${U.pct(v / tot)}"></i>`).join('')}</div><div class="stl">${parts.map(([k, t, v]) => `<span><i class="dot ${k}"></i>${t} ${U.pct(v / tot, 0)}</span>`).join('')}</div></div>`;
  };
  CAT.card = function (code, ctx) {
    const b = A.base, pj = A.pj; const c = b.comp(code); if (!c) return '';
    const cost = costOf(code); const bd = cost ? b.breakdown(code, pj.uf, pj.rg) : null;
    const res = OP.prod.resources(b, code); const bc = OP.prod.baseCrew(res.direct); const J = +pj.calendar.hpd || 8.8;
    const crew = res.direct.filter((r) => r.h > 0).map((r) => `${bc.counts[r.key] || 1} ${r.name}`).join(' + ');
    const as = cost ? b.compAS(code, pj.uf, pj.rg) : 0;
    return `<div class="rcard"><div class="rc-h"><span class="code big">${esc(code)}</span><span class="un">${esc(c.unit)}</span>${c.sit ? '<span class="tag warn">sem custo</span>' : ''}</div>
      <p class="rc-d">${esc(c.desc)}</p>
      <div class="rc-p"><div><small>Custo unitário · ${pj.uf} · ${OP.sinapi.REGIMES[pj.rg]}</small><b>${cost == null ? '—' : U.brl(cost / 100)}</b>${as > 0.0005 ? `<small class="as">${U.pct(as)} atribuído a SP (%AS)</small>` : ''}</div>${bd ? CAT.bdBar(bd) : ''}</div>
      <div class="rc-q">${UI.icon('crew', 16)}<span>${crew ? `Equipe base: <b>${esc(crew)}</b>${bc.T > 0 ? ` · produção ≈ <b>${U.num(J / bc.T, 2)} ${esc(c.unit)}/dia</b> (${U.num(1 / bc.T, 3)} ${esc(c.unit)}/h)` : ''}` : 'Sem mão de obra/equipamento direto (duração informada manualmente).'}</span></div>
      <div class="rc-a">${ctx === 'swap' ? `<button class="btn pri" data-act="swapApply" data-code="${esc(code)}">${UI.icon('swap')} Usar esta composição (mantém a quantidade)</button>`
        : `<label class="fld"><span>Quantidade (${esc(c.unit)})</span><input id="addq-${ctx}" data-enter="addFromCard" data-code="${esc(code)}" data-ctx="${ctx}" inputmode="decimal" placeholder="0,00" style="width:120px"></label>
        <label class="fld"><span>Etapa de destino</span><select id="adds-${ctx}">${UI.stageOptions(UI.model())}</select></label>
        <button class="btn pri" data-act="addFromCard" data-code="${esc(code)}" data-ctx="${ctx}">${UI.icon('plus')} Adicionar ao orçamento</button>`}
        <button class="btn ghost" data-act="openComp" data-code="${esc(code)}">${UI.icon('list')} Analítico e produtividade</button></div></div>`;
  };
  CAT.drawArrows = function (ctx) {
    const box = document.getElementById('ftree-' + ctx); if (!box) return;
    const svg = box.querySelector('svg.farrows'); const br = box.getBoundingClientRect();
    const rel = (el) => { const r = el.getBoundingClientRect(); return { cx: Math.round(r.left - br.left + r.width / 2), top: r.top - br.top, bot: r.bottom - br.top, l: r.left - br.left, r: r.right - br.left }; };
    const rows = UI.$$('.frow', box); let prev = rows[0] && rows[0].querySelector('.fnode'); const segs = [];
    for (let i = 1; i < rows.length && prev; i++) {
      const row = rows[i]; const tgt = row.querySelector('.fopt.sel, .rcard, .fcount'); const area = row.querySelector('.fopts') || row.lastElementChild;
      const a = rel(prev), pr = rel(rows[i - 1]), rr = rel(row); const ym = Math.round((pr.bot + rr.top) / 2);
      if (tgt) { const b = rel(tgt); segs.push(`M${a.cx},${a.bot + 1}V${ym}H${b.cx}V${b.top - 3}`); prev = tgt.classList.contains('fopt') ? tgt : null; }
      else { const ar = rel(area); const x = Math.min(Math.max(a.cx, ar.l + 14), ar.r - 14); segs.push(`M${a.cx},${a.bot + 1}V${ym}H${x}V${ar.top - 3}`); prev = null; }
    }
    svg.setAttribute('width', box.clientWidth); svg.setAttribute('height', box.scrollHeight);
    svg.innerHTML = `<defs><marker id="ah-${ctx}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="currentColor"/></marker></defs>` +
      segs.map((d) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" marker-end="url(#ah-${ctx})"/>`).join('');
  };
  CAT.redraw = () => { CAT.drawArrows('main'); CAT.drawArrows('swap'); };
  CAT.refresh = (ctx) => { if (ctx === 'main') UI.render(); else { const box = UI.$('#swapBox'); if (box) { box.innerHTML = CAT.treeHTML('swap'); CAT.drawArrows('swap'); } } };
  UI.views.catalog = { cls: 'fill', render: () => {
    let center;
    if (A.sel.cq && A.sel.cq.trim()) center = `<div class="gh"><h2>Resultados para “${esc(A.sel.cq)}”</h2></div>` + CAT.resultsHTML(A.sel.cq, { limit: 150 });
    else if (A.sel.gi == null) center = homeHTML();
    else if (A.sel.fam == null || !A.trees.main || A.trees.main.gi !== A.sel.gi) center = groupHTML();
    else center = familyHTML();
    return `<div class="cat">${leftHTML()}<section class="catc" data-keep="catc">${searchBar()}${center}</section></div>`;
  }, after: () => CAT.drawArrows('main') };
  UI.inp.gq = (el) => UI.later('gq', () => { A.sel.gq = el.value; UI.render(); }, 150);
  UI.inp.cq = (el) => UI.later('cq', () => { A.sel.cq = el.value; UI.render(); }, 180);
  UI.act.cqClear = () => { A.sel.cq = ''; UI.render(); };
  UI.act.mtoggle = (el) => { const d = el.parentElement; d.open = !d.open; (A.sel.open || (A.sel.open = {}))[el.dataset.k] = d.open; };
  UI.act.pickGroup = (el) => { A.sel.gi = +el.dataset.gi; A.sel.fam = null; A.sel.cq = ''; A.view = 'catalog'; if (UI.$('#overlay.on')) UI.closeModal(); UI.render(); const c = UI.$('.catc'); if (c) c.scrollTop = 0; };
  UI.act.catHome = () => { A.sel.gi = null; A.sel.fam = null; UI.render(); };
  UI.act.pickFam = (el) => {
    const fam = F.forGroup(A.base, A.sel.gi).families[+el.dataset.f];
    A.trees.main = { gi: A.sel.gi, fam: fam.id, path: F.autoFill(fam, fam.factors.map(() => null)) }; A.sel.fam = fam.id; A.sel.catView = 'tree';
    UI.render(); const c = UI.$('.catc'); if (c) c.scrollTop = 0;
  };
  UI.act.catView = (el) => { A.sel.catView = el.dataset.v; UI.render(); };
  UI.act.treeReset = (el) => { const T = A.trees[el.dataset.ctx]; const fam = F.forGroup(A.base, T.gi).families[T.fam]; T.path = F.autoFill(fam, fam.factors.map(() => null)); CAT.refresh(el.dataset.ctx); };
  UI.act.fpick = (el) => {
    const ctx = el.dataset.ctx, fi = +el.dataset.f, vi = +el.dataset.v; const T = A.trees[ctx]; if (!T) return;
    const fam = F.forGroup(A.base, T.gi).families[T.fam]; const p = T.path.slice();
    if (p[fi] === vi) p[fi] = null;
    else { p[fi] = vi; for (let q = fam.factors.length - 1; q >= 0 && !F.matches(fam, p).length; q--) if (q !== fi) p[q] = null; }
    T.path = F.autoFill(fam, p); CAT.refresh(ctx);
  };
  UI.act.treeOf = (el) => {
    const loc = F.locate(A.base, UI.code(el.dataset.code));
    if (!loc) { UI.toast('Composição fora das árvores (própria ou sem família).', 'warn'); return; }
    A.trees.main = { gi: loc.group.gi, fam: loc.family.id, path: loc.path }; A.sel.gi = loc.group.gi; A.sel.fam = loc.family.id; A.sel.cq = ''; A.sel.catView = 'tree'; A.view = 'catalog';
    if (UI.$('#overlay.on')) UI.closeModal(); if (A.drawer) OP.drawer.close(); UI.render();
  };
  UI.act.addFromCard = (el) => {
    const ctx = el.dataset.ctx; const code = UI.code(el.dataset.code);
    const q = U.parseNum(UI.$('#addq-' + ctx).value || '0'); const sid = UI.$('#adds-' + ctx).value;
    const r = UI.addToStage(code, isFinite(q) && q > 0 ? q : 0, sid);
    UI.commit(); UI.toast(`Adicionado em “${U.cap(r.stage.name)}”${q > 0 ? '' : ' — informe a quantidade no Orçamento'}.`);
  };
})(typeof window !== 'undefined' ? window : globalThis);

