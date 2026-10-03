import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  for (const file of ['deploy-common.sh', 'promote-api-release.sh', 'promote-web-release.sh']) {
    const result = spawnSync(bash, ['-n', join(here, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
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
