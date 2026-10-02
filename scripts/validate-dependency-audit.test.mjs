import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const check = fileURLToPath(new URL('./validate-dependency-audit.mjs', import.meta.url));
const empty = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } };
function execute(report) {
  const directory = mkdtempSync(join(tmpdir(), 'orcapro-audit-'));
  const file = join(directory, 'audit.json');
  try {
    writeFileSync(file, JSON.stringify(report));
    return spawnSync(process.execPath, [check, file], { encoding: 'utf8' });
  } finally { unlinkSync(file); rmdirSync(directory); }
}
test('accepts a complete, successful zero-vulnerability audit', () => { assert.equal(execute(empty).status, 0); });
test('rejects registry errors instead of interpreting them as zero vulnerabilities', () => { assert.notEqual(execute({ error: { code: 'EAI_AGAIN' } }).status, 0); });
test('rejects missing metadata and incompatible report versions', () => {
  assert.notEqual(execute({ vulnerabilities: {} }).status, 0);
  assert.notEqual(execute({ ...empty, auditReportVersion: 1 }).status, 0);
});
test('rejects counters inconsistent with the detailed vulnerabilities', () => {
  assert.notEqual(execute({ ...empty, metadata: { vulnerabilities: { ...empty.metadata.vulnerabilities, critical: 1, total: 1 } } }).status, 0);
});
test('rejects unexpected high severity dependencies', () => {
  const report = { ...empty, vulnerabilities: { sample: { severity: 'high', via: [] } }, metadata: { vulnerabilities: { ...empty.metadata.vulnerabilities, high: 1, total: 1 } } };
  assert.notEqual(execute(report).status, 0);
});
