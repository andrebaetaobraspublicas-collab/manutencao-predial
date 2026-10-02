#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { loadLegacyRuntime } = require('../../apps/api/src/modules/orcapro/legacy/assets/runtime.cjs');
const root = path.resolve(__dirname, '../..');
const assetRoot = path.join(root, 'apps/api/src/modules/orcapro/legacy/assets');
const legacyRoot = path.join(root, 'legacy/orcaplan-1.8.3');
const expectedHash = 'b0144a95f4ddd1c900196fa5aff41d085e854d3f9d833a2d565b4429f0c68a15';
const fixedClock = '2026-10-02T12:00:00-03:00';
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
const source = sourceIndex >= 0 ? args[sourceIndex + 1] : path.join(legacyRoot, 'original.html');
if (!source) throw new Error('Usage: node scripts/orcapro/extract-legacy.cjs --source <original HTML> [--update-fixtures]');
const binary = fs.readFileSync(source);
if (hash(binary) !== expectedHash) throw new Error('The original HTML checksum changed. Audit the source before creating a new version.');
const html = binary.toString('utf8');
const lines = html.split(/\r?\n/);
const embedded = html.match(/<script[^>]*id="op-base"[^>]*>([\s\S]*?)<\/script>/);
if (!embedded) throw new Error('Embedded SINAPI snapshot not found');
const raw = JSON.parse(zlib.gunzipSync(Buffer.from(embedded[1].trim(), 'base64')).toString('utf8'));
const start = lines.findIndex((line) => line.startsWith('/* ==== 00_core.js'));
const end = lines.findIndex((line, index) => index > start && line === '</script>');
if (start < 0 || end < 0) throw new Error('Legacy executable boundaries not found');
const boundaries = [];
for (let index = start; index < end; index++) {
  const match = lines[index].match(/^\/\* (?:==== )?([0-9]+[a-z]?_[a-zA-Z0-9_]+\.js)/);
  if (match) boundaries.push({ index, name: match[1] });
}
// Logical blocks without module markers remain in their original adjacent module.
// This preserves the exact execution order and all extension wrappers.
const manifest = {
  version: '1.8.3', sourceSha256: expectedHash, clockForFixtures: fixedClock,
  modules: boundaries.map((entry, ordinal) => {
    const finish = boundaries[ordinal + 1]?.index || end;
    const code = lines.slice(entry.index, finish).join('\n') + '\n';
    return { file: String(ordinal).padStart(3, '0') + '-' + entry.name,
      name: entry.name, firstLine: entry.index + 1, lastLine: finish,
      sha256: hash(code), code };
  }),
};
fs.mkdirSync(legacyRoot, { recursive: true });
fs.mkdirSync(path.join(assetRoot, 'modules'), { recursive: true });
fs.writeFileSync(path.join(legacyRoot, 'original.html'), binary);
for (const entry of manifest.modules) {
  fs.writeFileSync(path.join(assetRoot, 'modules', entry.file), entry.code, 'utf8');
  delete entry.code;
}
fs.writeFileSync(path.join(assetRoot, 'manifest.json'), json(manifest));
fs.writeFileSync(path.join(legacyRoot, 'sinapi-2026-08.raw.json'), json(raw));
fs.writeFileSync(path.join(legacyRoot, 'provenance.json'), json({
  sourceSha256: expectedHash, applicationVersion: '1.8.3', reference: raw.ref,
  emission: raw.emissao, inputs: raw.ins.c.length, compositions: raw.comp.c.length,
  analyticRows: raw.comp.it.reduce((sum, list) => sum + list.length, 0),
  note: 'Global official snapshot extracted from the supplied HTML; imported validation metadata is not a fresh validation against a downloaded CAIXA workbook.',
}));

if (args.includes('--update-fixtures')) {
  const fixtures = path.join(legacyRoot, 'fixtures');
  fs.mkdirSync(fixtures, { recursive: true });
  const runtime = loadLegacyRuntime({ assetsDirectory: assetRoot, nowISO: fixedClock });
  // Legacy UID contains Math.random(). Fixtures receive deterministic IDs while
  // preserving every reference to an ID (CPM links, campaigns and teamBasis).
  function stableIds(project, key) {
    const ids = new Map();
    let ordinal = 0;
    const visit = (node) => {
      if (node.id) ids.set(node.id, node.kind === 'stage' && node.id === 'root' ? 'root' : `${key}-${node.kind || 'node'}-${++ordinal}`);
      (node.children || []).forEach(visit);
    };
    ids.set(project.id, `${key}-project`);
    visit(project.root);
    const rewrite = (value) => {
      if (typeof value === 'string') return ids.get(value) || value;
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
      return value;
    };
    return rewrite(project);
  }
  const baseline = { sourceSha256: expectedHash, clock: fixedClock, examples: {} };
  for (const key of ['demo', 'edificio']) {
    const project = stableIds(runtime.buildExample(key, raw), key);
    fs.writeFileSync(path.join(fixtures, `${key}.project.json`), json(project));
    baseline.examples[key] = runtime.summarizeProject(raw, project);
  }
  fs.writeFileSync(path.join(fixtures, 'baseline.json'), json(baseline));
  fs.writeFileSync(path.join(fixtures, 'provenance.json'), json({
    sourceSha256: expectedHash, clock: fixedClock, examples: ['demo', 'edificio'],
    historicalSource: { project: 'edificio', originalMetadata: runtime.OP.examples.edificio.meta,
      warning: 'The source includes DF December/2025 historical fixed costs. The final v1.8.3 example uses the embedded August/2026 SP CD snapshot and explicit historical/quoted supplements; it is not a certified reconstruction of the December/2025 SINAPI catalog.' },
    fixturePolicy: 'Only this explicit --update-fixtures command writes the baseline. Jest only reads committed fixtures.',
  }));
}
console.log(`Extracted ${manifest.modules.length} original modules; SINAPI ${raw.ref}: ${raw.ins.c.length} inputs, ${raw.comp.c.length} compositions. Fixtures ${args.includes('--update-fixtures') ? 'explicitly updated' : 'unchanged'}.`);
