import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function helpers(fetch) {
  const source = fs.readFileSync(new URL('../../apps/web/src/lib/api.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, Headers, FormData, TextDecoder, process: { env: { NEXT_PUBLIC_API_URL: 'https://fixture.invalid/api/v1' } }, fetch });
  vm.runInContext(code, context, { timeout: 10000 });
  return module.exports;
}
function stream(events, bytesPerChunk = 3) {
  const bytes = new TextEncoder().encode(events.map(JSON.stringify).join('\n') + '\n');
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += bytesPerChunk) controller.enqueue(bytes.slice(i,i + bytesPerChunk));
    controller.close();
  } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
}
test('Lê NDJSON fragmentado e UTF-8, ignora heartbeat e conserva confirmação final', async () => {
  const progress = [], api = helpers(async () => stream([
    { type: 'progress', phase: 'Comparação', percent: 70 }, { type: 'heartbeat' },
    { type: 'progress', phase: 'Concluído', percent: 100 }, { type: 'result', result: { reference: { id: 'draft' } } },
  ]));
  const result = await api.apiImportStream('/orcapro/admin/imports/stream', { method: 'POST', body: '{}' }, (...values) => progress.push(values));
  assert.deepEqual(progress, [['Comparação',70],['Concluído',100]]);
  assert.equal(result.reference.id, 'draft');
});
test('HTTP 200 com evento de erro não é uma importação bem-sucedida', async () => {
  const api = helpers(async () => stream([{ type: 'error',status: 409,message: 'Revisão já existe' }]));
  await assert.rejects(api.apiImportStream('/orcapro/admin/imports/stream', {}, () => {}), error => error.status === 409 && error.message === 'Revisão já existe');
});
test('Conexão encerrada sem resultado orienta conferir referência antes de repetir', async () => {
  const api = helpers(async () => stream([{ type: 'progress',phase: 'Gravando',percent: 98 }]));
  await assert.rejects(api.apiImportStream('/orcapro/admin/imports/stream', {}, () => {}), /Confira a lista de referências/);
});
test('Renova sessão uma vez e preserva arquivo multipart, sem forjar Content-Type', async () => {
  const body = new FormData(), calls = []; body.set('revision','1');
  let attempts = 0;
  const api = helpers(async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/refresh')) return new Response('{}');
    return ++attempts === 1 ? new Response('{"message":"Sessão expirada"}', { status: 401 }) : stream([{ type: 'result',result: { done: true } }]);
  });
  assert.equal((await api.apiImportStream('/orcapro/admin/imports/file/stream', { method: 'POST',body }, () => {})).done, true);
  assert.equal(attempts, 2); assert.equal(calls.length, 3);
  for (const call of calls.filter(call => !call.url.endsWith('/auth/refresh'))) {
    assert.equal(call.init.body, body); assert.equal(call.init.credentials, 'include');
    assert.equal(new Headers(call.init.headers).get('Content-Type'), null);
  }
});
