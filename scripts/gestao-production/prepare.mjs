import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const recipe = path.dirname(fileURLToPath(import.meta.url));
export const pages = ['index.html', '404.html', '404/index.html', 'login/index.html', 'esqueci-senha/index.html', 'redefinir-senha/index.html', 'programas/index.html', 'gestao-contratual/index.html', 'gestao-contratual/cadastro/index.html'];
const routes = new Set(pages.map(p => path.posix.dirname(p)));
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function files(root, prefix = '', skip = () => false) {
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(e => {
    if (skip(prefix + e.name)) return [];
    if (e.isSymbolicLink()) throw new Error('Symlinks are not accepted in package input: ' + prefix + e.name);
    return e.isDirectory() ? files(path.join(root, e.name), prefix + e.name + '/', skip) : [prefix + e.name];
  });
}
export function webAllowed(name) {
  if (name.startsWith('_next/')) {
    if (/\.map$/.test(name)) return false;
    const app = name.match(/^_next\/static\/chunks\/app\/(.*)\/[^/]+$/);
    return !app || routes.has(app[1]) || app[1] === '_not-found';
  }
  if (pages.includes(name)) return true;
  if (name.endsWith('.txt')) {
    // Next 16 emits nested RSC segment files beneath each selected route.
    const container = name.split('/__next.')[0];
    const leaf = path.posix.basename(name);
    return name.startsWith('__next.') || ((leaf === 'index.txt' || leaf.startsWith('__next.')) && routes.has(path.posix.dirname(name))) || routes.has(container);
  }
  return name === 'session-monitor.js' || /^orcapro-brand\/(logo\.png|icon\.svg|development\.css|production\.css|fonts\/[\w.-]+\.woff2)$/.test(name);
}
function copy(input, output, name) {
  const dest = path.join(output, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(input, name), dest);
}
export function validateWeb(root) {
  for (const name of pages) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    for (const m of text.matchAll(/(?:src|href)="(\/(?:_next|orcapro-brand)\/[^"?#]+|\/session-monitor\.js)(?:[?#][^"]*)?"/g)) {
      if (!fs.existsSync(path.join(root, m[1].slice(1)))) throw new Error('Missing public dependency in ' + name + ': ' + m[1]);
    }
  }
}
export function prepare({ apiDist, webExport, output, sourceCommit, sourceDigest, toolchainNode = process.version, recipeRoot = recipe }) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('A full source commit is required.');
  if (!/^[a-f0-9]{64}$/.test(sourceDigest)) throw new Error('An input source digest is required.');
  output = path.resolve(output);
  if (fs.existsSync(output)) throw new Error('Output must be a new directory; existing releases are never overwritten.');
  for (const name of ['main-gestao.js', 'gestao-app.module.js', 'modules/contract-management/contract.service.js']) fs.accessSync(path.join(apiDist, name));
  for (const page of pages) fs.accessSync(path.join(webExport, page));
  const api = path.join(output, 'api'), web = path.join(output, 'web');
  fs.mkdirSync(api, { recursive: true }); fs.mkdirSync(web);
  for (const name of files(apiDist).filter(n => /\.(js|cjs|json)$/.test(n))) copy(apiDist, path.join(api, 'dist'), name);
  for (const name of ['package.json', 'package-lock.json', 'main.js', 'validate-config.cjs']) copy(path.join(recipeRoot, 'runtime'), api, name);
  for (const name of files(webExport).filter(webAllowed)) copy(webExport, web, name);
  fs.copyFileSync(path.join(recipeRoot, 'web.htaccess'), path.join(web, '.htaccess'));
  validateWeb(web);
  const hashes = Object.fromEntries(files(output).map(n => [n, sha256(fs.readFileSync(path.join(output, n)))]));
  const manifest = { product: 'gestao-contratual', sourceCommit, sourceDigest, toolchainNode, runtimeNode: '22.23.5', buildEnvironment: JSON.parse(fs.readFileSync(path.join(recipeRoot, 'build-env.json'))), deploymentPerformed: false, databaseChanges: false, files: hashes };
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
