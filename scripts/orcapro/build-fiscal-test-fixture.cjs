'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..');
function createFixture(){
 const dir=path.join(root,'apps/api/src/modules/orcapro/legacy/assets/modules');
 const ctx={console,document:{getElementById:()=>null,addEventListener(){}},addEventListener(){},setTimeout(){return 0;},clearTimeout(){},TextDecoder,TextEncoder,Blob,Response,DecompressionStream,atob,btoa};
 ctx.window=ctx;vm.createContext(ctx);
 for(const f of fs.readdirSync(dir).filter(n=>n.endsWith('.js')&&parseInt(n)<40).sort())vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8'),ctx,{filename:f,timeout:10000});
 const source=fs.readFileSync(path.join(root,'legacy/orcaplan-1.8.3/sinapi-2026-08.raw.json'));
 const raw=JSON.parse(source),O=ctx.OP;
 O.app.base=O.register.makeBase(raw,'historical-fiscal-test',[],[],[]);O.app.pj=O.engine.newProject();
 const db=O.iva.db(),wanted=new Set(['89470','88309','89870','98521','98503','105521']);
 // The physical-fuel test also needs a composition with a direct diesel leaf.
 const fuel=[...db.comp.values()].find(c=>c.it.some(x=>x.t==='I'&&x.c==='4221')&&ctx.MOTOR.custoUnitario(c.c,'SD',db.uf.indexOf('SP'),O.iva.config().cfg)!==null);
 if(!fuel)throw Error('Historical diesel composition missing');wanted.add(fuel.c);
 const visit=code=>{const c=db.comp.get(code);if(!c)throw Error('Historical composition missing: '+code);for(const x of c.it)if(x.t==='C'&&!wanted.has(x.c)){wanted.add(x.c);visit(x.c);}};
 for(const code of [...wanted])visit(code);
 const payload={version:1,reference:'08/2026',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),db:{...db,ins:[...db.ins],comp:[...db.comp].filter(([code])=>wanted.has(code))}};
 return payload;
}
function writeFixture(output){
 const payload=createFixture(),buffer=zlib.gzipSync(Buffer.from(JSON.stringify(payload)),{level:9});
 const sha256=crypto.createHash('sha256').update(buffer).digest('hex');
 const file='fiscal-regression-2026-08-'+sha256.slice(0,16)+'.json.gz';
 fs.mkdirSync(path.join(output,'data'),{recursive:true});fs.writeFileSync(path.join(output,'data',file),buffer);
 return {version:1,reference:payload.reference,url:'/orcapro-legacy/data/'+file,sha256,bytes:buffer.length};
}
module.exports={createFixture,writeFixture};
