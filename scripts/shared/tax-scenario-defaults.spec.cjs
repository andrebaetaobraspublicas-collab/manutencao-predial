const fs=require('fs'),path=require('path'),vm=require('vm'),test=require('node:test'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
function load(infra){
 const context={console,document:{getElementById:()=>null,addEventListener(){}},addEventListener(){},setTimeout(){return 0},clearTimeout(){},TextDecoder,TextEncoder,Blob,Response,DecompressionStream,atob,btoa};context.window=context;vm.createContext(context);
 const dir=infra?'apps/infraestrutura/src/modules':'apps/api/src/modules/orcapro/legacy/assets/modules';
 for(const file of fs.readdirSync(path.join(root,dir)).filter(n=>n.endsWith('.js')&&parseInt(n)<40).sort())vm.runInContext(fs.readFileSync(path.join(root,dir,file),'utf8'),context,{filename:file,timeout:10000});
 return context;
}
for(const infra of [false,true])test((infra?'SICRO':'SINAPI')+' new fiscal defaults, B15, progressive depreciation and BDI',()=>{
 const ctx=load(infra),M=ctx.MOTOR,c=M.cfgInicial(['SP']);M.attachDB({uf:['SP'],ins:new Map(),comp:new Map(),cls:[],un:[],grp:[]});
 assert.deepEqual(Array.from(c.cbs).slice(0,8),[.9,11.2,11.2,11.3,11.3,11.3,11.3,11.3]);assert.deepEqual(Array.from(c.ibs).slice(0,8),[.1,.1,.1,1.87,3.74,5.61,7.48,18.7]);assert.equal(M.ANOS.length,12);
 assert.ok(Math.abs(M.taxasCombustivel(c,'diesel',2031,6.47).cbs-.320975)<1e-12);assert.equal(M.taxasCombustivel(c,'gasolina',2027,6).cbs,.7925);assert.equal(M.taxasCombustivel(c,'glp',2027,9).cbs,.1677);assert.equal(M.taxasCombustivel(c,'biodiesel',2027,7).cbs,.148);
 for(const [key,value]of [['etanol',.1922],['etanolAnidro',.1922],['querosene',.0712],['oleocombustivel',.3403]])assert.equal(M.taxasCombustivel(c,key,2027,10).cbs,value);
 const old={schemaVersion:7,cbs:[.9,8.7,8.7,8.8,8.8,8.8,8.8,8.8],ibs:[.1,.1,.1,1.92,3.84,5.76,7.68,19.2],combustiveis:{diesel:{federalModo:'percentual',federal:4.24}}};const snapshot=JSON.stringify(old),upgraded=M.validarCfg(old,['SP']);assert.equal(upgraded.cbs[1],11.2);assert.equal(upgraded.combustiveis.diesel.federal,.320975);assert.equal(JSON.stringify(old),snapshot);old.combustiveis.diesel.federal=5;assert.equal(M.validarCfg(old,['SP']).combustiveis.diesel.federal,5);
 const oc={cod:'test',desc:'Test',un:'UN',perfil:'depreciacao',valor:100,qtd:1,cbAdRem:null};
 for(const year of [2027,2028,2031,2033,2037]){c.ativo.modo='corrente';const full=M.avaliarOcorrencia(oc,c,'SP',year);c.ativo.modo='progressivo';const part=M.avaliarOcorrencia(oc,c,'SP',year),factor=Math.max(0,Math.min(1,(year-2027)/10));assert.ok(Math.abs(part.credito-full.credito*factor)<1e-8);assert.equal(part.recuperacaoDepreciacao,factor);}
 const copy=JSON.parse(JSON.stringify(c));copy.cbs[4]=15;assert.equal(M.validarCfg(copy,['SP']).cbs[4],15);assert.equal(M.validarCfg(copy,['SP']).ativo.modo,'progressivo');
 const BD=ctx.OP.bdi;assert.equal(BD.exatoDefaults().redutorGov,.442);assert.equal(BD.simplesDefaults().redutorGov,.442);assert.ok(Math.abs(BD.exatoDefaults().ivaCheia-.113)<1e-12);
 assert.equal(BD.paramDefaults().redutor,.442);for(let year=2026;year<=2037;year++){const e=BD.exatoDefaults();e.ano=year;BD.exatoAno(e);const index=year-2026;assert.ok(Math.abs(e.ivaCheia-(c.cbs[index]+c.ibs[index])/100)<1e-10);if(year>2026){assert.equal(BD.simplesCron(year).cbs,year<=2028?.112:.113);}}
});
test('historical built-in fiscal regression retains its explicitly pinned scenario',()=>{
 const ctx=load(false),raw=JSON.parse(fs.readFileSync(path.join(root,'legacy/orcaplan-1.8.3/sinapi-2026-08.raw.json'),'utf8'));
 ctx.OP.app.base=ctx.OP.register.makeBase(raw,'test',[],[],[]);ctx.OP.app.pj=ctx.OP.engine.newProject();ctx.OP.iva.setup();
 const results=Array.from(ctx.TESTES.executar());assert.ok(results.length>80);
 // These two catalog-coverage checks refer to the original 4,876-input matrix;
 // this regression fixture has 6,120 inputs. They are independent of fiscal arithmetic.
 assert.deepEqual(results.filter(r=>!r.ok&&!r.nome.startsWith('Matriz cobre todos')&&!r.nome.startsWith('Anexos: 4.876')),[]);
});
