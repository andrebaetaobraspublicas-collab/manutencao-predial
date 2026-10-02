/* ==== 36_native_resources.js — v1.8.3: insumos diretamente no orçamento ==== */
(function(G){
'use strict';
const O=G.OP,N=O.register,E=O.engine,P=O.prod,UI=O.ui,A=O.app,U=O.util,clone=N.clone;
O.nativeBudget={};
const B=O.nativeBudget;
B.inputPrice=(base,code,uf,rg)=>{const x=base.ins(code);return x?base.insPrice(x.i,base.ufIndex(uf),rg)[0]:null;};
// Explicit type lives on the budget item. No synthetic composition is registered.
B.add=(pj,parent,code,qty=1)=>{const {item:it}=E.addItem(pj,parent,code,qty);it.resourceType='I';return it;};
UI.act.nativeInputAdd=el=>{
 const code=UI.code(el.dataset.code),x=A.base.ins(code);if(!x)return UI.toast('Insumo não encontrado.','warn');
 const it=B.add(A.pj,A.sel.stage||null,code,1);A.sel.item=it.id;UI.commit();UI.toast('Insumo '+code+' incluído diretamente no orçamento, quantidade 1. Ajuste a quantidade.');
};
const edit0=N.openBudget;
N.openBudget=id=>{const r=UI.model().byId.get(id);if(r?.node.resourceType==='I')return N.openInput(r.node.code,{clone:true,budgetId:id,budgetPrevious:r});return edit0(id);};
const uses0=N.uses;
N.uses=(type,code)=>{const v=uses0(type,code);if(type==='I')for(const r of UI.model().items)if(r.node.resourceType==='I'&&String(r.node.code)===String(code)&&!v.items.some(x=>x.id===r.id))v.items.push(r);return v;};
const proto=O.sinapi.Base.prototype,ins0=proto.ins;
proto.ins=function(code){const r=ins0.call(this,code);if(r&&this.quoteByCode?.has(Number(code)))return {...r,priceQuote:this.quoteByCode.get(Number(code))};return r;};
const row0=N.itemRow;
N.itemRow=(b,x,uf,rg)=>{const r=row0(b,x,uf,rg);if(x.type==='I')r.priceQuote=b.quoteByCode?.get(Number(x.code))||null;return r;};
// Own composite services can aggregate their auxiliary resources into the editable crew.
// This is opt-in; official SINAPI resource extraction remains unchanged.
const res0=P.resources,cache=new WeakMap();
P.resources=function(base,code){const c=base.custom.get(code), original=res0(base,code);const promote=base.planningAggregate&&original.direct.length===0&&original.support.some(x=>x.kind==='mo'&&x.h>0);if(!c?.crewAggregate&&!promote)return original;let store=cache.get(base);if(!store)cache.set(base,store=new Map());if(store.has(code))return store.get(code);
 const source=original,all=new Map();for(const x of [...source.direct,...source.support]){const key=x.key||x.kind+':'+U.norm(x.name),r=all.get(key)||{...x,key,h:0,chp:0,chi:0};r.h+=x.h||0;r.chp+=x.chp||0;r.chi+=x.chi||0;all.set(key,r);}
 const rows=[...all.values()].sort((a,b)=>b.h-a.h), main=c?.crewMainKeys||(promote?rows.filter(x=>x.kind==='mo').map(x=>x.key):[]);const out={direct:main.length?rows.filter(x=>main.includes(x.key)):rows,support:main.length?rows.filter(x=>!main.includes(x.key)):[]};store.set(code,out);return out;
};
const sync0=O.sitePlan.syncPrices;
O.sitePlan.syncPrices=function(base,pj){sync0(base,{...pj,root:{...pj.root,children:[]}});const stack=[pj.root];while(stack.length){const n=stack.pop();if(n.children){stack.push(...n.children);continue;}const l=n.referenceLink;if(!l||String(l.code)!==String(n.code))continue;
 if(n.custo!=null&&l.lastAutoCost!==n.custo){delete n.referenceLink;continue;}
 const price=n.resourceType==='I'?B.inputPrice(base,n.code,pj.uf,pj.rg):base.compCost(n.code,pj.uf,pj.rg);
 if(price!=null){delete n.custo;l.lastAutoCost=null;l.state='referência ativa';}
 else if(Number.isFinite(l.fallbackCost)){n.custo=l.fallbackCost;l.lastAutoCost=n.custo;l.state='valor histórico explícito — preço SINAPI ativo incompleto';}
 }};
// Budget-native labor, where used, receives its real hourly resource; rental/monthly
// resources remain supplies, not artificial production crews.
const compute0=E.compute;
E.compute=function(base,pj){const m=compute0(base,pj);return m;};
})(typeof window!=='undefined'?window:globalThis);

