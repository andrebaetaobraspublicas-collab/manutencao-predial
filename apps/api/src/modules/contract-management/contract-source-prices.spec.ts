import {ContractService} from './contract.service';
const user:any={userId:'owner',tenantId:'tenant'};
function fixture(product='ORCAPRO'){
 const source={id:'source',name:'Exemplo',version:1,data:{root:{children:[{id:'i',kind:'item',code:'1',desc:'Serviço',unit:'UN'}]}}};
 const db:any={transaction:jest.fn()};const svc=new ContractService(db,{project:async()=>source,calculation:async()=>({version:1,summary:{items:[{code:'1',qty:3,total:10000}]}})} as any,{enabledFor:async()=>true} as any,{project:async()=>source,contractSnapshot:async()=>({project:source,calculation:{items:[{id:'i',code:'1',quantity:3,unitCostCents:3000,priceCents:10000}]}})} as any);
 const dto:any={sourceProduct:product,sourceProjectId:'source',expectedSourceVersion:1,regime:'UNIT_PRICE'};
 const real={name:'Contrato',baseDate:'2026-11-21',reason:'Preços conferidos',referencePrices:[{itemId:'i',price:'33.333333'}]};return {svc,db,source,dto,real};
}
describe('Preços paradigma e contratados na constituição',()=>{
 it.each(['ORCAPRO','INFRA'])('adota proposta editada e preserva paradigma/fonte %s',async product=>{
 const f=fixture(product),original=JSON.stringify(f.source);const p:any=await f.svc.demo(user,f.dto,{preview:true,real:{...f.real,contractedPrices:[{itemId:'i',price:'30'}]}});
 expect(p.originalValue).toBe('90.00');expect(p.paradigmOriginal).toBe('100.00');expect(p.items[0]).toMatchObject({unitPrice:'30',referencePrice:'33.333333',sourceUnitPrice:'33.333333',sourceTotal:'100.00'});expect(JSON.stringify(f.source)).toBe(original);expect(f.db.transaction).not.toHaveBeenCalled();
 });
 it('aceita contratado acima do paradigma e mantém centavos originais sem edição',async()=>{
 const f=fixture();const higher:any=await f.svc.demo(user,f.dto,{preview:true,real:{...f.real,contractedPrices:[{itemId:'i',price:'40'}]}});expect(higher.originalValue).toBe('120.00');
 const unchanged:any=await f.svc.demo(user,f.dto,{preview:true,real:{...f.real,contractedPrices:[{itemId:'i',price:'33.333333'}]}});expect(unchanged.items[0].originalTotal).toBe('100.00');
 });
 it.each([[],[{itemId:'other',price:'10'}],[{itemId:'i',price:'-1'}],[{itemId:'i',price:'1'},{itemId:'i',price:'2'}]].map(prices=>[prices]))('rejeita proposta incompleta ou inválida %j',async prices=>{
 const f=fixture();await expect(f.svc.demo(user,f.dto,{preview:true,real:{...f.real,contractedPrices:prices}})).rejects.toThrow();expect(f.db.transaction).not.toHaveBeenCalled();
 });
});
