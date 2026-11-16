import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ContractRegistration } from './contract-registration';
jest.mock('bcryptjs',()=>({hash:jest.fn(async()=> 'private-hash')}));

function fixture(){
 const plan={id:'plan',name:'Teste',billing_interval:'MONTH',price_brl:'99',stripe_price_id:'price_test'};
 const db:any={enabled:jest.fn(()=>true),query:jest.fn(async(sql:string)=>sql.startsWith('SELECT')?[plan]:{}),transaction:jest.fn(async(fn:any)=>fn(db))};
 const central:any={user:{findUnique:jest.fn(async()=>null),create:jest.fn(async()=>({}))},tenant:{create:jest.fn(async()=>({id:'tenant-new'}))},tenantMembership:{create:jest.fn(async()=>({id:'member-new'}))},orcaproUserAccess:{create:jest.fn(async()=>({}))}};
 const primary:any={$transaction:jest.fn(async(fn:any)=>fn(central))};
 const billing:any={integration:()=>({configured:true}),validatePrice:jest.fn(),checkout:jest.fn(async()=>({url:'https://checkout.stripe.com/test'}))};
 const auth:any={loginGestao:jest.fn(async()=>({user:{userId:'new',tenantId:'tenant-new'},accessToken:'private'}))};
 const service=new ContractRegistration(db,primary,billing,auth);
 return {service,db,central,primary,billing,auth};
}
const dto={name:'Cliente de teste',email:'qa@example.invalid',password:'1234567890abc',planId:'plan'};
describe('Cadastro público Gestão Contratual',()=>{
 it('fails closed outside development before identity or Stripe access',async()=>{
  const f=fixture();f.db.enabled.mockReturnValue(false);
  await expect(f.service.register(dto,{} as any)).rejects.toBeInstanceOf(NotFoundException);
  await expect(f.service.plans()).rejects.toBeInstanceOf(NotFoundException);
  expect(f.primary.$transaction).not.toHaveBeenCalled();expect(f.billing.checkout).not.toHaveBeenCalled();
 });
 it('creates an isolated identity without maintenance, Orcapro, manual trial or admin entitlement',async()=>{
  const f=fixture();const result=await f.service.register(dto,{} as any);
  expect(f.central.tenantMembership.create).toHaveBeenCalledWith({data:expect.objectContaining({tenantId:'tenant-new',maintenanceAccess:false,role:'REQUESTER'})});
  expect(f.central.orcaproUserAccess.create).toHaveBeenCalledWith({data:expect.objectContaining({enabled:false})});
  const insert=f.db.query.mock.calls.find((c:any)=>c[0].startsWith('INSERT INTO GcSaasUser'));
  expect(insert[0]).toContain("'PENDING','STRIPE'");expect(insert[0]).not.toContain('TRIALING');
  expect(result.checkoutUrl).toContain('checkout.stripe.com');
  expect(JSON.stringify(f.db.query.mock.calls)).not.toContain(dto.password);
 });
 it('does not overwrite an existing identity or grant another product',async()=>{
  const f=fixture();f.central.user.findUnique.mockResolvedValue({id:'existing'});
  await expect(f.service.register(dto,{} as any)).rejects.toBeInstanceOf(ConflictException);
  expect(f.central.user.create).not.toHaveBeenCalled();expect(f.auth.loginGestao).not.toHaveBeenCalled();
 });
 it('rejects unavailable plans and UTF-8 passwords exceeding bcrypt limit',async()=>{
  const f=fixture();await expect(f.service.register({...dto,password:'á'.repeat(40)},{} as any)).rejects.toBeInstanceOf(BadRequestException);
  f.db.query.mockResolvedValue([]);await expect(f.service.register(dto,{} as any)).rejects.toBeInstanceOf(BadRequestException);
  expect(f.primary.$transaction).not.toHaveBeenCalled();
 });
 it('leaves a recoverable account and session if Checkout fails without granting a licence',async()=>{
  const f=fixture();f.billing.checkout.mockRejectedValue(new Error('Stripe unavailable'));
  await expect(f.service.register(dto,{} as any)).resolves.toMatchObject({checkoutUrl:null,session:{user:{tenantId:'tenant-new'}}});
  expect(f.db.query.mock.calls.some((c:any)=>c[0].includes('manual_status'))).toBe(false);
 });
 it('never logs in or starts checkout when the central transaction fails after preparing the profile',async()=>{
  const f=fixture();f.primary.$transaction.mockImplementation(async(fn:any)=>{await fn(f.central);throw new Error('commit failed');});
  await expect(f.service.register(dto,{} as any)).rejects.toThrow('Não foi possível concluir');
  expect(f.auth.loginGestao).not.toHaveBeenCalled();expect(f.billing.checkout).not.toHaveBeenCalled();
  expect(f.db.query.mock.calls.some((c:any)=>c[0].startsWith('UPDATE GcSaasUser'))).toBe(false);
 });
});
