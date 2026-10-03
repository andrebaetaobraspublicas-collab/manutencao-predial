// Local, isolated fixture server for supervised browser verification. No real account.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),fixture=path.resolve(root,'../../legacy/infraestrutura-1.8.3'),dist=path.join(root,'test-results/preview-dist');
const projectId='11111111-1111-4111-8111-111111111111',cycleId='22222222-2222-4222-8222-222222222222';
let project={id:projectId,version:1,cycleId,data:JSON.parse(fs.readFileSync(path.join(fixture,'example-road.json'),'utf8'))};project.data.id=projectId;
// Each fixture run has an independent context, making cold versus restored cache observable.
project.data.fixtureRun = String(Date.now()); project.data.sicroCycleId = cycleId;
const requests=[];
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:39316');
 if(url.pathname==='/__fixture_status')return send({requests,version:project.version});
 if(url.pathname.startsWith('/api/v1/')){
  requests.push({method:req.method,path:url.pathname,etag:req.headers['if-none-match']||null});
  const route=url.pathname.slice('/api/v1/infraestrutura'.length);
  if(route==='/access')return send({enabled:true,userId:'fixture-user',tenantId:'fixture-tenant',name:'Teste local',role:'ADMIN',csrfToken:'fixture-csrf'});
  if(route==='/cycles')return send({items:[{id:cycleId,status:'PUBLISHED',reference:'07/2026',uf:'SP',compositionCount:6619}]});
  if(route==='/settings')return send({});
  if(route==='/me/inputs'||route==='/me/compositions')return send({items:[]});
  if(route===`/projects/${projectId}`){
   if(req.method==='GET')return send(project);
   if(req.method==='PUT'){
    if(req.headers['x-infra-csrf']!=='fixture-csrf')return send({message:'CSRF'},403);
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const data=JSON.parse(Buffer.concat(chunks));
    if(data.version!==project.version)return send({message:'Conflito de versão'},409);
    project={...project,version:project.version+1,data:data.data};return send(project);
   }
  }
  if(route===`/cycles/${cycleId}/snapshot`){
   if(req.headers['if-none-match']==='"fixture-base-v1"'){res.writeHead(304,{'ETag':'"fixture-base-v1"'});return res.end();}
   res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip','ETag':'"fixture-base-v1"'});return res.end(fs.readFileSync(path.join(fixture,'base.json.gz')));
  }
  if(route===`/cycles/${cycleId}/pem`){res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip'});return res.end(fs.readFileSync(path.join(fixture,'pem.json.gz')));}
  return send({message:'Fixture route not found'},404);
 }
 if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
 const relative=url.pathname.replace(/^\/infraestrutura-editor\//,'')||'index.html',file=path.resolve(dist,relative);
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Local fixture file not found');}
 const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':type});
 if(path.extname(file)==='.html'){
  const html=fs.readFileSync(file,'utf8').replace('<head>',`<head><script>window.fixtureBootStarted=performance.now();new MutationObserver(function(records,observer){var gate=document.getElementById('legalGate');if(!document.getElementById('boot')&&gate&&!gate.hidden){document.documentElement.dataset.fixtureBootMs=String(Math.round(performance.now()-window.fixtureBootStarted));document.documentElement.dataset.fixtureDerivedRestored=String(!!window.OP.infra.derivedRestored);observer.disconnect();}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true});</script>`);
  return res.end(html);
 }
 fs.createReadStream(file).pipe(res);
 function send(data,code=200){res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
});
server.listen(39316,'127.0.0.1',()=>console.log(`Local fixture ready: http://127.0.0.1:39316/infraestrutura-editor/index.html?project=${projectId}`));
