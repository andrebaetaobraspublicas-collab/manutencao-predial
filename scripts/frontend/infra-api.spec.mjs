import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/src/lib');
function helpers(fetch) {
  const clicks = [], context = vm.createContext({ Headers, FormData, Response, Blob, process: { env: { NEXT_PUBLIC_API_URL: 'http://fixture.invalid/api/v1' } }, fetch,
    URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL: () => {} }, setTimeout: fn => { fn(); },
    document: { createElement: () => { const anchor = { click: () => clicks.push({ href: anchor.href, download: anchor.download }), remove: () => {} }; return anchor; }, body: { appendChild: () => {} } }, window: { setTimeout: fn => { fn(); } } });
  function load(name, imports = {}) {
    const code = ts.transpileModule(fs.readFileSync(path.join(root, name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    const fn = vm.runInContext('(function(module,exports,require){' + code + '\n})', context, { timeout: 10000 });
    fn(module, module.exports, target => { assert.ok(imports[target], target); return imports[target]; }); return module.exports;
  }
  const api = load('api'), infra = load('infra-api', { './api': api });
  return { infra, clicks };
}
const respond = (body, status = 200, headers) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const routeOf = url => new URL(url).pathname.replace('/api/v1', '');

test('Mutação renova sessão e recompõe CSRF antes de repetir após 401', async () => {
  let expired = false, session = 'A'; const calls = [];
  const { infra } = helpers(async (url, init = {}) => {
    const route = routeOf(url), headers = new Headers(init.headers); calls.push({ route, init, csrf: headers.get('X-Infra-CSRF') });
    if (route === '/infraestrutura/access') return expired && session === 'A' ? respond({ message: 'Sessão expirada' }, 401) : respond({ enabled: true, csrfToken: 'csrf-' + session });
    if (route === '/auth/refresh') { session = 'B'; return respond({}); }
    if (route === '/infraestrutura/admin/users') {
      if (!expired) { expired = true; return respond({ message: 'Sessão expirada' }, 401); }
      if (headers.get('X-Infra-CSRF') !== 'csrf-B') return respond({ message: 'CSRF antigo' }, 403);
      return respond({ created: true });
    }
    throw new Error(route);
  });
  const result = await infra.infraApi('/admin/users', { method: 'POST', body: '{}', headers: { 'X-Client': 'preservar' } });
  assert.equal(result.created, true);
  const mutations = calls.filter(c => c.route === '/infraestrutura/admin/users');
  assert.deepEqual(mutations.map(c => c.csrf), ['csrf-A', 'csrf-B']);
  assert.equal(calls.filter(c => c.route === '/auth/refresh').length, 1);
  assert.ok(mutations.every(c => new Headers(c.init.headers).get('X-Client') === 'preservar'));
  assert.ok(calls.every(c => c.init.credentials === 'include')); assert.ok(mutations.every(c => c.init.cache === 'no-store'));
});

test('Mutação sem acesso ativo não é transmitida', async () => {
  const calls = [];
  const { infra } = helpers(async url => { calls.push(routeOf(url)); return respond({ enabled: false, csrfToken: 'fixture' }); });
  await assert.rejects(infra.infraApi('/admin/users', { method: 'POST', body: '{}' }), error => error.status === 403);
  assert.deepEqual(calls, ['/infraestrutura/access']);
});

test('Falha de sessão persistente não causa tentativas ilimitadas de escrita', async () => {
  let attempts = 0;
  const { infra } = helpers(async url => {
    const route = routeOf(url);
    if (route === '/infraestrutura/access') return respond({ enabled: true, csrfToken: 'fixture' });
    attempts++; return respond({ message: 'Sessão recusada' }, 401);
  });
  await assert.rejects(infra.infraApi('/admin/users', { method: 'POST', body: '{}' }), error => error.status === 401);
  assert.equal(attempts, 2);
});

test('Consulta GET continua usando renovação de sessão do helper compartilhado', async () => {
  let attempts = 0, refreshes = 0;
  const { infra } = helpers(async url => {
    const route = routeOf(url);
    if (route === '/auth/refresh') { refreshes++; return respond({}); }
    assert.equal(route, '/infraestrutura/projects'); return ++attempts === 1 ? respond({ message: 'Sessão expirada' }, 401) : respond({ items: [] });
  });
  assert.equal((await infra.infraApi('/projects')).items.length, 0); assert.equal(attempts, 2); assert.equal(refreshes, 1);
});

test('Exportação LGPD renova sessão se expira depois do bootstrap e respeita nome do servidor', async () => {
  let attempts = 0, refreshes = 0;
  const { infra, clicks } = helpers(async url => {
    const route = routeOf(url);
    if (route === '/infraestrutura/access') return respond({ enabled: true, csrfToken: 'fixture' });
    if (route === '/auth/refresh') { refreshes++; return respond({}); }
    assert.equal(route, '/infraestrutura/me/export/archive');
    return ++attempts === 1 ? respond({ message: 'Sessão expirada' }, 401) : new Response('synthetic-gzip-fixture', { headers: { 'Content-Disposition': 'attachment; filename="arquivo-completo.json.gz"' } });
  });
  await infra.infraDownload('/me/export/archive', 'nome-proposto.json.gz');
  assert.equal(attempts, 2); assert.equal(refreshes, 1); assert.deepEqual(clicks, [{ href: 'blob:fixture', download: 'arquivo-completo.json.gz' }]);
});

test('Administração abre contexto solicitado, aliases SICRO e padrão seguro', async () => {
  const source = fs.readFileSync(path.join(root, '../app/orcapro-infraestrutura/administracao/page.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  for (const [query, expected] of [['?tab=cycles', 'catalog'], ['?tab=catalog', 'catalog'], ['?tab=policies', 'policies'], ['?tab=audit', 'audit'], ['?tab=invalid', 'users'], ['', 'users']]) {
    const states = [], effects = [];
    const react = { useCallback: fn => fn, useEffect: fn => effects.push(fn), useState: initial => { const index = states.length; states.push(typeof initial === 'function' ? initial() : initial); return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; } };
    const imports = {
      react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
      '@/lib/api': { ApiError: class extends Error {} }, '@/lib/product-config': { ORCAPRO_ONLY: false },
      '@/lib/infra-api': { infraAccess: async () => ({ enabled: true, role: 'ADMIN', userId: 'fixture-user' }), infraItems: value => value.items,
        infraApi: async route => route === '/admin/stats' ? { users: [], projects: { total: 0 }, cycles: [] } : { items: [] } },
      '@/lib/infra-import': {}, '../infra-shell': () => {}, '../../orcapro/workspace.module.css': {},
    };
    const context = vm.createContext({ URLSearchParams, window: { location: { search: query }, addEventListener: () => {}, removeEventListener: () => {} } });
    const module = { exports: {} }, fn = vm.runInContext('(function(module,exports,require){' + code + '\n})', context, { timeout: 10000 });
    fn(module, module.exports, target => { assert.ok(imports[target], target); return imports[target]; });
    module.exports.default(); effects[0](); await new Promise(setImmediate);
    assert.equal(states[0], true); assert.equal(states[2], expected, query);
  }
});
