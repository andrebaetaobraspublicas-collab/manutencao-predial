import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = fileURLToPath(new URL('.', import.meta.url));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const sha = 'a'.repeat(40);
const valid = ['u528277311', '/home/u528277311/domains/api.orcaproobras.com.br', 'api.orcaproobras.com.br', sha, `${sha}-123-1`, `/home/u528277311/domains/api.orcaproobras.com.br/hbuilds/incoming/${sha}-123-1/api-source.tar.gz`, 'api-source'];

function validation(args) {
  const path = join(here, 'deploy-common.sh').replaceAll('\\', '/');
  return spawnSync(bash, ['-c', 'source "$1"; shift; validate_deployment_paths "$@"', 'test', path, ...args], { encoding: 'utf8' });
}

test('only the named production account, application and immutable artifact can be promoted', () => {
  assert.equal(validation(valid).status, 0);
  for (const [position, value] of [[0, 'root'], [1, '/home/u528277311'], [1, '/home/u528277311/domains/api.orcaproobras.com.br/../other'], [2, 'api.gestaodepredios.com.br'], [3, 'main'], [4, '../../previous'], [5, '/tmp/untrusted.tar.gz']]) {
    const changed = [...valid]; changed[position] = value;
    assert.notEqual(validation(changed).status, 0);
  }
});

test('the promotion scripts parse without exposing or requiring secret values', () => {
  for (const file of ['deploy-common.sh', 'promote-api-release.sh', 'promote-web-release.sh', 'prepare-development-runtime.sh']) {
    const result = spawnSync(bash, ['-n', join(here, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('Hostinger build limits preserve an existing Node preload while reducing account thread use', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orcapro-resource-test-'));
  try {
    const preload = join(directory, 'preload.cjs');
    await writeFile(preload, 'global.hostingerPreloaded = true;');
    const common = join(here, 'deploy-common.sh').replaceAll('\\', '/');
    const command = 'source "$1"; export NODE_OPTIONS="--require=\\"$3\\""; configure_hostinger_build_resources; "$2" -e \'console.log(JSON.stringify({tokio:process.env.TOKIO_WORKER_THREADS,uv:process.env.UV_THREADPOOL_SIZE,preload:global.hostingerPreloaded}))\'';
    const result = spawnSync(bash, ['-c', command, 'test', common, process.execPath.replaceAll('\\', '/'), preload.replaceAll('\\', '/')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { tokio: '2', uv: '1', preload: true });
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'orcapro-resource-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('production startup trusts only keys in the private file, preserves provider PORT and refuses a missing file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orcapro-startup-test-'));
  try {
    const nodejs = join(directory, 'hbuilds', 'versions', 'fixture-release', 'nodejs');
    const configuration = join(directory, 'hbuilds', 'config', '.env');
    await mkdir(join(nodejs, 'apps/api/dist'), { recursive: true });
    await mkdir(join(directory, 'hbuilds/config'), { recursive: true });
    const script = (await readFile(join(here, 'promote-api-release.sh'), 'utf8')).replaceAll('\r\n', '\n');
    const wrapper = script.match(/cat > main\.js <<'JAVASCRIPT'\n([\s\S]*?)\nJAVASCRIPT/)[1];
    await writeFile(join(nodejs, 'main.js'), wrapper);
    await writeFile(configuration, 'DATABASE_URL=private-db-fixture\nORCAPRO_STRIPE_MODE=LIVE\nORCAPRO_ONLY=true\nPORT=3000\n', { mode: 0o600 });
    await writeFile(join(nodejs, 'apps/api/dist/main.js'), `console.log(JSON.stringify({privateDatabase:process.env.DATABASE_URL==='private-db-fixture',mode:process.env.ORCAPRO_STRIPE_MODE,only:process.env.ORCAPRO_ONLY,port:process.env.PORT,providerOnly:process.env.PROVIDER_ONLY}));`);
    const environment = { ...process.env, NODE_PATH: resolve(here, '../../node_modules'), DATABASE_URL: 'provider-db-fixture', ORCAPRO_STRIPE_MODE: '"TEST"', ORCAPRO_ONLY: '"false"', PORT: '7777', PROVIDER_ONLY: 'retained-provider-fixture' };
    const start = env => spawnSync(process.execPath, [join(nodejs, 'main.js')], { encoding: 'utf8', env });
    const running = start(environment);
    assert.equal(running.status, 0, running.stderr);
    assert.deepEqual(JSON.parse(running.stdout), { privateDatabase: true, mode: 'LIVE', only: 'true', port: '7777', providerOnly: 'retained-provider-fixture' });
    const noProviderPort = { ...environment }; delete noProviderPort.PORT;
    assert.equal(JSON.parse(start(noProviderPort).stdout).port, '3000');
    await rm(configuration);
    const missing = start(environment);
    assert.notEqual(missing.status, 0);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /Private API configuration could not be loaded/);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'orcapro-startup-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('development startup parses quoted provider values through the private file and preserves the managed port', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orcapro-dev-startup-test-'));
  try {
    await mkdir(join(directory, 'apps/api/dist'), { recursive: true });
    const script = (await readFile(join(here, 'prepare-development-runtime.sh'), 'utf8')).replaceAll('\r\n', '\n');
    const wrapper = script.match(/cat > "\$wrapper_next" <<'JAVASCRIPT'\n([\s\S]*?)\nJAVASCRIPT/)[1];
    await writeFile(join(directory, 'main.cjs'), wrapper);
    await writeFile(join(directory, '.env'), 'ORCAPRO_STRIPE_MODE="TEST"\nORCAPRO_ONLY="false"\nPORT=3000\n', { mode: 0o600 });
    await writeFile(join(directory, 'apps/api/dist/main.js'), `console.log(JSON.stringify({mode:process.env.ORCAPRO_STRIPE_MODE,only:process.env.ORCAPRO_ONLY,port:process.env.PORT}));`);
    const environment = { ...process.env, NODE_PATH: resolve(here, '../../node_modules'), ORCAPRO_STRIPE_MODE: '"TEST"', ORCAPRO_ONLY: '"false"', PORT: '7777' };
    const running = spawnSync(process.execPath, [join(directory, 'main.cjs')], { encoding: 'utf8', env: environment });
    assert.equal(running.status, 0, running.stderr);
    assert.deepEqual(JSON.parse(running.stdout), { mode: 'TEST', only: 'false', port: '7777' });
    await rm(join(directory, '.env'));
    const missing = spawnSync(process.execPath, [join(directory, 'main.cjs')], { encoding: 'utf8', env: environment });
    assert.notEqual(missing.status, 0);
    assert.equal(missing.stdout, '');
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'orcapro-dev-startup-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('development routing changes only the recognized startup directive and preserves all other bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orcapro-routing-test-'));
  try {
    const helper = (await readFile(join(here, 'prepare-development-runtime.sh'), 'utf8')).replaceAll('\r\n', '\n');
    const code = helper.match(/python3 - "\$backup_root\/htaccess\.next" <<'PYTHON'\n([\s\S]*?)\nPYTHON/)[1];
    const file = join(directory, 'htaccess.fixture');
    const script = join(directory, 'rewrite.py'); await writeFile(script, code);
    const original = '# provider routing\r\nPassengerEnvVar FIXTURE "not-a-secret"\r\n  PassengerStartupFile\tapps/api/dist/main.js \r\nOptions -Indexes\r\n';
    await writeFile(file, original);
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const rewritten = spawnSync(python, [script, file], { encoding: 'utf8' });
    assert.equal(rewritten.status, 0, rewritten.stderr);
    assert.equal(await readFile(file, 'utf8'), original.replace('apps/api/dist/main.js', 'orcapro-hostinger-main.cjs'));
    const unexpected = original.replace('apps/api/dist/main.js', 'custom-operator-main.cjs');
    await writeFile(file, unexpected);
    assert.notEqual(spawnSync(python, [script, file]).status, 0);
    assert.equal(await readFile(file, 'utf8'), unexpected);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'orcapro-routing-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('runtime environment linking is idempotent and rejects conflicting files, external releases and public permissions', { skip: process.platform === 'win32' ? 'Hostinger ownership, permission and symlink rules require Linux; CI runs this fixture on Linux.' : false }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orcapro-runtime-env-test-'));
  try {
    const domain = join(directory, 'domain');
    const runtime = join(domain, 'hbuilds/versions/release-one/nodejs');
    const configuration = join(domain, 'hbuilds/config/.env');
    await mkdir(runtime, { recursive: true });
    await mkdir(join(domain, 'hbuilds/config'), { recursive: true });
    await writeFile(configuration, 'FIXTURE=not-a-secret\n', { mode: 0o600 });
    await symlink(join(domain, 'hbuilds'), join(domain, '.builds'));
    await symlink('versions/release-one', join(domain, 'hbuilds/current'));
    const common = join(here, 'deploy-common.sh');
    const prepare = (target = runtime) => spawnSync(bash, ['-c', 'set -euo pipefail; source "$1"; ensure_private_runtime_environment "$2" "$3"', 'test', common, domain, target], { encoding: 'utf8' });
    assert.equal(prepare().status, 0);
    assert.equal(await readlink(join(runtime, '.env')), configuration);
    assert.equal(prepare().status, 0);
    assert.equal(prepare(join(domain, '.builds/current/nodejs')).status, 0);
    await rm(join(runtime, '.env'));
    await writeFile(join(runtime, '.env'), 'CONFLICT=keep-me\n');
    assert.notEqual(prepare().status, 0);
    assert.equal(await readFile(join(runtime, '.env'), 'utf8'), 'CONFLICT=keep-me\n');
    await rm(join(runtime, '.env'));
    const conflictingTarget = join(directory, 'other-private.env');
    await writeFile(conflictingTarget, 'CONFLICT=keep-me\n', { mode: 0o600 });
    await symlink(conflictingTarget, join(runtime, '.env'));
    assert.notEqual(prepare().status, 0);
    assert.equal(await readlink(join(runtime, '.env')), conflictingTarget);
    const outside = join(directory, 'other-release/nodejs');
    await mkdir(outside, { recursive: true });
    assert.notEqual(prepare(outside).status, 0);
    await rm(join(runtime, '.env'));
    const changed = spawnSync(bash, ['-c', 'chmod 644 "$1"', 'test', configuration]);
    assert.equal(changed.status, 0);
    assert.notEqual(prepare().status, 0);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'orcapro-runtime-env-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive gate refuses traversal and links before any extraction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orcapro-artifact-test-'));
  try {
    const code = `import io, pathlib, sys, tarfile\nroot=pathlib.Path(sys.argv[1])\nfor name,path,link in [('good','package.json',False),('escape','../outside',False),('absolute','/outside',False),('link','alias',True)]:\n with tarfile.open(root/(name+'.tar.gz'),'w:gz') as archive:\n  member=tarfile.TarInfo(path)\n  if link: member.type=tarfile.SYMTYPE; member.linkname='/outside'; archive.addfile(member)\n  else: data=b'{}'; member.size=len(data); archive.addfile(member,io.BytesIO(data))\n`;
    const generator = join(directory, 'fixtures.py'); await writeFile(generator, code);
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const generated = spawnSync(python, [generator, directory], { encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr);
    for (const [name, expected] of [['good', 0], ['escape', 1], ['absolute', 1], ['link', 1]]) {
      const result = spawnSync(python, [join(here, 'verify-deployment-archive.py'), join(directory, name + '.tar.gz')], { encoding: 'utf8' });
      assert.equal(result.status, expected, result.stderr);
    }
    assert.equal((await readFile(join(directory, 'good.tar.gz'))).length > 0, true);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'orcapro-artifact-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});
