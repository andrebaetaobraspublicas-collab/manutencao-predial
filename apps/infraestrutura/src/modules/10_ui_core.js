/* ==== 10_ui_core.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 10_ui_core.js
 * Infraestrutura da interface: estado do app, renderização reativa com
 * preservação de foco, delegação de eventos (um único ouvinte por tipo,
 * sem acúmulo), ícones, modal, gaveta, paleta de busca (Ctrl+K), toasts.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const esc = U.esc;
  const UI = (OP.ui = {});
  const A = (OP.app = { base: null, pj: null, model: null, view: 'catalog', sel: {}, trees: {}, drawer: null, svgs: {}, customs: [] });
  UI.$ = (s, r = document) => r.querySelector(s);
  UI.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  UI.views = {}; UI.act = {}; UI.inp = {}; UI.chg = {};
  const P = {
    catalog: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', budget: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
    crew: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 0 1 0 5.6M21 20c0-2.6-1.6-4.8-3.8-5.6',
    gantt: 'M4 3v18h17M7 7h7M10 11h8M8 15h6', chart: 'M4 20V11M9 20V5M14 20v-6M19 20V9M2 20h20',
    base: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
    plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', up: 'M12 19V5M6 11l6-6 6 6', down: 'M12 5v14M6 13l6 6 6-6',
    left: 'M19 12H5M11 6l-6 6 6 6', right: 'M5 12h14M13 6l6 6-6 6', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    swap: 'M7 7h13l-4-4M17 17H4l4 4', sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z', file: 'M6 3h9l4 4v14H6zM14 3v5h5', dl: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6', tree: 'M12 3v5M12 8H6v5M12 8h6v5M4 13h4v4H4zM16 13h4v4h-4zM10 13h4v4h-4z',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4', copy: 'M8 8h12v12H8zM4 16V4h12',
    pdf: 'M6 3h9l4 4v14H6zM9 13h6M9 17h4', flag: 'M5 21V4M5 4h12l-2.5 4 2.5 4H5', pct: 'M19 5L5 19M9 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', warn: 'M12 4l9 16H3zM12 10v4M12 17v.01', ok: 'M5 12l5 5L20 7', img: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01'
  };
  UI.icon = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || ''}"/></svg>`;
  UI.logo = (s = 30) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="4" fill="#FFC21A"/><path d="M6 9h11M9 15h12M13 21h13" stroke="#15202B" stroke-width="3.2" stroke-linecap="square"/><path d="M6 25h20" stroke="#15202B" stroke-width="1.6"/></svg>`;
  UI.money = (c) => (c == null ? '—' : U.brl(c / 100));
  UI.code = (s) => OP.code(s);
  const timers = new Map();
  UI.later = (key, fn, ms = 300) => { clearTimeout(timers.get(key)); timers.set(key, setTimeout(() => { timers.delete(key); fn(); }, ms)); };
  UI.injectFonts = () => {
    const F = G.OP_FONTS; if (!F) return;
    const st = document.createElement('style');
    st.textContent = [['Barlow Semi Condensed', 500, F.bsc500], ['Barlow Semi Condensed', 600, F.bsc600], ['Barlow Semi Condensed', 700, F.bsc700], ['Barlow', 400, F.b400], ['Barlow', 600, F.b600]]
      .filter((x) => x[2]).map(([f, w, d]) => `@font-face{font-family:'${f}';font-weight:${w};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${d}) format('woff2')}`).join('');
    document.head.appendChild(st);
  };
  UI.svgFonts = () => { const F = G.OP_FONTS; if (!F) return ''; return `<style>@font-face{font-family:'Barlow Semi Condensed';font-weight:500;src:url(data:font/woff2;base64,${F.bsc500}) format('woff2')}@font-face{font-family:'Barlow Semi Condensed';font-weight:700;src:url(data:font/woff2;base64,${F.bsc700}) format('woff2')}</style>`; };

  /* ---------- modelo reativo ---------- */
  UI.model = () => { if (A.model) return A.model; let m = OP.engine.compute(A.base, A.pj); if (OP.sync && !OP.sync.busy && OP.sync.run(A.pj, m)) m = OP.engine.compute(A.base, A.pj); return (A.model = m); };
  const saveTimers = new Map();
  UI.saveSoon = () => {
    const pj = A.pj; if (!pj) return; clearTimeout(saveTimers.get(pj.id));
    saveTimers.set(pj.id, setTimeout(() => { saveTimers.delete(pj.id); OP.store.put('projects', pj).then(() => { A.saveError = false; UI.renderNav(); }).catch((e) => { A.saveError = true; UI.renderNav(); UI.toast('Não foi possível salvar o orçamento neste navegador. Exporte o projeto JSON para preservar as alterações. ' + e.message, 'warn'); }); }, 500));
  };
  UI.commit = () => { A.pj.updated = Date.now(); A.model = null; UI.saveSoon(); UI.render(); };
  UI.render = () => {
    if (!A.pj) return;
    const ae = document.activeElement; const fk = ae && ae.getAttribute && ae.getAttribute('data-fk');
    const st = fk ? { v: ae.value, s: ae.selectionStart, e: ae.selectionEnd } : null;
    const scr = UI.$$('[data-keep]').map((el) => [el.dataset.keep, el.scrollLeft, el.scrollTop]);
    const v = UI.views[A.view] || UI.views.catalog;
    UI.renderTop(); UI.renderNav();
    const main = UI.$('#main'); main.className = 'main ' + (v.cls || '');
    try { main.innerHTML = v.render(); if (v.after) v.after(main); }
    catch (e) { console.error(e); main.innerHTML = `<div class="empty">Erro ao montar a tela: ${esc(e.message)}</div>`; }
    if (A.drawer) OP.drawer.render();
    scr.forEach(([k, l, t]) => { const el = UI.$(`[data-keep="${k}"]`); if (el) { el.scrollLeft = l; el.scrollTop = t; } });
    if (fk) {
      const el = UI.$(`[data-fk="${G.CSS && CSS.escape ? CSS.escape(fk) : fk}"]`);
      if (el) { el.focus(); if (st && typeof st.v === 'string' && 'value' in el && el.tagName === 'INPUT') { el.value = st.v; try { el.setSelectionRange(st.s, st.e); } catch (e) { /* tipos sem seleção */ } } }
    }
  };
  UI.renderTop = () => {
    const m = UI.model(), pj = A.pj, b = A.base;
    UI.$('#top').innerHTML = `<div class="tb-l"><input class="pjname" data-fk="pjname" data-in="pjname" value="${esc(pj.name)}" aria-label="Nome do orçamento" spellcheck="false">
      <span class="chip" title="Base de preços ativa">${esc(b.raw.fonte || 'SICRO')} ${esc(b.ufs[0])} ${esc(b.raw.ref)}</span></div>
      <div class="tb-r"><label class="fld sm"><span>UF</span><select data-ch="uf" aria-label="UF">${b.ufs.map((u) => `<option ${u === pj.uf ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label class="fld sm"><span>Regime</span><select data-ch="rg" aria-label="Regime de encargos">${Object.entries(OP.sicro.REGIMES).map(([k, t]) => `<option value="${k}" ${k === pj.rg ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="fld sm"><span>BDI %</span><input data-fk="bdi" data-ch="bdi" inputmode="decimal" value="${U.num(pj.bdi * 100, 2)}" style="width:62px" aria-label="BDI"></label>
      <div class="kpi"><span>Preço total</span><b>${U.brl(m.tot.price / 100)}</b></div>
      <button class="btn ghost" data-act="palette" title="Buscar composição (Ctrl+K)">${UI.icon('search')}<span>Buscar</span><kbd>Ctrl K</kbd></button>
      <button class="btn ghost" data-act="fileMenu">${UI.icon('file')}<span>Arquivo</span></button>
      <button class="ib" data-act="theme" title="Alternar tema claro/escuro">${UI.icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button></div>`;
  };
  const NAV = [['catalog', 'Catálogo SICRO', 'catalog'], ['inputs','Insumos','base'], ['compositions','Composições','catalog'], ['budget', 'Orçamento', 'budget'], ['transport', 'Transportes (DMT)', 'swap'], ['fit', 'FIT', 'chart'], ['fic', 'FIC', 'warn'], ['pem', 'Demonstrativo de Produções Horárias', 'gantt'], ['bdi', 'BDI', 'pct'], ['evento', 'Eventograma', 'flag'], ['crews', 'Equipes e produtividade', 'crew'],
    ['schedule', 'Cronograma', 'gantt'], ['resources', 'Recursos e Curva S', 'chart'], ['reforma', 'Reforma Tributária', 'pct'], ['risks', 'Riscos e contingências', 'flag'], ['mob', 'Mobilização', 'right'], ['can', 'Canteiro de Obras', 'img'], ['al', 'Administração Local', 'crew'], ['base', 'Base de dados', 'base'], ['manual', 'Manual', 'book']];
  UI.renderNav = () => {
    UI.$('#nav').innerHTML = NAV.map(([k, t, i]) => `<button class="nv ${A.view === k ? 'on' : ''}" data-act="go" data-v="${k}" title="${t}">${UI.icon(i, 20)}<span>${t}</span></button>`).join('');
    const b = A.base, v = b.raw.valid || {};
    UI.$('#sidef').innerHTML = `<b>${esc(b.raw.fonte || 'SICRO')} ${esc(b.ufs[0])} ${esc(b.raw.ref)}</b> · ${U.int(b.nComp)} composições<br>Custos conferidos: ${v.total ? U.pct(v.ok / v.total, 2) : '—'}<br>${A.saveError ? 'FALHA AO SALVAR — exporte JSON' : OP.store.persistent() ? 'Armazenamento local (IndexedDB)' : 'Modo temporário (sem IndexedDB)'}`;
  };

  /* ---------- eventos (delegação única) ---------- */
  UI.bind = () => {
    document.addEventListener('click', (ev) => {
      const pop = UI.$('.pop');
      if (pop && !pop.contains(ev.target) && !ev.target.closest('[data-act="fileMenu"]')) pop.remove();
      if (ev.target.id === 'overlay') { UI.closeModal(); return; }
      const el = ev.target.closest('[data-act]'); if (!el) return;
      const fn = UI.act[el.dataset.act]; if (!fn) return;
      ev.preventDefault();
      if (pop && pop.contains(el)) pop.remove();
      try { const task = fn(el, ev); if (task && typeof task.catch === 'function') task.catch((e) => { console.error(e); UI.toast('Erro: ' + e.message, 'warn'); }); } catch (e) { console.error(e); UI.toast('Erro: ' + e.message, 'warn'); }
    });
    document.addEventListener('input', (ev) => { const el = ev.target; const k = el.dataset && el.dataset.in; if (k && UI.inp[k]) UI.inp[k](el, ev); });
    document.addEventListener('change', (ev) => { const el = ev.target; const k = el.dataset && el.dataset.ch; if (k && UI.chg[k]) { try { UI.chg[k](el, ev); } catch (e) { console.error(e); UI.toast('Erro: ' + e.message, 'warn'); } } });
    document.addEventListener('keydown', (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); UI.act.palette(null); return; }
      if (ev.key === 'Escape') { const pop = UI.$('.pop'); if (pop) pop.remove(); else if (UI.$('#overlay.on')) UI.closeModal(); else if (A.drawer) OP.drawer.close(); return; }
      const t = ev.target; if (ev.key === 'Enter' && t.dataset && t.dataset.enter && UI.act[t.dataset.enter]) { ev.preventDefault(); UI.act[t.dataset.enter](t, ev); }
    });
    G.addEventListener('resize', U.debounce(() => OP.catalog && OP.catalog.redraw(), 150));
  };

  /* ---------- toasts, modal, popover ---------- */
  UI.toast = (msg, kind = '') => {
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg; UI.$('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3400); setTimeout(() => el.remove(), 3900);
  };
  UI.modal = (title, body, o = {}) => {
    const previous = A.modal; A.modal = null; if (previous && previous.onClose) previous.onClose();
    const ov = UI.$('#overlay');
    ov.innerHTML = `<div class="modal ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="mh"><h3>${esc(title)}</h3><button class="ib" data-act="closeModal" title="Fechar (Esc)">${UI.icon('x')}</button></div><div class="mb" id="modalBody">${body}</div></div>`;
    ov.classList.add('on'); A.modal = o; if (o.after) o.after(UI.$('#modalBody'));
  };
  UI.closeModal = () => { const ov = UI.$('#overlay'); ov.classList.remove('on'); ov.innerHTML = ''; const m = A.modal; A.modal = null; A.trees.swap = null; if (m && m.onClose) m.onClose(); };
  UI.pickFile = (accept) => new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files[0] || null); i.click(); });
  UI.stageOptions = (m, selId) => {
    const sid = selId || A.sel.stage || (m.stages.length ? m.stages[m.stages.length - 1].id : '');
    return m.stages.map((s) => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${s.num} — ${esc(U.cap(s.node.name))}</option>`).join('') + '<option value="__new">+ Nova etapa</option>';
  };

  /* ---------- ações globais ---------- */
  UI.act.go = (el) => { A.view = el.dataset.v; UI.render(); UI.$('#main').scrollTop = 0; };
  UI.act.closeModal = () => UI.closeModal();
  UI.act.theme = () => { const d = document.documentElement; d.dataset.theme = d.dataset.theme === 'dark' ? 'light' : 'dark'; OP.store.setSetting('theme', d.dataset.theme); UI.render(); };
  UI.chg.uf = (el) => { A.pj.uf = el.value; UI.commit(); };
  UI.chg.rg = (el) => { A.pj.rg = el.value; UI.commit(); };
  UI.chg.bdi = (el) => { const v = U.parseNum(el.value); if (isFinite(v) && v >= 0 && v < 300) { A.pj.bdi = v / 100; UI.commit(); } else { UI.toast('BDI inválido', 'warn'); UI.render(); } };
  UI.inp.pjname = (el) => UI.later('pjname', () => { A.pj.name = el.value.trim() || 'Orçamento'; A.pj.updated = Date.now(); UI.saveSoon(); }, 400);
  UI.act.fileMenu = (el) => {
    const old = UI.$('.pop'); if (old) { old.remove(); return; }
    const r = el.getBoundingClientRect(); const d = document.createElement('div'); d.className = 'pop';
    d.innerHTML = [['newProject', 'plus', 'Novo orçamento'], ['openProjects', 'file', 'Abrir orçamento salvo…'], ['demo', 'flag', 'Exemplo: rodovia SP — trecho de 6 km'], null,
      ['exportXLSX', 'dl', 'Planilha completa (.xlsx)'], ['exportCSV', 'dl', 'Orçamento (.csv)'], ['exportJSON', 'dl', 'Salvar projeto (.json)'], ['importJSON', 'file', 'Abrir projeto (.json)…'], null,
      ['print', 'pdf', 'Imprimir / PDF da tela atual']].map((x) => (x ? `<button data-act="${x[0]}">${UI.icon(x[1], 16)} ${x[2]}</button>` : '<hr>')).join('');
    document.body.appendChild(d); d.style.top = r.bottom + 6 + 'px'; d.style.left = Math.max(8, r.right - d.offsetWidth) + 'px';
  };
  /* paleta de busca (Ctrl+K) */
  UI.pal = { q: '' };
  UI.act.palette = (el) => {
    A.target = (el && el.dataset && el.dataset.stage) || null;
    UI.modal(A.target ? 'Adicionar serviço na etapa' : 'Buscar composição', `<div class="palin">${UI.icon('search')}<input id="palq" data-in="palq" placeholder="Ex.: concreto asfáltico faixa C · BSTC 1,00 · escavação 1ª categoria 200 a 400 · 4011209" autocomplete="off" spellcheck="false" value="${esc(UI.pal.q)}"></div><div id="palres" class="palres"></div>`,
      { wide: true, after: () => { const i = UI.$('#palq'); i.focus(); i.select(); UI.palRender(); } });
  };
  const palDeb = U.debounce(() => UI.palRender(), 110);
  UI.inp.palq = (el) => { UI.pal.q = el.value; palDeb(); };
  UI.palRender = () => { const box = UI.$('#palres'); if (box) box.innerHTML = OP.catalog.resultsHTML(UI.pal.q, { limit: 60 }); };
  /* adicionar ao orçamento (diálogo rápido) */
  UI.act.quickAdd = (el) => {
    const code = UI.code(el.dataset.code); const c = A.base.comp(code); if (!c) return;
    const m = UI.model();
    UI.modal('Adicionar ao orçamento', `<p class="rc-d"><span class="code">${esc(code)}</span> · ${esc(c.desc)}</p>
      <div class="pform"><label class="fld"><span>Quantidade (${esc(c.unit)})</span><input id="aq" data-enter="addConfirm" data-code="${esc(code)}" inputmode="decimal" placeholder="0,00"></label>
      <label class="fld"><span>Etapa</span><select id="as">${UI.stageOptions(m, A.target)}</select></label>
      <button class="btn pri" data-act="addConfirm" data-code="${esc(code)}">${UI.icon('plus')} Adicionar</button></div>`, { after: () => UI.$('#aq').focus() });
  };
  UI.act.addConfirm = (el) => {
    const code = UI.code(el.dataset.code); const q = U.parseNum(UI.$('#aq').value || '0');
    let sid = UI.$('#as').value; if (sid === '__new') sid = OP.engine.addStage(A.pj, null, 'NOVA ETAPA').id;
    const { stage } = OP.engine.addItem(A.pj, sid, code, isFinite(q) && q > 0 ? q : 0);
    A.sel.stage = stage.id; A.target = null; UI.closeModal(); UI.commit();
    UI.toast(`Adicionado em “${U.cap(stage.name)}”${isFinite(q) && q > 0 ? '' : ' — informe a quantidade no Orçamento'}.`);
  };
  UI.addToStage = (code, qty, sid) => {
    if (sid === '__new' || !sid) sid = sid === '__new' ? OP.engine.addStage(A.pj, null, 'NOVA ETAPA').id : A.sel.stage;
    const r = OP.engine.addItem(A.pj, sid, code, qty); A.sel.stage = r.stage.id; return r;
  };
})(typeof window !== 'undefined' ? window : globalThis);


