import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseConfig, clientDefaults, privateDirectory, pruneBackups, requireIsolatedDevelopment } from './infraestrutura-backup.mjs';

test('backup exige banco novo e bloqueia ambiente comercial', () => {
  const config = { INFRA_ENABLED: 'true', INFRA_DATABASE_URL: 'mysql://new:p%40ss@127.0.0.1:3319/infra_test', DATABASE_URL: 'mysql://old:pass@127.0.0.1:3319/gp_test', WEB_BASE_URL: 'https://www.gestaodepredios.com.br' };
  assert.equal(requireIsolatedDevelopment(config).password, 'p@ss');
  assert.throws(() => requireIsolatedDevelopment({ ...config, INFRA_DATABASE_URL: config.DATABASE_URL }), /diferente/);
  assert.throws(() => requireIsolatedDevelopment({ ...config, WEB_BASE_URL: 'https://sistema.orcaproobras.com.br' }), /desenvolvimento/);
  assert.throws(() => requireIsolatedDevelopment({ ...config, INFRA_ENABLED: 'false' }), /INFRA_ENABLED/);
});

test('defaults protege aspas e nunca permite injeção de nova opção', () => {
  const parsed = databaseConfig('mysql://infra:p%22%5C%40ss@127.0.0.1/infra_test');
  const ini = clientDefaults(parsed);
  assert.ok(ini.includes('password="p\\"\\\\@ss"'));
  assert.throws(() => databaseConfig('mysql://infra:p%0Aevil@localhost/db'), /caracteres/);
  assert.throws(() => databaseConfig('mysql://infra:p@localhost/--all-databases'), /obrigatórios/);
  assert.throws(() => privateDirectory('C:/hosting/public_html/backups'), /público/);
  assert.throws(() => privateDirectory('relative/backups'), /absoluto/);
});

test('retenção elimina apenas arquivos próprios com mais de 14 dias', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'infra-backup-test-'));
  const now = Date.now();
  const oldBackup = 'infra-infra_test-20260101T010000000Z-1234abcd.sql.gz';
  const oldManifest = 'infra-infra_test-20260101T010000000Z-1234abcd.manifest.json';
  const newBackup = 'infra-infra_test-20261003T010000000Z-1234abcd.sql.gz';
  const other = 'infra-other_db-20260101T010000000Z-1234abcd.sql.gz';
  try {
    for (const filename of [oldBackup, oldManifest, newBackup, other, 'unrelated.sql.gz']) await writeFile(join(directory, filename), 'fixture');
    for (const filename of [oldBackup, oldManifest, other, 'unrelated.sql.gz']) await utimes(join(directory, filename), new Date(now - 15 * 86400000), new Date(now - 15 * 86400000));
    await mkdir(join(directory, 'infra-infra_test-20260101T010000000Z-1234ffff.sql.gz'));
    assert.equal(await pruneBackups(directory, 'infra_test', now), 2);
    const remaining = await readdir(directory);
    assert.ok(remaining.includes(newBackup));
    assert.ok(remaining.includes(other));
    assert.ok(remaining.includes('unrelated.sql.gz'));
    assert.equal(await readFile(join(directory, newBackup), 'utf8'), 'fixture');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
