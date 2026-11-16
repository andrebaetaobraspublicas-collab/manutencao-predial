import * as XLSX from '@e965/xlsx';
import PDFDocument from 'pdfkit';
import { decimal } from './contract-state';

export type ReportColumn={label:string;key:string;width:number;numeric?:boolean;quantity?:boolean};
export type ReportTable={name:string;columns:ReportColumn[];rows:any[];pdf?:boolean};
export type ContractReport={title:string;metadata:any[][];tables:ReportTable[];notes:any[][]};
const clean=(v:unknown)=>String(v??'').replace(/[\u2010-\u2015]/g,'-').replace(/\u2212/g,'-');
const numeric=(v:unknown)=>Number(String(v??'0'));
function display(v:unknown,c:ReportColumn){
 if(!c.numeric){const value=clean(v);return /^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):value;}
 if(v==null||v==='')return '';
 const [whole,fraction]=decimal(v).toFixed(c.quantity?6:2).split('.');
 const digits=c.quantity?fraction.replace(/0+$/,''):fraction;
 return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(digits?','+digits:'');
}
function sheet(data:any[][],widths:number[],numericCols:number[]=[],quantities:number[]=[]){
 const s=XLSX.utils.aoa_to_sheet(data);s['!cols']=widths.map(wch=>({wch}));
 s['!rows']=data.map((row,r)=>({hpt:r===0?36:Math.min(409,Math.max(22,...row.map((v,i)=>Math.ceil(String(v??'').length/Math.max(8,widths[i]-3))*13+8)))}));
 for(let r=1;r<data.length;r++)for(const c of numericCols){const cell=s[XLSX.utils.encode_cell({r,c})];if(cell&&data[r][c]!=null&&data[r][c]!==''){cell.t='n';cell.v=numeric(data[r][c]);cell.z=quantities.includes(c)?'#,##0.000000':'#,##0.00';}}
 return s;
}
/** Style the OOXML package using the ZIP support already bundled with SheetJS.
 * No change to exported values, formulas or shared strings occurs here. */
function finishWorkbook(wb:XLSX.WorkBook,boldRows:number[][]){
 const cfb=XLSX.CFB.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx',compression:true}),{type:'buffer'});
 const get=(name:string)=>Buffer.from(XLSX.CFB.find(cfb,'/'+name)!.content as any).toString('utf8');
 const put=(name:string,s:string)=>XLSX.CFB.utils.cfb_add(cfb,'/'+name,Buffer.from(s));
 let styles=get('xl/styles.xml');
 styles=styles.replace(/<fonts[^>]*>[\s\S]*?<\/fonts>/,'<fonts count="3"><font><sz val="10"/><color rgb="FF15202B"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FF15202B"/><name val="Arial"/></font></fonts>');
 const fills=styles.match(/<fills count="(\d+)"[^>]*>([\s\S]*?)<\/fills>/)!;const fillIndex=Number(fills[1]);
 styles=styles.replace(fills[0],`<fills count="${fillIndex+2}">${fills[2]}<fill><patternFill patternType="solid"><fgColor rgb="FF15202B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9EEF3"/><bgColor indexed="64"/></patternFill></fill></fills>`);
 const block=styles.match(/<cellXfs count="\d+"[^>]*>([\s\S]*?)<\/cellXfs>/)!,base=block[1].match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g)!;
 const variants=base.flatMap(xf=>[0,1,2].map(kind=>{let open=xf.match(/^<xf\b[^>]*/)?.[0].replace(/\/$/,'')||'<xf';open=open.replace(/ applyAlignment="[^"]*"/,'');open=open.replace(/fontId="\d+"/,`fontId="${kind}"`);if(kind)open=open.replace(/fillId="\d+"/,`fillId="${fillIndex+kind-1}"`);return `${open} applyAlignment="1"><alignment vertical="top" wrapText="1"${kind===1?' horizontal="center"':''}/></xf>`;}));
 styles=styles.replace(block[0],`<cellXfs count="${variants.length}">${variants.join('')}</cellXfs>`);put('xl/styles.xml',styles);
 wb.SheetNames.forEach((_,index)=>{const name=`xl/worksheets/sheet${index+1}.xml`;let xml=get(name);
  xml=xml.replace(/<c\b([^>]*)>/g,(all,attrs)=>{const row=Number(attrs.match(/\br="[A-Z]+(\d+)"/)?.[1]),style=Number(attrs.match(/\bs="(\d+)"/)?.[1]||0),kind=row===1?1:boldRows[index]?.includes(row)?2:0;return '<c'+attrs.replace(/\s+s="\d+"/,'')+` s="${style*3+kind}">`;});
  xml=xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/,'<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
  if(!xml.includes('<pageSetup'))xml=xml.replace(/<pageMargins[^>]*\/>/,'').replace('</worksheet>','<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>');
  put(name,xml);
 });
 return XLSX.CFB.write(cfb,{type:'buffer',fileType:'zip',compression:true}) as Buffer;
}
export function reportXlsx(report:ContractReport){
 const wb=XLSX.utils.book_new(),boldRows:number[][]=[];
 const summaryName=report.tables[0]?.name==='Planilha'&&report.title.startsWith('Boletim')?'Boletim':'Resumo';
 const meta=[['Campo','Informação'],...report.metadata];
 const summary=sheet(meta,[34,105]);
 for(let r=1;r<meta.length;r++){const v=meta[r][1];if(typeof v==='number'){summary[`B${r+1}`].z='#,##0.00';}else if(/^\d{4}-\d{2}-\d{2}$/.test(String(v))){summary[`B${r+1}`]={t:'n',v:(Date.parse(String(v)+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000,z:'dd/mm/yyyy'};}}
 XLSX.utils.book_append_sheet(wb,summary,summaryName);boldRows.push([]);
 wb.Workbook={Names:[]};
 for(const t of report.tables){const data=[t.columns.map(c=>c.label),...t.rows.map(row=>t.columns.map(c=>row[c.key]??''))];const widths=t.columns.map(c=>c.key==='description'?64:Math.max(13,Math.min(34,c.width/5)));
  const s=sheet(data,widths,t.columns.flatMap((c,i)=>c.numeric?[i]:[]),t.columns.flatMap((c,i)=>c.quantity?[i]:[]));
  for(let r=1;r<data.length;r++)for(let c=0;c<t.columns.length;c++){const v=data[r][c];if(!t.columns[c].numeric&&/^\d{4}-\d{2}-\d{2}$/.test(String(v)))s[XLSX.utils.encode_cell({r,c})]={t:'n',v:(Date.parse(String(v)+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000,z:'dd/mm/yyyy'};}
  s['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:data.length-1,c:t.columns.length-1}})};
  XLSX.utils.book_append_sheet(wb,s,t.name);boldRows.push(t.rows.flatMap((r,i)=>r.isAggregate||r.isTotal?[i+2]:[]));
  wb.Workbook.Names!.push({Name:'_xlnm.Print_Titles',Sheet:wb.SheetNames.length-1,Ref:`'${t.name}'!$1:$1`});
 }
 XLSX.utils.book_append_sheet(wb,sheet([['Referência','Conteúdo'],...report.notes],[34,120]),'Evidências');boldRows.push([]);
 return finishWorkbook(wb,boldRows);
}
export async function reportPdf(report:ContractReport){return new Promise<Buffer>((resolve,reject)=>{
 const doc=new PDFDocument({size:'A3',layout:'landscape',margin:30,bufferPages:true,info:{Title:clean(report.title),Author:'OrçaPro Gestão Contratual'}}),chunks:Buffer[]=[];
 doc.on('data',b=>chunks.push(b));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
 const width=doc.page.width-60,bottom=doc.page.height-56;
 const header=()=>{doc.fillColor('#15202b').font('Helvetica-Bold').fontSize(16).text('OrçaPro Gestão Contratual',30,28,{width,height:30,lineBreak:true});doc.font('Helvetica').fontSize(10).text(clean(report.title),30,doc.y+5,{width,height:45,lineBreak:true});doc.moveDown(.6);};
 header();for(const [key,value] of report.metadata){if(['Identificador','Origem SHA-256','Boletim'].includes(key))continue;doc.font('Helvetica').fontSize(9);const text=`${key}: ${typeof value==='number'?display(value,{numeric:true} as ReportColumn):display(value,{numeric:false} as ReportColumn)}`;if(doc.y+doc.heightOfString(text,{width})>bottom){doc.addPage();header();}doc.text(text,30,doc.y,{width});}doc.moveDown();
 report.tables.filter(t=>t.pdf!==false).forEach((table,tableIndex)=>{
  if(tableIndex){doc.addPage();header();}doc.font('Helvetica-Bold').fontSize(11).text(clean(table.name),30,doc.y,{width});doc.moveDown(.4);
  const scale=width/table.columns.reduce((s,c)=>s+c.width,0);
  const head=()=>{doc.font('Helvetica-Bold').fontSize(8);const height=Math.max(34,...table.columns.map(c=>doc.heightOfString(c.label,{width:c.width*scale-8})+12)),y=doc.y;let x=30;doc.rect(30,y,width,height).fill('#e9eef3');doc.fillColor('#263b50');for(const c of table.columns){doc.text(c.label,x+4,y+6,{width:c.width*scale-8,height:height-8,align:c.numeric?'right':'left'});x+=c.width*scale;}doc.y=y+height;};
  head();for(const row of table.rows){doc.font(row.isAggregate||row.isTotal?'Helvetica-Bold':'Helvetica').fontSize(8);const height=Math.max(24,...table.columns.map(c=>doc.heightOfString(display(row[c.key],c),{width:c.width*scale-8})+12));if(doc.y+height>bottom){doc.addPage();header();head();}const y=doc.y;let x=30;if(row.isAggregate||row.isTotal)doc.rect(30,y,width,height).fill('#eef2f7');doc.fillColor('#15202b').font(row.isAggregate||row.isTotal?'Helvetica-Bold':'Helvetica').fontSize(8);for(const c of table.columns){const value=display(row[c.key],c),available=c.width*scale-8;doc.fontSize(8);if(c.numeric){const measured=doc.widthOfString(value);if(measured>available)doc.fontSize(8*available/measured);}doc.text(value,x+4,y+6,{width:available,height:height-8,align:c.numeric?'right':'left',lineBreak:!c.numeric});x+=c.width*scale;}doc.fontSize(8);doc.moveTo(30,y+height).lineTo(30+width,y+height).strokeColor('#dfe4e9').lineWidth(.4).stroke();doc.y=y+height;}
 });
 doc.x=30;doc.moveDown();for(const [key,value] of report.notes){const text=clean(`${key}: ${value??''}`);doc.font('Helvetica').fontSize(9);if(doc.y+doc.heightOfString(text,{width})>bottom){doc.addPage();header();}doc.fillColor('#344b60').text(text,30,doc.y,{width});}
 const pages=doc.bufferedPageRange();for(let p=0;p<pages.count;p++){doc.switchToPage(p);doc.font('Helvetica').fontSize(8).fillColor('#627080').text(`Valores em reais | Página ${p+1} de ${pages.count}`,30,doc.page.height-42,{width,height:12,lineBreak:false});}doc.end();
});}
