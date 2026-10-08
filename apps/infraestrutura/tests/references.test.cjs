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
test('UF/data-base: consulta compara custos e IVA sem alterar o orçamento; cancelar descarta confirmação', async () => {
  const f = await fixture({ cycles }), seen = dialogs(f.O);
  await f.O.ui.chg.infraUF({ value: 'RJ' });
  assert.equal(f.project().cycleId, cycleId); assert.equal(f.O.app.pj.uf, 'SP');
  assert.match(seen.at(-1).html, /Crédito de IVA/); assert.match(seen.at(-1).html, /1500 · parcial/);
  f.O.ui.closeModal(); await f.O.ui.act.infraApplyReference();
  assert.equal(f.requests.filter(x => x.route.endsWith('/migrate-cycle') && x.body.dryRun === false).length, 0);
});
test('Confirmar cria versão com a nova UF/ciclo e recarrega todos os motores', async () => {
  const f = await fixture({ cycles }); dialogs(f.O);
  await f.O.infra.compareReference(rj); const reviewed = f.project().version;
  await f.O.ui.act.infraApplyReference();
  assert.equal(f.project().version, reviewed + 1); assert.equal(f.project().cycleId, rj.id);
  assert.equal(f.project().data.uf, 'RJ'); assert.equal(f.project().data.sicroCycleId, rj.id); assert.equal(f.ctx.reloaded, true);
  assert.equal(f.O.infra.lastSaved, JSON.stringify(f.project().data));
});
test('Alteração após comparar invalida confirmação e mantém a referência original', async () => {
  const f = await fixture({ cycles }), seen = dialogs(f.O);
  await f.O.infra.compareReference(rj); f.O.app.pj.name = 'Editado depois da comparação';
  await f.O.ui.act.infraApplyReference();
  assert.equal(f.project().cycleId, cycleId); assert.ok(!f.ctx.reloaded); assert.match(seen.at(-1).message, /versão alterada/);
});
test('Seleção rejeita UF/data-base ausentes, rascunhos abertos e revisões antigas duplicadas', async () => {
  const old = { ...rj, id: '55555555-5555-4555-8555-555555555555' };
  const f = await fixture({ cycles: [...cycles, old, { ...rj, id: '66666666-6666-4666-8666-666666666666', uf: 'AC', status: 'DRAFT' }] }); dialogs(f.O);
  assert.deepEqual(copy(f.O.infra.referenceChoices()).map(x => x.id).sort(), [sp.id, rj.id].sort());
  await f.O.ui.chg.infraReference({ value: '2026-08' });
  assert.equal(f.requests.filter(x => x.route.endsWith('/migrate-cycle')).length, 0);
  f.O.risks = { dirty: true }; await assert.rejects(f.O.infra.compareReference(rj), /riscos/);
});
test('Preços por UF calculam com o motor original nos três regimes sem modificar projeto/base nem herdar SP', async () => {
  const ctx = H.loadExtracted(), O = ctx.OP, raw = copy(O.app.base.officialRaw), rawRJ = copy(raw);
  rawRJ.ufs = ['RJ']; rawRJ.cidades = ['Rio de Janeiro'];
  // Change the material prices; all analytic coefficients remain untouched.
  for (const key of ['v', 'vcd']) rawRJ.ins[key] = rawRJ.ins[key].map((v, i) => rawRJ.ins.k[i] === 0 && v != null ? v * 2 : v);
  const data = copy(O.app.pj); data.id = projectId; data.sicroCycleId = cycleId;
  const f = await fixture({ context: ctx, data, cycles, raw, raws: { [rj.id]: rawRJ }, pem: ctx.OP_DATA.pem });
  const originalBase = O.app.base, originalHash = f.O.infra.catalogHash;
  for (const rg of ['SD', 'CD', 'SE']) {
    O.app.pj.rg = rg; const before = JSON.stringify(O.app.pj);
    const result = await O.infra.pricesByUF(909620);
    for (const row of result.rows) {
      const b = O.register.makeBase(row.uf === 'RJ' ? rawRJ : raw, row.cycleId, O.app.inputs, O.app.customs, data.sicroPriceQuotes || []);
      b.setTransport(O.fit.effective(copy(O.app.pj))); b.setPem('', null);
      const fic = O.fic.overrides(copy(O.app.pj), b); if (fic) b.setFic(fic.sig, fic.arr);
      assert.equal(row.value, b.compCost(909620, row.uf, rg));
    }
    assert.notEqual(result.rows[0].value, result.rows[1].value);
    assert.equal(JSON.stringify(O.app.pj), before); assert.equal(O.app.base, originalBase); assert.equal(O.infra.catalogHash, originalHash);
  }
  const missing = await O.infra.pricesByUF('CP-NOT-FOUND'); assert.ok(missing.rows.every(x => x.value == null));
});
