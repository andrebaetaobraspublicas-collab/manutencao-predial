import * as XLSX from '@e965/xlsx';
import { ContractExport } from './contract-export';

function fixture(regime='UNIT_PRICE'){
 const measurement={id:'m1',period:'BM 05',executionDate:'2027-03-31',status:'APPROVED',gross:'150.46',deduction:'5.00',paid:'100.00',lines:[{itemId:'i1',presentedQuantity:'2',quantity:'2',disallowedQuantity:'0',price:'75.23',amount:'150.46'}],eventIds:['e1'],eventLines:[{eventId:'e1',amount:'150.46'}]};
 const rows=Array.from({length:283},(_,i)=>({id:'i'+i,number:`${Math.floor(i/20)+1}.${i%20+1}`,code:`SINAPI-${i}`,description:'Serviço de execução do edifício, incluindo materiais, mão de obra e equipamentos conforme composição de referência e projeto executivo.',unit:'m²',groupName:'Etapa '+(Math.floor(i/20)+1),contractQuantity:'10',previousQuantity:'3',periodQuantity:i===0?'2':'0',accumulatedQuantity:i===0?'5':'3',remainingQuantity:i===0?'5':'7',unitPrice:'75.230000',previousAmount:'225.69',periodAmount:i===0?'150.46':'0.00',accumulatedAmount:i===0?'376.15':'225.69',baseValue:'752.30',currentValue:'752.30',remainingValue:i===0?'376.15':'526.61'}));
 const detail={contract:{name:'Edifício residencial multifamiliar - 4 pavimentos',regime,version:42,demo:true,sourceHash:'a'.repeat(64)},items:[{id:'i1',code:'SINAPI-0',description:'Serviço',unit:'m²'}],events:[{id:'e1',name:'Estrutura',value:'150.46'}],measurements:[measurement]};
 const contracts={detail:jest.fn().mockResolvedValue(detail),worksheet:jest.fn().mockResolvedValue({rows,measurement,version:10,historical:true})};
 return {report:new ContractExport(contracts as any),contracts};
}
describe('Boletim analítico completo',()=>{
 it('exporta todas as 283 linhas e usa a fotografia histórica, conservando a aba de compatibilidade',async()=>{
  const f=fixture(),file=await f.report.measurement({tenantId:'t'} as any,'c','m1','xlsx');
  expect(f.contracts.worksheet).toHaveBeenCalledWith({tenantId:'t'},'c',undefined,'m1');
  const book=XLSX.read(file.buffer,{type:'buffer'}),rows=XLSX.utils.sheet_to_json<any[]>(book.Sheets.Planilha,{header:1});
  expect(rows.length).toBe(284);expect(rows[1][5]).toBe(10);expect(rows[1][6]).toBe(3);expect(rows[1][7]).toBe(2);expect(rows[1][8]).toBe(5);expect(rows[1][9]).toBe(5);expect(rows[1][12]).toBe(150.46);
  expect(rows[2][7]).toBe(0);expect(book.SheetNames).toContain('Itens');expect(book.Sheets.Planilha['!autofilter']).toBeDefined();
 });
 it('gera PDF tabular com cabeçalhos repetidos para um orçamento extenso',async()=>{
  const file=await fixture().report.measurement({tenantId:'t'} as any,'c','m1','pdf');
  expect(file.buffer.subarray(0,5).toString()).toBe('%PDF-');expect(file.buffer.length).toBeGreaterThan(15000);
  const pages=file.buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)||[];expect(pages.length).toBeGreaterThan(1);expect(pages.length).toBeLessThan(20);
  if(process.env.GESTAO_EXPORT_QA_DIR){const fs=await import('node:fs');fs.mkdirSync(process.env.GESTAO_EXPORT_QA_DIR,{recursive:true});fs.writeFileSync(process.env.GESTAO_EXPORT_QA_DIR+'/boletim-283-itens.pdf',file.buffer);}
 });
 it('inclui planilha do eventograma sem somar automaticamente linhas-pai',async()=>{
  const f=fixture('GLOBAL_PRICE');f.contracts.worksheet.mockResolvedValueOnce({rows:[{number:'E1',description:'Estrutura',baseValue:'150.46',currentValue:'150.46',periodAmount:'150.46',previousAmount:'0.00',accumulatedAmount:'150.46',remainingValue:'0.00',isAggregate:true}],measurement:{},version:3,historical:true} as any);
  const file=await f.report.measurement({tenantId:'t'} as any,'c','m1','xlsx'),book=XLSX.read(file.buffer,{type:'buffer'}),rows=XLSX.utils.sheet_to_json<any[]>(book.Sheets.Planilha,{header:1});
  expect(rows[1][0]).toBe('Subtotal - não somar');expect(rows[1][6]).toBe(150.46);
 });
});

describe('Exportações de alterações contratuais',()=>{
 const user={tenantId:'tenant-a'} as any;
 function setup(){
  const item={id:'i',number:'1.1',code:'A',description:'Concreto',unit:'m3',originalQuantity:'10',quantity:'12',unitPrice:'100',originalTotal:'1000',baseTotal:'1200',currentPrice:'105.12',currentTotal:'1261.44'};
  const summary={originalValue:'1000',currentValue:'1200',currentPricedValue:'1261.44',baseRoundingAdjustment:'0',priceRoundingAdjustment:'0',paradigmValue:'1500'};
  const amendment={id:'a',title:'TA01',effectiveDate:'2027-01-01',reason:'Ampliação',lines:[{itemId:'i',additionQuantity:'2',additionValue:'200',suppressionQuantity:'0',suppressionValue:'0'}],compensation:{originalDiscount:'0.2',currentDiscount:'0.2',compatibleAmount:'1200',required:'0',toRefund:'0'},limits:{additionPercent:'20',suppressionPercent:'0',notice:''}};
  const contracts={detail:jest.fn().mockResolvedValue({contract:{id:'c',name:'Edifício',regime:'UNIT_PRICE',version:9,demo:true},items:[item],priceRules:[{id:'r',itemId:'i',title:'AP01',mode:'INDEX',effectiveDate:'2027-10-01',price:'105.12',basePrice:'100',components:[{weight:'1',baseIndex:'100',currentIndex:'105.12'}]},{id:'future',itemId:'i',title:'AP futuro',mode:'REEQUILIBRIUM',effectiveDate:'2028-01-01',price:'200'}]}),worksheet:jest.fn().mockResolvedValue({date:'2027-10-01',items:[item],events:[],summary,version:4,amendment,before:{items:[{...item,quantity:'10',baseTotal:'1000'}],summary:{currentValue:'1000',baseRoundingAdjustment:'0'}}})};
  return {contracts,report:new ContractExport(contracts as any)};
 }
 it('concilia acréscimos e totais e solicita a fotografia do termo',async()=>{
  const f=setup(),file=await f.report.amendment(user,'c','a','xlsx'),wb=XLSX.read(file.buffer,{type:'buffer'}),rows=XLSX.utils.sheet_to_json<any[]>(wb.Sheets.Aditivo,{header:1});
  expect(f.contracts.worksheet).toHaveBeenCalledWith(user,'c',undefined,undefined,'a');
  expect(rows[1][10]).toBe(200);expect(rows[1][14]).toBe(1200);expect(rows.at(-1)?.[14]).toBe(1200);
  const zip=XLSX.CFB.read(file.buffer,{type:'buffer'}),xml=Buffer.from(XLSX.CFB.find(zip,'/xl/worksheets/sheet2.xml')!.content as any).toString();expect(xml).toContain('state="frozen"');expect(xml.match(/<pageMargins/g)).toHaveLength(1);
 });
 it('exporta preços numéricos e exclui regras posteriores à data selecionada',async()=>{
  const f=setup(),file=await f.report.prices(user,'c','2027-10-01','xlsx'),wb=XLSX.read(file.buffer,{type:'buffer'}),rows=XLSX.utils.sheet_to_json<any[]>(wb.Sheets.Reajustes,{header:1}),rules=XLSX.utils.sheet_to_json<any[]>(wb.Sheets['Atos de preços'],{header:1});
  expect(f.contracts.worksheet).toHaveBeenCalledWith(user,'c','2027-10-01');expect(rows[1][6]).toBe(105.12);expect(rows[1][7]).toBe(5.12);expect(rows.at(-1)?.[8]).toBe(1261.44);expect(rules).toHaveLength(2);expect(rules[1][0]).toBe('AP01');
 });
 it('propaga negação de acesso sem produzir arquivos ou consultar planilhas',async()=>{
  const f=setup();f.contracts.detail.mockRejectedValue(new Error('Forbidden tenant'));
  await expect(f.report.amendment(user,'c','a','pdf')).rejects.toThrow('Forbidden tenant');await expect(f.report.prices(user,'c','2027-10-01','xlsx')).rejects.toThrow('Forbidden tenant');expect(f.contracts.worksheet).not.toHaveBeenCalled();
 });
 it('recusa formatos inválidos antes de ler dados',async()=>{const f=setup();await expect(f.report.prices(user,'c',undefined,'html')).rejects.toThrow('Formato');expect(f.contracts.detail).not.toHaveBeenCalled();});
});
