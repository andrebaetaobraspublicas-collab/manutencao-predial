'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadLegacyRuntime } = require('../../apps/api/src/modules/orcapro/legacy/assets/runtime.cjs');
const source = fs.readFileSync(path.join(__dirname, 'cloud-bridge.js'), 'utf8');
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function setup(fetch) {
  const runtime = loadLegacyRuntime(), { OP } = runtime;
  const messages = []; let reloads = 0;
  OP.ui.renderNav = () => {};
  OP.ui.$ = () => null;
  OP.ui.toast = () => {};
  OP.ui.saveSoon = () => {};
  OP.app.pj = OP.engine.newProject();
  OP.app.pj.id = id;
  OP.app.inputs = []; OP.app.customs = [];
  OP.app.base = { raw: { ref: '08/2026' }, nComp: 0 };
  const context = { OP, fetch, URL, URLSearchParams, location: { origin: 'https://example.test', search: '?project=' + id, reload: () => { reloads++; } },
    document: { addEventListener() {}, getElementById: () => null }, addEventListener() {},
    parent: { postMessage: (data, origin) => messages.push({ data, origin }) }, localStorage: {}, console, setTimeout, clearTimeout };
  context.window = context;
  vm.createContext(context);
  vm.runInContext('(' + source + ')("https://api.example.test/api/v1")', context);
  Object.assign(OP.cloud, { ready: true, wrapper: { id, referenceId: 'reference-1', version: 4 },
    access: { enabled: true, role: 'USER', tenantId: 'tenant', userId: 'user' } });
  return { OP, messages, runtime, get reloads() { return reloads; } };
}
test('refresh retries once and transport stays credentialed at the built API origin', async () => {
  const calls = [];
  const { OP } = setup(async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? json({ message: 'expired' }, 401) : json({ ok: true });
  });
  await OP.cloud.request('/orcapro/access');
  assert.deepEqual(calls.map(x => x.url), ['https://api.example.test/api/v1/orcapro/access', 'https://api.example.test/api/v1/auth/refresh', 'https://api.example.test/api/v1/orcapro/access']);
  assert.ok(calls.every(x => x.options.credentials === 'include'));
  await assert.rejects(OP.cloud.request('//untrusted.example'), /Rota inválida/);
});
test('queued writes preserve edited documents and use the preceding server version', async () => {
  const bodies = [];
  const { OP, messages } = setup(async (_, options) => {
    const body = JSON.parse(options.body); bodies.push(body);
    return json({ id, referenceId: 'reference-1', version: body.expectedVersion + 1, data: body.data });
  });
  await Promise.all([OP.cloud.persist({ id, name: 'first', uf: 'SP', rg: 'SD' }), OP.cloud.persist({ id, name: 'second', uf: 'DF', rg: 'CD' })]);
  assert.deepEqual(bodies.map(x => [x.expectedVersion, x.data.name]), [[4, 'first'], [5, 'second']]);
  assert.equal(OP.cloud.wrapper.version, 6);
  assert.deepEqual(messages.map(x => x.data.status), ['saving', 'saved', 'saving', 'saved']);
  assert.ok(messages.every(x => x.origin === 'https://example.test' && x.data.type === 'orcapro-save'));
});
test('409 freezes writes and preserves unsaved changes with an explicit parent conflict', async () => {
  let calls = 0;
  const { OP, messages } = setup(async () => { calls++; return json({ message: 'another session' }, 409); });
  const original = JSON.stringify(OP.app.pj);
  await assert.rejects(OP.cloud.persist({ id, name: 'edited', uf: 'SP', rg: 'SD' }), /another session/);
  await assert.rejects(OP.cloud.persist({ id, name: 'edited again' }), /another session/);
  assert.equal(calls, 1); assert.equal(OP.cloud.wrapper.version, 4);
  assert.equal(JSON.stringify(OP.app.pj), original);
  assert.equal(OP.app.saveError, true); assert.equal(OP.cloud.conflict, true);
  assert.equal(messages.at(-1).data.status, 'conflict');
});
test('catalog mutations and another project ID are denied; failed saves are never reported as saved', async () => {
  const { OP, messages } = setup(async () => json({ message: 'database unavailable' }, 500));
  await assert.rejects(OP.store.put('bases', {}), /administração global/);
  await assert.rejects(OP.store.del('projects', id), /administração global/);
  await assert.rejects(OP.store.put('projects', { id: 'another' }), /outro projeto/);
  await assert.rejects(OP.cloud.persist({ id, name: 'edited' }), /database unavailable/);
  assert.equal(OP.cloud.wrapper.version, 4); assert.equal(OP.cloud.lastSaved, '');
  assert.deepEqual(messages.map(x => x.data.status), ['saving', 'error']);
});
test('sparse catalog merge remaps dictionaries and does not mutate either source', () => {
  const { OP } = setup(async () => json({}));
  const current = { ref: '08/2026', ufs: ['SP'], un: ['M'], cls: ['MATERIAL'], grupos: ['old'], ct: ['old'],
    ins: { c: [1], k: [0], d: ['one'], u: [0], o: ['SP'], p: [[100]], lab: {} },
    comp: { c: [10], g: [0], d: ['old'], u: [0], s: ['old'], it: [[[1, 100000000]]] } };
  const incoming = { ref: '08/2026', ufs: ['SP'], un: ['H'], cls: ['MAO DE OBRA'], grupos: ['new'], ct: ['new'],
    ins: { c: [2], k: [0], d: ['two'], u: [0], o: ['SP'], p: [[200]], lab: { 2: { a: 1 } } },
    comp: { c: [20], g: [0], d: ['new'], u: [0], s: ['new'], it: [[[2, 100000000]]] } };
  const originals = JSON.stringify([current, incoming]);
  const merged = OP.cloud.mergeRaw(current, incoming);
  assert.equal(JSON.stringify([current, incoming]), originals);
  assert.deepEqual(JSON.parse(JSON.stringify(merged.un)), ['M', 'H']);
  assert.equal(merged.ins.u[1], 1); assert.equal(merged.comp.g[1], 1);
  assert.equal(merged.ins.lab[2].a, 1);
  assert.throws(() => OP.cloud.mergeRaw(current, { ...incoming, ref: '07/2026' }), /referência/);
});

const officialRaw = JSON.parse(fs.readFileSync(path.join(__dirname, '../../legacy/orcaplan-1.8.3/sinapi-2026-08.raw.json'), 'utf8'));
test('original catalog shows the complete notebook index and hydrates a selected tree without saving the catalog', async () => {
  const calls = [], C = officialRaw.comp;
  const fixture = setup(async (url, options) => {
    assert.equal(options.method, undefined); calls.push(url);
    if (url.includes('/navigation?')) return json({ referenceId: 'reference-1', groups: officialRaw.grupos,
      items: C.c.map((code,j) => ({ code: String(code), description: C.d[j], unit: officialRaw.un[C.u[j]], group: officialRaw.grupos[C.g[j]] })) });
    if (url.includes('/compositions?')) {
      const params = new URL(url).searchParams, group = officialRaw.grupos.indexOf(params.get('group'));
      const codes = C.c.filter((_,j) => C.g[j] === group);
      const page = Number(params.get('page'));
      return json({ items: codes.slice((page-1)*100,page*100).map(code => ({ code: String(code) })), total: codes.length, pageSize: 100 });
    }
    if (url.includes('/bundle?')) return json({ referenceId: 'reference-1', raw: officialRaw });
    throw new Error(url);
  });
  const { OP } = fixture;
  const sparse = JSON.parse(JSON.stringify(officialRaw));
  sparse.comp = { c: [], g: [], d: [], u: [], s: [], it: [] };
  OP.cloud.raw = sparse; OP.app.base = fixture.runtime.createBase(sparse, 'reference-1');
  OP.app.pj.uf = 'SP'; OP.app.pj.rg = 'CD'; OP.app.view = 'catalog'; OP.app.sel = {};
  OP.ui.render = () => {};
  await OP.ui.views.catalog.after();
  assert.equal(OP.app.base.nComp, 0);
  const groups = OP.macro.groups(OP.app.base).flatMap(m => m.items);
  assert.equal(groups.reduce((sum,g) => sum+g.count,0), C.c.length);
  assert.match(OP.ui.views.catalog.render(), /Filtrar cadernos técnicos/);
  assert.match(OP.ui.views.catalog.render(), /Buscar em todo o SINAPI/);
  const gi = C.g[C.c.indexOf(90084)];
  await OP.ui.act.pickGroup({ dataset: { gi: String(gi) } });
  const family = OP.factors.forGroup(OP.app.base, gi).families.find(f => f.members.some(m => C.c[m.j] === 90084));
  OP.ui.act.pickFam({ dataset: { f: String(family.id) } });
  assert.match(OP.ui.views.catalog.render(), /ftree-main/);
  assert.match(OP.ui.views.catalog.render(), /PROFUNDIDADE|Profundidade/i);
  assert.ok(calls.every(url => url.includes('referenceId=reference-1')));
  assert.ok(calls.filter(url => !url.includes('/navigation?')).every(url => url.includes('uf=SP') && url.includes('regime=CD')));
  assert.equal(OP.app.pj.catalog?.compositions?.length || 0, 0);
});
function attachBase(state) {
  state.OP.app.base = state.runtime.createBase(officialRaw, 'reference-1', state.OP.app.inputs, state.OP.app.customs);
  state.OP.app.pj.uf = 'SP'; state.OP.app.pj.rg = 'SD';
  state.OP.cloud.raw = officialRaw;
}
test('explicit register save publishes its changed code only after the private project succeeds', async () => {
  const calls = [];
  const fixture = setup(async (url, options) => {
    calls.push({ url, body: options.body && JSON.parse(options.body), method: options.method });
    if (options.method === 'PUT') return json({ id, referenceId: 'reference-1', version: 5 });
    if (options.method === 'POST') return json({ data: JSON.parse(options.body).data });
    return json([]);
  });
  attachBase(fixture);
  const draft = fixture.OP.register.newComp();
  Object.assign(draft, { desc: 'Test adaptation', mode: 'quoted', quote: 10, base: 94964 });
  await fixture.OP.register.save('C', draft);
  assert.equal(calls[0].method, 'PUT');
  const posts = calls.filter(call => call.method === 'POST');
  assert.equal(posts.length, 1);
  assert.ok(posts[0].url.endsWith('/custom-compositions'));
  assert.equal(posts[0].body.data.origin_reference_id, 'reference-1');
  assert.equal(posts[0].body.data.origin_code, '94964');
});
test('saving project snapshots does not silently publish old library revisions', async () => {
  const calls = [];
  const fixture = setup(async (url, options) => { calls.push({ url, method: options.method }); return json({ id, referenceId: 'reference-1', version: 5 }); });
  attachBase(fixture);
  fixture.OP.app.customs.push({ ...fixture.OP.register.newComp(), revision: 1, desc: 'Old snapshot', mode: 'quoted', quote: 10 });
  await fixture.OP.register.publish();
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'PUT');
});
test('library closure adopts dependencies without replacing existing project revisions', async () => {
  let writes = 0;
  const fixture = setup(async (_, options) => { assert.equal(options.method, 'PUT'); writes++; return json({ id, referenceId: 'reference-1', version: 5 }); });
  const N = fixture.OP.register;
  const original = { ...N.newInput(), code: 'IP-OLD', desc: 'Old project revision', revision: 1 };
  fixture.OP.app.inputs.push(original); attachBase(fixture);
  N.library = { inputs: [{ ...original, desc: 'New library revision', revision: 3 }], compositions: [
    { ...N.newComp(), code: 'CP-CHILD', desc: 'Child', mode: 'analytic', items: [{ type: 'I', code: 'IP-OLD', coef: 1 }] },
    { ...N.newComp(), code: 'CP-PARENT', desc: 'Parent', mode: 'analytic', items: [{ type: 'C', code: 'CP-CHILD', coef: 1 }] },
  ] };
  await fixture.OP.cloud.useLibrary('C', 'CP-PARENT');
  assert.equal(writes, 1);
  assert.deepEqual(fixture.OP.app.customs.map(row => row.code).sort(), ['CP-CHILD', 'CP-PARENT']);
  assert.equal(fixture.OP.app.inputs[0].revision, 1);
  assert.equal(fixture.OP.app.inputs[0].desc, 'Old project revision');
});
test('own JSON imports reject unsafe fields before mutating the current document', async () => {
  const fixture = setup(async () => { throw new Error('No request should run'); });
  attachBase(fixture);
  const before = JSON.stringify(fixture.OP.app.pj);
  for (const record of [
    { id: '\"><img src=x onerror=alert(1)>', code: 'CP-ATTACK' },
    { id: 'CP-ATTACK', code: 'CP-ATTACK', revision: '<img src=x>' },
    { id: 'CP-ATTACK', code: 'CP-ATTACK', history: [{ rev: '<img src=x>' }] },
    { id: 'CP-ATTACK', code: 'CP-ATTACK', url: 'javascript:alert(1)' },
    JSON.parse('{"id":"CP-ATTACK","code":"CP-ATTACK","__proto__":{}}'),
  ]) await assert.rejects(fixture.OP.register.importCatalog({ inputs: [], compositions: [record] }), /inválido|inválida|permitida/);
  assert.equal(fixture.OP.app.customs.length, 0);
  assert.equal(JSON.stringify(fixture.OP.app.pj), before);
  await assert.rejects(fixture.OP.register.importData({}), /portal/);
  await assert.rejects(fixture.OP.exp.importJSON(), /portal/);
  assert.equal(fixture.OP.cloud.safeUrl('javascript:alert(1)'), '#');
  assert.equal(fixture.OP.cloud.safeUrl('data:text/html,<script>'), '#');
  assert.equal(fixture.OP.cloud.safeUrl('https://reference.example/manual.pdf'), 'https://reference.example/manual.pdf');
});

test('risk snapshot flush includes debounced edits and server acceptance cancels stale autosaves',async()=>{
  const bodies=[];const fixture=setup(async(_,options)=>{const body=JSON.parse(options.body);bodies.push(body);return json({id,referenceId:'reference-1',version:body.expectedVersion+1,data:body.data});});
  attachBase(fixture);const {OP}=fixture;
  OP.ui.later('pending-cost',()=>{OP.app.pj.name='Edited before snapshot';OP.ui.saveSoon();},10000);
  await OP.cloud.flush();assert.equal(bodies.length,1);assert.equal(bodies[0].data.name,'Edited before snapshot');
  OP.cloud.acceptProject({id,referenceId:'reference-1',version:6,data:{...OP.app.pj,risks:{v:1,analyses:[]}}});
  await OP.cloud.flush();assert.equal(bodies.length,1);assert.equal(OP.cloud.wrapper.version,6);
});

test('reference preview is read-only until confirmation and stale previews cannot be applied', async () => {
  const calls=[];let preview;
  const fixture=setup(async (url, options) => {
    calls.push({url,options});const body=JSON.parse(options.body);
    if(url.endsWith('/reference-preview'))return json(preview);
    return json({id,referenceId:body.referenceId,version:body.expectedVersion+1,data:body.data});
  });
  attachBase(fixture);const {OP}=fixture;
  await OP.cloud.flush();calls.length=0;
  const before=JSON.stringify(OP.app.pj);let modal='';
  OP.ui.$=selector=>selector==='#cloudReferenceTarget'?{value:'reference-2'}:null;
  OP.ui.modal=(_,html)=>{modal=html;};OP.ui.closeModal=()=>{};
  const tax={creditCents:123,complete:false,missing:1};
  preview={expectedVersion:OP.cloud.wrapper.version,referenceId:'reference-2',currentReference:'08/2026',nextReference:'09/2026',current:{direct:100,price:125,days:1,iva:tax,items:[]},next:{direct:200,price:250,days:2,iva:tax,items:[]},data:{...OP.app.pj,sinapiReferenceId:'reference-2'}};
  await OP.ui.act.cloudReferencePreview({disabled:false});
  assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/reference-preview'));
  assert.equal(JSON.stringify(OP.app.pj),before);assert.match(modal,/Aplicar ao orçamento/);assert.match(modal,/parcial/);
  OP.cloud.wrapper.version++;
  await OP.ui.act.cloudReferenceApply({disabled:false});assert.equal(calls.length,1);assert.equal(fixture.reloads,0);
  preview.expectedVersion=OP.cloud.wrapper.version;
  await OP.ui.act.cloudReferencePreview({disabled:false});
  await OP.ui.act.cloudReferenceApply({disabled:false});
  assert.equal(calls.at(-1).options.method,'PUT');assert.equal(JSON.parse(calls.at(-1).options.body).referenceId,'reference-2');
  assert.equal(fixture.reloads,1);
});
