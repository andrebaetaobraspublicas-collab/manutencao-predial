import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { committedSources } from './source.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gestao-source-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } }).trim();
  git('init', '--quiet'); git('config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(root, 'source.txt'), 'committed\n');
  fs.writeFileSync(path.join(root, 'binary.dat'), Buffer.from([0, 255, 13, 10]));
  git('add', 'source.txt', 'binary.dat');
  git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
  return { root, git, sha: git('rev-parse', 'HEAD') };
}
test('source commit must equal HEAD', t => { const f = fixture(t); assert.throws(() => committedSources(f.root, 'a'.repeat(40)), /checkout HEAD/); });
test('modified and staged tracked files are rejected without modifying the checkout', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.root, 'source.txt'), 'pending');
  assert.throws(() => committedSources(f.root, f.sha), /Source verification/);
  f.git('add', 'source.txt'); assert.throws(() => committedSources(f.root, f.sha), /Source verification/);
  assert.equal(fs.readFileSync(path.join(f.root, 'source.txt'), 'utf8'), 'pending');
});
test('untracked files are excluded and binary committed bytes are preserved', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.root, 'private-local.json'), 'private');
  const sources = committedSources(f.root, f.sha);
  assert.deepEqual(sources.map(x => x.name), ['binary.dat', 'source.txt']);
  assert.deepEqual(sources[0].bytes, Buffer.from([0, 255, 13, 10]));
});
test('local line endings do not change the committed source digest', t => {
  const f = fixture(t); f.git('config', 'core.autocrlf', 'true'); fs.writeFileSync(path.join(f.root, 'source.txt'), 'committed\r\n');
  assert.equal(committedSources(f.root, f.sha).find(x => x.name === 'source.txt').bytes.toString(), 'committed\n');
});
