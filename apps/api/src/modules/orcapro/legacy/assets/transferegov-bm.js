(function (G) {
  'use strict';
  const VERSION = 'transferegov-bm-2026.1';
  const PO = ['Nivel','N° Macrosserviço / Serviço','Fonte','Código','Descrição Macrosserviço / Serviço','Qtd. (valor calculado)','Und.','Custo Unitário Referência','Custo Unitário','BDI','Preço Unitário (valor calculado)','Preço Total (valor calculado)','Observação','N° Frente de Obra','Frente de Obra','Qtd.','Valor'];
  const CFF = ['Número','Macrosserviço','Parcela','Percentual Parcela'];
  const UNITS = 'UN M2 M M3 KG M3XKM TXKM T MES H MESES CJ KM PC %CT CHP PAR MÊS OUTRAS DM3 DIA HA L MXMES CHI ML M2XMES V TXM TXDAM'.split(' ');
  const PROFILES = { documentation: { name: 'Documentação — PO-BM / CFF-BM', po: 'PO-BM', cff: 'CFF-BM', numericCodes: true }, example: { name: 'Exemplo oficial — BM / CFF-BM', po: 'BM', cff: 'CFF-BM', numericCodes: false } };
  const DOCUMENTATION='https://mandatarias.transferegov.sistema.gov.br/projeto-basico/public/helpImport.html';
  const MAX = 999999999999n;
  const canonical = v => JSON.stringify(v, (_k,x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])) : x);
  // All compatibility arithmetic is integer/rational. Source engines are untouched.
  function rational(value) {
    const text = String(value).trim().replace(',', '.');
    if (text.length>60) throw Error('Número muito longo.');
    const m = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!m) throw Error('Informe um número não negativo, sem separador de milhar.');
    const exponent = Number(m[3] || 0); if (Math.abs(exponent)>20) throw Error('Número fora do limite.');
    const scale = (m[2] || '').length-exponent, n = BigInt(m[1]+(m[2] || ''));
    return scale>=0 ? [n,10n**BigInt(scale)] : [n*10n**BigInt(-scale),1n];
  }
  const round = (n,d) => (2n*n+d)/(2n*d);
  const scaled = (v,scale=100n) => { const [n,d]=rational(v); return round(n*scale,d); };
  const exact = (v,scale=100n) => { const [n,d]=rational(v); if (n*scale%d) throw Error('Use no máximo duas casas decimais.');return n*scale/d; };
  const decimal = cents => { const n=BigInt(cents);return `${n/100n}.${String(n%100n).padStart(2,'0')}`; };
  const signed = n => n<0n ? '-'+decimal(-n) : decimal(n);
  const money = cents => Number(cents)/100;
  const unit = text => ({'M²':'M2','M³':'M3','M³XKM':'M3XKM','T X KM':'TXKM','M2XMÊS':'M2XMES'})[String(text).trim().toUpperCase()] || String(text).trim().toUpperCase();
  const enabled = host => ['gestaodepredios.com.br','www.gestaodepredios.com.br','localhost','127.0.0.1','[::1]'].includes(host);
  function validateConfiguration(snapshot,c){
    const record=x=>x&&typeof x==='object'&&!Array.isArray(x),str=(x,max)=>typeof x==='string'&&x.length<=max;
    if(!record(c)||c.version!==VERSION||!PROFILES[c.profile]||!str(c.submeta,100)||!Number.isInteger(Number(c.duration))||Number(c.duration)<1||Number(c.duration)>999)throw Error('Configuração BM inválida.');
    if(!Array.isArray(c.groups)||!c.groups.length||c.groups.length>999||!c.groups.every(g=>record(g)&&str(g.id,100)&&str(g.name,500)&&Number.isFinite(Number(g.number))))throw Error('Macrosserviços inválidos na configuração.');
    if(!Array.isArray(c.fronts)||!c.fronts.length||c.fronts.length>999||!c.fronts.every(f=>record(f)&&str(f.name,500)&&Number.isFinite(Number(f.number))))throw Error('Frentes inválidas na configuração.');
    const ids=new Set(snapshot.items.map(i=>i.id));
    if(!Array.isArray(c.items)||c.items.length!==ids.size||c.items.length>10000||new Set(c.items.map(i=>i?.id)).size!==ids.size||!c.items.every(i=>record(i)&&ids.has(i.id)&&typeof i.include==='boolean'&&str(i.group,100)&&str(i.source,30)&&str(i.code,150)&&str(i.description,2000)&&str(i.unit,30)&&str(i.reference,60)&&str(i.note,2000)&&record(i.allocations)&&Object.keys(i.allocations).length<=999&&Object.entries(i.allocations).every(([k,v])=>/^\d{1,3}$/.test(k)&&str(v,60))))throw Error('Os serviços da configuração não correspondem à fotografia atual.');
    if(!Array.isArray(c.schedule)||c.schedule.length>100000||!c.schedule.every(s=>record(s)&&str(s.group,100)&&Number.isFinite(Number(s.period))&&str(s.percent,60)))throw Error('Cronograma inválido na configuração.');
  }
  function distribute(weights) {
    const sum=weights.reduce((a,b)=>a+b,0n);if (!sum) return weights.map((_v,i)=>i?0:10000);
    const values=weights.map(v=>Number(v*10000n/sum));let rest=10000-values.reduce((a,b)=>a+b,0);
    const order=weights.map((v,i)=>({i,r:v*10000n%sum})).sort((a,b)=>a.r===b.r?a.i-b.i:a.r>b.r?-1:1);
    for(let i=0;i<rest;i++)values[order[i].i]++;return values;
  }
  function defaults(snapshot) {
    return { version:VERSION,profile:'documentation',submeta:'',duration:snapshot.periods.length,groups:snapshot.groups.map((g,i)=>({...g,number:i+1,name:g.name})),fronts:[{number:1,name:'Frente de obra 1'}],
      items:snapshot.items.map(r=>({id:r.id,include:true,group:r.group,source:['SINAPI'].includes(r.source)?r.source:/^\d+$/.test(r.code)?'Outros':'Composição',code:r.code,description:r.description,unit:UNITS.includes(unit(r.unit))?unit(r.unit):'',reference:r.referenceCents==null?'':decimal(r.referenceCents),note:`${r.source} · ${snapshot.uf} · ${snapshot.ref} · ${snapshot.regime}`,allocations:{'1':decimal(scaled(r.quantity))}})),schedule:[] };
  }
  function suggested(snapshot,config) {
    const result=[];
    for(const group of config.groups){
      const weights=Array.from({length:Number(config.duration)},()=>0n);
      for(const item of snapshot.items){const c=config.items.find(x=>x.id===item.id);if(!c?.include||c.group!==group.id)continue;
        const days=item.periodDays.reduce((a,b)=>a+b,0)||1,total=BigInt(item.totalCents ?? 0);
        item.periodDays.forEach((d,i)=>{if(i<weights.length)weights[i]+=total*BigInt(d)*100000000n/BigInt(days);});
      }
      distribute(weights).forEach((p,i)=>result.push({group:group.id,period:i+1,percent:decimal(p)}));
    }return result;
  }
  function prepare(snapshot,config) {
    const errors=[],warnings=[],items=[],groups=[],profile=PROFILES[config.profile];
    const error=(id,message)=>errors.push({id,message}),warn=(id,message)=>warnings.push({id,message});
    if(!profile)error('profile','Selecione um perfil BM válido.');
    if(typeof config.submeta!=='string'||!config.submeta.trim()||config.submeta.length>100)error('submeta','Identifique a submeta do QCI (até 100 caracteres).');
    const duration=Number(config.duration);
    if(!Number.isInteger(duration)||duration<1||duration>999)error('duration','Duração deve estar entre 1 e 999 meses.');
    if(!Array.isArray(config.fronts)||!config.fronts.length||config.fronts.length>999)error('fronts','Cadastre de 1 a 999 frentes de obra.');
    if(!Array.isArray(config.groups)||config.groups.length>999||!Array.isArray(config.items)||config.items.length>100000)throw Error('Configuração excede o limite.');
    const checkIds=(list,kind)=>{const ids=new Set();for(const row of list){if(!Number.isInteger(Number(row.number))||Number(row.number)<1||Number(row.number)>999||ids.has(Number(row.number)))error(kind,`${kind}: números únicos de 1 a 999.`);ids.add(Number(row.number));if(typeof row.name!=='string'||!row.name.trim()||row.name.length>100)error(kind,`${kind}: informe nomes de até 100 caracteres.`);}};
    checkIds(config.groups,'Macrosserviços');checkIds(config.fronts||[],'Frentes de obra');
    if(new Set(config.groups.map(g=>g.id)).size!==config.groups.length)error('groups','Identificadores de macrosserviços repetidos.');
    if(new Set(config.items.map(i=>i.id)).size!==config.items.length)error('items','Serviços repetidos na configuração.');
    const selected=config.items.filter(c=>c.include);if(!selected.length)error('items','Selecione ao menos um serviço.');
    const sourceIds=new Set(snapshot.items.map(i=>i.id));for(const c of selected)if(!sourceIds.has(c.id))error(c.id,'Serviço não pertence à fotografia deste orçamento.');
    for(const row of snapshot.items){
      const c=config.items.find(x=>x.id===row.id);if(!c?.include)continue;
      const startErrors=errors.length;
      try {
        if(row.periodDays.some((days,index)=>index>=duration&&days>0))throw Error('A duração informada corta meses com execução deste serviço. Amplie a duração para preservar o planejamento.');
        const g=config.groups.find(g=>g.id===c.group);if(!g)throw Error('Escolha o macrosserviço de destino.');
        if(!['SINAPI','Composição','Cotação','Outros'].includes(c.source))throw Error('Fonte inválida para o layout BM.');
        const code=String(c.code ?? '');if(!(profile?.numericCodes?/^\d{1,13}$/:/^[A-Za-z0-9._-]{1,13}$/).test(code))throw Error('Código de exportação inválido: use até 13 dígitos no perfil da documentação; códigos próprios exigem um mapeamento explícito.');
        if(typeof c.description!=='string'||!c.description.trim()||c.description.length>500)throw Error('Descrição deve ter de 1 a 500 caracteres.');
        if(!UNITS.includes(c.unit))throw Error('Selecione uma unidade aceita; conversões dimensionais não são automáticas.');
        if(typeof c.note!=='string'||c.note.length>500)throw Error('Observação limitada a 500 caracteres.');
        const reference=exact(c.reference),cost=exact(row.costCents,1n),bdi=scaled(row.bdi,10000n);
        if(reference>MAX||cost>MAX||bdi>10000n)throw Error('Custo ou BDI fora dos limites do layout (BDI de 0 a 100%).');
        if(c.source==='SINAPI'&&(row.source!=='SINAPI'||code!==row.code||c.description!==row.description||c.unit!==unit(row.unit)||row.referenceCents==null||reference!==BigInt(row.referenceCents)))throw Error('SINAPI exige código, descrição, unidade e custo referencial originais; revise a fonte do serviço adaptado.');
        const price=round(cost*(10000n+bdi),10000n);if(price>MAX)throw Error('Preço unitário excede o limite.');
        const allocations=[];let qty=0n,total=0n;
        for(const [key,value]of Object.entries(c.allocations||{})){if(value===''||value==null)continue;const q=exact(value);
          const front=config.fronts.find(f=>String(f.number)===key);if(!front)throw Error('Há quantidade vinculada a frente inexistente.');
          if(q>9999999999n)throw Error('Quantidade por frente acima de 99.999.999,99.');
          const v=round(q*price,100n);qty+=q;total+=v;allocations.push({front:Number(front.number),name:front.name,quantity:decimal(q),totalCents:String(v)});
        }
        if(!allocations.length)throw Error('Informe uma quantidade, inclusive zero quando aplicável, em ao menos uma frente.');
        if(qty>MAX||total>MAX)throw Error('Quantidade ou valor total excede o limite.');
        if(scaled(row.quantity)!==qty||rational(row.quantity)[0]*100n!==qty*rational(row.quantity)[1])warn(row.id,`Item ${row.number}: quantidade original ${row.quantity}; exportação ${decimal(qty)}. Confira a adaptação de precisão e a distribuição por frentes.`);
        if(BigInt(row.totalCents ?? 0)!==total)warn(row.id,`Item ${row.number}: diferença financeira de R$ ${signed(total-BigInt(row.totalCents ?? 0))} em relação ao orçamento.`);
        const [bn,bd]=rational(row.bdi);if(bn*10000n!==bdi*bd)warn(row.id,'BDI aproximado a duas casas percentuais.');
        if(c.source!=='SINAPI')warn(row.id,`Item ${row.number}: conferir fonte ${c.source} e código ${code} no destino; origem ${row.source} preservada no relatório.`);
        const item={id:row.id,number:row.number,group:g.id,groupNumber:Number(g.number),code,originalCode:row.code,source:c.source,description:c.description,unit:c.unit,referenceCents:String(reference),costCents:String(cost),bdiPoints:Number(bdi),priceCents:String(price),quantity:decimal(qty),totalCents:String(total),originalTotalCents:String(row.totalCents??0),note:c.note,allocations};
        if(errors.length===startErrors)items.push(item);
      }catch(e){error(row.id,`Item ${row.number} (${row.code}): ${e.message}`);}
    }
    for(const g of config.groups){const members=items.filter(i=>i.group===g.id);if(!members.length)continue;
      if(members.length>999)error(g.id,'Cada macrosserviço permite até 999 serviços.');
      const total=members.reduce((a,i)=>a+BigInt(i.totalCents),0n);if(total>MAX)error(g.id,'Total do macrosserviço acima do limite.');
      const schedule=[],seen=new Set();let sum=0n;
      for(const s of config.schedule.filter(s=>s.group===g.id)){try{const period=Number(s.period),p=exact(s.percent);if(!Number.isInteger(period)||period<1||period>duration||seen.has(period)||p>10000n)throw Error('Período ou percentual inválido/repetido.');seen.add(period);sum+=p;if(p)schedule.push({period,points:Number(p)});}catch(e){error(g.id,`Cronograma de ${g.name}: ${e.message}`);}}
      if(sum!==10000n)error(g.id,`Cronograma de ${g.name}: o planejamento completo deve fechar em 100,00% (atual ${decimal(sum)}%).`);
      groups.push({id:g.id,number:Number(g.number),name:g.name,totalCents:String(total),schedule:schedule.sort((a,b)=>a.period-b.period)});
    }
    const original=selected.reduce((a,c)=>a+BigInt(snapshot.items.find(r=>r.id===c.id)?.totalCents??0),0n),total=items.reduce((a,i)=>a+BigInt(i.totalCents),0n);
    if(total>MAX)error('total','Total da submeta acima do limite do layout.');
    return {version:VERSION,profile:config.profile,sheetNames:[profile?.po,profile?.cff],documentation:DOCUMENTATION,submeta:config.submeta,project:{id:snapshot.projectId,name:snapshot.name,version:snapshot.version,uf:snapshot.uf,reference:snapshot.ref,regime:snapshot.regime},errors,warnings,items,groups,fronts:config.fronts,duration,originalCents:String(original),exportCents:String(total),differenceCents:String(total-original),homologated:false};
  }
  const xml = value => String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function workbook(plan) {
    if(plan.errors.length)throw Error('Corrija as pendências antes de gerar o BM.');
    const po=[PO],cff=[CFF],merges=[],cffMerges=[];
    for(const group of plan.groups){
      const row=Array(17).fill('');row[0]='Macrosserviço';row[1]=String(group.number);row[4]=group.name;row[11]=money(group.totalCents);po.push(row);
      let index=0;
      for(const item of plan.items.filter(i=>i.group===group.id)){
        const start=po.length+1;index++;
        item.allocations.forEach((f,j)=>{const line=Array(17).fill('');if(!j)Object.assign(line,{0:'Serviço',1:`${group.number}.${index}`,2:item.source,3:item.code,4:item.description,5:Number(item.quantity),6:item.unit,7:money(item.referenceCents),8:money(item.costCents),9:{v:item.bdiPoints/10000,style:2},10:money(item.priceCents),11:money(item.totalCents),12:item.note});Object.assign(line,{13:String(f.front),14:f.name,15:Number(f.quantity),16:money(f.totalCents)});po.push(line);});
        if(item.allocations.length>1)for(let c=0;c<13;c++)merges.push(`${col(c)}${start}:${col(c)}${po.length}`);
      }
      const start=cff.length+1;group.schedule.forEach((s,j)=>cff.push([j?'':String(group.number),j?'':group.name,String(s.period),decimal(s.points).replace('.',',')+'%']));
      if(group.schedule.length>1)cffMerges.push(`A${start}:A${cff.length}`,`B${start}:B${cff.length}`);
    }
    return {sheets:[{name:plan.sheetNames[0],rows:po,merges},{name:plan.sheetNames[1],rows:cff,merges:cffMerges}],files:xlsxFiles([{name:plan.sheetNames[0],rows:po,merges},{name:plan.sheetNames[1],rows:cff,merges:cffMerges}])};
  }
  function col(i){let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;}
  function xlsxFiles(sheets){
    const files=[{name:'[Content_Types].xml',data:`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
      {name:'_rels/.rels',data:'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name:'xl/workbook.xml',data:`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`},
      {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
      {name:'xl/styles.xml',data:'<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'}];
    sheets.forEach((s,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${col(s.rows[0].length-1)}${s.rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${s.rows.map((r,ri)=>`<row r="${ri+1}">${r.map((c,ci)=>{if(c===''||c==null)return '';const cell=typeof c==='object'?c:{v:c},ref=col(ci)+(ri+1);return typeof cell.v==='number'?`<c r="${ref}" s="${cell.style||1}"><v>${cell.v}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(cell.v)}</t></is></c>`;}).join('')}</row>`).join('')}</sheetData>${s.merges.length?`<mergeCells count="${s.merges.length}">${s.merges.map(r=>`<mergeCell ref="${r}"/>`).join('')}</mergeCells>`:''}</worksheet>`}));return files;
  }
  const api={VERSION,PO,CFF,UNITS,PROFILES,canonical,rational,round,scaled,exact,decimal,unit,enabled,distribute,defaults,suggested,validateConfiguration,prepare,workbook};
  G.TransferegovBM=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
