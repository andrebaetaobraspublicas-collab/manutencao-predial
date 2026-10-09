import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadLegacyRuntime } from './legacy-runtime';
const august = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../../../legacy/orcaplan-1.8.3/sinapi-2026-08.raw.json'), 'utf8'));

describe('September interpretation review', () => {
  it('distinguishes excavation with and without space for forms while keeping August immutable', () => {
    const { OP, createBase } = loadLegacyRuntime(), original = JSON.stringify(august);
    const old = createBase(august, 'august'), next = createBase({ ...august, ref: '09/2026' }, 'september');
    for (const [a, b] of [[96520, 96521], [96522, 96523], [96524, 96525], [96526, 96527]]) {
      const before = OP.factors.locate(old, a), after = OP.factors.locate(next, a), other = OP.factors.locate(next, b);
      expect(after.family.factors.some((f: { id: string }) => f.id === 'reviewed-variant')).toBe(true);
      expect(after.path).not.toEqual(other.path);
      expect(OP.factors.matches(after.family, after.path).map((m: { j: number }) => next.raw.comp.c[m.j])).toEqual([a]);
      expect(before.path).toEqual(OP.factors.locate(old, b).path);
    }
    expect(JSON.stringify(august)).toBe(original);
  });
  it('classifies reviewed equipment separately from price availability and does not fabricate credit', () => {
    const { OP, createBase } = loadLegacyRuntime();
    const raw = { v: 1, fonte: 'SINAPI', ref: '09/2026', emissao: '', ufs: ['SP'], cidades: [''], encargos: {},
      grupos: [], ct: [], cls: ['SEM PREÇO'], un: ['UN'],
      ins: { c: [45809, 45810], k: [0, 0], d: ['BATE-ESTACAS HIDRAULICO SOBRE ESTEIRAS, POTENCIA DE 310 HP', 'BATE-ESTACAS HIDRAULICO SOBRE ESTEIRAS, POTENCIA DE 158 HP'],
        u: [0, 0], o: [0, 0], p: [[null], [null]], lab: {} }, comp: { c: [], g: [], d: [], u: [], s: [], it: [] } };
    OP.app.pj = OP.engine.newProject(); OP.app.pj.uf = 'SP'; OP.app.pj.rg = 'SD';
    OP.app.base = createBase(raw, 'september');
    for (const c of raw.ins.c) {
      const e = OP.iva.forCode(c, 'I');
      expect(e.unknown[0].perfil).toBe('equipamento'); expect(e.unknown[0].reason).toMatch('Sem preço');
      for (const year of OP.iva.series(e)) { expect(year.creditCents).toBe(0); expect(year.missing).toBe(1); }
    }
    OP.app.base = createBase({ ...raw, ref: '08/2026' }, 'august');
    expect(OP.iva.forCode(45809, 'I').unknown[0].perfil).toBe('material');
  });
});
