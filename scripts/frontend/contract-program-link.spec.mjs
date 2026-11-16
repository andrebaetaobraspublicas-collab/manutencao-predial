import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const runtime=createRequire(import.meta.url);
const source=readFileSync(new URL('../../apps/web/src/components/contract-management-link.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const navigationModule={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../apps/web/src/lib/program-navigation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:navigationModule,exports:navigationModule.exports});
function fixture(host,api){
 const hooks=[],effects=[];let cursor=0;
 const react={useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v]},useEffect(fn,deps){const i=cursor++;if(JSON.stringify(hooks[i])!==JSON.stringify(deps)){hooks[i]=deps;effects.push(fn)}}};
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,window:{location:{hostname:host}},require:p=>p==='react'?react:p==='next/image'?{__esModule:true,default:'img'}:p==='lucide-react'?{ArrowRight:'svg',RefreshCw:'svg',FileSpreadsheet:'svg'}:p==='@/lib/api'?{apiFetch:api}:p==='@/lib/program-navigation'?navigationModule.exports:p==='@/lib/product-config'?{isContractDevelopmentHost:h=>['gestaodepredios.com.br','www.gestaodepredios.com.br','localhost','127.0.0.1'].includes(h)}:runtime(p)});
 const render=()=>{cursor=0;return module.exports.ContractManagementLink({cardClassName:'card',logoClassName:'logo',statusClassName:'status'})};
 return{render,async mount(){render();effects.splice(0).forEach(f=>f());await new Promise(r=>setImmediate(r));return render()}};
}
const nodes=x=>!x||typeof x!=='object'?[]:Array.isArray(x)?x.flatMap(nodes):[x,...nodes(x.props?.children)];
const text=x=>x==null||typeof x==='boolean'?'':Array.isArray(x)?x.map(text).join(' '):typeof x==='object'?text(x.props?.children):String(x);
test('development program stays discoverable when availability lookup fails, with brand and reload navigation',async()=>{
 const f=fixture('www.gestaodepredios.com.br',async()=>{throw Error('temporary outage')});const tree=await f.mount();
 assert.match(text(tree),/OrçaPro Gestão Contratual/);assert.match(text(tree),/Não foi possível consultar/);
 assert(nodes(tree).some(n=>n.type==='img'&&n.props.src==='/orcapro-brand/logo.png'));
 assert(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/gestao-contratual/'));
 assert(nodes(tree).some(n=>n.type==='button'&&text(n).includes('Verificar novamente')));
});
test('production links to the isolated management product without querying its API with source credentials',async()=>{
 let calls=0;const f=fixture('sistema.orcaproobras.com.br',async()=>{calls++;return{enabled:true,databaseConfigured:true}});
 const tree=await f.mount();assert(nodes(tree).some(n=>n.type==='a'&&n.props.href==='https://www.orcaprogestaocontratual.com.br/gestao-contratual/'));assert.equal(calls,0);
 assert.match(text(tree),/assinantes ativos/);
});
test('only the three production products enter production navigation; unknown and development hosts do not',()=>{
 const {productionProgram,productionPrograms}=navigationModule.exports;
 assert.equal(productionProgram('sistema.orcaproobras.com.br'),'ORCAPRO');assert.equal(productionProgram('www.orcaproinfra.com.br'),'INFRA');assert.equal(productionProgram('www.orcaprogestaocontratual.com.br'),'GESTAO');
 assert.equal(productionProgram('gestaodepredios.com.br'),null);assert.equal(productionProgram('orcaproinfra.com.br.example.com'),null);
 assert.equal(productionPrograms.length,3);assert(productionPrograms.every(p=>new URL(p.href).protocol==='https:'));
});
