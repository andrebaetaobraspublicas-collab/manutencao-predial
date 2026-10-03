import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import nextEnv from '@next/env';

const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const platformRoot=path.resolve(appRoot,'../..');
const target=path.join(platformRoot,'apps/web/public/infraestrutura-editor');
const require=createRequire(import.meta.url);

nextEnv.loadEnvConfig(path.join(platformRoot,'apps/web'));
nextEnv.updateInitialEnv({...process.env});
nextEnv.loadEnvConfig(platformRoot,undefined,console,true);
if (process.env.NEXT_PUBLIC_ORCAPRO_ONLY === 'true') {
  console.log('Infraestrutura não é incorporado ao ambiente comercial OrçaPro.');
  process.exit(0);
}

await fs.copyFile(path.join(platformRoot,'scripts/infraestrutura/api-store.js'),path.join(appRoot,'src/api-store.js'));
const viteBin=path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js');
const env={...process.env};
if(!env.VITE_API_BASE&&env.NEXT_PUBLIC_API_BASE)env.VITE_API_BASE=env.NEXT_PUBLIC_API_BASE;
if(!env.VITE_API_BASE&&env.NEXT_PUBLIC_API_URL)env.VITE_API_BASE=env.NEXT_PUBLIC_API_URL;
const exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[viteBin,'build'],{cwd:appRoot,env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>resolve(code));});
if(exitCode!==0)throw new Error(`O build do editor Infraestrutura falhou (${exitCode}).`);
await fs.mkdir(target,{recursive:true});
// Copy only within the declared static editor directory; other applications are untouched.
await fs.cp(path.join(appRoot,'dist'),target,{recursive:true,force:true});
console.log('Editor Infraestrutura preparado em apps/web/public/infraestrutura-editor.');
