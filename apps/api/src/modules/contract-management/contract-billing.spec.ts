import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe-gestao';
import { ContractBillingService } from './contract-billing.service';
import { ContractBillingGuard } from './contract-billing.controller';

jest.mock('stripe-gestao',()=>({__esModule:true,default:jest.fn()}));
const user:any={tenantId:'tenant-a',userId:'user-a',email:'person@example.test'};
function setup(overrides:Record<string,any>={}) {
 const config=new ConfigService({GESTAO_STRIPE_SECRET_KEY:'rk_test_fixture',GESTAO_STRIPE_MODE:'test',GESTAO_STRIPE_PRICE_ID:'price_gc',GESTAO_STRIPE_WEBHOOK_SECRET:'whsec_fixture',GESTAO_ADMIN_EMAIL:'admin@example.invalid',GESTAO_ADMIN_USER_IDS:'admin-a',WEB_BASE_URL:'https://gestaodepredios.com.br',CORS_ORIGINS:'https://gestaodepredios.com.br',...overrides});
 const db:any={enabled:jest.fn(()=>true),query:jest.fn().mockResolvedValue([]),transaction:jest.fn()};
 const client:any={webhooks:{constructEvent:jest.fn()},subscriptions:{retrieve:jest.fn(),update:jest.fn()},prices:{retrieve:jest.fn()},checkout:{sessions:{create:jest.fn(),retrieve:jest.fn()}},customers:{create:jest.fn()},billingPortal:{sessions:{create:jest.fn()}}};
 (Stripe as any).mockImplementation(()=>client);
 const service=new ContractBillingService(db,config);return {service,db,client,config};
}
describe('Gestão billing independent test environment',()=>{
 beforeEach(()=>jest.clearAllMocks());
 it('refuses live keys before calling Stripe or database',async()=>{
  const {service,db}=setup({GESTAO_STRIPE_SECRET_KEY:'sk_live_fixture'});
  await expect(service.webhook(Buffer.from('{}'),'signature')).rejects.toBeInstanceOf(ServiceUnavailableException);
  expect(db.query).not.toHaveBeenCalled();expect(Stripe).not.toHaveBeenCalled();
 });
 it('rejects an invalid signature before any ownership query',async()=>{
  const {service,db,client}=setup();client.webhooks.constructEvent.mockImplementation(()=>{throw Error('bad');});
  await expect(service.webhook(Buffer.from('{}'),'bad')).rejects.toBeInstanceOf(BadRequestException);expect(db.query).not.toHaveBeenCalled();
 });
 it('refuses a validly signed production event',async()=>{
  const {service,db,client}=setup();client.webhooks.constructEvent.mockReturnValue({livemode:true});
  await expect(service.webhook(Buffer.from('{}'),'sig')).rejects.toBeInstanceOf(ForbiddenException);expect(db.query).not.toHaveBeenCalled();
 });
 it('never uses event metadata to find or grant ownership',async()=>{
  const {service,db,client}=setup();client.webhooks.constructEvent.mockReturnValue({id:'evt_1',livemode:false,type:'checkout.session.completed',data:{object:{customer:'unknown_customer',subscription:'sub_bad',metadata:{tenantId:user.tenantId,userId:user.userId}}}});
  expect(await service.webhook(Buffer.from('{}'),'sig')).toEqual({received:true,ignored:true});expect(db.transaction).not.toHaveBeenCalled();expect(client.subscriptions.retrieve).not.toHaveBeenCalled();
 });
 it('replayed webhook does not apply the subscription twice',async()=>{
  const {service,db,client}=setup();client.webhooks.constructEvent.mockReturnValue({id:'evt_1',livemode:false,type:'customer.subscription.updated',data:{object:{id:'sub_1',customer:'cus_1'}}});
  db.query.mockResolvedValue([{tenant_id:user.tenantId,owner_id:user.userId}]);
  const tx={query:jest.fn().mockResolvedValueOnce([{customer_id:'cus_1'}]).mockResolvedValueOnce([{id:'evt_1'}])};db.transaction.mockImplementation((f:any)=>f(tx));
  await service.webhook(Buffer.from('{}'),'sig');expect(client.subscriptions.retrieve).not.toHaveBeenCalled();expect(tx.query).toHaveBeenCalledTimes(2);
 });
 it('reconciles current Stripe state for delayed events and scopes all writes to the mapped owner',async()=>{
  const {service,db,client}=setup();client.webhooks.constructEvent.mockReturnValue({id:'evt_old',created:100,livemode:false,type:'customer.subscription.updated',data:{object:{id:'sub_1',customer:'cus_1',status:'active'}}});
  db.query.mockResolvedValue([{tenant_id:user.tenantId,owner_id:user.userId}]);
  const tx={query:jest.fn().mockResolvedValueOnce([{customer_id:'cus_1',subscription_id:'sub_1'}]).mockResolvedValue([])};db.transaction.mockImplementation((f:any)=>f(tx));
  client.subscriptions.retrieve.mockResolvedValue({id:'sub_1',customer:'cus_1',livemode:false,status:'canceled',cancel_at_period_end:false,items:{data:[{price:{id:'price_gc'},current_period_end:200}]}});
  await service.webhook(Buffer.from('{}'),'sig');
  expect(tx.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE GcBillingAccount'),['sub_1','canceled',new Date(200000),false,user.tenantId,user.userId]);
  expect(tx.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO GcBillingEvent'),['evt_old',user.tenantId,user.userId,'customer.subscription.updated',expect.any(String),100]);
 });
 it('cannot create own contracts using only another owner team entitlement',async()=>{
  const {service,db}=setup();db.query.mockImplementation(async(sql:string)=>sql.includes('GcMember')?[{owner_id:'admin-a'}]:[]);
  expect(await service.allowed(user)).toBe(true);expect(await service.allowedOwn(user)).toBe(false);
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('m.tenant_id=? AND m.user_id=?'),[user.tenantId,user.userId]);
 });
 it('acknowledges an old terminal subscription after resubscription without reverting access',async()=>{
  const {service,db,client}=setup();client.webhooks.constructEvent.mockReturnValue({id:'evt_old_deleted',created:99,livemode:false,type:'customer.subscription.deleted',data:{object:{id:'sub_old',customer:'cus_1'}}});
  db.query.mockResolvedValue([{tenant_id:user.tenantId,owner_id:user.userId}]);
  const tx={query:jest.fn().mockResolvedValueOnce([{customer_id:'cus_1',subscription_id:'sub_new'}]).mockResolvedValue([])};db.transaction.mockImplementation((f:any)=>f(tx));
  client.subscriptions.retrieve.mockResolvedValueOnce({id:'sub_old',customer:'cus_1',livemode:false,status:'canceled',items:{data:[{price:{id:'price_gc'},current_period_end:200}]}}).mockResolvedValueOnce({id:'sub_new',status:'active'});
  await service.webhook(Buffer.from('{}'),'sig');
  expect(tx.query.mock.calls.some((c:any[])=>c[0].startsWith('UPDATE GcBillingAccount'))).toBe(false);
  expect(tx.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO GcBillingEvent'),expect.arrayContaining(['evt_old_deleted',user.tenantId,user.userId]));
 });
 it('checks the target contract owner instead of borrowing another owner licence',async()=>{
  const {service,db}=setup();db.query.mockResolvedValueOnce([{owner_id:'owner-a',status:'canceled',current_period_end:new Date(Date.now()+10000)}]).mockResolvedValueOnce([{owner_id:'admin-a'}]);
  expect(await service.allowedContract(user,'contract-a')).toBe(false);
  expect(await service.allowedContract(user,'contract-b')).toBe(true);
  expect(db.query).toHaveBeenNthCalledWith(1,expect.stringContaining('c.id=? AND c.tenant_id=?'),['contract-a',user.tenantId]);
 });
 it('expired or risk-blocked subscriptions do not grant access',async()=>{
  const {service,db}=setup();db.query.mockResolvedValueOnce([{status:'active',current_period_end:new Date(1)}]);expect(await service.allowedOwn(user)).toBe(false);
  db.query.mockResolvedValueOnce([{status:'active',current_period_end:new Date(Date.now()+100000),risk_blocked:true}]);expect(await service.allowedOwn(user)).toBe(false);
 });
 it('keeps billing accessible without entitlement but enforces identity/origin/development',()=>{
  const {db,config}=setup(),guard=new ContractBillingGuard(db,config);
  const ctx=(request:any)=>({switchToHttp:()=>({getRequest:()=>request})}) as any;
  expect(guard.canActivate(ctx({user,method:'GET',headers:{}}))).toBe(true);
  expect(()=>guard.canActivate(ctx({user,method:'POST',headers:{origin:'https://foreign.example'}}))).toThrow();
  expect(()=>guard.canActivate(ctx({method:'GET',headers:{}}))).toThrow();
  db.enabled.mockReturnValue(false);expect(()=>guard.canActivate(ctx({user,method:'GET',headers:{}}))).toThrow();
 });
});

describe('Gestão SaaS Stripe administration',()=>{
 beforeEach(()=>jest.clearAllMocks());
 const target={id:'profile-1',tenant_id:'customer-tenant',user_id:'customer-user'};
 const request={expectedVersion:4,requestId:'5e2c8a89-d507-4450-94d0-35c1d43db844',reason:'Conferência autorizada',action:'CANCEL_AT_PERIOD_END' as const};
 function adminSetup(){
  const f=setup(),access:any={assertAdmin:jest.fn()},service=new ContractBillingService(f.db,f.config,access);
  const row={version:4,customer_id:'cus_own',subscription_id:'sub_own',risk_blocked:true};
  const sub={id:'sub_own',customer:'cus_own',livemode:false,status:'active',cancel_at_period_end:false,items:{data:[{price:{id:'price_gc'},current_period_end:1800000000}]}};
  f.db.query.mockResolvedValue([]);const sql={query:jest.fn().mockImplementation(async(q:string)=>q.startsWith('SELECT * FROM GcBillingAccount')?[row]:[])};
  f.db.transaction.mockImplementation((fn:any)=>fn(sql));f.client.subscriptions.retrieve.mockResolvedValue(sub);f.client.subscriptions.update.mockImplementation(async(_id:string,data:any)=>({...sub,...data}));
  return {...f,service,access,row,sub,sql};
 }
 it.each(['SYNC','CANCEL_AT_PERIOD_END','RESUME'] as const)('reconciles %s only for the locked customer and leaves risk controls intact',async(action)=>{
  const f=adminSetup();await f.service.adminAction(user,target,{...request,action});
  expect(f.access.assertAdmin).toHaveBeenCalledWith(user);
  if(action==='SYNC')expect(f.client.subscriptions.update).not.toHaveBeenCalled();
  else expect(f.client.subscriptions.update).toHaveBeenCalledWith('sub_own',{cancel_at_period_end:action==='CANCEL_AT_PERIOD_END'},{idempotencyKey:`gestao-admin-profile-1-${request.requestId}-${action}`});
  const updates=f.sql.query.mock.calls.filter(c=>c[0].startsWith('UPDATE'));
  expect(updates).toHaveLength(1);expect(updates[0][0]).not.toContain('risk_blocked=');expect(updates[0][1].slice(-2)).toEqual(['customer-tenant','customer-user']);
 });
 it('rejects stale versions before calling Stripe',async()=>{const f=adminSetup();await expect(f.service.adminAction(user,target,{...request,expectedVersion:3})).rejects.toBeInstanceOf(ConflictException);expect(f.client.subscriptions.retrieve).not.toHaveBeenCalled();});
 it.each(['customer','livemode','product'])('rejects %s mismatch before changing billing',async(kind)=>{const f=adminSetup();f.client.subscriptions.retrieve.mockResolvedValue({...f.sub,...(kind==='customer'?{customer:'foreign'}:kind==='livemode'?{livemode:true}:{items:{data:[{price:{id:'price_other'}}]}})});await expect(f.service.adminAction(user,target,request)).rejects.toBeInstanceOf(ForbiddenException);expect(f.client.subscriptions.update).not.toHaveBeenCalled();});
 it('cannot resume a subscription already ended',async()=>{const f=adminSetup();f.client.subscriptions.retrieve.mockResolvedValue({...f.sub,status:'canceled'});await expect(f.service.adminAction(user,target,{...request,action:'RESUME'})).rejects.toBeInstanceOf(BadRequestException);expect(f.client.subscriptions.update).not.toHaveBeenCalled();});
 it('disabled default plan cannot be purchased through an omitted plan id',async()=>{const f=setup();f.db.query.mockResolvedValue([{active:false,stripe_price_id:'price_gc'}]);await expect(f.service.checkout(user,request.requestId)).rejects.toBeInstanceOf(BadRequestException);expect(f.client.customers.create).not.toHaveBeenCalled();});
 it('validates exact cents and product ownership when registering a Stripe price',async()=>{const f=setup();f.client.prices.retrieve.mockResolvedValue({id:'price_gc',active:true,livemode:false,type:'recurring',currency:'brl',product:'prod_gc',unit_amount:100,recurring:{interval:'month',interval_count:1}});await expect(f.service.validatePrice('price_gc','1.00','MONTH')).resolves.toBeDefined();await expect(f.service.validatePrice('price_gc','1.01','MONTH')).rejects.toBeInstanceOf(BadRequestException);});
});
