import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const packageRoot = process.cwd();
const standaloneRoot = resolve(packageRoot, '.next', 'standalone');
const standaloneApp = resolve(standaloneRoot, 'apps', 'web');
const serverEntry = resolve(standaloneApp, 'server.js');

if (!existsSync(serverEntry)) {
  throw new Error('Missing Next.js standalone entry apps/web/server.js');
}

const staticSource = resolve(packageRoot, '.next', 'static');
const staticTarget = resolve(standaloneApp, '.next', 'static');
mkdirSync(staticTarget, { recursive: true });
cpSync(staticSource, staticTarget, { recursive: true });

const publicSource = resolve(packageRoot, 'public');
if (existsSync(publicSource)) {
  cpSync(publicSource, resolve(standaloneApp, 'public'), { recursive: true });
}

console.log('Next.js standalone output prepared for Hostinger');
