/* Adaptador SaaS do Infraestrutura. Os motores e componentes originais não são reescritos. */
const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3001/api/v1').replace(/\/$/, '');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const state = { access: null, project: null, cycles: [], preferences: {}, revisions: new Map(),
  signatures: new Map(), saving: false, conflict: false, error: null, ready: false, lastSaved: '' };
let database, chain = Promise.resolve(), timer, refreshing;
const edits = new Map();
const ownChains = new Map();
const ID = /^[a-f0-9-]{36}$/i;
function status(kind, message = '') {
  state.saving = kind === 'saving';
  if (window.parent !== window) window.parent.postMessage({ type: 'infra-save', status: kind, message }, location.origin);
}
async function request(path, options = {}, retry = true) {
  const mutating = !['GET', 'HEAD'].includes(options.method || 'GET');
  const response = await fetch(API_BASE + path, { ...options, credentials: 'include', cache: 'no-store',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(mutating && state.access?.csrfToken ? { 'X-Infra-CSRF': state.access.csrfToken } : {}), ...options.headers } });
  if (response.status === 401 && retry) {
    refreshing ||= fetch(API_BASE + '/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(r => r.ok).catch(() => false).finally(() => { refreshing = null; });
    if (await refreshing) { state.access = await request('/infraestrutura/access', {}, false); return request(path, options, false); }
  }
  if (response.status === 304) return { notModified: true };
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const error = new Error(Array.isArray(details.message) ? details.message.join(' ') : details.message || `Falha na solicitação (${response.status}).`);
    error.status = response.status; error.details = details; throw error;
  }
  if (response.status === 204) return null;
  const value = await response.json();
  if (path.includes('/snapshot')) return { raw: value, etag: response.headers.get('ETag') };
  return value;
}
async function cacheOpen() {
  database = await new Promise(resolve => {
    if (!window.indexedDB) return resolve(null);
    const r = indexedDB.open('orcapro-infraestrutura-cache', 2);
    r.onupgradeneeded = () => { for (const name of ['catalog', 'drafts', 'derived']) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name, { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result); r.onerror = r.onblocked = () => resolve(null);
  });
}
function local(store, id, value) {
  if (!database) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, value === undefined ? 'readonly' : 'readwrite');
    const objectStore = transaction.objectStore(store);
    const operation = value === undefined ? objectStore.get(id) : objectStore.put({ ...value, id });
    let result; operation.onsuccess = () => { result = operation.result; };
    transaction.oncomplete = () => resolve(result); transaction.onerror = () => reject(transaction.error);
  });
}
function pruneDerived() {
  if (!database) return Promise.resolve();
  return new Promise(resolve => {
    const transaction = database.transaction('derived', 'readwrite'), store = transaction.objectStore('derived');
    const entries = [], cursor = store.openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (item) { entries.push({ key: item.primaryKey, at: item.value.at || 0 }); item.continue(); }
      else for (const entry of entries.sort((a, b) => b.at - a.at).slice(4)) store.delete(entry.key);
    };
    transaction.oncomplete = transaction.onerror = () => resolve();
  });
}
const draftId = () => `${state.access.userId}:${state.access.tenantId}:${state.project.id}`;
const listOf = value => Array.isArray(value) ? value : value.items || [];
async function snapshot() {
  const id = state.project.cycleId, key = `cycle:${id}`;
  const cached = await local('catalog', key).catch(() => null);
  // Authorization is checked on every load, including 304; cache never grants access.
  const result = await request(`/infraestrutura/cycles/${id}/snapshot`, { headers: cached?.etag ? { 'If-None-Match': cached.etag } : {} });
  if (result.notModified) { if (!cached?.raw) throw new Error('O cache da referência SICRO está incompleto.'); state.catalogHash = await digest(cached.raw); return clone(cached.raw); }
  state.catalogHash = await digest(result.raw);
  await local('catalog', key, { etag: result.etag, raw: result.raw }).catch(() => {});
  return result.raw;
}
async function pem() { const value = await request(`/infraestrutura/cycles/${state.project.cycleId}/pem`); state.pemHash = await digest(value); return value; }
async function digest(value) {
  if (!window.crypto?.subtle) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function derivedKey() {
  // Include the entire saved document, rather than guessing which editable fields affect costs.
  // An unversioned project catalog could inherit personal library data, so it is never restored.
  if (!database || !state.catalogHash || !state.pemHash || !window.OP_SOURCE_SHA256 || state.project.data.catalog?.v !== 1) return null;
  return digest({ schema: 1, engine: window.OP_SOURCE_SHA256, catalog: state.catalogHash, pem: state.pemHash,
    userId: state.access.userId, tenantId: state.access.tenantId, projectId: state.project.id,
    projectVersion: state.project.version, cycleId: state.project.cycleId, data: state.project.data });
}
async function prepare() {
  state.access = await request('/infraestrutura/access');
  if (!state.access.enabled) throw new Error('O acesso ao OrçaPro Infraestrutura está desabilitado.');
  const id = new URLSearchParams(location.search).get('project');
  if (!id || !ID.test(id)) throw new Error('Abra um orçamento pelo portal do OrçaPro Infraestrutura.');
  [state.project, state.cycles, state.preferences] = await Promise.all([
    request(`/infraestrutura/projects/${id}`), request('/infraestrutura/cycles'), request('/infraestrutura/settings'),
  ]);
  state.cycles = listOf(state.cycles); await cacheOpen();
  config.snapshotUrl = `${API_BASE}/infraestrutura/cycles/${state.project.cycleId}/snapshot`;
  config.pemUrl = `${API_BASE}/infraestrutura/cycles/${state.project.cycleId}/pem`;
}
function report(error) {
  state.error = error; if (error.status === 409) state.conflict = true;
  status(state.conflict ? 'conflict' : 'error', error.message);
  if (window.OP?.app) { OP.app.saveError = true; OP.ui.renderNav(); }
}
function projectData(O) {
  O.register.snapshot(); const data = clone(O.app.pj); data.sicroCycleId = state.project.cycleId;
  data.id = state.project.id; return data;
}
function save(O, document) {
  const data = clone(document); data.sicroCycleId = state.project.cycleId;
  const signature = JSON.stringify(data);
  const operation = chain.catch(() => {}).then(async () => {
    if (data.id !== state.project.id) throw new Error('Abra este orçamento pelo portal antes de salvá-lo.');
    await local('drafts', draftId(), { data, serverVersion: state.project.version, at: Date.now() }).catch(() => {});
    if (state.conflict) throw state.error;
    if (signature === state.lastSaved) return clone(state.project);
    status('saving');
    try {
      const saved = await request(`/infraestrutura/projects/${data.id}`, { method: 'PUT', body: JSON.stringify({
        version: state.project.version, name: data.name, uf: data.uf, regime: data.rg, data,
      }) });
      state.project = saved; state.lastSaved = signature; state.error = null; O.app.saveError = false;
      await local('drafts', draftId(), { data, serverVersion: saved.version, at: Date.now(), confirmed: true }).catch(() => {});
      status('saved'); return saved;
    } catch (error) { report(error); throw error; }
    finally { state.saving = false; O.ui.renderNav(); }
  });
  chain = operation; return operation;
}
async function loadLibrary(kind) {
  const values = listOf(await request(`/infraestrutura/me/${kind === 'inputs' ? 'inputs' : 'compositions'}`));
  for (const row of values) { state.revisions.set(kind + ':' + row.code, row.revision); state.signatures.set(kind + ':' + row.code, JSON.stringify(row.data)); }
  return values.map(row => clone(row.data));
}
async function ownPut(kind, data) {
  const key = kind + ':' + data.code;
  const document = clone(data);
  const operation = (ownChains.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    if (state.conflict) throw state.error;
    if (state.signatures.get(key) === JSON.stringify(document)) return document;
    try {
      const result = await request(`/infraestrutura/me/${kind === 'inputs' ? 'inputs' : 'compositions'}/${encodeURIComponent(document.code)}`,
        { method: 'PUT', body: JSON.stringify({ data: document, revision: state.revisions.get(key) || 0 }) });
      state.revisions.set(key, result.revision); state.signatures.set(key, JSON.stringify(document)); return result;
    } catch (error) {
      await local('drafts', draftId(), { data: projectData(window.OP), serverVersion: state.project.version, at: Date.now() }).catch(() => {});
      report(error); throw error;
    }
  });
  ownChains.set(key, operation); return operation;
}
function installAdapter(O) {
  const S = O.store, UI = O.ui;
  S.open = async () => true; S.persistent = () => state.ready;
  S.setting = async key => key === 'lastProject' ? state.project.id : key === 'activeBase' ? state.project.cycleId : key === 'basesMeta' ? state.cycles : state.preferences[key];
  S.setSetting = async (id, v) => {
    if (['lastProject', 'activeBase', 'basesMeta'].includes(id)) return;
    await request('/infraestrutura/settings', { method: 'PUT', body: JSON.stringify({ id, v }) }); state.preferences[id] = clone(v);
  };
  S.get = async (kind, id) => {
    if (kind === 'projects') return clone(id === state.project.id ? state.project.data : (await request(`/infraestrutura/projects/${id}`)).data);
    if (kind === 'bases') { if (id !== state.project.cycleId) throw new Error('Migre a referência com comparação antes de alterar a base do projeto.'); return { id, raw: clone(window.OP_SICRO_RAW) }; }
    if (kind === 'settings') return { id, v: await S.setting(id) };
    return (await S.all(kind)).find(row => row.id === id || row.code === id);
  };
  S.all = async kind => kind === 'inputs' || kind === 'custom' ? loadLibrary(kind) : kind === 'projects' ? [clone(state.project.data)] : kind === 'bases' ? state.cycles : [];
  S.put = async (kind, data) => {
    if (kind === 'projects') return save(O, data);
    if (kind === 'inputs' || kind === 'custom') return ownPut(kind, data);
    if (kind === 'settings') return S.setSetting(data.id, data.v);
    throw new Error('O catálogo SICRO é global. Use a importação administrativa.');
  };
  S.del = async (kind, id) => {
    if (!['inputs', 'custom'].includes(kind)) throw new Error('Use a gestão de projetos e referências no portal.');
    const key = kind + ':' + id;
    const operation = (ownChains.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
      if (state.conflict) throw state.error;
      try {
        const result = await request(`/infraestrutura/me/${kind === 'inputs' ? 'inputs' : 'compositions'}/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ revision: state.revisions.get(key) || 0 }) });
        if (result?.revision) state.revisions.set(key, result.revision);
        state.signatures.delete(key); return result;
      } catch (error) { report(error); throw error; }
    });
    ownChains.set(key, operation); return operation;
  };
  UI.later = (key, fn, delay = 300) => { clearTimeout(edits.get(key)?.timer); const task = { fn }; task.timer = setTimeout(() => { edits.delete(key); fn(); }, delay); edits.set(key, task); };
  UI.saveSoon = () => { clearTimeout(timer); timer = setTimeout(() => save(O, projectData(O)).catch(() => {}), 2000); };
}
async function afterModules(O) {
  const A = O.app, UI = O.ui, U = O.util, M = O.main, N = O.register;
  state.ready = true; O.infra = state;
  state.request = request;
  const checkEditors = () => {
    if (O.risks?.busy) throw new Error('Aguarde a conclusão da simulação de riscos antes de sair desta tela.');
    if (O.risks?.dirty) throw new Error('Salve ou descarte as alterações da análise de riscos antes de sair desta tela.');
    for (let editor = N.editor; editor; editor = editor.parent) if (editor.dirty || editor.saving) throw new Error('Salve ou cancele o cadastro próprio aberto antes de sair desta tela.');
  };
  state.flush = async () => {
    for (const [key, task] of edits) { clearTimeout(task.timer); edits.delete(key); await task.fn(); }
    clearTimeout(timer);
    await Promise.all([...ownChains.values()]);
    const saved = await save(O, projectData(O));
    checkEditors();
    return saved;
  };
  state.derivedKey = derivedKey;
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== window.parent || window.parent === window || event.data?.type !== 'infra-flush') return;
    const requestId = event.data.requestId;
    if (typeof requestId !== 'string' || !requestId || requestId.length > 100) return;
    try { await state.flush(); window.parent.postMessage({ type: 'infra-flush-result', requestId, ok: true }, location.origin); }
    catch (error) { window.parent.postMessage({ type: 'infra-flush-result', requestId, ok: false, message: error.message || 'Há alterações pendentes de gravação.' }, location.origin); }
  });
  state.lastSaved = JSON.stringify(state.project.data);
  const originalBoot = M.boot;
  const originalUseBase = M.useBase;
  const originalMakeBase = N.makeBase;
  let derived;
  let initializing = false;
  M.useBase = (raw, id) => {
    // The server already selected a project. Its hydrate builds the real Base once.
    // During boot this placeholder is only read for raw/ref before hydrate.
    if (initializing) { A.base = { raw, officialRaw: raw, id, ufs: raw.ufs }; A.model = null; return; }
    return originalUseBase(raw, id);
  };
  M.boot = async () => {
    const key = await derivedKey();
    derived = key ? await local('derived', key).catch(() => null) : null;
    initializing = true;
    try { await originalBoot(); } finally { initializing = false; }
    if (key && A.base?._costCache?.size) {
      await local('derived', key, { tables: [...A.base._costCache], transport: A.base._tsig,
        fic: A.base._fsig || '', pem: A.base._psig || '', count: A.base.nComp, at: Date.now() }).catch(() => {});
      await pruneDerived();
    }
    derived = null;
    const storageNotice = document.querySelector('#legalGate .legal-note p');
    if (storageNotice) storageNotice.innerHTML = '<b>Atenção:</b> os projetos são salvos no servidor, com controle de versões. Alterações pendentes de gravação podem ser preservadas como rascunho neste navegador; o rascunho não substitui a confirmação de salvamento no servidor. Recomenda-se exportar periodicamente o projeto JSON e os relatórios relevantes. Cotações próprias, composições sem detalhamento completo e enquadramentos tributários especiais exigem conferência específica.';
    const draft = await local('drafts', draftId()).catch(() => null);
    if (draft && !draft.confirmed && JSON.stringify(draft.data) !== state.lastSaved) {
      state.recoveryDraft = draft.data;
      const warning = document.createElement('div'); warning.className = 'notice warn'; warning.textContent = 'Há alterações locais não confirmadas no servidor. Após os avisos legais, use “Arquivo → Recuperar rascunho local”.';
      document.getElementById('main').prepend(warning);
    }
    UI.renderNav();
  };
  N.makeBase = (...args) => {
    const base = originalMakeBase(...args);
    if (initializing && derived?.count === base.nComp && Array.isArray(derived.tables)) {
      base.setTransport((O.fit && O.fit.effective(A.pj)) || A.pj.dmt || null);
      base.setPem('', null);
      if (O.fic) { const fic = O.fic.overrides(A.pj, base); base.setFic(fic ? fic.sig : '', fic ? fic.arr : null); }
      if (derived.transport === base._tsig && derived.fic === (base._fsig || '') && derived.pem === (base._psig || '') &&
        derived.tables.every(([key, table]) => typeof key === 'string' && table.cost?.length === base.nComp && table.as?.length === base.nComp && table.detail?.length === base.nComp)) {
        base._costCache = new Map(derived.tables); state.derivedRestored = true;
      }
    }
    return base;
  };
  const renderNav = UI.renderNav;
  UI.renderNav = () => {
    renderNav(); const nav = document.getElementById('nav');
    if (nav && state.access.role === 'ADMIN' && !nav.querySelector('[data-act="infraAdmin"]')) {
      const button = document.createElement('button'); button.className = 'nv'; button.dataset.act = 'infraAdmin'; button.innerHTML = UI.icon('base', 20) + '<span>Administração</span>'; nav.appendChild(button);
    }
    const foot = document.getElementById('sidef');
    if (foot) {
      foot.innerHTML = foot.innerHTML.replaceAll('Armazenamento local (IndexedDB)', 'Catálogo global · servidor');
      const account = document.createElement('span'); account.textContent = `${state.access.name || ''} · ${state.access.role === 'ADMIN' ? 'Administrador' : 'Usuário'} · ${state.conflict ? 'Conflito: preserve o rascunho' : state.error ? 'Gravação pendente' : state.saving ? 'Salvando…' : 'versão ' + state.project.version}`; foot.appendChild(document.createElement('br')); foot.appendChild(account);
    }
  };
  const navigate = async (path, committed = false) => { if (!committed) await state.flush(); window.top.location.assign(path); };
  UI.act.infraAdmin = () => navigate('/orcapro-infraestrutura/administracao');
  UI.act.newProject = async () => { await state.flush(); navigate('/orcapro-infraestrutura/gerenciar?novo=1'); };
  UI.act.demo = UI.act.demo2 = async () => { await state.flush(); navigate('/orcapro-infraestrutura/gerenciar?exemplo=1'); };
  UI.act.openProjects = async () => { await state.flush(); navigate('/orcapro-infraestrutura/gerenciar'); };
  UI.act.openPj = UI.act.openProjects; UI.act.delPj = UI.act.openProjects;
  M.openProject = () => { throw new Error('Importe e abra outros projetos pela lista de orçamentos do servidor.'); };
  N.importData = async data => {
    const document = clone(data.project || data);
    if (!document.root || !Array.isArray(document.root.children)) throw new Error('O arquivo não é um projeto OrçaPro Infraestrutura.');
    document.catalog ||= { v: 1, inputs: data.inputs || [], compositions: data.custom || [] };
    const cycleId = document.sicroCycleId || state.project.cycleId;
    if (cycleId !== state.project.cycleId) throw new Error('Abra a referência histórica indicada no arquivo antes de importar.');
    await state.flush();
    const created = await request('/infraestrutura/projects', { method: 'POST', body: JSON.stringify({ cycleId, name: document.name || 'Orçamento importado', uf: document.uf, regime: document.rg, data: document }) });
    navigate('/orcapro-infraestrutura/editor?id=' + encodeURIComponent(created.id)); return created.data;
  };
  UI.act.importBase = () => { if (state.access.role !== 'ADMIN') throw new Error('Somente o administrador pode importar SICRO.'); navigate('/orcapro-infraestrutura/administracao?tab=cycles'); };
  UI.act.delBase = UI.act.importBase;
  UI.act.useBase = () => { UI.toast('A referência fica vinculada ao orçamento. Use “Migrar SICRO” em Meus orçamentos para comparar e confirmar.', 'warn'); };
  const baseRender = UI.views.base.render;
  UI.views.base.render = () => {
    const html = baseRender(); const holder = document.createElement('div'); holder.innerHTML = html;
    for (const button of holder.querySelectorAll('[data-act="delBase"], [data-act="useBase"]')) button.remove();
    const importer = holder.querySelector('[data-act="importBase"]')?.closest('.panel');
    if (importer) importer.innerHTML = state.access.role === 'ADMIN' ? '<h3>Referências SICRO versionadas</h3><p>Importe, confira e publique referências na Administração. Referências publicadas são preservadas para os projetos históricos.</p><button class="btn pri" data-act="infraAdmin">Administrar catálogo SICRO</button>' : '<h3>Catálogo global SICRO</h3><p>Você pode consultar referências publicadas e usar seus insumos e composições. As importações e publicações são feitas pelo administrador.</p>';
    return holder.innerHTML.replaceAll('importada neste navegador', 'catálogo global do servidor').replaceAll('Referência ativa', 'Referência deste projeto').replaceAll('embutida no arquivo', 'catálogo global');
  };
  // Adapt only storage/help wording; the original calculation modules stay intact.
  const saasText = html => String(html)
    .replaceAll('<b>Base embutida</b>: SICRO SP 07/2026, funciona sem internet.', '<b>Catálogo global</b>: a referência SICRO vinculada ao seu projeto é consultada no servidor.')
    .replaceAll('Outras UFs e meses: menu Base de dados, selecionando as planilhas .xlsx do DNIT', 'Outras UFs e meses: o administrador importa, confere e publica as planilhas .xlsx do DNIT na Administração')
    .replaceAll('vem embutida no arquivo e funciona sem internet', 'fica no catálogo global do servidor e exige conexão para abrir a referência')
    .replaceAll('projetos e bases ficam no navegador (IndexedDB).', 'projetos e cadastros próprios ficam no servidor. O navegador mantém cache e rascunhos de recuperação.')
    .replaceAll('Os dados ficam no navegador (IndexedDB).', 'Os dados ficam no servidor, vinculados ao seu usuário e à sua organização.')
    .replaceAll('As análises são salvas no IndexedDB do navegador, junto do projeto, e acompanham o JSON.', 'As análises são salvas no servidor junto do projeto e acompanham sua exportação JSON.')
    .replaceAll('Salvar projeto no navegador', 'Salvar projeto no servidor');
  for (const [name, view] of Object.entries(UI.views)) {
    if (typeof view.render !== 'function') continue;
    const render = view.render;
    view.render = (...args) => {
      const html = saasText(render.apply(view, args));
      if (name !== 'manual') return html;
      return '<section class="panel"><h3>Como funciona esta versão SaaS</h3><p>Seus orçamentos, análises de risco e cadastros próprios são privados e são gravados no servidor. O catálogo SICRO e a biblioteca PEM são compartilhados; alterações próprias não modificam as referências oficiais.</p><p>Cada projeto conserva sua UF, referência e histórico. Para trocar a referência, compare os custos em Meus orçamentos → Versões e migração e confirme a alteração. Se duas abas editarem a mesma versão, o programa preserva o rascunho e permite salvar uma cópia.</p><button class="btn" data-act="openProjects">Meus orçamentos e versões</button></section>' + html;
    };
  }
  const fileMenu = UI.act.fileMenu;
  UI.act.fileMenu = (...args) => {
    fileMenu(...args); const pop = document.querySelector('.pop'); if (!pop) return;
    for (const [action, text] of [['infraVersions', 'Histórico de versões'], ['infraRecover', 'Recuperar rascunho local'], ['infraConflictCopy', 'Salvar alterações como cópia']]) {
      const button = document.createElement('button'); button.dataset.act = action; button.textContent = text; pop.appendChild(button);
    }
  };
  UI.act.infraVersions = () => navigate(`/orcapro-infraestrutura/gerenciar?versoes=${state.project.id}`);
  UI.act.infraRecover = () => { if (!state.recoveryDraft) return UI.toast('Não há rascunho pendente.', 'warn'); A.pj = clone(state.recoveryDraft); N.hydrate(A.pj); A.model = null; UI.render(); UI.toast('Rascunho recuperado. Revise e salve como cópia se existir conflito de versão.', 'warn'); };
  UI.act.infraConflictCopy = async () => {
    checkEditors();
    const data = projectData(O), created = await request(`/infraestrutura/projects`, { method: 'POST', body: JSON.stringify({ cycleId: state.project.cycleId, name: data.name + ' — cópia', uf: data.uf, regime: data.rg, data }) });
    // The new project is already confirmed by the server. The old conflicting version cannot be flushed.
    await navigate('/orcapro-infraestrutura/editor?id=' + encodeURIComponent(created.id), true);
  };
  window.addEventListener('beforeunload', event => { if (state.saving || state.error || state.conflict || edits.size || JSON.stringify(projectData(O)) !== state.lastSaved) { event.preventDefault(); event.returnValue = ''; } });
}
const config = window.ORCAPRO_INFRA_CONFIG = { prepare, loadSnapshot: snapshot, loadPem: pem, installAdapter, afterModules };
