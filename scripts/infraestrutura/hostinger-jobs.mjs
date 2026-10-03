import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const run = promisify(execFile);
const mode = process.argv[2];
try {
  if (!['imports', 'backup'].includes(mode)) throw new Error('Invalid operation.');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const domain = '/home/u296746636/domains/api.gestaodepredios.com.br';
  const actual = await realpath(root);
  if (userInfo().username !== 'u296746636' || !actual.startsWith(domain + '/hbuilds/versions/') || !actual.endsWith('/nodejs')) throw new Error('Development runtime identity mismatch.');
  const file = domain + '/hbuilds/config/.env';
  const metadata = await stat(file);
  if ((metadata.mode & 0o077) !== 0) throw new Error('Private environment permissions mismatch.');
  const env = { ...process.env, ...parse(await readFile(file)), INFRA_ENV_FILE: file };
  if (env.INFRA_ENABLED !== 'true') { console.log('Infraestrutura jobs disabled; no database operation.'); process.exit(0); }
  const web = new URL(env.WEB_BASE_URL);
  const db = new URL(env.INFRA_DATABASE_URL);
  const original = new URL(env.DATABASE_URL);
  if (web.protocol !== 'https:' || !['gestaodepredios.com.br', 'www.gestaodepredios.com.br'].includes(web.hostname) || decodeURIComponent(db.pathname) !== '/u296746636_orcapro_infra' || decodeURIComponent(original.pathname) === decodeURIComponent(db.pathname)) throw new Error('Development database allowlist mismatch.');
  const scripts = mode === 'backup' ? ['infraestrutura-backup.mjs'] : ['infraestrutura-process-imports.mjs', 'infraestrutura-purge.mjs'];
  for (const script of scripts) {
    await run(process.execPath, [resolve(root, 'apps/api/scripts', script)], { cwd: resolve(root, 'apps/api'), env, timeout: 9 * 60 * 1000, maxBuffer: 1024 * 1024 });
    console.log(JSON.stringify({ operation: script, completedAt: new Date().toISOString(), ok: true }));
  }
} catch {
  // Never forward child SQL errors, credentials or personal data to public CI logs.
  console.error('Infraestrutura development operation failed. Check the private configuration and migration status.'); process.exitCode = 1;
}
