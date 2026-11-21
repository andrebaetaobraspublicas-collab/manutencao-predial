import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { recipe, prepare, pages, webAllowed, sha256 } from './prepare.mjs';
import { verifyDependencies } from './verify-dependencies.mjs';
const require = createRequire(import.meta.url);
const { validateConfig } = require('./runtime/validate-config.cjs');
const valid = () => ({ NODE_ENV:'production', GESTAO_ENABLED:'true', GESTAO_STANDALONE:'true', ORCAPRO_ENABLED:'false', INFRA_ENABLED:'false', COOKIE_SECURE:'true', GESTAO_STRIPE_MODE:'live', WEB_BASE_URL:'https://www.orcaprogestaocontratual.com.br', CORS_ORIGINS:'https://orcaprogestaocontratual.com.br,https://www.orcaprogestaocontratual.com.br', GESTAO_ADMIN_EMAIL:'admin@fictional.test', GESTAO_ADMIN_USER_IDS:'12345678-1234-4234-8234-123456789abc', DATABASE_URL:'mysql://user:fake@127.0.0.1/own', GESTAO_DATABASE_URL:'mysql://user:fake@127.0.0.1/own', GESTAO_SOURCE_ORCAPRO_AUTH_URL:'mysql://reader:fake@127.0.0.1/orca', GESTAO_SOURCE_INFRA_AUTH_URL:'mysql://reader:fake@127.0.0.1/infra_auth', GESTAO_SOURCE_INFRA_DATA_URL:'mysql://reader:fake@127.0.0.1/infra_data', GESTAO_STORAGE_ROOT:path.resolve(os.tmpdir(),'private-test-files'), JWT_ACCESS_SECRET:'fictional-jwt-secret-with-at-least-32-characters', GESTAO_STRIPE_SECRET_KEY:'fictional', GESTAO_STRIPE_WEBHOOK_SECRET:'fictional', GESTAO_STRIPE_PRICE_ID:'fictional', GESTAO_STRIPE_PORTAL_CONFIGURATION_ID:'fictional', SMTP_HOST:'smtp.fictional.test', SMTP_USER:'fictional', SMTP_PASSWORD_FILE:'/private/fake-password', EMAIL_FROM:'fictional', EMAIL_PROVIDER:'smtp', SMTP_PORT:'465' });
test('offline validation accepts the exclusive environment without connecting', () => assert.deepEqual(validateConfig(valid()), []));
test('both administrator email and IDs are necessary', () => {
  for (const key of ['GESTAO_ADMIN_EMAIL','GESTAO_ADMIN_USER_IDS']) assert.ok(validateConfig({...valid(),[key]:''}).includes(key));
});
test('other products, insecure cookies and development billing are rejected', () => {
  for (const [key,value] of [['ORCAPRO_ENABLED','true'],['INFRA_ENABLED','true'],['COOKIE_SECURE','false'],['GESTAO_STRIPE_MODE','test'],['GESTAO_STANDALONE','false']]) assert.ok(validateConfig({...valid(),[key]:value}).includes(key));
});
test('source database alias cannot point to the contractual database', () => {
  assert.ok(validateConfig({...valid(),GESTAO_SOURCE_INFRA_DATA_URL:'mysql://another:secret@127.0.0.1:3306/%6fwn'}).includes('GESTAO_SOURCE_INFRA_DATA_URL:isolation'));
});
test('foreign hosts and public attachment storage are rejected', () => {
  assert.ok(validateConfig({...valid(),CORS_ORIGINS:'https://orcaproinfra.com.br'}).includes('CORS_ORIGINS'));
  assert.ok(validateConfig({...valid(),WEB_BASE_URL:'https://www.orcaprogestaocontratual.com.br.evil.test'}).includes('WEB_BASE_URL'));
  assert.ok(validateConfig({...valid(),GESTAO_STORAGE_ROOT:path.resolve(os.tmpdir(),'public_html/files')}).includes('GESTAO_STORAGE_ROOT'));
});
test('runtime lock preserves audited versions and contains no private registry', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(recipe,'runtime/package-lock.json')));
  const pkg = JSON.parse(fs.readFileSync(path.join(recipe,'runtime/package.json')));
  const reference = JSON.parse(fs.readFileSync(path.join(recipe,'production-reference.json')));
  assert.equal(sha256(fs.readFileSync(path.join(recipe,'runtime/package-lock.json'))),reference.runtimeLockSha256);
  assert.deepEqual(pkg.dependencies,lock.packages[''].dependencies);
  assert.equal(lock.packages['node_modules/nodemailer'].version,'10.5.0');
  for (const item of Object.values(lock.packages)) if(item.resolved) { const u = new URL(item.resolved); assert.equal(u.origin,'https://registry.npmjs.org'); assert.equal(u.username,''); assert.equal(u.password,''); }
  assert.deepEqual(Object.keys(pkg.scripts),['start']);
});
test('route selection keeps RSC and excludes other product pages/chunks and secrets', () => {
  for (const n of ['gestao-contratual/index.html','gestao-contratual/cadastro/__next.gestao-contratual/cadastro/__PAGE__.txt','_next/static/chunks/app/gestao-contratual/page-abc.js','_next/static/chunks/framework-abc.js']) assert.equal(webAllowed(n),true,n);
  for (const n of ['orcapro/index.html','orcapro-infraestrutura/index.html','dashboard/index.html','orcapro-legacy/editor.html','_next/static/chunks/app/orcapro/page-abc.js','_next/static/chunks/a.js.map','.env','database.sql']) assert.equal(webAllowed(n),false,n);
});
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gestao-package-test-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const apiDist=path.join(root,'dist'),webExport=path.join(root,'export'),output=path.join(root,'release');
  const put=(dir,name,text)=>{fs.mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});fs.writeFileSync(path.join(dir,name),text);};
  for (const n of ['main-gestao.js','gestao-app.module.js','modules/contract-management/contract.service.js']) put(apiDist,n,'module.exports = {};');
  for (const n of pages) put(webExport,n,'<html><script src="/_next/static/chunks/shared.js"></script></html>');
  put(webExport,'_next/static/chunks/shared.js',''); put(webExport,'orcapro/index.html','unrelated'); put(webExport,'.env','must not escape'); put(apiDist,'main-gestao.js.map','private paths');
  return {root,apiDist,webExport,output,sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64)};
}
test('packaging verifies references, preserves input, excludes maps and builds a verifiable manifest',t=>{
  const f=fixture(t),before=fs.readFileSync(path.join(f.webExport,'orcapro/index.html'),'utf8');const manifest=prepare(f);
  assert.equal(fs.existsSync(path.join(f.output,'web/orcapro/index.html')),false);
  assert.equal(fs.existsSync(path.join(f.output,'api/dist/main-gestao.js.map')),false);
  assert.equal(fs.readFileSync(path.join(f.webExport,'orcapro/index.html'),'utf8'),before);
  assert.equal(manifest.deploymentPerformed,false);assert.equal(manifest.databaseChanges,false);
  const check=spawnSync(process.execPath,[path.join(recipe,'verify.mjs'),f.output],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);
  fs.appendFileSync(path.join(f.output,'api/dist/main-gestao.js'),'tamper');
  assert.notEqual(spawnSync(process.execPath,[path.join(recipe,'verify.mjs'),f.output]).status,0);
});
test('existing output is never overwritten',t=>{const f=fixture(t);fs.mkdirSync(f.output);fs.writeFileSync(path.join(f.output,'keep'),'preserve');assert.throws(()=>prepare(f),/never overwritten/);assert.equal(fs.readFileSync(path.join(f.output,'keep'),'utf8'),'preserve');});
test('assembly reads runtime and public build parameters from the frozen recipe',t=>{
  const f=fixture(t),frozen=path.join(f.root,'frozen');fs.mkdirSync(frozen);fs.cpSync(path.join(recipe,'runtime'),path.join(frozen,'runtime'),{recursive:true});
  fs.writeFileSync(path.join(frozen,'build-env.json'),JSON.stringify({marker:'frozen'}));fs.copyFileSync(path.join(recipe,'web.htaccess'),path.join(frozen,'web.htaccess'));
  fs.writeFileSync(path.join(frozen,'runtime/main.js'),'// frozen launcher\n');
  const manifest=prepare({...f,recipeRoot:frozen});assert.equal(manifest.buildEnvironment.marker,'frozen');assert.equal(fs.readFileSync(path.join(f.output,'api/main.js'),'utf8'),'// frozen launcher\n');
});
test('missing public dependencies fail assembly',t=>{const f=fixture(t);fs.unlinkSync(path.join(f.webExport,'_next/static/chunks/shared.js'));assert.throws(()=>prepare(f),/Missing public dependency/);});
test('launcher import does not start the API; absent private config fails before startup',()=>{const launcher=require('./runtime/main.js');const before=process.env.GESTAO_ENV_FILE;delete process.env.GESTAO_ENV_FILE;try{assert.throws(()=>launcher.loadConfiguration(),/GESTAO_ENV_FILE/)}finally{if(before!==undefined)process.env.GESTAO_ENV_FILE=before}});
test('installed dependency validation catches drift and permits platform-specific optional absence',t=>{
  const f=fixture(t),api=path.join(f.root,'installed');fs.mkdirSync(path.join(api,'node_modules/sample'),{recursive:true});
  fs.writeFileSync(path.join(api,'package-lock.json'),JSON.stringify({packages:{'':{},'node_modules/sample':{version:'1.0.0'},'node_modules/optional':{version:'1.0.0',optional:true}}}));
  fs.writeFileSync(path.join(api,'node_modules/sample/package.json'),JSON.stringify({version:'1.0.0'}));
  assert.deepEqual(verifyDependencies(api),{checked:1,optionalAbsent:1,errors:[]});
  fs.writeFileSync(path.join(api,'node_modules/sample/package.json'),JSON.stringify({version:'2.0.0'}));
  assert.deepEqual(verifyDependencies(api).errors,['node_modules/sample:version']);
});
