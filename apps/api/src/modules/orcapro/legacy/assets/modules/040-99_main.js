/* ==== 99_main.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 99_main.js
 * Inicialização: base embutida (gzip+base64) ou importada (IndexedDB),
 * último orçamento aberto (ou demonstração) e ações de projeto.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app;
  const M = (OP.main = {});
  M.embeddedRaw = async () => {
    const b64 = document.getElementById('op-base').textContent.replace(/\s+/g, '');
    const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const txt = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(txt);
  };
  M.useBase = (raw, id) => {
    A.base = OP.register.makeBase(raw,id,A.inputs||[],A.customs||[],A.pj?.sinapiPriceQuotes||[]);
    A.model = null; A.sel.gi = null; A.sel.fam = null; A.trees = {}; if (A.drawer) OP.drawer.close();
  };
  M.openProject = (pj) => {
    OP.engine.fix(pj); A.pj = pj; OP.register.hydrate(pj); A.model = null; A.sel = { open: A.sel.open };
    OP.store.put('projects', pj).catch(() => {}); OP.store.setSetting('lastProject', pj.id); A.view = 'budget'; UI.render();
  };
  UI.act.newProject = () => { if (confirm('Criar um novo orçamento vazio? O atual continua salvo neste navegador.')) M.openProject(OP.engine.newProject('Novo orçamento')); };
  UI.act.demo = () => { M.openProject(OP.engine.demo(A.base)); UI.toast('Demonstração carregada com composições reais da base ativa.'); };
  UI.act.demo2 = () => UI.act.spLoadExample();
  UI.act.openProjects = async () => {
    const list = (await OP.store.all('projects').catch(() => [])).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    UI.modal('Orçamentos salvos neste navegador', list.length ? `<div class="tblw"><table class="tbl sm"><thead><tr><th>Nome</th><th>UF</th><th>Atualizado</th><th></th></tr></thead><tbody>${list.map((p) => `<tr><td><b>${U.esc(p.name)}</b>${p.id === A.pj.id ? ' <span class="tag">aberto</span>' : ''}</td><td>${U.esc(p.uf || '')}</td><td>${new Date(p.updated || p.created || Date.now()).toLocaleString('pt-BR')}</td>
      <td class="r">${p.id !== A.pj.id ? `<button class="btn sm" data-act="openPj" data-id="${U.esc(p.id)}">Abrir</button><button class="ib sm danger" data-act="delPj" data-id="${U.esc(p.id)}" title="Excluir">${UI.icon('trash', 15)}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum orçamento salvo.</p>', { wide: true });
  };
  UI.act.openPj = async (el) => { const pj = await OP.store.get('projects', el.dataset.id).catch(() => null); if (pj) { UI.closeModal(); M.openProject(pj); } };
  UI.act.delPj = async (el) => { if (!confirm('Excluir este orçamento deste navegador?')) return; await OP.store.del('projects', el.dataset.id).catch(() => {}); UI.act.openProjects(); };
  function showLegalGate() {
    const gate=document.getElementById('legalGate'),app=document.getElementById('app');
    const ck=document.getElementById('legalAccept'),btn=document.getElementById('legalEnter');
    if(!gate||!ck||!btn) throw new Error('A tela de avisos legais não está disponível.');
    if(app)app.inert=true;
    gate.hidden=false;gate.style.display='grid';ck.checked=false;btn.disabled=true;
    const update=()=>{btn.disabled=!ck.checked;};ck.oninput=update;ck.onchange=update;
    btn.onclick=()=>{
      if(!ck.checked)return;
      gate.hidden=true;gate.style.display='none';document.body.classList.remove('gate-open');
      if(app){app.inert=false;app.removeAttribute('inert');}
      OP.main.legalAccepted=true;
      const target=document.querySelector('#nav button.on, #nav button');
      if(target)target.focus({preventScroll:true});
    };
    ck.focus({preventScroll:true});
  }
  // Keyboard shortcuts must not open a modal behind the required acceptance screen.
  document.addEventListener('keydown',ev=>{
    const gate=document.getElementById('legalGate'),boot=document.getElementById('boot');
    if(!boot&&(!gate||gate.hidden))return;
    if(boot){ev.stopImmediatePropagation();if(ev.key==='Tab')ev.preventDefault();return;}
    if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='k'){ev.preventDefault();ev.stopImmediatePropagation();return;}
    if(ev.key==='Escape'){ev.stopImmediatePropagation();return;}
    if(ev.key==='Tab'){
      const controls=[...gate.querySelectorAll('input:not(:disabled), button:not(:disabled), a[href]')];
      const first=controls[0],last=controls[controls.length-1],active=document.activeElement;
      if(first&&(ev.shiftKey&&(active===first||!gate.contains(active))||!ev.shiftKey&&(active===last||!gate.contains(active)))){ev.preventDefault();(ev.shiftKey?last:first).focus();}
      ev.stopImmediatePropagation();
    }
  },true);
  M.boot = async () => {
    const bootStarted = Date.now();
    const appRoot=document.getElementById('app');if(appRoot)appRoot.inert=true;
    UI.injectFonts(); UI.bind();
    await OP.store.open();
    await OP.basic.loadWidth();
    const th = await OP.store.setting('theme'); if (th) document.documentElement.dataset.theme = th;
    A.customs = (await OP.store.all('custom').catch(() => [])) || [];
    A.inputs = (await OP.store.all('inputs').catch(() => [])) || [];
    OP.register.library={inputs:OP.register.clone(A.inputs),compositions:OP.register.clone(A.customs)};
    A.basesMeta = (await OP.store.setting('basesMeta')) || [];
    A.embeddedRef = G.OP_BASE_REF || '';
    let raw = null, id = 'embedded';
    const act = await OP.store.setting('activeBase');
    if (act && act !== 'embedded') { const rec = await OP.store.get('bases', act).catch(() => null); if (rec && rec.raw) { raw = rec.raw; id = act; } }
    if (!raw) raw = await M.embeddedRaw();
    M.useBase(raw, id);
    const last = await OP.store.setting('lastProject'); const pj = last ? await OP.store.get('projects', last).catch(() => null) : null;
    if (!pj && A.base.raw.ref !== '08/2026') { M.useBase(await M.embeddedRaw(), 'embedded'); OP.store.setSetting('activeBase','embedded').catch(()=>{}); }
    A.pj = OP.engine.fix(pj || OP.examples.build('edificio', A.base));
    OP.register.hydrate(A.pj);
    OP.store.put('projects', A.pj).catch(() => {}); OP.store.setSetting('lastProject', A.pj.id);
    A.view = 'budget';
    UI.render();
    const elapsed = Date.now() - bootStarted; if (elapsed < 4000) await new Promise((r) => setTimeout(r, 4000 - elapsed));
    const bt = document.getElementById('boot'); if (bt) bt.remove();
    showLegalGate();

  };
  if (typeof document !== 'undefined' && document.getElementById('app')) M.boot().catch((e) => { console.error(e); const b = document.getElementById('boot'); if (b) b.innerHTML = '<p style="max-width:520px;text-align:center">Não foi possível iniciar: ' + U.esc(e.message) + '. Use um navegador atualizado (Chrome, Edge, Firefox ou Safari recentes).</p>'; });
})(typeof window !== 'undefined' ? window : globalThis);
