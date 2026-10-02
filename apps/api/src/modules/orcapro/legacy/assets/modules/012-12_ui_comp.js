/* ==== 12_ui_comp.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 12_ui_comp.js
 * Gaveta da composição: resumo (custo, MO/MAT/EQ, %AS, caderno),
 * analítico expansível, produtividade, preços nas 27 UFs e editor de
 * composições próprias (CP-xxx) salvas no navegador.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app; const esc = U.esc;
  const D = (OP.drawer = {}); D.tabs = {};
  D.open = (code, tab) => { A.drawer = { code: UI.code(code), tab: tab || 'res', exp: new Set(), cq: '' }; D.render(); };
  D.close = () => { A.drawer = null; const el = UI.$('#drawer'); el.hidden = true; el.innerHTML = ''; };
  D.render = () => {
    const st = A.drawer; const el = UI.$('#drawer'); if (!st) return;
    const c = A.base.comp(st.code); if (!c) { D.close(); return; }
    const own = c.src !== 'SINAPI'; el.hidden = false;
    const tabs = [['res', 'Resumo'], ['an', 'Analítico'], ['basic', 'Analítico - somente insumos básicos'], ['prod', 'Produtividade'], ['iva', 'Crédito de IVA'], ['taxmem', 'Memória tributária'], ['taxlaw', 'Legislação aplicável'], ['ivayears', 'Ano a ano'], ['uf', 'Preços por UF'], ['ed', own ? 'Editar' : 'Criar própria']];
    el.innerHTML = `<div class="dr-h"><div><span class="code big">${esc(st.code)}</span><span class="tag">${own ? 'própria' : 'SINAPI'}</span><span class="un">${esc(c.unit)}</span></div><div><button class="ib" data-act="quickAdd" data-code="${esc(st.code)}" title="Adicionar ao orçamento">${UI.icon('plus')}</button><button class="ib" data-act="drClose" title="Fechar (Esc)">${UI.icon('x')}</button></div></div>
      <p class="dr-d">${esc(c.desc)}</p><div class="tabs">${tabs.map(([k, t]) => `<button class="tab ${st.tab === k ? 'on' : ''}" data-act="drTab" data-t="${k}">${t}</button>`).join('')}</div>
      <div class="dr-b" data-keep="drb">${D.tabs[st.tab](c)}</div>`;
  };
  D.tabs.res = (c) => {
    const b = A.base, pj = A.pj; const cost = b.compCost(c.code, pj.uf, pj.rg);
    const bd = cost ? b.breakdown(c.code, pj.uf, pj.rg) : null; const tot = bd ? bd.mo + bd.mat + bd.eq + bd.serv + bd.out : 0;
    const url = c.j != null ? b.caderno(c.j) : ''; const af = OP.sinapi.afOf(c.desc);
    return `<div class="kv"><div><small>Custo unitário · ${pj.uf} · ${OP.sinapi.REGIMES[pj.rg]}</small><b class="big">${cost == null ? 'sem custo' : U.brl(cost / 100)}</b></div><div><small>Preço com BDI (${U.pct(pj.bdi, 2)})</small><b>${cost == null ? '—' : U.brl(Math.round(cost * (1 + pj.bdi)) / 100)}</b></div></div>
      ${bd ? `<table class="tbl sm"><thead><tr><th>Parcela</th><th class="r">R$ / ${esc(c.unit)}</th><th class="r">%</th></tr></thead><tbody>${[['mo', 'Mão de obra'], ['mat', 'Material'], ['eq', 'Equipamento'], ['serv', 'Serviços'], ['out', 'Outros']].filter(([k]) => bd[k]).map(([k, t]) => `<tr><td><i class="dot ${k}"></i>${t}</td><td class="r">${U.num(bd[k] / 100, 2)}</td><td class="r">${U.pct(bd[k] / tot)}</td></tr>`).join('')}</tbody></table>` : ''}
      <dl class="meta"><dt>Grupo / caderno</dt><dd>${esc(c.group || '—')}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">abrir PDF ${UI.icon('ext', 13)}</a>` : ''}</dd>
      <dt>Situação</dt><dd>${c.sit ? 'Sem custo publicado' : 'Com custo'}</dd>${af ? `<dt>Aferição</dt><dd>${esc(af.tag)}</dd>` : ''}
      <dt>Atribuído a SP (%AS)</dt><dd>${cost ? U.pct(b.compAS(c.code, pj.uf, pj.rg)) : '—'}</dd>${c.base ? `<dt>Origem</dt><dd>adaptada da ${esc(c.base)}</dd>` : ''}</dl>
      <div class="dr-a"><button class="btn pri" data-act="quickAdd" data-code="${esc(c.code)}">${UI.icon('plus')} Adicionar ao orçamento</button>${c.j != null ? `<button class="btn ghost" data-act="treeOf" data-code="${esc(c.code)}">${UI.icon('tree')} Ver na árvore</button>` : ''}</div>`;
  };
  D.tabs.an = (c) => {
    const st = A.drawer, pj = A.pj; const rows = [];
    const active = new Set([String(c.code)]), stack = [{ code: c.code, depth: 0, path: 'r', list: A.base.itemsOf(c.code, pj.uf, pj.rg), pos: 0 }];
    while (stack.length) {
      const f = stack[stack.length - 1];
      if (f.pos >= f.list.length) { active.delete(String(f.code)); stack.pop(); continue; }
      const i = f.pos++, r = { ...f.list[i] }, p = f.path + '.' + i;
      r.cycle = r.type === 'C' && active.has(String(r.code));
      const sc = r.type === 'C' ? A.base.comp(r.code) : null;
      const hasChildren = sc && (A.base.custom.has(r.code) ? (sc.items || []).length : (A.base.raw.comp.it[sc.j] || []).length);
      r.expandable = !!(r.type === 'C' && hasChildren && !r.cycle);
      if (r.cycle) r.desc += ' [ciclo: expansão interrompida]';
      else if (r.type === 'C' && !hasChildren) r.desc += ' [sem analítico disponível]';
      rows.push({ r, depth: f.depth, p });
      if (r.expandable && st.exp.has(p)) { active.add(String(r.code)); stack.push({ code: r.code, depth: f.depth + 1, path: p, list: A.base.itemsOf(r.code, pj.uf, pj.rg), pos: 0 }); }
    }
    const total = A.base.compCost(c.code, pj.uf, pj.rg);
    return `<p class="note">Custo = Σ trunc₂(coeficiente × preço), item a item (regra do relatório oficial). Clique em ▸ para abrir subcomposições; valores internos referem-se a 1 unidade da subcomposição.</p>
      <div class="tblw"><table class="tbl an"><thead><tr><th>Código</th><th>Descrição</th><th>Und</th><th class="r">Coef.</th><th class="r">Preço</th><th class="r">Total</th></tr></thead><tbody>${rows.map(({ r, depth, p }) => `<tr class="${r.type === 'C' ? 'sub' : ''}">
        <td style="padding-left:${6 + depth * 14}px;white-space:nowrap">${r.expandable ? `<button class="tg" data-act="anToggle" data-p="${p}" aria-label="expandir">${st.exp.has(p) ? '▾' : '▸'}</button>` : '<span class="tg0"></span>'}<button class="lnk code" data-act="${r.type === 'I' ? 'ivaIns' : 'ivaComp'}" data-code="${esc(r.code)}" title="Consultar crédito de IVA por unidade">${esc(r.code)}</button></td>
        <td>${esc(r.desc)}${r.sp ? ' <span class="tag sm" title="Preço atribuído de São Paulo">AS</span>' : ''}</td><td>${esc(r.unit)}</td><td class="r mono">${U.num(r.coef, 7, 2)}</td>
        <td class="r">${r.price == null ? '—' : U.num(r.price / 100, 2)}</td><td class="r ${depth ? 'muted' : ''}">${r.total == null ? '—' : U.num(r.total / 100, 2)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5">Custo unitário</td><td class="r">${total == null ? '—' : U.num(total / 100, 2)}</td></tr></tfoot></table></div>`;
  };
  D.tabs.prod = (c) => {
    const res = OP.prod.resources(A.base, c.code); const bc = OP.prod.baseCrew(res.direct); const J = +A.pj.calendar.hpd || 8.8; const u = esc(c.unit);
    if (!res.direct.length && !res.support.length) return '<div class="empty">Esta composição não tem mão de obra nem equipamentos: a duração deve ser informada manualmente no orçamento.</div>';
    return `<p class="note">Coeficientes em horas por ${u}. Para equipamentos, h = CHP + CHI (horas de equipe). A equipe base é o menor conjunto equilibrado com eficiência ≥ 80%.</p>
      <div class="tblw"><table class="tbl sm"><thead><tr><th>Recurso</th><th class="r">h/${u}</th><th class="r">CHP</th><th class="r">CHI</th><th class="r">Equipe base</th><th class="r">Ocupação</th></tr></thead><tbody>${res.direct.filter((r) => r.h > 0).map((r) => { const n = bc.counts[r.key] || 1; const occ = bc.T ? r.h / n / bc.T : 0; return `<tr><td><i class="dot ${r.kind}"></i>${esc(r.name)}${r.operator ? `<br><small class="muted">operador: ${esc(r.operator)}</small>` : ''}</td><td class="r mono">${U.num(r.h, 7, 4)}</td><td class="r mono">${r.kind === 'eq' ? U.num(r.chp, 7, 4) : ''}</td><td class="r mono">${r.kind === 'eq' ? U.num(r.chi, 7, 4) : ''}</td><td class="r">${n}</td><td class="r">${U.pct(occ, 0)}</td></tr>`; }).join('')}</tbody></table></div>
      ${bc.T ? `<div class="kv" style="margin-top:12px"><div><small>h de equipe por ${u} (T)</small><b>${U.num(bc.T, 6, 4)}</b></div><div><small>Produção da equipe base</small><b>${U.num(1 / bc.T, 3)} ${u}/h · ${U.num(J / bc.T, 2)} ${u}/dia</b></div><div><small>Eficiência</small><b>${U.pct(bc.eff, 0)}</b></div></div>` : ''}
      ${res.direct.some((r) => r.kind === 'eq') ? `<div class="formula">Equipamento: utilização u = CHP / (CHP + CHI) · produção por hora produtiva = 1 / CHP · horas improdutivas = tempo de espera pela equipe</div>` : ''}
      ${res.support.length ? `<h4 class="sub">Equipes de apoio (subcomposições auxiliares)</h4><div class="tblw"><table class="tbl sm"><thead><tr><th>Recurso</th><th class="r">h/${u}</th></tr></thead><tbody>${res.support.filter((r) => r.h > 0).map((r) => `<tr><td><i class="dot ${r.kind}"></i>${esc(r.name)}</td><td class="r mono">${U.num(r.h, 7, 4)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  };
  D.tabs.uf = (c) => {
    const b = A.base; const arr = b.ufs.map((uf, i) => ({ uf, city: b.raw.cidades[i] || '', v: b.compCost(c.code, uf, A.pj.rg) }));
    const vals = arr.map((x) => x.v).filter((v) => v != null).sort((a, z) => a - z); if (!vals.length) return '<div class="empty">Sem custo publicado.</div>';
    const max = vals[vals.length - 1], min = vals[0], med = vals[Math.floor(vals.length / 2)];
    return `<div class="kv"><div><small>Mínimo</small><b>${U.brl(min / 100)}</b></div><div><small>Mediana</small><b>${U.brl(med / 100)}</b></div><div><small>Máximo</small><b>${U.brl(max / 100)}</b></div><div><small>Amplitude</small><b>${U.pct(max / min - 1, 0)}</b></div></div>
      <p class="note">${OP.sinapi.REGIMES[A.pj.rg]} · clique numa UF para usá-la no orçamento.</p>
      <div class="ufb">${arr.map((x) => `<div class="ufr ${x.uf === A.pj.uf ? 'on' : ''}" data-act="setUF" data-uf="${x.uf}" title="${esc(x.city)}"><span>${x.uf}</span><i style="width:${x.v == null ? 0 : (x.v / max * 100).toFixed(1)}%"></i><b>${x.v == null ? '—' : U.num(x.v / 100, 2)}</b></div>`).join('')}</div>`;
  };
  function cpResults(q) {
    const b = A.base, pj = A.pj; const I = b.raw.ins; const ui = b.ufIndex(pj.uf);
    const ins = OP.search.insumos(b, q, 8).map((i) => { const [p] = b.insPrice(i, ui, pj.rg); return `<div class="res" data-act="cpAdd" data-t="I" data-code="${I.c[i]}"><span class="code">${I.c[i]}</span><span class="rd">${esc(I.d[i])}</span><span class="ru">${esc(b.insUnit(i))}</span><span class="rp">${p == null ? '—' : U.num(p / 100, 2)}</span><span class="ra">${UI.icon('plus', 16)}</span></div>`; }).join('');
    const cs = OP.search.query(b, q, 6).list.map((x) => { const code = b.raw.comp.c[x.j]; return `<div class="res" data-act="cpAdd" data-t="C" data-code="${code}"><span class="code">${code}</span><span class="rd">${esc(b.raw.comp.d[x.j])}</span><span class="ru">${esc(b.unit(x.j))}</span><span class="rp">${UI.money(b.compCost(code, pj.uf, pj.rg))}</span><span class="ra">${UI.icon('plus', 16)}</span></div>`; }).join('');
    return (ins ? `<div class="rsum" style="padding:6px 10px;margin:0">Insumos</div>${ins}` : '') + (cs ? `<div class="rsum" style="padding:6px 10px;margin:0">Composições</div>${cs}` : '') || '<div class="empty">Nada encontrado.</div>';
  }
  D.tabs.ed = (c) => {
    if (c.src === 'SINAPI') return `<p>Crie uma <b>composição própria</b> a partir desta: itens e coeficientes são copiados e podem ser alterados, incluídos ou removidos. O custo é recalculado pela mesma regra do SINAPI e a composição passa a aparecer na busca e no orçamento (código CP-xxx), salva neste navegador.</p><button class="btn pri" data-act="cpNew" data-code="${esc(c.code)}">${UI.icon('copy')} Criar composição própria</button>`;
    const pj = A.pj; const rows = A.base.itemsOf(c.code, pj.uf, pj.rg); const tot = A.base.compCost(c.code, pj.uf, pj.rg); const q = A.drawer.cq || '';
    return `<div class="pform"><label class="fld" style="flex:1;min-width:240px"><span>Descrição</span><input data-ch="cpDesc" value="${esc(c.desc)}" style="width:100%"></label><label class="fld"><span>Unidade</span><input data-ch="cpUnit" value="${esc(c.unit)}" style="width:80px"></label></div>
      <h4 class="sub">Itens</h4><div class="tblw"><table class="tbl sm"><thead><tr><th>Tipo</th><th>Código</th><th>Descrição</th><th>Und</th><th class="r">Coeficiente</th><th class="r">Total</th><th></th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${r.type === 'C' ? 'Comp.' : 'Insumo'}</td><td class="code">${esc(r.code)}</td><td>${esc(r.desc)}</td><td>${esc(r.unit)}</td><td class="r"><input class="qty" data-fk="cpc-${i}" data-ch="cpCoef" data-i="${i}" value="${U.num(r.coef, 7, 2)}" inputmode="decimal"></td><td class="r">${r.total == null ? '—' : U.num(r.total / 100, 2)}</td><td><button class="ib sm danger" data-act="cpDel" data-i="${i}" title="Remover item">${UI.icon('trash', 15)}</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5">Custo unitário (${pj.uf})</td><td class="r">${tot == null ? '—' : U.num(tot / 100, 2)}</td><td></td></tr></tfoot></table></div>
      <h4 class="sub">Incluir insumo ou composição</h4><input class="inp" data-fk="cpq" data-in="cpq" placeholder="Buscar insumo ou composição (descrição ou código)…" value="${esc(q)}">
      <div class="rlist" style="margin-top:8px">${q.trim() ? cpResults(q) : ''}</div>
      <div class="dr-a"><button class="btn ghost" data-act="cpRemove">${UI.icon('trash')} Excluir composição própria</button></div>`;
  };
  UI.act.openComp = (el) => { if (UI.$('#overlay.on')) UI.closeModal(); D.open(el.dataset.code); };
  UI.act.drClose = () => D.close();
  UI.act.drTab = (el) => { A.drawer.tab = el.dataset.t; D.render(); };
  UI.act.anToggle = (el) => { const s = A.drawer.exp, p = el.dataset.p; if (s.has(p)) s.delete(p); else s.add(p); D.render(); };
  UI.act.setUF = (el) => { A.pj.uf = el.dataset.uf; UI.commit(); };
  /* ---- composições próprias ---- */
  D.applyCustoms = () => { A.base.setCustom(A.customs); OP.prod.clearCache(A.base); A.base._bdCache = new Map(); A.model = null; };
  const saveCustom = (cp) => { cp.updated = Date.now(); OP.store.put('custom', cp).catch(() => {}); const i = A.customs.findIndex((x) => x.code === cp.code); if (i >= 0) A.customs[i] = cp; else A.customs.push(cp); D.applyCustoms(); };
  const cur = () => A.drawer && A.customs.find((x) => x.code === A.drawer.code);
  UI.act.cpNew = (el) => {
    const b = A.base; const j = b.compIdx.get(+el.dataset.code); if (j == null) return;
    const n = A.customs.reduce((mx, c) => Math.max(mx, +((/CP-(\d+)/.exec(c.code) || [0, 0])[1])), 0) + 1; const code = 'CP-' + String(n).padStart(3, '0');
    const cp = { id: code, code, desc: b.raw.comp.d[j].replace(/\.?\s*AF_\S+\s*$/, '') + ' (ADAPTADA)', unit: b.unit(j), group: 'Composições próprias', src: 'PRÓPRIA', base: b.raw.comp.c[j],
      items: b.raw.comp.it[j].map(([c, coef]) => ({ type: c < 0 ? 'C' : 'I', code: Math.abs(c), coef })), created: Date.now() };
    saveCustom(cp); A.drawer = { code, tab: 'ed', exp: new Set(), cq: '' }; UI.render(); UI.toast(`Composição própria ${code} criada.`);
  };
  UI.chg.cpDesc = (el) => { const cp = cur(); if (!cp) return; cp.desc = el.value.trim() || cp.desc; saveCustom(cp); UI.commit(); };
  UI.chg.cpUnit = (el) => { const cp = cur(); if (!cp) return; cp.unit = el.value.trim().toUpperCase() || cp.unit; saveCustom(cp); UI.commit(); };
  UI.chg.cpCoef = (el) => { const cp = cur(); const v = U.parseNum(el.value); if (!cp || !isFinite(v) || v < 0) { UI.toast('Coeficiente inválido', 'warn'); return; } cp.items[+el.dataset.i].coef = v; saveCustom(cp); UI.commit(); };
  UI.act.cpDel = (el) => { const cp = cur(); if (!cp) return; cp.items.splice(+el.dataset.i, 1); saveCustom(cp); UI.commit(); };
  UI.inp.cpq = (el) => UI.later('cpq', () => { if (A.drawer) { A.drawer.cq = el.value; UI.render(); } }, 220);
  UI.act.cpAdd = (el) => { const cp = cur(); if (!cp) return; cp.items.push({ type: el.dataset.t, code: +el.dataset.code, coef: 1 }); A.drawer.cq = ''; saveCustom(cp); UI.commit(); UI.toast('Item incluído com coeficiente 1 — ajuste o valor.'); };
  UI.act.cpRemove = () => {
    const cp = cur(); if (!cp || !confirm(`Excluir a composição própria ${cp.code}? Itens do orçamento que a usam ficarão sem custo.`)) return;
    A.customs = A.customs.filter((x) => x.code !== cp.code); OP.store.del('custom', cp.id).catch(() => {}); D.applyCustoms(); D.close(); UI.commit();
  };
})(typeof window !== 'undefined' ? window : globalThis);

