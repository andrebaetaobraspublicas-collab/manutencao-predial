/* ==== 29_basic_diagnostics.js — v1.4, análise somente leitura ==== */
(function (G) {
  'use strict';
  const OP=G.OP, UI=OP.ui, A=OP.app, U=OP.util, ABC=OP.abc, D=OP.drawer, esc=U.esc;
  const money=v=>v==null?'—':U.num(v/100,2), brl=v=>v==null?'Não determinado':U.brl(v/100);
  const number=v=>typeof v==='number'&&Number.isFinite(v);
  const canon=v=>/^\d+$/.test(String(v))?Number(v):String(v);
  const csvCell=v=>{if(v==null)return '""';let s=typeof v==='number'?String(v).replace('.',','):String(v);if(typeof v!=='number'&&/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const saveCSV=(name,rows)=>OP.exp.download(name,'\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8');
  const slug=s=>String(s).replace(/[^\w.-]+/g,'_').slice(0,90)||'OrcaPlan';

  // Reutiliza a DFS iterativa da ABC. Uma composição = um serviço sintético com Q=1.
  const B=OP.basic={version:'1.4'};
  let basicBase=null, basicCustom=null, basicCache=new Map();
  B.unitModel=(base,pj,code)=>{
    code=canon(code);const comp=base.comp(code),cost=base.compCost(code,pj.uf,pj.rg);
    const r={id:'basic-root',num:'1',depth:0,isStage:false,node:{code,qty:1},qty:1,comp,unit:comp?.unit||'',desc:comp?.desc||String(code),fonte:comp?.src||base.raw.fonte||'SINAPI',unitCost:cost,direct:cost==null?0:cost,fixo:false};
    return {base,pj,uf:pj.uf,rg:pj.rg,items:[r],flat:[r],tot:{direct:r.direct}};
  };
  B.compute=(base,pj,code)=>ABC.compute(B.unitModel(base,pj,code));
  const basicKey=code=>String(code)+'|'+A.pj.uf+'|'+A.pj.rg;
  function ensureBasicCache(){if(basicBase!==A.base||basicCustom!==A.base.custom){basicBase=A.base;basicCustom=A.base.custom;basicCache=new Map();}}
  function startBasic(c,st,key){
    const base=A.base,customMap=A.base.custom,uf=A.pj.uf,rg=A.pj.rg,job={key,base,customMap};
    st.basicJob=job;
    setTimeout(async()=>{
      const cancelled=()=>A.drawer!==st||st.basicJob!==job||basicKey(c.code)!==key||A.base!==base||A.base.custom!==customMap;
      try{
        if(cancelled())return;
        const model=B.unitModel(base,{...A.pj,uf,rg},c.code);
        const result=await ABC.computeAsync(model,null,cancelled);
        if(!result||cancelled())return;
        if(basicCache.size>64)basicCache.delete(basicCache.keys().next().value);
        basicCache.set(key,result);st.basicError=null;
      }catch(e){if(!cancelled()){st.basicError=String(e.message||e);st.basicErrorKey=key;}}
      finally{if(A.drawer===st&&st.basicJob===job){st.basicJob=null;if(st.tab==='basic')D.render();}}
    },0);
  }
  function basicResult(){ensureBasicCache();return A.drawer&&basicCache.get(basicKey(A.drawer.code));}
  function visibleBasic(result){
    const st=A.drawer,term=U.norm(st.basicSearch||''),nature=st.basicNature||'',mode=st.basicMode==='allocated'&&result.canAllocate?'allocated':'reference';
    let rows=result.rows.map((r,i)=>({...r,index:i,value:mode==='allocated'?r.allocated:r.reference}));
    rows=rows.filter(r=>(!term||U.norm([r.code,r.desc,r.reason,r.source,r.nature].join(' ')).includes(term))&&(!nature||(nature==='__terminal'?r.incomplete:r.nature===nature)));
    const sorter=st.basicSort||'code';
    rows.sort((a,b)=>sorter==='value'?((a.value==null)-(b.value==null)||(b.value||0)-(a.value||0)||a.index-b.index):sorter==='desc'?String(a.desc).localeCompare(String(b.desc),'pt-BR'):String(a.code).localeCompare(String(b.code),'pt-BR',{numeric:true})||a.index-b.index);
    return {rows,mode};
  }
  const basicCode=r=>(r.type==='I'?A.base.ins(r.code):A.base.comp(r.code))?`<button class="lnk code" data-act="${r.type==='I'?'ivaIns':'ivaComp'}" data-code="${esc(r.code)}" title="Consultar este código">${esc(r.code)}</button>`:`<span class="code">${esc(r.code)}</span>`;
  const basicRow=(r,mode)=>`<tr><td>${basicCode(r)}<small class="fonte" title="${esc(r.source)}">${esc(r.source)}</small></td><td class="basic-desc">${esc(r.desc)}<small>${esc(r.nature)}</small>${r.incomplete?`<span class="tag warn">Nível disponível: ${esc(r.reason||'sem analítico')}</span>`:''}${r.price==null?' <span class="tag warn">Sem preço</span>':''}${r.sp?' <span class="tag" title="Preço atribuído a São Paulo">AS · SP</span>':''}</td><td>${esc(r.unit||'—')}</td><td class="r mono" title="${esc(String(r.qty))}">${ABC.quantity(r.qty)}</td><td class="r">${r.price==null?'—':U.num(r.price/100,6,2)}</td><td class="r"><b>${money(r.value)}</b>${mode==='allocated'?`<br><small class="muted" title="Apropriado menos quantidade × preço, antes do arredondamento de exibição">aj. ${money(r.allocated-r.raw)}</small>`:''}</td><td class="r"><button class="lnk" data-act="basicPaths" data-i="${r.index}" title="Caminhos e coeficientes acumulados">${r.occurrences.length} ↗</button></td></tr>`;
  B.refresh=()=>{
    const result=basicResult(),st=A.drawer,box=UI.$('#basicTableBox'),pager=UI.$('#basicPager');if(!result||!st||!box||!pager)return;
    const v=visibleBasic(result),per=80,pages=Math.max(1,Math.ceil(v.rows.length/per));st.basicPage=Math.min(Math.max(0,st.basicPage||0),pages-1);
    const shown=v.rows.slice(st.basicPage*per,(st.basicPage+1)*per),total=v.mode==='allocated'?result.directTotal:result.referenceTotal;
    box.innerHTML=`<table class="tbl op-basic-table"><colgroup><col style="width:95px"><col><col style="width:46px"><col style="width:128px"><col style="width:104px"><col style="width:118px"><col style="width:64px"></colgroup><thead><tr><th>Código / fonte</th><th>Insumo básico / nível disponível</th><th>Und.</th><th class="r">Coeficiente<br>acumulado</th><th class="r">Preço de<br>referência · R$</th><th class="r">${v.mode==='allocated'?'Custo apropriado':'Total referência'}<br>R$</th><th class="r">Caminhos</th></tr></thead><tbody>${shown.map(r=>basicRow(r,v.mode)).join('')||'<tr><td colspan="7">Nenhum insumo corresponde ao filtro.</td></tr>'}</tbody><tfoot><tr><td colspan="5">Total de toda a composição${result.missingPrices?' · parcela conhecida':''} · sem BDI${v.rows.length!==result.rows.length?' (não muda com o filtro)':''}</td><td class="r">${money(total)}</td><td></td></tr></tfoot></table>`;
    pager.innerHTML=`<span>${v.rows.length} de ${result.rows.length} linhas · página ${st.basicPage+1} de ${pages}</span><div class="row"><button class="btn sm" data-act="basicPage" data-d="-1" ${st.basicPage===0?'disabled':''}>Anterior</button><button class="btn sm" data-act="basicPage" data-d="1" ${st.basicPage>=pages-1?'disabled':''}>Próxima</button></div>`;
  };
  D.tabs.basic=c=>{
    ensureBasicCache();const st=A.drawer,key=basicKey(c.code),r=basicCache.get(key);
    if(st.basicJob&&(st.basicJob.key!==key||st.basicJob.base!==A.base||st.basicJob.customMap!==A.base.custom))st.basicJob=null;
    if(st.basicErrorKey!==key)st.basicError=null;
    if(!r){
      if(!st.basicJob&&!st.basicError)startBasic(c,st,key);
      return `<div class="op-basic-loading">${st.basicError?`<b>Não foi possível concluir a decomposição.</b><p>${esc(st.basicError)}</p><button class="btn" data-act="basicRetry">Tentar novamente</button>`:'<b>Abrindo as composições auxiliares…</b><p>A decomposição considera todos os níveis e mantém os ramos sem detalhamento.</p>'}</div>`;
    }
    const cost=r.model.items[0].unitCost,natures=[...new Set(r.rows.map(x=>x.nature))].sort(),ctx=st.fromBudgetId&&UI.model().byId.get(st.fromBudgetId);
    const html=`<div class="op-basic"><div class="op-basic-intro"><div><h3>Analítico - somente insumos básicos</h3><p class="note">${esc(c.code)} · por <b>1 ${esc(c.unit)}</b> da composição · ${esc(A.pj.uf)} · ${esc(OP.sinapi.REGIMES[A.pj.rg])} · base ${esc(A.base.raw.ref)}.<br>Auxiliares, mão de obra com encargos, CHP e CHI abertos em todos os níveis disponíveis.</p></div><button class="btn" data-act="basicCSV">${UI.icon('dl')} CSV completo</button></div>
      <div class="op-basic-kpis"><div class="card"><small>Custo unitário da composição</small><b>${brl(cost)}</b></div><div class="card"><small>Soma dos insumos · referência${r.missingPrices?' parcial':''}</small><b>${brl(r.referenceTotal)}</b></div><div class="card"><small>${r.rows.length} linhas · até ${r.maxDepth} níveis</small><b>${r.terminalCount} linha${r.terminalCount===1?'':'s'} não detalhada${r.terminalCount===1?'':'s'}</b><span class="muted">${r.missingPrices} sem preço</span></div></div>
      ${ctx?.fixo?`<div class="refbox"><b>Referência da base ativa.</b> O item ${esc(ctx.num)} tem custo informado de ${brl(ctx.unitCost)} por ${esc(ctx.unit)}. Esta aba mostra a composição da base, não reconstitui esse preço informado nem o aplica silenciosamente aos insumos.</div>`:''}
      <div class="op-basic-tools"><label class="fld"><span>Pesquisar insumo</span><input type="search" data-in="basicSearch" value="${esc(st.basicSearch||'')}" placeholder="Código, descrição ou aviso…"></label><label class="fld"><span>Natureza / condição</span><select data-ch="basicNature"><option value="">Todas</option><option value="__terminal" ${st.basicNature==='__terminal'?'selected':''}>Somente não detalhados</option>${natures.map(n=>`<option value="${esc(n)}" ${st.basicNature===n?'selected':''}>${esc(n)}</option>`).join('')}</select></label><label class="fld"><span>Ordenar</span><select data-ch="basicSort">${[['code','Código'],['desc','Descrição'],['value','Maior custo']].map(([k,n])=>`<option value="${k}" ${(st.basicSort||'code')===k?'selected':''}>${n}</option>`).join('')}</select></label><label class="fld"><span>Valoração · sem BDI</span><select data-ch="basicMode"><option value="reference" ${st.basicMode!=='allocated'?'selected':''}>Quantidade × preço de referência</option><option value="allocated" ${st.basicMode==='allocated'?'selected':''} ${!r.canAllocate?'disabled':''}>Conciliado ao custo unitário</option></select></label></div>
      <div class="tblw" id="basicTableBox"></div><div class="op-basic-foot" id="basicPager"></div>
      <div class="refbox"><b>Como ler:</b> coeficiente acumulado = produto dos coeficientes de cada caminho; ocorrências compatíveis são somadas. A composição expandida não é somada novamente aos filhos. ${cost!=null?`A soma de referência difere ${brl(r.referenceTotal-cost)} do custo unitário.`:''} O truncamento entre níveis pode gerar diferenças. A opção conciliada distribui os centavos proporcionalmente, <b>sem mudar quantidades nem preços de referência</b>. ${!r.canAllocate?'<b>Conciliação indisponível:</b> há preço ausente, ramo inválido ou custo não conciliável. A parcela conhecida continua visível.':''}</div>
      <p class="note">Folhas sem analítico continuam identificadas no nível disponível. Quantidades de aquisição, depreciação e manutenção de equipamentos são coeficientes econômicos, não uma lista de compras. Crédito de IVA e legislação permanecem nas abas tributárias.</p></div>`;
    return html;
  };
  for(const k of ['Nature','Sort','Mode'])UI.chg['basic'+k]=el=>{if(!A.drawer)return;A.drawer['basic'+k]=el.value;A.drawer.basicPage=0;B.refresh();};
  UI.inp.basicSearch=el=>{if(!A.drawer)return;A.drawer.basicSearch=el.value;A.drawer.basicPage=0;B.refresh();};
  UI.act.basicPage=el=>{A.drawer.basicPage=(A.drawer.basicPage||0)+Number(el.dataset.d);B.refresh();};
  UI.act.basicRetry=()=>{A.drawer.basicError=null;A.drawer.basicJob=null;D.render();};
  UI.act.basicCSV=()=>{
    const r=basicResult();if(!r)return;const mode=visibleBasic(r).mode;
    saveCSV('Analitico_Basico_'+slug(A.drawer.code)+'_'+A.pj.uf+'.csv',[
      ['OrçaPlan v1.4 — analítico somente insumos básicos'],['Composição',r.model.items[0].node.code,r.model.items[0].desc],['Escopo','1 '+r.model.items[0].unit,'Base',r.metadata.ref,'UF',r.metadata.uf,'Regime',r.metadata.regime],['Valoração',mode==='allocated'?'Conciliado ao custo unitário':'Quantidade × preço de referência','Sem BDI'],
      ['Código','Fonte','Descrição','Natureza','Unidade','Coeficiente acumulado','Preço referência R$','Total referência R$','Custo apropriado R$','Diferença de apropriação R$','Caminhos','Condição','AS/SP'],
      ...r.rows.map(x=>[x.code,x.source,x.desc,x.nature,x.unit,x.qty,x.price==null?null:x.price/100,x.reference==null?null:x.reference/100,x.allocated==null?null:x.allocated/100,x.allocated==null?null:(x.allocated-x.raw)/100,x.occurrences.length,x.reason||'Insumo básico',x.sp?'Sim':'Não']),
      ['Custo unitário da composição',r.model.items[0].unitCost==null?null:r.model.items[0].unitCost/100],['Total conhecido de referência',r.referenceTotal/100],['Linhas sem preço',r.missingPrices],['Aviso','Arquivo completo, independente dos filtros. Apropriação é rateio contábil; não muda quantidades ou preços e não reconstitui uma cotação.']
    ]);UI.toast('Analítico completo exportado, sem limitar pelos filtros.');
  };
  let pathsState=null;
  function pathsRender(){
    const s=pathsState;if(!s)return;const all=s.row.occurrences,pages=Math.max(1,Math.ceil(all.length/25));s.page=Math.max(0,Math.min(s.page,pages-1));
    UI.$('#basicPathBody').innerHTML=all.slice(s.page*25,(s.page+1)*25).map((o,i)=>{
      const path=ABC.path(o.path),short=path.length>24?[...path.slice(0,8),{code:'… '+(path.length-16)+' níveis intermediários …'},...path.slice(-8)]:path;
      return `<div class="op-path-list"><b>Caminho ${s.page*25+i+1}</b> · coeficiente acumulado <b>${ABC.quantity(o.qty)} ${esc(s.row.unit)}</b><div class="op-path">${short.map(p=>esc(p.code)+(p.coef!=null?' [× '+ABC.quantity(p.coef)+']':'')).join(' › ')}</div>${path.length>24?'<span class="note">Prévia abreviada; o arquivo de caminhos contém todos os níveis.</span>':''}</div>`;
    }).join('');
    UI.$('#basicPathPager').innerHTML=`<span>${all.length} caminhos · página ${s.page+1}/${pages}</span><div class="row"><button class="btn sm" data-act="basicPathPage" data-d="-1" ${s.page===0?'disabled':''}>Anterior</button><button class="btn sm" data-act="basicPathPage" data-d="1" ${s.page===pages-1?'disabled':''}>Próxima</button><button class="btn sm" data-act="basicPathExport">Exportar todos os caminhos</button></div>`;
  }
  UI.act.basicPaths=el=>{const r=basicResult(),row=r?.rows[+el.dataset.i];if(!row)return;pathsState={row,page:0,composition:A.drawer.code};UI.modal('Caminhos do insumo '+row.code,`<p class="note">${esc(row.desc)} · consumo total ${ABC.quantity(row.qty)} ${esc(row.unit)} por unidade da composição. O fator da raiz é 1.</p><div id="basicPathBody"></div><div id="basicPathPager" class="dg-pager"></div>`,{wide:true,after:pathsRender});};
  UI.act.basicPathPage=el=>{pathsState.page+=+el.dataset.d;pathsRender();};
  UI.act.basicPathExport=()=>{const s=pathsState;if(!s)return;const text=['OrçaPlan — caminhos completos','Composição: '+s.composition,'Insumo: '+s.row.code+' — '+s.row.desc,...s.row.occurrences.map((o,i)=>'\nCaminho '+(i+1)+' · coeficiente acumulado '+String(o.qty)+' '+s.row.unit+'\n'+ABC.path(o.path).map(p=>p.code+' [× '+String(p.coef)+']').join(' > '))].join('\n');OP.exp.download('Caminhos_'+slug(s.composition)+'_'+slug(s.row.code)+'.txt',text,'text/plain;charset=utf-8');};

  // Largura compartilhada pelas abas normais e tributárias; arraste da borda esquerda.
  let detailWidth=null,detailFull=false,drag=null;
  function applyWidth(){const el=UI.$('#drawer');if(!el)return;el.classList.toggle('op-detail-full',detailFull);if(detailWidth)el.style.setProperty('--op-detail-width',detailWidth+'px');else el.style.removeProperty('--op-detail-width');const h=el.querySelector('.op-resize-handle');if(h)h.setAttribute('aria-valuenow',String(Math.round(el.getBoundingClientRect().width)));}
  const previousRender=D.render;
  D.render=()=>{
    previousRender();const el=UI.$('#drawer');if(!A.drawer||el.hidden)return;
    const header=el.querySelector('.dr-h'),close=header?.querySelector('[data-act="drClose"]');
    if(close&&!header.querySelector('.op-size-toggle')){const btn=document.createElement('button');btn.type='button';btn.className='btn ghost op-size-toggle';btn.dataset.act='detailSize';btn.textContent=detailFull?'Recolher':'Ampliar';btn.title='Alternar largura do painel de detalhamento';close.before(btn);}
    if(!el.querySelector('.op-resize-handle')){const h=document.createElement('button');h.type='button';h.className='op-resize-handle';h.setAttribute('role','separator');h.setAttribute('aria-orientation','vertical');h.setAttribute('aria-label','Largura do painel: arraste ou use as setas esquerda e direita');h.setAttribute('aria-valuemin','600');h.setAttribute('aria-valuemax',String(innerWidth));el.appendChild(h);}
    applyWidth();if(A.drawer.tab==='basic')B.refresh();
  };
  UI.act.detailSize=()=>{detailFull=!detailFull;applyWidth();D.render();};
  document.addEventListener('pointerdown',ev=>{const h=ev.target.closest('.op-resize-handle');if(!h)return;ev.preventDefault();detailFull=false;drag={id:ev.pointerId,start:ev.clientX,width:UI.$('#drawer').getBoundingClientRect().width,handle:h};h.setPointerCapture(ev.pointerId);});
  document.addEventListener('pointermove',ev=>{if(!drag||ev.pointerId!==drag.id)return;detailWidth=Math.round(Math.min(innerWidth-24,Math.max(600,drag.width+drag.start-ev.clientX)));applyWidth();});
  document.addEventListener('pointerup',ev=>{if(!drag||ev.pointerId!==drag.id)return;drag=null;OP.store.setSetting('detailWidth14',detailWidth);});
  document.addEventListener('pointercancel',()=>{drag=null;});
  document.addEventListener('keydown',ev=>{if(!ev.target.matches('.op-resize-handle')||!['ArrowLeft','ArrowRight','Home'].includes(ev.key))return;ev.preventDefault();detailFull=false;detailWidth=ev.key==='Home'?null:Math.round(Math.min(innerWidth-24,Math.max(600,(UI.$('#drawer').getBoundingClientRect().width)+(ev.key==='ArrowLeft'?40:-40))));applyWidth();OP.store.setSetting('detailWidth14',detailWidth);});
  G.addEventListener('resize',applyWidth);
  B.loadWidth=async()=>{const x=await OP.store.setting('detailWidth14');if(Number.isFinite(x)&&x>=600&&x<=4000){detailWidth=x;applyWidth();}};
  const openComp0=UI.act.openComp;
  UI.act.openComp=(el,...args)=>{openComp0(el,...args);if(A.drawer){A.drawer.fromBudgetId=el.closest?.('[data-budget-id]')?.dataset.budgetId||null;}};

  // Diagnóstico determinístico: apontamentos verificáveis, sem correções automáticas.
  const DG=OP.diagnostic={version:'1.4',state:{kind:'',domain:'',q:'',page:0,deviation:5,concentration:20},report:null,job:0};
  const kinds={error:['Erros','var(--crit)'],warning:['Alertas','#bc810b'],data:['Dados incompletos','var(--ink-3)'],review:['Oportunidades de análise','var(--blue)']};
  const domains=['Cadastro e referências','Custos e conciliação','Composições e insumos','Tributação e BDI','Planejamento','Relevância econômica','Armazenamento'];
  DG.signature=()=>JSON.stringify([A.pj,A.customs]);
  DG.current=()=>DG.report&&DG.report.base===A.base&&DG.report.signature===DG.signature();
  DG.analyze=(m,tax,settings={})=>{
    const deviation=number(settings.deviation)?settings.deviation:5,concentration=number(settings.concentration)?settings.concentration:20;
    const findings=[],seen=new Set(),abc=tax?.e?.abc,byId=m.byId||new Map(m.items.map(x=>[x.id,x]));
    const add=(rule,kind,domain,r,title,evidence,recommendation,view='budget',ids=[])=>{
      const key=rule+'|'+(r?.id||ids.join('|')||title);if(seen.has(key))return;seen.add(key);
      findings.push({key,rule,kind,domain,itemId:r?.id||ids[0]||'',num:r?.num||'',code:String(r?.node?.code||''),title,evidence,recommendation,view,itemIds:r?[r.id]:ids,amount:r?.total||0,description:r?.desc||r?.node?.name||''});
    };
    const good=v=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v));
    if(!m.items.length)add('empty','data','Cadastro e referências',null,'Orçamento sem serviços','Não há serviços para verificar.','Adicione serviços pelo catálogo ou itens com custo informado.');
    for(const r of m.items){
      const n=r.node;
      if(!good(n.qty)||Number(n.qty)<0)add('qty-invalid','error','Cadastro e referências',r,'Quantidade inválida','Valor cadastrado: '+String(n.qty)+'. O modelo pode normalizar esse valor.','Informe uma quantidade numérica não negativa.');
      else if(+n.qty===0)add('qty-zero','data','Cadastro e referências',r,'Quantidade não informada ou igual a zero','O serviço não participa dos totais nem da decomposição enquanto a quantidade for zero.','Verifique se o item deve permanecer no orçamento e informe seu quantitativo.');
      if(n.custo!=null&&n.custo!==''&&(!good(n.custo)||+n.custo<0))add('fixed-invalid','error','Custos e conciliação',r,'Custo informado inválido','Valor cadastrado: '+String(n.custo)+'.','Revise o custo unitário; valores negativos ou não numéricos não são suportados.');
      if(!String(r.unit||'').trim())add('unit-empty','data','Cadastro e referências',r,'Unidade ausente','Não há unidade física declarada.','Informe a unidade coerente com o quantitativo e a composição.');
      if(!String(n.desc||r.comp?.desc||r.input?.desc||'').trim())add('desc-empty','data','Cadastro e referências',r,'Descrição sem referência suficiente','Não há descrição própria nem descrição de composição vinculada.','Identifique o objeto e sua especificação.');
      if(!String(r.fonte||'').trim())add('source-empty','data','Cadastro e referências',r,'Fonte não identificada','O campo de origem da referência está vazio.','Registre SINAPI, tabela externa ou origem da cotação.');
      if(!(r.qty>0))continue;
      if(r.unitCost==null)add('cost-missing','data','Custos e conciliação',r,'Serviço sem custo determinado','O serviço tem quantidade, mas o total financeiro aparece como zero no modelo por ausência de custo.','Identifique o preço/analítico ausente. Não trate o total conhecido como orçamento completo.');
      else if(r.unitCost===0)add('cost-zero','warning','Custos e conciliação',r,'Custo unitário igual a zero','Quantidade positiva × custo zero.','Confirme se a gratuidade é intencional ou se o preço ainda precisa ser informado.');
      if(![r.direct,r.total].every(number))add('nonfinite-total','error','Custos e conciliação',r,'Total não finito','Há total fora da faixa numérica suportada.','Revise quantidades, custos e BDI.');
      const expansion=ABC.canExpandItem(r);
      if(r.comp&&!expansion.ok)add('source-unit-conflict','warning','Composições e insumos',r,'Vínculo analítico não utilizado',expansion.reason+'.','Revise a fonte/unidade. Código homônimo não comprova a correspondência da composição.');
      if(r.fixo&&expansion.ok&&r.comp&&r.ucBase>0&&r.unitCost!=null){
        const diff=(r.unitCost/r.ucBase-1)*100;
        if(Math.abs(diff)>=deviation&&Math.abs(diff)>1e-8)add('fixed-diff','warning','Custos e conciliação',r,'Custo informado difere da base ativa em '+U.num(diff,2)+'%',`Informado ${brl(r.unitCost)}; base ${brl(r.ucBase)}. Limite de triagem: ${U.num(deviation,2)}%.`,'Confirme a data-base, a fonte e a memória. A diferença não comprova sobrepreço nem autoriza atualização automática.');
      }
      if(n.bdiDif&&m.pj.bdi2==null)add('bdi-orphan','warning','Tributação e BDI',r,'BDI diferenciado marcado sem taxa definida','O modelo utiliza o BDI principal, pois não há segundo BDI cadastrado.','Cadastre a taxa diferenciada ou reveja a marcação.','bdi');
      else if(r.bdiDif&&(r.bd?.mo||0)>0)add('bdi-review','review','Tributação e BDI',r,'Revisar justificativa do BDI diferenciado',`O item usa BDI diferenciado e contém parcela de mão de obra (${brl(r.bd.mo)}).`,'Confira o critério e a justificativa aplicáveis. A presença de mão de obra, isoladamente, não indica irregularidade.','bdi');
      const iv=tax?.byService?.get(r.id);
      if(iv&&!iv.complete)add('iva-partial','data','Tributação e BDI',r,iv.known?'Crédito de IVA parcial':'Crédito de IVA não determinado',`${iv.missing} ocorrência(s) sem cálculo completo no exercício ${tax.year}; ${iv.known} ocorrência(s) conhecidas.`,'Abra a memória tributária e confira preços admitidos, perfis e parcelas não detalhadas.','iva');
      if(+n.dur>0)add('duration-manual','warning','Planejamento',r,'Duração manual adotada',`Prazo cadastrado: ${n.dur} dias; prazo usado no modelo: ${r.days} dias úteis.`,'Confira a compatibilidade com as quantidades, equipe e restrições de execução.','crews');
      else if(r.prod?.noProd&&!n.work?.span)add('productivity-missing','data','Planejamento',r,'Duração padrão sem produtividade','Não há recurso de produção dimensionável; o prazo usa o padrão de um dia.','Informe duração manual coerente ou complete o analítico de recursos.','crews');
      if(+n.target>0&&(m.execution?r.prod.days:r.days)>+n.target)add('target-missed','warning','Planejamento',r,'Prazo-alvo não atendido',`Prazo-alvo ${n.target} dias; duração calculada/adotada ${r.days} dias.`,'Revise número de equipes, jornada e duração manual.','crews');
      if(r.weight*100>=concentration&&r.total>0)add('concentration','review','Relevância econômica',r,'Serviço de elevada participação',`${U.num(r.weight*100,2)}% do preço conhecido do orçamento (${brl(r.total)}). Limite de triagem ${U.num(concentration,2)}%.`,'Priorize quantitativos, especificação, consumo e preço na conferência. Concentração não é, por si só, erro.');
    }
    for(const s of m.stages||[])if(!s.leaf?.length)add('empty-stage','data','Cadastro e referências',s,'Etapa sem serviços','A etapa não contém serviços em nenhum subnível.','Complete a etapa ou avalie removê-la.');
    if(abc){
      for(const origin of abc.sources){const r=byId.get(origin.id);if(origin.incomplete)add('terminal','data','Composições e insumos',r,'Decomposição com nível não detalhado',`${origin.incomplete} ocorrência(s) terminal(is) mantida(s) no nível disponível.`,'Complete o analítico ou documente a cotação. A parcela não foi ocultada nem decomposta por presunção.','basic');}
      for(const x of abc.rows){
        const ids=[...x.origins.keys()];
        if(x.price==null)add('input-missing:'+x.key,'data','Composições e insumos',null,'Insumo / parcela sem preço: '+x.code,`${x.desc}. ${ids.length} serviço(s) afetado(s). Fonte: ${x.source}.`,'Abra os itens de origem e confira a referência. Preço ausente não significa custo zero.','basic',ids);
      }
      const invalid=new Map();for(const x of abc.issues){const r=m.items.find(r=>r.num===x.num);const key=(r?.id||x.num)+'|'+x.reason;if(!invalid.has(key))invalid.set(key,{r,x});}
      for(const {r,x} of invalid.values())add('branch-invalid:'+x.reason,'error','Composições e insumos',r,x.reason,'Código '+x.code+'; ramo preservado sem expansão.','Corrija os vínculos ou coeficientes da composição própria.','basic');
      if(abc.canAllocate){const total=abc.rows.reduce((s,x)=>s+(x.allocated||0),0);if(total!==m.tot.direct)add('abc-concil','error','Custos e conciliação',null,'Falha na conciliação da ABC',`ABC apropriada ${brl(total)} × custo direto ${brl(m.tot.direct)}.`,'Revise a memória antes de utilizar o total.');}
      if(abc.missingPrices===0&&Math.abs(abc.referenceTotal-m.tot.direct)>1)add('reference-delta','review','Custos e conciliação',null,'Referência analítica e custo direto diferentes',`Soma de referência ${brl(abc.referenceTotal)} × custo direto ${brl(m.tot.direct)}; diferença ${brl(abc.referenceTotal-m.tot.direct)}.`,'Examine a conciliação da ABC: truncamento entre níveis e custos informados podem explicar a diferença. Não é, isoladamente, erro.');
      const sp=abc.rows.filter(x=>x.sp);if(sp.length)add('sp-prices','review','Cadastro e referências',null,'Preços atribuídos a São Paulo',`${sp.length} linha(s) da decomposição utilizam atribuição de preço de SP (AS).`,'Confira a representatividade regional dos itens relevantes; a atribuição é sinalizada pela base.','budget',[...new Set(sp.flatMap(x=>[...x.origins.keys()]))]);
    }else add('abc-notrun','data','Composições e insumos',null,'Decomposição não disponível para verificação','A memória ABC não foi disponibilizada ao diagnóstico.','Recalcule após conferir a base e o orçamento.');
    for(const k of ['direct','price']){const sum=m.items.reduce((s,r)=>s+(k==='direct'?r.direct:r.total),0);if(Math.abs(sum-m.tot[k])>.01)add('total-'+k,'error','Custos e conciliação',null,'Total financeiro não conciliado',`Soma de serviços ${brl(sum)} × total exibido ${brl(m.tot[k])}.`,'Não some subtotais de etapas novamente. Revise a integridade do modelo.');}
    if(tax){const si=[...tax.byService.values()].reduce((s,x)=>s+x.creditCents,0),sb=[...tax.byABC.values()].reduce((s,x)=>s+x.creditCents,0);if(si!==sb||si!==tax.total.creditCents||tax.total.ibsCents+tax.total.cbsCents!==si)add('iva-concil','error','Tributação e BDI',null,'Crédito de IVA sem conciliação',`Serviços ${brl(si)}; insumos ${brl(sb)}; total ${brl(tax.total.creditCents)}.`,'Confira a memória tributária e recalcule o cenário.','reforma');}
    if(m.cpm?.cycle?.length)add('cpm-cycle','error','Planejamento',null,'Rede de precedências com ciclo / bloqueio',`${m.cpm.cycle.length} atividade(s) sinalizada(s) pelo motor CPM. Vínculos afetados foram desconsiderados no cálculo.`,'Remova a circularidade e reavalie o prazo; a sinalização pode incluir sucessoras bloqueadas.','schedule',m.cpm.cycle);
    if(m.pj.seq==='manual')for(const link of m.pj.links||[]){
      if(!byId.has(link.from)||!byId.has(link.to))add('link-missing:'+link.from+'>'+link.to,'warning','Planejamento',null,'Predecessora ou sucessora não encontrada',`Vínculo ${link.from} → ${link.to} não é usado na rede válida.`,'Revise os vínculos manuais.','schedule');
      else if(link.from===link.to)add('self-link:'+link.from,'error','Planejamento',byId.get(link.from),'Atividade vinculada a si mesma','A ligação foi ignorada pelo motor CPM.','Corrija a predecessora.','schedule');
      else if(!['FS','SS','FF','SF'].includes(String(link.type||'FS').toUpperCase()))add('type-link:'+link.from+'>'+link.to,'warning','Planejamento',byId.get(link.to),'Tipo de vínculo não reconhecido',`Tipo cadastrado: ${String(link.type)}.`,'Escolha TI, II, TT ou IT.','schedule');
    }
    const cal=m.pj.calendar||{};if(!good(cal.hpd)||+cal.hpd<=0||+cal.hpd>24)add('calendar-hpd','error','Planejamento',null,'Jornada fora do intervalo suportado','Jornada cadastrada: '+String(cal.hpd)+' h/dia.','Informe valor maior que zero e no máximo 24 horas por dia.','schedule');
    if(!cal.workdays?.length)add('calendar-days','warning','Planejamento',null,'Calendário sem dias úteis definidos','O motor utiliza dias úteis padrão quando a seleção está vazia.','Defina explicitamente os dias de trabalho.','schedule');
    if(!good(m.pj.bdi)||+m.pj.bdi<0||+m.pj.bdi>=3)add('bdi-invalid','error','Tributação e BDI',null,'BDI principal fora do intervalo suportado','BDI cadastrado: '+String(m.pj.bdi)+'.','Revise o parâmetro. O diagnóstico não avalia faixas referenciais legais.','bdi');
    if(m.pj.bdi2!=null&&(!good(m.pj.bdi2)||+m.pj.bdi2<0||+m.pj.bdi2>=3))add('bdi2-invalid','error','Tributação e BDI',null,'BDI diferenciado fora do intervalo suportado','Taxa diferenciada cadastrada: '+String(m.pj.bdi2)+'.','Revise o parâmetro do BDI diferenciado.','bdi');
    if(m.base.raw.valid?.total&&m.base.raw.valid.ok<m.base.raw.valid.total)add('base-validation','warning','Cadastro e referências',null,'Base com divergências de conferência',`${m.base.raw.valid.ok} de ${m.base.raw.valid.total} custos coincidiram no registro de conferência da base.`,'Consulte Base de dados e examine as divergências antes de adotar os preços.','base');
    if(m.pj.seq!=='manual'&&m.items.length>1)add('automatic-network','review','Planejamento',null,'Sequenciamento automático adotado','O cronograma usa a política '+String(m.pj.seq)+', não uma rede de execução validada em campo.','Confira as precedências e restrições de execução. A ausência de ciclo não comprova viabilidade física.','schedule');
    const duplicates=new Map();for(const r of m.items){if(!r.node.code)continue;const key=JSON.stringify([r.parent?.id||'',String(r.node.code),r.fonte,r.unit]);if(!duplicates.has(key))duplicates.set(key,[]);duplicates.get(key).push(r);}
    for(const list of duplicates.values())if(list.length>1)add('repeat:'+list[0].id,'review','Cadastro e referências',null,'Mesmo código repetido na mesma etapa',`Código ${list[0].node.code} aparece nos itens ${list.map(r=>r.num).join(', ')}.`,'Confira a separação de frentes/locais. Repetição não é duplicidade indevida presumida.','budget',list.map(r=>r.id));
    const order=Object.keys(kinds);findings.sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind)||b.amount-a.amount||a.num.localeCompare(b.num,'pt-BR',{numeric:true})||a.rule.localeCompare(b.rule));
    const counts=Object.fromEntries(order.map(k=>[k,findings.filter(x=>x.kind===k).length]));
    return {findings,counts,settings:{deviation,concentration},created:new Date().toISOString(),meta:{project:m.pj.name,uf:m.uf,regime:OP.sinapi.REGIMES[m.rg],base:m.base.raw.ref,source:m.base.raw.fonte||'SINAPI',year:tax?.year||null,services:m.items.length,active:m.items.filter(r=>r.qty>0).length,direct:m.tot.direct,price:m.tot.price,days:m.T,iva:tax?.total||null,inputs:abc?.rows.length||0,visited:abc?.visited||0},byId};
  };
  function diagFiltered(){const r=DG.report,s=DG.state,term=U.norm(s.q);return r.findings.filter(x=>(!s.kind||x.kind===s.kind)&&(!s.domain||x.domain===s.domain)&&(!term||U.norm([x.num,x.code,x.description,x.title,x.evidence,x.recommendation,x.rule].join(' ')).includes(term)));}
  DG.refresh=()=>{
    const box=UI.$('#dgFindings');if(!box||!DG.report)return;const s=DG.state,rows=diagFiltered(),per=30,pages=Math.max(1,Math.ceil(rows.length/per));s.page=Math.max(0,Math.min(s.page,pages-1));
    UI.$$('.dg-count').forEach(el=>el.classList.toggle('on',el.dataset.kind===s.kind));
    box.innerHTML=rows.slice(s.page*per,(s.page+1)*per).map(f=>{
      const ids=f.itemIds||[],index=DG.report.findings.indexOf(f),origin=DG.report.byId;
      return `<article class="dg-finding" style="--dgc:${kinds[f.kind][1]}"><div class="dg-find-head"><div><span class="dg-label">${esc(kinds[f.kind][0])} · ${esc(f.domain)}${f.num?' · item '+esc(f.num):''}</span><h4>${esc(f.title)}</h4>${f.description?`<span class="note">${esc(f.code)} · ${esc(f.description)}</span>`:''}</div><button class="btn sm" data-act="diagGoto" data-i="${index}">${f.itemId?(f.view==='basic'?'Ver analítico':f.view==='iva'?'Ver memória':'Localizar item'):'Abrir módulo'}</button></div><p>${esc(f.evidence)}</p><p class="dg-recommend"><b>Como revisar:</b> ${esc(f.recommendation)}</p><details><summary>Critério ${esc(f.rule.split(':')[0])}${ids.length?' · '+ids.length+' item(ns) de origem':''}</summary><p>Apontamento determinístico, sem alteração de valores. Um mesmo item pode aparecer em mais de uma verificação; não some os impactos como se fossem parcelas independentes.</p>${ids.length?`<div class="dg-origins">${ids.map(id=>{const r=origin.get(id);return r?`<button class="btn sm" data-act="diagOrigin" data-id="${esc(id)}" title="${esc(r.desc||r.node.name)}">Item ${esc(r.num)} · ${esc(r.node.code||'sem código')}</button>`:'';}).join('')}</div>`:''}</details></article>`;
    }).join('')||`<div class="empty">${DG.report.findings.length?'Nenhum apontamento corresponde aos filtros.':'Nenhum apontamento nas verificações executadas. Isso não constitui certificação de regularidade ou completude do orçamento.'}</div>`;
    UI.$('#dgPager').innerHTML=`<span>${rows.length} de ${DG.report.findings.length} apontamentos · página ${s.page+1}/${pages}</span><div class="row"><button class="btn sm" data-act="diagPage" data-d="-1" ${s.page===0?'disabled':''}>Anterior</button><button class="btn sm" data-act="diagPage" data-d="1" ${s.page===pages-1?'disabled':''}>Próxima</button></div>`;
  };
  function diagHTML(){
    const r=DG.report,s=DG.state,m=r.meta;
    return `<div class="dg-shell"><div class="dg-overview"><div><h2>Diagnóstico do orçamento</h2><p>Verificações de dados, custos, decomposição, IVA e planejamento. Os apontamentos não bloqueiam o trabalho nem alteram quantidades, preços, BDI ou regras tributárias.</p></div><div class="row"><button class="btn" data-act="diagCSV">${UI.icon('dl')} CSV completo</button><button class="btn" data-act="diagJSON">${UI.icon('dl')} JSON</button><button class="btn pri" data-act="diagRun">${UI.icon('ok')} Verificar novamente</button></div></div><div class="dg-meta"><b>${esc(m.project)}</b> · ${esc(m.source)} ${esc(m.base)} · ${esc(m.uf)} · ${esc(m.regime)} · IVA ${m.year||'—'}<br>Executado em ${new Date(r.created).toLocaleString('pt-BR')} · ${DG.current()?'retrato atual do projeto':'resultado desatualizado; execute novamente antes de exportar'}</div>
      <div class="dg-counters">${Object.entries(kinds).map(([k,[label,col]])=>`<button class="dg-count ${s.kind===k?'on':''}" style="--dgc:${col}" data-act="diagKind" data-kind="${k}" title="Filtrar ${esc(label)}"><strong>${r.counts[k]}</strong><span>${label}</span></button>`).join('')}</div>
      <div class="dg-measures"><span>Serviços cadastrados / com quantidade<b>${m.services} / ${m.active}</b></span><span>Custo direto conhecido<b>${brl(m.direct)}</b></span><span>Preço conhecido<b>${brl(m.price)}</b></span><span>IVA ${m.year||''}${m.iva&&!m.iva.complete?' · parcial':''}<b>${m.iva?OP.iva.cell(m.iva):'Não calculado'}</b></span><span>Insumos / níveis disponíveis<b>${m.inputs} linhas</b></span></div>
      <details class="dg-rules"><summary>Critérios e limites de triagem</summary><div class="pform"><label class="fld"><span>Desvio do custo informado ≥ (%)</span><input id="dgDeviation" type="number" min="0" max="10000" step="0.1" value="${s.deviation}"></label><label class="fld"><span>Participação do serviço ≥ (%)</span><input id="dgConcentration" type="number" min="0" max="100" step="1" value="${s.concentration}"></label><button class="btn" data-act="diagLimits">Aplicar e verificar</button></div><p class="dg-rule-note">Limites operacionais de triagem, não limites legais. Desvio é a diferença percentual absoluta entre custo informado e custo da base ativa. Concentração usa o preço conhecido, com BDI. Erros indicam inconsistências objetivas; alertas pedem revisão de premissas; dados incompletos identificam lacunas; oportunidades priorizam análise. Não é feita avaliação automática da regularidade do BDI nem inferência de sobrepreço.</p></details>
      <div class="dg-tools"><label class="fld"><span>Pesquisar</span><input type="search" data-in="diagQ" value="${esc(s.q)}" placeholder="Item, código, descrição ou verificação…"></label><label class="fld"><span>Área</span><select data-ch="diagDomain"><option value="">Todas as áreas</option>${domains.map(x=>`<option ${s.domain===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label><button class="btn ghost" data-act="diagClear">Limpar filtros</button></div><div id="dgFindings" class="dg-findings"></div><div id="dgPager" class="dg-pager"></div><p class="note">Os grupos contam apontamentos, não itens únicos. Não há validação jurídica/fiscal automática nem inspeção de condições físicas da obra. Os dados conhecidos continuam disponíveis mesmo com pendências.</p></div>`;
  }
  function showDiag(){UI.modal('Verificar orçamento',diagHTML(),{wide:true,after:()=>{UI.$('#overlay').classList.add('dg-wide');DG.refresh();},onClose:()=>UI.$('#overlay').classList.remove('dg-wide')});}
  DG.run=async()=>{
    const job=++DG.job;UI.modal('Verificar orçamento','<div class="op-basic-loading"><b>Verificando orçamento e composições…</b><p>Leitura dos serviços, insumos, conciliações e premissas de planejamento.</p></div>',{wide:true,onClose:()=>{if(DG.job===job)DG.job++;}});
    await new Promise(r=>setTimeout(r,20));if(job!==DG.job)return;
    try{
      const m=UI.model(),tax=OP.iva.budget(m),r=DG.analyze(m,tax,DG.state);
      if(A.saveError||!OP.store.persistent()){r.findings.push({key:'storage',rule:'storage',kind:A.saveError?'warning':'data',domain:'Armazenamento',itemId:'',num:'',code:'',title:A.saveError?'Falha de gravação local':'Armazenamento temporário',evidence:A.saveError?'A última gravação do projeto apresentou falha.':'O IndexedDB não está disponível nesta sessão.',recommendation:'Salve o projeto em JSON pelo menu Arquivo para manter uma cópia independente.',view:'budget',itemIds:[],amount:0,description:''});r.counts[A.saveError?'warning':'data']++;}
      r.signature=DG.signature();r.base=A.base;DG.report=r;DG.state.page=0;
      if(job!==DG.job)return;showDiag();if(A.view==='budget')UI.render();
    }catch(e){if(job===DG.job)UI.modal('Diagnóstico não concluído',`<p>O diagnóstico não alterou o orçamento.</p><div class="alertbox">${esc(e.message)}</div><p>Confira a base e os dados cadastrados antes de tentar novamente.</p><button class="btn" data-act="diagRun">Tentar novamente</button>`,{wide:true});}
  };
  UI.act.diag=()=>DG.current()?showDiag():DG.run();UI.act.diagRun=DG.run;
  UI.act.diagKind=el=>{DG.state.kind=DG.state.kind===el.dataset.kind?'':el.dataset.kind;DG.state.page=0;DG.refresh();};
  UI.inp.diagQ=el=>{DG.state.q=el.value;DG.state.page=0;DG.refresh();};
  UI.chg.diagDomain=el=>{DG.state.domain=el.value;DG.state.page=0;DG.refresh();};
  UI.act.diagPage=el=>{DG.state.page+=+el.dataset.d;DG.refresh();};
  UI.act.diagClear=()=>{Object.assign(DG.state,{q:'',kind:'',domain:'',page:0});showDiag();};
  UI.act.diagLimits=()=>{const d=UI.$('#dgDeviation'),c=UI.$('#dgConcentration');if(!d?.value||!c?.value||!d.checkValidity()||!c.checkValidity()){UI.toast('Informe limites numéricos válidos.','warn');return;}DG.state.deviation=+d.value;DG.state.concentration=+c.value;DG.run();};
  DG.navigate=(view,id)=>{
    UI.closeModal();D.close();const r=UI.model().byId.get(id);
    if(view==='iva'&&r){A.view='budget';UI.render();UI.act.ivaItem({dataset:{id}});return;}
    if(view==='basic'&&r?.comp&&ABC.canExpandItem(r).ok){A.view='budget';UI.render();D.open(r.node.code,'basic');A.drawer.fromBudgetId=r.id;D.render();return;}
    if(view==='basic')view='budget';if(view==='iva')view='reforma';
    A.view=view||'budget';if(A.view==='crews'&&r)A.sel.item=r.id;if(r?.parent)A.sel.stage=r.parent.id;UI.render();
    if(A.view==='budget'&&r){const tr=UI.$$('[data-budget-id]').find(el=>el.dataset.budgetId===r.id);if(tr){tr.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});tr.classList.add('dg-focus');const f=tr.querySelector('input:not(:disabled),button:not(:disabled)');f?.focus({preventScroll:true});setTimeout(()=>tr.classList.remove('dg-focus'),4200);}}
  };
  UI.act.diagGoto=el=>{if(!DG.current()){UI.toast('O orçamento mudou. Execute a verificação novamente.','warn');DG.run();return;}const f=DG.report.findings[+el.dataset.i];if(f)DG.navigate(f.view,f.itemId);};
  UI.act.diagOrigin=el=>DG.current()?DG.navigate('budget',el.dataset.id):DG.run();
  function diagExport(){if(!DG.current()){UI.toast('Resultado desatualizado: execute a verificação novamente.','warn');return null;}const r=DG.report;return {version:DG.version,created:r.created,meta:r.meta,settings:r.settings,counts:r.counts,findings:r.findings,scope:'Triagem técnica somente leitura. Sem certificação de regularidade, sem correção automática; valores expostos não são impactos cumulativos.'};}
  UI.act.diagCSV=()=>{const r=diagExport();if(!r)return;saveCSV('Diagnostico_'+slug(r.meta.project)+'.csv',[
    ['OrçaPlan — diagnóstico v1.4'],['Projeto',r.meta.project],['Base',r.meta.source,r.meta.base,'UF',r.meta.uf,'Regime',r.meta.regime,'Ano IVA',r.meta.year],['Executado em',r.created],['Limite desvio %',r.settings.deviation,'Limite concentração %',r.settings.concentration],['Grupo','Área','Critério','Item','Código','Descrição','Apontamento','Evidência','Como revisar','IDs de origem'],...r.findings.map(f=>[kinds[f.kind][0],f.domain,f.rule,f.num,f.code,f.description,f.title,f.evidence,f.recommendation,f.itemIds.join(' | ')]),['Escopo',r.scope]
  ]);};
  UI.act.diagJSON=()=>{const r=diagExport();if(r)OP.exp.download('Diagnostico_'+slug(r.meta.project)+'.json',JSON.stringify(r,null,2),'application/json');};
  const budgetRender0=UI.views.budget.render;
  UI.views.budget.render=()=>{
    const host=document.createElement('div');host.innerHTML=budgetRender0();const m=UI.model();
    host.querySelectorAll('table.bud tbody tr').forEach((tr,i)=>{if(m.flat[i])tr.dataset.budgetId=m.flat[i].id;});
    const btn=document.createElement('button');btn.type='button';btn.className='btn';btn.dataset.act='diag';btn.innerHTML=UI.icon('ok')+' Verificar orçamento';btn.title='Diagnóstico de custos, composições, dados e planejamento';
    const abc=host.querySelector('.abc-buttons');if(abc)abc.after(btn);else host.querySelector('.row')?.appendChild(btn);
    if(DG.report&&DG.report.meta.project===A.pj.name){const cur=DG.current(),c=DG.report.counts;const bar=document.createElement('div');bar.className='dg-banner';bar.innerHTML=`<b>Diagnóstico ${cur?'atual':'desatualizado'}</b><span>${cur?`${c.error} erros · ${c.warning} alertas · ${c.data} lacunas · ${c.review} oportunidades`:'O projeto mudou desde a última verificação.'}</span><button class="lnk" data-act="diag">${cur?'Abrir apontamentos':'Verificar novamente'} →</button>`;host.querySelector('.cards')?.after(bar);}
    return host.innerHTML;
  };

  const manual0=UI.views.manual.render;
  UI.views.manual.render=()=>manual0().replace(/<\/div>\s*$/,`<details open><summary>Novidades v1.4 — diagnóstico e analítico básico</summary><div class="mc"><h3>Conferir sem alterar</h3><p>Em <b>Orçamento → Verificar orçamento</b>, o diagnóstico examina os dados carregados. Erros, alertas, dados incompletos e oportunidades são grupos de apontamentos, não um julgamento de regularidade. Clique em uma categoria para filtrar, em <b>Localizar item</b> para voltar à linha ou em <b>Ver analítico / Ver memória</b> para inspecionar a origem. CSV e JSON incluem todos os apontamentos, independentemente dos filtros.</p><p>Os limites de desvio do custo informado e concentração são editáveis na própria janela. São apenas parâmetros de triagem; não equivalem a limites legais. Ao alterar o orçamento ou as premissas, o relatório fica desatualizado e deve ser recalculado. Nenhuma pendência impede o uso dos outros módulos.</p><h3>Do serviço ao insumo, sem abrir ramo por ramo</h3><p>A aba <b>Analítico - somente insumos básicos</b>, ao lado de Analítico, mostra a composição por <b>uma unidade de serviço</b>. Exemplo hipotético: um serviço consome 0,20 m³ de uma auxiliar, e essa auxiliar consome 300 kg de cimento por m³. O consumo acumulado é <b>0,20 × 300 = 60 kg</b> por unidade do serviço. Outro caminho com 5 kg do mesmo cimento elevaria o total a 65 kg, sem somar a auxiliar novamente.</p><p>Composições sem analítico e ramos com problema continuam identificados no nível disponível. Preço ausente não vira zero. Os coeficientes não são arredondados para compra de unidades inteiras. Use <b>Caminhos</b> para conferir as multiplicações; o arquivo de caminhos mantém todos os níveis.</p><h3>Por que a soma dos insumos pode diferir do custo unitário?</h3><p>A referência multiplica coeficientes acumulados por preços. O custo unitário da composição incorpora truncamentos em cada nível. A diferença fica explícita. O modo <b>Conciliado ao custo unitário</b> faz rateio proporcional em centavos sem alterar quantitativos ou preços de referência; não reconstitui custos históricos. Faltando preço ou havendo ramo inválido, esse rateio fica indisponível, mas o detalhe conhecido permanece acessível.</p><p>O painel foi ampliado. Em computadores, use <b>Ampliar</b> ou arraste sua borda esquerda; com foco na borda, as setas ajustam a largura e Home restaura o padrão. As abas agora podem ocupar mais de uma linha.</p></div></details></div>`);
})(typeof window!=='undefined'?window:globalThis);


