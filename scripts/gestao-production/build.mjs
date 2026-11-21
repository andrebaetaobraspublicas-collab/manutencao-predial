// Local build only. No upload, SSH, application startup, migration or seed command.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { recipe, prepare, files, sha256 } from './prepare.mjs';

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--output' || args[2] !== '--source-commit') throw new Error('Usage: node build.mjs --output /new/local/release --source-commit <40-character SHA>');
if (process.versions.node !== '22.23.5') throw new Error('Use Node 22.23.5 to reproduce the audited runtime.');
const output = path.resolve(args[1]), sourceCommit = args[3];
if (!/^[a-f0-9]{40}$/.test(sourceCommit) || fs.existsSync(output)) throw new Error('A full commit and a new output directory are required.');
const root = path.resolve(recipe, '../..');
const relativeOutput = path.relative(root, output);
if (!relativeOutput.startsWith('..' + path.sep) || path.isAbsolute(relativeOutput)) throw new Error('Use an output directory outside the source checkout on the same filesystem.');
if (!fs.existsSync(path.join(root, 'node_modules/typescript/lib/tsc.js'))) throw new Error('Install the root lock in an isolated checkout first: npm ci --ignore-scripts');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gestao-build-'));
const exclude = new Set(['.git', 'node_modules', 'dist', '.next', 'out', 'coverage', 'artifacts', '.runtime', 'backups', 'hostinger-output', 'uploads']);
function sourceFiles(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(e => {
    const n = prefix + e.name;
    if (exclude.has(e.name) || e.name.startsWith('.env') || e.name.endsWith('.tsbuildinfo') || e.isSymbolicLink() || n.startsWith('apps/api/src/generated/')) return [];
    return e.isDirectory() ? sourceFiles(path.join(dir, e.name), n + '/') : [n];
  });
}
const names = sourceFiles(root);
const sourceDigest = sha256(JSON.stringify(names.map(n => [n, sha256(fs.readFileSync(path.join(root, n)))])));
for (const n of names) { fs.mkdirSync(path.dirname(path.join(workspace, n)), { recursive: true }); fs.copyFileSync(path.join(root, n), path.join(workspace, n)); }
for (const n of ['node_modules', 'apps/api/node_modules', 'apps/web/node_modules']) {
  if (fs.existsSync(path.join(root, n))) fs.symlinkSync(fs.realpathSync(path.join(root, n)), path.join(workspace, n), process.platform === 'win32' ? 'junction' : 'dir');
}
// Prevent ambient server credentials and NEXT_PUBLIC_* values from entering build workers.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|NUMBER_OF_PROCESSORS)$/i.test(k)));
Object.assign(env, JSON.parse(fs.readFileSync(path.join(recipe, 'build-env.json'))), { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', DATABASE_URL: 'mysql://build:unused@127.0.0.1:3306/compile_only' });
function node(script, params, cwd = workspace) {
  const r = spawnSync(process.execPath, [path.join(workspace, script), ...params], { cwd, env, stdio: 'inherit' });
  if (r.error || r.status !== 0) throw new Error('Local build failed: ' + script);
}
const api = path.join(workspace, 'apps/api'), web = path.join(workspace, 'apps/web');
node('node_modules/prisma/build/index.js', ['generate'], api);
node('node_modules/typescript/lib/tsc.js', ['-p', 'tsconfig.build.json'], api);
// Only static assets already versioned in the API source; no other-product build scripts.
for (const n of files(path.join(api, 'src')).filter(n => /\.(cjs|js|json)$/.test(n))) {
  const dest = path.join(api, 'dist', n); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(api, 'src', n), dest);
}
node('scripts/orcapro/build-brand-assets.mjs', []);
node('node_modules/next/dist/bin/next', ['build', '--webpack'], web);
const manifest = prepare({ apiDist: path.join(api, 'dist'), webExport: path.join(web, 'out'), output, sourceCommit, sourceDigest });
console.log(JSON.stringify({ output, workspace, sourceCommit, packagedFiles: Object.keys(manifest.files).length, deploymentPerformed: false }));
// Workspace retained for investigation; never delete caller-supplied directories.
