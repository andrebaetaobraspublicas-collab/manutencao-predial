/* ==== 21_bdi_core.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 21_bdi_core.js   (GERADO por build/extract_bdi.py)
 * Motor de cálculo do BDIPro: Paramétrico, Exato (matriz de creditamento)
 * e Simples Nacional, com a transição da Reforma Tributária (LC 214/2025).
 *
 * Os BLOCOS A e B abaixo são cópia LITERAL do código de cálculo do
 * BDIPro.html (mesmas tabelas e funções). O que desenhava a tela original
 * permanece inerte (não é chamado). Tudo roda num escopo isolado, com
 * "window" e "document" locais, sem interferir no OrçaPro.
 * A API OP.bdi (no fim) só organiza entradas/saídas para a nova interface;
 * calcExatoPuro() transcreve, linha a linha, a aritmética de recalc().
 * ===================================================================== */
(function (G) {
  const OP = G.OP;
  const BD = (OP.bdi = {});
  const window = { __SimplesBDIResult: null };
  const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  const localStorage = { getItem: () => null, setItem: () => {} };
  const alert = () => {}; const confirm = () => false;
  const A = (function () {
/* =================== BLOCO A — BDIPro.html (Simples Nacional + Paramétrico) =================== */

/* ===================== DADOS (idênticos ao original) ===================== */
/*
  Tabelas legais e paramétricas centralizadas.
  As faixas e percentuais ficam aqui para facilitar atualização normativa futura
  sem espalhar constantes pelo restante do sistema.
*/
const TabelasTributarias = {
  simples: {
    limite: 4800000,
    anexos: {
      III: {
        nome: 'Anexo III',
        observacao: 'CPP embutida no DAS; há partilha com ISS conforme a tabela do Anexo III da LC 123/2006.',
        faixas: [
          {faixa:1,de:0,ate:180000,aliquota:.06,deduzir:0,rep:{irpj:.04,csll:.035,pis:.0278,cofins:.1282,iss:.335,cpp:.434}},
          {faixa:2,de:180000.01,ate:360000,aliquota:.112,deduzir:9360,rep:{irpj:.04,csll:.035,pis:.0305,cofins:.1405,iss:.32,cpp:.434}},
          {faixa:3,de:360000.01,ate:720000,aliquota:.135,deduzir:17640,rep:{irpj:.04,csll:.035,pis:.0296,cofins:.1364,iss:.325,cpp:.434}},
          {faixa:4,de:720000.01,ate:1800000,aliquota:.16,deduzir:35640,rep:{irpj:.04,csll:.035,pis:.0296,cofins:.1364,iss:.325,cpp:.434}},
          {faixa:5,de:1800000.01,ate:3600000,aliquota:.21,deduzir:125640,rep:{irpj:.04,csll:.035,pis:.0278,cofins:.1282,iss:.335,cpp:.434}},
          {faixa:6,de:3600000.01,ate:4800000,aliquota:.33,deduzir:648000,rep:{irpj:.35,csll:.15,pis:.0347,cofins:.1603,iss:0,cpp:.305}}
        ]
      },
      IV: {
        nome: 'Anexo IV',
        observacao: 'CPP fora do DAS; pode haver CPRB quando a empresa estiver enquadrada em atividade desonerada.',
        faixas: [
          {faixa:1,de:0,ate:180000,aliquota:.045,deduzir:0,rep:{irpj:.188,csll:.152,pis:.0383,cofins:.1767,iss:.445,cpp:0}},
          {faixa:2,de:180000.01,ate:360000,aliquota:.09,deduzir:8100,rep:{irpj:.198,csll:.152,pis:.0445,cofins:.2055,iss:.40,cpp:0}},
          {faixa:3,de:360000.01,ate:720000,aliquota:.102,deduzir:12420,rep:{irpj:.208,csll:.152,pis:.0427,cofins:.1973,iss:.40,cpp:0}},
          {faixa:4,de:720000.01,ate:1800000,aliquota:.14,deduzir:39780,rep:{irpj:.178,csll:.192,pis:.041,cofins:.189,iss:.40,cpp:0}},
          {faixa:5,de:1800000.01,ate:3600000,aliquota:.22,deduzir:183780,rep:{irpj:.188,csll:.192,pis:.0392,cofins:.1808,iss:.40,cpp:0}},
          {faixa:6,de:3600000.01,ate:4800000,aliquota:.33,deduzir:828000,rep:{irpj:.535,csll:.215,pis:.0445,cofins:.2055,iss:0,cpp:0}}
        ]
      },
      V: {
        nome: 'Anexo V',
        observacao: 'CPP embutida no DAS; não há CPRB nem reoneração gradual da folha fora do DAS.',
        faixas: [
          {faixa:1,de:0,ate:180000,aliquota:.155,deduzir:0,rep:{irpj:.25,csll:.15,pis:.0305,cofins:.141,iss:.14,cpp:.2885}},
          {faixa:2,de:180000.01,ate:360000,aliquota:.18,deduzir:4500,rep:{irpj:.23,csll:.15,pis:.0305,cofins:.141,iss:.17,cpp:.2785}},
          {faixa:3,de:360000.01,ate:720000,aliquota:.195,deduzir:9900,rep:{irpj:.24,csll:.15,pis:.0323,cofins:.1492,iss:.19,cpp:.2385}},
          {faixa:4,de:720000.01,ate:1800000,aliquota:.205,deduzir:17100,rep:{irpj:.21,csll:.15,pis:.0341,cofins:.1574,iss:.21,cpp:.2385}},
          {faixa:5,de:1800000.01,ate:3600000,aliquota:.23,deduzir:62100,rep:{irpj:.23,csll:.125,pis:.0305,cofins:.141,iss:.235,cpp:.2385}},
          {faixa:6,de:3600000.01,ate:4800000,aliquota:.305,deduzir:540000,rep:{irpj:.35,csll:.155,pis:.0356,cofins:.1644,iss:0,cpp:.295}}
        ]
      }
    }
  },
  reforma: {
    2026:{pisCofins:true,cbs:0,ibs:0,issFator:1,cprb:.027,obs:'PIS, Cofins, ISS integral e CPRB de 2,7% quando aplicável.'},
    2027:{pisCofins:false,cbs:.087,ibs:.001,issFator:1,cprb:.018,obs:'CBS, IBS teste, ISS integral e CPRB de 1,8% quando aplicável.'},
    2028:{pisCofins:false,cbs:.087,ibs:.001,issFator:1,cprb:0,obs:'CBS, IBS teste, ISS integral e CPRB zerada.'},
    2029:{pisCofins:false,cbs:.088,ibs:.0177,issFator:.9,cprb:0,obs:'CBS, IBS e redução de 10% do ISS.'},
    2030:{pisCofins:false,cbs:.088,ibs:.0354,issFator:.8,cprb:0,obs:'CBS, IBS e redução de 20% do ISS.'},
    2031:{pisCofins:false,cbs:.088,ibs:.0531,issFator:.7,cprb:0,obs:'CBS, IBS e redução de 30% do ISS.'},
    2032:{pisCofins:false,cbs:.088,ibs:.0708,issFator:.6,cprb:0,obs:'CBS, IBS e redução de 40% do ISS.'},
    2033:{pisCofins:false,cbs:.088,ibs:.177,issFator:0,cprb:0,obs:'Regime sem ISS; CBS e IBS em regime definitivo.'},
    2034:{pisCofins:false,cbs:.088,ibs:.177,issFator:0,cprb:0,obs:'Regime definitivo.'}
  },
  bdi: {defaults: {ac:.0401, r:.0056, sg:.0040, df:.0111, lucro:.0730, matcd:.4023, fatorSetorial:.50, redutorGov:0, icms2027:.18}}
};
window.TabelasTributarias = TabelasTributarias;
let ultimoResultadoSimples = null;
const $sim = id => document.getElementById(id);
function parseSimNum(v){if(typeof v==='number')return Number.isFinite(v)?v:0;let s=String(v??'').trim().replace(/[^\d,.-]/g,'');if(!s)return 0;const c=s.lastIndexOf(','),d=s.lastIndexOf('.');if(c>-1&&d>-1)s=c>d?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(c>-1)s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0}
function parseSimPct(v){return parseSimNum(v)/100}
function simPct(v,d=2){return Number.isFinite(v)?(v*100).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%':'—'}
function simMoeda(v){return Number.isFinite(v)?v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'}
function simNum(v,d=2){return Number.isFinite(v)?v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—'}
function simEsc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function faixaSimples(anexo,rbt){const lista=TabelasTributarias.simples.anexos[anexo].faixas;return lista.find(f=>rbt>=f.de&&rbt<=f.ate)||lista[lista.length-1]}
function cronSimples(ano){return TabelasTributarias.reforma[Number(ano)]||TabelasTributarias.reforma[2034]}
function icmsResidualPorAno(ano,icms2027){
  const base=Math.max(0,Number(icms2027)||0),y=Number(ano)||0;
  if(y===2027||y===2028)return base;
  if(y===2029)return base*.90;
  if(y===2030)return base*.80;
  if(y===2031)return base*.70;
  if(y===2032)return base*.60;
  return 0;
}
function matcdAjustadoPorIcms(matcd,ano,icms2027){return Math.max(0,Number(matcd||0)*(1-icmsResidualPorAno(ano,icms2027)))}
function ibsParaIvaeqSimplesPorAno(ano,ibsCheio2033){
  const cheio=Math.max(0,Number(ibsCheio2033)||0),y=Number(ano)||0;
  if(y===2027||y===2028)return .001;
  if(y===2029)return cheio*.10;
  if(y===2030)return cheio*.20;
  if(y===2031)return cheio*.30;
  if(y===2032)return cheio*.40;
  if(y>=2033)return cheio;
  return 0;
}
function cbsParaIvaeqSimplesPorAno(ano,cbsCheia){
  const y=Number(ano)||0;
  return y>=2027?Math.max(0,Number(cbsCheia)||0):0;
}
function ivatParaIvaeqSimplesPorAno(ano,cbsCheia,ibsCheio2033){
  return cbsParaIvaeqSimplesPorAno(ano,cbsCheia)+ibsParaIvaeqSimplesPorAno(ano,ibsCheio2033);
}
window.icmsResidualPorAno = icmsResidualPorAno;
window.matcdAjustadoPorIcms = matcdAjustadoPorIcms;
window.ibsParaIvaeqSimplesPorAno = ibsParaIvaeqSimplesPorAno;
window.ivatParaIvaeqSimplesPorAno = ivatParaIvaeqSimplesPorAno;
function lerSimples(){return {modelo:$sim('simModelo')?.value||'das',anexo:$sim('simAnexo')?.value||'IV',tipoObra:$sim('simTipoObra')?.value||'edificios',quartilBdi:$sim('simQuartilBdi')?.value||'medio',rbt12:parseSimNum($sim('simRbt12')?.value),ano:Number($sim('simAno')?.value||2027),cprbOpt:($sim('simCprbOpt')?.value||'sim')==='sim',custoDireto:parseSimNum($sim('simCustoDireto')?.value),matcd:parseSimPct($sim('simMatcd')?.value),fatorSetorial:parseSimPct($sim('simFatorSetorial')?.value),redutorGov:parseSimPct($sim('simRedutorGov')?.value),icms2027:parseSimPct($sim('simIcms2027')?.value||'18'),cbsCheia:parseSimPct($sim('simCbsCheia')?.value||'8,8'),ibsCheio:parseSimPct($sim('simIbsCheio')?.value||'17,7'),ac:parseSimPct($sim('simAc')?.value),r:parseSimPct($sim('simRisco')?.value),sg:parseSimPct($sim('simSg')?.value),df:parseSimPct($sim('simDf')?.value),lucro:parseSimPct($sim('simLucro')?.value)}}
function aplicaTransicaoSimples(trib,ano){const y=Number(ano),pisCofins=(trib.pis||0)+(trib.cofins||0),issOriginal=trib.iss||0;trib.pis=trib.pis||0;trib.cofins=trib.cofins||0;trib.cbs=0;trib.ibs=0;if(y===2026){return trib}if(y<=2028){const total=.088;trib.cbs=pisCofins*(.087/total);trib.ibs=pisCofins*(.001/total);trib.pis=0;trib.cofins=0;return trib}trib.pis=0;trib.cofins=0;trib.cbs=pisCofins;if(y===2029){trib.iss=issOriginal*.90;trib.ibs=issOriginal*.10}else if(y===2030){trib.iss=issOriginal*.80;trib.ibs=issOriginal*.20}else if(y===2031){trib.iss=issOriginal*.70;trib.ibs=issOriginal*.30}else if(y===2032){trib.iss=issOriginal*.60;trib.ibs=issOriginal*.40}else{trib.iss=0;trib.ibs=issOriginal}return trib}
function decomporDasSimples(base,faixa,aliqEf){
  const rep=faixa.rep;
  const trib={
    irpj:aliqEf*(rep.irpj||0),
    csll:aliqEf*(rep.csll||0),
    pis:aliqEf*(rep.pis||0),
    cofins:aliqEf*(rep.cofins||0),
    iss:aliqEf*(rep.iss||0),
    cpp:aliqEf*(rep.cpp||0),
    cbs:0,
    ibs:0,
    cprb:0
  };
  let ajusteIss=null;
  if(faixa.faixa===5&&(rep.iss||0)>0){
    const tetoIss=.05;
    const issNormal=trib.iss||0;
    if(issNormal>tetoIss){
      const excesso=issNormal-tetoIss;
      const federais=['irpj','csll','pis','cofins'];
      const baseFederal=federais.reduce((acc,k)=>acc+(trib[k]||0),0);
      trib.iss=tetoIss;
      federais.forEach(k=>{trib[k]+=baseFederal>0?excesso*((trib[k]||0)/baseFederal):0});
      ajusteIss={teto:tetoIss,issNormal,excesso};
    }
  }
  return {tributos:trib,ajusteIss};
}
function calculaDecomposicaoSimples(base){
  const faixa=faixaSimples(base.anexo,base.rbt12);
  const aliqEf=base.rbt12>0?Math.max(0,(base.rbt12*faixa.aliquota-faixa.deduzir)/base.rbt12):0;
  const cron=cronSimples(base.ano);
  const das=decomporDasSimples(base,faixa,aliqEf);
  const trib=aplicaTransicaoSimples(das.tributos,base.ano);
  trib.cprb=(base.anexo==='IV'&&base.cprbOpt)?cron.cprb:0;
  const total=Object.values(trib).reduce((a,b)=>a+(Number(b)||0),0);
  return {faixa,aliqEf,cron,tributos:trib,total,ajusteIss:das.ajusteIss}
}
function tBdiSimples(tributos,ivaNominalEfetivo=0){
  return Math.max(0,(tributos.pis||0)+(tributos.cofins||0)+(tributos.iss||0)+(tributos.cpp||0)+(tributos.cprb||0)+ivaNominalEfetivo);
}
function calculaBdiSimples(base){
  const dec=calculaDecomposicaoSimples(base),K=(1+base.ac+base.r+base.sg)*(1+base.df)*(1+base.lucro),f=(1-base.fatorSetorial)*(1-base.redutorGov),ivaNominalEfetivo=(dec.tributos.cbs||0)+(dec.tributos.ibs||0),cbsCheia=Number.isFinite(base.cbsCheia)?base.cbsCheia:.088,ibsCheio=Number.isFinite(base.ibsCheio)?base.ibsCheio:.177,ibsIvaeq=ibsParaIvaeqSimplesPorAno(base.ano,ibsCheio),cbsIvaeq=cbsParaIvaeqSimplesPorAno(base.ano,cbsCheia),ivatCheio=ivatParaIvaeqSimplesPorAno(base.ano,cbsCheia,ibsCheio),modelo=base.modelo||'das';
  const icmsResidual=icmsResidualPorAno(base.ano,base.icms2027),matcdAjustado=matcdAjustadoPorIcms(base.matcd,base.ano,base.icms2027);
  let ivaeq=0,T=0,bdi=0;
  if(modelo==='hibrido'){
    ivaeq=base.ano===2026?0:Math.max(0,ivatCheio*((K*f-matcdAjustado)/K));
    T=Math.max(0,tBdiSimples(dec.tributos,0));
    bdi=K*(1+ivaeq)/(1-T)-1
  }else{
    ivaeq=0;
    T=tBdiSimples(dec.tributos,ivaNominalEfetivo);
    bdi=K/(1-T)-1
  }
  const precoVenda=base.custoDireto*(1+bdi);
  const resultado={...base,...dec,K,f,icmsResidual,matcdAjustado,ivaNominalEfetivo,cbsCheia,ibsCheio,cbsIvaeq,ibsIvaeq,ivatCheio,ivaeq,T,bdi,precoVenda,modelo};
  ultimoResultadoSimples=resultado;
  window.__SimplesBDIResult={ano:base.ano,ivaeq,bdi,totalTribEfetivo:T,origem:'Simples Nacional',detalhe:resultado};
  return resultado
}
function calculaRegimeComparado(nome,base){const cron=cronSimples(base.ano),pisCofins=cron.pisCofins?(nome==='Lucro Real'?.0925:.0365):0,iss=.05*cron.issFator,cprb=base.cprbOpt?cron.cprb:0,ivaNom=(cron.cbs||0)+(cron.ibs||0),K=(1+base.ac+base.r+base.sg)*(1+base.df)*(1+base.lucro),f=(1-base.fatorSetorial)*(1-base.redutorGov),matcdAjustado=matcdAjustadoPorIcms(base.matcd,base.ano,base.icms2027),ivaeq=base.ano===2026?0:Math.max(0,ivaNom*((K*f-matcdAjustado)/K)),T=pisCofins+iss+cprb,bdi=K*(1+ivaeq)/(1-T)-1;return {regime:nome,T,ivaeq,bdi,precoVenda:base.custoDireto*(1+bdi)}}
function tributosSimples(res){return [['IRPJ - incluído no lucro bruto',res.tributos.irpj],['CSLL - incluída no lucro bruto',res.tributos.csll],['PIS',res.tributos.pis],['Cofins',res.tributos.cofins],['CBS',res.tributos.cbs],['IBS',res.tributos.ibs],['ISS',res.tributos.iss],['CPRB',res.tributos.cprb],['CPP embutida no DAS',res.tributos.cpp]]}
function renderKpisSimples(res){$sim('simKpiBdi').textContent=simPct(res.bdi);$sim('simKpiFaixa').textContent='Faixa '+res.faixa.faixa;$sim('simKpiAliqEfetiva').textContent=simPct(res.aliqEf);$sim('simKpiIvaeq').textContent=simPct(res.ivaeq);$sim('simKpiPreco').textContent=simMoeda(res.precoVenda);$sim('simModeloDerivado').textContent=res.modelo==='hibrido'?'Híbrido — IBS/CBS por fora':'DAS unificado';$sim('simFaixaDerivada').textContent=`Faixa ${res.faixa.faixa} (${simMoeda(res.faixa.de)} a ${simMoeda(res.faixa.ate)})`;$sim('simAliqNomDerivada').textContent=simPct(res.faixa.aliquota);$sim('simDeduzirDerivada').textContent=simMoeda(res.faixa.deduzir);$sim('simTDerivado').textContent=simPct(res.T);$sim('simKDerivado').textContent=simNum(res.K,6);$sim('simFDerivado').textContent=simPct(res.f);$sim('simIvatDerivado').textContent=res.modelo==='hibrido'?`${simPct(res.cbsIvaeq)} CBS + ${simPct(res.ibsIvaeq)} IBS = ${simPct(res.ivatCheio)}`:'Não aplicável';if($sim('simIcmsDerivado'))$sim('simIcmsDerivado').textContent=res.modelo==='hibrido'?simPct(res.icmsResidual):'Não aplicável';if($sim('simMatcdAjustadoDerivado'))$sim('simMatcdAjustadoDerivado').textContent=res.modelo==='hibrido'?simPct(res.matcdAjustado):'Não aplicável';const alerta=$sim('simAlertaLimite');if(alerta){alerta.style.display=res.rbt12>TabelasTributarias.simples.limite?'block':'none';alerta.textContent='A Receita Bruta informada supera o limite da Faixa 6 do Simples Nacional. Avalie Lucro Presumido ou Lucro Real.'}}
function renderFaixasSimples(res){const rows=TabelasTributarias.simples.anexos[res.anexo].faixas.map(f=>`<tr${f.faixa===res.faixa.faixa?' style="background:#eef9f2;font-weight:800"':''}><td>Faixa ${f.faixa}</td><td>${simMoeda(f.de)}</td><td>${simMoeda(f.ate)}</td><td>${simPct(f.aliquota)}</td><td>${simMoeda(f.deduzir)}</td></tr>`).join('');$sim('simTabelaFaixas').innerHTML=`<table><thead><tr><th>Faixa</th><th>Limite inferior</th><th>Limite superior</th><th>Alíquota nominal</th><th>Parcela a deduzir</th></tr></thead><tbody>${rows}</tbody></table>`}
function renderAliquotaSimples(res){$sim('simMemAliquota').innerHTML=[['Receita Bruta dos últimos 12 meses',simMoeda(res.rbt12)],['Anexo selecionado',TabelasTributarias.simples.anexos[res.anexo].nome],['Faixa identificada','Faixa '+res.faixa.faixa],['Alíquota nominal',simPct(res.faixa.aliquota)],['Parcela a deduzir',simMoeda(res.faixa.deduzir)],['Fórmula','(RBT12 × Alíquota nominal − Parcela a deduzir) / RBT12'],['Cálculo',`(${simMoeda(res.rbt12)} × ${simPct(res.faixa.aliquota)} − ${simMoeda(res.faixa.deduzir)}) / ${simMoeda(res.rbt12)}`],['Alíquota efetiva',simPct(res.aliqEf)]].map(r=>`<p><b>${r[0]}:</b> ${r[1]}</p>`).join('')}
function notaAjusteIssSimples(res){return res.ajusteIss?`Na 5ª faixa dos anexos com ISS, o ISS efetivo foi limitado a ${simPct(res.ajusteIss.teto)}; o excedente de ${simPct(res.ajusteIss.excesso)} foi redistribuído entre IRPJ, CSLL, PIS e Cofins antes da transição anual.`:''}
function renderDecompSimples(res){const rows=tributosSimples(res).map(([n,v])=>`<tr><td>${n}</td><td>${simPct(v)}</td><td>${simMoeda(res.custoDireto*v)}</td></tr>`).join('');const tLabel=res.modelo==='hibrido'?'T usado no BDI (demais tributos do DAS, sem IRPJ/CSLL e sem CBS/IBS, + CPRB)':'T usado no BDI (DAS sem IRPJ/CSLL + CPRB quando aplicável)';const notaAnexo=res.anexo==='IV'?'No Anexo IV, a CPRB é apresentada separadamente quando aplicável.':'Nos Anexos III e V, a contribuição previdenciária patronal permanece embutida no DAS.';$sim('simTabelaDecomp').innerHTML=`<table><thead><tr><th>Tributo</th><th>Carga efetiva</th><th>Valor estimado</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total tributário efetivo</td><td>${simPct(res.total)}</td><td>${simMoeda(res.custoDireto*res.total)}</td></tr><tr><td>${tLabel}</td><td>${simPct(res.T)}</td><td>${simMoeda(res.custoDireto*res.T)}</td></tr></tfoot></table><div class="note">${simEsc(res.cron.obs)} ${notaAjusteIssSimples(res)} IRPJ e CSLL são exibidos para transparência, mas não integram o termo T do BDI; podem ser considerados pelo usuário na taxa de lucro bruto. ${notaAnexo} ${res.modelo==='hibrido'?'No modelo híbrido, CBS e IBS são tratados por fora e entram no IVA equivalente.':'No DAS unificado, não há IVA equivalente: o termo T usa apenas os tributos do DAS que entram no BDI.'}</div>`;const anos=[2026,2027,2028,2029,2030,2031,2032,2033,2034];$sim('simTabelaCronologica').innerHTML=`<table><thead><tr><th>Ano</th><th>Regra de transição aplicada ao DAS</th><th>CPRB Anexo IV</th><th>Observação</th></tr></thead><tbody>${anos.map(a=>{const c=cronSimples(a);const regra=a===2026?'PIS/Cofins e ISS integral':a<=2028?'PIS/Cofins convertidos em CBS/IBS; ISS integral':a===2029?'CBS; 10% do ISS migra ao IBS':a===2030?'CBS; 20% do ISS migra ao IBS':a===2031?'CBS; 30% do ISS migra ao IBS':a===2032?'CBS; 40% do ISS migra ao IBS':'CBS; ISS extinto e substituído pelo IBS';return `<tr><td>${a===2034?'2034+':a}</td><td>${regra}</td><td>${simPct(c.cprb||0)}</td><td>${simEsc(c.obs)}</td></tr>`}).join('')}</tbody></table>`;drawPieSimples($sim('simChartPizza'),tributosSimples(res).filter(x=>x[1]>0))}
function renderBdiSimples(res){const linhas=[['Administração Central (AC)',res.ac],['Seguros e Garantias (S+G)',res.sg],['Risco (R)',res.r],['Despesas Financeiras (DF)',res.df],['Lucro Bruto (L)',res.lucro],['IRPJ - incluído no lucro bruto',res.tributos.irpj],['CSLL - incluída no lucro bruto',res.tributos.csll],['PIS',res.tributos.pis],['Cofins',res.tributos.cofins],['CBS',res.tributos.cbs],['IBS',res.tributos.ibs],['ISS',res.tributos.iss],['CPRB',res.tributos.cprb],['CPP embutida no DAS',res.tributos.cpp],['IVA equivalente',res.ivaeq]];$sim('simTabelaBdi').innerHTML=`<table><thead><tr><th>Discriminação</th><th>Taxa (%)</th></tr></thead><tbody>${linhas.map(([n,v])=>`<tr><td>${n}</td><td>${simPct(v)}</td></tr>`).join('')}</tbody><tfoot><tr><td>BDI (%)</td><td>${simPct(res.bdi)}</td></tr></tfoot></table>`;const eq=res.modelo==='hibrido'?`K = (1+AC+R+S+G) × (1+DF) × (1+L) = ${simNum(res.K,6)}
f = (1-redutor setorial) × (1-redutor governamental) = ${simPct(res.f)}
ICMS residual = ${simPct(res.icmsResidual)}
%MATcd ajustado = %MATcd × (1 - ICMS residual) = ${simPct(res.matcdAjustado)}
IVAt anual = CBS informada + IBS do ano = ${simPct(res.cbsIvaeq)} + ${simPct(res.ibsIvaeq)} = ${simPct(res.ivatCheio)}
IVAeq = max(0; IVAt anual × (K × f - %MATcd ajustado) / K) = ${simPct(res.ivaeq)}
T = demais tributos do DAS, sem IRPJ/CSLL e sem CBS/IBS, + CPRB = ${simPct(res.T)}
BDI = K × (1 + IVAeq) / (1 - T) - 1 = ${simPct(res.bdi)}`:`K = (1+AC+R+S+G) × (1+DF) × (1+L) = ${simNum(res.K,6)}
T Simples = DAS sem IRPJ/CSLL + CPRB aplicável = ${simPct(res.T)}
IVAeq = 0,00% no modelo DAS unificado
BDI Simples = K / (1 - T Simples) - 1 = ${simPct(res.bdi)}`;$sim('simEquacaoBdi').textContent=eq;$sim('simMemCompleta').innerHTML=memoriaSimplesHtml(res)}
function memoriaSimplesHtml(res){const obra=tabelaBdi?.[res.tipoObra]?.nome||res.tipoObra,quartil=res.quartilBdi==='q1'?'Primeiro Quartil':res.quartilBdi==='q3'?'Terceiro Quartil':'Média',dados=[['Modelo',res.modelo==='hibrido'?'Híbrido — IBS/CBS por fora':'DAS unificado'],['Tipo de obra',obra],['Quartil do BDI',quartil],['Receita Bruta',simMoeda(res.rbt12)],['Faixa',`Faixa ${res.faixa.faixa}`],['Alíquota nominal',simPct(res.faixa.aliquota)],['Parcela a deduzir',simMoeda(res.faixa.deduzir)],['Alíquota efetiva',simPct(res.aliqEf)],['IRPJ - incluído no lucro bruto',simPct(res.tributos.irpj)],['CSLL - incluída no lucro bruto',simPct(res.tributos.csll)],['PIS',simPct(res.tributos.pis)],['Cofins',simPct(res.tributos.cofins)],['CBS',simPct(res.tributos.cbs)],['IBS',simPct(res.tributos.ibs)],['ISS',simPct(res.tributos.iss)],['CPRB efetiva',simPct(res.tributos.cprb)],['T usado no BDI, sem IRPJ/CSLL',simPct(res.T)],['Total tributário efetivo',simPct(res.total)],['CBS informada para IVAeq',res.modelo==='hibrido'?simPct(res.cbsCheia):'Não aplicável'],['IBS cheio 2033 informado',res.modelo==='hibrido'?simPct(res.ibsCheio):'Não aplicável'],['IBS do ano usado no IVAeq',res.modelo==='hibrido'?simPct(res.ibsIvaeq):'Não aplicável'],['IVAt anual usado no IVAeq',res.modelo==='hibrido'?simPct(res.ivatCheio):'Não aplicável'],['ICMS residual aplicado ao ano',res.modelo==='hibrido'?simPct(res.icmsResidual):'Não aplicável'],['%MATcd bruto',simPct(res.matcd)],['%MATcd ajustado = %MATcd × (1 − ICMS residual)',res.modelo==='hibrido'?simPct(res.matcdAjustado):'Não aplicável'],['IVAeq',simPct(res.ivaeq)],['BDI',simPct(res.bdi)],['Preço de venda / valor final',simMoeda(res.precoVenda)]];return `<table><tbody>${dados.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`}
function renderComparacaoSimples(res){const lp=calculaRegimeComparado('Lucro Presumido',res),lr=calculaRegimeComparado('Lucro Real',res),sn={regime:'Simples Nacional',T:res.T,ivaeq:res.ivaeq,bdi:res.bdi,precoVenda:res.precoVenda},regimes=[lr,lp,sn];$sim('simTabelaComparacao').innerHTML=`<table><thead><tr><th>Regime</th><th>Tributação</th><th>IVAeq</th><th>BDI</th><th>Preço de venda</th><th>Diferença vs. Simples</th></tr></thead><tbody>${regimes.map(r=>`<tr><td>${r.regime}</td><td>${simPct(r.T)}</td><td>${simPct(r.ivaeq)}</td><td>${simPct(r.bdi)}</td><td>${simMoeda(r.precoVenda)}</td><td>${simMoeda(r.precoVenda-sn.precoVenda)}</td></tr>`).join('')}</tbody></table>`;drawBarsSimples($sim('simChartBarras'),regimes.map(r=>[r.regime,r.bdi]));const atual=ultimoResultadoSimples;const pts=[2026,2027,2028,2029,2030,2031,2032,2033,2034].map(ano=>[String(ano),calculaBdiSimples({...res,ano}).bdi]);ultimoResultadoSimples=atual||res;drawLineSimples($sim('simChartLinha'),pts);const rbtC=parseSimNum($sim('simCenarioRbt12')?.value)||res.rbt12,anexoC=$sim('simCenarioAnexo')?.value||res.anexo;let cenario;if(anexoC==='LP')cenario={...lp,anexo:'Lucro Presumido',rbt12:rbtC,faixa:{faixa:'—'},aliqEf:NaN};else if(anexoC==='LR')cenario={...lr,anexo:'Lucro Real',rbt12:rbtC,faixa:{faixa:'—'},aliqEf:NaN};else cenario=calculaBdiSimples({...res,rbt12:rbtC,anexo:anexoC});ultimoResultadoSimples=res;$sim('simTabelaCenarios').innerHTML=`<table><thead><tr><th>Cenário</th><th>Regime/Anexo</th><th>RBT12</th><th>Faixa</th><th>Alíquota efetiva</th><th>BDI</th><th>Preço</th><th>Impacto</th></tr></thead><tbody><tr><td>Atual</td><td>Simples Anexo ${res.anexo}</td><td>${simMoeda(res.rbt12)}</td><td>${res.faixa.faixa}</td><td>${simPct(res.aliqEf)}</td><td>${simPct(res.bdi)}</td><td>${simMoeda(res.precoVenda)}</td><td>—</td></tr><tr><td>Simulado</td><td>${cenario.anexo&&String(cenario.anexo).startsWith('Lucro')?cenario.anexo:'Simples Anexo '+cenario.anexo}</td><td>${simMoeda(cenario.rbt12)}</td><td>${cenario.faixa.faixa}</td><td>${simPct(cenario.aliqEf)}</td><td>${simPct(cenario.bdi)}</td><td>${simMoeda(cenario.precoVenda)}</td><td>${simMoeda(cenario.precoVenda-res.precoVenda)}</td></tr><tr><td>Saída do Simples</td><td>Lucro Presumido</td><td>—</td><td>—</td><td>—</td><td>${simPct(lp.bdi)}</td><td>${simMoeda(lp.precoVenda)}</td><td>${simMoeda(lp.precoVenda-res.precoVenda)}</td></tr></tbody></table>`}
function recalcularSimples(){const res=calculaBdiSimples(lerSimples());renderKpisSimples(res);renderFaixasSimples(res);renderAliquotaSimples(res);renderDecompSimples(res);renderBdiSimples(res);renderComparacaoSimples(res);ultimoResultadoSimples=res;window.__SimplesBDIResult={ano:res.ano,ivaeq:res.ivaeq,bdi:res.bdi,totalTribEfetivo:res.T,origem:'Simples Nacional',detalhe:res}}
function simWritePct(id,val){const el=$sim(id);if(el&&Number.isFinite(val))el.value=(val*100).toLocaleString('pt-BR',{maximumFractionDigits:4})}
function popularObrasSimples(){const el=$sim('simTipoObra');if(!el||el.options.length||typeof tabelaBdi==='undefined')return;el.innerHTML=Object.entries(tabelaBdi).map(([k,v])=>`<option value="${k}">${v.nome}</option>`).join('');el.value='rodovias'}
function aplicarParametrosBdiSimples(){if(typeof tabelaBdi==='undefined')return;const tipo=$sim('simTipoObra')?.value||'rodovias',quartil=$sim('simQuartilBdi')?.value||'medio',ref=tabelaBdi[tipo]?.[quartil];if(!ref)return;simWritePct('simAc',ref.ac);simWritePct('simRisco',ref.r);simWritePct('simSg',ref.sg);simWritePct('simDf',ref.df);simWritePct('simLucro',ref.lucro)}
function initSimples(){const anos=[2026,2027,2028,2029,2030,2031,2032,2033,2034];['simAno'].forEach(id=>{const el=$sim(id);if(el&&!el.options.length)el.innerHTML=anos.map(a=>`<option value="${a}">${a===2034?'2034+':a}</option>`).join('')});popularObrasSimples();aplicarParametrosBdiSimples();if($sim('simCenarioRbt12')&&!$sim('simCenarioRbt12').value)$sim('simCenarioRbt12').value=$sim('simRbt12').value;recalcularSimples()}
function drawPieSimples(canvas,rows){if(!canvas)return;const ctx=canvas.getContext('2d'),cw=canvas.clientWidth||500,ch=270;canvas.width=cw*devicePixelRatio;canvas.height=ch*devicePixelRatio;ctx.scale(devicePixelRatio,devicePixelRatio);ctx.clearRect(0,0,cw,ch);const total=rows.reduce((a,r)=>a+r[1],0)||1,colors=['#1f6f9f','#0f9f7a','#f59e0b','#dc2626','#7c3aed','#64748b','#0891b2','#16a34a'];let a0=-Math.PI/2;rows.forEach((r,i)=>{const a1=a0+2*Math.PI*r[1]/total;ctx.beginPath();ctx.moveTo(135,135);ctx.arc(135,135,100,a0,a1);ctx.closePath();ctx.fillStyle=colors[i%colors.length];ctx.fill();a0=a1});ctx.font='12px Segoe UI';rows.forEach((r,i)=>{ctx.fillStyle=colors[i%colors.length];ctx.fillRect(285,35+i*22,12,12);ctx.fillStyle='#0f1b2d';ctx.fillText(`${r[0]} ${simPct(r[1])}`,304,46+i*22)})}
function drawBarsSimples(canvas,rows){if(!canvas)return;const ctx=canvas.getContext('2d'),cw=canvas.clientWidth||500,ch=270;canvas.width=cw*devicePixelRatio;canvas.height=ch*devicePixelRatio;ctx.scale(devicePixelRatio,devicePixelRatio);ctx.clearRect(0,0,cw,ch);const max=Math.max(...rows.map(r=>r[1]),.01),barW=(cw-70)/rows.length;rows.forEach((r,i)=>{const x=45+i*barW+12,bh=(r[1]/max)*180,y=220-bh;ctx.fillStyle=['#1f6f9f','#0f9f7a','#f59e0b'][i%3];ctx.fillRect(x,y,barW-24,bh);ctx.fillStyle='#0f1b2d';ctx.font='bold 12px Segoe UI';ctx.fillText(simPct(r[1]),x,y-8);ctx.font='11px Segoe UI';ctx.fillText(r[0],x,240)})}
function drawLineSimples(canvas,pts){if(!canvas)return;const ctx=canvas.getContext('2d'),cw=canvas.clientWidth||500,ch=270;canvas.width=cw*devicePixelRatio;canvas.height=ch*devicePixelRatio;ctx.scale(devicePixelRatio,devicePixelRatio);ctx.clearRect(0,0,cw,ch);const vals=pts.map(p=>p[1]),min=Math.min(...vals)*.95,max=Math.max(...vals)*1.05,ml=46,mr=18,mt=20,mb=42;ctx.strokeStyle='#e2e8f0';ctx.lineWidth=1;for(let i=0;i<=4;i++){let y=mt+i*(ch-mt-mb)/4;ctx.beginPath();ctx.moveTo(ml,y);ctx.lineTo(cw-mr,y);ctx.stroke()}const x=i=>ml+i*(cw-ml-mr)/(pts.length-1),y=v=>mt+(max-v)*(ch-mt-mb)/(max-min||1);ctx.strokeStyle='#1f6f9f';ctx.lineWidth=3;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(x(i),y(p[1])):ctx.moveTo(x(i),y(p[1])));ctx.stroke();ctx.fillStyle='#0f1b2d';ctx.font='11px Segoe UI';pts.forEach((p,i)=>{ctx.fillText(p[0],x(i)-12,ch-18);ctx.fillText(simPct(p[1]),x(i)-18,y(p[1])-8)})}
function relatorioSimplesHtml(){const res=ultimoResultadoSimples||calculaBdiSimples(lerSimples());return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>BDI Simples Nacional</title><style>body{font-family:Arial,sans-serif;color:#0f1b2d;margin:32px}h1{color:#15527a}h2{border-bottom:2px solid #1f6f9f;color:#15527a;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:12px;margin:10px 0 18px}td,th{border:1px solid #dbe7f1;padding:7px;text-align:right}td:first-child,th:first-child{text-align:left}th{background:#e6f2fb}</style></head><body><h1>Relatório Técnico - BDI Simples Nacional</h1><p>Memória de cálculo, decomposição tributária e parecer comparativo gerados pelo BDIPro.</p><h2>Dados da empresa</h2><p><b>Razão Social:</b> ${simEsc($sim('simRazao')?.value)}<br><b>CNPJ:</b> ${simEsc($sim('simCnpj')?.value)}<br><b>CNAE principal:</b> ${simEsc($sim('simCnaePrincipal')?.value)}<br><b>Município/UF:</b> ${simEsc($sim('simMunicipio')?.value)}/${simEsc($sim('simEstado')?.value)}</p><h2>Memória da alíquota efetiva</h2>${$sim('simMemAliquota')?.innerHTML||''}<h2>Decomposição dos tributos</h2>${$sim('simTabelaDecomp')?.innerHTML||''}<h2>Cálculo do BDI</h2>${$sim('simTabelaBdi')?.innerHTML||''}<h2>Comparação de regimes</h2>${$sim('simTabelaComparacao')?.innerHTML||''}<h2>Parecer tributário</h2><p>O resultado considera a faixa do Simples Nacional identificada pela RBT12, a decomposição interna do DAS, a cronologia da Reforma Tributária e a metodologia de BDI parametrizada no BDIPro. A adoção do resultado depende da comprovação documental e da aderência do enquadramento tributário da empresa.</p></body></html>`}
function baixarSimples(nome,tipo,texto){const blob=new Blob([texto],{type:tipo});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nome;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),600)}
function exportarCsvSimples(){const res=ultimoResultadoSimples||calculaBdiSimples(lerSimples()),rows=[['Seção','Campo','Valor'],['Empresa','Razão Social',$sim('simRazao')?.value||''],['Empresa','CNPJ',$sim('simCnpj')?.value||''],['Alíquota','RBT12',simMoeda(res.rbt12)],['Alíquota','Faixa','Faixa '+res.faixa.faixa],['Alíquota','Alíquota efetiva',simPct(res.aliqEf)],['BDI','CBS informada para IVAeq',res.modelo==='hibrido'?simPct(res.cbsCheia):'Não aplicável'],['BDI','IBS cheio 2033 informado',res.modelo==='hibrido'?simPct(res.ibsCheio):'Não aplicável'],['BDI','IBS do ano usado no IVAeq',res.modelo==='hibrido'?simPct(res.ibsIvaeq):'Não aplicável'],['BDI','IVAt anual usado no IVAeq',res.modelo==='hibrido'?simPct(res.ivatCheio):'Não aplicável'],['BDI','ICMS residual do ano',res.modelo==='hibrido'?simPct(res.icmsResidual):'Não aplicável'],['BDI','%MATcd bruto',simPct(res.matcd)],['BDI','%MATcd ajustado',res.modelo==='hibrido'?simPct(res.matcdAjustado):'Não aplicável'],['BDI','IVAeq',simPct(res.ivaeq)],['BDI','BDI',simPct(res.bdi)],['BDI','Preço',simMoeda(res.precoVenda)]];tributosSimples(res).forEach(([n,v])=>rows.push(['Tributo',n,simPct(v)]));baixarSimples('bdipro_simples_nacional.csv','text/csv;charset=utf-8','\ufeff'+rows.map(r=>r.join(';')).join('\n'))}
function exportarWordSimples(){baixarSimples('relatorio_bdipro_simples.doc','application/msword;charset=utf-8',relatorioSimplesHtml())}
function exportarPdfSimples(){const w=window.open('','_blank');if(w){w.document.write(relatorioSimplesHtml()+`<script>setTimeout(()=>print(),300)<\/script>`);w.document.close()}}
function aplicarSimplesNoPrincipal(){const res=ultimoResultadoSimples||calculaBdiSimples(lerSimples());window.__SimplesBDIResult={ano:res.ano,ivaeq:res.ivaeq,bdi:res.bdi,totalTribEfetivo:res.T,origem:'Simples Nacional',detalhe:res};alert('IVA equivalente do Simples Nacional aplicado ao cálculo paramétrico do BDIPro.');showScreen('param')}
window.initSimples=initSimples;

const transicao=[
{ano:2026,iva:.0100,cbs:.0090,ibs:.0010,pis:.0365,iss:.0500,icms:.1800,ipi:''},
{ano:2027,iva:.0880,cbs:.0870,ibs:.0010,pis:0,iss:.0500,icms:.1800,ipi:''},
{ano:2028,iva:.0880,cbs:.0870,ibs:.0010,pis:0,iss:.0500,icms:.1800,ipi:''},
{ano:2029,iva:.1057,cbs:.0880,ibs:.0177,pis:0,iss:.0450,icms:.1620,ipi:''},
{ano:2030,iva:.1234,cbs:.0880,ibs:.0354,pis:0,iss:.0400,icms:.1440,ipi:''},
{ano:2031,iva:.1411,cbs:.0880,ibs:.0531,pis:0,iss:.0350,icms:.1260,ipi:''},
{ano:2032,iva:.1588,cbs:.0880,ibs:.0708,pis:0,iss:.0300,icms:.1080,ipi:''},
{ano:2033,iva:.2650,cbs:.0880,ibs:.1770,pis:0,iss:0,icms:0,ipi:''},
{ano:2034,iva:.2650,cbs:.0880,ibs:.1770,pis:0,iss:0,icms:0,ipi:''},
{ano:2035,iva:.2650,cbs:.0880,ibs:.1770,pis:0,iss:0,icms:0,ipi:''},
{ano:2036,iva:.2650,cbs:.0880,ibs:.1770,pis:0,iss:0,icms:0,ipi:''},
{ano:2037,iva:.2650,cbs:.0880,ibs:.1770,pis:0,iss:0,icms:0,ipi:''},
{ano:2038,iva:.2650,cbs:.0880,ibs:.1770,pis:0,iss:0,icms:0,ipi:''},
{ano:2039,iva:.2650,cbs:.0880,ibs:.1770,pis:0,iss:0,icms:0,ipi:''},
{ano:2040,iva:.2650,cbs:.0880,ibs:.1770,pis:0,iss:0,icms:0,ipi:''}
];
const referenciasCredito=[{"tipo":"Rodoviária","situacao":"terraplenagem, transporte e compactação","credEqMin":0.6,"credEqMax":0.65,"credEqSug":0.625,"tipoTcu":"Construção de rodovias e ferrovias","matcd":0.35,"mocd":0.25,"eqcd":0.4,"matcdTipico":0.625,"obs":"Obra linear com uso relevante de equipamentos.","tipoObraKey":"rodovias"},{"tipo":"Ferroviária","situacao":"terraplenagem, lastro, dormentes, trilhos e equipamentos especiais","credEqMin":0.58,"credEqMax":0.63,"credEqSug":0.605,"tipoTcu":"Construção de rodovias e ferrovias","matcd":0.45,"mocd":0.2,"eqcd":0.35,"matcdTipico":0.6817500000000001,"obs":"Materiais permanentes relevantes.","tipoObraKey":"rodovias"},{"tipo":"Portuária","situacao":"dragagem, enrocamento, guindastes, equipamentos navais e apoio pesado","credEqMin":0.55,"credEqMax":0.62,"credEqSug":0.585,"tipoTcu":"Obras portuárias, marítimas e fluviais","matcd":0.3,"mocd":0.25,"eqcd":0.45,"matcdTipico":0.5882499999999999,"obs":"Equipamentos pesados e apoio naval.","tipoObraKey":"portuarias"},{"tipo":"Aeroportuária","situacao":"terraplenagem, pavimentação rígida/flexível e sinalização","credEqMin":0.58,"credEqMax":0.64,"credEqSug":0.61,"tipoTcu":"Construção de rodovias e ferrovias","matcd":0.35,"mocd":0.25,"eqcd":0.4,"matcdTipico":0.619,"obs":"Pavimentação e terraplenagem.","tipoObraKey":"rodovias"},{"tipo":"Saneamento – redes","situacao":"escavação, reaterro, transporte, compactação, assentamento de tubos","credEqMin":0.55,"credEqMax":0.62,"credEqSug":0.585,"tipoTcu":"Redes de abastecimento de água, coleta de esgoto e construções correlatas","matcd":0.45,"mocd":0.25,"eqcd":0.3,"matcdTipico":0.6505000000000001,"obs":"Tubos e acessórios pesam na parcela material.","tipoObraKey":"saneamento"},{"tipo":"Saneamento – ETE/ETA","situacao":"obra civil + equipamentos eletromecânicos fixos","credEqMin":0.48,"credEqMax":0.55,"credEqSug":0.515,"tipoTcu":"Redes de abastecimento de água, coleta de esgoto e construções correlatas","matcd":0.5,"mocd":0.25,"eqcd":0.25,"matcdTipico":0.65375,"obs":"Equipamentos fixos e obra civil.","tipoObraKey":"saneamento"},{"tipo":"Drenagem urbana/canais","situacao":"escavação, concreto, contenções, transporte e bombeamento","credEqMin":0.55,"credEqMax":0.62,"credEqSug":0.585,"tipoTcu":"Redes de abastecimento de água, coleta de esgoto e construções correlatas","matcd":0.35,"mocd":0.3,"eqcd":0.35,"matcdTipico":0.58475,"obs":"Escavação e concreto.","tipoObraKey":"saneamento"},{"tipo":"Barragens/diques","situacao":"terraplenagem pesada, enrocamento, compactação, transporte","credEqMin":0.6,"credEqMax":0.66,"credEqSug":0.63,"tipoTcu":"Obras portuárias, marítimas e fluviais","matcd":0.3,"mocd":0.2,"eqcd":0.5,"matcdTipico":0.635,"obs":"Enrocamento e equipamentos pesados.","tipoObraKey":"portuarias"},{"tipo":"Energia elétrica – transmissão","situacao":"torres, fundações, lançamento de cabos, guindastes e caminhões","credEqMin":0.5,"credEqMax":0.58,"credEqSug":0.54,"tipoTcu":"Manutenção de estações e redes de distribuição de energia elétrica","matcd":0.55,"mocd":0.2,"eqcd":0.25,"matcdTipico":0.7050000000000001,"obs":"Torres, cabos e fundações.","tipoObraKey":"energia"},{"tipo":"Energia elétrica – subestação","situacao":"obra civil + montagem eletromecânica + equipamentos fixos","credEqMin":0.45,"credEqMax":0.52,"credEqSug":0.485,"tipoTcu":"Manutenção de estações e redes de distribuição de energia elétrica","matcd":0.6,"mocd":0.2,"eqcd":0.2,"matcdTipico":0.717,"obs":"Equipamentos fixos predominantes.","tipoObraKey":"energia"},{"tipo":"Energia elétrica – iluminação pública","situacao":"caminhão cesto, munck, perfuração, instalação de postes/luminárias","credEqMin":0.45,"credEqMax":0.55,"credEqSug":0.5,"tipoTcu":"Manutenção de estações e redes de distribuição de energia elétrica","matcd":0.55,"mocd":0.25,"eqcd":0.2,"matcdTipico":0.675,"obs":"Postes, luminárias e equipamentos de apoio.","tipoObraKey":"energia"},{"tipo":"Energia solar fotovoltaica","situacao":"montagem, fundações leves, transporte interno, pouca operação","credEqMin":0.4,"credEqMax":0.5,"credEqSug":0.45,"tipoTcu":"Manutenção de estações e redes de distribuição de energia elétrica","matcd":0.7,"mocd":0.15,"eqcd":0.15,"matcdTipico":0.7825,"obs":"Módulos, inversores e materiais predominam.","tipoObraKey":"energia"},{"tipo":"Parques eólicos","situacao":"guindastes pesados, transporte especial, fundações e montagem","credEqMin":0.5,"credEqMax":0.58,"credEqSug":0.54,"tipoTcu":"Manutenção de estações e redes de distribuição de energia elétrica","matcd":0.65,"mocd":0.15,"eqcd":0.2,"matcdTipico":0.773,"obs":"Componentes eólicos com montagem especializada.","tipoObraKey":"energia"},{"tipo":"Gasodutos/adutoras","situacao":"escavação linear, soldagem, lançamento de tubos, reaterro","credEqMin":0.55,"credEqMax":0.63,"credEqSug":0.59,"tipoTcu":"Redes de abastecimento de água, coleta de esgoto e construções correlatas","matcd":0.45,"mocd":0.25,"eqcd":0.3,"matcdTipico":0.652,"obs":"Obra linear de tubulações.","tipoObraKey":"saneamento"},{"tipo":"Obras de contenção","situacao":"perfuração, concreto projetado, tirantes, escavação localizada","credEqMin":0.48,"credEqMax":0.58,"credEqSug":0.53,"tipoTcu":"Construção de rodovias e ferrovias","matcd":0.45,"mocd":0.3,"eqcd":0.25,"matcdTipico":0.6125,"obs":"Geotecnia, concreto e perfuração.","tipoObraKey":"rodovias"},{"tipo":"Túneis","situacao":"escavação mecanizada, perfuração, ventilação, bombeamento, concreto","credEqMin":0.55,"credEqMax":0.65,"credEqSug":0.6,"tipoTcu":"Construção de rodovias e ferrovias","matcd":0.3,"mocd":0.25,"eqcd":0.45,"matcdTipico":0.595,"obs":"Equipamentos e sistemas temporários relevantes.","tipoObraKey":"rodovias"},{"tipo":"Pontes/viadutos","situacao":"concreto, formas, escoramentos, guindastes e transporte","credEqMin":0.45,"credEqMax":0.55,"credEqSug":0.5,"tipoTcu":"Construção de rodovias e ferrovias","matcd":0.45,"mocd":0.3,"eqcd":0.25,"matcdTipico":0.605,"obs":"Estrutura de concreto e equipamentos de apoio.","tipoObraKey":"rodovias"},{"tipo":"Edificação – energia própria","situacao":"energia própria","credEqMin":0.45,"credEqMax":0.5,"credEqSug":0.475,"tipoTcu":"Construção de edifícios","matcd":0.4,"mocd":0.4,"eqcd":0.2,"matcdTipico":0.535,"obs":"Edificação típica: 40% materiais, 40% mão de obra, 20% equipamentos.","tipoObraKey":"edificios"},{"tipo":"Edificação – energia do contratante","situacao":"energia do contratante","credEqMin":0.4,"credEqMax":0.45,"credEqSug":0.425,"tipoTcu":"Construção de edifícios","matcd":0.4,"mocd":0.4,"eqcd":0.2,"matcdTipico":0.525,"obs":"Edificação típica: 40% materiais, 40% mão de obra, 20% equipamentos.","tipoObraKey":"edificios"},{"tipo":"Reforma – energia própria","situacao":"energia própria","credEqMin":0.5,"credEqMax":0.55,"credEqSug":0.525,"tipoTcu":"Construção de edifícios","matcd":0.35,"mocd":0.5,"eqcd":0.15,"matcdTipico":0.47874999999999995,"obs":"Reformas tendem a ter maior participação de mão de obra.","tipoObraKey":"edificios"},{"tipo":"Reforma – energia do contratante","situacao":"energia do contratante","credEqMin":0.35,"credEqMax":0.4,"credEqSug":0.375,"tipoTcu":"Construção de edifícios","matcd":0.35,"mocd":0.55,"eqcd":0.1,"matcdTipico":0.4425,"obs":"Reforma com menor parcela de equipamentos creditáveis.","tipoObraKey":"edificios"}];
const tabelaBdi={
 edificios:{nome:'Construção de Edificações',q1:{ac:.0300,sg:.0080,r:.0097,df:.0059,lucro:.0616},medio:{ac:.0400,sg:.0080,r:.0127,df:.0123,lucro:.0740},q3:{ac:.0550,sg:.0100,r:.0127,df:.0139,lucro:.0896}},
 rodovias:{nome:'Construção de Rodovias e Ferrovias',q1:{ac:.0380,sg:.0032,r:.0050,df:.0102,lucro:.0664},medio:{ac:.0401,sg:.0040,r:.0056,df:.0111,lucro:.0730},q3:{ac:.0467,sg:.0074,r:.0097,df:.0121,lucro:.0869}},
 saneamento:{nome:'Obras de Saneamento',q1:{ac:.0343,sg:.0028,r:.0100,df:.0094,lucro:.0674},medio:{ac:.0493,sg:.0049,r:.0139,df:.0099,lucro:.0804},q3:{ac:.0671,sg:.0075,r:.0174,df:.0117,lucro:.0940}},
 energia:{nome:'Obras de Energia',q1:{ac:.0529,sg:.0025,r:.0100,df:.0101,lucro:.0800},medio:{ac:.0592,sg:.0051,r:.0148,df:.0107,lucro:.0831},q3:{ac:.0793,sg:.0056,r:.0197,df:.0111,lucro:.0951}},
 portuarias:{nome:'Obras Portuárias',q1:{ac:.0400,sg:.0081,r:.0146,df:.0094,lucro:.0714},medio:{ac:.0552,sg:.0122,r:.0232,df:.0102,lucro:.0840},q3:{ac:.0785,sg:.0199,r:.0316,df:.0133,lucro:.1043}},
 bdi_materiais:{nome:'BDI reduzido para fornecimento de materiais',q1:{ac:.0150,sg:.0030,r:.0056,df:.0085,lucro:.0350},medio:{ac:.0345,sg:.0048,r:.0085,df:.0085,lucro:.0511},q3:{ac:.0449,sg:.0082,r:.0089,df:.0111,lucro:.0622}}
};
const defaults={ano:2027,anoOrigem:2026,ivatManual:.088,usarIvatManual:0,f:.5,redutor:0,icms2027:.18,tipoObra:'edificios',quartilBdi:'medio',ac:.04,r:.0127,sg:.008,df:.0123,lucro:.074,alpha:.4,issManual:.05,usarIssManual:0,cprb:.018,valorContrato:1000000,bdiOriginalManual:.25,usarBdiOriginal:0,matcd:.4,mocd:.4,eqcd:.2,credeq:.4,credBdi:0,tipoRefCredito:'Rodoviária'};
window.__BDIProData={transicao,tabelaBdi};

/* ===================== HELPERS DE INTERFACE ===================== */
const ids=Object.keys(defaults);
const percentIds=new Set(['ivatManual','f','redutor','icms2027','ac','r','sg','df','lucro','alpha','issManual','cprb','bdiOriginalManual','matcd','mocd','eqcd','credeq','credBdi']);
const selectIds=new Set(['tipoObra','quartilBdi','tipoRefCredito']);
const intIds=new Set(['ano','anoOrigem']);
const boolIds=new Set(['usarIvatManual','usarIssManual','usarBdiOriginal']);
// limite superior (em %) de cada slider acoplado
const sliderMax={ac:20,r:20,sg:20,df:20,lucro:25,alpha:100,f:100,redutor:100,icms2027:30,cprb:10,issManual:10,ivatManual:30,bdiOriginalManual:50,matcd:100,mocd:100,eqcd:100,credeq:100,credBdi:100};

const pct=x=>Number.isFinite(x)?(x*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'-';
const num=x=>Number.isFinite(x)?x.toLocaleString('pt-BR',{minimumFractionDigits:6,maximumFractionDigits:6}):'-';
const moeda=x=>Number.isFinite(x)?x.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'-';
const pctEdit=x=>(x*100).toLocaleString('pt-BR',{maximumFractionDigits:4});

// lê um campo da interface e devolve o valor no MODELO (decimais)
function readField(id){
  const el=document.getElementById(id);if(!el)return defaults[id];
  if(boolIds.has(id))return el.checked?1:0;
  if(selectIds.has(id))return el.value;
  if(intIds.has(id))return parseInt(el.value,10);
  const raw=parseFloat(String(el.value).replace(/\./g,'').replace(',','.'));
  const n=Number.isFinite(raw)?raw:0;
  return percentIds.has(id)?n/100:n;
}
// escreve no campo a partir do valor do MODELO (decimais)
function writeField(id,val){
  const el=document.getElementById(id);if(el==null||val===undefined)return;
  if(boolIds.has(id)){el.checked=!!Number(val);return;}
  if(selectIds.has(id)||intIds.has(id)){el.value=val;return;}
  el.value=percentIds.has(id)?pctEdit(val):val;
}
function v(id){const x=readField(id);return Number.isFinite(x)?x:0;}

/* ===================== MOTOR DE CÁLCULO (idêntico ao original) ===================== */
function aplicaParametrosBdi(){const tipo=readField('tipoObra')||defaults.tipoObra,quartil=readField('quartilBdi')||defaults.quartilBdi,ref=tabelaBdi[tipo]?.[quartil];if(!ref)return;['ac','r','sg','df','lucro'].forEach(k=>writeField(k,ref[k]))}
function refCreditoSelecionada(){const tipo=readField('tipoRefCredito');return referenciasCredito.find(x=>x.tipo===tipo)||referenciasCredito[0]}
function renderRefsCredito(){
  const sel=document.getElementById('tipoRefCredito');
  if(sel)sel.innerHTML=referenciasCredito.map(x=>`<option value="${x.tipo}">${x.tipo}</option>`).join('');
  const tb=document.getElementById('tbodyRefsCredito');
  if(tb)tb.innerHTML=referenciasCredito.map(x=>`<tr><td>${x.tipo}</td><td>${x.situacao}</td><td>${x.tipoTcu}</td><td>${pct(x.matcd)}</td><td>${pct(x.mocd)}</td><td>${pct(x.eqcd)}</td><td>${pct(x.credEqMin)}</td><td>${pct(x.credEqMax)}</td><td><b>${pct(x.credEqSug)}</b></td><td>${pct(x.matcdTipico)}</td><td style="text-align:left">${x.obs}</td></tr>`).join('');
}
function aplicaRefCredito(syncTipoBdi=true){
  const ref=refCreditoSelecionada();if(!ref)return;
  ['matcd','mocd','eqcd'].forEach(k=>writeField(k,ref[k]));
  writeField('credeq',ref.credEqSug);
  atualizaInfoRefCredito();
  if(syncTipoBdi&&ref.tipoObraKey){const t=document.getElementById('tipoObra');if(t){t.value=ref.tipoObraKey;aplicaParametrosBdi();}}
}
function atualizaInfoRefCredito(){
  const ref=refCreditoSelecionada();const info=document.getElementById('infoRefCredito');
  if(ref&&info)info.innerHTML=`<div class="t">${ref.tipo}</div><div><b>Situação:</b> ${ref.situacao}</div><div><b>Tipo TCU:</b> ${ref.tipoTcu}</div><div style="margin-top:6px"><span class="badge">MAT/CD ${pct(ref.matcd)}</span><span class="badge">MO/CD ${pct(ref.mocd)}</span><span class="badge">EQ/CD ${pct(ref.eqcd)}</span><span class="badge">Créd. eq. ${pct(ref.credEqSug)}</span><span class="badge">%MATcd típ. ${pct(ref.matcdTipico)}</span></div><div style="margin-top:6px"><b>Obs.:</b> ${ref.obs}</div>`;
}
function atualizaNotaBdiReduzidoParam(tipoObra){
  const nota=document.getElementById('notaBdiReduzidoParam');
  if(nota)nota.style.display=tipoObra==='bdi_materiais'?'block':'none';
}
function atualizaAlertaComposicaoCredito(o){
  const alerta=document.getElementById('alertaComposicaoCredito');
  if(!alerta)return;
  const soma=Number(o.matcd||0)+Number(o.mocd||0)+Number(o.eqcd||0);
  if(Math.abs(soma-1)>0.0001){
    alerta.style.display='block';
    alerta.textContent=`Atenção: MAT/CD + MO/CD + EQ/CD soma ${pct(soma)}. O sistema permite continuar, mas recomenda revisar a composição para que a soma seja 100,00%.`;
  }else{
    alerta.style.display='none';
    alerta.textContent='';
  }
}
function setVals(o){ids.forEach(id=>{if(o[id]!==undefined)writeField(id,o[id])});sincronizaManuais()}
function vals(){let o={};ids.forEach(id=>o[id]=readField(id));return o}
function anual(ano){return transicao.find(x=>x.ano===ano)||transicao[transicao.length-1]}
function cprbEfetivaPorAno(ano,cprb){return Number(ano)>=2028?0:Number(cprb||0)}
function atualizaRegraCprbParam(){
  const ano=Number(document.getElementById('ano')?.value||defaults.ano);
  const el=document.getElementById('cprb');
  if(!el)return;
  const bloqueia=ano>=2028;
  if(bloqueia)writeField('cprb',0);
  el.disabled=bloqueia;
  el.title=bloqueia?'A CPRB é considerada zero a partir de 2028.':'CPRB editável para anos anteriores a 2028.';
}
function computeFor(matcd,o){
  const a=anual(o.ano), anoAtual=Number(o.ano)||0, anoOrigem=Number(o.anoOrigem)||0;
  const teste2026=anoAtual===2026;
  const cprbEfetiva=cprbEfetivaPorAno(anoAtual,o.cprb);
  const ivatNominal=o.usarIvatManual?o.ivatManual:a.iva;
  const ivat=teste2026?0:ivatNominal;
  const issPleno=transicao[0].iss||0.05,issFator=issPleno?((Number(a.iss)||0)/issPleno):0;
  const iss=o.usarIssManual?o.issManual*issFator:Number(a.iss)||0,issBdi=iss*(1-o.alpha),pisCofins=Number(a.pis)||0;
  const T=issBdi+cprbEfetiva+pisCofins,K=(1+o.ac+o.r+o.sg)*(1+o.df)*(1+o.lucro),fatorEfetivo=(1-o.f)*(1-o.redutor),ivatEfetivo=ivat*fatorEfetivo;
  const icmsResidual=icmsResidualPorAno(anoAtual,o.icms2027);
  const matcdAjustado=matcdAjustadoPorIcms(matcd,anoAtual,o.icms2027);
  const mat=matcdAjustado;
  const creditoBdi=o.credBdi||0;
  const ivaeqBase=teste2026?0:Math.max(0,ivat*((K*fatorEfetivo-matcdAjustado)/K));
  const simplesAplicado=window.__SimplesBDIResult&&Number(window.__SimplesBDIResult.ano)===anoAtual?Number(window.__SimplesBDIResult.ivaeq):NaN;
  const ivaeq=Number.isFinite(simplesAplicado)?simplesAplicado:ivaeqBase,delta=0,bdi=K*(1+ivaeq)/(1-T)-1,comp=0,bdiFinal=bdi,bdiClassico=K/(1-T)-1;
  let bdiOriginal,origemBdiOriginal;
  if(o.usarBdiOriginal){bdiOriginal=o.bdiOriginalManual;origemBdiOriginal='Manual'}
  else if(anoOrigem && anoOrigem<anoAtual){let ref=computeFor(matcd,{...o,ano:anoOrigem,usarBdiOriginal:1,bdiOriginalManual:0});bdiOriginal=ref.erro?bdi:ref.bdi;origemBdiOriginal='Ano '+anoOrigem}
  else {bdiOriginal=bdi;origemBdiOriginal='Sem ano anterior válido'}
  const fatorReeq=((1+bdi)/(1+bdiOriginal))-1,valorBase=o.valorContrato||0,valorAjustado=valorBase*(1+fatorReeq),diferencaReeq=valorAjustado-valorBase;
  return {matcd,mat,matcdAjustado,icmsResidual,creditoBdi,ivaeq,delta,bdi,comp,bdiFinal,bdiClassico,bdiOriginal,origemBdiOriginal,fatorReeq,valorBase,valorAjustado,diferencaReeq,K,T,issBdi,pisCofins,cprbEfetiva,ivat,ivatNominal,iss,issFator,fatorEfetivo,ivatEfetivo,teste2026}
}
function pctBdi(v){return Number.isFinite(v)?(v*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—'}
function bdiEquationHtml(ano){
  return Number(ano)>=2033
    ? 'BDI = [K × (1 + IVAeq)] − 1'
    : 'BDI = [K × (1 + IVAeq) / (1 − I)] − 1';
}
function splitPisCofins(total){
  if(Math.abs(Number(total||0)-0.0365)<0.00001)return [['PIS',0.0065],['COFINS',0.03]];
  return Number(total||0)>0 ? [['PIS/COFINS',Number(total||0)]] : [];
}
function bdiBreakdownRows(data){
  const rows=[
    ['AC - ADMINISTRAÇÃO CENTRAL',data.ac,'rub','tax'],
    ['SG - SEGUROS e GARANTIA',data.sg,'rub','tax'],
    ['R - RISCOS',data.r,'rub','tax'],
    ['DF - DESPESAS FINANCEIRAS',data.df,'rub','tax'],
    ['L - LUCRO BRUTO',data.lucro,'rub','tax']
  ];
  const impostoTotal=Number(data.T||0)+Number(data.ivaeq||0);
  rows.push(['I - IMPOSTOS',impostoTotal,'rub','tax green']);
  splitPisCofins(data.pisCofins).forEach(([label,value])=>rows.push([label,value,'sub','tax green']));
  if(Number(data.issBdi||0)>0)rows.push(['ISS',data.issBdi,'sub','tax green']);
  if(Number(data.cprbEfetiva||0)>0)rows.push(['CPRB',data.cprbEfetiva,'sub','tax green']);
  if(Number(data.ano)===2026){
    rows.push(['IBS (0,1%, menos compensações e deduções)',0,'sub','tax green']);
    rows.push(['CBS (0,9%, menos compensações e deduções)',0,'sub','tax green']);
  }else if(Number(data.ivaeq||0)>0 || Number(data.ano)>=2027){
    rows.push(['IVA',data.ivaeq,'sub','tax green']);
  }
  rows.push(['BDI (%)',data.bdi,'total-name','total-tax']);
  return rows;
}
function renderBdiBreakdown(targetId,data){
  const target=document.getElementById(targetId);
  if(!target)return;
  const anoLabel=Number(data.ano)>=2033?'a partir de 2033':String(data.ano||'—');
  const body=bdiBreakdownRows(data).map(([label,value,c1,c2])=>`<tr><td class="${c1}">${label}</td><td class="${c2}">${pctBdi(value)}</td></tr>`).join('');
  target.innerHTML=`<div class="bdi-breakdown"><table><thead><tr><th>Discriminação<br><span>(Ano: ${anoLabel})</span></th><th>Taxa (%)</th></tr></thead><tbody>${body}</tbody></table></div><div class="bdi-equation">${bdiEquationHtml(data.ano)}</div>`;
}
// computa o resultado principal + os pontos da curva para um conjunto de valores
function computeFromVals(o){const matcdTotal=o.matcd+.1*o.mocd+o.credeq*o.eqcd+(o.credBdi||0);const res=computeFor(matcdTotal,o);const pts=[];if(!res.erro){for(let i=5;i<=80;i++){const p=computeFor(i/100,o);if(!p.erro)pts.push(p)}}return {res,pts,matcdTotal}}

/* ----- gráfico (uma ou mais séries) ----- */
function drawSeries(canvasId,series,yKey='bdi'){
  const c=document.getElementById(canvasId);if(!c)return;const ctx=c.getContext('2d'),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  const m={l:65,r:22,t:30,b:45};
  const all=series.flatMap(s=>s.points);
  if(!all.length){ctx.fillStyle='#94a3b8';ctx.font='14px Segoe UI,Arial';ctx.fillText('Sem dados para exibir.',m.l,h/2);return}
  const xs=all.map(p=>p.matcd),ys=all.map(p=>p[yKey]);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const x=xv=>m.l+(xv-xmin)/((xmax-xmin)||1)*(w-m.l-m.r);
  const y=yv=>h-m.b-(yv-ymin)/((ymax-ymin)||1)*(h-m.t-m.b);
  ctx.strokeStyle='#e2e8f0';ctx.lineWidth=1;ctx.font='12px Segoe UI,Arial';ctx.fillStyle='#64748b';
  for(let i=0;i<=5;i++){const yy=m.t+i*(h-m.t-m.b)/5;ctx.beginPath();ctx.moveTo(m.l,yy);ctx.lineTo(w-m.r,yy);ctx.stroke();const val=ymax-(ymax-ymin)*i/5;ctx.fillText(pct(val),8,yy+4)}
  for(let i=0;i<=5;i++){const xx=m.l+i*(w-m.l-m.r)/5;ctx.beginPath();ctx.moveTo(xx,h-m.b);ctx.lineTo(xx,h-m.b+5);ctx.stroke();const val=xmin+(xmax-xmin)*i/5;ctx.fillText(pct(val),xx-18,h-17)}
  series.forEach(s=>{ctx.strokeStyle=s.color;ctx.lineWidth=3;ctx.beginPath();s.points.forEach((p,i)=>{const X=x(p.matcd),Y=y(p[yKey]);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y)});ctx.stroke()});
  let lx=m.l;series.forEach(s=>{ctx.fillStyle=s.color;ctx.fillRect(lx,9,16,4);ctx.fillStyle='#0f1b2d';ctx.font='bold 12px Segoe UI,Arial';ctx.fillText(s.label,lx+20,14);lx+=20+ctx.measureText(s.label).width+24});
}

function drawAnnualSeries(canvasId,points,yKey,color,label){
  const c=document.getElementById(canvasId);if(!c)return;
  const ctx=c.getContext('2d'),w=c.width,h=c.height,m={l:65,r:24,t:34,b:45};
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  if(!points.length){ctx.fillStyle='#94a3b8';ctx.font='14px Segoe UI,Arial';ctx.fillText('Sem dados para exibir.',m.l,h/2);return}
  const values=points.map(p=>p[yKey]),rawMin=Math.min(...values),rawMax=Math.max(...values),padding=Math.max((rawMax-rawMin)*.12,.005);
  const ymin=Math.max(0,rawMin-padding),ymax=rawMax+padding;
  const x=i=>m.l+i*(w-m.l-m.r)/Math.max(1,points.length-1);
  const y=value=>h-m.b-(value-ymin)/Math.max(.000001,ymax-ymin)*(h-m.t-m.b);
  ctx.strokeStyle='#e2e8f0';ctx.lineWidth=1;ctx.font='12px Segoe UI,Arial';ctx.fillStyle='#64748b';
  for(let i=0;i<=5;i++){const yy=m.t+i*(h-m.t-m.b)/5,val=ymax-(ymax-ymin)*i/5;ctx.beginPath();ctx.moveTo(m.l,yy);ctx.lineTo(w-m.r,yy);ctx.stroke();ctx.fillText(pct(val),8,yy+4)}
  points.forEach((p,i)=>{const xx=x(i);ctx.fillText(String(p.ano),xx-14,h-17)});
  ctx.strokeStyle=color;ctx.lineWidth=3;ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(i),y(p[yKey])):ctx.moveTo(x(i),y(p[yKey])));ctx.stroke();
  points.forEach((p,i)=>{ctx.beginPath();ctx.arc(x(i),y(p[yKey]),4,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()});
  ctx.fillStyle=color;ctx.fillRect(m.l,12,16,4);ctx.fillStyle='#0f1b2d';ctx.font='bold 12px Segoe UI,Arial';ctx.fillText(label,m.l+22,17);
}

function renderCurvaTributaria(o,matcdTotal){
  const points=[];
  for(let ano=2026;ano<=2033;ano++){
    const resultado=computeFor(matcdTotal,{...o,ano,usarBdiOriginal:1,bdiOriginalManual:0});
    if(!resultado.erro)points.push({ano,ivaeq:resultado.ivaeq,bdi:resultado.bdi});
  }
  const tbody=document.getElementById('tbodyCurvaTributaria');
  if(tbody)tbody.innerHTML=points.map(p=>`<tr><td>${p.ano}</td><td>${pct(p.ivaeq)}</td><td><b>${pct(p.bdi)}</b></td></tr>`).join('');
  drawAnnualSeries('graficoCurvaIvaeq',points,'ivaeq','#0f9f7a','IVAeq');
  drawAnnualSeries('graficoCurvaBdi',points,'bdi','#1f6f9f','BDI');
}

function update(){
  const err=document.getElementById('erro');err.style.display='none';
  atualizaRegraCprbParam();
  const o=vals();const {res,pts,matcdTotal}=computeFromVals(o);
  atualizaNotaBdiReduzidoParam(o.tipoObra);
  atualizaAlertaComposicaoCredito(o);
  document.getElementById('liveMatcd').textContent=pct(matcdTotal);
  if(res.erro){err.textContent=res.erro;err.style.display='block';['heroBdi','heroIva','heroReeq'].forEach(i=>document.getElementById(i).textContent='—');syncSliders();return;}
  document.getElementById('heroBdi').textContent=pct(res.bdi);
  document.getElementById('heroIva').textContent=pct(res.ivaeq);
  document.getElementById('heroReeq').textContent=pct(res.fatorReeq);
  const obs2026=document.getElementById('obsIvaTeste2026');if(obs2026)obs2026.style.display=res.teste2026?'block':'none';
  const mem=[['Ano',o.ano],['Tipo de obra',tabelaBdi[o.tipoObra]?.nome||o.tipoObra],['Quartil do BDI',document.getElementById('quartilBdi').selectedOptions[0]?.textContent||o.quartilBdi],['Referência creditável',o.tipoRefCredito],['IVAt nominal',pct(res.ivatNominal)],['IVAt efetivo para cálculo',pct(res.ivat)],['Fator efetivo (f) = (1−redutor setorial)×(1−redutor governamental)',pct(res.fatorEfetivo)],['IVAt × f',pct(res.ivatEfetivo)],['ISS municipal aplicado',pct(res.iss)],['Redução de ISS pela transição (ano)',pct(1-res.issFator)],['ISS_BDI = ISS×(1−α)',pct(res.issBdi)],['PIS/COFINS (tabela anual)',pct(res.pisCofins)],['CPRB efetiva',pct(res.cprbEfetiva)],['T = ISS_BDI + CPRB + PIS/COFINS',pct(res.T)],['K',num(res.K)],['MAT/CD',pct(o.matcd)],['MO/CD',pct(o.mocd)],['EQ/CD',pct(o.eqcd)],['% Crédito no BDI',pct(res.creditoBdi)],['Alíquota média de ICMS em 2027',pct(o.icms2027)],['ICMS residual aplicado ao ano',pct(res.icmsResidual)],['%MATcd bruto',pct(res.matcd)],['%MATcd ajustado = %MATcd × (1 − ICMS residual)',pct(res.matcdAjustado)],['IVAeq = max(0; IVAt × (K × f − %MATcd ajustado) / K)',pct(res.ivaeq)],['BDI clássico sem IVAeq',pct(res.bdiClassico)],['BDI pós-reforma',pct(res.bdi)]];
  document.getElementById('memoria').innerHTML=mem.map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td></tr>`).join('');
  renderBdiBreakdown('bdiBreakdownParam',{ano:o.ano,ac:o.ac,r:o.r,sg:o.sg,df:o.df,lucro:o.lucro,T:res.T,issBdi:res.issBdi,pisCofins:res.pisCofins,cprbEfetiva:res.cprbEfetiva,ivaeq:res.ivaeq,bdi:res.bdi});
  const memReeq=[['Valor contratual/remanescente',moeda(res.valorBase)],['BDI de origem',pct(res.bdiOriginal)],['Origem do BDI',res.origemBdiOriginal],['BDI pós-reforma',pct(res.bdi)],['Fator de reequilíbrio',pct(res.fatorReeq)],['Valor reequilibrado estimado',moeda(res.valorAjustado)],['Diferença estimada',moeda(res.diferencaReeq)],['Interpretação',res.fatorReeq>0?'Acréscimo estimado para recomposição.':(res.fatorReeq<0?'Redução estimada em favor da Administração.':'Neutralidade econômica.')]];
  document.getElementById('memoriaReeq').innerHTML=memReeq.map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td></tr>`).join('');
  document.getElementById('tbodyParam').innerHTML=pts.map(p=>`<tr><td>${pct(p.matcd)}</td><td>${pct(p.matcdAjustado)}</td><td>${pct(p.ivaeq)}</td><td><b>${pct(p.bdi)}</b></td></tr>`).join('');
  if(pts.length){
    drawSeries('grafico',[{points:pts,color:'#1f6f9f',label:'Cenário atual'}]);
    drawSeries('graficoIvaeq',[{points:pts,color:'#0f9f7a',label:'IVAeq'}],'ivaeq');
  }
  renderTransicao();
  renderCurvaTributaria(o,matcdTotal);
  syncSliders();
}
window.updateParametricoBDI=update;
function renderTransicao(){
  const anoSel=document.getElementById('ano'), origemSel=document.getElementById('anoOrigem');
  const anoAtual=anoSel?.value;
  if(anoSel){anoSel.innerHTML=transicao.map(x=>`<option value="${x.ano}">${x.ano}</option>`).join('');if(anoAtual)anoSel.value=anoAtual;}
  if(origemSel)atualizaAnoOrigem();
  const icmsBase=Number.isFinite(readField('icms2027'))?readField('icms2027'):defaults.icms2027;
  document.getElementById('tbodyTransicao').innerHTML=transicao.map(x=>`<tr><td>${x.ano}</td><td>${pct(icmsResidualPorAno(x.ano,icmsBase))}</td><td>${typeof x.iva==='number'?pct(x.iva):x.iva}</td><td>${typeof x.cbs==='number'?pct(x.cbs):x.cbs}</td><td>${typeof x.ibs==='number'?pct(x.ibs):x.ibs}</td><td>${typeof x.pis==='number'?pct(x.pis):x.pis}</td><td>${typeof x.iss==='number'?pct(x.iss):x.iss}</td></tr>`).join('')
}
function atualizaAnoOrigem(){
  const sel=document.getElementById('anoOrigem');if(!sel)return;
  const anoAtual=Number(document.getElementById('ano')?.value||defaults.ano), anterior=Number(sel.value||defaults.anoOrigem);
  const anos=transicao.map(x=>x.ano).filter(a=>a<anoAtual);
  sel.innerHTML=anos.length?anos.map(a=>`<option value="${a}">${a}</option>`).join(''):'<option value="">Sem ano anterior</option>';
  sel.disabled=!anos.length;
  sel.value=anos.includes(anterior)?anterior:(anos.length?anos[anos.length-1]:'');
}

/* ===================== SLIDERS ACOPLADOS ===================== */
function buildSliders(){
  Object.keys(sliderMax).forEach(id=>{
    const inp=document.getElementById(id);if(!inp)return;
    const wrap=inp.closest('.inp');if(!wrap)return;
    const r=document.createElement('input');
    r.type='range';r.className='slider-range';r.min=0;r.max=sliderMax[id];r.step=0.1;r.dataset.for=id;
    wrap.parentNode.insertBefore(r,wrap.nextSibling);
    r.addEventListener('input',()=>{writeField(id,parseFloat(r.value)/100);update();});
  });
}
function syncSliders(){
  document.querySelectorAll('.slider-range').forEach(r=>{
    if(document.activeElement===r)return; // não atrapalha o arraste em curso
    const id=r.dataset.for;const pv=Math.min(parseFloat(r.max),Math.max(0,v(id)*100));
    r.value=pv;
  });
}

/* ===================== COMPARAÇÃO DE CENÁRIOS ===================== */
let cenarioA=null,cenarioB=null;
const cmpRows=[
  ['BDI',r=>r.res.bdi,pct],
  ['IVA equivalente',r=>r.res.ivaeq,pct],
  ['T (tributos)',r=>r.res.T,pct],
  ['%MATcd bruto',r=>r.matcdTotal,pct],
  ['%MATcd ajustado',r=>r.res.matcdAjustado,pct],
  ['Fator de reequilíbrio',r=>r.res.fatorReeq,pct],
  ['Valor Reequilibrado',r=>r.valorComparado,moeda],
  ['Diferença estimada',r=>r.diferencaComparada,moeda]
];
function rotuloCenario(o,res){return `${o.ano} · ${tabelaBdi[o.tipoObra]?.nome||o.tipoObra} · BDI ${pct(res.bdi)}`}
function capturar(slot){
  const o=vals();const snap=computeFromVals(o);snap.o=o;
  if(snap.res.erro){toast('Cenário inválido — ajuste os parâmetros antes de capturar.');return;}
  if(slot==='A'){cenarioA=snap;document.getElementById('lblA').textContent='A: '+rotuloCenario(o,snap.res);}
  else{cenarioB=snap;document.getElementById('lblB').textContent='B: '+rotuloCenario(o,snap.res);}
  renderCompare();toast('Cenário '+slot+' capturado.');
}
function renderCompare(){
  const tb=document.getElementById('cmpBody');
  if(!cenarioA&&!cenarioB){tb.innerHTML='<tr><td colspan="4" style="text-align:center;color:#64748b">Capture os cenários A e B para comparar.</td></tr>';drawSeries('graficoComp',[]);return;}
  const base=cenarioA?(cenarioA.res.valorBase||0):(cenarioB?.res.valorBase||0);
  if(cenarioA){cenarioA.valorComparado=base;cenarioA.diferencaComparada=0;}
  if(cenarioB){const bdiA=cenarioA?cenarioA.res.bdi:0;cenarioB.valorComparado=base*(1+cenarioB.res.bdi)/(1+bdiA);cenarioB.diferencaComparada=cenarioB.valorComparado-base;}
  tb.innerHTML=cmpRows.map(([label,get,fmt])=>{
    const a=cenarioA?fmt(get(cenarioA)):'?';
    const b=cenarioB?fmt(get(cenarioB)):'?';
    let d='?';
    if(cenarioA&&cenarioB){const dv=get(cenarioB)-get(cenarioA);d=(dv>0?'+':'')+fmt(dv);}
    return `<tr><td style="text-align:left">${label}</td><td>${a}</td><td>${b}</td><td><b>${d}</b></td></tr>`;
  }).join('');
  const series=[];
  if(cenarioA)series.push({points:cenarioA.pts,color:'#1f6f9f',label:'A'});
  if(cenarioB)series.push({points:cenarioB.pts,color:'#dc2626',label:'B'});
  drawSeries('graficoComp',series);
}

/* ===================== EXPORTAR PDF ===================== */
function printRelatorio(){
  const o=vals();const {res}=computeFromVals(o);
  if(res.erro){toast('Corrija os parâmetros antes de gerar o PDF.');return;}
  const w=window.open('','_blank');
  if(!w){toast('Permita pop-ups para gerar o PDF.');return;}
  const kpis=[['BDI',pct(res.bdi)],['IVA equivalente',pct(res.ivaeq)],['Fator de reequilíbrio',pct(res.fatorReeq)]];
  const css=`*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#0f1b2d;margin:34px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:24px 0 4px;color:#15527a;border-bottom:2px solid #1f6f9f;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:6px}td{border-bottom:1px solid #e2e8f0;padding:6px 9px}td:first-child{color:#475569}td:last-child{text-align:right;font-weight:600}.kpis{display:flex;gap:10px;margin:14px 0;flex-wrap:wrap}.kpi{border:1px solid #cfe6f5;background:#f0f7fd;border-radius:8px;padding:10px 16px;min-width:140px}.kpi .l{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}.kpi .v{font-size:18px;font-weight:800;color:#0a7a37}.muted{color:#64748b;font-size:11px}@media print{.noprint{display:none}}`;
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório BDI Pós-Reforma</title><style>${css}</style></head><body>
  <h1>Relatório de BDI — Pós-Reforma Tributária</h1>
  <p class="muted">Gerado em ${new Date().toLocaleString('pt-BR')} · Ano-base ${o.ano} · ${tabelaBdi[o.tipoObra]?.nome||o.tipoObra} · Referência: ${o.tipoRefCredito}</p>
  <div class="kpis">${kpis.map(k=>`<div class="kpi"><div class="l">${k[0]}</div><div class="v">${k[1]}</div></div>`).join('')}</div>
  <h2>Memória de cálculo</h2><table><tbody>${document.getElementById('memoria').innerHTML}</tbody></table>
  <h2>Reequilíbrio econômico-financeiro</h2><table><tbody>${document.getElementById('memoriaReeq').innerHTML}</tbody></table>
  <p class="muted" style="margin-top:22px">Documento gerado pela Calculadora de BDI Pós-Reforma Tributária. Os valores são estimativos e preservam a estrutura lógica da planilha de referência.</p>
  <p class="noprint" style="margin-top:18px"><button onclick="window.print()" style="padding:10px 16px;border:0;border-radius:8px;background:#1f6f9f;color:#fff;font-weight:700;cursor:pointer">Imprimir / Salvar em PDF</button></p>
  </body></html>`;
  w.document.write(html);w.document.close();w.focus();
  setTimeout(()=>{try{w.print()}catch(e){}},350);
}

/* =================== fim do BLOCO A =================== */
    return { TabelasTributarias, transicao, referenciasCredito, tabelaBdi, defaults, anual, cprbEfetivaPorAno, computeFor, computeFromVals,
      bdiEquationHtml, splitPisCofins, bdiBreakdownRows, icmsResidualPorAno, matcdAjustadoPorIcms, faixaSimples, cronSimples,
      ibsParaIvaeqSimplesPorAno, cbsParaIvaeqSimplesPorAno, ivatParaIvaeqSimplesPorAno, aplicaTransicaoSimples, decomporDasSimples,
      calculaDecomposicaoSimples, tBdiSimples, calculaBdiSimples, calculaRegimeComparado, tributosSimples, notaAjusteIssSimples,
      cmpRows, parseSimNum, parseSimPct, simPct, simMoeda, simNum, pct, num, moeda, pctEdit };
  })();
  const B = (function () {
/* =================== BLOCO B — BDIPro.html (Cálculo Exato) =================== */
/* ====== Dados semente (exemplo da planilha) ====== */
const EXEMPLO = [
  {desc:"Caminhão Basculante: Mercedes Benz: 2423 K: 10 m³ - 15 t",un:"H",qt:177486.08,custo:23758464.36,tipo:"Equipamento",ger:0.5784},
  {desc:"Cimento Asfáltico de Petróleo",un:"Ton.",qt:4320,custo:5616000,tipo:"Material",ger:1},
  {desc:"Servente",un:"H",qt:219575.72,custo:2458977.67,tipo:"Mão de Obra",ger:0.1},
  {desc:"Brita 3",un:"m³",qt:12247.08,custo:1751332.42,tipo:"Material",ger:1},
  {desc:"Brita 2",un:"m³",qt:12243.41,custo:1750807.12,tipo:"Material",ger:1},
  {desc:"Brita 1",un:"m³",qt:12243.41,custo:1750807.12,tipo:"Material",ger:1},
  {desc:"Dente de corte (W6/22) p/ recicladora",un:"Unid.",qt:22321.15,custo:1427660.88,tipo:"Material",ger:1},
  {desc:"Asfalto diluído - CM-30",un:"Ton.",qt:598.38,custo:1244630.4,tipo:"Material",ger:1},
  {desc:"Caminhão Basculante: Volvo BM: FM 12 6X4: 20 t",un:"H",qt:4308.13,custo:976370.03,tipo:"Equipamento",ger:0.5891},
  {desc:"Recicladora de Pavimento: Wirtgen: WR 2000: a frio",un:"H",qt:1701.31,custo:918966.9,tipo:"Equipamento",ger:0.767},
  {desc:"Óleo combustível IA",un:"Litro",qt:576000,custo:913536,tipo:"Material",ger:0.4818},
  {desc:"Rolo Compactador: Dynapac: CA-25-P: 11,25 t vibratório",un:"H",qt:4563.27,custo:752607.91,tipo:"Equipamento",ger:0.6608},
  {desc:"Cimento portland CP II-32",un:"Kg",qt:1088599.32,custo:649284.18,tipo:"Material",ger:1},
  {desc:"Encarregado de turma",un:"H",qt:28696.72,custo:620834.05,tipo:"Mão de Obra",ger:0.1},
  {desc:"Areia lavada",un:"m³",qt:14915.81,custo:581716.74,tipo:"Material",ger:1},
  {desc:"Caminhão Tanque: Mercedes Benz: 2423 K: 10.000 l",un:"H",qt:3919.37,custo:558200.72,tipo:"Equipamento",ger:0.5976},
  {desc:"Motoniveladora: Caterpillar: 120H",un:"H",qt:3104.76,custo:540212.94,tipo:"Equipamento",ger:0.6506},
  {desc:"Aço D=6,3 mm CA 50",un:"Kg",qt:105554.99,custo:521441.66,tipo:"Material",ger:1},
  {desc:"Indenização de jazida",un:"m³",qt:207786.52,custo:478116.78,tipo:"Material",ger:0},
  {desc:'Vigas "I" 254 x 117,5 mm - 1ª alma',un:"Kg",qt:105157,custo:447022.41,tipo:"Material",ger:1},
  {desc:"Aço D=10 mm CA 50",un:"Kg",qt:105554.99,custo:411664.47,tipo:"Material",ger:1}
];
const TIPOS = ["Material","Equipamento","Mão de Obra"];

let rows = [];
const ANOS_EXATO=[{ano:2026,iva:.0100},{ano:2027,iva:.0880},{ano:2028,iva:.0880},{ano:2029,iva:.1057},{ano:2030,iva:.1234},{ano:2031,iva:.1411},{ano:2032,iva:.1588},{ano:2033,iva:.2650},{ano:2034,iva:.2650},{ano:2035,iva:.2650},{ano:2036,iva:.2650},{ano:2037,iva:.2650},{ano:2038,iva:.2650},{ano:2039,iva:.2650},{ano:2040,iva:.2650}];
const DADOS_EXATO=window.__BDIProData||{};
const TRANSICAO_EXATO=DADOS_EXATO.transicao||ANOS_EXATO.map(x=>({...x,pis:0,iss:.05}));
const TABELA_BDI_EXATO=DADOS_EXATO.tabelaBdi||{};

function icmsResidualExatoPorAno(ano,icms2027){
  if(typeof window.icmsResidualPorAno === 'function') return window.icmsResidualPorAno(ano,icms2027);
  const base=Math.max(0,Number(icms2027)||0),y=Number(ano)||0;
  if(y===2027||y===2028)return base;
  if(y===2029)return base*.90;
  if(y===2030)return base*.80;
  if(y===2031)return base*.70;
  if(y===2032)return base*.60;
  return 0;
}
function matcdAjustadoExatoPorIcms(matcd,ano,icms2027){
  if(typeof window.matcdAjustadoPorIcms === 'function') return window.matcdAjustadoPorIcms(matcd,ano,icms2027);
  return Math.max(0,Number(matcd||0)*(1-icmsResidualExatoPorAno(ano,icms2027)));
}

/* ====== Utilidades ====== */
const $ = id => document.getElementById(id);
const num = v => {
  let s=String(v??'').trim().replace(/[^\d,.-]/g,'');
  if(!s)return 0;
  const lastComma=s.lastIndexOf(','), lastDot=s.lastIndexOf('.');
  if(lastComma>-1 && lastDot>-1){
    s = lastComma>lastDot ? s.replace(/\./g,'').replace(',', '.') : s.replace(/,/g,'');
  }else if(lastComma>-1){
    s = s.replace(/\./g,'').replace(',', '.');
  }
  const n=parseFloat(s);
  return isFinite(n)?n:0;
};
const fmtBRL = v => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtPct = v => (v*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const fmtNum = v => v.toLocaleString('pt-BR',{maximumFractionDigits:2});
const fmtQtd = v => Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:2});

function voltar(){ showScreen("home"); }

/* ====== Render da tabela ====== */
function renderTable(){
  const tb = $('tbody');
  const ivaPadrao = Number($('anoExato')?.value||0)===2026?0:pctInput('ivaCheia');
  tb.innerHTML = '';
  rows.forEach((r,i)=>{
    if(r.iva===undefined||r.iva===null)r.iva=ivaPadrao;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-row="${i}" data-key="desc" value="${escAttr(r.desc)}" oninput="upd(${i},'desc',this.value)"></td>
      <td><input data-row="${i}" data-key="un" style="width:48px" value="${escAttr(r.un)}" oninput="upd(${i},'un',this.value)"></td>
      <td class="num"><input data-row="${i}" data-key="qt" style="width:100px" value="${fmtQtd(r.qt)}" oninput="upd(${i},'qt',this.value)" onblur="renderTable()"></td>
      <td class="num"><input data-row="${i}" data-key="custo" style="width:122px" value="${fmtBRL(r.custo)}" oninput="upd(${i},'custo',this.value)" onblur="renderTable()"></td>
      <td data-pct="${i}">—</td>
      <td><select data-row="${i}" data-key="tipo" onchange="upd(${i},'tipo',this.value)">${TIPOS.map(t=>`<option ${t===r.tipo?'selected':''}>${t}</option>`).join('')}</select></td>
      <td class="num"><input data-row="${i}" data-key="ger" style="width:76px" value="${fmtPctInput(r.ger)}" oninput="upd(${i},'ger',this.value)"></td>
      <td class="num" data-base-credito="${i}">—</td>
      <td class="num"><input data-row="${i}" data-key="iva" style="width:72px" value="${fmtPctInput(r.iva)}" oninput="upd(${i},'iva',this.value)"></td>
      <td class="num" data-cr="${i}">—</td>
      <td class="center"><button class="delrow" onclick="delRow(${i})" title="Remover">×</button></td>`;
    tb.appendChild(tr);
  });
  recalc();
}
function escAttr(s){return String(s==null?'':s).replace(/"/g,'&quot;');}

function upd(i,k,v){
  if(!rows[i])return;
  rows[i][k] = (k==='desc'||k==='un'||k==='tipo')? v : ((k==='ger'||k==='iva')?parsePercent(v):num(v));
  if(k==='iva')rows[i].ivaCustom=true;
  recalc();
}
function bindMatrixEvents(){
  const tb=$('tbody');
  if(!tb||tb.dataset.recalcBound)return;
  tb.dataset.recalcBound='1';
  const sync=e=>{
    const el=e.target;
    if(!el||!el.dataset)return;
    const i=Number(el.dataset.row), k=el.dataset.key;
    if(!Number.isInteger(i)||!k||!rows[i])return;
    rows[i][k] = (k==='desc'||k==='un'||k==='tipo') ? el.value : ((k==='ger'||k==='iva') ? parsePercent(el.value) : num(el.value));
    if(k==='iva')rows[i].ivaCustom=true;
    recalc();
  };
  tb.addEventListener('input',sync);
  tb.addEventListener('change',sync);
}
function addRow(){
  const ivaPadrao = Number($('anoExato')?.value||0)===2026?0:pctInput('ivaCheia');
  rows.push({desc:'',un:'',qt:0,custo:0,tipo:'Material',ger:1,iva:ivaPadrao});
  renderTable();
}
function delRow(i){ rows.splice(i,1); renderTable(); }
function limparTudo(){ rows=[]; renderTable(); }
function carregarExemplo(){ rows = EXEMPLO.map(r=>({...r})); renderTable(); }
function ordenarPorPercentual(){ rows.sort((a,b)=>Number(b.custo||0)-Number(a.custo||0)); renderTable(); }
function sincronizarAliquotasIvaLinhas(){
  const ivaPadrao = Number($('anoExato')?.value||0)===2026?0:pctInput('ivaCheia');
  rows.forEach(r=>{ r.iva=ivaPadrao; r.ivaCustom=false; });
}
function mostrarGuiaImportacao(){
  const msg = [
    'Formato esperado para importar a Matriz de Creditamento:',
    '',
    'Descrição do Insumo | Unidade | Quantidade | Custo Parcial | Tipo de Insumo | Geração de crédito | Alíquota IVA',
    '',
    'Observações:',
    '- Tipo de Insumo: Material, Equipamento ou Mão de Obra.',
    '- Quantidade e Custo Parcial podem usar formato brasileiro, inclusive R$.',
    '- Geração de crédito e Alíquota IVA podem vir como 8,8 ou 8,8%.',
    '- Se a coluna Alíquota IVA não existir, será usada a alíquota nominal atual do sistema.',
    '',
    'Clique em OK para selecionar o arquivo .xlsx ou .csv.'
  ].join('\\n');
  if(confirm(msg))$('fileImport')?.click();
}

/* ====== Cálculo ====== */

function pctInput(id){ return parsePercent($(id)?.value); }
function parsePercent(v){
  const n=num(v);
  return n/100;
}
function cprbEfetivaPorAnoExato(ano,cprb){return Number(ano)>=2028?0:Number(cprb||0)}
function parseRatio(v){
  const n=num(v);
  return n>1 ? n/100 : n;
}
function fmtPctInput(v){
  return (Number(v||0)*100).toLocaleString('pt-BR',{maximumFractionDigits:4});
}
function anualExato(ano){ return TRANSICAO_EXATO.find(x=>x.ano===ano)||TRANSICAO_EXATO[TRANSICAO_EXATO.length-1]; }
function preencherSelectsExato(){
  const ano=$('anoExato'), tipo=$('tipoObraEx');
  if(ano && !ano.options.length){
    ano.innerHTML=TRANSICAO_EXATO.map(x=>`<option value="${x.ano}">${x.ano}</option>`).join('');
    ano.value='2027';
  }
  if(tipo && !tipo.options.length){
    tipo.innerHTML=Object.entries(TABELA_BDI_EXATO).map(([k,v])=>`<option value="${k}">${v.nome}</option>`).join('');
    tipo.value='rodovias';
  }
  atualizarAnoOrigemExato();
}
function atualizarAnoOrigemExato(){
  const origem=$('anoOrigemEx'), ano=$('anoExato');
  if(!origem||!ano)return;
  const atual=Number(ano.value||2027), anterior=Number(origem.value||2026);
  const anos=TRANSICAO_EXATO.map(x=>x.ano).filter(x=>x<atual);
  origem.innerHTML=anos.length?anos.map(x=>`<option value="${x}">${x}</option>`).join(''):'<option value="">Sem ano anterior</option>';
  origem.disabled=!anos.length;
  origem.value=anos.includes(anterior)?anterior:(anos.length?anos[anos.length-1]:'');
}
function aplicarParametrosBdiExato(){
  const tipo=$('tipoObraEx')?.value||'rodovias', quartil=$('quartilBdiEx')?.value||'medio';
  const ref=TABELA_BDI_EXATO[tipo]?.[quartil]; if(!ref)return;
  const map={acEx:ref.ac,risco:ref.r,sgEx:ref.sg,dfEx:ref.df,lucroEx:ref.lucro};
  Object.entries(map).forEach(([id,val])=>{const el=$(id); if(el)el.value=fmtPctInput(val);});
}
function atualizaNotaBdiReduzidoExato(){
  const nota=$('notaBdiReduzidoExato');
  if(nota)nota.style.display=($('tipoObraEx')?.value==='bdi_materiais')?'block':'none';
}
function aplicarAnoExato(){
  const ano=Number($('anoExato')?.value||2027), a=anualExato(ano);
  const iva=$('ivaCheia'), iss=$('iss'), pis=$('pisCofinsEx');
  if(iva)iva.value=fmtPctInput(a.iva);
  sincronizarAliquotasIvaLinhas();
  if(iss)iss.value=fmtPctInput(a.iss);
  if(pis)pis.textContent=fmtPct(a.pis||0);
  atualizarRegraCprbExato();
  atualizarAnoOrigemExato();
}
function atualizarRegraCprbExato(){
  const ano=Number($('anoExato')?.value||2027), el=$('cprbEx'), nota=$('cprbExNota');
  if(!el)return;
  const bloqueia=ano>=2028;
  if(bloqueia)el.value='0';
  el.disabled=bloqueia;
  el.title=bloqueia?'A CPRB é considerada zero a partir de 2028.':'CPRB editável para anos anteriores a 2028.';
  if(nota)nota.textContent=bloqueia?'CPRB zerada automaticamente a partir de 2028.':'';
}
function computeBdiExatoPorAno(ano, matPct, K, f, rg, icms2027, issMunicipal, alpha, cprb){
  const a=anualExato(ano), teste2026=Number(ano)===2026;
  const ivaNominal=teste2026?0:Number(a.iva||0);
  const fatorEfetivo=(1-f)*(1-rg);
  const matPctAjustado=matcdAjustadoExatoPorIcms(matPct,ano,icms2027);
  const ivaeq=teste2026?0:Math.max(0, ivaNominal*((K*fatorEfetivo-matPctAjustado)/K));
  const issBdi=(Number(a.iss||issMunicipal))* (1-alpha);
  const cprbEfetiva=cprbEfetivaPorAnoExato(ano,cprb);
  const T=issBdi+cprbEfetiva+Number(a.pis||0);
  return K*(1+ivaeq)/(1-T)-1;
}
function pctBdiEx(v){return Number.isFinite(v)?(v*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—'}
function bdiEquationHtmlEx(ano){
  return Number(ano)>=2033
    ? 'BDI = [K × (1 + IVAeq)] − 1'
    : 'BDI = [K × (1 + IVAeq) / (1 − I)] − 1';
}
function splitPisCofinsEx(total){
  if(Math.abs(Number(total||0)-0.0365)<0.00001)return [['PIS',0.0065],['COFINS',0.03]];
  return Number(total||0)>0 ? [['PIS/COFINS',Number(total||0)]] : [];
}
function renderBdiBreakdownExato(data){
  const target=$('bdiBreakdownExato');
  if(!target)return;
  const linhas=[
    ['AC - ADMINISTRAÇÃO CENTRAL',data.ac,'rub','tax'],
    ['SG - SEGUROS e GARANTIA',data.sg,'rub','tax'],
    ['R - RISCOS',data.r,'rub','tax'],
    ['DF - DESPESAS FINANCEIRAS',data.df,'rub','tax'],
    ['L - LUCRO BRUTO',data.lucro,'rub','tax']
  ];
  const impostoTotal=Number(data.T||0)+Number(data.ivaeq||0);
  linhas.push(['I - IMPOSTOS',impostoTotal,'rub','tax green']);
  splitPisCofinsEx(data.pisCofins).forEach(([label,value])=>linhas.push([label,value,'sub','tax green']));
  if(Number(data.issBdi||0)>0)linhas.push(['ISS',data.issBdi,'sub','tax green']);
  if(Number(data.cprbEfetiva||0)>0)linhas.push(['CPRB',data.cprbEfetiva,'sub','tax green']);
  if(Number(data.ano)===2026){
    linhas.push(['IBS (0,1%, menos compensações e deduções)',0,'sub','tax green']);
    linhas.push(['CBS (0,9%, menos compensações e deduções)',0,'sub','tax green']);
  }else if(Number(data.ivaeq||0)>0 || Number(data.ano)>=2027){
    linhas.push(['IVA',data.ivaeq,'sub','tax green']);
  }
  linhas.push(['BDI (%)',data.bdi,'total-name','total-tax']);
  const anoLabel=Number(data.ano)>=2033?'a partir de 2033':String(data.ano||'—');
  const body=linhas.map(([label,value,c1,c2])=>`<tr><td class="${c1}">${label}</td><td class="${c2}">${pctBdiEx(value)}</td></tr>`).join('');
  target.innerHTML=`<div class="bdi-breakdown"><table><thead><tr><th>Discriminação<br><span>(Ano: ${anoLabel})</span></th><th>Taxa (%)</th></tr></thead><tbody>${body}</tbody></table></div><div class="bdi-equation">${bdiEquationHtmlEx(data.ano)}</div>`;
}
function recalc(){
  preencherSelectsExato();
  atualizarRegraCprbExato();
  atualizaNotaBdiReduzidoExato();
  const anoExato = Number($('anoExato')?.value||2027);
  const teste2026 = anoExato===2026;
  const a=anualExato(anoExato);
  const ivaCheiaNominal = pctInput('ivaCheia');
  const ivaCheia = teste2026?0:ivaCheiaNominal;
  const icms2027 = pctInput('icms2027Ex');
  const icmsResidual = icmsResidualExatoPorAno(anoExato,icms2027);
  const fs = pctInput('fatorSetorial');
  const rg = pctInput('redutorGov');
  const fatorEfetivo=(1-fs)*(1-rg);
  const ivaApl = ivaCheia*fatorEfetivo;
  $('ivaAplicavel').textContent = fmtPct(ivaApl);
  const obsEx=$('obsIvaTeste2026Exato');if(obsEx)obsEx.style.display=teste2026?'block':'none';
  const pis=$('pisCofinsEx');if(pis)pis.textContent=fmtPct(Number(a.pis||0));

  const issMunicipal=pctInput('iss'), alpha=pctInput('alphaEx'), issBdi=issMunicipal*(1-alpha), cprb=pctInput('cprbEx'), cprbEfetiva=cprbEfetivaPorAnoExato(anoExato,cprb);
  const ac=pctInput('acEx'), df=pctInput('dfEx'), sg=pctInput('sgEx'), L=pctInput('lucroEx'), R=pctInput('risco');
  const K = (1+ac+R+sg)*(1+df)*(1+L);
  $('fatorK').textContent = K.toFixed(6);

  let CD=0, baseCredTotal=0, matBaseEquiv=0, matBaseEquivBruto=0, Cr=0;
  rows.forEach(r=>{
    const custo=Number(r.custo||0), ger=Number(r.ger||0), aliq=Number(r.iva??ivaCheia);
    CD += custo;
    const baseCreditoBruta = ger*custo;
    const baseCreditoLinha = baseCreditoBruta*(1-icmsResidual);
    const creditoLinha = baseCreditoLinha*aliq;
    Cr += creditoLinha;
    baseCredTotal += baseCreditoLinha;
    matBaseEquivBruto += ivaCheiaNominal>0 ? (baseCreditoBruta*aliq)/ivaCheiaNominal : baseCreditoBruta;
    matBaseEquiv += ivaCheiaNominal>0 ? creditoLinha/ivaCheiaNominal : baseCreditoLinha;
  });

  rows.forEach((r,i)=>{
    const pct = CD>0? r.custo/CD : 0;
    const baseCreditoLinha = r.ger*r.custo*(1-icmsResidual);
    const crLinha = baseCreditoLinha*Number(r.iva??ivaCheia);
    const cellPct=document.querySelector(`[data-pct="${i}"]`);
    const cellBase=document.querySelector(`[data-base-credito="${i}"]`);
    const cellCr =document.querySelector(`[data-cr="${i}"]`);
    if(cellPct) cellPct.textContent = fmtPct(pct);
    if(cellBase) cellBase.textContent = fmtBRL(baseCreditoLinha);
    if(cellCr)  cellCr.textContent  = fmtBRL(crLinha);
  });

  $('totCD').textContent = fmtBRL(CD);
  $('totPct').textContent = rows.length? '100,00%' : '?';
  const totalBaseCredito=$('totBaseCredito'); if(totalBaseCredito) totalBaseCredito.textContent = fmtBRL(baseCredTotal);
  $('totCr').textContent = fmtBRL(Cr);

  const crCD = CD>0? Cr/CD : 0;
  const matPctBruto = CD>0? matBaseEquivBruto/CD : 0;
  const matPct = CD>0? matBaseEquiv/CD : 0;
  const matPctAjustado = Math.max(0, matPct * (1 - icmsResidual));
  const IVAeq = teste2026?0:Math.max(0, ivaCheia*((K*fatorEfetivo-matPctAjustado)/K));
  const T=issBdi+cprbEfetiva+Number(a.pis||0);
  const BDIclassico = K/(1-T)-1;
  const BDIreal = K*(1+IVAeq)/(1-T)-1;
  const valorBase = num($('valorContratoEx')?.value||0);
  let bdiOrigem;
  if(Number($('usarBdiOriginalEx')?.value||0)) bdiOrigem=pctInput('bdiOriginalManualEx');
  else bdiOrigem=computeBdiExatoPorAno(Number($('anoOrigemEx')?.value||anoExato), matPct, K, fs, rg, icms2027, issMunicipal, alpha, cprb);
  const fatorReeq=(1+BDIreal)/(1+bdiOrigem)-1;
  const valorAjustado=valorBase*(1+fatorReeq);
  const precoVenda=CD*(1+BDIreal);

  $('rCD').textContent = fmtBRL(CD);
  $('rCr').textContent = fmtBRL(Cr);
  $('rCrCD').textContent = fmtPct(crCD);
  $('rBDIast').textContent = fmtPct(BDIclassico);
  $('rBDIreal').textContent = fmtPct(BDIreal);
  const precoVendaEl=$('rPrecoVenda'); if(precoVendaEl)precoVendaEl.textContent=fmtBRL(precoVenda);
  $('rPV').textContent = fmtBRL(valorAjustado);
  $('rMat').textContent = fmtPct(matPct);
  const rMatAjustado=$('rMatAjustado'); if(rMatAjustado) rMatAjustado.textContent = fmtPct(matPctAjustado);
  $('rIVAeq').textContent = fmtPct(IVAeq);
  $('rIVArec').textContent = fmtPct(fatorReeq);
  renderBdiBreakdownExato({ano:anoExato,ac,r:R,sg,df,lucro:L,T,issBdi,pisCofins:Number(a.pis||0),cprbEfetiva,ivaeq:IVAeq,bdi:BDIreal});
  const flag=$('bdiFlag'), desc=$('bdiRealDesc');
  if(flag) flag.innerHTML='';
  if(desc) desc.textContent = '';
  const memValor=$('valorAjustadoMem');
  if(memValor)memValor.textContent=`${fmtBRL(valorBase)} × (1 ${fatorReeq>=0?'+':'-'} ${fmtPct(Math.abs(fatorReeq))})`;
}

/* ====== Importação ====== */
function importFile(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data,{type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const arr = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      parseImported(arr);
    }catch(err){ alert('Falha ao ler o arquivo: '+err.message); }
    ev.target.value='';
  };
  reader.readAsArrayBuffer(file);
}

function parseImported(arr){
  // Procura a linha de cabeçalho que contém "Descrição"
  let hidx = arr.findIndex(r => r.some(c => /descri/i.test(String(c))));
  if(hidx<0) hidx=0;
  const head = arr[hidx].map(c=>String(c).toLowerCase());
  const col = (...keys)=> head.findIndex(h=>keys.some(k=>h.includes(k)));
  const cDesc=col('descri'), cUn=col('unidade','un.'), cQt=col('quantidade','quant'),
        cCusto=col('custo parcial','preço parcial','preco parcial','custo'),
        cTipo=col('tipo de insumo','tipo'), cGer=col('geração de cr','geracao de cr','ger'),
        cIva=col('alíquota iva','aliquota iva','iva (%)','iva%');

  const out=[];
  for(let i=hidx+1;i<arr.length;i++){
    const r=arr[i];
    const desc = cDesc>=0? String(r[cDesc]||'').trim() : '';
    const custo = cCusto>=0? num(r[cCusto]) : 0;
    if(!desc) continue;
    // para na seção de parâmetros pós-tabela (ISS, AC, etc.) sem custo
    if(!custo && /^(iss|administra|despesas|seguros|lucro|risco|k\b|total)/i.test(desc)) break;
    let tipo = cTipo>=0? String(r[cTipo]||'Material').trim() : 'Material';
    if(!TIPOS.includes(tipo)){
      const tl=tipo.toLowerCase();
      tipo = tl.includes('equip')?'Equipamento':tl.includes('mão')||tl.includes('mao')?'Mão de Obra':'Material';
    }
    out.push({
      desc,
      un: cUn>=0? String(r[cUn]||'').trim():'',
      qt: cQt>=0? num(r[cQt]):0,
      custo,
      tipo,
      ger: cGer>=0? parseRatio(r[cGer]):1,
      iva: cIva>=0? parseRatio(r[cIva]):(Number($('anoExato')?.value||0)===2026?0:pctInput('ivaCheia')),
      ivaCustom: cIva>=0
    });
  }
  if(!out.length){ alert('Nenhum insumo reconhecido. Verifique se há colunas Descrição/Custo Parcial/Geração de crédito.'); return; }
  rows = out;
  renderTable();
  alert(out.length+' insumo(s) importado(s).');
}

/* ====== Exportação CSV ====== */
function exportCSV(){
  const ivaCheia=Number($('anoExato')?.value||0)===2026?0:pctInput('ivaCheia');
  const icmsResidual=icmsResidualExatoPorAno(Number($('anoExato')?.value||2027),pctInput('icms2027Ex'));
  const head=['Descrição','Unidade','Quantidade','Custo Parcial','Tipo de Insumo','Geração de crédito','Valor considerado para crédito','Alíquota IVA','Crédito de IVA'];
  const lines=[head.join(';')];
  rows.forEach(r=>{
    const baseCredito=r.ger*r.custo*(1-icmsResidual);
    const aliqIva=Number(r.iva??ivaCheia);
    const credito=baseCredito*aliqIva;
    lines.push([
      `"${String(r.desc).replace(/"/g,'""')}"`,r.un,r.qt,r.custo,r.tipo,fmtPctInput(r.ger),baseCredito,fmtPctInput(aliqIva),credito
    ].join(';'));
  });
  const blob=new Blob(["\uFEFF"+lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='matriz_creditamento.csv';
  a.click();
}

/* ---- versão pura de parseImported (gerada: mesma lógica, sem tela) ---- */
function parseImportedPuro(arr, ivaPadrao){
  // Procura a linha de cabeçalho que contém "Descrição"
  let hidx = arr.findIndex(r => r.some(c => /descri/i.test(String(c))));
  if(hidx<0) hidx=0;
  const head = arr[hidx].map(c=>String(c).toLowerCase());
  const col = (...keys)=> head.findIndex(h=>keys.some(k=>h.includes(k)));
  const cDesc=col('descri'), cUn=col('unidade','un.'), cQt=col('quantidade','quant'),
        cCusto=col('custo parcial','preço parcial','preco parcial','custo'),
        cTipo=col('tipo de insumo','tipo'), cGer=col('geração de cr','geracao de cr','ger'),
        cIva=col('alíquota iva','aliquota iva','iva (%)','iva%');

  const out=[];
  for(let i=hidx+1;i<arr.length;i++){
    const r=arr[i];
    const desc = cDesc>=0? String(r[cDesc]||'').trim() : '';
    const custo = cCusto>=0? num(r[cCusto]) : 0;
    if(!desc) continue;
    // para na seção de parâmetros pós-tabela (ISS, AC, etc.) sem custo
    if(!custo && /^(iss|administra|despesas|seguros|lucro|risco|k\b|total)/i.test(desc)) break;
    let tipo = cTipo>=0? String(r[cTipo]||'Material').trim() : 'Material';
    if(!TIPOS.includes(tipo)){
      const tl=tipo.toLowerCase();
      tipo = tl.includes('equip')?'Equipamento':tl.includes('mão')||tl.includes('mao')?'Mão de Obra':'Material';
    }
    out.push({
      desc,
      un: cUn>=0? String(r[cUn]||'').trim():'',
      qt: cQt>=0? num(r[cQt]):0,
      custo,
      tipo,
      ger: cGer>=0? parseRatio(r[cGer]):1,
      iva: cIva>=0? parseRatio(r[cIva]):ivaPadrao,
      ivaCustom: cIva>=0
    });
  }
  return out;
}

/* ---- calcExatoPuro: mesma aritmética de recalc(), com entradas por parâmetro ---- */
function calcExatoPuro(p, rows){
  const anoExato = Number(p.ano||2027);
  const teste2026 = anoExato===2026;
  const a=anualExato(anoExato);
  const ivaCheiaNominal = Number(p.ivaCheia||0);
  const ivaCheia = teste2026?0:ivaCheiaNominal;
  const icms2027 = Number(p.icms2027||0);
  const icmsResidual = icmsResidualExatoPorAno(anoExato,icms2027);
  const fs = Number(p.fatorSetorial||0);
  const rg = Number(p.redutorGov||0);
  const fatorEfetivo=(1-fs)*(1-rg);
  const ivaApl = ivaCheia*fatorEfetivo;
  const issMunicipal=Number(p.iss||0), alpha=Number(p.alpha||0), issBdi=issMunicipal*(1-alpha), cprb=Number(p.cprb||0), cprbEfetiva=cprbEfetivaPorAnoExato(anoExato,cprb);
  const ac=Number(p.ac||0), df=Number(p.df||0), sg=Number(p.sg||0), L=Number(p.lucro||0), R=Number(p.risco||0);
  const K = (1+ac+R+sg)*(1+df)*(1+L);
  let CD=0, baseCredTotal=0, matBaseEquiv=0, matBaseEquivBruto=0, Cr=0;
  rows.forEach(r=>{
    const custo=Number(r.custo||0), ger=Number(r.ger||0), aliq=Number(r.iva??ivaCheia);
    CD += custo;
    const baseCreditoBruta = ger*custo;
    const baseCreditoLinha = baseCreditoBruta*(1-icmsResidual);
    const creditoLinha = baseCreditoLinha*aliq;
    Cr += creditoLinha;
    baseCredTotal += baseCreditoLinha;
    matBaseEquivBruto += ivaCheiaNominal>0 ? (baseCreditoBruta*aliq)/ivaCheiaNominal : baseCreditoBruta;
    matBaseEquiv += ivaCheiaNominal>0 ? creditoLinha/ivaCheiaNominal : baseCreditoLinha;
  });
  const linhas = rows.map(r=>{
    const pct = CD>0? r.custo/CD : 0;
    const baseCreditoLinha = r.ger*r.custo*(1-icmsResidual);
    const crLinha = baseCreditoLinha*Number(r.iva??ivaCheia);
    return {pct, base:baseCreditoLinha, cr:crLinha};
  });
  const crCD = CD>0? Cr/CD : 0;
  const matPctBruto = CD>0? matBaseEquivBruto/CD : 0;
  const matPct = CD>0? matBaseEquiv/CD : 0;
  const matPctAjustado = Math.max(0, matPct * (1 - icmsResidual));
  const IVAeq = teste2026?0:Math.max(0, ivaCheia*((K*fatorEfetivo-matPctAjustado)/K));
  const T=issBdi+cprbEfetiva+Number(a.pis||0);
  const BDIclassico = K/(1-T)-1;
  const BDIreal = K*(1+IVAeq)/(1-T)-1;
  const valorBase = Number(p.valorContrato||0);
  let bdiOrigem;
  if(Number(p.usarBdiOriginal||0)) bdiOrigem=Number(p.bdiOriginalManual||0);
  else bdiOrigem=computeBdiExatoPorAno(Number(p.anoOrigem||anoExato), matPct, K, fs, rg, icms2027, issMunicipal, alpha, cprb);
  const fatorReeq=(1+BDIreal)/(1+bdiOrigem)-1;
  const valorAjustado=valorBase*(1+fatorReeq);
  const precoVenda=CD*(1+BDIreal);
  return {ano:anoExato,teste2026,pis:Number(a.pis||0),ivaCheiaNominal,ivaCheia,icms2027,icmsResidual,fatorEfetivo,ivaApl,issMunicipal,alpha,issBdi,cprbEfetiva,
    ac,r:R,sg,df,lucro:L,K,CD,baseCredTotal,Cr,crCD,matPctBruto,matPct,matPctAjustado,IVAeq,T,BDIclassico,BDIreal,bdiOrigem,fatorReeq,valorBase,valorAjustado,precoVenda,linhas};
}
/* =================== fim do BLOCO B =================== */
    return { EXEMPLO, TIPOS, ANOS_EXATO, TRANSICAO_EXATO, TABELA_BDI_EXATO, anualExato, computeBdiExatoPorAno, cprbEfetivaPorAnoExato,
      icmsResidualExatoPorAno, matcdAjustadoExatoPorIcms, num, parsePercent, parseRatio, fmtPctInput, splitPisCofinsEx, bdiEquationHtmlEx,
      pctBdiEx, calcExatoPuro, parseImportedPuro };
  })();

  /* ===================================================================
   * API para a interface do OrçaPro (organiza entradas e saídas;
   * reproduz os efeitos dos campos da tela original sobre os valores)
   * =================================================================== */
  BD.A = A; BD.B = B;
  BD.QUARTIS = { q1: 'Primeiro Quartil', medio: 'Média', q3: 'Terceiro Quartil' };
  BD.clone = (o) => JSON.parse(JSON.stringify(o));
  /* ---------- Paramétrico ---------- */
  // aplicaParametrosBdi(): AC, R, S+G, DF e L pelo tipo de obra e quartil
  BD.paramTipo = (o) => { const ref = A.tabelaBdi[o.tipoObra || A.defaults.tipoObra]?.[o.quartilBdi || A.defaults.quartilBdi]; if (ref) ['ac', 'r', 'sg', 'df', 'lucro'].forEach((k) => (o[k] = ref[k])); };
  // aplicaRefCredito(true): MAT/CD, MO/CD, EQ/CD e crédito de equipamentos pela referência típica
  BD.paramRef = (o, sync = true) => {
    const ref = A.referenciasCredito.find((x) => x.tipo === o.tipoRefCredito) || A.referenciasCredito[0]; if (!ref) return;
    ['matcd', 'mocd', 'eqcd'].forEach((k) => (o[k] = ref[k])); o.credeq = ref.credEqSug;
    if (sync && ref.tipoObraKey) { o.tipoObra = ref.tipoObraKey; BD.paramTipo(o); }
  };
  BD.refCredito = (tipo) => A.referenciasCredito.find((x) => x.tipo === tipo) || A.referenciasCredito[0];
  BD.anosOrigem = (ano) => A.transicao.map((x) => x.ano).filter((a) => a < Number(ano));
  // atualizaAnoOrigem() e atualizaRegraCprbParam(): executadas pela tela original a cada atualização
  BD.paramNormaliza = (o) => {
    const anos = BD.anosOrigem(o.ano); const ant = Number(o.anoOrigem || A.defaults.anoOrigem);
    o.anoOrigem = anos.includes(ant) ? ant : (anos.length ? anos[anos.length - 1] : '');
    if (Number(o.ano) >= 2028) o.cprb = 0;
  };
  BD.paramDefaults = () => { const o = BD.clone(A.defaults); BD.paramRef(o, true); BD.paramNormaliza(o); return o; };
  BD.matcdTotal = (o) => o.matcd + .1 * o.mocd + o.credeq * o.eqcd + (o.credBdi || 0);
  // computeFromVals(vals()) — "simplesAplicado" reproduz window.__SimplesBDIResult (IVAeq do Simples aplicado ao principal)
  BD.paramCompute = (o, simplesAplicado) => { BD.paramNormaliza(o); window.__SimplesBDIResult = simplesAplicado || null; return A.computeFromVals(BD.clone(o)); };
  BD.paramCurva = (o, matcdTotal, simplesAplicado) => {
    window.__SimplesBDIResult = simplesAplicado || null; const pts = [];
    for (let ano = 2026; ano <= 2033; ano++) { const r = A.computeFor(matcdTotal, { ...o, ano, usarBdiOriginal: 1, bdiOriginalManual: 0 }); if (!r.erro) pts.push({ ano, ivaeq: r.ivaeq, bdi: r.bdi }); }
    return pts;
  };
  /* ---------- Exato ---------- */
  BD.exatoIvaPadrao = (e) => (Number(e.ano) === 2026 ? 0 : Number(e.ivaCheia || 0));
  BD.exatoSyncIva = (e) => { const iva = BD.exatoIvaPadrao(e); e.rows.forEach((r) => { r.iva = iva; r.ivaCustom = false; }); };      // sincronizarAliquotasIvaLinhas()
  BD.exatoFillIva = (e) => { const iva = BD.exatoIvaPadrao(e); e.rows.forEach((r) => { if (r.iva === undefined || r.iva === null) r.iva = iva; }); }; // renderTable()
  BD.exatoTipo = (e) => { const ref = B.TABELA_BDI_EXATO[e.tipo]?.[e.quartil]; if (ref) { e.ac = ref.ac; e.risco = ref.r; e.sg = ref.sg; e.df = ref.df; e.lucro = ref.lucro; } }; // aplicarParametrosBdiExato()
  BD.exatoNormaliza = (e) => {                                                                                       // atualizarAnoOrigemExato() + atualizarRegraCprbExato()
    const anos = B.TRANSICAO_EXATO.map((x) => x.ano).filter((x) => x < Number(e.ano)); const ant = Number(e.anoOrigem || 2026);
    e.anoOrigem = anos.includes(ant) ? ant : (anos.length ? anos[anos.length - 1] : '');
    if (Number(e.ano) >= 2028) e.cprb = 0;
  };
  BD.exatoAno = (e) => { const a = B.anualExato(Number(e.ano)); e.ivaCheia = a.iva; BD.exatoSyncIva(e); e.iss = a.iss; BD.exatoNormaliza(e); }; // aplicarAnoExato()
  BD.exatoDefaults = () => {
    const e = { ano: 2027, tipo: 'rodovias', quartil: 'q1', ivaCheia: .088, fatorSetorial: .5, redutorGov: 0, icms2027: .18, iss: .05, alpha: .4, cprb: .018,
      valorContrato: 1000000, anoOrigem: 2026, usarBdiOriginal: 0, bdiOriginalManual: .25, ac: 0, risco: 0, sg: 0, df: 0, lucro: 0, rows: [] };
    BD.exatoAno(e); BD.exatoTipo(e); e.rows = B.EXEMPLO.map((r) => ({ ...r })); BD.exatoFillIva(e); return e;
  };
  BD.exatoNovaLinha = (e) => ({ desc: '', un: '', qt: 0, custo: 0, tipo: 'Material', ger: 1, iva: BD.exatoIvaPadrao(e) });              // addRow()
  BD.exatoCompute = (e) => { BD.exatoNormaliza(e); BD.exatoFillIva(e); return B.calcExatoPuro(e, e.rows); };
  /* ---------- Simples Nacional ---------- */
  BD.simplesTipo = (s) => { const ref = A.tabelaBdi[s.tipoObra || 'rodovias']?.[s.quartilBdi || 'medio']; if (ref) ['ac', 'r', 'sg', 'df', 'lucro'].forEach((k) => (s[k] = ref[k])); }; // aplicarParametrosBdiSimples()
  BD.simplesDefaults = () => {
    const s = { modelo: 'das', anexo: 'IV', tipoObra: 'rodovias', quartilBdi: 'q1', rbt12: 1800000, ano: 2026, cprbOpt: true, custoDireto: 1000000, matcd: .4,
      fatorSetorial: .5, redutorGov: 0, icms2027: .18, cbsCheia: .088, ibsCheio: .177, ac: 0, r: 0, sg: 0, df: 0, lucro: 0,
      razao: 'Empresa optante pelo Simples Nacional', cnpj: '00.000.000/0001-00', cnae: '42.11-1-01', cnaeSec: '', municipio: 'Belo Horizonte', estado: 'MG', cenRbt12: 2200000, cenAnexo: 'IV' };
    BD.simplesTipo(s); return s;
  };
  const baseSimples = (s) => ({ modelo: s.modelo || 'das', anexo: s.anexo || 'IV', tipoObra: s.tipoObra || 'edificios', quartilBdi: s.quartilBdi || 'medio', rbt12: Number(s.rbt12) || 0,
    ano: Number(s.ano || 2027), cprbOpt: !!s.cprbOpt, custoDireto: Number(s.custoDireto) || 0, matcd: Number(s.matcd) || 0, fatorSetorial: Number(s.fatorSetorial) || 0,
    redutorGov: Number(s.redutorGov) || 0, icms2027: Number(s.icms2027) || 0, cbsCheia: Number(s.cbsCheia), ibsCheio: Number(s.ibsCheio),
    ac: Number(s.ac) || 0, r: Number(s.r) || 0, sg: Number(s.sg) || 0, df: Number(s.df) || 0, lucro: Number(s.lucro) || 0 });           // lerSimples()
  // calculaBdiSimples(): o valor "aplicado ao principal" só muda por ação explícita (botão), não a cada recálculo
  BD.simplesCompute = (s) => { const keep = window.__SimplesBDIResult; const r = A.calculaBdiSimples(baseSimples(s)); window.__SimplesBDIResult = keep; return r; };
  BD.simplesWith = (res, extra) => { const keep = window.__SimplesBDIResult; const r = A.calculaBdiSimples({ ...res, ...extra }); window.__SimplesBDIResult = keep; return r; };
  BD.simplesComparacao = (res, cenRbt12, cenAnexo) => {                                                                // renderComparacaoSimples()
    const lp = A.calculaRegimeComparado('Lucro Presumido', res), lr = A.calculaRegimeComparado('Lucro Real', res);
    const sn = { regime: 'Simples Nacional', T: res.T, ivaeq: res.ivaeq, bdi: res.bdi, precoVenda: res.precoVenda };
    const evol = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034].map((ano) => [String(ano), BD.simplesWith(res, { ano }).bdi]);
    const rbtC = Number(cenRbt12) || res.rbt12, anexoC = cenAnexo || res.anexo; let cenario;
    if (anexoC === 'LP') cenario = { ...lp, anexo: 'Lucro Presumido', rbt12: rbtC, faixa: { faixa: '—' }, aliqEf: NaN };
    else if (anexoC === 'LR') cenario = { ...lr, anexo: 'Lucro Real', rbt12: rbtC, faixa: { faixa: '—' }, aliqEf: NaN };
    else cenario = BD.simplesWith(res, { rbt12: rbtC, anexo: anexoC });
    return { lp, lr, sn, regimes: [lr, lp, sn], evol, cenario };
  };
  BD.simplesCron = (ano) => A.cronSimples(ano);
})(typeof window !== 'undefined' ? window : globalThis);


