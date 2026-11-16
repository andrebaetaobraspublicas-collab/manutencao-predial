const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function setup(apiUrl='https://api.gestaodepredios.com.br/api/v1'){
 const slots=[];let cursor=0,requests=[],rejectConfirm=false;
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(v){return this.useState({current:v})[0];},useCallback(fn){return fn;},useEffect(){}};react.useRef=v=>{const i=cursor++;if(!(i in slots))slots[i]={current:v};return slots[i];};
 const fetch=async(url,init={})=>{requests.push({url,init});if(url.endsWith('/preview'))return{id:'draft-'+requests.filter(r=>r.url.endsWith('/preview')).length,recipientCount:4,audienceHash:'a'.repeat(64),excludedPreferences:0,mailConfigured:true,email:{subject:JSON.parse(init.body).subject,html:'<p>Prévia</p>'}};if(url.endsWith('/confirm')){if(rejectConfirm){rejectConfirm=false;throw Error('Falha temporária');}return{status:'QUEUED'};}return{items:[],total:0};};
 const mod={exports:{}},code=ts.transpileModule(fs.readFileSync(root+'/apps/web/src/app/orcapro/administracao/system-bulletins-panel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const css=new Proxy({},{get:(_,key)=>String(key)}),jsx=(type,props)=>({type,props});
 vm.runInNewContext(code,{exports:mod.exports,module:mod,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:name==='@/lib/api'?{apiFetch:fetch}:css,URL,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,process:{env:{NEXT_PUBLIC_API_URL:apiUrl}}});
 return{render(){cursor=0;return mod.exports.default();},requests,rejectNextConfirm(){rejectConfirm=true;}};
}
function nodes(node,result=[]){if(Array.isArray(node)){for(const n of node)nodes(n,result);}else if(node&&typeof node==='object'){result.push(node);nodes(node.props?.children,result);}return result;}
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):node==null?'':String(node);
const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&text(n)===label);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('each production editor offers only its own product and defaults to that audience',async()=>{
 for(const [host,product] of [['api.orcaproobras.com.br','ORCAPRO'],['api.orcaproinfra.com.br','INFRA']]){
  const h=setup('https://'+host+'/api/v1'),tree=fill(h);assert.equal(nodes(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox').length,1);
  button(tree,'Enviar informativo').props.onClick();await flush();const call=h.requests.find(r=>r.url.endsWith('/preview'));assert.deepEqual(JSON.parse(call.init.body).products,[product]);assert.equal(h.requests.filter(r=>r.url.endsWith('/confirm')).length,0);
 }
});
function fill(h,subject='A',body='B'){let tree=h.render();nodes(tree).find(n=>n.type==='input'&&n.props.maxLength===180).props.onChange({target:{value:subject}});tree=h.render();nodes(tree).find(n=>n.type==='textarea').props.onChange({target:{value:body}});return h.render();}
test('short messages enable sending, double clicks reuse one preview and send one campaign; next message is enabled',async()=>{
 const h=setup();let tree=fill(h);assert.equal(button(tree,'Enviar informativo').props.disabled,false);button(tree,'Enviar informativo').props.onClick();button(tree,'Enviar informativo').props.onClick();await flush();tree=h.render();assert.equal(h.requests.filter(r=>r.url.endsWith('/preview')).length,1);assert.ok(nodes(tree).some(n=>n.props?.role==='dialog'));assert.ok(!nodes(tree).some(n=>n.type==='input'&&n.props.autoComplete==='off'));button(tree,'Confirmar e enviar').props.onClick();button(tree,'Confirmar e enviar').props.onClick();await flush();tree=h.render();assert.equal(h.requests.filter(r=>r.url.endsWith('/confirm')).length,1);assert.equal(button(tree,'Enviar informativo').props.disabled,false);tree=fill(h,'Novo','Outra mensagem');button(tree,'Enviar informativo').props.onClick();await flush();assert.equal(h.requests.filter(r=>r.url.endsWith('/preview')).length,2);
});
test('cancel and preview do not send; an ambiguous confirm retry keeps the same campaign identity',async()=>{
 const h=setup();let tree=fill(h,'Aviso','Teste');button(tree,'Ver prévia e destinatários').props.onClick();await flush();tree=h.render();assert.equal(h.requests.filter(r=>r.url.endsWith('/confirm')).length,0);button(tree,'Enviar informativo').props.onClick();await flush();tree=h.render();button(tree,'Cancelar').props.onClick();await flush();tree=h.render();assert.equal(h.requests.filter(r=>r.url.endsWith('/preview')).length,1);button(tree,'Enviar informativo').props.onClick();await flush();tree=h.render();h.rejectNextConfirm();button(tree,'Confirmar e enviar').props.onClick();await flush();tree=h.render();assert.equal(button(tree,'Confirmar e enviar').props.disabled,false);button(tree,'Confirmar e enviar').props.onClick();await flush();const calls=h.requests.filter(r=>r.url.endsWith('/confirm'));assert.equal(calls.length,2);assert.equal(calls[0].url,calls[1].url);tree=h.render();button(tree,'Novo informativo').props.onClick();tree=h.render();assert.equal(button(tree,'Enviar informativo').props.disabled,true);
});
