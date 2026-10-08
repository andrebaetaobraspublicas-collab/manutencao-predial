const test = require('node:test'), assert = require('node:assert/strict');
const H = require('./harness.cjs');
const { fixture, cycleId, projectId } = require('./bridge-harness.cjs');
const copy = x => JSON.parse(JSON.stringify(x));
const rj = { id: '44444444-4444-4444-8444-444444444444', uf: 'RJ', ref: '2026-07', status: 'PUBLISHED' };
const sp = { id: cycleId, uf: 'SP', ref: '2026-07', status: 'PUBLISHED' };
const cycles = [rj, sp];
function dialogs(O) {
  const seen = [];
  O.ui.modal = (title, html, options) => { O.ui.closeModal(); seen.push({ title, html }); O.app.modal = options; };
  O.ui.closeModal = () => { O.app.modal?.onClose?.(); O.app.modal = null; };
  O.ui.toast = message => seen.push({ message }); O.ui.money = x => x == null ? '—' : String(x);
  O.util.esc = String;
  return seen;
}
test('Somente Orçamento compara custos e IVA; cancelar descarta confirmação', async () => {
  const f = await fixture({ cycles }), seen = dialogs(f.O);
  f.O.app.view = 'budget';
  await f.O.ui.chg.infraUF({ value: 'RJ' });
  assert.equal(f.project().cycleId, cycleId); assert.equal(f.O.app.pj.uf, 'SP');
  assert.match(seen.at(-1).html, /Crédito de IVA/); assert.match(seen.at(-1).html, /1500 · parcial/);
  f.O.ui.closeModal(); await f.O.ui.act.infraApplyReference();
  assert.equal(f.requests.filter(x => x.route.endsWith('/migrate-cycle') && x.body.dryRun === false).length, 0);
});
test('Confirmar cria versão com a nova UF/ciclo e recarrega todos os motores', async () => {
  const f = await fixture({ cycles }); dialogs(f.O);
  f.O.app.view = 'budget';
  await f.O.infra.compareReference(rj); const reviewed = f.project().version;
  await f.O.ui.act.infraApplyReference();
  assert.equal(f.project().version, reviewed + 1); assert.equal(f.project().cycleId, rj.id);
  assert.equal(f.project().data.uf, 'RJ'); assert.equal(f.project().data.sicroCycleId, rj.id); assert.equal(f.ctx.reloaded, true);
  assert.equal(f.O.infra.lastSaved, JSON.stringify(f.project().data));
});
test('Alteração após comparar invalida confirmação e mantém a referência original', async () => {
  const f = await fixture({ cycles }), seen = dialogs(f.O);
  f.O.app.view = 'budget';
  await f.O.infra.compareReference(rj); f.O.app.pj.name = 'Editado depois da comparação';
  await f.O.ui.act.infraApplyReference();
  assert.equal(f.project().cycleId, cycleId); assert.ok(!f.ctx.reloaded); assert.match(seen.at(-1).message, /versão alterada/);
});
test('Seleção rejeita UF/data-base ausentes, rascunhos abertos e revisões antigas duplicadas', async () => {
  const old = { ...rj, id: '55555555-5555-4555-8555-555555555555' };
  const f = await fixture({ cycles: [...cycles, old, { ...rj, id: '66666666-6666-4666-8666-666666666666', uf: 'AC', status: 'DRAFT' }] }); dialogs(f.O);
  f.O.app.view = 'budget';
  assert.deepEqual(copy(f.O.infra.referenceChoices()).map(x => x.id).sort(), [sp.id, rj.id].sort());
  await f.O.ui.chg.infraReference({ value: '2026-08' });
  assert.equal(f.requests.filter(x => x.route.endsWith('/migrate-cycle')).length, 0);
  f.O.risks = { dirty: true }; await assert.rejects(f.O.infra.compareReference(rj), /riscos/);
});
test('Preços por UF consultam o relatório e calculam CD sob demanda, sem DMT/FIT/FIC da obra', async () => {
  const ctx = H.loadExtracted(), O = ctx.OP, raw = copy(O.app.base.officialRaw), rawRJ = copy(raw);
  rawRJ.ufs = ['RJ']; rawRJ.cidades = ['Rio de Janeiro'];
  // Change the material prices; all analytic coefficients remain untouched.
  for (const key of ['v', 'vcd']) rawRJ.ins[key] = rawRJ.ins[key].map((v, i) => rawRJ.ins.k[i] === 0 && v != null ? v * 2 : v);
  const officialRJ = O.register.makeBase(rawRJ, rj.id, [], [], []);
  rawRJ.comp.o = Array.from(officialRJ.costTable('RJ', 'SD', true).cost);
  const data = copy(O.app.pj); data.id = projectId; data.sicroCycleId = cycleId;
  const f = await fixture({ context: ctx, data, cycles, raw, raws: { [rj.id]: rawRJ }, pem: ctx.OP_DATA.pem });
  const originalBase = O.app.base, originalHash = f.O.infra.catalogHash;
  for (const rg of ['SD', 'CD', 'SE']) {
    O.app.pj.rg = rg; const before = JSON.stringify(O.app.pj);
    const result = await O.infra.pricesByUF(909620);
    for (const row of result.rows) {
      const b = O.register.makeBase(row.uf === 'RJ' ? rawRJ : raw, row.cycleId, O.app.inputs, O.app.customs, data.sicroPriceQuotes || []);
      assert.equal(row.value, b.compCost(909620, row.uf, rg));
    }
    assert.notEqual(result.rows[0].value, result.rows[1].value);
    assert.equal(JSON.stringify(O.app.pj), before); assert.equal(O.app.base, originalBase); assert.equal(O.infra.catalogHash, originalHash);
  }
  const missing = await O.infra.pricesByUF('CP-NOT-FOUND'); assert.ok(missing.rows.every(x => x.value == null));
});

test('Sair do Orçamento invalida a aplicação de um comparativo pendente', async () => {
  const f = await fixture({ cycles }); dialogs(f.O); f.O.app.view = 'budget';
  await f.O.infra.compareReference(rj); f.O.app.view = 'catalog'; await f.O.ui.act.infraApplyReference();
  assert.equal(f.project().cycleId, cycleId);
  assert.equal(f.requests.filter(x => x.route.endsWith('/migrate-cycle') && x.body.dryRun === false).length, 0);
});

test('Catálogo, Insumos e Composições têm consulta independente, inclusive mês, regime, filtros e IVA', async () => {
  const ctx = H.loadExtracted(), O = ctx.OP, raw = copy(O.app.base.officialRaw), rawRJ = copy(raw);
  rawRJ.ufs = ['RJ']; rawRJ.cidades = ['Rio de Janeiro']; rawRJ.comp.o[0] += 123;
  const august = { ...rj, id: '77777777-7777-4777-8777-777777777777', ref: '2026-08' }, rawAugust = copy(rawRJ);
  rawAugust.ref = '08/2026'; rawAugust.comp.o[0] += 456;
  const calls = [], actualProject = O.app.pj;
  for (const name of ['catalog', 'inputs', 'compositions']) O.ui.views[name] = {
    render: () => { calls.push([name, O.app.pj.uf, O.app.base.raw.ref, O.app.base.compCost(raw.comp.c[0], O.app.pj.uf, 'SD')]); O.ui.model(); return 'consulta'; },
    after: () => calls.push(['after', O.app.pj.uf]),
  };
  O.ui.renderTop = () => {};
  const f = await fixture({ context: ctx, data: copy(actualProject), cycles: [...cycles, august], raw, raws: { [rj.id]: rawRJ, [august.id]: rawAugust } }); dialogs(O);
  const model = O.ui.model(), originalBase = O.app.base, projectBefore = JSON.stringify(O.app.pj), version = f.project().version;
  const rawBefore = JSON.stringify(originalBase.officialRaw), attach = O.iva.attach; let budgetCredits = 0;
  O.iva.attach = (...args) => { budgetCredits++; return attach(...args); };
  // Count evaluations on consultation instances; reading stored SD prices must
  // not calculate the entire catalog or rebuild the budget/IVA model.
  const makeBase = O.register.makeBase; let calculated = 0;
  O.register.makeBase = (...args) => { const b = makeBase(...args), calc = b._calc; b._calc = (...a) => { calculated++; return calc.apply(b, a); }; return b; };
  for (const view of ['catalog', 'inputs', 'compositions']) {
    O.app.view = view; await O.ui.chg.infraUF({ value: 'RJ' });
    O.ui.views[view].render(); O.ui.views[view].after();
    assert.deepEqual(calls.at(-2), [view, 'RJ', '07/2026', rawRJ.comp.o[0]]);
    assert.deepEqual(calls.at(-1), ['after', 'RJ']);
    assert.equal(O.ui.model(), model); assert.equal(O.app.base, originalBase);
    assert.equal(JSON.stringify(O.app.pj), projectBefore); assert.equal(f.project().version, version);
  }
  O.ui.chg.infraConsultRegime({ value: 'CD' }); assert.equal(O.app.pj.rg, actualProject.rg);
  await O.ui.chg.infraReference({ value: '2026-08' }); O.ui.views.compositions.render();
  assert.deepEqual(calls.at(-1), ['compositions', 'RJ', '08/2026', rawAugust.comp.o[0]]);
  assert.equal(calculated, 0);
  O.infra.withConsultation(() => {
    const b = O.app.base;
    const reference = makeBase(rawAugust, august.id, [], [], []);
    for (const code of [909620, 4011209]) {
      assert.equal(b.compCost(code, 'RJ', 'CD'), reference.compCost(code, 'RJ', 'CD'));
      assert.equal(b.analytic(code, 'RJ', 'SD').totalC, reference.analytic(code, 'RJ', 'SD').totalC);
      assert.deepEqual(copy(b.breakdown(code, 'RJ', 'SD')), copy(reference.breakdown(code, 'RJ', 'SD')));
    }
  });
  assert.ok(calculated > 0 && calculated < raw.comp.c.length / 10, 'only requested auxiliary dependencies are evaluated');
  O.infra.withConsultation(() => { const credit = O.iva.forCode(909620); assert.ok(O.iva.evaluate(credit, 2033).total.creditCents >= 0); O.ui.model(); });
  assert.equal(budgetCredits, 0, 'unit IVA consultation must not rebuild whole-budget credits');
  O.infra.withConsultation(() => {
    const reference = makeBase(rawAugust, august.id, [], [], []);
    assert.deepEqual(Array.from(O.app.base.costTable('RJ', 'CD').cost), Array.from(reference.costTable('RJ', 'CD').cost), 'lazy evaluation preserves every CD composition cost');
  });
  assert.throws(() => O.infra.withConsultation(() => { throw Error('falha de renderização'); }), /renderização/);
  assert.equal(O.app.base, originalBase); assert.equal(JSON.stringify(O.app.pj), projectBefore);
  assert.equal(JSON.stringify(originalBase.officialRaw), rawBefore, 'consultation must not rewrite shared flat analytical vectors');
  assert.equal(f.requests.filter(x => x.method !== 'GET').length, 0, 'consultation makes no POST/PUT/flush');
  O.register.editor = { draft: {} }; await O.ui.chg.infraUF({ value: 'SP' });
  assert.equal(O.infra.consultation.cycle.id, august.id); O.register.editor = null;
  O.app.view = 'budget'; await O.ui.chg.infraUF({ value: 'RJ' });
  assert.equal(f.requests.filter(x => x.route.endsWith('/migrate-cycle') && x.body.dryRun).length, 1);
  assert.equal(O.app.pj.uf, 'SP'); const reviewed = f.project().version;
  O.ui.closeModal(); await O.ui.act.infraApplyReference(); assert.equal(f.project().version, reviewed);
  // Even a bar clicked from the budget drawer only navigates to consultation.
  await O.ui.act.setUF({ dataset: { uf: 'RJ' } });
  assert.equal(O.app.view, 'catalog'); assert.equal(O.app.pj.uf, 'SP');
  assert.equal(f.requests.filter(x => x.route.endsWith('/migrate-cycle')).length, 1);
});

test('Respostas atrasadas de consulta não substituem a última UF selecionada nem gravam projeto', async () => {
  const f = await fixture({ cycles, raw: { ufs: ['SP'], ref: '2026-07' }, raws: { [rj.id]: { ufs: ['RJ'], ref: '2026-07' } } }); dialogs(f.O);
  f.O.app.view = 'catalog';
  const fetch = f.ctx.fetch; let release;
  f.ctx.fetch = async (...args) => { if (args[0].includes(rj.id)) await new Promise(resolve => { release = resolve; }); return fetch(...args); };
  const first = f.O.infra.consultReference(rj);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await f.O.infra.consultReference(sp); release(); await first;
  assert.equal(f.O.infra.consultation.cycle.id, sp.id); assert.equal(f.O.infra.consultation.loading, false);
  assert.equal(f.O.app.pj.uf, 'SP'); assert.equal(f.project().version, 1);
  assert.ok(f.requests.every(x => x.method === 'GET'));
});

test('Telas originais, filtro, CSV e cópia própria usam a consulta; adicionar usa a referência da obra', async () => {
  const ctx = H.loadExtracted(), O = ctx.OP, raw = copy(O.app.base.officialRaw), rawRJ = copy(raw);
  rawRJ.ufs = ['RJ']; rawRJ.cidades = ['Rio de Janeiro'];
  rawRJ.ins.v = rawRJ.ins.v.map((v, i) => rawRJ.ins.k[i] === 0 && v != null ? v * 2 : v);
  const index = raw.ins.c.indexOf('M0043'), results = { innerHTML: '' };
  O.ui.$ = selector => selector === '#regResults' ? results : null;
  O.ui.renderTop = () => {};
  const f = await fixture({ context: ctx, cycles, raw, raws: { [rj.id]: rawRJ } }); dialogs(O);
  O.ui.model(); const before = JSON.stringify(O.app.pj), base = O.app.base;
  O.app.view = 'inputs'; await O.ui.chg.infraUF({ value: 'RJ' });
  assert.match(O.ui.views.inputs.render(), /07\/2026.*RJ/);
  O.ui.chg.regFilter({ value: 'SD', dataset: { k: 'view' } });
  O.register.state.I.q = 'M0043'; O.ui.views.inputs.after();
  assert.match(results.innerHTML, /RJ · valores em R\$/);
  assert.ok(results.innerHTML.includes(O.util.num(rawRJ.ins.v[index], 2)));
  let csv; O.exp.download = (_name, data) => { csv = data; };
  O.ui.act.regCSV({ dataset: { type: 'I' } }); assert.match(csv, /;"RJ";"07\/2026";/);
  const draft = O.register.cloneInput('M0043');
  assert.equal(draft.prices[0].uf, 'RJ'); assert.equal(draft.prices[0].base, rawRJ.ins.v[index]);
  assert.equal(O.register.validateInput(draft).errors.length, 0);
  assert.equal(JSON.stringify(O.app.pj), before);
  const add = O.engine.addItem; let added;
  O.engine.addItem = (...args) => { added = { uf: O.app.pj.uf, base: O.app.base, code: args[2] }; return add(...args); };
  O.ui.commit = () => {}; O.ui.act.nativeInputAdd({ dataset: { code: 'M0043' } });
  assert.equal(added.uf, 'SP'); assert.equal(added.base, base);
  assert.equal(O.app.pj.uf, 'SP'); assert.equal(O.app.base, base);
  // The input-add test mutates the project deliberately; preceding consultation
  // actions must not have performed any persistence or whole-budget migration.
  assert.ok(f.requests.every(x => x.method === 'GET'));
});
