'use strict';
// Read-only acceptance audit of a parsed official snapshot against its predecessor.
// Usage: node scripts/orcapro/audit-reference.cjs RAW.json BEFORE.json OUTPUT.json
const fs = require('node:fs'), crypto = require('node:crypto');
const { loadLegacyRuntime } = require('../../apps/api/src/modules/orcapro/legacy/assets/runtime.cjs');
const [incoming, previous, output] = process.argv.slice(2);
if (!incoming || !previous || !output) throw new Error('Provide incoming, previous and output JSON paths');
const contents = fs.readFileSync(incoming), raw = JSON.parse(contents), old = JSON.parse(fs.readFileSync(previous));
const runtime = loadLegacyRuntime(), { OP } = runtime;
const base = runtime.createBase(raw, 'audit');
OP.app.base = base; OP.app.pj = OP.engine.newProject(); OP.app.inputs = []; OP.app.customs = [];
const report = { reference: raw.ref, sha256: crypto.createHash('sha256').update(contents).digest('hex'),
  groups: raw.grupos.length, compositions: raw.comp.c.length, inputs: raw.ins.c.length,
  trees: { covered: 0, invalid: [], ambiguous: [] }, checkedCompositions: [], newInputs: [],
  contexts: raw.ufs.length * 3, years: 8, taxChecks: 0, partialChecks: 0, issues: [], pending: [] };
const seen = new Set();
for (let gi = 0; gi < raw.grupos.length; gi++) {
  for (const family of OP.factors.forGroup(base, gi).families) {
    const paths = new Set();
    for (const member of family.members) {
      const code = raw.comp.c[member.j], path = JSON.stringify(member.v);
      if (seen.has(code) || member.v.length !== family.factors.length || member.v.some((v, i) => !family.factors[i].values[v])) report.trees.invalid.push(code);
      if (paths.has(path)) report.trees.ambiguous.push(code);
      seen.add(code); paths.add(path);
    }
  }
}
report.trees.covered = seen.size;
const oldCodes = new Map(old.comp.c.map((c, i) => [c, i])), oldInputs = new Set(old.ins.c);
for (let j = 0; j < raw.comp.c.length; j++) {
  const code = raw.comp.c[j], at = oldCodes.get(code);
  if (at == null || JSON.stringify(raw.comp.it[j]) !== JSON.stringify(old.comp.it[at])) report.checkedCompositions.push(code);
}
report.newInputs = raw.ins.c.filter(c => !oldInputs.has(c));
for (const code of report.checkedCompositions) {
  const p = OP.prod.calc(base, { code, qty: 1 }, 8.8);
  if (!Number.isFinite(p.days) || p.rows.some(r => !Number.isFinite(r.h) || r.h < 0 || r.n < 1)) report.issues.push({ code, kind: 'productivity' });
}
for (const uf of raw.ufs) for (const regime of ['SD', 'CD', 'SE']) {
  OP.app.pj.uf = uf; OP.app.pj.rg = regime;
  for (const [type, codes] of [['C', report.checkedCompositions], ['I', report.newInputs]]) for (const code of codes) {
    try {
      const e = OP.iva.forCode(code, type);
      if (e.unknown.length) report.pending.push({ uf, regime, type, code,
        inputs: [...new Set(e.unknown.map(x => x.cod))], reasons: [...new Set(e.unknown.map(x => x.reason))] });
      for (let year = 2026; year <= 2033; year++) {
        const v = OP.iva.evaluate(e, year, true), t = v.total;
        report.taxChecks++; if (!t.complete) report.partialChecks++;
        const sum = map => [...map.values()].reduce((n, x) => n + x.creditCents, 0);
        if (!Number.isSafeInteger(t.creditCents) || t.creditCents !== t.ibsCents + t.cbsCents ||
          sum(v.byABC) !== t.creditCents || sum(v.byService) !== t.creditCents ||
          v.lines.reduce((n, x) => n + x.creditCents, 0) !== t.creditCents) report.issues.push({ code, uf, regime, year, kind: 'tax-reconciliation' });
      }
    } catch (error) { report.issues.push({ code, uf, regime, kind: 'exception', message: error.message }); }
  }
}
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, checkedCompositions: report.checkedCompositions.length,
  newInputs: report.newInputs.length, pending: report.pending.length }));
if (report.issues.length || report.trees.invalid.length || report.trees.ambiguous.length || seen.size !== raw.comp.c.length) process.exitCode = 1;
