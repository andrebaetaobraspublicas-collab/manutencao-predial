import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Retain the existing development deployment behavior. A restored commercial
// database must explicitly disable demonstration reconciliation.
export function maintenanceSeedEnabled(value) {
  if (value === undefined || value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('SEED_MAINTENANCE_ON_DEPLOY must be true or false.');
}

function main() {
  if (!maintenanceSeedEnabled(process.env.SEED_MAINTENANCE_ON_DEPLOY)) {
    console.log('Maintenance deployment seed disabled; restored data preserved.');
    return;
  }
  const require = createRequire(import.meta.url);
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'seed'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : 'Maintenance deployment seed failed.');
    process.exitCode = 1;
  }
}
