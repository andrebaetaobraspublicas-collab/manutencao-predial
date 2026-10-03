import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { compareMirrors, quoteIdentifier, rowDigest, scanPrivateFiles } from './verify-deployment-mirror.mjs';

const manifest = () => ({
  format: 'orcapro-deployment-mirror-1', database: 'source',
  tables: [{ name: 'User', columns: [{ name: 'id', type: 'char(36)' }], schemaSha256: 'schema', rowCount: '2', rowsSha256: rowDigest([['41', null], ['42', '']]) }],
  foreignKeys: [{ table: 'TenantMembership', name: 'userId_fk', referencedTable: 'User', columns: [{ local: 'userId', reference: 'id' }], orphans: '0' }],
  files: [{ key: 'tenant/document.pdf', size: '3', sha256: 'digest' }],
});

test('a new database name can have an identical schema, records and private files', () => {
  const source = manifest(), target = manifest();
  target.database = 'production';
  assert.equal(compareMirrors(source, target).status, 'identical');
});

test('changed records, missing tables and orphan references fail the mirror gate', () => {
  const source = manifest(), target = manifest();
  target.tables[0].rowsSha256 = 'changed';
  target.foreignKeys[0].orphans = '1';
  assert.equal(compareMirrors(source, target).status, 'different');
  target.tables = [];
  assert.match(compareMirrors(source, target).differences.join('\n'), /Table missing/);
});

test('NULL, empty, zero and column boundaries have different record digests', () => {
  assert.notEqual(rowDigest([[null]]), rowDigest([['']]));
  assert.notEqual(rowDigest([['']]), rowDigest([['0']]));
  assert.notEqual(rowDigest([['AB', 'C']]), rowDigest([['A', 'BC']]));
  assert.equal(quoteIdentifier('table`name'), '`table``name`');
  assert.throws(() => quoteIdentifier(''), /Invalid/);
});

test('private file verification detects content changes and refuses symlink escapes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orcapro-mirror-test-'));
  try {
    await mkdir(join(root, 'tenant'));
    await writeFile(join(root, 'tenant', 'document.pdf'), 'first');
    const first = await scanPrivateFiles(root);
    await writeFile(join(root, 'tenant', 'document.pdf'), 'other');
    const second = await scanPrivateFiles(root);
    const source = manifest(), target = manifest();
    source.files = first; target.files = second;
    assert.equal(compareMirrors(source, target).status, 'different');
    await symlink(root, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(() => scanPrivateFiles(root), /symbolic link/);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'orcapro-mirror-test-'));
    await rm(root, { recursive: true, force: true });
  }
});
