import { spawnSync } from 'node:child_process';

if (process.env.ORCAPRO_SEED_ON_DEPLOY !== 'true') {
  console.log('OrçaPro seed disabled; existing catalogs preserved.');
} else {
  const userId = process.env.ORCAPRO_SEED_ADMIN_USER_ID;
  if (!userId || !/^[a-f0-9-]{36}$/i.test(userId)) {
    throw new Error('ORCAPRO_SEED_ADMIN_USER_ID must identify an existing authorized user.');
  }
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/orcapro-seed.ts', '--confirm-orcapro-seed'], {
    stdio: 'inherit', env: process.env,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
