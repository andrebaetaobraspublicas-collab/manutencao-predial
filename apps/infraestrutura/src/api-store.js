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
async function cycleSnapshot(id) {
  const key = `cycle:${id}`;
  const cached = await local('catalog', key).catch(() => null);
  // Authorization is checked on every load, including 304; cache never grants access.
  const result = await request(`/infraestrutura/cycles/${id}/snapshot`, { headers: cached?.etag ? { 'If-None-Match': cached.etag } : {} });
  if (result.notModified) { if (!cached?.raw) throw new Error('O cache da referência SICRO está incompleto.'); return clone(cached.raw); }
  await local('catalog', key, { etag: result.etag, raw: result.raw }).catch(() => {});
  return result.raw;
}
async function snapshot() { const raw = await cycleSnapshot(state.project.cycleId); state.catalogHash = await digest(raw); return raw; }
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
      return '<section class="panel"><h3>UF, data-base e preços no SaaS</h3><p>Seus orçamentos, análises de risco e cadastros próprios são privados e são gravados no servidor. SICRO e PEM são catálogos globais; alterações próprias não modificam referências oficiais.</p><ol><li>Nos menus <b>Catálogo SICRO, Insumos e Composições</b>, UF, data-base e regime selecionam apenas a consulta. Os valores são referenciais, sem DMT/FIT ou ajustes de FIC da obra; o orçamento permanece na sua referência. Ao adicionar um código, seu custo usa a referência do orçamento.</li><li>Para atualizar toda a obra, abra o menu <b>Orçamento</b> e selecione UF/data-base. Confira o comparativo de custo direto, preço com BDI e crédito estimado de IVA. Abra a lista de serviços para revisar as diferenças. Cancelar conserva a referência atual.</li><li>Clique <b>Aplicar ao orçamento</b> para criar uma versão e recarregar toda a estrutura analítica e seus preços. Custos unitários, recursos e créditos de IBS/CBS passam a usar o novo contexto; não há desconto automático dos créditos no preço.</li><li>Revise cotações próprias, custos manuais, DMT/FIT/FIC e análises de risco. Valores próprios vinculados a outra UF/mês não são transferidos. Preços ausentes bloqueiam a atualização.</li><li>Para comparar sem alterar, abra uma composição e escolha <b>Preços por UF</b>. A aba mostra custos referenciais sem BDI e sem ajustes da obra, para cada estado na mesma data-base e regime. Clique num estado para consultar seu catálogo; isso não migra o orçamento. O custo SD publicado é lido diretamente. Analíticos e custos CD usam o motor original somente para as composições consultadas e suas auxiliares.</li></ol><p><b>Ano do IVA</b> é o ano do cenário tributário (2026–2033), distinto da <b>data-base SICRO</b> dos preços. Histórico: Arquivo → Histórico de versões. Duas abas editando a mesma versão geram conflito, sem perda silenciosa.</p><button class="btn" data-act="openProjects">Meus orçamentos e versões</button></section>' + html;
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
  installReferences(O, checkEditors);
  window.addEventListener('beforeunload', event => { if (state.saving || state.error || state.conflict || edits.size || JSON.stringify(projectData(O)) !== state.lastSaved) { event.preventDefault(); event.returnValue = ''; } });
}
const config = window.ORCAPRO_INFRA_CONFIG = { prepare, loadSnapshot: snapshot, loadPem: pem, installAdapter, afterModules };

// Each immutable cycle is one UF/month; never relabel SP's price vector.
function consultationPricing(base) {
  if (!base.nComp) return base;
  // Report SD totals are already stored. Analytical/CD queries use the original
  // exact arithmetic, visiting only the requested composition and its auxiliaries.
  // This instance belongs exclusively to consultation; budget tables stay intact.
  const tables = new Map();
  base.costTable = (_uf, regime) => {
    const rg = regime === 'CD' ? 'CD' : 'SD';
    if (tables.has(rg)) return tables.get(rg);
    const n = base.nComp, done = new Uint8Array(n), cost = Array(n).fill(null), detail = Array(n).fill(null);
    const ensure = seed => {
      const stack = [seed];
      while (stack.length) {
        const j = stack.at(-1);
        if (done[j] === 2) { stack.pop(); continue; }
        done[j] = 1;
        let pending = false;
        for (const d of base._deps(j, true)) if (d >= 0 && done[d] === 0) { stack.push(d); pending = true; }
        if (pending) continue;
        const r = base._calc(j, rg, d => d >= 0 && done[d] === 2 ? cost[d] : null, true);
        detail[j] = r; cost[j] = r ? Number(r.totalC) : null; done[j] = 2; stack.pop();
      }
    };
    const vector = (values, analytic) => new Proxy(values, { get(target, prop, receiver) {
      if (typeof prop === 'string' && /^(0|[1-9]\d*)$/.test(prop) && +prop < n) {
        const j = +prop;
        if (!analytic && rg === 'SD') return base.raw.comp.o[j] ?? null;
        ensure(j);
      }
      return Reflect.get(target, prop, receiver);
    } });
    const table = { cost: vector(cost, false), as: Array(n).fill(0), detail: vector(detail, true) };
    tables.set(rg, table); return table;
  };
  return base;
}
function installReferences(O, checkEditors) {
  const A = O.app, UI = O.ui, U = O.util;
  const month = value => /^\d{4}-\d{2}$/.test(value || '') ? value : O.register.month(value);
  const label = ref => ref ? `${ref.slice(5)}/${ref.slice(0, 4)}` : '—';
  const current = () => state.cycles.find(c => c.id === state.project.cycleId) || { id: state.project.cycleId, uf: A.pj?.uf, ref: month(A.base?.raw.ref) };
  const choices = () => {
    const result = new Map();
    // API order puts the latest published revision first for each UF/month.
    for (const c of state.cycles) if (c.status === 'PUBLISHED' && !result.has(`${c.uf}:${c.ref}`)) result.set(`${c.uf}:${c.ref}`, c);
    const active = current(); if (active.ref) result.set(`${active.uf}:${active.ref}`, active);
    return [...result.values()];
  };
  state.referenceChoices = choices;
  const consultationViews = new Set(['catalog', 'inputs', 'compositions']);
  const consulting = () => consultationViews.has(A.view);
  const consultation = state.consultation = { cycle: null, base: null, project: null, signature: '', loading: false };
  const selected = () => consulting() ? consultation.cycle || current() : current();
  const bases = new Map();
  const ownKey = () => JSON.stringify([A.inputs || [], A.customs || []]);
  const makeConsultationBase = (raw, cycle) => consultationPricing(O.register.makeBase(clone(raw), cycle.id, A.inputs || [], A.customs || [], []));
  let frame = null, selectionRun = 0, budgetSource = false;
  const withBudget = fn => {
    if (!frame) return fn();
    const old = { base: A.base, pj: A.pj };
    A.base = frame.base; A.pj = frame.pj;
    try { return fn(); } finally { frame.base = A.base; frame.pj = A.pj; A.base = old.base; A.pj = old.pj; }
  };
  const withConsultation = fn => {
    if (!consulting() || O.register.editor || budgetSource) return fn();
    if (frame) {
      const old = { base: A.base, pj: A.pj }; A.base = consultation.base; A.pj = consultation.project;
      try { return fn(); } finally { A.base = old.base; A.pj = old.pj; }
    }
    const cycle = consultation.cycle || current(), signature = ownKey();
    if (!consultation.base || consultation.signature !== signature) {
      const raw = consultation.base?.officialRaw || A.base?.officialRaw || A.base?.raw;
      if (!raw?.comp) return fn();
      consultation.base = makeConsultationBase(raw, cycle); consultation.signature = signature;
    }
    const contextKey = JSON.stringify([A.pj.iva, A.pj.calendar, A.pj.bdi, A.pj.rg]);
    if (!consultation.project || consultation.contextKey !== contextKey) {
      consultation.project = clone(A.pj); consultation.contextKey = contextKey;
    }
    consultation.project.uf = cycle.uf; consultation.project.rg = consultation.regime || A.pj.rg;
    frame = { base: A.base, pj: A.pj };
    A.base = consultation.base; A.pj = consultation.project;
    try { return fn(); } finally { A.base = frame.base; A.pj = frame.pj; frame = null; }
  };
  state.withConsultation = withConsultation;
  // Render/read scopes are synchronous. Saves, edits and the complete budget model
  // always see the real project, even when requested by a consultation component.
  for (const name of ['render', 'renderNav', 'commit', 'saveSoon']) {
    const original = UI[name]; if (original) UI[name] = (...args) => withBudget(() => original(...args));
  }
  const model = UI.model; let budgetModel;
  if (model) UI.model = (...args) => withBudget(() => {
    const signature = JSON.stringify(A.pj.iva);
    // The legacy IVA module has one active DB. Reusing the already decorated
    // budget model avoids rebuilding all budget credits while browsing another DB.
    if (consulting() && budgetModel?.model === A.model && budgetModel.base === A.base && budgetModel.project === A.pj && budgetModel.signature === signature) return budgetModel.model;
    const result = model(...args);
    budgetModel = { model: result, base: A.base, project: A.pj, signature: JSON.stringify(A.pj.iva) }; return result;
  });
  const notice = () => `<div class="notice" style="margin-bottom:12px"><b>Consulta SICRO ${U.esc(selected().uf)} ${label(selected().ref)}</b> · valores referenciais, sem DMT/FIT ou ajustes de FIC da obra. <b>Orçamento: ${U.esc(current().uf)} ${label(current().ref)}</b>. Consultar não altera o orçamento; adicionar um serviço usa a referência do orçamento.</div>`;
  for (const name of consultationViews) {
    const view = UI.views[name]; if (!view) continue;
    const render = view.render, after = view.after;
    view.render = (...args) => {
      const html = withConsultation(() => render(...args));
      return name === 'catalog' ? html.replace(/(<section class="catc"[^>]*>)/, '$1' + notice()) : notice() + html;
    };
    if (after) view.after = (...args) => withConsultation(() => after(...args));
  }
  for (const [group, names] of [[UI.act, ['pickFam', 'treeReset', 'fpick', 'treeOf', 'regPage', 'regCSV', 'regInspectInput', 'ivaIns']], [UI.chg, ['regFilter']]]) {
    for (const name of names) { const original = group?.[name]; if (original) group[name] = (...args) => withConsultation(() => original(...args)); }
  }
  const later = UI.later;
  UI.later = (key, fn, delay) => later(key, key === 'register-filter' ? () => withConsultation(fn) : fn, delay);
  const results = O.catalog?.resultsHTML;
  if (results) O.catalog.resultsHTML = (...args) => A.target ? withBudget(() => results(...args)) : withConsultation(() => results(...args));
  // Capture just the source draft in consultation context; its editor and save
  // operate on the user's real catalog, without changing the budget reference.
  for (const name of ['cloneInput', 'cloneComp']) {
    const original = O.register[name]; if (original) O.register[name] = (...args) => withConsultation(() => original(...args));
  }
  const openBudget = O.register.openBudget;
  if (openBudget) O.register.openBudget = (...args) => {
    budgetSource = true; try { return withBudget(() => openBudget(...args)); } finally { budgetSource = false; }
  };
  for (const name of ['validateInput', 'validateComp']) {
    const original = O.register[name]; if (!original) continue;
    O.register[name] = (...args) => {
      const base = A.base; A.base = Object.assign(Object.create(base), { ufs: [...new Set(choices().map(c => c.uf))] });
      try { return original(...args); } finally { A.base = base; }
    };
  }
  const modal = UI.modal;
  UI.modal = (title, html, options) => {
    if (options?.registerEditor && O.register.editor) {
      const draft = O.register.editor.draft;
      html = html.replace(/(<select data-reg-field="(prices\.(\d+)\.uf|quoteUF)"[^>]*>)[\s\S]*?(<\/select>)/g, (_all, start, field, index, end) => {
        const value = field === 'quoteUF' ? draft.quoteUF || '*' : draft.prices[index].uf;
        return start + ['*', ...new Set(choices().map(c => c.uf))].sort().map(uf => `<option value="${uf}" ${uf === value ? 'selected' : ''}>${uf === '*' ? 'Todas as UFs' : uf}</option>`).join('') + end;
      });
    }
    return modal(title, html, options);
  };
  for (const name of ['quickAdd', 'nativeInputAdd', 'addFromCard']) {
    const original = UI.act[name]; if (!original) continue;
    UI.act[name] = (...args) => withBudget(() => {
      const code = UI.code(args[0].dataset.code), found = name === 'nativeInputAdd' ? A.base.ins(code) : A.base.comp(code);
      if (!found) return UI.toast('Este código não existe na referência do orçamento. Atualize a referência no menu Orçamento antes de adicioná-lo.', 'warn');
      if (consulting() && selected().id !== current().id) UI.toast(`Adicionado/selecionado usando SICRO ${current().uf} ${label(current().ref)}, referência do orçamento.`);
      return original(...args);
    });
  }
  const consult = async target => {
    if (!target) return;
    if (O.register.editor) throw new Error('Salve ou cancele o cadastro próprio aberto antes de mudar a consulta.');
    const token = ++selectionRun; consultation.loading = true; UI.renderTop?.();
    try {
      const raw = await cycleSnapshot(target.id);
      if (token !== selectionRun) return;
      if (raw.ufs?.length !== 1 || raw.ufs[0] !== target.uf || month(raw.ref) !== target.ref) throw new Error('Snapshot divergente da UF/data-base.');
      const key = target.id + ownKey();
      let base = bases.get(key);
      if (!base) { base = makeConsultationBase(raw, target); bases.set(key, base); if (bases.size > 3) bases.delete(bases.keys().next().value); }
      consultation.cycle = target; consultation.base = base; consultation.signature = ownKey(); consultation.project = null;
      A.drawer = null;
      const drawer = document.getElementById('drawer'); if (drawer) { drawer.hidden = true; drawer.innerHTML = ''; }
      A.sel ||= {}; A.trees ||= {}; A.sel.gi = null; A.sel.fam = null; A.trees.main = null;
      UI.render();
    } finally { if (token === selectionRun) { consultation.loading = false; UI.renderTop?.(); } }
  };
  state.consultReference = consult;
  let pending = null, busy = false;
  const change = async target => {
    if (A.view !== 'budget') { UI.toast('Atualize UF e data-base pelo menu Orçamento. As demais telas são consultas.', 'warn'); return; }
    if (!target || target.id === state.project.cycleId || busy) return;
    checkEditors(); busy = true; pending = null;
    try {
      await state.flush();
      UI.modal('Comparando referências SICRO', '<p role="status">Calculando custos e créditos de IVA com o motor do orçamento…</p>', { wide: true });
      const preview = await request(`/infraestrutura/projects/${state.project.id}/migrate-cycle`, { method: 'POST', body: JSON.stringify({ cycleId: target.id, version: state.project.version, dryRun: true }) });
      const r = preview.report, money = UI.money, old = current();
      const absent = r.items.filter(x => x.newUnitCostCents == null || x.newDirectCents == null);
      const credit = v => v ? money(v.creditCents) + (v.complete ? '' : ' · parcial') : '—';
      UI.modal('Atualizar UF e data-base do orçamento', `<p><b>SICRO ${U.esc(old.uf)} ${label(old.ref)} → ${U.esc(target.uf)} ${label(target.ref)}</b></p>
        <p>Todos os serviços referenciais serão recalculados. Quantidades, equipes, DMT, FIT, regras de FIC, BDI e premissas tributárias serão mantidos. Cotações próprias e custos informados manualmente continuam conforme suas memórias; preços próprios específicos de outra UF/mês não são transferidos.</p>
        <div class="tblw"><table class="tbl sm"><thead><tr><th>Comparativo</th><th class="r">Atual</th><th class="r">Nova referência</th></tr></thead><tbody>
        <tr><td>Custo direto</td><td class="r">${money(r.before.totals.direct)}</td><td class="r">${money(r.after.totals.direct)}</td></tr>
        <tr><td>Preço com BDI</td><td class="r">${money(r.before.totals.price)}</td><td class="r">${money(r.after.totals.price)}</td></tr>
        <tr><td>Crédito de IVA estimado</td><td class="r">${credit(r.before.iva)}</td><td class="r">${credit(r.after.iva)}</td></tr></tbody></table></div>
        <p class="note">Os créditos não são descontados automaticamente do preço. A confirmação cria uma versão auditável; análises de risco anteriores conservam sua fotografia e devem ser refeitas para a nova base.</p>
        ${absent.length ? `<div class="notice warn">${absent.length} serviço(s) sem custo na referência de destino. A atualização está bloqueada até resolver as pendências.</div>` : ''}
        <details><summary>Conferir ${r.items.length} serviços</summary><div class="tblw" style="max-height:340px"><table class="tbl sm"><thead><tr><th>Código / serviço</th><th class="r">Custo unit. atual</th><th class="r">Novo custo unit.</th><th class="r">Variação total</th></tr></thead><tbody>${r.items.map(x => `<tr><td><b>${U.esc(x.code)}</b> · ${U.esc(x.description)}</td><td class="r">${money(x.oldUnitCostCents)}</td><td class="r">${money(x.newUnitCostCents)}</td><td class="r">${money(x.deltaDirectCents)}</td></tr>`).join('')}</tbody></table></div></details>
        <div class="dr-a"><button class="btn" data-act="closeModal">Cancelar</button><button class="btn pri" data-act="infraApplyReference" ${absent.length ? 'disabled' : ''}>Aplicar ao orçamento</button></div>`, { wide: true, onClose: () => { pending = null; } });
      pending = preview;
    } catch (error) { UI.closeModal(); UI.toast(error.message, 'warn'); }
    finally { busy = false; UI.renderTop?.(); }
  };
  state.compareReference = change;
  UI.act.infraApplyReference = async () => {
    const preview = pending;
    if (!preview || busy) return;
    checkEditors(); busy = true;
    try {
      await state.flush();
      const saved = await request(`/infraestrutura/projects/${state.project.id}/migrate-cycle`, { method: 'POST', body: JSON.stringify({ cycleId: preview.targetCycleId, version: preview.version, dryRun: false, confirmationToken: preview.confirmationToken }) });
      state.project = saved; A.pj = clone(saved.data); state.lastSaved = JSON.stringify(saved.data); state.recoveryDraft = null;
      await local('drafts', draftId(), { data: saved.data, serverVersion: saved.version, at: Date.now(), confirmed: true }).catch(() => {});
      status('saved'); pending = null; clearTimeout(timer);
      // Replace PEM and every tax/productivity/search cache atomically as well.
      window.location.reload();
    } catch (error) { pending = null; if (error.status === 409) UI.closeModal(); UI.toast(error.message, 'warn'); }
    finally { busy = false; }
  };
  const renderTop = UI.renderTop;
  UI.renderTop = () => {
    withBudget(() => renderTop?.());
    const top = document.getElementById('top'), active = selected(), available = choices();
    if (!top) return;
    const select = top.querySelector('[data-ch="uf"]'); if (!select) return;
    select.dataset.ch = 'infraUF'; select.setAttribute('aria-label', consulting() ? 'UF da consulta SICRO' : 'UF do orçamento');
    select.innerHTML = [...new Set(available.filter(c => c.ref === active.ref).map(c => c.uf))].sort().map(uf => `<option ${uf === active.uf ? 'selected' : ''}>${U.esc(uf)}</option>`).join('');
    const refs = [...new Set(available.map(c => c.ref))].sort().reverse();
    const field = document.createElement('label'); field.className = 'fld sm';
    field.innerHTML = `<span>${consulting() ? 'Consulta' : 'Data-base'}</span><select data-ch="infraReference" aria-label="${consulting() ? 'Data-base da consulta SICRO' : 'Data-base do orçamento'}">${refs.map(ref => `<option value="${ref}" ${ref === active.ref ? 'selected' : ''}>${label(ref)}</option>`).join('')}</select>`;
    select.closest('label').before(field);
    top.querySelectorAll('[data-ch="infraUF"], [data-ch="infraReference"]').forEach(el => { el.disabled = busy || consultation.loading || !consulting() && A.view !== 'budget'; });
    const regime = top.querySelector('[data-ch="rg"]');
    if (consulting() && regime) { regime.dataset.ch = 'infraConsultRegime'; regime.value = consultation.regime || A.pj.rg; regime.setAttribute('aria-label', 'Regime da consulta SICRO'); }
  };
  const choose = (uf, ref, consultationOnly = false) => {
    const querying = consultationOnly || consulting();
    const target = choices().find(c => c.uf === uf && c.ref === ref);
    if (!target) {
      UI.renderTop?.(); const alternatives = choices().filter(c => c.ref === ref);
      if (alternatives.length) return UI.modal('Selecionar UF da nova data-base', `<p>SICRO ${label(ref)} ainda não está publicado para ${U.esc(uf)}. ${querying ? 'Escolha uma UF para consultar sem alterar o orçamento.' : 'Escolha uma UF para comparar; o orçamento permanece até confirmar.'}</p><div class="dr-a">${alternatives.map(c => `<button class="btn" data-act="infraSelectCycle" data-query="${querying ? '1' : '0'}" data-id="${c.id}">${U.esc(c.uf)}</button>`).join('')}</div>`, { wide: true });
      return UI.toast('Não há referência SICRO publicada para esta UF e data-base.', 'warn');
    }
    return querying ? consult(target) : change(target);
  };
  const safely = fn => Promise.resolve().then(fn).catch(e => { UI.toast(e.message, 'warn'); UI.renderTop?.(); });
  UI.chg ||= {};
  UI.chg.infraUF = el => safely(() => choose(el.value, selected().ref));
  UI.chg.infraReference = el => safely(() => choose(selected().uf, el.value));
  UI.chg.infraConsultRegime = el => { consultation.regime = el.value; UI.render(); };
  UI.chg.uf = UI.chg.infraUF;
  UI.act.setUF = el => safely(() => { const ref = selected().ref; A.view = 'catalog'; return choose(el.dataset.uf, ref, true); });
  UI.act.infraSelectCycle = el => safely(() => { UI.closeModal(); const c = choices().find(c => c.id === el.dataset.id); return el.dataset.query === '1' || consulting() ? consult(c) : change(c); });
  UI.act.useBase = () => { A.view = 'budget'; UI.render(); UI.toast('Selecione UF e data-base do orçamento e confira o comparativo antes de aplicar.'); };

  if (!O.drawer) return;
  const renderDrawer = O.drawer.render;
  const consultationDrawer = () => consulting() && A.drawer && !A.drawer.fromBudgetId && !A.drawer.ivaItemId;
  O.drawer.render = () => {
    if (consultationDrawer()) withConsultation(() => renderDrawer()); else withBudget(() => renderDrawer());
    const tabs = document.getElementById('drawer')?.querySelector('.tabs');
    if (tabs && !tabs.querySelector('[data-t="uf"]')) tabs.querySelector('[data-t="prod"]')?.insertAdjacentHTML('afterend', `<button class="tab ${A.drawer?.tab === 'uf' ? 'on' : ''}" data-act="drTab" data-t="uf">Preços por UF</button>`);
    const box = document.getElementById('drawer');
    if (box && consultationDrawer()) {
      box.querySelector('.dr-b')?.insertAdjacentHTML('afterbegin', notice());
      // Tax premises belong to the project. Inspection never edits that scenario.
      box.querySelectorAll('[data-iva-path], [data-iva-option], [data-iva-year]').forEach(el => { el.disabled = true; });
      box.querySelectorAll('[data-iva-action]').forEach(el => { if (!['export-memory', 'export-memory-json', 'export-years', 'print'].includes(el.dataset.ivaAction)) el.disabled = true; });
      if (A.drawer.tab === 'ivaprem') box.querySelector('.dr-b')?.insertAdjacentHTML('afterbegin', '<p class="note">Premissas somente para leitura nesta consulta. Edite o cenário do orçamento em Reforma Tributária.</p>');
    }
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-iva-action]');
    if (!button?.closest('#drawer') || !consultationDrawer()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (['export-memory', 'export-memory-json', 'export-years', 'print'].includes(button.dataset.ivaAction)) {
      withConsultation(() => O.iva.ui.actions(button.dataset.ivaAction)).catch(error => UI.toast(error.message, 'warn'));
    }
  }, true);
  const prices = new Map(); let run = 0;
  const keyFor = code => JSON.stringify([code, selected().ref, consulting() ? consultation.regime || A.pj.rg : A.pj.rg, ownKey()]);
  state.pricesByUF = async code => {
    const key = keyFor(code), cached = prices.get(key); if (cached) return cached;
    const token = ++run, entry = { key, code, rows: [], loading: true }; prices.clear(); prices.set(key, entry);
    const ref = selected().ref, regime = consulting() ? consultation.regime || A.pj.rg : A.pj.rg;
    const cycles = choices().filter(c => c.ref === ref).sort((a, b) => a.uf.localeCompare(b.uf));
    const redraw = () => { if (A.drawer?.tab === 'uf' && String(A.drawer.code) === String(code) && keyFor(code) === key) O.drawer.render(); };
    for (const cycle of cycles) {
      if (token !== run || keyFor(code) !== key) break;
      const row = { uf: cycle.uf, cycleId: cycle.id, value: null };
      try {
        const raw = await cycleSnapshot(cycle.id);
        if (!raw.ufs?.includes(cycle.uf) || raw.ufs.length !== 1 || month(raw.ref) !== cycle.ref) throw new Error('Snapshot divergente da UF/data-base.');
        const base = makeConsultationBase(raw, cycle);
        row.value = base.compCost(code, cycle.uf, regime);
        if (row.value == null) row.error = 'Composição ou preço ausente nesta referência';
      } catch (error) { row.error = error.message; }
      entry.rows.push(row); redraw();
    }
    entry.loading = false; redraw(); return entry;
  };
  O.drawer.tabs.uf = c => {
    const key = keyFor(c.code), entry = prices.get(key);
    if (!entry) { void state.pricesByUF(c.code); return '<p role="status">Consultando preços dos estados…</p>'; }
    const known = entry.rows.map(r => r.value).filter(v => v != null).sort((a, b) => a - b), max = known.at(-1), min = known[0];
    const median = known.length ? (known[Math.floor((known.length - 1) / 2)] + known[Math.floor(known.length / 2)]) / 2 : null;
    return `<div class="kv"><div><small>Mínimo</small><b>${UI.money(min)}</b></div><div><small>Mediana</small><b>${UI.money(median)}</b></div><div><small>Máximo</small><b>${UI.money(max)}</b></div></div>
      <p class="note">SICRO ${label(selected().ref)} · ${U.esc(O.sicro.REGIMES[A.pj.rg])} · custo unitário referencial sem BDI e sem DMT/FIT ou ajustes de FIC da obra. Próprias usam suas cotações por UF/data-base. Consultar esta aba não altera o orçamento.</p>
      ${entry.loading ? `<p role="status">Consultando estados: ${entry.rows.length}/${choices().filter(x => x.ref === selected().ref).length}…</p>` : ''}
      <div class="ufb">${entry.rows.map(row => `<button class="ufr ${row.uf === selected().uf ? 'on' : ''}" data-act="setUF" data-uf="${row.uf}" title="${U.esc(row.error || 'Consultar esta UF sem alterar o orçamento')}" style="width:100%"><span>${row.uf}</span><i style="width:${max && row.value != null ? (row.value / max * 100).toFixed(1) : 0}%"></i><b>${row.value == null ? 'Indisponível' : U.num(row.value / 100, 2)}</b></button>`).join('')}</div>
      <p class="note">Clique numa UF para consultar o catálogo desse estado. Para atualizar o orçamento, use seus seletores no menu Orçamento e confirme o comparativo. Valores indisponíveis não são substituídos pelos de SP.</p>`;
  };
}
