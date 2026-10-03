import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { maintenanceSeedEnabled } from './maintenance-deploy-seed.mjs';

test('development retains the existing seed, but commercial restores can opt out', () => {
  assert.equal(maintenanceSeedEnabled(undefined), true);
  assert.equal(maintenanceSeedEnabled('true'), true);
  assert.equal(maintenanceSeedEnabled('false'), false);
  assert.throws(() => maintenanceSeedEnabled('FALSE'), /must be true or false/);
});

test('disabled seed exits without invoking Prisma or connecting to a database', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./maintenance-deploy-seed.mjs', import.meta.url))], {
    encoding: 'utf8',
    env: { ...process.env, SEED_MAINTENANCE_ON_DEPLOY: 'false', DATABASE_URL: 'not-a-database-url' },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /restored data preserved/);
  assert.equal(result.stderr, '');
});
