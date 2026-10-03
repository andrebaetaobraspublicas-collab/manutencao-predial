const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const H = require('./harness.cjs');
const projectId = '11111111-1111-4111-8111-111111111111', cycleId = '22222222-2222-4222-8222-222222222222';
const copy = value => structuredClone(value);
const source = fs.readFileSync(path.resolve(H.root, '../../scripts/infraestrutura/api-store.js'), 'utf8').replace('import.meta.env.VITE_API_BASE', "'http://fixture.invalid/api/v1'");

function memoryDb(storage = new Map()) {
  const db = {
    objectStoreNames: { contains: name => storage.has(name) },
    createObjectStore: name => storage.set(name, new Map()),
    transaction(name) {
      const tx = {};
      const values = storage.get(name);
      const operation = action => {
        const request = {};
        queueMicrotask(() => { request.result = action(); request.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()); });
        return request;
      };
      tx.objectStore = () => ({
        get: id => operation(() => copy(values.get(id))),
        put: row => operation(() => { values.set(row.id, copy(row)); return row.id; }),
        delete: key => { values.delete(key); },
        openCursor() {
          const request = {}, rows = [...values.entries()]; let index = 0;
          const step = () => { const row = rows[index++]; request.result = row ? { primaryKey: row[0], value: copy(row[1]), continue: () => queueMicrotask(step) } : null; request.onsuccess?.(); if (!row) queueMicrotask(() => tx.oncomplete?.()); };
          queueMicrotask(step); return request;
        },
      });
      return tx;
    },
  };
  return { open() { const request = { result: db }; queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.(); }); return request; } };
}

async function fixture(options = {}) {
  const ctx = options.context || H.context(), listeners = {}, messages = [], requests = [], storage = options.storage || new Map();
  const defaultData = { id: projectId, name: 'Orçamento de teste', uf: 'SP', rg: 'SD', root: { children: [] }, catalog: { v: 1, inputs: [], compositions: [] } };
  let project = { id: projectId, version: options.version || 1, cycleId, data: copy(options.data || defaultData) };
  let failNextProject = false, failNextOwn = false;
  const own = new Map();
  const parent = { postMessage: (message, origin) => messages.push({ message: copy(message), origin }) };
  Object.assign(ctx, { structuredClone, queueMicrotask, URLSearchParams, indexedDB: memoryDb(storage), location: { search: `?project=${projectId}`, origin: 'http://fixture.invalid' }, parent,
    top: { location: { assign: target => { ctx.navigated = target; } } }, OP_SOURCE_SHA256: 'calculation-engine-fixture-v1',
    addEventListener: (type, listener) => (listeners[type] ||= []).push(listener),
  });
  ctx.fetch = async (url, init = {}) => {
    const route = new URL(url).pathname.replace('/api/v1/infraestrutura', ''), method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ route, method, body, headers: init.headers || {} });
    const respond = (value, status = 200, headers) => new Response(status === 304 ? null : JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
    if (route === '/access') return respond({ enabled: true, userId: options.userId || 'user-1', tenantId: options.tenantId || 'tenant-1', role: 'USER', csrfToken: 'csrf-fixture' });
    if (route === '/cycles') return respond({ items: [{ id: cycleId }] });
    if (route === '/settings') return respond({});
    if (route.endsWith('/snapshot')) return respond(options.raw || { ufs: ['SP'], ref: '07/2026' }, 200, { ETag: '"fixture-v1"' });
    if (route.endsWith('/pem')) return respond(options.pem || { pem: [] });
    if (route === `/projects/${projectId}` && method === 'GET') return respond(project);
    if (method !== 'GET' && init.headers?.['X-Infra-CSRF'] !== 'csrf-fixture') return respond({ message: 'CSRF ausente' }, 403);
    if (route === `/projects/${projectId}` && method === 'PUT') {
      if (failNextProject || body.version !== project.version) { failNextProject = false; return respond({ message: 'Outro usuário alterou a versão.' }, 409); }
      project = { ...project, version: project.version + 1, data: body.data }; return respond(project);
    }
    if (route === '/projects' && method === 'POST') return respond({ id: '33333333-3333-4333-8333-333333333333', version: 1, cycleId, data: body.data });
    if (/^\/me\/(inputs|compositions)$/.test(route)) return respond({ items: [...own.values()].filter(row => route.includes(row.kind)) });
    if (/^\/me\/(inputs|compositions)\//.test(route)) {
      const [, , kind, code] = route.split('/'), old = own.get(kind + ':' + code);
      if (failNextOwn || body.revision !== (old?.revision || 0)) { failNextOwn = false; return respond({ message: 'Conflito no cadastro próprio.' }, 409); }
      const row = { code, kind, revision: (old?.revision || 0) + 1, data: body.data, deleted: method === 'DELETE' };
      own.set(kind + ':' + code, row); return respond(row);
    }
    return respond({ message: 'Rota de fixture não implementada: ' + route }, 404);
  };
  if (!ctx.OP) ctx.OP = { store: {}, app: { pj: copy(project.data) }, util: {}, main: { boot: async () => {}, useBase: () => {} },
    register: { snapshot: () => {}, makeBase: () => ({}) }, ui: { renderNav: () => {}, render: () => {}, icon: () => '', views: { base: { render: () => '' } }, act: { fileMenu: () => {} } } };
  else { ctx.OP.ui.renderNav = () => {}; ctx.OP.ui.render = () => {}; }
  vm.runInContext(source, ctx, { filename: 'api-store.js', timeout: 30000 });
  const config = ctx.ORCAPRO_INFRA_CONFIG;
  await config.prepare(); ctx.OP_SICRO_RAW = await config.loadSnapshot(); await config.loadPem();
  config.installAdapter(ctx.OP); await config.afterModules(ctx.OP);
  const emit = async (data, origin = ctx.location.origin, sender = parent) => {
    for (const listener of listeners.message || []) await listener({ data, origin, source: sender });
  };
  return { ctx, O: ctx.OP, config, storage, messages, requests, emit, listeners,
    failProject: () => { failNextProject = true; }, failOwn: () => { failNextOwn = true; },
    project: () => copy(project), own,
  };
}
module.exports = { fixture, projectId, cycleId, memoryDb };
