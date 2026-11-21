import fs from 'node:fs';
import path from 'node:path';
import { files, sha256, validateWeb } from './prepare.mjs';
const root = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node verify.mjs /local/release');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
if (manifest.product !== 'gestao-contratual' || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)) throw new Error('Invalid release identity.');
const actual = files(root, '', n => n === 'api/node_modules').filter(n => n !== 'manifest.json');
if (JSON.stringify(actual.sort()) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error('Unexpected or missing release files.');
for (const [name, expected] of Object.entries(manifest.files)) {
  if (name.includes('..') || path.isAbsolute(name)) throw new Error('Invalid manifest path.');
  if (sha256(fs.readFileSync(path.join(root, name))) !== expected) throw new Error('Release hash mismatch: ' + name);
}
validateWeb(path.join(root, 'web'));
console.log('Release hashes and public references verified. No connection, deployment or data change performed.');
