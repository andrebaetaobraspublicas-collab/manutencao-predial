'use strict';
// Editable scenario defaults requested for the development rollout, 31/10/2026.
function motor(s){
 if(!s.includes('function cfgPadrao()'))return s;
 s=s.replace('schemaVersion:7,appVersion:', 'schemaVersion:8,appVersion:')
 .replace('cbs:[0.9,8.7,8.7,8.8,8.8,8.8,8.8,8.8]','cbs:[0.9,11.2,11.2,11.3,11.3,11.3,11.3,11.3]')
 .replace('ibs:[0.1,0.1,0.1,1.92,3.84,5.76,7.68,19.2]','ibs:[0.1,0.1,0.1,1.87,3.74,5.61,7.48,18.7]')
 .replace('[1,2,3,4,5,6,7].includes(vers)','[1,2,3,4,5,6,7,8].includes(vers)')
 .replace("['corrente','economico'].includes(r.ativo.modo)","['corrente','economico','progressivo'].includes(r.ativo.modo)");
 // Upgrade only the former untouched default vectors, preserving custom scenarios.
 s=s.replace("const antigaRef=JSON.stringify(r.ibs)","const defaultsAnteriores=vers<8&&JSON.stringify(r.cbs)===JSON.stringify([.9,8.7,8.7,8.8,8.8,8.8,8.8,8.8])&&JSON.stringify(r.ibs)===JSON.stringify([.1,.1,.1,1.92,3.84,5.76,7.68,19.2]);\n const antigaRef=JSON.stringify(r.ibs)")
 .replace("if(vers>=2&&!(antigoV3", "if(!defaultsAnteriores&&vers>=2&&!(antigoV3");
 const values={diesel:.320975,gasolina:.7925,glp:.1677,etanol:.1922,biodiesel:.1480};
 for(const [k,v]of Object.entries(values)){
  const re=new RegExp('('+k+":\\{federalModo:')[^']+(',federal:)[0-9.]+",'g');
  s=s.replace(re,`$1unitario$2${v}`);
 }
 // Existing explicit quotations/rates remain project-owned; migrate known defaults only.
 s=s.replace("const f=r.combustiveis?.[k];if(!f)continue;", "const supplied=r.combustiveis?.[k];if(!supplied)continue;const f={...supplied};const oldFuel={diesel:['percentual',4.24],gasolina:['unitario',.60],glp:['unitario',0],etanol:['unitario',0],biodiesel:['percentual',4.24]}[k];if(vers<8&&oldFuel&&f.federalModo===oldFuel[0]&&f.federal===oldFuel[1]){f.federalModo=v.federalModo;f.federal=v.federal;f.fonte=v.fonte;}");
 s=s.replace(/fonte:'Tabela de cenário fornecida pelo usuário:[^']*'/g,"fonte:'Portaria MF 3.074/2026, efeitos a partir de 08/01/2027. Diesel B15: 85% × 0,3515 + 15% × 0,1480 = R$ 0,320975/L; cálculo ponderado, não alíquota expressa da mistura. Biodiesel do item IV, exceto agricultura familiar. Carga estadual mantida como premissa editável.'")
 .replace(/fonte:'Hipótese econômica de migração: parcela federal[^']*'/g,"fonte:'Portaria MF 3.074/2026, Anexo I: CBS de R$ 0,7925/L a partir de 08/01/2027. Carga estadual editável.'")
 .replace(/fonte:'Referência Petrobras\/Comsefaz 2026:[^']*'/g,"fonte:'Portaria MF 3.074/2026, Anexo V: CBS de R$ 0,1677/kg, exceto GLP doméstico em recipientes até 13 kg. Carga estadual editável.'")
 .replace(/fonte:'Hipótese econômica preenchida: carga federal nula[^']*'/g,"fonte:'Portaria MF 3.074/2026, Anexo VI: CBS de R$ 0,1922/L de etanol hidratado. Carga estadual editável.'")
 .replace(/fonte:'Hipótese por analogia ao cenário do diesel[^']*'/g,"fonte:'Portaria MF 3.074/2026, Anexo IV: CBS de R$ 0,1480/L de B100, exceto matéria-prima da agricultura familiar. Não se aplica a ponderação B15 ao B100.'");
 s=s.replace("const economico=oc.perfil==='depreciacao'&&cfg.ativo.modo==='economico',ae=economico?", "const progressivo=oc.perfil==='depreciacao'&&cfg.ativo.modo==='progressivo',economico=oc.perfil==='depreciacao'&&['economico','progressivo'].includes(cfg.ativo.modo),ae=economico&&!progressivo?")
 .replace('const potAntesAnexo=pot;pot*=fatorAnexo;', 'const recuperacaoDepreciacao=progressivo?Math.max(0,Math.min(1,(Number(ano)-2027)/10)):1;pot*=recuperacaoDepreciacao;\n const potAntesAnexo=pot;pot*=fatorAnexo;')
 .replace('const r={oc,ano,anoEfetivo:ae,', 'const r={oc,ano,recuperacaoDepreciacao,anoEfetivo:ae,');
 return ui(s);
}
function ui(s){
 // Normalize before inserting: Infraestrutura contains the motor and UI in one
 // module, so this transform can be reached more than once in the same build.
 s=s.replace(/,\['progressivo','Recuperação progressiva da depreciação \(2027–2037\)'\]/g,'')
 .replace(/<p class="small">Recuperação progressiva da depreciação:[^<]*<\/p>/g,'');
 return s.replaceAll("['corrente','Alíquota do exercício corrente']","['corrente','Alíquota do exercício corrente'],['progressivo','Recuperação progressiva da depreciação (2027–2037)']")
 .replaceAll('Cenário hipotético de IVA de 28% em 2033.', 'Premissa editável de IVA de 30% em 2033 (CBS 11,3% + IBS 18,7%).')
 .replaceAll('Restaurar cenário de IVA de 28%', 'Restaurar cenário de IVA de 30%')
 .replaceAll('<h3>Base ponderada com combustíveis</h3>', '<p class="small">Recuperação progressiva da depreciação: 2027: 0%; 2028: 10%; 2029: 20%; 2030: 30%; 2031: 40%; 2032: 50%; 2033: 60%; 2034: 70%; 2035: 80%; 2036: 90%; 2037 em diante: 100%. Usa o ano do crédito consultado, não o ano manual de aquisição; aplica o fator uma única vez e somente à depreciação. Premissa de simulação fornecida pelo usuário.</p><h3>Base ponderada com combustíveis</h3>');}
function bdi(s){
 if(!s.includes('const ANOS_EXATO='))return s;
 const map={'.0870':'.1120','.087':'.112','.0880':'.1130','.088':'.113','.0177':'.0187','.0354':'.0374','.0531':'.0561','.0708':'.0748','.1770':'.1870','.177':'.187','.2650':'.3000','.1057':'.1317','.1234':'.1504','.1411':'.1691','.1588':'.1878'};
 s=s.replace(/(?<![\d.])\.(?:0870|087|0880|088|0177|0354|0531|0708|1770|177|2650|1057|1234|1411|1588)(?!\d)/g,x=>map[x]);
 // IVA in 2027/2028 is CBS 11.2% + IBS 0.1%, not the full CBS of 2029 onward.
 s=s.replace(/(ano:202[78],iva:)\.1130/g,'$1.1130').replaceAll('redutorGov:0,','redutorGov:.442,').replaceAll('redutorGov: 0,','redutorGov: .442,').replaceAll('redutor:0,','redutor:.442,');
 s=s.replaceAll("||'8,8'","||'11,3'").replaceAll("||'17,7'","||'18,7'");
 s=s.replace('return y>=2027?Math.max(0,Number(cbsCheia)||0):0;', 'return y>=2027?Math.max(0,(Number(cbsCheia)||0)-(y<=2028?.001:0)):0;');
 return s;
}
function extendYears(s){
 if(s.includes('function cfgPadrao()')&&!s.includes('PORTARIA_3074_EXTRA')){
  s=s.replace('function cfgPadrao(){',`// PORTARIA_3074_EXTRA: additional specific fuels, with no assumed state credit.
Object.assign(COMBUSTIVEIS,{etanolAnidro:{nome:'Etanol anidro (EAC)',un:'L',icms:0},querosene:{nome:'Querosene de aviação',un:'L',icms:0},oleocombustivel:{nome:'Óleo combustível',un:'KG',icms:0}});
for(const [k,value]of [['etanolAnidro',.1922],['querosene',.0712],['oleocombustivel',.3403]])PREMISSAS_COMB[k]={federalModo:'unitario',federal:value,estadualModo:'unitario',estadual:0,preco:0,fonte:'Portaria MF 3.074/2026, Anexo: CBS específica; efeitos a partir de 08/01/2027. Preço e carga estadual não informados: preencher conforme a operação.'};
function cfgPadrao(){`)
  .replace('function combustivelTipo(d){d=normal(d);','function combustivelTipo(d){d=normal(d);if(/^ETANOL\\s+ANIDRO/.test(d))return \'etanolAnidro\';if(/^QUEROSENE/.test(d))return \'querosene\';if(/^OLEO\\s+COMBUSTIVEL/.test(d))return \'oleocombustivel\';')
  .replace('pot*=recuperacaoDepreciacao;',"pot*=recuperacaoDepreciacao;if(progressivo)avisos.push('Depreciação: recuperação de '+(recuperacaoDepreciacao*100).toFixed(0)+'% em '+ano+', aplicada uma única vez à base e aos créditos desta rubrica.');");
 }
 s=s.replace('Object.freeze([2026,2027,2028,2029,2030,2031,2032,2033])','Object.freeze([2026,2027,2028,2029,2030,2031,2032,2033,2034,2035,2036,2037])')
 .replace('Object.freeze([100,100,100,90,80,70,60,0])','Object.freeze([100,100,100,90,80,70,60,0,0,0,0,0])')
 .replace('cbs:[0.9,11.2,11.2,11.3,11.3,11.3,11.3,11.3]','cbs:[0.9,11.2,11.2,11.3,11.3,11.3,11.3,11.3,11.3,11.3,11.3,11.3]')
 .replace('ibs:[0.1,0.1,0.1,1.87,3.74,5.61,7.48,18.7]','ibs:[0.1,0.1,0.1,1.87,3.74,5.61,7.48,18.7,18.7,18.7,18.7,18.7]')
 .replace("r[k].length===8)c[k]=r[k].map((v,i)=>num(v,0,100,c[k][i]))", "[8,12].includes(r[k].length))c[k]=c[k].map((d,i)=>num(r[k][i],0,100,d))")
 .replace('f.anos.length===8','[8,12].includes(f.anos.length)')
 .replace("v.anos=f.anos.map(x=>Object.fromEntries", "v.anos=ANOS.map((_,i)=>f.anos[i]||{ibs:null,cbs:null}).map(x=>Object.fromEntries")
 .replace('num(r.ativo.ano,1950,2033,','num(r.ativo.ano,1950,2037,')
 .replace('Exercício fora de 2026–2033','Exercício fora de 2026–2037');
 // The original deterministic regression suite retains its historical 28% fixture.
 s=s.replace("const c=M.cfgInicial(db.uf),sp=", "const c=M.cfgInicial(db.uf);c.cbs=[.9,8.7,8.7,8.8,8.8,8.8,8.8,8.8,8.8,8.8,8.8,8.8];c.ibs=[.1,.1,.1,1.92,3.84,5.76,7.68,19.2,19.2,19.2,19.2,19.2];for(const [k,mode,value]of [['diesel','percentual',4.24],['gasolina','unitario',.60],['glp','unitario',0],['etanol','unitario',0],['biodiesel','percentual',4.24]]){c.combustiveis[k].federalModo=mode;c.combustiveis[k].federal=value;}const sp=")
 .replace('eq(M.ANOS.length,8)','eq(M.ANOS.length,12)').replace('eq(v.ibs[7],19.2)','eq(v.ibs[7],18.7)')
 .replace('M.remanescente(c,2034);','M.remanescente(c,2038);').replace('eq(s.length,8);','eq(s.length,12);').replace('Série de oito anos completa','Série de doze anos completa');
 return s;
}
function patch(source){
 // Cloud HTML contains an immutable original; patch only its named executable modules.
 if(/^\s*(?:<!doctype|<html)/i.test(source)){
  const begin=source.indexOf('/* ==== 21_bdi_core.js'),end=source.indexOf('/* ==== 22_ui_bdi.js');
  if(begin<0||end<=begin)throw Error('BDI module boundaries missing');
  source=source.slice(0,begin)+bdi(source.slice(begin,end))+source.slice(end);
  return extendYears(motor(source));
 }
 return extendYears(ui(bdi(motor(source))));
}
module.exports={patch,motor,bdi,extendYears,ui};
