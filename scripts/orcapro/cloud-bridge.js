function installOrcaProCloud(API_BASE) {
  'use strict';
  const O = window.OP, A = O.app, UI = O.ui, N = O.register, U = O.util;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const projectId = new URLSearchParams(location.search).get('project');
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const state = O.cloud = { access: null, wrapper: null, raw: null, ready: false,
    saving: false, conflict: false, lastSaved: '', error: null, catalog: {}, publication: null, historicalFixedCodes: [], libraryVersions: {} };
  let refreshPromise = null, saveChain = Promise.resolve();

  function notifyParent(status, message = '') {
    if (window.parent !== window && typeof window.parent?.postMessage === 'function') {
      window.parent.postMessage({ type: 'orcapro-save', status, message }, location.origin);
    }
  }

  state.safeUrl = (value) => {
    try { const url = new URL(String(value || ''), location.origin);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? U.esc(url.href) : '#';
    } catch { return '#'; }
  };

  async function request(route, options = {}, retry = true) {
    if (!route.startsWith('/') || route.startsWith('//')) throw new Error('Rota inválida.');
    const response = await fetch(API_BASE + route, { ...options, credentials: 'include', cache: 'no-store',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    if (response.status === 401 && retry) {
      if (!refreshPromise) refreshPromise = fetch(API_BASE + '/auth/refresh', {
        method: 'POST', credentials: 'include', cache: 'no-store',
      }).then((r) => r.ok).catch(() => false).finally(() => { refreshPromise = null; });
      if (await refreshPromise) return request(route, options, false);
    }
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const error = new Error(Array.isArray(details.message) ? details.message.join(' ') :
        details.message || `Falha na solicitação (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  function projectDocument() {
    N.snapshot();
    const data = clone(A.pj);
    data.id = projectId;
    data.sinapiReferenceId = state.wrapper.referenceId;
    for (const record of data.catalog?.compositions || []) stampOrigin(record);
    return data;
  }

  function stampOrigin(record) {
    if (/^\d+$/.test(String(record.base)) && !record.origin_reference_id) {
      record.origin_type = 'SINAPI'; record.origin_code = String(record.base);
      record.origin_reference_id = state.wrapper.referenceId;
    }
    return record;
  }

  async function refreshLibrary() {
    const [inputs, compositions] = await Promise.all([
      request('/orcapro/custom-inputs'), request('/orcapro/custom-compositions'),
    ]);
    N.library = { inputs: inputs.map(row => clone(row.data)), compositions: compositions.map(row => clone(row.data)) };
    state.libraryVersions = Object.fromEntries([
      ...inputs.map(row => ['I:' + row.code, { id: row.id, revision: row.revision }]),
      ...compositions.map(row => ['C:' + row.code, { id: row.id, revision: row.revision }]),
    ]);
  }

  function reportError(error) {
    state.error = error;
    A.saveError = true;
    if (error.status === 409) state.conflict = true;
    notifyParent(state.conflict ? 'conflict' : 'error', error.message);
    if (A.pj) UI.renderNav();
  }

  async function persist(document) {
    if (!state.ready || !state.wrapper) throw new Error('O projeto ainda não foi autenticado.');
    if (document.id !== projectId) throw new Error('Abra outro projeto pelo portal OrçaPro.');
    const data = clone(document);
    data.sinapiReferenceId = state.wrapper.referenceId;
    const signature = JSON.stringify(data);
    const operation = saveChain.catch(() => undefined).then(async () => {
      if (state.conflict) throw state.error;
      if (signature === state.lastSaved) return clone(state.wrapper);
      state.saving = true;
      notifyParent('saving');
      UI.renderNav();
      try {
        const saved = await request(`/orcapro/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({
          expectedVersion: state.wrapper.version, name: data.name, uf: data.uf, regime: data.rg,
          referenceId: state.wrapper.referenceId, data,
        }) });
        state.wrapper = saved;
        state.lastSaved = signature;
        state.error = null;
        A.saveError = false;
        notifyParent('saved');
        return clone(saved);
      } catch (error) {
        reportError(error);
        throw error;
      } finally {
        state.saving = false;
        UI.renderNav();
      }
    });
    saveChain = operation;
    return operation;
  }

  function mergeRaw(current, incoming) {
    if (current.ref !== incoming.ref || current.ufs.join('|') !== incoming.ufs.join('|')) {
      throw new Error('O catálogo recebido não corresponde à referência do projeto.');
    }
    const raw = clone(current);
    const dictionary = (name, value) => {
      let index = raw[name].indexOf(value);
      if (index < 0) { index = raw[name].length; raw[name].push(value); }
      return index;
    };
    const inputs = new Map(raw.ins.c.map((code, index) => [String(code), index]));
    incoming.ins.c.forEach((code, at) => {
      const exists = inputs.get(String(code));
      const index = exists === undefined ? raw.ins.c.length : exists;
      const fields = { c: code, k: dictionary('cls', incoming.cls[incoming.ins.k[at]]),
        d: incoming.ins.d[at], u: dictionary('un', incoming.un[incoming.ins.u[at]]),
        o: incoming.ins.o[at], p: clone(incoming.ins.p[at]) };
      for (const [key, value] of Object.entries(fields)) raw.ins[key][index] = value;
      if (incoming.ins.lab[code]) raw.ins.lab[code] = clone(incoming.ins.lab[code]);
      inputs.set(String(code), index);
    });
    const comps = new Map(raw.comp.c.map((code, index) => [String(code), index]));
    incoming.comp.c.forEach((code, at) => {
      const exists = comps.get(String(code));
      const index = exists === undefined ? raw.comp.c.length : exists;
      const group = dictionary('grupos', incoming.grupos[incoming.comp.g[at]]);
      raw.ct[group] = incoming.ct[incoming.comp.g[at]] || raw.ct[group] || '';
      const fields = { c: code, g: group, d: incoming.comp.d[at],
        u: dictionary('un', incoming.un[incoming.comp.u[at]]), s: incoming.comp.s[at],
        it: clone(incoming.comp.it[at]) };
      for (const [key, value] of Object.entries(fields)) raw.comp[key][index] = value;
      comps.set(String(code), index);
    });
    for (const [regime, values] of Object.entries(incoming.ovr || {})) {
      raw.ovr ||= {};
      raw.ovr[regime] = { ...(raw.ovr[regime] || {}), ...clone(values) };
    }
    return raw;
  }

  async function loadCodes(compositions = [], inputs = []) {
    const official = (code) => /^\d+$/.test(String(code));
    const missingC = compositions.filter((code) => official(code) && !A.base.comp(code));
    const missingI = inputs.filter((code) => official(code) && !A.base.ins(code));
    if (!missingC.length && !missingI.length) return;
    if (missingC.length + missingI.length > 500) {
      const entries = [...missingC.map(code => ({ type: 'C', code })), ...missingI.map(code => ({ type: 'I', code }))];
      for (let index = 0; index < entries.length; index += 500) {
        const chunk = entries.slice(index, index + 500);
        await loadCodes(chunk.filter(row => row.type === 'C').map(row => row.code), chunk.filter(row => row.type === 'I').map(row => row.code));
      }
      return;
    }
    const query = new URLSearchParams({ referenceId: state.wrapper.referenceId, uf: A.pj.uf, regime: A.pj.rg });
    if (missingC.length) query.set('codes', missingC.join(','));
    if (missingI.length) query.set('inputCodes', missingI.join(','));
    const bundle = await request('/orcapro/catalog/bundle?' + query);
    if (bundle.referenceId !== state.wrapper.referenceId) throw new Error('Referência do catálogo divergente.');
    state.raw = mergeRaw(state.raw, bundle.raw);
    A.base = N.makeBase(state.raw, state.wrapper.referenceId, A.inputs, A.customs, A.pj.sinapiPriceQuotes || []);
    A.model = null;
    O.iva.invalidate();
  }

  async function useLibrary(type, code) {
    const existing = (type === 'I' ? A.inputs : A.customs).find(row => row.code === code);
    if (existing) return existing; // Project revisions never adopt a new library revision implicitly.
    const pending = { inputs: [], compositions: [] }, done = new Set(), officialC = new Set(), officialI = new Set();
    const stack = [{ type, code }];
    while (stack.length) {
      const next = stack.pop(), key = next.type + ':' + next.code;
      if (done.has(key)) continue; done.add(key);
      if (/^\d+$/.test(String(next.code))) {
        (next.type === 'I' ? officialI : officialC).add(next.code); continue;
      }
      const kind = next.type === 'I' ? 'inputs' : 'compositions', local = next.type === 'I' ? A.inputs : A.customs;
      const record = local.find(row => row.code === next.code) || N.library[kind].find(row => row.code === next.code);
      if (!record) throw new Error('Dependência ausente na biblioteca privada: ' + next.code);
      if (!local.some(row => row.code === next.code)) pending[kind].push(clone(record));
      if (next.type === 'C' && record.mode !== 'quoted') for (const item of record.items || []) stack.push(item);
    }
    await loadCodes([...officialC], [...officialI]);
    A.inputs.push(...pending.inputs); A.customs.push(...pending.compositions);
    N.rebuild(); N.snapshot(); A.pj.updated = Date.now();
    await persist(projectDocument());
    return (type === 'I' ? A.inputs : A.customs).find(row => row.code === code);
  }

  UI.act.cloudLibrary = async (element) => {
    try {
      await refreshLibrary();
      const type = element?.dataset.type || (A.view === 'inputs' ? 'I' : 'C');
      const list = N.library[type === 'I' ? 'inputs' : 'compositions'];
      const local = type === 'I' ? A.inputs : A.customs;
      UI.modal('Biblioteca privada — ' + (type === 'I' ? 'insumos' : 'composições'),
        '<p>Cada projeto preserva a revisão adotada. Incluir um cadastro também inclui suas dependências próprias. Cadastros já presentes conservam sua revisão neste projeto.</p>' +
        `<div class="tblw"><table class="tbl sm"><thead><tr><th>Código</th><th>Descrição</th><th>Unid.</th><th>Revisão na biblioteca</th><th></th></tr></thead><tbody>${list.map(row => `<tr><td>${U.esc(row.code)}</td><td>${U.esc(row.desc)}</td><td>${U.esc(row.unit)}</td><td>${U.esc(state.libraryVersions[type + ':' + row.code]?.revision ?? row.revision ?? 1)}</td><td>${local.some(item => item.code === row.code) ? 'Presente no projeto' : `<button class="btn sm" data-act="cloudLibraryUse" data-type="${type}" data-code="${U.esc(row.code)}">Usar neste projeto</button>`}</td></tr>`).join('') || '<tr><td colspan="5">Nenhum cadastro publicado na sua biblioteca.</td></tr>'}</tbody></table></div>`, { wide: true });
    } catch (error) { UI.toast(error.message, 'warn'); }
  };
  UI.act.cloudLibraryUse = async (element) => {
    try { element.disabled = true; await useLibrary(element.dataset.type, element.dataset.code); UI.closeModal(); UI.render(); UI.toast('Revisão da biblioteca incluída neste projeto.'); }
    catch (error) { element.disabled = false; UI.toast(error.message, 'warn'); }
  };

  const groupLoads = new Map();
  async function loadGroup(group) {
    const key = state.wrapper.referenceId + ':' + group;
    if (!groupLoads.has(key)) groupLoads.set(key, (async () => {
      const codes = [];
      let page = 1, result;
      do {
        const query = new URLSearchParams({ referenceId: state.wrapper.referenceId, uf: A.pj.uf,
          regime: A.pj.rg, group, page: String(page), pageSize: '100' });
        result = await request('/orcapro/catalog/compositions?' + query);
        codes.push(...result.items.map(row => row.code)); page++;
      } while ((page - 1) * result.pageSize < result.total);
      await loadCodes(codes);
    })().catch(error => { groupLoads.delete(key); throw error; }));
    await groupLoads.get(key);
  }
  async function loadFamily(code) {
    await loadCodes([code]);
    const composition = A.base.comp(N.code(code));
    if (composition?.src === 'SINAPI' && composition.group) await loadGroup(composition.group);
  }
  const originalTreeOf = UI.act.treeOf, originalSwapItem = UI.act.swapItem;
  const originalPickGroup = UI.act.pickGroup;
  UI.act.pickGroup = async (element) => {
    try {
      const group = A.base.raw.grupos[Number(element.dataset.gi)];
      if (!group) throw new Error('Caderno indisponível. Use a consulta global.');
      UI.toast('Carregando as variantes do caderno…'); await loadGroup(group); originalPickGroup(element);
    } catch (error) { UI.toast(error.message, 'warn'); }
  };
  UI.act.treeOf = async (element) => {
    try {
      UI.toast('Carregando as variantes do caderno…'); await loadFamily(element.dataset.code);
      state.catalog.catalog ||= { q: '', page: 1 }; state.catalog.catalog.tree = true;
      originalTreeOf(element);
    } catch (error) { UI.toast(error.message, 'warn'); }
  };
  UI.act.swapItem = async (element) => {
    try { const node = O.engine.find(A.pj, element.dataset.id)?.node; if (!node) return;
      UI.toast('Carregando as variantes do caderno…'); await loadFamily(node.code); originalSwapItem(element);
    } catch (error) { UI.toast(error.message, 'warn'); }
  };

  const preferenceKeys = new Set(['theme', 'detailWidth14']);
  const preferenceId = (key) => `orcapro-pref:${state.access.tenantId}:${state.access.userId}:${key}`;
  const denied = () => Promise.reject(new Error('Esta operação pertence à administração global SINAPI.'));
  O.store.open = async () => true;
  O.store.persistent = () => state.ready;
  O.store.get = async (store, id) => {
    if (store === 'projects' && id === projectId) return clone(A.pj);
    if (store === 'settings' && preferenceKeys.has(id)) {
      try { const value = localStorage.getItem(preferenceId(id)); return value === null ? undefined : { id, v: JSON.parse(value) }; }
      catch { return undefined; }
    }
    throw new Error('Consulta não disponível neste editor. Use o portal OrçaPro.');
  };
  O.store.put = async (store, value) => {
    if (store === 'projects') return persist(value);
    if (store === 'custom' || store === 'inputs') {
      N.snapshot();
      return persist(projectDocument());
    }
    if (store === 'settings' && preferenceKeys.has(value.id)) {
      try { localStorage.setItem(preferenceId(value.id), JSON.stringify(value.v)); } catch { /* preference only */ }
      return value;
    }
    if (store === 'settings' && value.id === 'lastProject') return { id: value.id, v: projectId };
    return denied();
  };
  O.store.del = denied;
  O.store.all = async (store) => {
    if (store === 'custom') return clone(A.customs);
    if (store === 'inputs') return clone(A.inputs);
    if (store === 'projects') return [clone(A.pj)];
    return denied();
  };
  O.store.setting = async (key) => {
    if (!preferenceKeys.has(key)) return undefined;
    const value = await O.store.get('settings', key);
    return value?.v;
  };
  O.store.setSetting = async (key, value) => O.store.put('settings', { id: key, v: value });
  N.publish = async () => {
    N.snapshot();
    const saved = await persist(projectDocument());
    // Only the explicit register edit/import publishes a library revision.
    // Saving an old project or adapting a single occurrence preserves its snapshots.
    const publication = state.publication;
    if (publication) {
      const selected = (kind, list) => publication.mode === 'import' ? list.filter(row => !publication.before[kind].has(row.code)) : list.filter(row => publication[kind]?.includes(row.code));
      try {
        for (const [kind, route, list] of [['inputs', 'custom-inputs', A.inputs], ['compositions', 'custom-compositions', A.customs]]) {
          for (const record of selected(kind, list)) await request('/orcapro/' + route, {
            method: 'POST', body: JSON.stringify({ data: kind === 'compositions' ? stampOrigin(clone(record)) : clone(record) }),
          });
        }
        await refreshLibrary();
      } catch (error) {
        error.message = 'Projeto salvo, mas a biblioteca privada não foi atualizada: ' + error.message;
        reportError(error); throw error;
      }
    }
    return saved;
  };
  const originalSave = N.save;
  N.save = async (type, draft, options = {}) => {
    state.publication = options.budgetId ? null : { [type === 'I' ? 'inputs' : 'compositions']: [draft.code] };
    if (type === 'C') stampOrigin(draft);
    try {
      const result = await originalSave(type, draft, options);
      if (state.error) throw state.error; // The legacy implementation catches storage errors internally.
      return result;
    } finally { state.publication = null; }
  };
  const originalImportCatalog = N.importCatalog;
  function validateImportedCatalog(catalog) {
    if (!catalog || !Array.isArray(catalog.inputs) || !Array.isArray(catalog.compositions)) throw new Error('Catálogo próprio inválido.');
    if (catalog.inputs.length + catalog.compositions.length > 20000) throw new Error('Catálogo próprio excede o limite de registros.');
    const stack = [catalog]; let count = 0;
    while (stack.length) {
      const value = stack.pop(); if (!value || typeof value !== 'object') continue;
      if (++count > 200000) throw new Error('Catálogo próprio excede o limite de dados.');
      for (const [key, field] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Chave não permitida no catálogo próprio.');
        if (key === 'id' && (typeof field !== 'string' || !/^[A-Za-z0-9_@.:-]{1,160}$/.test(field))) throw new Error('Identificador inválido no catálogo próprio.');
        if (['revision', 'rev'].includes(key) && (!Number.isSafeInteger(field) || field < 0 || field > 1000000)) throw new Error('Revisão inválida no catálogo próprio.');
        if (key === 'url' && field && !/^https?:\/\//i.test(String(field))) throw new Error('URL não permitida no catálogo próprio.');
        if (field && typeof field === 'object') stack.push(field);
      }
    }
  }
  N.importCatalog = async (...args) => {
    validateImportedCatalog(args[0]); // Validate before the original importer changes app state or renders.
    state.publication = { mode: 'import', before: { inputs: new Set(A.inputs.map(row => row.code)), compositions: new Set(A.customs.map(row => row.code)) } };
    try {
      const result = await originalImportCatalog(...args);
      if (state.error) throw state.error;
      return result;
    } finally { state.publication = null; }
  };

  function conflictMessage() {
    if (!state.conflict) return '';
    return '<div class="alertbox"><b>Este projeto foi alterado em outra sessão.</b> Suas alterações continuam nesta tela. Exporte o JSON antes de reabrir a versão salva. <button class="btn sm" data-act="exportJSON">Exportar alterações JSON</button> <button class="btn sm" data-act="cloudReload">Reabrir versão salva</button></div>';
  }
  const renderNav = UI.renderNav;
  UI.renderNav = () => {
    if (!A.pj) return;
    renderNav();
    if (state.access?.role !== 'ADMIN') UI.$('[data-v="base"]')?.remove();
    const footer = UI.$('#sidef');
    if (footer) footer.innerHTML = `<b>SINAPI ${U.esc(A.base.raw.ref)}</b> · referência do projeto<br>${U.int(A.base.nComp)} composições carregadas sob demanda<br>${state.conflict ? 'CONFLITO — alterações ainda não salvas' : A.saveError ? 'FALHA AO SALVAR — exporte JSON' : state.saving ? 'Salvando na nuvem…' : 'Nuvem · versão ' + (state.wrapper?.version || '')}`;
  };
  const renderBudget = UI.views.budget.render;
  function historicalCostsMessage() {
    const codes = new Set(), stack = [A.pj.root];
    while (stack.length) {
      const node = stack.pop();
      if (node.kind === 'stage') stack.push(...(node.children || []));
      else if (Number.isFinite(node.custo) && (state.historicalFixedCodes.includes(String(node.code)) ||
        (node.fonte && U.norm(node.fonte) !== 'SINAPI' && /^\d+$/.test(String(node.code))))) codes.add(String(node.code));
    }
    return codes.size ? `<div class="alertbox"><b>Custos informados e históricos preservados.</b> Códigos ${U.esc([...codes].join(', '))}: estes valores provêm da memória/cotação do projeto; não representam preços SINAPI atuais para a UF selecionada. Confira fonte e memória antes de revisar.</div>` : '';
  }
  UI.views.budget.render = () => conflictMessage() + historicalCostsMessage() + renderBudget();
  UI.act.cloudReload = () => { if (confirm('Reabrir a versão do servidor? Exporte as alterações JSON para preservá-las antes de continuar.')) location.reload(); };
  UI.act.importBase = UI.act.useBase = UI.act.delBase = () => { throw new Error('A referência deste projeto é fixa. Publique e gerencie versões no portal administrativo.'); };
  UI.views.base = { render: () => `<div class="vh"><h1>Referência SINAPI do projeto</h1></div><div class="panel"><h3>SINAPI ${U.esc(state.raw.ref)}</h3><p>Este orçamento permanece vinculado à sua versão. Publicação e seleção de referência padrão pertencem à administração global. <a href="/orcapro/gerenciar" target="_top">Voltar ao portal OrçaPro</a></p></div>` };
  O.main.embeddedRaw = async () => { throw new Error('A referência é obtida do catálogo global autorizado.'); };
  O.main.useBase = () => { throw new Error('Troca de referência disponível somente pelo portal com revisão auditável.'); };
  O.main.openProject = () => { throw new Error('Abra os projetos privados pelo portal OrçaPro.'); };
  UI.act.newProject = UI.act.demo = UI.act.demo2 = UI.act.openProjects = UI.act.spLoadExample = () => { window.top.location.href = '/orcapro/gerenciar'; };
  UI.act.delPj = UI.act.openPj = () => { throw new Error('Gerencie projetos pelo portal OrçaPro.'); };
  UI.act.importJSON = () => UI.toast('A importação de projeto deve resolver a referência original no portal OrçaPro. O editor atual permanece aberto.', 'warn');
  O.exp.importJSON = N.importData = async () => { throw new Error('Importe o projeto no portal OrçaPro para validar documento e referência antes de abrir o editor.'); };
  const fileMenu = UI.act.fileMenu;
  UI.act.fileMenu = (element) => {
    fileMenu(element);
    const pop = UI.$('.pop');
    if (!pop) return;
    pop.querySelectorAll('[data-act="newProject"],[data-act="openProjects"],[data-act="demo"],[data-act="demo2"],[data-act="importJSON"]').forEach((el) => el.remove());
    pop.insertAdjacentHTML('afterbegin', '<a class="btn ghost" href="/orcapro/gerenciar" target="_top">Projetos no portal OrçaPro</a>');
  };

  async function catalogPage(kind, query, page = 1) {
    const params = new URLSearchParams({ referenceId: state.wrapper.referenceId, uf: A.pj.uf,
      regime: A.pj.rg, search: query, page: String(page), pageSize: '35' });
    return request(`/orcapro/catalog/${kind}?${params}`);
  }
  const description = (row) => row.description || row.desc || '';
  const cost = (row) => row.costCents ?? row.priceCents ?? (row.cost == null ? null : Math.round(Number(row.cost) * 100));
  function catalogRows(data, kind, mode = '') {
    if (!data.items.length) return '<p class="note">Nenhum resultado nesta referência.</p>';
    return `<div class="tblw"><table class="tbl sm"><thead><tr><th>Código</th><th>Descrição</th><th>Unidade</th><th class="r">Custo ${U.esc(A.pj.uf)}</th><th></th></tr></thead><tbody>${data.items.map((row) => `<tr><td><button class="lnk code" data-act="${kind === 'inputs' ? 'regInspectInput' : 'openComp'}" data-code="${U.esc(row.code)}">${U.esc(row.code)}</button></td><td>${U.esc(description(row))}</td><td>${U.esc(row.unit)}</td><td class="r">${UI.money(cost(row))}</td><td><button class="btn sm" data-act="${mode === 'resource' ? 'regResourceAdd' : kind === 'inputs' ? 'cloudAddInput' : 'quickAdd'}" data-type="${kind === 'inputs' ? 'I' : 'C'}" data-code="${U.esc(row.code)}">${mode === 'resource' ? 'Incluir' : 'Adicionar'}</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  let catalogSequence = 0;
  async function refreshCatalog(view) {
    const slot = UI.$('#cloudCatalogResults');
    if (!slot || !state.ready) return;
    const sequence = ++catalogSequence;
    const selection = state.catalog[view] || (state.catalog[view] = { q: '', page: 1 });
    slot.textContent = 'Consultando catálogo global…';
    try {
      const kind = view === 'inputs' ? 'inputs' : 'compositions';
      const result = await catalogPage(kind, selection.q, selection.page);
      if (sequence !== catalogSequence || !slot.isConnected) return;
      slot.innerHTML = `<p class="note">${U.int(result.total)} resultados no catálogo global · página ${result.page} · referência ${U.esc(state.raw.ref)}</p>` + catalogRows(result, kind) +
        `<div class="row"><button class="btn sm" data-act="cloudCatalogPrev" ${selection.page <= 1 ? 'disabled' : ''}>Anterior</button><button class="btn sm" data-act="cloudCatalogNext" ${result.page * result.pageSize >= result.total ? 'disabled' : ''}>Próxima</button></div>`;
    } catch (error) { if (sequence === catalogSequence) slot.innerHTML = `<p class="note">${U.esc(error.message)}</p>`; }
  }
  const ownViews = { inputs: UI.views.inputs, compositions: UI.views.compositions }, originalCatalogView = UI.views.catalog;
  for (const view of ['catalog', 'inputs', 'compositions']) UI.views[view] = {
    render: () => {
      const selection = state.catalog[view] || (state.catalog[view] = { q: '', page: 1 });
      if (view === 'catalog' && selection.tree) return '<div class="row"><button class="btn" data-act="cloudGlobalCatalog">Voltar à consulta global</button><span class="note">Árvores dos cadernos carregados. Para pesquisar todo o SINAPI, volte à consulta global.</span></div>' + originalCatalogView.render();
      if (selection.own && ownViews[view]) return '<div class="row"><button class="btn" data-act="cloudGlobalCatalog">Consultar catálogo global</button><button class="btn" data-act="cloudLibrary">Biblioteca privada</button><span class="note">Cadastros e recursos já carregados neste projeto.</span></div>' + ownViews[view].render();
      return `<div class="vh"><div><h1>${view === 'inputs' ? 'Insumos' : view === 'compositions' ? 'Composições' : 'Catálogo SINAPI'}</h1><p class="muted">Consulta global por código ou descrição. O analítico completo é carregado ao abrir/adicionar um recurso.</p></div>${view !== 'catalog' ? `<button class="btn" data-act="cloudOwnCatalog">Cadastros deste projeto</button><button class="btn" data-act="cloudLibrary">Biblioteca privada</button><button class="btn pri" data-act="regNew" data-type="${view === 'inputs' ? 'I' : 'C'}">Novo cadastro próprio</button>` : ''}</div><div class="panel"><input class="inp" style="width:100%" data-in="cloudCatalogSearch" data-fk="cloudCatalogSearch" placeholder="Código ou descrição…" value="${U.esc(selection.q)}"><div id="cloudCatalogResults"></div></div>`;
    }, after: () => {
      if (view === 'catalog' && state.catalog[view]?.tree) originalCatalogView.after?.(UI.$('#main'));
      else if (state.catalog[view]?.own && ownViews[view]?.after) ownViews[view].after(UI.$('#main'));
      else refreshCatalog(view);
    },
  };
  UI.inp.cloudCatalogSearch = (element) => {
    const view = A.view;
    const selection = state.catalog[view];
    selection.q = element.value; selection.page = 1;
    UI.later('cloud-catalog-search', () => refreshCatalog(view), 180);
  };
  UI.act.cloudCatalogPrev = () => { state.catalog[A.view].page--; refreshCatalog(A.view); };
  UI.act.cloudCatalogNext = () => { state.catalog[A.view].page++; refreshCatalog(A.view); };
  UI.act.cloudOwnCatalog = () => { state.catalog[A.view].own = true; UI.render(); };
  UI.act.cloudGlobalCatalog = () => { state.catalog[A.view].own = false; state.catalog[A.view].tree = false; UI.render(); };
  UI.act.cloudAddInput = (element) => UI.act.nativeInputAdd(element);
  let paletteSequence = 0;
  UI.palRender = async () => {
    const slot = UI.$('#palres'), sequence = ++paletteSequence;
    if (!slot) return;
    slot.textContent = 'Consultando catálogo global…';
    try {
      const result = await catalogPage('compositions', UI.pal.q, 1);
      const own = A.customs.filter(row => !row.archived && U.norm(row.code + ' ' + row.desc).includes(U.norm(UI.pal.q || '')))
        .map(row => ({ ...row, description: row.desc, costCents: A.base.compCost(row.code, A.pj.uf, A.pj.rg) }));
      if (sequence === paletteSequence && slot.isConnected) slot.innerHTML = catalogRows({ items: [...own, ...result.items] }, 'compositions');
    } catch (error) { if (sequence === paletteSequence) slot.textContent = error.message; }
  };
  let resourceSequence = 0;
  async function resourceSearch() {
    const editor = N.editor, slot = UI.$('#regResourceResults'), sequence = ++resourceSequence;
    if (!editor || !slot) return;
    if (!editor.q?.trim()) { slot.textContent = 'Digite o código ou a descrição do recurso.'; return; }
    slot.textContent = 'Consultando catálogo global…';
    try {
      const kind = editor.findType === 'I' ? 'inputs' : 'compositions';
      const result = await catalogPage(kind, editor.q, 1);
      const local = (editor.findType === 'I' ? A.inputs : A.customs).filter((row) =>
        U.norm(row.code + ' ' + row.desc).includes(U.norm(editor.q))).slice(0, 35);
      const own = local.map((row) => ({ ...row, description: row.desc, costCents: editor.findType === 'I' ?
        N.resolvePrice(row, A.base.raw, A.pj.uf, A.pj.rg).price : A.base.compCost(row.code, A.pj.uf, A.pj.rg) }));
      if (sequence === resourceSequence && slot.isConnected && N.editor === editor) slot.innerHTML = catalogRows({ items: [...own, ...result.items] }, kind, 'resource');
    } catch (error) { if (sequence === resourceSequence) slot.textContent = error.message; }
  }
  UI.inp.regResourceSearch = (element) => { N.editor.q = element.value; UI.later('cloud-resource-search', resourceSearch, 180); };
  UI.chg.regResourceType = (element) => { N.editor.findType = element.value; resourceSearch(); };
  // Capture unloaded references before any legacy delegated handler executes.
  document.addEventListener('click', async (event) => {
    const element = event.target.closest('[data-act][data-code]');
    if (!element || !state.ready || !/^\d+$/.test(element.dataset.code)) return;
    const action = element.dataset.act;
    const input = element.dataset.type === 'I' || ['regInspectInput', 'cloudAddInput'].includes(action);
    if (input ? A.base.ins(element.dataset.code) : A.base.comp(element.dataset.code)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      await loadCodes(input ? [] : [element.dataset.code], input ? [element.dataset.code] : []);
      if (typeof UI.act[action] !== 'function') throw new Error('Ação indisponível.');
      await UI.act[action](element, event);
    } catch (error) { UI.toast(error.message, 'warn'); }
  }, true);
  window.addEventListener('beforeunload', (event) => {
    if (state.ready && (state.saving || state.conflict || JSON.stringify(projectDocument()) !== state.lastSaved)) {
      event.preventDefault(); event.returnValue = '';
    }
  });

  function legalGate() {
    const gate = document.getElementById('legalGate'), app = document.getElementById('app');
    const checkbox = document.getElementById('legalAccept'), button = document.getElementById('legalEnter');
    app.inert = true; gate.hidden = false; gate.style.display = 'grid';
    checkbox.checked = false; button.disabled = true;
    checkbox.onchange = checkbox.oninput = () => { button.disabled = !checkbox.checked; };
    button.onclick = () => { if (!checkbox.checked) return; gate.hidden = true; gate.style.display = 'none';
      document.body.classList.remove('gate-open'); app.inert = false; O.main.legalAccepted = true;
      UI.$('#nav button')?.focus(); };
    checkbox.focus();
  }
  async function boot() {
    if (!projectId || !uuid.test(projectId)) throw new Error('Abra um projeto válido pelo portal OrçaPro.');
    state.access = await request('/orcapro/access');
    if (!state.access.enabled) throw new Error('O acesso ao OrçaPro não está ativo para esta conta.');
    const context = await request(`/orcapro/projects/${projectId}/context`);
    if (context.project.id !== projectId || !context.project.referenceId || !context.raw) throw new Error('Contexto do projeto inválido.');
    state.wrapper = context.project; state.raw = context.raw;
    state.historicalFixedCodes = (context.historicalFixedCodes || []).map(String);
    A.pj = clone(context.project.data);
    A.pj.id = projectId; A.pj.sinapiReferenceId = context.project.referenceId;
    A.pj.uf = context.project.uf; A.pj.rg = context.project.regime;
    O.engine.fix(A.pj);
    A.inputs = []; A.customs = [];
    await refreshLibrary();
    A.pj.catalog ||= { v: 1, inputs: [], compositions: [] };
    A.base = N.makeBase(state.raw, context.project.referenceId, [], []);
    N.hydrate(A.pj);
    A.model = null; A.view = 'budget'; A.sel = {};
    state.ready = true;
    state.lastSaved = JSON.stringify(projectDocument());
    UI.injectFonts(); UI.bind();
    const theme = await O.store.setting('theme'); if (theme) document.documentElement.dataset.theme = theme;
    await O.basic.loadWidth();
    UI.render(); document.getElementById('boot')?.remove();
    legalGate();
    notifyParent('saved');
  }
  state.request = request; state.persist = persist; state.mergeRaw = mergeRaw; state.loadCodes = loadCodes;
  state.refreshLibrary = refreshLibrary; state.useLibrary = useLibrary;
  state.loadGroup = loadGroup;
  if (document.getElementById('app')) boot().catch((error) => {
    state.error = error;
    notifyParent('error', error.message);
    const bootElement = document.getElementById('boot');
    if (bootElement) bootElement.innerHTML = `<div style="max-width:580px;text-align:center"><h2>OrçaPro</h2><p>${U.esc(error.message)}</p><a href="${error.status === 401 ? '/login?next=/orcapro' : '/orcapro/gerenciar'}" target="_top">Voltar ao portal</a></div>`;
  });
}
