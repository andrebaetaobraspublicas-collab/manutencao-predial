const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const ts = require('typescript');

function uploadModule(api, compressed) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../apps/web/src/lib/infra-import.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, require: name => { assert.equal(name, './infra-api'); return { infraApi: api }; }, crypto: webcrypto, TextEncoder, Blob, Response, CompressionStream: compressed ? CompressionStream : undefined, btoa: value => Buffer.from(value, 'binary').toString('base64') });
  vm.runInContext(compiled, context, { filename: 'infra-import.ts' });
  return module.exports.uploadInfraCatalog;
}

for (const compressed of [true, false]) test(`upload preserva bytes UTF8 e hashes com ${compressed ? 'gzip por fragmento' : 'fallback sem gzip'}`, async () => {
  const bundle = { raw: { ref: '07/2026', ufs: ['SP'], comp: { c: ['a'.repeat(600000), '🛣️'.repeat(180000)] }, ins: { c: ['input-1'] } }, pem: { sheets: [{ code: '1234567', description: 'PEM global' }] } };
  const expected = Buffer.from(JSON.stringify(bundle), 'utf8');
  const digest = value => createHash('sha256').update(value).digest('hex');
  const fragments = [], calls = [], progress = [];
  let declared;
  const api = async (route, init) => {
    calls.push(route);
    assert.equal(init.method, 'POST');
    if (route === '/admin/cycles') {
      declared = JSON.parse(init.body);
      assert.equal(declared.expectedBytes, expected.length);
      assert.equal(declared.contentHash, digest(expected));
      assert.equal(declared.expectedChunks, Math.ceil(expected.length / (512 * 1024)));
      return { id: 'new-draft-only' };
    }
    if (route.endsWith('/chunks')) {
      assert.ok(Buffer.byteLength(init.body, 'utf8') <= 2 * 1024 * 1024);
      const body = JSON.parse(init.body);
      assert.equal(body.index, fragments.length);
      assert.equal(body.encoding, compressed ? 'gzip' : 'utf8');
      const transmitted = Buffer.from(body.dataBase64, 'base64');
      assert.ok(transmitted.length <= 2 * 1024 * 1024);
      const raw = compressed ? gunzipSync(transmitted) : transmitted;
      assert.ok(raw.length <= 512 * 1024);
      assert.equal(body.sha256, digest(raw));
      fragments.push(raw);
    } else { assert.equal(route, '/admin/cycles/new-draft-only/finalize'); }
    return {};
  };
  const result = await uploadModule(api, compressed)(bundle, 'SP', '07/2026', ['relatorio.xlsx'], value => progress.push(value));
  assert.equal(result, 'new-draft-only');
  assert.ok(fragments.length >= 3);
  assert.deepEqual(Buffer.concat(fragments), expected);
  assert.equal(digest(Buffer.concat(fragments)), declared.contentHash);
  assert.equal(calls.at(-1), '/admin/cycles/new-draft-only/finalize');
  assert.ok(calls.every(route => !route.endsWith('/publish')), 'Finalização não publica automaticamente');
  assert.ok(progress.length >= fragments.length);
});

test('catálogo maior que40MB é rejeitado antes de abrir importação', async () => {
  let called = false;
  const upload = uploadModule(async () => { called = true; }, true);
  const bundle = { raw: { ref: '07/2026', ufs: ['SP'], comp: { c: ['a'.repeat(40 * 1024 * 1024)] }, ins: { c: [] } } };
  await assert.rejects(upload(bundle, 'SP', '07/2026', [], () => undefined), /40 MB/);
  assert.equal(called, false);
});

test('ponte do importador verifica origem e iframe e não executa HTML de auditoria', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../apps/web/src/app/orcapro-infraestrutura/administracao/page.tsx'), 'utf8');
  assert.match(source, /event\.origin !== window\.location\.origin/);
  assert.match(source, /event\.source !== frame\?\.contentWindow/);
  assert.match(source, /access\.role !== 'ADMIN'/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});
