/* SINAPI checks: immutable historical fixture + current scenario + active project.
 * No project save, catalog import or reference change is performed here. */
(function(G){'use strict';
 const O=G.OP,M=G.MOTOR,T=O.iva,A=O.app;
 let fixturePromise,running;
 async function loadFixture(){
  if(!fixturePromise)fixturePromise=(async()=>{
   const conf=G.ORCAPRO_FISCAL_TEST_FIXTURE;
   if(!conf||!/^\/orcapro-legacy\/data\/fiscal-regression-[a-z0-9.-]+\.json\.gz$/.test(conf.url)||!/^[a-f0-9]{64}$/.test(conf.sha256))throw Error('Base histórica de testes não configurada.');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
   try{
    const response=await fetch(conf.url,{credentials:'same-origin',cache:'force-cache',signal:controller.signal});
    if(!response.ok)throw Error('Não foi possível carregar a base histórica de testes ('+response.status+').');
    const bytes=await response.arrayBuffer();if(bytes.byteLength!==conf.bytes)throw Error('Tamanho divergente na base de testes.');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==conf.sha256)throw Error('Integridade da base histórica de testes não confirmada.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).json();
   }finally{clearTimeout(timer);}
  })().catch(e=>{fixturePromise=null;throw e;});
  return fixturePromise;
 }
 function currentChecks(db,model){
  const out=[],c=M.cfgInicial(db.uf),uf=A.pj.uf,clone=x=>JSON.parse(JSON.stringify(x));
  const add=(nome,f)=>{try{const note=f();out.push({nome:'Cenário atual · '+nome+(note?' — '+note:''),ok:true});}catch(e){out.push({nome:'Cenário atual · '+nome,ok:false,erro:e.message});}};
  const eq=(a,b,tol=1e-8)=>{if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>tol)throw Error(`${a} ≠ ${b}`);};
  const yes=(v,message='Condição não atendida')=>{if(!v)throw Error(message);};
  const oc=(perfil,extra={})=>({cod:'SELFTEST-SINAPI',desc:'Ocorrência isolada',un:'UN',perfil,valor:100,qtd:1,cbAdRem:null,...extra});
  const av=(o,y=2033,f=c)=>M.avaliarOcorrencia(o,f,uf,y);
  add('referência e UF do orçamento preservadas',()=>{yes(db.ref===A.base.raw.ref);yes(db.uf.includes(uf));return db.ref+' / '+uf;});
  add('catálogo sob demanda: registros carregados consistentes',()=>{yes(db.ins.size>=A.base.raw.ins.c.length);yes(db.comp.size>=A.base.raw.comp.c.length);for(const code of A.base.raw.ins.c)yes(db.ins.has(String(code)),'Insumo ausente: '+code);return db.ins.size+' insumos e '+db.comp.size+' composições carregados; não é exigida igualdade com os 4.876 insumos da matriz histórica';});
  add('decisão tributária para cada insumo carregado',()=>{for(const code of db.ins.keys()){const r=M.anexoInsumo(code,c);yes([0,.4,1].includes(r.fator));yes(typeof r.motivo==='string'&&r.motivo.length>0);}});
  add('doze exercícios de 2026 a 2037',()=>{eq(M.ANOS.length,12);M.ANOS.forEach((y,i)=>eq(y,2026+i));});
  add('novos padrões CBS/IBS e IVA de 30% em 2033',()=>{const cbs=[.9,11.2,11.2,11.3,11.3,11.3,11.3,11.3,11.3,11.3,11.3,11.3],ibs=[.1,.1,.1,1.87,3.74,5.61,7.48,18.7,18.7,18.7,18.7,18.7];M.ANOS.forEach((y,i)=>{eq(c.cbs[i],cbs[i]);eq(c.ibs[i],ibs[i]);});eq(av(oc('material')).credito,30);});
  add('transição protegida mesmo após importação divergente',()=>{const f=clone(c);f.resid.fill(0);const z=M.validarCfg(f,db.uf);M.ANOS.forEach((y,i)=>eq(M.remanescente(z,y),[1,1,1,.9,.8,.7,.6,0,0,0,0,0][i]));});
  add('CBS diesel B15 = 85% × 0,3515 + 15% × 0,1480',()=>eq(M.taxasCombustivel(c,'diesel',2027,6.47).cbs,.320975));
  add('CBS específica dos demais combustíveis',()=>{for(const [k,v]of [['gasolina',.7925],['etanol',.1922],['etanolAnidro',.1922],['biodiesel',.148],['glp',.1677],['querosene',.0712],['oleocombustivel',.3403]])eq(M.taxasCombustivel(c,k,2027,10).cbs,v);});
  for(let year=2027;year<=2037;year++)add('recuperação progressiva em '+year,()=>{const f=clone(c);f.ativo.modo='corrente';const full=av(oc('depreciacao'),year,f);f.ativo.modo='progressivo';f.ativo.anoAutomatico=false;f.ativo.ano=2020;const part=av(oc('depreciacao'),year,f);eq(part.anoEfetivo,year);eq(part.recuperacaoDepreciacao,(year-2027)/10);eq(part.credito,full.credito*(year-2027)/10);});
  add('progressão não reduz combustível, manutenção ou mão de obra',()=>{const f=clone(c);f.ativo.modo='progressivo';for(const x of [oc('manutencao'),oc('maoObra'),oc('gasolina',{un:'L',cbAdRem:'gasolina'})])eq(av(x,2031,f).credito,av(x,2031).credito);});
  add('preço com IVA extrai imposto por divisão',()=>{const f=clone(c);f.base.modo='comIVA';const r=av(oc('material',{valor:130}),2033,f);eq(r.baseLegal,100);eq(r.credito,30);});
  add('salários e juros sem créditos',()=>{for(const p of ['maoObra','juros'])for(const y of M.ANOS)eq(av(oc(p),y).credito,0);});
  add('Anexos IX/XIII aplicados uma única vez',()=>{for(const [annex,factor]of [['IX',.4],['XIII',0]]){const f=clone(c);f.regimeInsumo['SELFTEST-SINAPI']=annex;const r=av(oc('material'),2033,f);eq(r.baseLegal,100);eq(r.baseCreditavel,100*factor);eq(r.credito,30*factor);}});
  add('parametrizações próprias e zero manual preservados',()=>{const f=clone(c);f.cbs[4]=15;f.combustiveis.diesel.anos[4]={ibs:0,cbs:0};const before=JSON.stringify(f),z=M.validarCfg(f,db.uf);eq(z.cbs[4],15);eq(M.taxasCombustivel(z,'diesel',2030,6.47).cbs,0);yes(JSON.stringify(f)===before);});
  add('BDI: padrões das três modalidades usam redutor de 44,2%',()=>{eq(O.bdi.exatoDefaults().redutorGov,.442);eq(O.bdi.simplesDefaults().redutorGov,.442);eq(O.bdi.paramDefaults().redutor,.442);});
  add('BDI: IVA anual acompanha CBS/IBS padrão',()=>{for(const y of M.ANOS){const p=O.bdi.exatoDefaults();p.ano=y;O.bdi.exatoAno(p);eq(p.ivaCheia,(c.cbs[y-2026]+c.ibs[y-2026])/100);}});
  add('orçamento: serviços = insumos = IBS + CBS em centavos',()=>{const b=T.budget(model),sum=map=>[...map.values()].reduce((n,x)=>n+x.creditCents,0);eq(sum(b.byService),b.total.creditCents,0);eq(sum(b.byABC),b.total.creditCents,0);eq(b.total.creditCents,b.total.ibsCents+b.total.cbsCents,0);});
  add('orçamento: conciliação da série anual de créditos',()=>{for(const y of M.ANOS){const b=T.year(model,y);eq(b.total.creditCents,b.total.ibsCents+b.total.cbsCents,0);yes(b.total.creditCents>=0);}});
  add('diagnóstico de completude da memória',()=>T.budget(model).total.complete?'Crédito completo nas premissas atuais.':'Crédito parcial: consulte as pendências da memória. Ausência de preço/enquadramento não é, por si só, falha do motor.');
  return out;
 }
 async function execute(options={}){
  const project=A.pj,base=A.base,identity=project?.sinapiReferenceId;
  if(!project||!base)throw Error('Abra um orçamento antes de executar os testes.');
  // Fetch before replacing the motor DB. Nothing asynchronous happens while the
  // isolated historical DB is attached, so normal UI work cannot observe it.
  const fixture=options.fixture||await loadFixture();
  if(A.pj!==project||A.base!==base||A.pj.sinapiReferenceId!==identity)throw Error('O orçamento ou a referência mudou durante o carregamento. Execute os testes novamente.');
  if(O.cloud?.loadCodes){const model=O.ui.model(),comps=new Set(),inputs=new Set();for(const row of model.items||[]){const n=row.node;if(n?.code!=null)(n.resourceType==='I'?inputs:comps).add(String(n.code));}for(const record of A.pj.catalog?.compositions||[])for(const x of record.items||[])(x.type==='I'?inputs:comps).add(String(x.code));await O.cloud.loadCodes([...comps],[...inputs]);}
  if(A.pj!==project||A.pj.sinapiReferenceId!==identity)throw Error('O orçamento mudou durante a preparação. Execute novamente.');
  const active=T.db(),cfg=T.config().cfg,model=O.ui.model(),before=JSON.stringify(project),rawBefore=JSON.stringify(A.base.raw);
  if(fixture.version!==1||fixture.reference!=='08/2026'||fixture.db?.uf?.length!==27||!Array.isArray(fixture.db.ins)||!Array.isArray(fixture.db.comp))throw Error('Estrutura da base histórica de testes inválida.');
  const historical={...fixture.db,ins:new Map(fixture.db.ins),comp:new Map(fixture.db.comp)};
  let results;
  try{M.attachDB(historical);results=G.TESTES.executar().map(r=>({...r,nome:'Regressão histórica · SINAPI 08/2026 / IVA 28% · '+r.nome}));}
  finally{M.attachDB(active);M.configurarPrecos(cfg);}
  try{results.push(...currentChecks(active,model));}
  finally{M.attachDB(active);M.configurarPrecos(cfg);}
  results.push({nome:'Integridade · testes não alteram orçamento, referência ou catálogo ativo',ok:JSON.stringify(project)===before&&JSON.stringify(A.base.raw)===rawBefore&&A.pj===project});
  return results;
 }
 O.fiscalTests={version:1,run(options){if(!running)running=execute(options).finally(()=>{running=null;});return running;}};
})(globalThis);
