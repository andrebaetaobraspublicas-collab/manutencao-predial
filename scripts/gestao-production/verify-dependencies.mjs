import fs from 'node:fs';
import path from 'node:path';
export function verifyDependencies(api) {
  api = fs.realpathSync(api);
  const lock = JSON.parse(fs.readFileSync(path.join(api, 'package-lock.json')));
  const errors = [];
  let checked = 0, optionalAbsent = 0;
  for (const [name, expected] of Object.entries(lock.packages)) {
    if (!name) continue;
    if (path.isAbsolute(name) || name.split('/').includes('..') || !name.startsWith('node_modules/')) throw new Error('Invalid dependency lock path.');
    const file = path.join(api, name, 'package.json');
    if (!fs.existsSync(file)) {
      if (expected.optional) optionalAbsent++; else errors.push(name + ':missing');
      continue;
    }
    const relative = path.relative(api, fs.realpathSync(file));
    if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) errors.push(name + ':external-symlink');
    if (JSON.parse(fs.readFileSync(file)).version !== expected.version) errors.push(name + ':version');
    checked++;
  }
  return { checked, optionalAbsent, errors };
}
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node verify-dependencies.mjs /local/release/api');
  const result = verifyDependencies(process.argv[2]);
  console.log(JSON.stringify(result));
  if (result.errors.length) process.exitCode = 1;
}
