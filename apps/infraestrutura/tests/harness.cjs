const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),seedDir=path.resolve(root,'../../legacy/infraestrutura-1.8.3');
const read=name=>zlib.gunzipSync(fs.readFileSync(path.join(seedDir,name==='pem.json'?'pem.json.gz':'base.json.gz'))).toString('utf8');

function context(){
  const ctx={console,TextEncoder,TextDecoder,Blob,Response,URL,crypto:require('node:crypto').webcrypto,performance,setTimeout,clearTimeout,setInterval,clearInterval,
    requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{},confirm:()=>true,addEventListener:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},
    document:{getElementById:()=>null,addEventListener:()=>{},querySelector:()=>null,querySelectorAll:()=>[],documentElement:{dataset:{theme:'light'}},body:{append:()=>{},classList:{}}},navigator:{}};
  ctx.window=ctx;ctx.self=ctx;vm.createContext(ctx);return ctx;
}

function loadOriginal(){
 const ctx=context(),manifest=JSON.parse(fs.readFileSync(path.join(root,'extraction-manifest.json'),'utf8'));
 const html=fs.readFileSync(path.join(seedDir,'original.html'),'utf8'),scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
 for(let index=1;index<scripts.length;index++)vm.runInContext(scripts[index][2],ctx,{filename:`original-script-${index}.js`,timeout:30000});
 return prepare(ctx);
}

function loadExtracted(){
 const ctx=context();ctx.OP_FONTS=JSON.parse(fs.readFileSync(path.join(root,'public/data/fonts.json'),'utf8'));
 ctx.OP_DATA={pem:JSON.parse(read('pem.json')),alSeed:JSON.parse(fs.readFileSync(path.join(root,'public/data/administracao-local-seed.json'),'utf8')),mobilizationSeed:JSON.parse(fs.readFileSync(path.join(root,'public/data/mobilizacao-seed.json'),'utf8'))};
 ctx.OP_SICRO_RAW=JSON.parse(read('sicro-sp-2026-07.json'));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'extraction-manifest.json'),'utf8'));
 for(const module of manifest.modules)vm.runInContext(fs.readFileSync(path.join(root,'src/modules',module.file),'utf8'),ctx,{filename:module.file,timeout:30000});
 return prepare(ctx);
}

function prepare(ctx){
 const O=ctx.OP,A=O.app,raw=JSON.parse(read('sicro-sp-2026-07.json'));
 A.inputs=[];A.customs=[];O.register.library={inputs:[],compositions:[]};A.base=O.register.makeBase(raw,'embedded',[],[],[]);
 A.pj=O.engine.fix(O.examples.build('rodovia',A.base));O.register.hydrate(A.pj);A.model=null;
 return ctx;
}

function describe(ctx){
 const O=ctx.OP,A=O.app,m=O.ui.model();
 const tests={al:O.al.selfTests(),mobilizacao:O.mob.selfTests(),canteiro:O.can?.selfTests?.()??O.canteiro?.selfTests?.(),fit:O.fit.selfTests(),fic:O.fic.selfTests(),pem:O.pem.selfTests()};
 return {validation:O.sicro.validate(A.base),totals:m.tot,projectKeys:Object.keys(A.pj),modelKeys:Object.keys(m),scheduleKeys:Object.keys(m.sched||m.schedule||{}),tests};
}
module.exports={root,seedDir,context,loadOriginal,loadExtracted,describe};
if(require.main===module){const ctx=loadExtracted();console.log(JSON.stringify(describe(ctx),null,2));}
