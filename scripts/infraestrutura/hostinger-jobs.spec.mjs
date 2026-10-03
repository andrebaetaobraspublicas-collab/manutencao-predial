import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import vm from 'node:vm';
import { parse } from 'dotenv';

const source = await readFile(new URL('./hostinger-jobs.mjs', import.meta.url), 'utf8');
const domain = '/home/u296746636/domains/api.gestaodepredios.com.br';
const release = `${domain}/hbuilds/versions/fixture/nodejs`;
const defaults = {
  INFRA_ENABLED: 'true',
  WEB_BASE_URL: 'https://www.gestaodepredios.com.br',
  INFRA_DATABASE_URL: 'mysql://fixture:fixture@localhost/u296746636_orcapro_infra',
  DATABASE_URL: 'mysql://fixture:fixture@localhost/identity_fixture',
};

/** Executes the real finite runner with synthetic OS/files/process dependencies. */
async function execute(options = {}) {
  const calls = [], logs = [], errors = [];
  const env = { ...defaults, ...options.env };
  const fixtureFile = Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n');
  const context = vm.createContext({
    resolve: posix.resolve, dirname: posix.dirname, fileURLToPath: () => `${release}/scripts/infraestrutura/hostinger-jobs.mjs`,
    userInfo: () => ({ username: options.user || 'u296746636' }),
    realpath: async () => options.runtime || release,
    stat: async () => ({ mode: options.permissions ?? 0o600 }),
    readFile: async file => { assert.equal(file, `${domain}/hbuilds/config/.env`); return fixtureFile; },
    parse, URL, Date,
    execFile: async (binary, args, settings) => {
      calls.push({ binary, args, settings });
      if (options.failChild) throw new Error('mysql://private:secret@host/database personal@example.invalid');
      return { stdout: 'PRIVATE SQL ROWS MUST NOT BE LOGGED', stderr: 'PRIVATE SQL ERROR' };
    },
    promisify: fn => fn,
    process: { argv: ['node', 'runner', options.operation || 'imports'], execPath: '/private/node', env: { INFRA_DATABASE_URL: 'mysql://evil:evil@host/production' }, exitCode: 0, exit: code => { const error = new Error('fixture.exit'); error.code = code; throw error; } },
    console: { log: value => logs.push(value), error: value => errors.push(value) },
  });
  const executable = source.replace(/^import .*?;\r?\n/gm, '').replaceAll('import.meta.url', '"file:///synthetic/runner"');
  await vm.runInContext(`(async()=>{${executable}\n})()`, context, { filename: 'hostinger-jobs.mjs' });
  return { calls, logs, errors, exitCode: context.process.exitCode };
}

test('executor usa apenas configuração privada DEV e CLIs finitos de importação/expurgo', async () => {
  const result = await execute();
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.calls.map(call => call.args[0].split('/').at(-1)), ['infraestrutura-process-imports.mjs', 'infraestrutura-purge.mjs']);
  assert.ok(result.calls.every(call => call.settings.env.INFRA_DATABASE_URL === defaults.INFRA_DATABASE_URL));
  assert.ok(result.calls.every(call => call.settings.env.INFRA_ENV_FILE === `${domain}/hbuilds/config/.env`));
  assert.ok(result.calls.every(call => call.settings.timeout === 9 * 60 * 1000));
  assert.equal(result.logs.length, 2);
  assert.equal(result.errors.length, 0);
  assert.doesNotMatch(result.logs.join('\n'), /PRIVATE|mysql:|personal/);
});

test('backup executa somente o cliente de backup dentro do release DEV', async () => {
  const result = await execute({ operation: 'backup' });
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].args[0], `${release}/apps/api/scripts/infraestrutura-backup.mjs`);
});

test('conta, runtime, permissões, domínio e banco fora da allowlist são recusados antes de operar', async () => {
  const variants = [
    { user: 'u999999999' },
    { runtime: '/home/u296746636/domains/api.orcaproobras.com.br/hbuilds/versions/fixture/nodejs' },
    { permissions: 0o644 },
    { env: { WEB_BASE_URL: 'https://sistema.orcaproobras.com.br' } },
    { env: { WEB_BASE_URL: 'http://www.gestaodepredios.com.br' } },
    { env: { INFRA_DATABASE_URL: 'mysql://fixture:fixture@localhost/production' } },
    { env: { DATABASE_URL: defaults.INFRA_DATABASE_URL } },
    { operation: 'arbitrary-shell-command' },
  ];
  for (const options of variants) {
    const result = await execute(options);
    assert.equal(result.exitCode, 1);
    assert.equal(result.calls.length, 0);
    assert.equal(result.errors.length, 1);
  }
});

test('falha do filho encerra operação sem revelar SQL, URL ou dados pessoais', async () => {
  const result = await execute({ failChild: true });
  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 1);
  assert.equal(result.logs.length, 0);
  assert.doesNotMatch(result.errors.join('\n'), /mysql:|secret|personal@|PRIVATE/);
});

test('workflow limita SSH à conta DEV e agenda importações e backup diário', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/infraestrutura-development-jobs.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /cron: '17 6 \* \* \*'/);
  assert.match(workflow, /SSH_HOST.*82\.180\.153\.142.*SSH_PORT.*65002.*SSH_USER.*u296746636/);
  assert.match(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /environment: orcapro-production/);
  assert.match(workflow, /permissions:\s+contents: read/);
});
