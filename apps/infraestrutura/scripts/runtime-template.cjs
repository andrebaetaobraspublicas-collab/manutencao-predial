const vm=require('node:vm');
const crypto=require('node:crypto');
const clone=value=>JSON.parse(JSON.stringify(value));

function runtime(raw,project,options={}){
 const ctx={console,TextEncoder,TextDecoder,Blob,Response,URL,crypto:crypto.webcrypto,performance,setTimeout,clearTimeout,setInterval,clearInterval,
   requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{},confirm:()=>false,addEventListener:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},
   document:{getElementById:()=>null,addEventListener:()=>{},querySelector:()=>null,querySelectorAll:()=>[],documentElement:{dataset:{theme:'light'}},body:{append:()=>{},classList:{}}},navigator:{}};
 ctx.window=ctx;ctx.self=ctx;ctx.OP_SICRO_RAW=clone(raw);
 ctx.OP_DATA={...clone(DATA),pem:clone(options.pem||{names:[],pem:[],obs:{}})};
 vm.createContext(ctx);
 for(const module of MODULES)vm.runInContext(module.code,ctx,{filename:module.name,timeout:30000});
 ctx.__project=project?clone(project):null;
 vm.runInContext(`(() => { const O=OP,A=O.app;A.inputs=[];A.customs=[];O.register.library={inputs:[],compositions:[]};
   A.base=O.register.makeBase(OP_SICRO_RAW,'runtime',[],[],[]);
   A.pj=O.engine.fix(__project||O.examples.build('rodovia',A.base));O.register.hydrate(A.pj);A.model=null;
 })()`,ctx,{filename:'initialize-project.js',timeout:30000});
 return ctx;
}

function validateRaw(raw){
 // Only the four pure reference modules are needed for all official unit costs.
 const ctx={console,TextEncoder,TextDecoder};ctx.window=ctx;ctx.self=ctx;vm.createContext(ctx);
 for(const name of ['00_core.js','01_xlsx.js','02_sicro.js','03_factors.js']){
  const module=MODULES.find(x=>x.name===name);vm.runInContext(module.code,ctx,{filename:name,timeout:30000});
 }
 ctx.__raw=clone(raw);
 vm.runInContext(`(() => { const base=new OP.sicro.Base(__raw,'validation'),checked=OP.sicro.validate(base);
   globalThis.__checked={...checked,compositionCount:base.nComp,inputCount:base.nIns};
 })()`,ctx,{filename:'validate-reference.js',timeout:30000});
 return {...clone(ctx.__checked),sourceSha256:SOURCE_SHA256};
}

function calculateProject(raw,project,options={}){
 const ctx=runtime(raw,project,options);
 vm.runInContext(`(() => { const m=OP.ui.model();globalThis.__calculated={totals:m.tot,workDays:m.T,start:m.start,end:m.end,
   items:m.items.map(row=>({id:row.id,code:row.node.code,description:row.desc,unit:row.unit,quantity:row.qty,unitCostCents:row.unitCost,directCents:row.direct,priceCents:row.price})),project:OP.app.pj};
 })()`,ctx,{filename:'calculate-project.js',timeout:30000});
 return clone(ctx.__calculated);
}

function compareProjects(oldRaw,newRaw,project,options={}){
 const before=calculateProject(oldRaw,project,{pem:options.oldPem||options.pem}),after=calculateProject(newRaw,project,{pem:options.newPem||options.pem});
 const byId=new Map(after.items.map(item=>[item.id,item]));
 return {before,after,items:before.items.map(item=>{const next=byId.get(item.id);return {id:item.id,code:item.code,description:item.description,quantity:item.quantity,
   oldUnitCostCents:item.unitCostCents,newUnitCostCents:next?.unitCostCents??null,
   oldDirectCents:item.directCents,newDirectCents:next?.directCents??null,
   deltaDirectCents:next?.directCents!=null&&item.directCents!=null?next.directCents-item.directCents:null};})};
}

function exampleProject(raw,options={}){return clone(runtime(raw,null,options).OP.app.pj);}

function runRegression(raw,options={}){
 const ctx=runtime(raw,null,options);
 vm.runInContext(`(() => { const O=OP,m=O.ui.model(),suites={al:O.al.selfTests(),mobilizacao:O.mob.selfTests(),canteiro:O.can.selfTests(),fit:O.fit.selfTests(),fic:O.fic.selfTests(),pem:O.pem.selfTests()};
   globalThis.__regression={road:{services:m.items.length,directCents:m.tot.direct,priceCents:m.tot.price,workDays:m.T},suites};
 })()`,ctx,{filename:'regression.js',timeout:30000});
 return {validation:validateRaw(raw),...clone(ctx.__regression)};
}

module.exports={SOURCE_SHA256,validateRaw,calculateProject,compareProjects,exampleProject,runRegression};
