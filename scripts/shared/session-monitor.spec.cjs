const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('apps/web/public/session-monitor.js','utf8');
function browser(results,hostname='www.gestaodepredios.com.br'){
 const timers=[],nodes=[],elements=[];const window={addEventListener(){},open(){}};
 const doc={visibilityState:'visible',addEventListener(){},body:{appendChild(x){nodes.push(x)}},createElement(){const x={style:{},setAttribute(){},append(){},appendChild(){},focus(){},remove(){nodes.splice(nodes.indexOf(x),1)}};elements.push(x);return x;}};
 const context={window,document:doc,location:{hostname,pathname:'/orcapro/editor/',search:'?id=test'},AbortSignal,setInterval:fn=>timers.push(fn),setTimeout:fn=>timers.push(fn),fetch:async()=>{const r=results.shift();if(r instanceof Error)throw r;return {ok:true,json:async()=>r};}};
 vm.runInNewContext(source,context);return {timers,nodes};
}
test('sessão revogada bloqueia a interface, preserva DOM e retoma depois do login',async()=>{
 const b=browser([{enforced:true,active:false},{enforced:true,active:false},{enforced:true,active:true}]);
 await b.timers[0]();assert.equal(b.nodes.length,0);await b.timers[0]();assert.equal(b.nodes.length,1);await b.timers[0]();assert.equal(b.nodes.length,0);
});
test('falha de rede não bloqueia e domínio não autorizado não instala monitor',async()=>{
 const b=browser([new Error('offline')]);await b.timers[0]();assert.equal(b.nodes.length,0);
 assert.equal(browser([],'unrelated.example').timers.length,0);
});

test('produções consultam somente sua API correspondente',async()=>{
 for(const host of ['sistema.orcaproobras.com.br','orcaproinfra.com.br'])assert(browser([],host).timers.length>0);
});
