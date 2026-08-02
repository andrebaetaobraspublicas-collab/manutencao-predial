import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const packageRoot = process.cwd();
const prebuiltDir = resolve(packageRoot, 'prebuilt');
const outputDir = resolve(packageRoot, 'apps', 'api', 'dist');
const prebuiltEntry = resolve(prebuiltDir, 'main.js');

if (!existsSync(prebuiltEntry)) {
  throw new Error('Missing prebuilt/main.js in the Hostinger deployment package');
}

rmSync(outputDir, { force: true, recursive: true });
mkdirSync(outputDir, { recursive: true });
cpSync(prebuiltDir, outputDir, { recursive: true });

const sourcePackage = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const runtimePackage = {
  name: `${sourcePackage.name}-runtime`,
  version: sourcePackage.version,
  private: true,
  main: 'main.js',
  scripts: { start: 'node main.js' },
  engines: sourcePackage.engines,
  dependencies: sourcePackage.dependencies,
};

writeFileSync(
  resolve(outputDir, 'package.json'),
  `${JSON.stringify(runtimePackage, null, 2)}\n`,
  'utf8',
);

console.log('Hostinger output prepared at apps/api/dist');
