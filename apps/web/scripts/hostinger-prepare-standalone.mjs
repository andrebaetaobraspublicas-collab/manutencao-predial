import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageRoot = process.cwd();

if (process.env.HOSTINGER_STATIC_EXPORT === '1') {
  console.log('Next.js static export prepared at apps/web/out');
  process.exit(0);
}

const standaloneRoot = resolve(packageRoot, '.next', 'standalone');
const outputRoot = resolve(packageRoot, 'hostinger-output');
const standaloneApp = resolve(outputRoot, 'apps', 'web');
const serverEntry = resolve(standaloneApp, 'server.js');

if (!existsSync(resolve(standaloneRoot, 'apps', 'web', 'server.js'))) {
  throw new Error('Missing Next.js standalone entry apps/web/server.js');
}

rmSync(outputRoot, { recursive: true, force: true });
cpSync(standaloneRoot, outputRoot, { recursive: true });

const staticSource = resolve(packageRoot, '.next', 'static');
const staticTarget = resolve(standaloneApp, '.next', 'static');
mkdirSync(staticTarget, { recursive: true });
cpSync(staticSource, staticTarget, { recursive: true });

const publicSource = resolve(packageRoot, 'public');
if (existsSync(publicSource)) {
  cpSync(publicSource, resolve(standaloneApp, 'public'), { recursive: true });
}

writeFileSync(
  resolve(outputRoot, 'server.js'),
  "process.env.HOSTNAME = '0.0.0.0';\nrequire('./apps/web/server.js');\n",
  'utf8',
);

if (!existsSync(serverEntry)) {
  throw new Error('Missing copied Next.js standalone entry apps/web/server.js');
}

console.log('Next.js standalone output prepared at apps/web/hostinger-output');
