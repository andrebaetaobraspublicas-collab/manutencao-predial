import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function git(root, args, input) {
  const r = spawnSync('git', args, { cwd: root, input, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  if (r.error || r.status !== 0) throw new Error('Source verification failed: git ' + args[0]);
  return r.stdout;
}

// Read committed blobs, never working files or untracked local artifacts.
export function committedSources(root, sourceCommit) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('A full source commit is required.');
  const top = git(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
  if (fs.realpathSync(top) !== fs.realpathSync(root)) throw new Error('Use the repository root.');
  if (git(root, ['rev-parse', 'HEAD']).toString('utf8').trim() !== sourceCommit) throw new Error('Source commit must equal checkout HEAD.');
  git(root, ['diff', '--quiet', 'HEAD', '--']);
  const excluded = new Set(['node_modules', 'dist', '.next', 'out', 'coverage', 'artifacts', '.runtime', 'backups', 'hostinger-output', 'uploads']);
  const entries = git(root, ['ls-tree', '-rz', '--full-tree', sourceCommit]).toString('utf8').split('\0').filter(Boolean).flatMap(record => {
    const tab = record.indexOf('\t'), [mode, type, sha] = record.slice(0, tab).split(' '), name = record.slice(tab + 1);
    const parts = name.split('/');
    if (parts.some(p => excluded.has(p) || p.startsWith('.env')) || name.endsWith('.tsbuildinfo') || name.startsWith('apps/api/src/generated/')) return [];
    if (type !== 'blob' || !['100644', '100755'].includes(mode) || parts.includes('..') || path.isAbsolute(name)) throw new Error('Unsupported committed source: ' + name);
    return [{ name, sha }];
  });
  const data = git(root, ['cat-file', '--batch'], entries.map(e => e.sha + '\n').join(''));
  let offset = 0;
  return entries.map(entry => {
    const end = data.indexOf(10, offset), header = data.subarray(offset, end).toString('ascii').split(' ');
    const size = Number(header[2]);
    if (end < 0 || header[0] !== entry.sha || header[1] !== 'blob' || !Number.isSafeInteger(size) || size < 0 || end + size + 1 >= data.length) throw new Error('Invalid source blob response.');
    const bytes = data.subarray(end + 1, end + 1 + size);
    offset = end + size + 2;
    return { name: entry.name, bytes };
  });
}
