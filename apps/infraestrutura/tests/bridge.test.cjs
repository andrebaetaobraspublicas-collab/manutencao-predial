const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { fixture, projectId, cycleId } = require('./bridge-harness.cjs');
const H = require('./harness.cjs');
const clean = value => JSON.parse(JSON.stringify(value));

test('Bridge serializa alterações com a versão confirmada e conserva campos desconhecidos', async () => {
  const f = await fixture(), first = clean(f.O.app.pj), second = clean(first);
  first.root.children.push({ kind: 'item', code: '5502118', qty: 2 });
  first.engineMetadata = { date: '2026-07', privateExtension: ['não remover', 7] };
  second.root.children.push({ kind: 'item', code: '5502118', qty: 3 }); second.engineMetadata = first.engineMetadata;
  const p1 = f.O.store.put('projects', first), p2 = f.O.store.put('projects', second); first.root.children[0].qty = 999;
  await Promise.all([p1, p2]);
  const puts = f.requests.filter(x => x.route === `/projects/${projectId}` && x.method === 'PUT');
  assert.deepEqual(puts.map(x => x.body.version), [1, 2]); assert.equal(f.project().version, 3);
  assert.equal(puts[0].body.data.root.children[0].qty, 2);
  assert.deepEqual(f.project().data.engineMetadata, second.engineMetadata); assert.equal(f.project().data.sicroCycleId, cycleId);
  assert.ok(puts.every(x => x.headers['X-Infra-CSRF'] === 'csrf-fixture'));
});

test('409 conserva o rascunho privado e bloqueia novos PUTs silenciosos', async () => {
  const f = await fixture(); f.O.app.pj.name = 'Alteração que precisa ser preservada'; f.failProject();
  await assert.rejects(f.O.store.put('projects', f.O.app.pj), /Outro usuário/);
  const id = `user-1:tenant-1:${projectId}`, draft = f.storage.get('drafts').get(id);
  assert.equal(draft.data.name, f.O.app.pj.name); assert.ok(!draft.confirmed); assert.equal(f.O.infra.conflict, true);
  f.O.app.pj.name = 'Nova alteração após o conflito';
  await assert.rejects(f.O.store.put('projects', f.O.app.pj), /Outro usuário/);
  assert.equal(f.storage.get('drafts').get(id).data.name, f.O.app.pj.name);
  assert.equal(f.requests.filter(x => x.method === 'PUT').length, 1); assert.equal(f.project().version, 1);
});

test('Cadastros próprios aguardam a revisão anterior, inclusive para exclusão', async () => {
  const f = await fixture(), first = { code: 'IP-0001', desc: 'Material', prices: [{ uf: 'SP', base: 5 }] }, second = { ...first, desc: 'Material revisado' };
  await Promise.all([f.O.store.put('inputs', first), f.O.store.put('inputs', second), f.O.store.del('inputs', first.code)]);
  const writes = f.requests.filter(x => x.route === '/me/inputs/IP-0001');
  assert.deepEqual(writes.map(x => x.body.revision), [0, 1, 2]); assert.equal(f.O.infra.revisions.get('inputs:IP-0001'), 3);
  await f.O.store.put('inputs', second); assert.equal(f.O.infra.revisions.get('inputs:IP-0001'), 4);
});

test('Salvar como cópia recupera o projeto conflitado sem sobrescrever a versão original', async () => {
  const f = await fixture(); f.O.app.pj.name = 'Meu rascunho'; f.failProject();
  await assert.rejects(f.O.store.put('projects', f.O.app.pj), /Outro usuário/);
  await f.O.ui.act.infraConflictCopy();
  const created = f.requests.find(x => x.route === '/projects' && x.method === 'POST');
  assert.equal(created.body.data.name, 'Meu rascunho'); assert.match(f.ctx.navigated, /33333333-3333-4333-8333-333333333333$/);
  assert.equal(f.project().version, 1); assert.notEqual(f.project().data.name, 'Meu rascunho');
});

test('Falha de exclusão registra o conflito e impede saída com mensagem clara', async () => {
  const f = await fixture(); await f.O.store.put('inputs', { code: 'IP-0001' }); f.failOwn();
  await assert.rejects(f.O.store.del('inputs', 'IP-0001'), /Conflito/); assert.equal(f.O.infra.conflict, true);
  await f.emit({ type: 'infra-flush', requestId: 'exit-conflict' });
  const answer = f.messages.find(x => x.message.type === 'infra-flush-result').message;
  assert.equal(answer.ok, false); assert.match(answer.message, /Conflito/);
});

test('IPC grava antes da saída e recusa origem ou remetente distintos', async () => {
  const f = await fixture(); f.O.app.pj.name = 'Antes de sair';
  await f.emit({ type: 'infra-flush', requestId: 'spoof-origin' }, 'https://outro.invalid');
  await f.emit({ type: 'infra-flush', requestId: 'spoof-source' }, f.ctx.location.origin, {});
  assert.equal(f.messages.length, 0); assert.equal(f.requests.filter(x => x.method === 'PUT').length, 0);
  f.O.ui.later('qty', () => { f.O.app.pj.qtyExtension = 23; }, 30000);
  await f.emit({ type: 'infra-flush', requestId: 'legit' });
  const answer = f.messages.find(x => x.message.type === 'infra-flush-result');
  assert.deepEqual(answer.message, { type: 'infra-flush-result', requestId: 'legit', ok: true });
  assert.equal(answer.origin, f.ctx.location.origin); assert.equal(f.project().data.qtyExtension, 23);
});

test('IPC preserva orçamento e exige resolver rascunhos de riscos e cadastros', async () => {
  for (const draft of ['risk', 'nested-own', 'busy-risk']) {
    const f = await fixture(); f.O.app.pj.name = 'Orçamento confirmado';
    if (draft === 'risk') f.O.risks = { dirty: true };
    if (draft === 'busy-risk') f.O.risks = { busy: true };
    if (draft === 'nested-own') f.O.register.editor = { dirty: false, parent: { dirty: true } };
    await f.emit({ type: 'infra-flush', requestId: draft });
    const answer = f.messages.find(x => x.message.type === 'infra-flush-result').message;
    assert.equal(answer.ok, false); assert.match(answer.message, /riscos|cadastro/); assert.equal(f.project().data.name, 'Orçamento confirmado');
  }
});

test('Chave derivada invalida UF, regime, FIC, FIT, transporte, coeficiente próprio e identidade', async () => {
  const f = await fixture(), project = f.O.infra.project, original = clean(project.data), baseline = await f.O.infra.derivedKey();
  assert.equal(typeof baseline, 'string');
  const mutations = [data => { data.uf = 'RJ'; }, data => { data.rg = 'CD'; }, data => { data.fic = { mode: 'project', ndP: 0.2 }; },
    data => { data.fit = { pareSiga: true, vmdfPadrao: 1500 }; }, data => { data.dmt = { def: { P: 10 } }; },
    data => { data.catalog.compositions.push({ code: 'CP-0001', items: [{ code: 'M0082', coef: 2 }] }); },
    data => { data.sicroPriceQuotes = [{ code: 'M0082', uf: 'SP', ref: '2026-07', value: 2 }]; }];
  for (const mutate of mutations) { project.data = clean(original); mutate(project.data); assert.notEqual(await f.O.infra.derivedKey(), baseline); }
  project.data = clean(original); project.version++; assert.notEqual(await f.O.infra.derivedKey(), baseline); project.version--;
  f.O.infra.access.userId = 'outro'; assert.notEqual(await f.O.infra.derivedKey(), baseline); f.O.infra.access.userId = 'user-1';
  f.O.infra.catalogHash = 'outro-catalogo'; assert.notEqual(await f.O.infra.derivedKey(), baseline);
  project.data.catalog = null; assert.equal(await f.O.infra.derivedKey(), null);
});

test('Cache derivado restaura detalhes BigInt sem alterar um centavo nem prazo da rodovia', async () => {
  const ctx = H.loadExtracted(), data = clean(ctx.OP.app.pj); data.id = projectId; data.sicroCycleId = cycleId;
  const before = ctx.OP.ui.model(), expected = clean(before.tot), expectedCosts = before.base.costTable(data.uf, data.rg).cost;
  const storage = new Map();
  // A real calculation boot independent of the legal-gate UI. No acceptance is automated.
  // The adapter captured originalBoot during setup, so create a fresh context with this fixture boot.
  const repeat = async () => {
    const next = H.loadExtracted(); next.OP.main.boot = async () => {
      next.OP.app.pj = await next.OP.store.get('projects', projectId); next.OP.app.base = { raw: next.OP_SICRO_RAW, officialRaw: next.OP_SICRO_RAW, id: cycleId, ufs: next.OP_SICRO_RAW.ufs };
      next.OP.register.hydrate(next.OP.app.pj); next.OP.app.model = null; next.OP.ui.model();
    };
    const ff = await fixture({ context: next, storage, data, raw: clean(ctx.OP.app.base.officialRaw), pem: ctx.OP_DATA.pem });
    await next.OP.main.boot(); return ff;
  };
  const cold = await repeat(); assert.ok(!cold.O.infra.derivedRestored); const warm = await repeat(); assert.equal(warm.O.infra.derivedRestored, true);
  const model = warm.O.ui.model(); assert.deepEqual(clean(model.tot), expected); assert.equal(model.T, 172);
  assert.deepEqual(clean(model.base.costTable(data.uf, data.rg).cost), clean(expectedCosts));
  const table = [...model.base._costCache.values()][0]; assert.ok(table.detail.some(row => typeof row?.totalC === 'bigint'));
});

test('Importador recebe snapshot colunar e usa Base na validação oficial', () => {
  const ctx = H.context();
  for (const file of ['00_core.js', '01_xlsx.js', '02_sicro.js']) require('node:vm').runInContext(fs.readFileSync(path.join(H.root, 'src/modules', file), 'utf8'), ctx, { timeout: 30000 });
  const raw = JSON.parse(H.read ? H.read('base.json') : require('node:zlib').gunzipSync(fs.readFileSync(path.join(H.seedDir, 'base.json.gz'))).toString());
  const result = ctx.OP.sicro.validate(new ctx.OP.sicro.Base(raw)); assert.equal(result.total, 6619); assert.equal(result.ok, 6619);
  const importer = fs.readFileSync(path.join(H.root, 'src/importer.js'), 'utf8'); assert.match(importer, /Array\.isArray\(bundle\.raw\?\.comp\?\.c\)/);
});
