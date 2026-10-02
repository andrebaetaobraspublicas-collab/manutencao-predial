/* ==== 30_catalog_core.js — v1.8: cadastros próprios, snapshots e cálculo ==== */
(function(G){
  'use strict';
  const OP=G.OP,U=OP.util,A=OP.app,E=OP.engine,S=OP.sinapi,UI=OP.ui;
  const N=OP.register={version:'1.8',library:{inputs:[],compositions:[]},revision:0};
  const clone=N.clone=x=>JSON.parse(JSON.stringify(x));
  const canon=N.code=x=>/^\d+$/.test(String(x))?Number(x):String(x);
  const ownCode=(x,type)=>new RegExp('^'+(type==='I'?'IP':'CP')+'-[A-Z0-9_-]{1,54}$').test(String(x));
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const clean=N.clean=(x,n=2000)=>String(x??'').trim().slice(0,n);
  const mm=N.month=x=>{const t=String(x||'').trim();if(/^\d{4}-\d{2}$/.test(t))return t;const m=/^(\d{2})\/(\d{4})$/.exec(t);return m?m[2]+'-'+m[1]:'';};
  N.classes=['MATERIAL','MAO DE OBRA','EQUIPAMENTO (AQUISIÇÃO)','EQUIPAMENTO (LOCAÇÃO)','ENCARGOS COMPLEMENTARES','SERVIÇOS','ESPECIAIS'];
  N.isLabor=x=>U.norm(x.cls)==='MAO DE OBRA';
  N.defaultProfile=cls=>({'MAO DE OBRA':'maoObra','MATERIAL':'material','EQUIPAMENTO (AQUISIÇÃO)':'equipamento','EQUIPAMENTO (LOCAÇÃO)':'locacao','SERVIÇOS':'servico'})[cls]||'';
  N.nextCode=type=>{const pending=[];for(let e=N.editor;e;e=e.parent)if(e.draft)pending.push(e.draft);const prefix=type==='I'?'IP':'CP';let n=0;for(const x of [...pending,...(A.inputs||[]),...(A.customs||[]),...N.library.inputs,...N.library.compositions]){const m=new RegExp('^'+prefix+'-(\\d+)$').exec(String(x.code));if(m)n=Math.max(n,Number(m[1]));}return prefix+'-'+String(n+1).padStart(4,'0');};
  N.newInput=()=>({id:'',code:N.nextCode('I'),desc:'',unit:'UN',cls:'MATERIAL',src:'PRÓPRIA',source:'',notes:'',taxProfile:'material',tax:{},taxAnnex:'',pricing:'uniform',chargeMode:'sinapi',chargeSD:null,chargeCD:null,prices:[{uf:'*',ref:'',date:'',base:null,sd:null,cd:null,se:null,source:''}],revision:0,history:[],created:Date.now()});
  N.newComp=()=>({id:'',code:N.nextCode('C'),desc:'',unit:'UN',group:'Composições próprias',src:'PRÓPRIA',source:'',notes:'',items:[],mode:'analytic',quote:null,quoteUF:'*',quoteRef:'',taxProfile:'',resourceKind:'service',resourceFamily:'',revision:0,history:[],created:Date.now()});
  N.charge=(raw,uf,rg,unit)=>{if(rg==='SE')return 0;const idx=raw.ufs.indexOf(uf);if(idx<0)return null;const kind=U.norm(unit)==='H'?'h':/^(MES|MÊS)$/.test(U.norm(unit))?'m':null;if(!kind)return null;const val=raw.encargos?.[rg]?.[kind]?.[idx];return finite(val)?(val>5?val/100:val):null;};
  N.resolvePrice=(input,raw,uf,rg)=>{
    const ref=mm(raw.ref),rows=input.prices||[];
    const row=rows.find(x=>x.uf===uf&&x.ref===ref&&ref)||rows.find(x=>x.uf==='*'&&x.ref===ref&&ref)||rows.find(x=>x.uf===uf&&!x.ref)||rows.find(x=>x.uf==='*'&&!x.ref);
    if(!row)return {price:null,row:null,charge:null,reason:'Sem preço para a UF e a referência ativas'};
    let v=null,charge=null;
    if(N.isLabor(input)){
      if(input.pricing==='salary'){
        charge=rg==='SE'?0:input.chargeMode==='manual'?input[rg==='CD'?'chargeCD':'chargeSD']:N.charge(raw,uf,rg,input.unit);
        if(finite(row.base)&&finite(charge))v=row.base*(1+charge);
      }else v=row[rg.toLowerCase()];
    }else v=row.base;
    return {price:finite(v)&&v>=0?Math.round(v*100):null,row,charge,reason:finite(v)?'':N.isLabor(input)&&input.pricing==='salary'&&!finite(charge)?'Encargo social indisponível; informe taxas próprias ou preços por regime':'Preço não informado'};
  };
  N.cloneInput=code=>{
    const own=A.inputs.find(x=>x.code===String(code));if(own){const c=clone(own);c.tax=clone(A.pj.iva?.cfg?.base?.porInsumo[own.code]||own.tax||{});c.taxAnnex=A.pj.iva?.cfg?.regimeInsumo[own.code]??own.taxAnnex??'';c.code=N.nextCode('I');c.id='';c.revision=0;c.history=[];c.created=Date.now();c.base=own.code;c.archived=false;return c;}
    const b=A.base,info=b.ins(canon(code));if(!info)throw new Error('Insumo não encontrado.');
    const c=N.newInput();Object.assign(c,{desc:info.desc,unit:info.unit,cls:info.cls,base:info.code,source:'Cópia de SINAPI '+info.code+' · '+b.raw.ref,pricing:N.isLabor(info)?'explicit':'uniform'});
    c.prices=b.ufs.map(uf=>{const row={uf,ref:'',date:'',base:null,sd:null,cd:null,se:null,source:'SINAPI '+b.raw.ref};for(const rg of ['SD','CD','SE']){const p=b.insPrice(info.i,b.ufIndex(uf),rg);row[rg.toLowerCase()]=p[0]==null?null:p[0]/100;if(rg==='SD'){row.base=p[0]==null?null:p[0]/100;if(p[1])row.source+=' · preço atribuído a SP';}}return row;});
    const ix=c.prices.findIndex(x=>x.uf===A.pj.uf);if(ix>0)c.prices.unshift(c.prices.splice(ix,1)[0]);
    c.taxProfile=G.MOTOR.perfilBase(OP.iva.db().ins.get(String(code)));c.notes='Cópia independente. Os preços foram copiados da referência indicada; não serão atualizados automaticamente com outra base. Confira o enquadramento tributário específico.';return c;
  };
  N.cloneComp=code=>{
    const b=A.base,c=b.comp(canon(code));if(!c)throw new Error('Composição não encontrada.');
    const n=c.src==='SINAPI'?N.newComp():clone(c);n.code=N.nextCode('C');n.id='';n.revision=0;n.history=[];n.created=Date.now();n.archived=false;
    if(c.src==='SINAPI'){Object.assign(n,{desc:c.desc,unit:c.unit,group:c.group,base:c.code,source:'Adaptada do SINAPI '+c.code+' · '+b.raw.ref,resourceKind:b.isEquip[c.j]?'equipment':b.isLabor[c.j]?'labor':'service',items:b.raw.comp.it[c.j].map(([x,coef])=>({type:x<0?'C':'I',code:Math.abs(x),coef}))});}else{n.base=c.code;if(c.mode==='quoted'){const k=JSON.stringify(['C','PRÓPRIA',String(c.code),c.unit]);n.taxProfile=A.pj.iva?.terminals?.[k]?.profile||c.taxProfile||'';}}
    return n;
  };
  // O raw oficial nunca é editado: os insumos próprios são acrescentados a cópias rasas dos vetores.
  N.makeBase=(official,id,inputs,comps,quotes=[])=>{
    const raw={...official,un:official.un.slice(),cls:official.cls.slice(),ins:{...official.ins,lab:{...official.ins.lab}}};
    for(const k of ['c','k','d','u','o','p'])raw.ins[k]=official.ins[k].slice();
    const index=(a,x)=>{let i=a.indexOf(x);if(i<0){i=a.length;a.push(x);}return i;};
    for(const x of inputs){raw.ins.c.push(x.code);raw.ins.d.push(x.desc);raw.ins.k.push(index(raw.cls,x.cls));raw.ins.u.push(index(raw.un,x.unit));raw.ins.o.push(0);const vec=rg=>raw.ufs.map(uf=>N.resolvePrice(x,raw,uf,rg).price);raw.ins.p.push(vec('SD'));raw.ins.lab[x.code]={CD:vec('CD'),SE:vec('SE')};}
    const appliedQuotes=[];
    for(const q of quotes||[]){
      if(q.ref&&q.ref!==mm(official.ref))continue;
      const ix=raw.ins.c.indexOf(Number(q.code)),ui=raw.ufs.indexOf(q.uf);
      if(ix<0||ui<0||!Number.isFinite(q.value)||q.value<0)continue;
      // Only supplement a blank official price. A published price always prevails.
      if(official.ins.p[ix]?.[ui]!=null)continue;
      raw.ins.p[ix]=raw.ins.p[ix]?raw.ins.p[ix].slice():raw.ufs.map(()=>null);raw.ins.p[ix][ui]=Math.round(q.value*100);
      if(raw.ins.lab[q.code]){raw.ins.lab[q.code]={...raw.ins.lab[q.code]};for(const rg of ['CD','SE'])if(raw.ins.lab[q.code][rg]){const v=raw.ins.lab[q.code][rg].slice();if(v[ui]==null)v[ui]=Math.round(q.value*100);raw.ins.lab[q.code][rg]=v;}}
      if(q.cls&&U.norm(raw.cls[raw.ins.k[ix]])==='SEM PRECO')raw.ins.k[ix]=index(raw.cls,q.cls);
      appliedQuotes.push(clone(q));
    }
    const b=new S.Base(raw,id);b.quoteByCode=new Map(appliedQuotes.map(q=>[Number(q.code),q]));b.officialRaw=official;b.nOfficialIns=official.ins.c.length;b.ownInputs=new Map(inputs.map(x=>[x.code,x]));b.setCustom(comps);OP.search.build(b);return b;
  };
  N.rebuild=()=>{
    if(!A.base)return;const original=A.base.officialRaw||A.base.raw;
    A.base=N.makeBase(original,A.base.id,A.inputs||[],A.customs||[],A.pj?.sinapiPriceQuotes||[]);A.model=null;N.revision++;
    OP.iva.invalidate();N.snapshot();
  };
  N.snapshot=()=>{if(A.pj)A.pj.catalog={v:1,inputs:clone(A.inputs||[]),compositions:clone(A.customs||[])};};
  N.hydrate=pj=>{
    const data=pj.catalog?.v===1?pj.catalog:null;
    A.inputs=clone(data?.inputs||N.library.inputs||[]);A.customs=clone(data?.compositions||N.library.compositions||[]);
    A.inputs.forEach(x=>{x.src='PRÓPRIA';x.id=x.code;});A.customs.forEach(x=>{x.src='PRÓPRIA';x.id=x.code;x.mode=x.mode||'analytic';x.revision=x.revision||1;});
    N.snapshot();N.rebuild();
    if(OP.iva){OP.iva.config();N.seedTax(false);}
  };
  N.seedTax=force=>{
    if(!A.pj?.iva?.cfg)return;const cfg=A.pj.iva.cfg;
    for(const x of A.inputs||[]){if(force===x.code||!Object.hasOwn(cfg.base.porInsumo,x.code))cfg.base.porInsumo[x.code]=clone(x.tax||{});if(force===x.code||!Object.hasOwn(cfg.regimeInsumo,x.code))cfg.regimeInsumo[x.code]=x.taxAnnex||'';}
    for(const c of A.customs||[])if(c.mode==='quoted'){
      const key=JSON.stringify(['C','PRÓPRIA',String(c.code),c.unit]);if(c.taxProfile&&(force===c.code||!A.pj.iva.terminals[key]))A.pj.iva.terminals[key]={profile:c.taxProfile,note:c.notes||c.source||'Perfil atribuído pelo usuário.'};else if(force===c.code&&!c.taxProfile)delete A.pj.iva.terminals[key];
    }
    OP.iva.invalidate();
  };
  // A compatibilidade com códigos alfanuméricos está concentrada nestes métodos.
  const proto=S.Base.prototype,ins0=proto.ins,price0=proto.insPrice,items0=proto.itemsOf,res0=proto.resources;
  proto.ins=function(code){const own=this.ownInputs?.get(String(code));if(!own)return ins0.call(this,code);return {code:own.code,i:this.insIdx.get(own.code),desc:own.desc,unit:own.unit,cls:own.cls,cat:S.catOfClass(own.cls),origem:'PRÓPRIA',src:'PRÓPRIA',own:true};};
  proto.insPrice=function(i,ui,rg){const code=this.raw.ins.c[i];if(this.ownInputs?.has(String(code))){const lab=this.raw.ins.lab[code],arr=rg==='SD'?this.raw.ins.p[i]:lab?.[rg];return [arr?.[ui]??null,false];}return price0.call(this,i,ui,rg);};
  N.itemRow=(b,x,uf,rg)=>{
    if(x.type==='C'){const row=b._itemRow(typeof x.code==='number'?-x.code:String(x.code),x.coef,b.ufIndex(uf),uf,rg),own=b.custom.get(x.code);if(own){row.labor=own.resourceKind==='labor';row.equip=own.resourceKind==='equipment';}return row;}
    const info=b.ins(canon(x.code)),p=info?b.insPrice(info.i,b.ufIndex(uf),rg):[null,false];return {type:'I',code:canon(x.code),desc:info?.desc||'Insumo não encontrado',unit:info?.unit||'',coef:x.coef,price:p[0],sp:p[1],total:p[0]==null?null:S.mulTrunc(Math.round(x.coef*1e8),p[0]),cls:info?.cls,cat:info?.cat||'out'};
  };
  proto.itemsOf=function(code,uf,rg){const c=this.custom.get(code);if(!c)return items0.call(this,code,uf,rg);return c.mode==='quoted'?[]:(c.items||[]).map(x=>N.itemRow(this,x,uf,rg));};
  proto.customCost=function(cp,uf,rg){
    const all=this._customCostCache||(this._customCostCache=new Map()),key=uf+'|'+rg;let memo=all.get(key);if(!memo)all.set(key,memo=new Map());
    const active=new Set(),stack=[{cp,pos:0,total:0}];
    while(stack.length){const f=stack[stack.length-1],c=f.cp,k=c.code;if(memo.has(k)){stack.pop();continue;}active.add(k);const finish=v=>{memo.set(k,v);active.delete(k);stack.pop();};
      if(c.mode==='quoted'){const valid=(!c.quoteUF||c.quoteUF==='*'||c.quoteUF===uf)&&(!c.quoteRef||c.quoteRef===mm(this.raw.ref));finish(valid&&finite(c.quote)?Math.round(c.quote*100):null);continue;}
      const list=c.items||[];if(!list.length){finish(null);continue;}if(f.pos>=list.length){finish(f.total);continue;}
      const x=list[f.pos];if(!finite(x.coef)||x.coef<0||!['C','I'].includes(x.type)){finish(null);continue;}if(x.coef===0){f.pos++;continue;}
      let p=null;const child=x.type==='C'&&this.custom.get(canon(x.code));
      if(child){if(active.has(child.code)){finish(null);continue;}if(!memo.has(child.code)){stack.push({cp:child,pos:0,total:0});continue;}p=memo.get(child.code);}
      else if(x.type==='C')p=this.compCost(canon(x.code),uf,rg);
      else {const input=this.ins(canon(x.code));if(input)p=this.insPrice(input.i,this.ufIndex(uf),rg)[0];}
      if(!finite(p)||p<0){finish(null);continue;}const part=S.mulTrunc(Math.round(x.coef*1e8),p);if(!Number.isSafeInteger(part)||!Number.isSafeInteger(f.total+part)){finish(null);continue;}f.total+=part;f.pos++;
    }return {cost:memo.get(cp.code)??null};
  };
  // Recursos de composições oficiais continuam no caminho original. Próprias usam referências tipadas.
  proto.resources=function(code){
    if(!this.custom.has(code))return res0.call(this,code);
    const direct=new Map(),support=new Map(),active=new Set(),b=this;
    const list=c=>{const own=b.custom.get(c);if(own)return own.mode==='quoted'?[]:own.items||[];const j=b.compIdx.get(canon(c));return j==null?[]:b.raw.comp.it[j].map(([x,coef])=>({type:x<0?'C':'I',code:Math.abs(x),coef}));};
    const add=(map,key,obj,field,q)=>{const r=map.get(key)||{key,h:0,chp:0,chi:0,...obj};r[field]+=q;map.set(key,r);};
    const stack=[{code,factor:1,depth:0,list:list(code),pos:0}];active.add(String(code));
    while(stack.length){const f=stack[stack.length-1];if(f.pos>=f.list.length){active.delete(String(f.code));stack.pop();continue;}const x=f.list[f.pos++];if(!finite(x.coef)||x.coef<=0)continue;const q=f.factor*x.coef;if(!finite(q))continue;const map=f.depth===0?direct:support;
      if(x.type==='I'){const i=b.ins(canon(x.code));if(!i)continue;const unit=U.norm(i.unit);if(U.norm(i.cls)==='MAO DE OBRA'&&unit==='H')add(map,'MI:'+x.code,{kind:'mo',code:x.code,name:U.cap(i.desc.replace(/\s*\((HORISTA|MENSALISTA)\)\s*$/i,''))},'h',q);else if(U.norm(i.cls).startsWith('EQUIPAMENTO')&&['H','CHP','CHI'].includes(unit))add(map,'EI:'+x.code,{kind:'eq',code:x.code,name:U.cap(i.desc)},unit==='CHI'?'chi':'chp',q);continue;}
      const c=b.comp(canon(x.code));if(!c)continue;const labor=c.j!=null?b.isLabor[c.j]:c.resourceKind==='labor',equipment=c.j!=null?b.isEquip[c.j]:c.resourceKind==='equipment';
      if(labor){if(c.unit==='H')add(map,'MO:'+x.code,{kind:'mo',code:x.code,name:b.laborName(c.desc)},'h',q);continue;}
      if(equipment&&['H','CHP','CHI'].includes(c.unit)){const family=c.resourceFamily||b.equipKey(c.desc);add(map,'EQ:'+family,{kind:'eq',name:b.equipName(c.desc),operator:c.j!=null?b.operatorOf(c.j):null},c.unit==='CHI'?'chi':'chp',q);continue;}
      if(active.has(String(x.code)))continue;active.add(String(x.code));stack.push({code:canon(x.code),factor:q,depth:f.depth+1,list:list(canon(x.code)),pos:0});
    }
    const finish=m=>[...m.values()].map(r=>{if(r.kind==='eq')r.h=r.chp+r.chi;return r;}).filter(r=>r.h>0);return {direct:finish(direct),support:finish(support)};
  };
  const breakdown0=proto.breakdown;proto.breakdown=function(code,uf,rg,memo){const c=this.custom.get(code);if(c?.mode==='quoted'){const p=this.compCost(code,uf,rg);return {mo:0,mat:0,eq:0,serv:0,out:p||0};}return breakdown0.call(this,code,uf,rg,memo);};
  N.uses=(type,code)=>{
    const reverse=new Map();for(const c of A.customs)for(const x of c.items||[]){const k=x.type+':'+x.code;if(!reverse.has(k))reverse.set(k,[]);reverse.get(k).push(c.code);}
    const keys=new Set([type+':'+String(code)]),queue=[type+':'+String(code)],parent=[];
    for(let i=0;i<queue.length;i++)for(const c of reverse.get(queue[i])||[]){const k='C:'+c;if(!keys.has(k)){keys.add(k);queue.push(k);parent.push(c);}}
    const items=UI.model().items.filter(r=>keys.has('C:'+String(r.node.code)));return {parents:parent,items};
  };
  N.validateGraph=(comps,root,base=A.base)=>{
    const map=new Map(comps.map(c=>[String(c.code),c])),get=key=>{const c=map.get(key);if(c)return c.mode==='quoted'?[]:c.items||[];const j=base.compIdx.get(canon(key));return j==null?[]:base.raw.comp.it[j].map(([k,coef])=>({type:k<0?'C':'I',code:Math.abs(k),coef}));};
    const done=new Set(),active=new Set(),stack=[{code:String(root),pos:0}];
    while(stack.length){const f=stack[stack.length-1];if(done.has(f.code)){stack.pop();continue;}if(!f.list){f.list=get(f.code);active.add(f.code);}if(f.pos>=f.list.length){active.delete(f.code);done.add(f.code);stack.pop();continue;}const x=f.list[f.pos++];if(x.type!=='C'||x.coef===0)continue;const k=String(x.code);if(active.has(k))return {ok:false,cycle:[...stack.map(x=>x.code),k].slice(-25)};if(!done.has(k))stack.push({code:k,pos:0});}
    return {ok:true};
  };
  N.validateInput=(v,old)=>{
    const errors=[],warnings=[];if(!ownCode(v.code,'I'))errors.push('Use código IP- seguido de letras, números, hífen ou sublinhado.');if(!v.desc.trim())errors.push('Informe a descrição do insumo.');if(!v.unit.trim())errors.push('Informe a unidade.');if(!N.classes.includes(v.cls))errors.push('Classificação inválida.');
    if(!old&&A.inputs.some(x=>x.code===v.code))errors.push('Já existe um insumo com esse código.');
    if(old&&old.code!==v.code)errors.push('O código de um cadastro existente não pode ser alterado.');
    if(old&&old.unit!==v.unit&&N.uses('I',old.code).parents.length)errors.push('A unidade de um insumo usado não pode ser alterada. Crie uma cópia com novo código.');
    const seen=new Set();for(const r of v.prices||[]){const key=r.uf+'|'+r.ref;if(seen.has(key))errors.push('Há preços repetidos para a mesma UF e referência.');seen.add(key);if(r.uf!=='*'&&!A.base.ufs.includes(r.uf))errors.push('UF inválida.');if(r.ref&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.ref))errors.push('Referência mensal inválida.');for(const k of ['base','sd','cd','se'])if(r[k]!=null&&(!finite(r[k])||r[k]<0||r[k]>1e10))errors.push('Preços devem ser números não negativos de até R$ 10 bilhões.');}
    if(N.isLabor(v)&&v.pricing==='salary'&&v.chargeMode==='sinapi'&&!['H','MES','MÊS'].includes(v.unit))errors.push('Para encargos sociais automáticos use H ou MES, ou informe preços por regime.');
    for(const k of ['chargeSD','chargeCD'])if(v[k]!=null&&(!finite(v[k])||v[k]<0||v[k]>10))errors.push('Encargos próprios devem estar entre 0% e 1.000%.');
    if(v.taxProfile&&!Object.hasOwn(G.MOTOR.PERFIS,v.taxProfile))errors.push('Perfil tributário inválido.');
    for(const k of ['legadoPct','fatorCredito','fatorAliquota'])if(v.tax?.[k]!=null&&(!finite(v.tax[k])||v.tax[k]<0||v.tax[k]>100))errors.push('Percentuais tributários devem estar entre 0% e 100%.');
    if(N.resolvePrice(v,A.base.raw,A.pj.uf,A.pj.rg).price==null)warnings.push('O insumo será salvo sem preço utilizável no contexto atual.');if(!v.taxProfile)warnings.push('O crédito de IVA ficará não determinado até a escolha de um perfil.');return {errors:[...new Set(errors)],warnings};
  };
  N.validateComp=(v,old)=>{
    const errors=[],warnings=[];if(!ownCode(v.code,'C'))errors.push('Use código CP- seguido de letras, números, hífen ou sublinhado.');if(!v.desc.trim())errors.push('Informe a descrição da composição.');if(!v.unit.trim())errors.push('Informe a unidade.');if(!old&&A.customs.some(x=>x.code===v.code))errors.push('Já existe uma composição com esse código.');
    if(old&&old.code!==v.code)errors.push('O código de um cadastro existente não pode ser alterado.');
    if(old&&old.unit!==v.unit){const use=N.uses('C',old.code);if(use.items.length||use.parents.length)errors.push('A unidade da composição já utilizada está protegida. Crie outra composição para uma unidade diferente.');}
    if(v.mode==='quoted'){if(v.quoteUF!=='*'&&!A.base.ufs.includes(v.quoteUF))errors.push('UF da cotação inválida.');if(v.quoteRef&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(v.quoteRef))errors.push('Mês da cotação inválido.');if(v.quote!=null&&(!finite(v.quote)||v.quote<0||v.quote>1e10))errors.push('Custo de cotação inválido.');if(v.quote==null)warnings.push('Composição sem custo informado.');}
    else {
      if(!v.items.length)warnings.push('Composição sem analítico: custo e crédito não determinados.');
      for(const x of v.items){if(!['C','I'].includes(x.type)||!finite(x.coef)||x.coef<0||x.coef>1e8)errors.push('Coeficientes devem ser números entre 0 e 100 milhões.');if(x.type==='I'?!A.base.ins(canon(x.code)):String(x.code)!==v.code&&!A.base.comp(canon(x.code)))warnings.push('Referência não encontrada: '+x.code);}
      const graph=N.validateGraph([...A.customs.filter(c=>c.code!==v.code),v],v.code);if(!graph.ok)errors.push('Referência circular não permitida: '+graph.cycle.join(' → '));
    }return {errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
  };
  N.previewComp=v=>{const b=Object.create(A.base);b.custom=new Map(A.base.custom);b.custom.set(v.code,v);b._customCostCache=new Map();b._bdCache=new Map();return {cost:b.compCost(v.code,A.pj.uf,A.pj.rg),base:b};};
  N.withRevision=(obj,old,reason)=>{const v=clone(obj);v.source=clean(v.source);v.notes=clean(v.notes,10000);v.id=v.code;v.src='PRÓPRIA';v.created=old?.created||v.created||Date.now();v.updated=Date.now();v.revision=(old?.revision||0)+1;v.history=clone(old?.history||[]);if(old){const snapshot=clone(old);delete snapshot.history;v.history.push({rev:old.revision||1,at:old.updated||old.created,reason:reason||'Edição do cadastro',snapshot});}return v;};
  N.publish=async()=>{
    for(const [key,list,store] of [['inputs',A.inputs,'inputs'],['compositions',A.customs,'custom']]){const lib=new Map(N.library[key].map(x=>[x.code,x]));for(const x of list)lib.set(x.code,clone(x));N.library[key]=[...lib.values()];await Promise.all(list.map(x=>OP.store.put(store,x)));}
  };
  N.save=async(type,draft,{budgetId='',costPolicy='analytic',reason='Edição do cadastro'}={})=>{
    const list=type==='I'?A.inputs:A.customs,old=list.find(x=>x.code===draft.code),valid=(type==='I'?N.validateInput:N.validateComp)(draft,old);
    if(valid.errors.length)throw new Error(valid.errors.join('\n'));
    const budgetNode=budgetId?E.find(A.pj,budgetId)?.node:null;if(budgetId&&!budgetNode)throw new Error('O item orçamentário não está mais disponível.');
    const value=N.withRevision(draft,old,reason);if(value.mode==='quoted')value.items=[];
    const at=list.findIndex(x=>x.code===value.code);if(at<0)list.push(value);else list[at]=value;
    const lib=type==='I'?N.library.inputs:N.library.compositions,li=lib.findIndex(x=>x.code===value.code);if(li<0)lib.push(clone(value));else lib[li]=clone(value);
    let item;
    if(budgetId){item=budgetNode;
      const previous={};for(const k of ['code','resourceType','desc','unit','fonte','custo','memo','crew'])if(Object.hasOwn(item,k)&&item[k]!==undefined)previous[k]=clone(item[k]);
      (item.compositionHistory||=[]).push({at:Date.now(),previous,to:value.code});item.code=value.code;item.resourceType=type;delete item.desc;delete item.unit;item.fonte='PRÓPRIA';item.crew=null;
      if(costPolicy!=='fixed'){delete item.custo;delete item.memo;}
    }
    N.rebuild();N.seedTax(value.code);N.snapshot();A.pj.updated=Date.now();
    try{await N.publish();await OP.store.put('projects',A.pj);}catch(e){A.saveError=true;UI.toast('Alterações mantidas na sessão, mas houve falha de gravação. Salve o projeto JSON. '+e.message,'warn');}
    UI.saveSoon();return {value,warnings:valid.warnings};
  };
  N.restoreBudget=id=>{
    const node=E.find(A.pj,id)?.node,entry=node?.compositionHistory?.at(-1);if(!entry)return false;
    for(const k of ['code','resourceType','desc','unit','fonte','custo','memo','crew'])delete node[k];Object.assign(node,clone(entry.previous));node.compositionHistory.pop();if(A.drawer&&(A.drawer.fromBudgetId===id||A.drawer.ivaItemId===id)){A.drawer.code=node.code;A.drawer.exp=new Set();}A.model=null;UI.commit();return true;
  };
  // Projeto JSON é uma unidade autocontida, com cadastros e cenário. Sem sobrescrever por código ao importar.
  N.catalogBundle=()=>({app:'OrçaPlan SINAPI — cadastros',catalogVersion:1,saved:new Date().toISOString(),baseRef:A.base.raw.ref,inputs:A.inputs.map(x=>({...clone(x),tax:clone(A.pj.iva?.cfg?.base?.porInsumo?.[x.code]||x.tax||{}),taxAnnex:A.pj.iva?.cfg?.regimeInsumo?.[x.code]??x.taxAnnex??''})),compositions:A.customs.map(c=>{const x=clone(c);if(c.mode==='quoted'){const k=JSON.stringify(['C','PRÓPRIA',String(c.code),c.unit]);x.taxProfile=A.pj.iva?.terminals?.[k]?.profile||c.taxProfile||'';}return x;})});
  N.exportProject=()=>{N.snapshot();const bundle={app:'OrçaPlan SINAPI',v:2,appVersion:'1.8.3',saved:new Date().toISOString(),baseRef:A.base.raw.ref,project:A.pj,custom:A.customs,inputs:A.inputs};OP.exp.download('OrcaPlan_'+clean(A.pj.name,50).replace(/[^\w-]+/g,'_')+'.orcaplan.json',JSON.stringify(bundle,null,2),'application/json');};
  N.importCatalog=async cat=>{
    const inputs=clone(cat.inputs),compositions=clone(cat.compositions),map=new Map(),reserved=new Set([...(A.inputs||[]),...(A.customs||[]),...N.library.inputs,...N.library.compositions].map(x=>x.code));
    const allocate=type=>{let i=1,code;do{code=(type==='I'?'IP':'CP')+'-'+String(i++).padStart(4,'0');}while(reserved.has(code));reserved.add(code);return code;};
    for(const [type,list] of [['I',inputs],['C',compositions]])for(const x of list){if(!ownCode(x.code,type)||map.has(type+':'+x.code))throw new Error('Código inválido ou repetido: '+x.code);map.set(type+':'+x.code,allocate(type));}
    for(const x of inputs){const old=x.code;x.code=map.get('I:'+old);x.id=x.code;x.base=old;x.revision=1;x.history=[];x.src='PRÓPRIA';x.created=Date.now();x.updated=Date.now();x.desc=clean(x.desc);x.unit=clean(x.unit,32).toUpperCase();const v=N.validateInput(x);if(v.errors.length)throw new Error(v.errors.join('; '));}
    for(const c of compositions){const old=c.code;c.code=map.get('C:'+old);c.id=c.code;c.base=old;c.revision=1;c.history=[];c.src='PRÓPRIA';c.mode=c.mode||'analytic';c.created=Date.now();c.updated=Date.now();c.desc=clean(c.desc);c.unit=clean(c.unit,32).toUpperCase();if(!c.desc||!c.unit||!Array.isArray(c.items))throw new Error('Descrição, unidade ou itens inválidos em '+old);if(c.mode==='quoted'){if(c.quote!=null&&(!finite(c.quote)||c.quote<0))throw new Error('Cotação inválida');c.items=[];}for(const r of c.items){if(!['I','C'].includes(r.type)||!finite(r.coef)||r.coef<0||r.coef>1e8)throw new Error('Coeficiente inválido em '+old);const key=r.type+':'+r.code;r.code=map.get(key)||canon(r.code);}}
    const all=[...A.customs,...compositions];for(const c of compositions){const check=N.validateGraph(all,c.code);if(!check.ok)throw new Error('Referência circular: '+check.cycle.join(' → '));}
    A.inputs.push(...inputs);A.customs.push(...compositions);N.library.inputs.push(...clone(inputs));N.library.compositions.push(...clone(compositions));N.rebuild();for(const x of [...inputs,...compositions])N.seedTax(x.code);N.snapshot();A.pj.updated=Date.now();
    try{await N.publish();await OP.store.put('projects',A.pj);}catch(e){UI.toast('Cadastros na sessão; falha ao gravar no navegador. Exporte JSON.','warn');}return {inputs,compositions,map};
  };
  N.importData=async data=>{
    const pj=clone(data.project||data);if(!pj.root||!Array.isArray(pj.root.children))throw new Error('O arquivo não é um projeto OrçaPlan.');
    if(!pj.catalog)pj.catalog={v:1,inputs:data.inputs||[],compositions:data.custom||[]};
    if(pj.catalog.v!==1||!Array.isArray(pj.catalog.inputs)||!Array.isArray(pj.catalog.compositions))throw new Error('Cadastro do projeto incompatível.');
    const I=pj.catalog.inputs,C=pj.catalog.compositions,seen=new Set();
    for(const x of I){if(!ownCode(x.code,'I')||seen.has(x.code)||!N.classes.includes(x.cls)||!Array.isArray(x.prices))throw new Error('Insumo próprio inválido/duplicado: '+x.code);seen.add(x.code);for(const p of x.prices)for(const k of ['base','sd','cd','se'])if(p[k]!=null&&(!finite(p[k])||p[k]<0))throw new Error('Preço inválido no insumo '+x.code);}
    seen.clear();for(const c of C){if(!ownCode(c.code,'C')||seen.has(c.code)||!Array.isArray(c.items))throw new Error('Composição própria inválida/duplicada: '+c.code);seen.add(c.code);for(const r of c.items){if(!['I','C'].includes(r.type)||!finite(r.coef)||r.coef<0)throw new Error('Coeficiente inválido em '+c.code);r.code=canon(r.code);}}
    for(const c of C){const check=N.validateGraph(C,c.code);if(!check.ok)throw new Error('Ciclo de composições no arquivo: '+check.cycle.join(' → '));}
    pj.id=U.uid('pj');pj.updated=Date.now();OP.main.openProject(pj);await OP.store.put('projects',A.pj);return pj;
  };
})(typeof window!=='undefined'?window:globalThis);

