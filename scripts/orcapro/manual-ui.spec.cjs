'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), crypto = require('node:crypto');
const { loadLegacyRuntime } = require('../../apps/api/src/modules/orcapro/legacy/assets/runtime.cjs');
const root = path.resolve(__dirname, '../..'), content = JSON.parse(fs.readFileSync(__dirname + '/manual-content.json'));
function setup(storageError = false) {
  const { OP } = loadLegacyRuntime(), downloads = [], storage = {}, nodes = {};
  OP.app.pj = OP.engine.newProject(); OP.app.pj.name = 'Projeto de teste';
  OP.ui.render = () => {}; OP.ui.$ = id => nodes[id] ||= { innerHTML: '', scrollTo() {} };
  OP.exp.download = (name, text, type) => downloads.push({ name, text, type });
  const context = { OP, ORCAPRO_MANUAL: content, addEventListener() {}, document: { addEventListener() {}, getElementById: () => null },
    localStorage: { getItem(k) { if (storageError) throw new Error('blocked'); return storage[k]; }, setItem(k, v) { if (storageError) throw new Error('blocked'); storage[k] = v; } } };
  context.window = context; vm.createContext(context);
  // The immutable tax module supplies the actual engine; project configuration is not involved.
  vm.runInContext(fs.readFileSync(root + '/apps/api/src/modules/orcapro/legacy/assets/modules/027-28_abc_ui.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync(__dirname + '/manual-ui.js', 'utf8'), context); context.installOrcaProManual();
  return { OP, downloads, nodes, storage };
}
test('all chapters, journeys, module targets and primary references are internally consistent', () => {
  const ids = content.chapters.map(c => c.id); assert.equal(new Set(ids).size, ids.length); assert.ok(ids.length >= 29);
  const targets = ['portal', 'catalog', 'inputs', 'compositions', 'budget', 'bdi', 'crews', 'schedule', 'resources', 'evento', 'reforma', 'risks', 'base'];
  for (const c of content.chapters) {
    assert.ok(targets.includes(c.target)); assert.ok(c.title && c.summary && c.category && c.sections.length > 0);
    for (const r of c.related) assert.ok(ids.includes(r), r);
    for (const s of c.sections) {
      assert.ok(s.title && (s.body || s.steps || s.formula || s.table));
      if (s.table) assert.ok(s.table.rows.every(r => r.length === s.table.headers.length));
    }
    for (const id of c.sources || []) assert.ok(content.sources.some(s => s.id === id));
  }
  assert.equal(content.journeys.length, 4); for (const j of content.journeys) for (const id of j.chapters) assert.ok(ids.includes(id));
  assert.ok(['schedule', 'bdi', 'reforma', 'risks', 'evento', 'resources'].every(t => content.chapters.some(c => c.target === t)));
  for (const s of content.sources) { const url = new URL(s.url); assert.equal(url.protocol, 'https:'); assert.ok(/(?:caixa|ibge|tcu|planalto)\.gov\.br$|^www\.gov\.br$/.test(url.hostname)); }
});
test('accent insensitive search finds tax methodology and keyboard fields retain input; navigation stays allowlisted', () => {
  const { OP, nodes } = setup(); let renders = 0; OP.ui.render = () => { renders++; };
  OP.ui.inp.manualSearch({ value: 'depreciacao' });
  assert.equal(renders, 0, 'Typing must not rebuild and detach the focused input');
  assert.ok(nodes['.manual-index nav'].innerHTML.includes('19. Equipamentos'));
  OP.ui.inp.manualSearch({ value: 'aquisição' });
  const html = OP.ui.views.manual.render(); assert.ok(html.includes('Pesquis')); assert.ok(html.includes('aquisição')); assert.ok(html.includes('data-fk="manual-search"'));
  OP.ui.act.manualJourney({ dataset: { id: 'plan' } }); assert.equal(OP.manual.state.chapter, 'orcamento');
  assert.ok(OP.ui.views.manual.render().includes('Do orçamento ao cronograma'));
  OP.ui.act.manualChapter({ dataset: { id: 'not-a-chapter' } }); assert.equal(OP.manual.state.chapter, 'orcamento');
  let target; OP.ui.act.go = x => { target = x.dataset.v; }; OP.ui.act.manualOpen({ dataset: { id: 'credito' } }); assert.equal(target, 'reforma');
});
test('read progress is optional and persists only chapter identifiers; no financial project changes', () => {
  for (const blocked of [false, true]) {
    const { OP, storage } = setup(blocked), before = JSON.stringify(OP.app.pj);
    OP.ui.act.manualRead(); OP.ui.act.manualSize({ dataset: { value: '0.1' } });
    assert.equal(OP.manual.state.read.has('inicio'), true); assert.equal(JSON.stringify(OP.app.pj), before);
    if (!blocked) assert.deepEqual(JSON.parse(storage['orcapro.manual.read.v1']), ['inicio']);
    OP.ui.act.manualRead(); assert.equal(OP.manual.state.read.size, 0);
  }
});
test('didactic price, capacity and risk examples show the actual formula relationship', () => {
  const { OP } = setup(), x = OP.manual.state.lab;
  const c = OP.manual.didacticCost(x); assert.equal(c.direct, 5000); assert.equal(c.price, 6250); assert.equal(c.work, 50); assert.equal(c.days, 4);
  const r = OP.manual.didacticRisk(x); assert.equal(r.contingency, 8000); assert.equal(r.r, .08);
  assert.ok(Math.abs(r.K - (1.124 * 1.01 * 1.08)) < 1e-10);
  assert.equal(OP.manual.didacticRisk({ ...x, target: 99000 }).r, 0);
});
test('interactive tax memory uses the preserved motor for included IVA, annexes, legacy transition and non-incidence', () => {
  const { OP } = setup(), x = OP.manual.state.lab, before = JSON.stringify(OP.app.pj);
  const tax = input => OP.manual.didacticTax({ ...x, ...input });
  assert.ok(Math.abs(tax({}).credito - 28) < 1e-8);
  assert.ok(Math.abs(tax({ value: 128, included: 'yes' }).baseLegal - 100) < 1e-8);
  assert.ok(Math.abs(tax({ value: 111.2, included: 'yes', annex: 'IX' }).credito - 11.2) < 1e-8);
  assert.ok(Math.abs(tax({ annex: 'IX', share: 50 }).credito - 5.6) < 1e-8);
  const transition = tax({ year: 2029, ibs: 1.92, cbs: 8.8 }); assert.ok(Math.abs(transition.residual - 16.2) < 1e-8); assert.ok(Math.abs(transition.credito - 8.98336) < 1e-8);
  assert.equal(tax({ profile: 'maoObra' }).credito, 0); assert.equal(tax({ annex: 'XIII' }).credito, 0);
  assert.equal(JSON.stringify(OP.app.pj), before);
});
test('lab edits update immediately without saving, and reject invalid numeric or enum values', () => {
  const { OP, nodes } = setup(); OP.manual.state.tab = 'labs'; const before = JSON.stringify(OP.app.pj);
  OP.ui.inp.manualLab({ type: 'number', dataset: { key: 'value' }, value: '200' });
  assert.equal(OP.manual.state.lab.value, 200); assert.ok(nodes['#manual-tax-result'].innerHTML.includes('56,00'));
  for (const value of ['', '-1', 'Infinity', '1e100']) OP.ui.inp.manualLab({ type: 'number', dataset: { key: 'people' }, value });
  assert.equal(OP.manual.state.lab.people, 2);
  OP.ui.chg.manualLab({ type: 'select-one', dataset: { key: 'year' }, value: '1900' }); assert.equal(OP.manual.state.lab.year, 2033);
  assert.equal(JSON.stringify(OP.app.pj), before);
});
test('full offline manual and search escape HTML; export includes every chapter, glossary and sources without active scripts', () => {
  const { OP, downloads } = setup(); const before = JSON.stringify(OP.app.pj);
  OP.ui.inp.manualSearch({ value: '\"><img src=x onerror=alert(1)>' }); assert.ok(!OP.ui.views.manual.render().includes('<img src=x'));
  OP.ui.act.manualExport(); const html = downloads[0].text;
  assert.ok(content.chapters.every(c => html.includes('id="chapter-' + c.id + '"')));
  assert.ok(html.includes('Glossário') && html.includes('Fontes primárias') && html.includes('IBS'));
  assert.ok(!/<script|\son\w+=/i.test(html)); assert.equal(JSON.stringify(OP.app.pj), before);
});
test('release manifest pins manual content/UI/styles with normalized checksums', () => {
  const manifest = JSON.parse(fs.readFileSync(root + '/apps/web/public/orcapro-legacy/manifest.json'));
  assert.equal(manifest.manualVersion, content.version);
  for (const [name, prop] of [['manual-content.json', 'manualContentSha256'], ['manual-ui.js', 'manualUiSha256'], ['manual-ui.css', 'manualCssSha256']]) {
    const source = fs.readFileSync(__dirname + '/' + name, 'utf8').replaceAll('\r\n', '\n');
    assert.equal(manifest[prop], crypto.createHash('sha256').update(source).digest('hex'));
  }
});
