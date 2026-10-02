import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { loadLegacyRuntime, LegacyRecord, LegacyRuntime } from './legacy-runtime';

const fixtureRoot = path.resolve(__dirname, '../../../../../../legacy/orcaplan-1.8.3');
const read = (file: string): LegacyRecord => JSON.parse(fs.readFileSync(path.join(fixtureRoot, file), 'utf8'));
const raw = read('sinapi-2026-08.raw.json');
const baseline = read('fixtures/baseline.json');
const fixture = (name: string) => read(`fixtures/${name}.project.json`);

describe('preserved OrçaPlan 1.8.3 engines', () => {
  let runtime: LegacyRuntime;
  beforeAll(() => { runtime = loadLegacyRuntime({ nowISO: baseline.clock }); });

  it('retains the supplied original and executable module checksums', () => {
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(path.join(fixtureRoot, 'original.html'))).digest('hex');
    expect(checksum).toBe('b0144a95f4ddd1c900196fa5aff41d085e854d3f9d833a2d565b4429f0c68a15');
    expect(runtime.manifest.sourceSha256).toBe(checksum);
    expect(runtime.manifest.modules).toHaveLength(41);
  });

  it.each(['demo', 'edificio'])('reproduces every frozen result of %s without changing the fixture', (name) => {
    const project = fixture(name);
    const before = JSON.stringify(project);
    const rawBefore = JSON.stringify(raw);
    expect(runtime.summarizeProject(raw, project)).toEqual(baseline.examples[name]);
    expect(JSON.stringify(project)).toBe(before);
    expect(JSON.stringify(raw)).toBe(rawBefore);
  });

  it('changes official costs with UF and regime and returns to the original context without a frozen price', () => {
    const base = runtime.createBase(raw, '2026-08-version-1');
    const values = [['SP', 'SD'], ['DF', 'SD'], ['SP', 'CD'], ['DF', 'CD'], ['SP', 'SE']]
      .map(([uf, rg]) => base.compCost(88309, uf, rg));
    expect(new Set(values).size).toBeGreaterThan(3);
    expect(base.compCost(88309, 'SP', 'SD')).toBe(values[0]);
    expect(base.comp(88309)).not.toHaveProperty('price');
    expect(base.comp(88309)).not.toHaveProperty('cost');
    const project = fixture('demo');
    project.uf = 'SP';
    project.rg = 'CD';
    const changed = runtime.calculateProject(raw, project).model;
    expect(changed.items.find((r: LegacyRecord) => r.node.code === 103328).unitCost)
      .toBe(changed.base.compCost(103328, 'SP', 'CD'));
    expect(changed.tot.direct).not.toBe(baseline.examples.demo.totals.direct);
    expect(runtime.summarizeProject(raw, fixture('demo'))).toEqual(baseline.examples.demo);
  });

  it('pins independent references, including prices, analytical coefficients and caches', () => {
    const minimal = (ref: string, prices: number[][], coefficient: number): LegacyRecord => ({
      v: 1, fonte: 'SINAPI', ref, emissao: 'synthetic test only', ufs: ['DF', 'SP'], cidades: ['', ''],
      encargos: {}, grupos: ['Fixture'], ct: [''], cls: ['MATERIAL'], un: ['UN'],
      ins: { c: [1], k: [0], d: ['Synthetic input'], u: [0], o: [0], p: [prices[0]], lab: { 1: { CD: prices[1], SE: prices[2] } } },
      comp: { c: [10], g: [0], d: ['Synthetic composition'], u: [0], s: [0], it: [[[1, coefficient]]] },
    });
    const august = minimal('08/2026', [[1001, 2001], [1501, 2501], [901, 1901]], 0.5);
    const september = minimal('09/2026', [[3001, 4001], [3501, 4501], [2901, 3901]], 0.25);
    const a = runtime.createBase(august, 'august');
    const b = runtime.createBase(september, 'september');
    expect(a.compCost(10, 'DF', 'SD')).toBe(500);
    expect(a.compCost(10, 'SP', 'CD')).toBe(1250);
    expect(b.compCost(10, 'DF', 'SD')).toBe(750);
    expect(b.compCost(10, 'SP', 'CD')).toBe(1125);
    expect(a.compCost(10, 'DF', 'SD')).toBe(500);
    const project = runtime.OP.engine.newProject('Historical reference');
    project.sinapiReferenceId = 'august';
    expect(() => runtime.calculateProject(september, project, { referenceId: 'september' })).toThrow('does not match');
  });

  it('preserves null/missing prices, signaled SP attribution and exact item truncation', () => {
    const base = runtime.createBase(raw, 'official');
    const inputIndex = raw.ins.p.findIndex((values: (number | null)[]) => values && values[0] == null && values[25] != null);
    expect(inputIndex).toBeGreaterThanOrEqual(0);
    expect(base.insPrice(inputIndex, 0, 'SD')).toEqual([raw.ins.p[inputIndex][25], true]);
    expect(base.compCost('unavailable', 'SP', 'SD')).toBeNull();
    expect(runtime.OP.sinapi.mulTrunc(33333333, 100)).toBe(33);
    // Product exceeds MAX_SAFE_INTEGER: the original BigInt branch remains exercised.
    expect(runtime.OP.sinapi.mulTrunc(10000000000, 1000001)).toBe(100000100);
  });

  it('isolates project-owned overlays and does not duplicate the official catalog', () => {
    const building = fixture('edificio');
    const withOwn = runtime.calculateProject(raw, building);
    expect(withOwn.base.nOfficialIns).toBe(6120);
    expect(withOwn.base.nComp).toBe(10547);
    expect(withOwn.base.ownInputs.size).toBe(7);
    expect(withOwn.base.custom.size).toBe(10);
    const other = runtime.calculateProject(raw, fixture('demo'));
    expect(other.base.ownInputs.size).toBe(0);
    expect(other.base.custom.size).toBe(0);
    expect(withOwn.base.comp('CP-ED-MURO30')).not.toBeNull();
    expect(other.base.comp('CP-ED-MURO30')).toBeNull();
  });

  it('responds to an edited team without silently recalibrating the example deadline', () => {
    const project = fixture('edificio');
    const original = runtime.calculateProject(raw, project);
    const row = original.model.items.find((r: LegacyRecord) => r.num === '6.1');
    expect(row).toBeDefined();
    const item = runtime.OP.engine.find(project, row.id).node;
    item.crew = Object.fromEntries(row.prod.rows.map((resource: LegacyRecord) => [resource.key, 1]));
    item.teams = 1;
    const edited = runtime.calculateProject(raw, project);
    expect(edited.model.byId.get(row.id).prod.Dh).toBeGreaterThan(row.prod.Dh);
    expect(edited.model.byId.get(row.id).prod.rows.every((resource: LegacyRecord) => resource.n === 1)).toBe(true);
    expect(edited.project.crewPlan.calibration).toEqual(project.crewPlan.calibration);
    expect(edited.model.T).toBeGreaterThanOrEqual(original.model.T);
  });

  it('keeps the original CPM link types, cycle signal and fractional durations', () => {
    const cpm = runtime.OP.cpm.run([{ id: 'A', dur: 2.5 }, { id: 'B', dur: 3 }],
      [{ from: 'A', to: 'B', type: 'SS', lag: 1.25 }], { fractional: true });
    expect(cpm.ES).toEqual([0, 1.25]);
    expect(cpm.T).toBe(4.25);
    const cyclic = runtime.OP.cpm.run([{ id: 'A', dur: 1 }, { id: 'B', dur: 1 }],
      [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }]);
    expect(cyclic.cycle).toEqual(['A', 'B']);
  });

  it('rejects a context absent from the selected project reference', () => {
    const project = fixture('demo');
    project.uf = 'ZZ';
    expect(() => runtime.calculateProject(raw, project)).toThrow('UF is unavailable');
    project.uf = 'DF';
    project.rg = 'UNKNOWN';
    expect(() => runtime.calculateProject(raw, project)).toThrow('Invalid SINAPI regime');
  });
});
