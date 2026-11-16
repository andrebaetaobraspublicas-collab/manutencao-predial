import { NotFoundException } from '@nestjs/common';
import { ContractService } from './contract.service';
describe('Contract service isolation boundary',()=>{
 const user:any={tenantId:'tenant-a',userId:'user-a'};
 it('scopes ownership before reading ledger and does not disclose another owner contract',async()=>{
  const query=jest.fn().mockResolvedValue([]),db:any={query};const svc=new ContractService(db,{} as any,{} as any,{} as any);
  await expect(svc.detail(user,'foreign-id')).rejects.toBeInstanceOf(NotFoundException);
  expect(query).toHaveBeenCalledTimes(1);expect(query.mock.calls[0][0]).toContain('c.tenant_id=? AND c.owner_id=?');expect(query.mock.calls[0][1]).toEqual(['foreign-id','tenant-a','user-a']);
 });
 it('filters listing by both tenant and authenticated owner',async()=>{
  const query=jest.fn().mockResolvedValue([]),svc=new ContractService({query} as any,{} as any,{} as any,{} as any);
  await expect(svc.list(user)).resolves.toEqual([]);expect(query.mock.calls[0][1]).toEqual(['tenant-a','user-a']);
 });
 it('refuses Infra missing unit cost even when the adapter exported a zero line total',async()=>{
  const transaction=jest.fn(),source={id:'infra-source',name:'Infra',version:1,data:{root:{children:[{id:'i',kind:'item',code:'1',desc:'Serviço pendente',unit:'UN'}]}}};
  const infra={contractSnapshot:jest.fn().mockResolvedValue({project:source,calculation:{items:[{id:'i',code:'1',quantity:1,unitCostCents:null,priceCents:0}]}})};
  const service=new ContractService({transaction} as any,{} as any,{} as any,infra as any);
  await expect(service.demo(user,{sourceProduct:'INFRA',sourceProjectId:source.id,expectedSourceVersion:1,regime:'UNIT_PRICE'})).rejects.toThrow(/Infra.*custo unitário definido/);
  expect(transaction).not.toHaveBeenCalled();
 });
 it('keeps explicit zero Infra costs distinct from missing costs and captures positive totals unchanged',async()=>{
  const source={id:'infra-source',name:'Infra',version:1,data:{root:{children:[{id:'zero',kind:'item',code:'1',desc:'Gratuito',unit:'UN'},{id:'paid',kind:'item',code:'2',desc:'Serviço',unit:'UN'}]}}};
  const infra={project:async()=>source,contractSnapshot:async()=>({project:source,calculation:{items:[{id:'zero',code:'1',quantity:1,unitCostCents:0,priceCents:0},{id:'paid',code:'2',quantity:1,unitCostCents:100,priceCents:120}]}})};
  const service=new ContractService({} as any,{} as any,{} as any,infra as any),preview:any=await service.preview(user,'INFRA',source.id);
  expect(preview.originalValue).toBe('1.20');expect(preview.items[0].unitPrice).toBe('0.000000');expect(preview.items[1].unitPrice).toBe('1.200000');
 });
 it('captures SICRO rows with descriptions and units, omitting only exact zero quantity/total with visible memory',async()=>{
  const source={id:'infra-source',name:'Rodovia',version:1,data:{root:{children:[{id:'zero',kind:'item',code:'1'},{id:'paid',kind:'item',code:'2'}]}}};
  const calculation={items:[{id:'zero',code:'1',quantity:0,unitCostCents:500,priceCents:0},{id:'paid',code:'2',description:'Terraplenagem',unit:'m³',quantity:2,unitCostCents:100,priceCents:240}]};
  const infra={project:async()=>source,contractSnapshot:async()=>({project:source,calculation})};
  const service=new ContractService({} as any,{} as any,{} as any,infra as any);
  const preview:any=await service.preview(user,'INFRA',source.id);
  expect(preview.items).toHaveLength(1);expect(preview.items[0]).toMatchObject({id:'paid',number:'2',description:'Terraplenagem',unit:'m³',originalTotal:'2.40'});
  expect(preview.captureWarnings.join(' ')).toMatch(/quantidade e total zerados/);expect(source.data.root.children).toHaveLength(2);
  calculation.items[0].priceCents=1;await expect(service.preview(user,'INFRA',source.id)).rejects.toThrow(/pendente/);
 });
 it('keeps Infra preview hash stable across transient runtime project timestamps',async()=>{
  const source={id:'infra-source',name:'Infra',version:1,data:{root:{children:[{id:'i',kind:'item',code:'1'}]}}};let run=0;
  const infra={project:async()=>source,contractSnapshot:async()=>({project:source,calculation:{items:[{id:'i',code:'1',description:'Serviço',unit:'m',quantity:1,unitCostCents:100,priceCents:120}],scurve:{total:120,rows:[]},project:{sync:{at:++run},generatedId:String(run)}}})};
  const service=new ContractService({} as any,{} as any,{} as any,infra as any);
  const first:any=await service.preview(user,'INFRA',source.id),second:any=await service.preview(user,'INFRA',source.id);
  expect(first.sourceHash).toBe(second.sourceHash);expect(first.captureWarnings.join(' ')).toMatch(/Origem sem eventograma/);source.data.root.children[0].code='2';
  await expect(service.preview(user,'INFRA',source.id)).rejects.toThrow(/pendente/);
 });
 it.each([
  {label:'empty budget',rows:[],message:/totais positivos/},
  {label:'zero total',rows:[{code:'1',qty:1,total:0}],message:/totais positivos/},
  {label:'positive quantity rounded to zero',rows:[{code:'1',qty:0.0000001,total:100}],message:/quantidade.*zerada/i},
  {label:'negative source price',rows:[{code:'1',qty:1,total:-100}],message:/preço pendente/},
 ])('refuses $label before opening a transaction',async({rows,message})=>{
  const transaction=jest.fn(),source={id:'source',name:'Example',version:1,data:{root:{children:rows.map(r=>({id:'item',kind:'item',code:r.code,desc:'Item',unit:'UN'}))}}};
  const orcapro={project:jest.fn().mockResolvedValue(source),calculation:jest.fn().mockResolvedValue({version:1,summary:{items:rows}})};
  const svc=new ContractService({transaction} as any,orcapro as any,{enabledFor:async()=>true} as any,{} as any);
  await expect(svc.demo(user,{sourceProduct:'ORCAPRO',sourceProjectId:'source',expectedSourceVersion:1,regime:'UNIT_PRICE'})).rejects.toThrow(message);
  expect(transaction).not.toHaveBeenCalled();
 });
});
