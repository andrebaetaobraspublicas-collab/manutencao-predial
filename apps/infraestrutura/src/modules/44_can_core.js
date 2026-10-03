/* ==== 44_can_core.js — Canteiro de obras (SICRO, Manual de Custos) ==== */
/* Motor da calculadora "CanteiroSICRO" do usuário (regras, áreas de referência, fatores K1–K3,
 * RCT, instalações industriais, complementares e testes oficiais do caderno), integrado ao OrçaPro. */
(function (G) {
'use strict';
const OP=G.OP; const CN=(OP.can={});
const state={tests:[],testScore:0};
const APP_VERSION = "4.0.0";
const DB_NAME = "CanteiroSICRO_DB";
const DB_VERSION = 3;
const ROUNDING_CADERNO = "caderno";
const ROUNDING_PRECISION = "precision";

const AREA_ORDER = ["AE_ST","AI_V","ALR_C","AAL","ARES","AAMB","AAR","warehouse","cement","workshop","topography","guard"];
const VARIABLE_AREA_KEYS = ["AE_ST","AI_V","ALR_C","AAL","ARES","AAMB","AAR"];
const FIXED_AREA_KEYS = ["warehouse","cement","workshop","topography","guard"];

const NATURE_OPTIONS = [
  ["road_construction","Construção rodoviária"],
  ["road_restoration","Restauração rodoviária"],
  ["road_conservation","Conservação rodoviária"],
  ["oae_construction","Construção de Obra de Arte Especial (OAE)"],
  ["oae_recovery","Recuperação, reforço ou alargamento de OAE"],
  ["railway_construction","Construção ferroviária"],
  ["hydro","Obra hidroviária"],
  ["point","Intervenção pontual"],
  ["nonconventional","Obra não convencional"]
];

const COMPLEMENTARY_NATURE_OPTIONS = [
  ["oae_construction","Construção de OAE"],
  ["oae_recovery","Recuperação, reforço ou alargamento de OAE"],
  ["road_construction","Construção rodoviária"],
  ["road_restoration","Restauração rodoviária"],
  ["railway_construction","Construção ferroviária"]
];

const HYDRO_SERVICES = [
  ["underwater_rock","Derrocagem subaquática de material de 3ª categoria"],
  ["hopper","Dragagem com draga hopper"],
  ["suction","Dragagem com draga de sucção e recalque"],
  ["clamshell","Dragagem com pontão flutuante e clamshell"],
  ["breakwater","Execução de molhes"]
];

const SICRO_RULES = Object.freeze({
  edition: "Manual de Custos de Infraestrutura de Transportes — Volume 06 — Canteiro de Obras — 2ª edição (2025), com Errata 1",
  peakFactor: 1.33,
  classification: {
    road_construction:{unit:"km/ano",smallMax:15,mediumMax:30,label:"Construção rodoviária",source:"Tabela 4 e subseção 2.2.1"},
    road_restoration:{unit:"km/ano",smallMax:20,mediumMax:40,label:"Restauração rodoviária",source:"Tabela 4 e subseção 2.2.1"},
    oae_construction:{unit:"m/ano",smallMax:150,mediumMax:300,label:"Construção de OAE",source:"Tabela 5 e subseção 2.2.2"},
    oae_recovery:{unit:"m/ano",smallMax:200,mediumMax:400,label:"Recuperação, reforço ou alargamento de OAE",source:"Tabela 5 e subseção 2.2.2"},
    railway_construction:{unit:"km/ano",smallMax:15,mediumMax:30,label:"Construção ferroviária",source:"Tabela 6 e subseção 2.2.3"}
  },
  equations: {
    AE_ST:{n:1,label:"Escritório e seção técnica",expr:"AE-ST = 57,95 + 4,50 × NPF",source:"Equação 1 — subseção 3.1.1.1",feac:.70},
    AI_V:{n:2,label:"Instalações sanitárias e vestiário",expr:"AI-V = 0,77 × (NMO + NPV)",source:"Equação 2 — subseção 3.1.1.2",feac:.70},
    ALR_C:{n:3,label:"Local para refeição e cozinha",expr:"ALR-C = 1,55 × (50% × NMAX)",source:"Equação 3 — subseção 3.1.1.3",feac:.70},
    AAL:{n:4,label:"Alojamento",expr:"AAL = 3,11 × 50% × (NMO + NPV)",source:"Equação 4 — subseção 3.1.1.4",feac:.70},
    ARES:{n:5,label:"Residências",expr:"ARES = 8,46 × NPF-V",source:"Equação 5 — subseção 3.1.1.4",feac:.70},
    AAMB:{n:6,label:"Ambulatório",expr:"AAMB = 0,25 × NMAX",source:"Equação 6 — subseção 3.1.1.5",feac:.60},
    AAR:{n:7,label:"Área de recreação",expr:"AAR = 1,50 × (50% × NFA)",source:"Equação 7 — subseção 3.1.1.5",feac:.50}
  },
  referenceAreas: {
    road: {
      small:{warehouse:104.88,cement:93.45,workshop:215.14,topography:42.08,guard:6.10,rct:.3333},
      medium:{warehouse:152.66,cement:121.00,workshop:337.86,topography:42.08,guard:6.10,rct:.40},
      large:{warehouse:239.17,cement:196.71,workshop:612.55,topography:62.99,guard:9.11,rct:.45}
    },
    oae: {
      small:{warehouse:89.89,cement:172.38,workshop:18.10,topography:14.86,guard:6.10,rct:.35,mixedContainer:true},
      medium:{warehouse:125.76,cement:245.36,workshop:98.98,topography:40.63,guard:6.10,rct:.35},
      large:{warehouse:152.66,cement:344.76,workshop:179.41,topography:62.99,guard:9.11,rct:.35}
    }
  },
  referenceMeta: {
    warehouse:{label:"Almoxarifado",feac:.50,source:"Tabela 19 ou Tabela 23; FEAC da Tabela 33"},
    cement:{label:"Depósito de cimento",feac:.50,source:"Tabela 19 ou Tabela 23; FEAC da Tabela 33"},
    workshop:{label:"Oficina",feac:.50,source:"Tabela 19 ou Tabela 23; FEAC da Tabela 33"},
    topography:{label:"Topografia",feac:.60,source:"Tabela 19 ou Tabela 23; FEAC da Tabela 33"},
    guard:{label:"Guarita",feac:.70,source:"Tabela 19 ou Tabela 23; FEAC da Tabela 33"}
  },
  fead:.05,
  feat:{road_conservation:.03,point:.01},
  k1:{provisional:.80,permanent:1.00},
  k2:{roadSmallMedium:1.05,roadLarge:1.04,roadConservation:1.11,railway:1.05,oaeSmall:1.06,oaeMediumLarge:1.04,point:1.13},
  k3:{natural:.0014,primary:.0009,paved:.0008},
  kCI:.35,
  rct:{road_conservation:.50,point:.234},
  containerLifeMonths:120,
  containers: {
    M0041:{description:"Contêiner com 2 banheiros — L = 2,44 m e C = 6,09 m (1 TEU)",area:14.86,teu:"1 TEU",referenceCost:71842.5033333333,shownCost:71842.50,source:"Caderno de Aplicação, Tabela 17 — SP, jul/2023"},
    M0042:{description:"Contêiner com janela — L = 2,44 m e C = 6,09 m (1 TEU)",area:14.86,teu:"1 TEU",referenceCost:51110.094,shownCost:51110.09,source:"Caderno de Aplicação, Tabela 17 — SP, jul/2023"},
    M0057:{description:"Contêiner com janela — L = 4,88 m e C = 6,09 m (1 TEU duplo)",area:29.72,teu:"1 TEU duplo",referenceCost:101718.25,shownCost:101718.25,source:"Caderno de Aplicação, Tabela 17 — SP, jul/2023"},
    M0058:{description:"Contêiner com janela e 2 banheiros — L = 4,88 m e C = 6,09 m (1 TEU duplo)",area:29.72,teu:"1 TEU duplo",referenceCost:106186.80,shownCost:106186.80,source:"Caderno de Aplicação, Tabela 17 — SP, jul/2023"},
    M0059:{description:"Contêiner com revestimento térmico, janela e banheiro — L = 2,44 m e C = 6,09 m (1 TEU)",area:14.86,teu:"1 TEU",referenceCost:69624.718,shownCost:69624.72,source:"Caderno de Aplicação, Tabela 17 — SP, jul/2023"},
    M0066:{description:"Contêiner com revestimento térmico, janela e banheiro — L = 2,44 m e C = 12,19 m (2 TEU)",area:29.74,teu:"2 TEU",referenceCost:null,shownCost:null,source:"Tabela 21 do Volume 06; preço não informado nos arquivos fornecidos"},
    M0071:{description:"Contêiner com 3 janelas para guarita — L = 2,44 m e C = 3,05 m (1/2 TEU)",area:7.44,teu:"1/2 TEU",referenceCost:29513.21,shownCost:29513.21,source:"Caderno de Aplicação, Tabela 17 — SP, jul/2023"}
  },
  conservationInstallations: [
    {id:"office",label:"Escritório e seção técnica",code:"M0066",qty:1,source:"Tabela 21"},
    {id:"meal",label:"Local para refeição",code:"M0057",qty:1,source:"Tabela 21"},
    {id:"kitchen",label:"Cozinha",code:"M0058",qty:1,source:"Tabela 21"},
    {id:"lodging",label:"Alojamentos",code:"M0059",qty:3,source:"Tabela 21"},
    {id:"sanitary",label:"Instalações sanitárias e vestiário",code:"M0041",qty:1,source:"Tabela 21"},
    {id:"residence",label:"Residências",code:"M0059",qty:1,source:"Tabela 21"},
    {id:"ambulatory",label:"Ambulatório",code:"M0066",qty:1,source:"Tabela 21"},
    {id:"warehouse",label:"Almoxarifado",code:"M0057",qty:1,source:"Tabela 21"},
    {id:"cement",label:"Depósito de cimento",code:"M0057",qty:1,source:"Tabela 21"},
    {id:"workshop1",label:"Oficina — contêineres com janela",code:"M0042",qty:2,source:"Tabela 21"},
    {id:"workshop2",label:"Oficina — contêiner térmico com banheiro",code:"M0059",qty:1,source:"Tabela 21"},
    {id:"guard",label:"Guarita",code:"M0071",qty:1,source:"Tabela 21"}
  ],
  pointInstallations: [
    {id:"office",label:"Escritório",code:"M0059",capacity:"2 pessoas",source:"Tabela 28"},
    {id:"technical",label:"Seção técnica",code:"M0059",capacity:"3 pessoas",source:"Tabela 28"},
    {id:"meal",label:"Local para refeição",code:"M0057",capacity:"48 pessoas",source:"Tabela 28"},
    {id:"kitchen",label:"Cozinha",code:"M0058",capacity:"1 pessoa",source:"Tabela 28"},
    {id:"lodging",label:"Alojamento",code:"M0059",capacity:"6 pessoas",source:"Tabela 28"},
    {id:"sanitary",label:"Instalações sanitárias e vestiário",code:"M0041",capacity:"20 pessoas",source:"Tabela 28"},
    {id:"residence",label:"Residências",code:"M0059",capacity:"3 pessoas",source:"Tabela 28"},
    {id:"ambulatory",label:"Ambulatório",code:"M0059",capacity:"área de 14,86 m²",source:"Tabela 28 e Equação 6"},
    {id:"guard",label:"Guarita",code:"M0071",capacity:"1 pessoa",source:"Tabela 28"},
    {id:"warehouse",label:"Almoxarifado",code:"M0042",capacity:"definição do orçamentista",source:"Tabela 28"},
    {id:"cement",label:"Depósito de cimento",code:"M0042",capacity:"240 sacos",source:"Tabela 28"},
    {id:"workshop",label:"Oficina",code:"M0042",capacity:"3 pessoas",source:"Tabela 28"},
    {id:"laboratory",label:"Laboratórios",code:"M0042",capacity:"3 pessoas por contêiner",source:"Tabela 28"}
  ],
  pointTemplates: {
    official:{label:"Exemplo oficial do Caderno",quantities:{office:1,technical:2,meal:1,kitchen:1,lodging:0,sanitary:3,residence:0,ambulatory:2,guard:1,warehouse:1,cement:1,workshop:1,laboratory:2}},
    module1:{label:"Módulo demonstrativo 1",at:586.86,containerArea:126.32,quantities:{office:1,technical:0,meal:1,kitchen:1,lodging:0,sanitary:1,residence:0,ambulatory:1,guard:1,warehouse:1,cement:0,workshop:0,laboratory:0}},
    module2:{label:"Módulo demonstrativo 2",at:692.28,containerArea:185.76,quantities:{office:1,technical:1,meal:1,kitchen:1,lodging:1,sanitary:1,residence:1,ambulatory:1,guard:1,warehouse:1,cement:0,workshop:0,laboratory:1}},
    module3:{label:"Módulo demonstrativo 3",at:825.87,containerArea:215.48,quantities:{office:1,technical:1,meal:1,kitchen:1,lodging:1,sanitary:1,residence:1,ambulatory:1,guard:1,warehouse:1,cement:1,workshop:1,laboratory:1}}
  },
  industrialTypes: {
    I:{label:"Tipo I — Central de concreto 30 m³/h",capacity:"30 m³/h",composition:"0903804",compositionLabel:"Instalação da central de concreto com capacidade de 30 m³/h",totalArea:3200,mode:"container",areas:[
      {id:"laboratory",label:"Laboratório",area:14.86,feac:.60,container:"M0042",qty:1},
      {id:"mealVest",label:"Local para refeição e vestiário",area:14.86,feac:.70,container:"M0059",qty:1},
      {id:"guard",label:"Guarita",area:7.44,feac:.70,container:"M0071",qty:1},
      {id:"cement",label:"Depósito de cimento",area:89.16,feac:.50,container:"M0057",qty:3}
    ]},
    II:{label:"Tipo II — Central de concreto 40 m³/h",capacity:"40 m³/h",composition:"0903805",compositionLabel:"Instalação da central de concreto com capacidade de 40 m³/h",totalArea:3000,mode:"container",areas:[
      {id:"laboratory",label:"Laboratório",area:14.86,feac:.60,container:"M0042",qty:1},
      {id:"mealVest",label:"Local para refeição e vestiário",area:14.86,feac:.70,container:"M0059",qty:1},
      {id:"guard",label:"Guarita",area:7.44,feac:.70,container:"M0071",qty:1}
    ]},
    III:{label:"Tipo III — Central de concreto 150 m³/h",capacity:"150 m³/h",composition:"0903806",compositionLabel:"Instalação da central de concreto com capacidade de 150 m³/h",totalArea:6598.40,mode:"mixed",areas:[
      {id:"office",label:"Escritório",area:9.11,feac:.70},
      {id:"laboratory",label:"Laboratório",area:94.36,feac:.60},
      {id:"warehouse",label:"Almoxarifado",area:41.68,feac:.50},
      {id:"mealVest",label:"Local para refeição e vestiário",area:69.38,feac:.70},
      {id:"guard",label:"Guarita",area:7.44,feac:.70,container:"M0071",qty:1},
      {id:"workshop",label:"Oficina",area:18.10,feac:.50}
    ]},
    IV:{label:"Tipo IV — Central de britagem 80 m³/h",capacity:"80 m³/h",composition:"0903807",compositionLabel:"Instalação da central de britagem com capacidade de 80 m³/h",totalArea:4260,mode:"container",areas:[
      {id:"officeVest",label:"Escritório e vestiário",area:14.86,feac:.70,container:"M0059",qty:1}
    ]},
    V:{label:"Tipo V — Usina misturadora de solos 300 t/h",capacity:"300 t/h",composition:"0903808",compositionLabel:"Instalação da usina misturadora de solos com capacidade de 300 t/h",totalArea:5610,mode:"container",areas:[
      {id:"laboratory",label:"Laboratório",area:14.86,feac:.60,container:"M0042",qty:1},
      {id:"mealVest",label:"Local para refeição e vestiário",area:14.86,feac:.70,container:"M0059",qty:1},
      {id:"guard",label:"Guarita",area:7.44,feac:.70,container:"M0071",qty:1}
    ]},
    VI:{label:"Tipo VI — Usina de pré-misturado a frio 60 t/h",capacity:"60 t/h",composition:"0903809",compositionLabel:"Instalação da usina de pré-misturado a frio com capacidade de 60 t/h",totalArea:2940,mode:"container",areas:[
      {id:"laboratory",label:"Laboratório",area:14.86,feac:.60,container:"M0042",qty:1},
      {id:"mealVest",label:"Local para refeição e vestiário",area:14.86,feac:.70,container:"M0059",qty:1},
      {id:"guard",label:"Guarita",area:7.44,feac:.70,container:"M0071",qty:1}
    ]},
    VII:{label:"Tipo VII — Usina de asfalto a quente 120 t/h",capacity:"120 t/h",composition:"0903810",compositionLabel:"Instalação da usina de asfalto a quente com capacidade de 120 t/h",totalArea:6592,mode:"mixed",areas:[
      {id:"office",label:"Escritório",area:9.11,feac:.70},
      {id:"laboratory",label:"Laboratórios",area:94.36,feac:.60},
      {id:"warehouse",label:"Almoxarifado",area:41.68,feac:.50},
      {id:"mealVest",label:"Local para refeição e vestiário",area:69.38,feac:.70},
      {id:"guard",label:"Guarita",area:7.44,feac:.70,container:"M0071",qty:1},
      {id:"workshop",label:"Oficina",area:18.10,feac:.50}
    ]}
  },

  railway: {
    wagons: {
      closed:{label:"Vagão fechado (bitola larga)",height:3.00,width:2.60,length:14.90,usefulArea:40.00,unit:"un",source:"Tabela 25"},
      tank:{label:"Vagão tanque (bitola larga)",height:2.30,width:1.20,length:9.20,usefulVolume:32.20,unit:"un",source:"Tabela 25"},
      gondola:{label:"Vagão gôndola (bitola larga)",height:.80,width:2.40,length:12.00,usefulArea:30.00,unit:"un",source:"Tabela 25"}
    },
    installations: [
      {id:"office",label:"Escritórios em vagões fechados",asset:"closed",qty:{small:1,medium:2,large:3}},
      {id:"technical",label:"Seção técnica em vagões fechados",asset:"closed",qty:{small:1,medium:2,large:3}},
      {id:"warehouse",label:"Almoxarifado em vagões fechados",asset:"closed",qty:{small:1,medium:2,large:3}},
      {id:"meal",label:"Local para refeição e cozinha em vagões fechados",asset:"closed",qty:{small:2,medium:3,large:4}},
      {id:"lodging",label:"Alojamentos em vagões fechados",asset:"closed",qty:{small:3,medium:4,large:5}},
      {id:"sanitary",label:"Instalações sanitárias e vestiário em vagões fechados",asset:"closed",qty:{small:2,medium:3,large:4}},
      {id:"workshop",label:"Oficinas em vagões fechados",asset:"closed",qty:{small:2,medium:3,large:4}},
      {id:"ambulatory",label:"Ambulatório em vagão fechado",asset:"closed",qty:{small:1,medium:2,large:3}},
      {id:"recreation",label:"Área de recreação em vagão fechado",asset:"closed",qty:{small:1,medium:2,large:3}},
      {id:"fuel",label:"Armazenamento de combustível em vagão tanque (32,20 m³)",asset:"tank",qty:{small:1,medium:1,large:1}},
      {id:"air",label:"Central de ar comprimido em vagão gôndola",asset:"gondola",qty:{small:1,medium:1,large:1}},
      {id:"water",label:"Contentores para água potável em vagão gôndola (30.000 l)",asset:"gondola",qty:{small:1,medium:1,large:1}}
    ],
    additional: [
      {id:"separator",label:"Sistema separador de água e óleo",unit:"un",qty:{small:1,medium:1,large:1},priceKey:"separator"},
      {id:"guard",label:"Guarita em contêiner",unit:"un",qty:{small:1,medium:1,large:1},container:"M0071",priceKey:"guard"},
      {id:"amv",label:"AMV 1:14 — TR 57",unit:"un",qty:{small:1,medium:1,large:1},priceKey:"amv"},
      {id:"railGrade",label:"Grade de trilhos TR 57",unit:"km",qty:{small:.25,medium:.40,large:.55},priceKey:"railGrade"},
      {id:"parking",label:"Estacionamento para veículos leves",unit:"m²",qty:{small:80,medium:150,large:200},priceKey:"parking"},
      {id:"deviation",label:"Comprimento do desvio",unit:"m",qty:{small:250,medium:400,large:550},priceKey:"deviation"}
    ],
    source:"Tabelas 25, 26 e 27; subseção 3.1.2.3"
  },
  itinerantDevices: [
    {id:"thermos5",description:"Garrafa térmica — capacidade de 5 l",qty:1,unit:"un"},
    {id:"thermos12",description:"Garrafa térmica tipo botijão — capacidade de 12 l",qty:2,unit:"un"},
    {id:"tent",description:"Tenda sanfonada em PVC reforçado com poliéster — 3,00 × 3,00 m",qty:1,unit:"un"},
    {id:"table",description:"Mesa em madeira com 2 bancos fixos para 6 pessoas",qty:2,unit:"un"},
    {id:"washbasin",description:"Lavatório portátil com reservatório de 100 l",qty:1,unit:"un"},
    {id:"toilet",description:"Banheiro químico de 200 l, inclusive 4 manutenções mensais",qty:1,unit:"un"}
  ],
  hydroSupportCompositions: [
    {code:"3816190",description:"Apoio náutico com capacidade de 150 t",unit:"mês",source:"Tabela 46"},
    {code:"3816192",description:"Apoio náutico com capacidade de 200 t",unit:"mês",source:"Tabela 46"},
    {code:"3816193",description:"Apoio náutico com capacidade de 600 t",unit:"mês",source:"Tabela 46"},
    {code:"3816191",description:"Apoio náutico para pessoal e apoio logístico",unit:"mês",source:"Tabela 47"}
  ],
  sources:{
    feac:"Tabela 33 e Equação 11",fead:"Subseção 3.2.2 — FEAD = 5,00%",feat:"Subseção 3.2.3",k1:"Tabela 34",k2:"Tabela 35",k3:"Tabela 36",
    fixedCost:"Equação 15",conservationCost:"Equação 16",pointCost:"Equação 17, conforme Errata 1",industrialCost:"Equações 13 e 14",itinerantCost:"Equação 12",railway:"Tabelas 25 a 27 e Apêndice A",hydro:"Subseções 3.1.2.4 e 3.5",tomos:"Volume 06 — Tomos 1 e 2"
  }
});


/* ---------- utilidades ---------- */
function uid(){if(globalThis.crypto&&typeof crypto.randomUUID==="function")return crypto.randomUUID();return "p_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);}
function deepClone(obj){return JSON.parse(JSON.stringify(obj));}
function round2(n){const x=Number(n);if(!Number.isFinite(x))return 0;return Math.sign(x)*Math.round((Math.abs(x)+1e-9)*100)/100;}
function roundBy(n,mode){return mode===ROUNDING_CADERNO?round2(n):Number(n)||0;}
function num(n,dec=2){const v=Number(n);if(!Number.isFinite(v))return "—";return new Intl.NumberFormat("pt-BR",{minimumFractionDigits:dec,maximumFractionDigits:dec}).format(v);}
function money(n){const v=Number(n);if(!Number.isFinite(v))return "—";return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2,maximumFractionDigits:2}).format(v);}
function pct(n,dec=2){return num(Number(n)*100,dec)+"%";}
function esc(s){return String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));}
function clamp(n,min,max){return Math.min(max,Math.max(min,n));}
function isFiniteNumber(v){return v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));}
function getPath(obj,path){return path.split(".").reduce((a,k)=>a==null?undefined:a[k],obj);}
function setPath(obj,path,value){const keys=path.split(".");let cur=obj;keys.slice(0,-1).forEach(k=>{if(cur[k]===undefined||cur[k]===null||typeof cur[k]!=="object")cur[k]={};cur=cur[k];});cur[keys[keys.length-1]]=value;}
function download(name,text,type="application/json"){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function dateTime(ts){if(!ts)return "—";try{return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(ts));}catch{return "—";}}
function natureLabel(key){return (NATURE_OPTIONS.find(x=>x[0]===key)||[key,key])[1];}
function pavementLabel(key){return ({natural:"Leito natural",primary:"Revestimento primário",paved:"Rodovia pavimentada"})[key]||key;}
function patternLabel(key){return key==="permanent"?"Permanente":"Provisório";}
function porteLabel(key){return ({small:"Pequeno porte",medium:"Médio porte",large:"Grande porte",unique:"Porte único",none:"Sem classificação de porte"})[key]||"Não classificado";}
function containerDef(code){return SICRO_RULES.containers[code]||null;}
function industrialDef(type){return SICRO_RULES.industrialTypes[type]||null;}
function sourceCostLabel(def){return def?.shownCost==null?"não disponível":money(def.shownCost);}
function sanitizeName(s){return String(s||"projeto").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,70)||"projeto";}

function defaultContainerPrices(){const out={};Object.entries(SICRO_RULES.containers).forEach(([k,v])=>out[k]=v.referenceCost);return out;}
function defaultAreaSetting(key,template="integral"){
  if(VARIABLE_AREA_KEYS.includes(key))return {mode:"suppress",percent:0,manual:null,justification:"Área variável considerada no dimensionamento do canteiro principal; revisar conforme o caso concreto."};
  if(template==="demo50"&&key!=="guard")return {mode:"percent",percent:50,manual:null,justification:"Percentual demonstrativo do Caderno de Aplicação; revisar conforme o caso concreto."};
  return {mode:"full",percent:100,manual:null,justification:""};
}
function newComplementary(template="integral"){
  const settings={};AREA_ORDER.forEach(k=>settings[k]=defaultAreaSetting(k,template));
  return {id:uid(),enabled:true,name:"OAE complementar",nature:"oae_construction",extension:0,months:12,constructionPattern:"inherit",supplierDistance:null,pavement:"inherit",cmcc:null,areaSettings:settings,factorOverrides:{k1:null,k2:null,k3:null,rct:null},factorJustifications:{k1:"",k2:"",k3:"",rct:""}};
}
function newIndustrial(type="IV"){return {id:uid(),enabled:true,type,quantity:1,durationMonths:null,cdi:0,cdiSource:"",areaOverrides:{},areaJustifications:{},containerOverrides:{},containerJustifications:{}};}

function defaultRailwayPrices(){return {closed:null,tank:null,gondola:null,separator:null,amv:null,railGrade:null,parking:null,deviation:null};}
function defaultHydroRows(){return SICRO_RULES.hydroSupportCompositions.map((r,i)=>({id:"hydro_"+r.code,enabled:true,code:r.code,description:r.description,unit:r.unit,quantity:0,unitPrice:null,source:r.source}));}
function newHydroCustomItem(){return {id:uid(),enabled:true,code:"",description:"Novo item hidroviário",unit:"un",quantity:1,unitPrice:null,source:"Definição do projeto"};}
function tomoService(data={}){return {id:data.id||uid(),enabled:data.enabled!==false,code:data.code||"",description:data.description||"Novo serviço",unit:data.unit||"un",quantity:isFiniteNumber(data.quantity)?Number(data.quantity):0,unitPrice:isFiniteNumber(data.unitPrice)?Number(data.unitPrice):null,source:data.source||"",linkedContainer:data.linkedContainer||null};}
function defaultTomoTemplates(){
  const rail=SICRO_RULES.railway.installations.map(r=>tomoService({id:"svc_rail_"+r.id,description:r.label,unit:"un",quantity:r.qty.medium,source:"Tabela 26"})).concat(SICRO_RULES.railway.additional.map(r=>tomoService({id:"svc_rail_"+r.id,description:r.label,unit:r.unit,quantity:r.qty.medium,source:"Tabela 27",code:r.container||"",linkedContainer:r.container||null})));
  const itinerant=SICRO_RULES.itinerantDevices.map(r=>tomoService({id:"svc_it_"+r.id,description:r.description,unit:r.unit,quantity:r.qty,source:"Tabela 37"}));
  const industrial=(type)=>{const d=SICRO_RULES.industrialTypes[type];const services=[tomoService({id:`svc_${type}_comp`,code:d.composition,description:d.compositionLabel,unit:"un",quantity:1,source:"Tabela 40"})];d.areas.filter(a=>a.container).forEach(a=>services.push(tomoService({id:`svc_${type}_${a.id}`,code:a.container,description:a.label+" — "+containerDef(a.container).description,unit:"un",quantity:a.qty,source:"Tabela 39",linkedContainer:a.container})));return services;};
  const hydro=SICRO_RULES.hydroSupportCompositions.map(r=>tomoService({id:"svc_h_"+r.code,code:r.code,description:r.description,unit:r.unit,quantity:0,source:r.source}));
  return [
    {id:"tpl_rail_medium",name:"Canteiro ferroviário móvel — médio porte",category:"Ferroviário",source:"Volume 06 — Tabelas 25 a 27",reference:"Subseção 3.1.2.3",notes:"Configuração física de referência. Preços e vida útil dos vagões devem ser informados pelo orçamentista.",schematic:"railway",builtIn:true,assetIds:[],budgetTreatment:"comparison",includeJustification:"",services:rail},
    {id:"tpl_itinerant",name:"Canteiro itinerante de referência",category:"Canteiro itinerante",source:"Volume 06 — Tabela 37",reference:"Subseções 3.2.7 e 3.3",notes:"Dispositivos físicos do canteiro itinerante. O custo metodológico é calculado pela Equação 12.",schematic:"itinerant",builtIn:true,assetIds:[],budgetTreatment:"comparison",includeJustification:"",services:itinerant},
    {id:"tpl_ind_IV",name:"Central de britagem — 80 m³/h",category:"Instalação industrial",source:"Volume 06 — Tabelas 38 a 40",reference:"Tipo IV / composição 0903807",notes:"Catálogo parcial baseado no Volume 06 e no Caderno de Aplicação; os quantitativos completos do Tomo 2 não foram anexados.",schematic:"industrial",builtIn:true,assetIds:[],budgetTreatment:"comparison",includeJustification:"",services:industrial("IV")},
    {id:"tpl_ind_V",name:"Usina misturadora de solos — 300 t/h",category:"Instalação industrial",source:"Volume 06 — Tabelas 38 a 40",reference:"Tipo V / composição 0903808",notes:"Catálogo parcial; importar os serviços e quantidades do Tomo 2 para detalhamento integral.",schematic:"industrial",builtIn:true,assetIds:[],budgetTreatment:"comparison",includeJustification:"",services:industrial("V")},
    {id:"tpl_ind_VII",name:"Usina de asfalto a quente — 120 t/h",category:"Instalação industrial",source:"Volume 06 — Tabelas 38 a 40",reference:"Tipo VII / composição 0903810",notes:"Catálogo parcial; as áreas in loco são tratadas pelo módulo metodológico e não foram convertidas em serviços sem o Tomo 2.",schematic:"industrial",builtIn:true,assetIds:[],budgetTreatment:"comparison",includeJustification:"",services:industrial("VII")},
    {id:"tpl_hydro",name:"Apoio náutico — composições de referência",category:"Hidroviário",source:"Volume 06 — Tabelas 46 e 47",reference:"Subseção 3.5",notes:"Selecione capacidade, prazo e preços compatíveis com o projeto específico.",schematic:"hydro",builtIn:true,assetIds:[],budgetTreatment:"comparison",includeJustification:"",services:hydro}
  ];
}
function newTomoTemplate(){return {id:uid(),name:"Novo projeto-tipo",category:"Personalizado",source:"Definição do usuário",reference:"",notes:"",schematic:"custom",builtIn:false,assetIds:[],budgetTreatment:"comparison",includeJustification:"",services:[]};}

function blankProject(){
  const now=Date.now(),templates=defaultTomoTemplates();
  return {
    id:uid(),name:"Novo projeto de canteiro",createdAt:now,updatedAt:now,version:APP_VERSION,
    meta:{agency:"",contract:"",responsible:"",uf:"",municipality:"",baseMonth:"",workCost:0,notes:""},
    work:{nature:"road_construction",extension:0,durationMode:"direct",campMonths:12,campStart:1,campEnd:12,contractMonths:12,constructionPattern:"provisional",supplierDistance:50,pavement:"paved",distanceJustification:"",cmcc:0,roundingMode:ROUNDING_CADERNO,hydroService:"hopper",pointType:"restricted",railGauge:"metric",conservationLaneKm:200},
    labor:{method:"average",ordinaryAverage:0,fixed:0,linked:0,variableAverage:0,ordinaryPeak:0,variablePeak:0,nfaMode:"automatic",nfaManual:0,histogram:[]},
    overrides:{areas:{},factors:{k1:null,k2:null,k3:null,rct:null},factorJustifications:{k1:"",k2:"",k3:"",rct:""}},
    complementaries:[],
    mobile:{pointTemplate:"auto",pointIncludeLodging:false,pointIncludeResidence:false,pointDiscretionary:{warehouse:0,cement:0,workshop:0,laboratory:0},pointOverrides:{},pointJustifications:{},conservationOverrides:{},conservationJustifications:{}},
    containerLibrary:{lifeMonths:SICRO_RULES.containerLifeMonths,prices:defaultContainerPrices(),justifications:{}},
    industrials:[],
    railway:{mode:"mobile",wagonLifeMonths:null,totalTerrainArea:null,feat:null,quantityOverrides:{},quantityJustifications:{},assetPrices:defaultRailwayPrices(),priceSources:{},terrainJustification:"",fixedJustification:""},
    itinerant:{enabled:false,teamCount:1,months:null,efsOverride:null,kciOverride:null,distanceToFront:150,nearbyFacilities:false,justification:""},
    hydro:{confirmed:false,facilityMode:"containers",supportRows:defaultHydroRows(),customItems:[],facilityCost:0,facilitySource:"",signallingCost:0,signallingSource:"",mobilizationCost:0,mobilizationSource:"",notes:""},
    tomoLibrary:{selectedId:templates[0]?.id||null,templates},
    auditLog:[{id:uid(),ts:now,category:"Projeto",action:"Projeto criado",detail:"Estrutura inicial criada na versão "+APP_VERSION}],
    flags:{officialExample:false,officialPointExample:false}
  };
}

function officialProject(){
  const p=blankProject();
  p.id="official_road_full_example";
  p.name="Exemplo oficial completo — Construção rodoviária";
  p.meta={agency:"DNIT — exemplo fictício",contract:"Contratação integrada",responsible:"Demonstração interna",uf:"SP",municipality:"Município fictício",baseMonth:"2023-07",workCost:100000000,notes:"Reprodução integral do exemplo de construção rodoviária do Caderno de Aplicação: canteiro principal, OAE complementar e três instalações industriais."};
  p.work={nature:"road_construction",extension:50,durationMode:"range",campMonths:24,campStart:7,campEnd:30,contractMonths:30,constructionPattern:"provisional",supplierDistance:30,pavement:"natural",distanceJustification:"Distância adotada no exemplo oficial do Caderno de Aplicação.",cmcc:1939.08,roundingMode:ROUNDING_CADERNO,hydroService:"hopper",pointType:"restricted",railGauge:"metric",conservationLaneKm:200};
  p.labor={method:"average",ordinaryAverage:189,fixed:32,linked:15,variableAverage:27,ordinaryPeak:0,variablePeak:0,nfaMode:"automatic",nfaManual:0,histogram:[]};
  const comp=newComplementary("demo50");comp.id="official_oae_comp";comp.name="OAE complementar — 180 m";comp.nature="oae_construction";comp.extension=180;comp.months=10;p.complementaries=[comp];
  const i1=newIndustrial("IV");i1.id="official_ind_iv";i1.cdi=101869.29;i1.cdiSource="Caderno de Aplicação — SP, jul/2023";
  const i2=newIndustrial("V");i2.id="official_ind_v";i2.cdi=106343.04;i2.cdiSource="Caderno de Aplicação — SP, jul/2023";
  const i3=newIndustrial("VII");i3.id="official_ind_vii";i3.cdi=184734.34;i3.cdiSource="Caderno de Aplicação — SP, jul/2023";
  p.industrials=[i1,i2,i3];p.flags.officialExample=true;return p;
}

function officialPointProject(){
  const p=blankProject();p.id="official_point_example";p.name="Exemplo oficial — Intervenção pontual contínua";
  p.meta={agency:"DNIT — exemplo fictício",contract:"Pregão eletrônico",responsible:"Demonstração interna",uf:"SP",municipality:"Município fictício",baseMonth:"2023-07",workCost:0,notes:"Reprodução do exemplo oficial de intervenção pontual contínua do Caderno de Aplicação."};
  p.work={nature:"point",extension:3,durationMode:"direct",campMonths:13,campStart:1,campEnd:13,contractMonths:13,constructionPattern:"provisional",supplierDistance:0,pavement:"paved",distanceJustification:"",cmcc:1939.08,roundingMode:ROUNDING_CADERNO,hydroService:"hopper",pointType:"continuous",railGauge:"metric",conservationLaneKm:200};
  p.labor={method:"average",ordinaryAverage:42,fixed:3.25,linked:4,variableAverage:2,ordinaryPeak:0,variablePeak:0,nfaMode:"manual",nfaManual:0,histogram:[]};
  p.mobile.pointTemplate="official";p.flags.officialPointExample=true;return p;
}

/* ---------- IndexedDB com fallback ---------- */
function normalizeHydroRow(r){return {...tomoService(r),id:r?.id||uid(),code:r?.code||"",description:r?.description||"Item hidroviário",unit:r?.unit||"un"};}
function normalizeTomoService(s){return tomoService(s||{});}
function normalizeTomoTemplate(t){const b=newTomoTemplate();return {...b,...t,assetIds:Array.isArray(t?.assetIds)?t.assetIds:[],services:Array.isArray(t?.services)?t.services.map(normalizeTomoService):[]};}
function normalizeAreaSettings(settings,template="integral"){const out={};AREA_ORDER.forEach(k=>out[k]={...defaultAreaSetting(k,template),...(settings?.[k]||{})});return out;}
function normalizeComplementary(c){const base=newComplementary();return {...base,...c,areaSettings:normalizeAreaSettings(c?.areaSettings),factorOverrides:{...base.factorOverrides,...(c?.factorOverrides||{})},factorJustifications:{...base.factorJustifications,...(c?.factorJustifications||{})}};}
function normalizeIndustrial(i){const base=newIndustrial(i?.type||"IV");return {...base,...i,areaOverrides:{...(i?.areaOverrides||{})},areaJustifications:{...(i?.areaJustifications||{})},containerOverrides:{...(i?.containerOverrides||{})},containerJustifications:{...(i?.containerJustifications||{})}};}
function normalizeProject(p){
  const base=blankProject();
  const merged={...base,...p,meta:{...base.meta,...(p?.meta||{})},work:{...base.work,...(p?.work||{})},labor:{...base.labor,...(p?.labor||{})},overrides:{...base.overrides,...(p?.overrides||{}),areas:{...(p?.overrides?.areas||{})},factors:{...base.overrides.factors,...(p?.overrides?.factors||{})},factorJustifications:{...base.overrides.factorJustifications,...(p?.overrides?.factorJustifications||{})}},mobile:{...base.mobile,...(p?.mobile||{}),pointDiscretionary:{...base.mobile.pointDiscretionary,...(p?.mobile?.pointDiscretionary||{})},pointOverrides:{...(p?.mobile?.pointOverrides||{})},pointJustifications:{...(p?.mobile?.pointJustifications||{})},conservationOverrides:{...(p?.mobile?.conservationOverrides||{})},conservationJustifications:{...(p?.mobile?.conservationJustifications||{})}},containerLibrary:{...base.containerLibrary,...(p?.containerLibrary||{}),prices:{...base.containerLibrary.prices,...(p?.containerLibrary?.prices||{})},justifications:{...(p?.containerLibrary?.justifications||{})}},railway:{...base.railway,...(p?.railway||{}),quantityOverrides:{...(p?.railway?.quantityOverrides||{})},quantityJustifications:{...(p?.railway?.quantityJustifications||{})},assetPrices:{...base.railway.assetPrices,...(p?.railway?.assetPrices||{})},priceSources:{...(p?.railway?.priceSources||{})}},itinerant:{...base.itinerant,...(p?.itinerant||{})},hydro:{...base.hydro,...(p?.hydro||{})},flags:{...base.flags,...(p?.flags||{})}};
  if(!Array.isArray(merged.labor.histogram))merged.labor.histogram=[];
  merged.complementaries=Array.isArray(p?.complementaries)?p.complementaries.map(normalizeComplementary):[];
  if(!merged.complementaries.length&&p?.work?.hasComplementaryOAE){const c=newComplementary("demo50");c.nature=p.work.complementaryType||"oae_construction";c.extension=Number(p.work.complementaryLength)||0;c.months=Number(p.work.complementaryMonths)||12;merged.complementaries=[c];}
  merged.industrials=Array.isArray(p?.industrials)?p.industrials.map(normalizeIndustrial):[];
  merged.hydro.supportRows=Array.isArray(p?.hydro?.supportRows)?p.hydro.supportRows.map(normalizeHydroRow):defaultHydroRows();
  merged.hydro.customItems=Array.isArray(p?.hydro?.customItems)?p.hydro.customItems.map(normalizeHydroRow):[];
  const lib=p?.tomoLibrary?{...base.tomoLibrary,...p.tomoLibrary}:base.tomoLibrary;
  lib.templates=Array.isArray(p?.tomoLibrary?.templates)?p.tomoLibrary.templates.map(normalizeTomoTemplate):defaultTomoTemplates();
  if(!lib.templates.some(t=>t.id===lib.selectedId))lib.selectedId=lib.templates[0]?.id||null;
  merged.tomoLibrary=lib;
  if(!Array.isArray(merged.auditLog))merged.auditLog=[];
  return merged;
}

/* ---------- motor metodológico ---------- */
function effectiveMonths(p){const w=p.work;if(w.durationMode==="range"){const a=Number(w.campStart),b=Number(w.campEnd);return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?b-a+1:0;}return Math.max(0,Number(w.campMonths)||0);}
function classifyNature(nature,extension,months,pointType="restricted"){
  const m=Number(months),ext=Number(extension);
  if(nature==="road_conservation")return {porte:"unique",productivity:null,unit:"",source:"Subseção 2.2.1 — conservação rodoviária de porte único",supported:true};
  if(nature==="hydro")return {porte:"none",productivity:null,unit:"",source:"Subseção 2.2.4 — classificação por tipo de serviço, sem porte padronizado",supported:false};
  if(nature==="point"){const productivity=m>0?ext/(m/12):null;const valid=pointType!=="continuous"||productivity===null||productivity<=5;return {porte:"unique",productivity,unit:"km/ano",source:"Tabela 7 e subseção 2.2.5",supported:true,validPoint:valid};}
  if(nature==="nonconventional")return {porte:"none",productivity:null,unit:"",source:"Subseção 2.2.6 — análise específica do orçamentista",supported:false};
  const rule=SICRO_RULES.classification[nature];if(!rule||!m||m<=0||!Number.isFinite(ext))return {porte:null,productivity:null,unit:rule?.unit||"",source:rule?.source||"",supported:false};
  const productivity=ext/(m/12);const porte=productivity<=rule.smallMax?"small":productivity<=rule.mediumMax?"medium":"large";return {porte,productivity,unit:rule.unit,source:rule.source,supported:true};
}
function calcLabor(p,nature){
  const l=p.labor;let nmo=0,npv=0,methodNote="";
  if(l.method==="average"){nmo=Math.ceil((Number(l.ordinaryAverage)||0)*SICRO_RULES.peakFactor);npv=Math.ceil((Number(l.variableAverage)||0)*SICRO_RULES.peakFactor);methodNote="Estimativa pela média mensal com fator 1,33 e arredondamento para cima, conforme o Caderno de Aplicação.";}
  else if(l.method==="peak"){nmo=Number(l.ordinaryPeak)||0;npv=Number(l.variablePeak)||0;methodNote="Valores de pico informados diretamente pelo usuário.";}
  else{const rows=Array.isArray(l.histogram)?l.histogram:[];nmo=rows.reduce((m,r)=>Math.max(m,Number(r.ordinary)||0),0);npv=rows.reduce((m,r)=>Math.max(m,Number(r.variable)||0),0);methodNote="Máximos identificados no histograma mensal informado.";}
  const npf=Number(l.fixed)||0,linked=Number(l.linked)||0,npfv=npf+linked;
  const autoNfa=nature==="hydro"?Math.ceil(nmo+npv+npfv):Math.ceil(.5*(nmo+npv)+npfv);
  const nfa=l.nfaMode==="manual"?(Number(l.nfaManual)||0):autoNfa;const nmax=Math.ceil(npfv+npv+nmo);
  return {npf,linked,nmo,npv,npfv,nfa,nmax,autoNfa,methodNote};
}
function autoK2(nature,porte){if(nature==="road_construction"||nature==="road_restoration")return porte==="large"?SICRO_RULES.k2.roadLarge:SICRO_RULES.k2.roadSmallMedium;if(nature==="road_conservation")return SICRO_RULES.k2.roadConservation;if(nature==="railway_construction")return SICRO_RULES.k2.railway;if(nature==="oae_construction"||nature==="oae_recovery")return porte==="small"?SICRO_RULES.k2.oaeSmall:SICRO_RULES.k2.oaeMediumLarge;if(nature==="point")return SICRO_RULES.k2.point;return 1;}
function autoK3(distance,pavement,nature){if(nature==="road_conservation"||nature==="point")return 1;const coef=SICRO_RULES.k3[pavement]??SICRO_RULES.k3.paved;return 1+coef*(Number(distance)||0);}
function calcEquationAreas(labor){return {AE_ST:57.95+4.50*labor.npf,AI_V:.77*(labor.nmo+labor.npv),ALR_C:1.55*(.5*labor.nmax),AAL:3.11*.5*(labor.nmo+labor.npv),ARES:8.46*labor.npfv,AAMB:.25*labor.nmax,AAR:1.50*(.5*labor.nfa)};}
function referenceSet(nature,porte){if(!porte)return null;if(nature==="road_construction"||nature==="road_restoration")return SICRO_RULES.referenceAreas.road[porte]||null;if(nature==="oae_construction"||nature==="oae_recovery")return SICRO_RULES.referenceAreas.oae[porte]||null;return null;}
function isFixedSupported(nature,porte,ref){if(nature==="road_construction"||nature==="road_restoration")return true;if((nature==="oae_construction"||nature==="oae_recovery")&&porte!=="small"&&ref)return true;return false;}
function adoptedFactor(auto,override){return isFiniteNumber(override)?Number(override):auto;}
function baseAreaRows(p,labor,classification){
  const eqAreas=calcEquationAreas(labor),refs=referenceSet(p.work.nature,classification.porte),rounding=p.work.roundingMode||ROUNDING_CADERNO,rows=[];
  for(const key of AREA_ORDER){let baseValue=0,label="",feac=0,source="",formula="";if(SICRO_RULES.equations[key]){const e=SICRO_RULES.equations[key];baseValue=eqAreas[key];label=e.label;feac=e.feac;source=e.source;formula=e.expr;}else{const m=SICRO_RULES.referenceMeta[key];baseValue=refs?.[key]??0;label=m.label;feac=m.feac;source=m.source;formula="Área de referência conforme natureza e porte";}const override=p.overrides?.areas?.[key];const hasOverride=override&&isFiniteNumber(override.adopted);let adopted=hasOverride?Number(override.adopted):baseValue;adopted=roundBy(adopted,rounding);let equivalent=roundBy(adopted*feac,rounding);rows.push({key,label,baseValue,adopted,feac,equivalent,source,formula,hasOverride,justification:override?.justification||""});}
  return {rows,refs,eqAreas};
}
function calculateFixedMain(p,months,classification,labor){
  const rounding=p.work.roundingMode||ROUNDING_CADERNO;const autoFactors={k1:SICRO_RULES.k1[p.work.constructionPattern]??1,k2:autoK2(p.work.nature,classification.porte),k3:autoK3(p.work.supplierDistance,p.work.pavement,p.work.nature)};const ovf=p.overrides?.factors||{};const factors={k1:adoptedFactor(autoFactors.k1,ovf.k1),k2:adoptedFactor(autoFactors.k2,ovf.k2),k3:adoptedFactor(autoFactors.k3,ovf.k3)};
  const data=baseAreaRows(p,labor,classification);const fixedSupported=isFixedSupported(p.work.nature,classification.porte,data.refs);let ac=data.rows.reduce((s,r)=>s+r.adopted,0),eq=data.rows.reduce((s,r)=>s+r.equivalent,0);ac=roundBy(ac,rounding);eq=roundBy(eq,rounding);const autoRct=data.refs?.rct??SICRO_RULES.rct[p.work.nature]??0;const rct=adoptedFactor(autoRct,ovf.rct);let at=rct>0?ac/rct:0,ad=at-ac;at=roundBy(at,rounding);ad=roundBy(ad,rounding);const cmcc=Number(p.work.cmcc)||0,coveredIndex=factors.k1*factors.k2*factors.k3*eq,uncoveredIndex=ad*SICRO_RULES.fead,coveredCost=coveredIndex*cmcc,uncoveredCost=uncoveredIndex*cmcc,baseCost=round2((coveredIndex+uncoveredIndex)*cmcc);
  return {...data,autoFactors,factors,fixedSupported,ac,eq,autoRct,rct,at,ad,cmcc,coveredIndex,uncoveredIndex,coveredCost,uncoveredCost,baseCost,rounding};
}
function settingAdopted(base,setting,rounding){const s=setting||{};let value=base;if(s.mode==="suppress")value=0;else if(s.mode==="percent")value=base*(Number(s.percent)||0)/100;else if(s.mode==="manual")value=Number(s.manual)||0;return roundBy(value,rounding);}
function calculateComplementary(p,comp,main){
  const months=Math.max(0,Number(comp.months)||0),classification=classifyNature(comp.nature,comp.extension,months),refs=referenceSet(comp.nature,classification.porte),rounding=p.work.roundingMode||ROUNDING_CADERNO,rows=[];
  for(const key of AREA_ORDER){const e=SICRO_RULES.equations[key],m=SICRO_RULES.referenceMeta[key];const baseValue=e?0:(refs?.[key]??0);const setting=comp.areaSettings?.[key]||defaultAreaSetting(key);const adopted=settingAdopted(baseValue,setting,rounding);const feac=e?e.feac:m.feac;const equivalent=roundBy(adopted*feac,rounding);rows.push({key,label:e?.label||m.label,baseValue,adopted,feac,equivalent,setting,source:e?"Área variável: definir apenas se não absorvida pelo canteiro principal":m.source});}
  let ac=roundBy(rows.reduce((s,r)=>s+r.adopted,0),rounding),eq=roundBy(rows.reduce((s,r)=>s+r.equivalent,0),rounding);const auto={k1:comp.constructionPattern==="inherit"?main.factors.k1:(SICRO_RULES.k1[comp.constructionPattern]??main.factors.k1),k2:autoK2(comp.nature,classification.porte),k3:comp.pavement==="inherit"?main.factors.k3:autoK3(comp.supplierDistance,comp.pavement,comp.nature),rct:refs?.rct||0};const fo=comp.factorOverrides||{};const factors={k1:adoptedFactor(auto.k1,fo.k1),k2:adoptedFactor(auto.k2,fo.k2),k3:adoptedFactor(auto.k3,fo.k3)};const rct=adoptedFactor(auto.rct,fo.rct);let at=rct>0?ac/rct:0,ad=at-ac;at=roundBy(at,rounding);ad=roundBy(ad,rounding);const cmcc=isFiniteNumber(comp.cmcc)?Number(comp.cmcc):main.cmcc;const supported=!!refs&&isFixedSupported(comp.nature,classification.porte,refs);const cost=round2(((factors.k1*factors.k2*factors.k3*eq)+(ad*SICRO_RULES.fead))*cmcc);const warnings=[];
  if(!supported)warnings.push("A natureza/porte complementar possui solução ainda não integralmente suportada pelo motor fixo.");
  rows.filter(r=>Math.abs(r.adopted-r.baseValue)>.005&&!String(r.setting?.justification||"").trim()).forEach(r=>warnings.push(`A decisão sobre “${r.label}” não possui justificativa.`));
  return {id:comp.id,enabled:comp.enabled!==false,name:comp.name,nature:comp.nature,months,classification,refs,rows,ac,eq,auto,factors,rct,at,ad,cmcc,supported,cost,warnings};
}
function getContainerPrice(p,code){const v=p.containerLibrary?.prices?.[code];return isFiniteNumber(v)&&Number(v)>0?Number(v):null;}
function aggregateContainerRows(p,rows,rounding){const byCode={};const missing=new Set();let area=0;rows.forEach(r=>{const code=r.code||r.container,q=Math.max(0,Number(r.qty)||0),def=containerDef(code);area+=q*(def?.area||0);if(!byCode[code])byCode[code]={code,qty:0,unitPrice:getContainerPrice(p,code),area:def?.area||0,description:def?.description||""};byCode[code].qty+=q;if(byCode[code].unitPrice==null&&q>0)missing.add(code);});let total=0;Object.values(byCode).forEach(x=>{x.extended=x.unitPrice==null?null:x.qty*x.unitPrice;if(x.extended!=null)total+=x.extended;});return {byCode:Object.values(byCode),missing:[...missing],area:roundBy(area,rounding),total:roundBy(total,rounding)};}
function pointAutoQuantities(p,l){const q={office:l.npfv>0?1:0,technical:Math.ceil(Math.max(0,l.npfv-2)/3),meal:Math.ceil(.5*l.nmax/48),kitchen:l.nmax>0?1:0,lodging:p.mobile.pointIncludeLodging?Math.ceil(.5*(l.nmo+l.npv)/6):0,sanitary:Math.ceil((l.nmo+l.npv)/20),residence:p.mobile.pointIncludeResidence?Math.ceil(l.npfv/3):0,ambulatory:Math.ceil((.25*l.nmax)/14.86),guard:l.nmax>0?1:0,warehouse:Number(p.mobile.pointDiscretionary?.warehouse)||0,cement:Number(p.mobile.pointDiscretionary?.cement)||0,workshop:Number(p.mobile.pointDiscretionary?.workshop)||0,laboratory:Number(p.mobile.pointDiscretionary?.laboratory)||0};return q;}
function pointTemplateQuantities(p,labor){const t=p.mobile.pointTemplate||"auto";if(t==="auto"||t==="custom")return pointAutoQuantities(p,labor);return deepClone(SICRO_RULES.pointTemplates[t]?.quantities||{});}
function calculatePoint(p,months,labor,classification){
  const rounding=p.work.roundingMode||ROUNDING_CADERNO,base=pointTemplateQuantities(p,labor),rows=SICRO_RULES.pointInstallations.map(def=>{const q0=Number(base[def.id])||0;const ov=p.mobile.pointOverrides?.[def.id];const qty=isFiniteNumber(ov)?Math.max(0,Number(ov)):q0;return {...def,baseQty:q0,qty,area:roundBy(qty*(containerDef(def.code)?.area||0),rounding),justification:p.mobile.pointJustifications?.[def.id]||""};});const agg=aggregateContainerRows(p,rows,rounding);const template=SICRO_RULES.pointTemplates[p.mobile.pointTemplate];const hasOverride=rows.some(r=>Math.abs(r.qty-r.baseQty)>.0001);let at=template?.at&&!hasOverride?template.at:(agg.area/SICRO_RULES.rct.point);at=roundBy(at,rounding);const ad=roundBy(at-agg.area,rounding),k2=autoK2("point","unique"),feat=SICRO_RULES.feat.point,cmcc=Number(p.work.cmcc)||0,life=Math.max(1,Number(p.containerLibrary.lifeMonths)||SICRO_RULES.containerLifeMonths);const partial=(months/life)*(k2*agg.total)+at*feat*cmcc;const complete=agg.missing.length===0&&cmcc>0&&months>0;const cost=complete?round2(partial):null;const warnings=[];
  if(classification.validPoint===false)warnings.push("A intervenção contínua supera 5 km de pista simples por ano e deve ser reenquadrada.");
  if(agg.missing.length)warnings.push("Preços ausentes: "+agg.missing.join(", ")+".");
  if((p.mobile.pointTemplate==="auto"||p.mobile.pointTemplate==="custom")&&["warehouse","cement","workshop","laboratory"].some(k=>(Number(base[k])||0)===0))warnings.push("Almoxarifado, depósito de cimento, oficina e laboratórios dependem de decisão do orçamentista.");
  rows.filter(r=>Math.abs(r.qty-r.baseQty)>.0001&&!r.justification.trim()).forEach(r=>warnings.push(`Quantidade de “${r.label}” alterada sem justificativa.`));
  return {type:"point",rows,aggregate:agg,template:p.mobile.pointTemplate,at,ad,rct:SICRO_RULES.rct.point,k2,feat,cmcc,life,months,cost,complete,warnings};
}
function calculateConservation(p,months){
  const rounding=p.work.roundingMode||ROUNDING_CADERNO,rows=SICRO_RULES.conservationInstallations.map(def=>{const ov=p.mobile.conservationOverrides?.[def.id];const qty=isFiniteNumber(ov)?Math.max(0,Number(ov)):def.qty;return {...def,baseQty:def.qty,qty,area:roundBy(qty*(containerDef(def.code)?.area||0),rounding),justification:p.mobile.conservationJustifications?.[def.id]||""};});const agg=aggregateContainerRows(p,rows,rounding);const at=roundBy(agg.area/SICRO_RULES.rct.road_conservation,rounding),laneKm=Math.max(0,Number(p.work.conservationLaneKm)||0),cp=laneKm>200?laneKm/200:1,k2=autoK2("road_conservation","unique"),feat=SICRO_RULES.feat.road_conservation,cmcc=Number(p.work.cmcc)||0,life=Math.max(1,Number(p.containerLibrary.lifeMonths)||SICRO_RULES.containerLifeMonths);const partial=((months/life)*(k2*agg.total)+at*feat*cmcc)*cp;const complete=agg.missing.length===0&&cmcc>0&&months>0;const cost=complete?round2(partial):null;const warnings=[];if(agg.missing.length)warnings.push("Preços ausentes: "+agg.missing.join(", ")+". O arquivo fornecido não informa o preço do M0066.");if(laneKm<=0)warnings.push("Informe a extensão de faixas de rolamento para o coeficiente CP.");rows.filter(r=>Math.abs(r.qty-r.baseQty)>.0001&&!r.justification.trim()).forEach(r=>warnings.push(`Quantidade de “${r.label}” alterada sem justificativa.`));return {type:"conservation",rows,aggregate:agg,at,rct:SICRO_RULES.rct.road_conservation,laneKm,cp,k2,feat,cmcc,life,months,cost,complete,warnings};
}
function calculateIndustrialItem(p,item,main){
  const def=industrialDef(item.type),rounding=p.work.roundingMode||ROUNDING_CADERNO;if(!def)return null;const duration=Math.max(0,isFiniteNumber(item.durationMonths)?Number(item.durationMonths):main.months),quantity=Math.max(0,Number(item.quantity)||0),inSitu=[],containers=[];
  def.areas.forEach(a=>{if(a.container){const ov=item.containerOverrides?.[a.id];const qty=isFiniteNumber(ov)?Math.max(0,Number(ov)):a.qty;containers.push({...a,baseQty:a.qty,qty,justification:item.containerJustifications?.[a.id]||""});}else{const ov=item.areaOverrides?.[a.id];const area=isFiniteNumber(ov)?Math.max(0,Number(ov)):a.area;inSitu.push({...a,baseArea:a.area,adoptedArea:roundBy(area,rounding),equivalentDisplay:round2(area*a.feac),justification:item.areaJustifications?.[a.id]||""});}});
  const eqRaw=inSitu.reduce((s,r)=>s+r.adoptedArea*r.feac,0),eq=roundBy(eqRaw,rounding);const agg=aggregateContainerRows(p,containers,rounding),life=Math.max(1,Number(p.containerLibrary.lifeMonths)||SICRO_RULES.containerLifeMonths),cdi=Math.max(0,Number(item.cdi)||0),areaPart=main.factors.k1*main.factors.k2*main.factors.k3*(eq*main.cmcc),containerPart=main.factors.k2*(duration/life*agg.total),unitCost=round2(areaPart+containerPart+cdi),total=round2(unitCost*quantity);const warnings=[];if(agg.missing.length)warnings.push("Preços ausentes: "+agg.missing.join(", ")+".");if(cdi<=0)warnings.push("Informe o custo da composição SICRO "+def.composition+" para tratamento, montagem e desmontagem.");inSitu.filter(r=>Math.abs(r.adoptedArea-r.baseArea)>.005&&!r.justification.trim()).forEach(r=>warnings.push(`Área de “${r.label}” alterada sem justificativa.`));containers.filter(r=>Math.abs(r.qty-r.baseQty)>.0001&&!r.justification.trim()).forEach(r=>warnings.push(`Quantidade de “${r.label}” alterada sem justificativa.`));return {id:item.id,enabled:item.enabled!==false,type:item.type,def,duration,quantity,inSitu,containers,eq,aggregate:agg,life,cdi,areaPart,containerPart,unitCost,total,complete:agg.missing.length===0&&cdi>0,warnings};
}

function railwayQty(raw,id,base){const v=raw.quantityOverrides?.[id];return isFiniteNumber(v)?Math.max(0,Number(v)):base;}
function railwayPrice(raw,key){const v=raw.assetPrices?.[key];return isFiniteNumber(v)&&Number(v)>=0?Number(v):null;}
function calculateRailway(p,months,classification,labor,main){
  if(p.work.nature!=="railway_construction")return null;
  const raw=p.railway||{},porte=classification.porte,rounding=p.work.roundingMode||ROUNDING_CADERNO,warnings=[];
  if(!porte)return {mode:raw.mode||"mobile",complete:false,cost:null,warnings:["Não foi possível classificar o porte ferroviário."]};
  if(raw.mode==="fixed"){
    const complete=main.rct>0&&main.cmcc>0&&main.ac>0,cost=complete?main.baseCost:null;
    if(main.rct<=0)warnings.push("Para o canteiro ferroviário fixo, informe o RCT adotado na aba Fatores SICRO.");
    if(main.rows.filter(r=>["warehouse","cement","workshop","topography","guard"].includes(r.key)).every(r=>r.adopted===0))warnings.push("As áreas adicionais do canteiro ferroviário fixo devem ser definidas pelo orçamentista, com base no projeto adaptado.");
    return {mode:"fixed",rows:main.rows,ac:main.ac,eq:main.eq,at:main.at,ad:main.ad,rct:main.rct,factors:main.factors,cost,complete,warnings};
  }
  const rows=SICRO_RULES.railway.installations.map(def=>{const base=Number(def.qty[porte])||0,qty=railwayQty(raw,def.id,base);return {...def,baseQty:base,qty,justification:raw.quantityJustifications?.[def.id]||""};});
  const additional=SICRO_RULES.railway.additional.map(def=>{const base=Number(def.qty[porte])||0,qty=railwayQty(raw,def.id,base);return {...def,baseQty:base,qty,justification:raw.quantityJustifications?.[def.id]||""};});
  const totals={closed:0,tank:0,gondola:0};rows.forEach(r=>totals[r.asset]+=r.qty);
  const totalWagons=totals.closed+totals.tank+totals.gondola,coveredArea=roundBy(totals.closed*SICRO_RULES.railway.wagons.closed.usefulArea+totals.gondola*SICRO_RULES.railway.wagons.gondola.usefulArea+(additional.find(x=>x.id==="guard")?.qty||0)*(containerDef("M0071")?.area||0),rounding);
  const k2=autoK2("railway_construction",porte),wagonLife=isFiniteNumber(raw.wagonLifeMonths)?Math.max(0,Number(raw.wagonLifeMonths)):0,containerLife=Math.max(1,Number(p.containerLibrary.lifeMonths)||SICRO_RULES.containerLifeMonths),cmcc=Number(p.work.cmcc)||0,at=isFiniteNumber(raw.totalTerrainArea)?Math.max(0,Number(raw.totalTerrainArea)):0,feat=isFiniteNumber(raw.feat)?Math.max(0,Number(raw.feat)):null;
  const missing=[];let rollingValue=0;for(const k of ["closed","tank","gondola"]){const q=totals[k],price=railwayPrice(raw,k);if(q>0&&price==null)missing.push(k);if(price!=null)rollingValue+=q*price;}
  const guardRow=additional.find(x=>x.id==="guard"),guardPrice=getContainerPrice(p,"M0071");if(guardRow.qty>0&&guardPrice==null)missing.push("M0071");const guardValue=guardPrice==null?0:guardRow.qty*guardPrice;
  let directCost=0;const directRows=additional.filter(x=>x.id!=="guard").map(r=>{const price=railwayPrice(raw,r.priceKey);if(r.qty>0&&price==null)missing.push(r.priceKey);const total=price==null?null:r.qty*price;if(total!=null)directCost+=total;return {...r,unitPrice:price,total};});
  if(wagonLife<=0)missing.push("vida útil dos vagões");if(at<=0)missing.push("área total do terreno");if(feat==null)missing.push("FEAT ferroviário");if(cmcc<=0)missing.push("CMCC");
  const rollingCost=wagonLife>0?(months/wagonLife)*k2*rollingValue:0,guardCost=(months/containerLife)*k2*guardValue,terrainCost=feat==null?0:at*feat*cmcc,partial=rollingCost+guardCost+directCost+terrainCost,complete=missing.length===0&&months>0,cost=complete?round2(partial):null;
  rows.filter(r=>Math.abs(r.qty-r.baseQty)>.0001&&!r.justification.trim()).forEach(r=>warnings.push(`Quantidade de “${r.label}” alterada sem justificativa.`));additional.filter(r=>Math.abs(r.qty-r.baseQty)>.0001&&!r.justification.trim()).forEach(r=>warnings.push(`Quantidade de “${r.label}” alterada sem justificativa.`));
  if(missing.length)warnings.push("Parâmetros/preços pendentes: "+[...new Set(missing)].join(", ")+".");
  warnings.push("O Manual fornece a configuração física dos vagões, mas não apresenta preços, vida útil nem FEAT específico. O custo móvel ferroviário permanece condicionado às entradas do orçamentista.");
  return {mode:"mobile",rows,additional,directRows,totals,totalWagons,coveredArea,k2,wagonLife,containerLife,cmcc,at,feat,rollingValue,guardValue,rollingCost,guardCost,directCost,terrainCost,partial,cost,complete,warnings};
}
function calculateItinerant(p,months){
  const raw=p.itinerant||{},enabled=raw.enabled===true,cmcc=Number(p.work.cmcc)||0,teamCount=Math.max(0,Number(raw.teamCount)||0),useMonths=isFiniteNumber(raw.months)?Math.max(0,Number(raw.months)):months,autoEfs=teamCount*useMonths,efs=isFiniteNumber(raw.efsOverride)?Math.max(0,Number(raw.efsOverride)):autoEfs,kci=isFiniteNumber(raw.kciOverride)?Math.max(0,Number(raw.kciOverride)):SICRO_RULES.kCI,warnings=[];
  const eligible=["road_construction","road_restoration","railway_construction","point"].includes(p.work.nature);
  if(enabled&&!eligible)warnings.push("O canteiro itinerante é concebido para obras lineares; revise sua aplicação à natureza selecionada.");
  if(enabled&&(Number(raw.distanceToFront)||0)<=150)warnings.push("A distância informada não supera 150 m; o Manual associa o canteiro itinerante a postos mais distantes do canteiro principal.");
  if(enabled&&raw.nearbyFacilities)warnings.push("Há instalações próximas declaradas; o Manual admite dispensar o canteiro itinerante quando elas atendem higiene, conforto e segurança.");
  if(enabled&&efs<=0)warnings.push("Informe a quantidade de equipes × mês (Efs).");if(enabled&&cmcc<=0)warnings.push("Informe o CMCC.");
  const complete=!enabled||(efs>0&&cmcc>0),cost=enabled&&complete?round2(kci*cmcc*efs):enabled?null:0;
  return {enabled,eligible,teamCount,useMonths,autoEfs,efs,kci,cmcc,cost,complete,warnings,devices:SICRO_RULES.itinerantDevices};
}
function calculateHydro(p,months){
  if(p.work.nature!=="hydro")return null;const raw=p.hydro||{},missing=[],warnings=[];
  const mapRow=r=>{const qty=Math.max(0,Number(r.quantity)||0),price=isFiniteNumber(r.unitPrice)&&Number(r.unitPrice)>=0?Number(r.unitPrice):null,total=price==null?null:qty*price;if(qty>0&&price==null)missing.push(r.code||r.description);return {...r,qty,price,total};};
  const support=(raw.supportRows||[]).map(mapRow),custom=(raw.customItems||[]).map(mapRow);const supportCost=support.reduce((s,r)=>s+(r.total||0),0),customCost=custom.reduce((s,r)=>s+(r.total||0),0),facilityCost=Math.max(0,Number(raw.facilityCost)||0),signallingCost=Math.max(0,Number(raw.signallingCost)||0),mobilizationCost=Math.max(0,Number(raw.mobilizationCost)||0),total=supportCost+customCost+facilityCost+signallingCost+mobilizationCost,hasScope=support.some(r=>r.qty>0)||custom.some(r=>r.qty>0)||facilityCost>0||signallingCost>0||mobilizationCost>0;
  if(!raw.confirmed)warnings.push("Confirme que o dimensionamento hidroviário específico foi revisado pelo orçamentista.");if(!hasScope)warnings.push("Nenhum item de custo foi dimensionado para o canteiro/apoio hidroviário.");if(missing.length)warnings.push("Preços pendentes: "+missing.join(", ")+".");
  const complete=raw.confirmed===true&&hasScope&&missing.length===0,cost=complete?round2(total):null;
  return {months,service:p.work.hydroService,facilityMode:raw.facilityMode,support,custom,supportCost,customCost,facilityCost,signallingCost,mobilizationCost,total,cost,complete,warnings};
}
function resolveTomoUnitPrice(p,s){if(s.linkedContainer)return getContainerPrice(p,s.linkedContainer);return isFiniteNumber(s.unitPrice)&&Number(s.unitPrice)>=0?Number(s.unitPrice):null;}
function calculateTomoLibrary(p){const templates=(p.tomoLibrary?.templates||[]).map(t=>{const missing=[];const services=(t.services||[]).map(s=>{const qty=Math.max(0,Number(s.quantity)||0),price=resolveTomoUnitPrice(p,s),total=s.enabled===false?0:(price==null?null:qty*price);if(s.enabled!==false&&qty>0&&price==null)missing.push(s.code||s.description);return {...s,qty,price,total};});const total=round2(services.reduce((sum,s)=>sum+(s.total||0),0)),complete=missing.length===0,include=t.budgetTreatment==="add";return {...t,services,total,complete,missing,include};});const included=templates.filter(t=>t.include),includedCost=round2(included.reduce((s,t)=>s+(t.complete?t.total:0),0)),comparisonCost=round2(templates.reduce((s,t)=>s+t.total,0)),warnings=[];included.forEach(t=>{if(!t.complete)warnings.push(`Projeto-tipo “${t.name}” foi marcado para inclusão, mas possui preços pendentes.`);if(!String(t.includeJustification||"").trim())warnings.push(`Justifique a inclusão analítica de “${t.name}” para evitar dupla contagem.`);});return {templates,included,includedCost,comparisonCost,completeIncluded:included.every(t=>t.complete&&String(t.includeJustification||"").trim()),warnings};}

function calculate(p){
  const months=effectiveMonths(p),classification=classifyNature(p.work.nature,p.work.extension,months,p.work.pointType),labor=calcLabor(p,p.work.nature),main=calculateFixedMain(p,months,classification,labor);main.months=months;main.classification=classification;main.labor=labor;
  const complementaries=(p.complementaries||[]).map(c=>calculateComplementary(p,c,main));const activeComplementaries=complementaries.filter(x=>x.enabled);const complementaryCost=round2(activeComplementaries.reduce((s,x)=>s+(x.supported?x.cost:0),0));
  let mobile=null;if(p.work.nature==="point")mobile=calculatePoint(p,months,labor,classification);else if(p.work.nature==="road_conservation")mobile=calculateConservation(p,months);
  const railway=calculateRailway(p,months,classification,labor,main),hydro=calculateHydro(p,months),itinerant=calculateItinerant(p,months),tomo=calculateTomoLibrary(p);
  const industrials=(p.industrials||[]).map(i=>calculateIndustrialItem(p,i,main)).filter(Boolean);const activeIndustrials=industrials.filter(x=>x.enabled);const cii=round2(activeIndustrials.reduce((s,x)=>s+x.total,0));
  let mainCost=null,completeMain=false;if(main.fixedSupported){mainCost=main.baseCost;completeMain=main.cmcc>0;}else if(mobile){mainCost=mobile.cost;completeMain=mobile.complete;}else if(railway){mainCost=railway.cost;completeMain=railway.complete;}else if(hydro){mainCost=hydro.cost;completeMain=hydro.complete;}
  const mainCostNumeric=mainCost==null?0:mainCost,cci=itinerant.enabled?(itinerant.cost||0):0,analyticIncluded=tomo.includedCost,grandTotal=round2(mainCostNumeric+complementaryCost+cii+cci+analyticIncluded),complete=completeMain&&activeComplementaries.every(x=>x.supported)&&activeIndustrials.every(x=>x.complete)&&itinerant.complete&&tomo.completeIncluded;const workCost=Number(p.meta.workCost)||0,warnings=[];
  if(months<=0)warnings.push({type:"danger",text:"O período efetivo do canteiro deve ser superior a zero."});if(!classification.porte&&!["hydro","nonconventional"].includes(p.work.nature))warnings.push({type:"warn",text:"Não foi possível classificar o porte: verifique extensão e prazo efetivo."});if(Number(p.work.supplierDistance)<50&&!['road_conservation','point','hydro'].includes(p.work.nature)&&!String(p.work.distanceJustification||"").trim())warnings.push({type:"warn",text:"Distância ao centro fornecedor inferior a 50 km: o Manual exige justificativa técnica."});if(main.cmcc<=0&&p.work.nature!=="hydro")warnings.push({type:"danger",text:"Informe o CMCC para calcular os custos."});
  if(!main.fixedSupported&&!mobile&&!railway&&!hydro)warnings.push({type:"info",text:"A natureza selecionada depende de dimensionamento específico do orçamentista."});activeComplementaries.forEach(x=>x.warnings.forEach(w=>warnings.push({type:"warn",text:`${x.name}: ${w}`})));if(mobile)mobile.warnings.forEach(w=>warnings.push({type:"warn",text:w}));if(railway)railway.warnings.forEach(w=>warnings.push({type:"warn",text:w}));if(hydro)hydro.warnings.forEach(w=>warnings.push({type:"warn",text:w}));itinerant.warnings.forEach(w=>warnings.push({type:"warn",text:`Canteiro itinerante: ${w}`}));tomo.warnings.forEach(w=>warnings.push({type:"warn",text:`Biblioteca analítica: ${w}`}));activeIndustrials.forEach(x=>x.warnings.forEach(w=>warnings.push({type:"warn",text:`${x.def.label}: ${w}`})));main.rows.filter(r=>r.hasOverride&&Math.abs(r.adopted-r.baseValue)>1e-9&&!r.justification.trim()).forEach(r=>warnings.push({type:"warn",text:`A área de “${r.label}” foi alterada sem justificativa.`}));
  return {...main,months,classification,labor,complementaries,complementaryCost,mobile,railway,hydro,itinerant,cci,tomo,analyticIncluded,industrials,cii,mainCost,grandTotal,complete,workCost,costRatio:workCost>0?grandTotal/workCost:null,warnings};
}


function testAdd(tests,group,name,expected,actual,tol=.011){const pass=typeof expected==="string"?String(actual)===expected:Math.abs(Number(actual)-Number(expected))<=tol;tests.push({group,name,expected,actual,pass});}
function runOfficialTests(updateState=true){const tests=[];const r=calculate(officialProject());testAdd(tests,"Rodoviário principal","Porte","medium",r.classification.porte,0);testAdd(tests,"Rodoviário principal","NMO",252,r.labor.nmo);testAdd(tests,"Rodoviário principal","NPV",36,r.labor.npv);testAdd(tests,"Rodoviário principal","NFA",191,r.labor.nfa);testAdd(tests,"Rodoviário principal","NMAX",335,r.labor.nmax);testAdd(tests,"Rodoviário principal","AC",2415.50,r.ac);testAdd(tests,"Rodoviário principal","Área equivalente",1527.32,r.eq);testAdd(tests,"Rodoviário principal","AT",6038.75,r.at);testAdd(tests,"Rodoviário principal","AD",3623.25,r.ad);testAdd(tests,"Rodoviário principal","CCOP",2943514.03,r.baseCost);const co=r.complementaries[0];testAdd(tests,"OAE complementar","Porte","medium",co.classification.porte,0);testAdd(tests,"OAE complementar","AC",261.47,co.ac);testAdd(tests,"OAE complementar","Área equivalente",133.99,co.eq);testAdd(tests,"OAE complementar","AT",747.06,co.at);testAdd(tests,"OAE complementar","AD",485.59,co.ad);testAdd(tests,"OAE complementar","CCOC",272326.97,co.cost);const iv=r.industrials.find(x=>x.type==="IV"),v=r.industrials.find(x=>x.type==="V"),vii=r.industrials.find(x=>x.type==="VII");testAdd(tests,"Instalações industriais","Central de britagem",116490.48,iv.total);testAdd(tests,"Instalações industriais","Usina de solos",137895.12,v.total);testAdd(tests,"Instalações industriais","Área equivalente usina de asfalto",141.45,vii.eq);testAdd(tests,"Instalações industriais","Usina de asfalto",431006.42,vii.total);testAdd(tests,"Instalações industriais","CII",685392.02,r.cii);testAdd(tests,"Consolidação rodoviária","CCO total",3901233.02,r.grandTotal);const q=calculate(officialPointProject());testAdd(tests,"Intervenção pontual","NMO",56,q.labor.nmo);testAdd(tests,"Intervenção pontual","NPV",3,q.labor.npv);testAdd(tests,"Intervenção pontual","NPF-V",7.25,q.labor.npfv);testAdd(tests,"Intervenção pontual","NMAX",67,q.labor.nmax);testAdd(tests,"Intervenção pontual","k2",1.13,q.mobile.k2,.00001);testAdd(tests,"Intervenção pontual","AC",260.06,q.mobile.aggregate.area);testAdd(tests,"Intervenção pontual","AT",1111.37,q.mobile.at);testAdd(tests,"Intervenção pontual","Custo integral dos contêineres",1056619.83,q.mobile.aggregate.total);testAdd(tests,"Intervenção pontual","CIP",150898.23,q.mobile.cost);const rail=blankProject();rail.work.nature="railway_construction";rail.work.extension=25;rail.work.campMonths=12;const rc=calculate(rail);testAdd(tests,"Etapa 6 — ferroviário","Porte","medium",rc.classification.porte,0);testAdd(tests,"Etapa 6 — ferroviário","Total de vagões",26,rc.railway.totalWagons,0);testAdd(tests,"Etapa 6 — ferroviário","Vagões fechados",23,rc.railway.totals.closed,0);const it=blankProject();it.work.cmcc=1000;it.itinerant.enabled=true;it.itinerant.teamCount=2;it.itinerant.months=3;it.itinerant.distanceToFront=300;const ic=calculate(it);testAdd(tests,"Etapa 6 — itinerante","Efs",6,ic.itinerant.efs);testAdd(tests,"Etapa 6 — itinerante","CCI",2100,ic.itinerant.cost);const hy=blankProject();hy.work.nature="hydro";hy.hydro.confirmed=true;hy.hydro.supportRows[0].quantity=2;hy.hydro.supportRows[0].unitPrice=5000;const hc=calculate(hy);testAdd(tests,"Etapa 6 — hidroviário","Apoio náutico",10000,hc.hydro.cost);const tl=blankProject();const tc=calculate(tl);testAdd(tests,"Etapa 7 — biblioteca","Projetos-tipo nativos",6,tc.tomo.templates.length,0);testAdd(tests,"Etapa 7 — biblioteca","M0059 vinculado",getContainerPrice(tl,"M0059"),tc.tomo.templates.find(x=>x.id==="tpl_ind_IV").services.find(s=>s.linkedContainer==="M0059").price,.001);if(updateState){state.tests=tests;state.testScore=Math.round(100*tests.filter(t=>t.pass).length/tests.length);}return tests;}
CN.calculate=p=>calculate(p);CN.blankProject=()=>blankProject();CN.officialProject=()=>officialProject();CN.newIndustrial=t=>newIndustrial(t);CN.newComplementary=t=>newComplementary(t);
CN.selfTests=()=>runOfficialTests(false);CN.RULES=SICRO_RULES;CN.APP_VERSION=APP_VERSION;CN.porteLabel=typeof porteLabel==='function'?porteLabel:(x=>x);CN.natureLabel=typeof natureLabel==='function'?natureLabel:(x=>x);CN.normalize=typeof normalizeProject==='function'?normalizeProject:(p=>p);
})(typeof window!=='undefined'?window:globalThis);

