import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import Stripe from 'stripe-gestao';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ContractDatabase, ContractSql } from './contract-db';
import { ContractSaasAccess, manualLicence, profileAllowsLogin } from './contract-saas-access';
import { saasAudit } from './contract-saas-audit';
import { Prisma } from '../../generated/prisma/client';
import { contractProduction } from './contract-environment';
import { ContractSources } from './contract-sources';
import type { GcStripeActionDto } from './contract-saas.dto';

const subscriptionEvents = new Set(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed']);
const invoiceEvents = new Set(['invoice.paid','invoice.payment_failed','invoice.payment_action_required','invoice.marked_uncollectible','invoice.voided']);
const checkoutEvents = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed']);
const riskEvents = new Set(['charge.dispute.created','charge.refunded','radar.early_fraud_warning.created']);
const stripeId = (x: any): string | undefined => typeof x === 'string' ? x : x?.id;
const active = (row: any) => !!row && !row.risk_blocked && ['active','trialing'].includes(row.status) && !!row.current_period_end && new Date(row.current_period_end).getTime() > Date.now();

@Injectable()
export class ContractBillingService {
  private client?: Stripe;
  constructor(private readonly db: ContractDatabase, private readonly config: ConfigService, @Optional() private readonly saas?: ContractSaasAccess, @Optional() private readonly sources?: ContractSources) {}
  private live() { return contractProduction(this.config); }
  private sameMode(live: boolean) { return live === this.live(); }
  private async eligible(user: Pick<AuthenticatedUser, 'tenantId' | 'userId'>) {
    if (!this.live()) return { eligible: true, required: false, products: [], message: '' };
    if (!this.sources) return { eligible: false, required: true, products: [], message: 'Integração de origem indisponível.' };
    return this.sources.eligibility(user);
  }
  admin(user: AuthenticatedUser) {
    return this.db.enabled() && user.email.toLowerCase() === String(this.config.get('GESTAO_ADMIN_EMAIL') || '').trim().toLowerCase() && String(this.config.get('GESTAO_ADMIN_USER_IDS') || '').split(',').map(x => x.trim()).includes(user.userId);
  }
  private configured() {
    const key = this.config.get<string>('GESTAO_STRIPE_SECRET_KEY') || '';
    return this.db.enabled() && this.config.get('GESTAO_STRIPE_MODE') === (this.live() ? 'live' : 'test') && new RegExp('^(rk|sk)_' + (this.live() ? 'live' : 'test') + '_').test(key) && !!this.config.get('GESTAO_STRIPE_PRICE_ID') && !!this.config.get('GESTAO_STRIPE_WEBHOOK_SECRET');
  }
  private stripe() {
    if (!this.db.enabled()) throw new NotFoundException();
    if (!this.configured()) throw new ServiceUnavailableException('Assinatura ainda não configurada para este ambiente.');
    return this.client ??= new Stripe(this.config.getOrThrow('GESTAO_STRIPE_SECRET_KEY'), { maxNetworkRetries: 2, timeout: 20000 });
  }
  private async account(user: AuthenticatedUser) {
    return (await this.db.query('SELECT * FROM GcBillingAccount WHERE tenant_id=? AND owner_id=?', [user.tenantId,user.userId]))[0];
  }
  integration() { return {testMode:!this.live(),configured:this.configured(),keyConfigured:new RegExp('^(rk|sk)_' + (this.live() ? 'live' : 'test') + '_').test(this.config.get('GESTAO_STRIPE_SECRET_KEY')||''),webhookConfigured:!!this.config.get('GESTAO_STRIPE_WEBHOOK_SECRET'),priceConfigured:!!this.config.get('GESTAO_STRIPE_PRICE_ID'),webhookPath:'/api/v1/contract-management/billing/webhook'}; }
  async validatePrice(id:string,amount?:string,interval?:string) {
    const stripe=this.stripe(),price=await stripe.prices.retrieve(id),baseId=this.config.getOrThrow<string>('GESTAO_STRIPE_PRICE_ID');
    const base=id===baseId?price:await stripe.prices.retrieve(baseId);
    if(!this.sameMode(price.livemode)||!this.sameMode(base.livemode)||!price.active||price.type!=='recurring'||price.currency!=='brl'||price.recurring?.interval_count!==1||!['month','year'].includes(price.recurring.interval)||stripeId(price.product)!==stripeId(base.product))throw new BadRequestException('Preço deve ser recorrente em BRL, mensal/anual e do produto e ambiente da Gestão Contratual.');
    if(this.live() && price.unit_amount !== (price.recurring?.interval==='month' ? 29900 : 299000)) throw new BadRequestException('Os planos comerciais são R$ 299/mês e R$ 2.990/ano, sem combo.');
    if(amount!==undefined&&(price.unit_amount===null||!new Prisma.Decimal(amount).mul(100).eq(price.unit_amount)))throw new BadRequestException('Valor local diferente do preço cadastrado no Stripe.');
    if(interval&&price.recurring.interval!==interval.toLowerCase())throw new BadRequestException('Periodicidade diferente do Stripe.');
    return price;
  }
  private async profile(user: Pick<AuthenticatedUser,'tenantId'|'userId'>,sql?:ContractSql){return this.saas?this.saas.profile(user,sql):undefined;}
  private async ownerLicensed(user:Pick<AuthenticatedUser,'tenantId'|'userId'>,stripeRow:any,sql?:ContractSql){
    const profile=await this.profile(user,sql);if(!profileAllowsLogin(profile)||stripeRow?.risk_blocked)return false;
    return profile?.role==='ADMIN'||((await this.eligible(user)).eligible && (manualLicence(profile)??active(stripeRow)));
  }
  async allowedOwn(user: AuthenticatedUser): Promise<boolean> {
    return this.db.enabled() && (this.admin(user) || await this.ownerLicensed(user,await this.account(user)));
  }
  async allowedContract(user: AuthenticatedUser, contractId: string, connection?: ContractSql): Promise<boolean> {
    if (!this.db.enabled()) return false;
    const sql = connection || this.db as ContractSql;
    if(!profileAllowsLogin(await this.profile(user,sql)))return false;
    const row = (await sql.query('SELECT c.owner_id,b.status,b.current_period_end,b.risk_blocked FROM GcContract c LEFT JOIN GcBillingAccount b ON b.tenant_id=c.tenant_id AND b.owner_id=c.owner_id WHERE c.id=? AND c.tenant_id=? AND c.archived_at IS NULL', [contractId,user.tenantId]))[0];
    const admins = String(this.config.get('GESTAO_ADMIN_USER_IDS') || '').split(',').map(x=>x.trim()).filter(Boolean);
    return !!row && (admins.includes(row.owner_id) || await this.ownerLicensed({tenantId:user.tenantId,userId:row.owner_id},row,sql));
  }
  async allowed(user: AuthenticatedUser): Promise<boolean> {
    if (!this.db.enabled()) return false;
    if (this.admin(user)) return true;
    if(!profileAllowsLogin(await this.profile(user)))return false;
    if (await this.ownerLicensed(user,await this.account(user))) return true;
    // Team members share the owner's licence, never another tenant's licence.
    const owners = String(this.config.get('GESTAO_ADMIN_USER_IDS') || '').split(',').map(x => x.trim()).filter(Boolean);
    const rows = await this.db.query('SELECT c.owner_id,b.status,b.current_period_end,b.risk_blocked FROM GcMember m JOIN GcContract c ON c.id=m.contract_id AND c.tenant_id=m.tenant_id LEFT JOIN GcBillingAccount b ON b.tenant_id=c.tenant_id AND b.owner_id=c.owner_id WHERE m.tenant_id=? AND m.user_id=? AND m.role IN (\'MANAGER\',\'FISCAL\',\'READER\') AND c.archived_at IS NULL', [user.tenantId,user.userId]);
    for(const row of rows)if(owners.includes(row.owner_id)||await this.ownerLicensed({tenantId:user.tenantId,userId:row.owner_id},row))return true;
    return false;
  }
  async access(user: AuthenticatedUser) {
    if (!this.db.enabled()) throw new NotFoundException();
    const row = await this.account(user), configured = this.configured(),profile=await this.profile(user);
    const prerequisite=await this.eligible(user);
    const plans=await this.db.query<any[]>('SELECT id,name,billing_interval,price_brl FROM GcSaasPlan WHERE active=TRUE AND stripe_price_id IS NOT NULL ORDER BY price_brl');
    return { configured, testMode: !this.live(), prerequisite, adminExempt: this.admin(user)||profile?.role==='ADMIN', manual:profile?.billing_source==='MANUAL'?{status:profile.manual_status,currentPeriodEnd:profile.manual_period_end}:null,profileStatus:profile?.status||'ACTIVE',plans:plans.map(p=>({id:p.id,name:p.name,billingInterval:p.billing_interval,priceBrl:String(p.price_brl)})),canCheckout: configured && prerequisite.eligible && profileAllowsLogin(profile) && (!profile||profile.billing_source!=='MANUAL'||profile.manual_status==='TRIALING') && !row?.risk_blocked && (!row?.subscription_id||['canceled','incomplete_expired'].includes(row.status)), canPortal: configured && !!row?.customer_id,
      subscription: row ? { status: row.risk_blocked ? 'review_required' : row.status, currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : undefined, cancelAtPeriodEnd: !!row.cancel_at_period_end } : null,
      message: this.live() ? 'Assinatura complementar: requer OrçaPro ou OrçaPro Infraestrutura ativo. R$ 299/mês ou R$ 2.990/ano, sem combo.' : configured ? 'Ambiente Stripe de testes. Nenhuma cobrança real. A liberação depende do webhook validado.' : 'Configure a assinatura de testes para habilitar Checkout e portal. O administrador mantém seu acesso.' };
  }
  async checkout(user: AuthenticatedUser, requestId: string, planId?:string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId || '')) throw new BadRequestException('Identificador de solicitação inválido.');
    const prerequisite=await this.eligible(user);
    if(!prerequisite.eligible)throw new ForbiddenException(prerequisite.message);
    const profile=await this.profile(user);
    if(!profileAllowsLogin(profile)||(profile?.billing_source==='MANUAL'&&profile.manual_status!=='TRIALING'))throw new ForbiddenException('Acesso administrado manualmente. Consulte o administrador do SaaS.');
    const plan=planId?(await this.db.query('SELECT * FROM GcSaasPlan WHERE id=? AND active=TRUE AND stripe_price_id IS NOT NULL',[planId]))[0]:(await this.db.query('SELECT * FROM GcSaasPlan WHERE stripe_price_id=?',[this.config.get('GESTAO_STRIPE_PRICE_ID')]))[0];
    if((planId&&!plan)||(plan&&!plan.active))throw new BadRequestException('Plano indisponível. Selecione um plano ativo.');
    const stripe = this.stripe(), priceId = plan?.stripe_price_id||this.config.getOrThrow<string>('GESTAO_STRIPE_PRICE_ID');
    await this.validatePrice(priceId,plan?.price_brl,plan?.billing_interval);
    let row = await this.account(user);
    if (!row) {
      // A dedicated customer prevents this module from touching another product's subscriptions.
      const key = createHash('sha256').update(user.tenantId + ':' + user.userId).digest('hex');
      const customer = await stripe.customers.create({ name: this.live() ? user.name : 'Gestão Contratual · conta de testes', ...(this.live() ? {email:user.email} : {}), metadata: { product: this.live() ? 'orcapro_gestao' : 'orcapro_gestao_dev' } }, { idempotencyKey: 'gestao-customer-' + key });
      if (!this.sameMode(customer.livemode)) throw new ForbiddenException('Cliente de outro ambiente recusado.');
      await this.db.query('INSERT IGNORE INTO GcBillingAccount(tenant_id,owner_id,customer_id) VALUES(?,?,?)', [user.tenantId,user.userId,customer.id]);
      row = await this.account(user);
    }
    return this.db.transaction(async db => {
      const current = (await db.query('SELECT * FROM GcBillingAccount WHERE tenant_id=? AND owner_id=? FOR UPDATE',[user.tenantId,user.userId]))[0];
      if (active(current) || current.risk_blocked || (current.subscription_id&&!['canceled','incomplete_expired'].includes(current.status))) throw new ConflictException('Gerencie a assinatura existente pelo portal.');
      if (current.checkout_id && current.checkout_expires_at && new Date(current.checkout_expires_at).getTime() > Date.now()) {
        const prior = await stripe.checkout.sessions.retrieve(current.checkout_id);
        if (prior.status === 'open' && prior.url) {if(current.checkout_price_id&&current.checkout_price_id!==priceId)throw new ConflictException('Já há um Checkout aberto para outro plano. Aguarde sua expiração.');return { url: prior.url };}
        if (prior.status === 'complete') throw new ConflictException('Pagamento em conferência. Aguarde a atualização do webhook.');
      }
      const returnUrl = new URL('/gestao-contratual/', this.config.getOrThrow<string>('WEB_BASE_URL')).href;
      const suffix = createHash('sha256').update(requestId).digest().subarray(0,8).reduce((s,n)=>s+String.fromCharCode(97+n%26),'');
      const recheck=await this.eligible(user);if(!recheck.eligible)throw new ForbiddenException(recheck.message);
      const session = await stripe.checkout.sessions.create({ mode: 'subscription', expires_at:Math.floor(Date.now()/1000)+1800, customer: current.customer_id, line_items: [{ price: priceId, quantity: 1 }], success_url: returnUrl+'?assinatura=conferindo', cancel_url: returnUrl+'?assinatura=cancelada', locale: 'pt-BR', integration_identifier: 'orcapro-gestao-'+suffix } as Stripe.Checkout.SessionCreateParams, { idempotencyKey: 'gestao-checkout-'+user.tenantId+'-'+user.userId+'-'+requestId });
      if (!this.sameMode(session.livemode) || !session.url) throw new ServiceUnavailableException('Checkout indisponível.');
      await db.query('UPDATE GcBillingAccount SET checkout_request_id=?,checkout_id=?,checkout_expires_at=?,checkout_price_id=?,checkout_profile_version=?,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=? AND owner_id=?',[requestId,session.id,new Date(session.expires_at*1000),priceId,profile?.version||null,user.tenantId,user.userId]);
      return { url: session.url };
    });
  }
  async portal(user: AuthenticatedUser) {
    const stripe = this.stripe(), row = await this.account(user);
    if (!row?.customer_id) throw new BadRequestException('Não existe assinatura para gerenciar.');
    const session = await stripe.billingPortal.sessions.create({ customer: row.customer_id, return_url: new URL('/gestao-contratual/',this.config.getOrThrow<string>('WEB_BASE_URL')).href, ...(this.config.get('GESTAO_STRIPE_PORTAL_CONFIGURATION_ID') ? { configuration: this.config.get<string>('GESTAO_STRIPE_PORTAL_CONFIGURATION_ID') } : {}) });
    return { url: session.url };
  }
  async webhook(raw: Buffer | undefined, signature: string | undefined) {
    const stripe = this.stripe();
    if (!raw || raw.length > 1024*1024 || !signature) throw new BadRequestException('Webhook inválido.');
    let event: Stripe.Event;
    try { event = stripe.webhooks.constructEvent(raw,signature,this.config.getOrThrow('GESTAO_STRIPE_WEBHOOK_SECRET')); }
    catch { throw new BadRequestException('Assinatura do webhook inválida.'); }
    if (!this.sameMode(event.livemode)) throw new ForbiddenException('Evento de outro ambiente recusado.');
    if (![subscriptionEvents,invoiceEvents,checkoutEvents,riskEvents].some(s=>s.has(event.type))) return { received: true, ignored: true };
    const object:any=event.data.object;
    let customerId=stripeId(object.customer), subscriptionId:string|undefined, risk=riskEvents.has(event.type);
    if (risk && !customerId && object.charge) { const charge=await stripe.charges.retrieve(stripeId(object.charge)!); if(!this.sameMode(charge.livemode))throw new ForbiddenException(); customerId=stripeId(charge.customer); }
    if (!customerId) return { received: true, ignored: true };
    // Signed Stripe customer ID locates ownership. Metadata never grants entitlement.
    const owner=(await this.db.query('SELECT tenant_id,owner_id FROM GcBillingAccount WHERE customer_id=?',[customerId]))[0];
    if (!owner) return { received: true, ignored: true };
    if (subscriptionEvents.has(event.type)) subscriptionId=object.id;
    else if (invoiceEvents.has(event.type)) subscriptionId=stripeId(object.parent?.subscription_details?.subscription || object.subscription);
    else if (checkoutEvents.has(event.type)) subscriptionId=stripeId(object.subscription);
    await this.db.transaction(async db => {
      const row=(await db.query('SELECT * FROM GcBillingAccount WHERE tenant_id=? AND owner_id=? FOR UPDATE',[owner.tenant_id,owner.owner_id]))[0];
      if ((await db.query('SELECT id FROM GcBillingEvent WHERE id=? AND tenant_id=? AND owner_id=?',[event.id,owner.tenant_id,owner.owner_id])).length) return;
      if (risk) await db.query('UPDATE GcBillingAccount SET risk_blocked=TRUE,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=? AND owner_id=?',[owner.tenant_id,owner.owner_id]);
      else if (subscriptionId) {
        // Read the authoritative latest state to handle delayed/out-of-order events.
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (!this.sameMode(subscription.livemode) || stripeId(subscription.customer)!==row.customer_id) throw new ForbiddenException('Assinatura de outra conta.');
        const prices=await db.query('SELECT stripe_price_id FROM GcSaasPlan WHERE stripe_price_id IS NOT NULL');
        const allowedPrices=new Set([this.config.get('GESTAO_STRIPE_PRICE_ID'),...prices.map((p:any)=>p.stripe_price_id)]);
        const matching=subscription.items.data.filter(i=>allowedPrices.has(i.price.id));
        if (matching.length!==1 || subscription.items.data.length!==1) throw new BadRequestException('Assinatura não pertence ao plano da Gestão Contratual.');
        let obsolete = false;
        if (row.subscription_id && row.subscription_id!==subscription.id) {
          const previous=await stripe.subscriptions.retrieve(row.subscription_id);
          if (!['canceled','incomplete_expired'].includes(previous.status)) {
            if (['canceled','incomplete_expired'].includes(subscription.status)) obsolete = true;
            else throw new ConflictException('Assinatura concorrente exige conciliação.');
          }
        }
        const end=subscription.status==='trialing' ? subscription.trial_end : matching[0].current_period_end;
        if (!obsolete) {
          await db.query('UPDATE GcBillingAccount SET subscription_id=?,status=?,current_period_end=?,cancel_at_period_end=?,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=? AND owner_id=?',[subscription.id,subscription.status,end?new Date(end*1000):null,subscription.cancel_at_period_end,owner.tenant_id,owner.owner_id]);
          if(['active','trialing'].includes(subscription.status)&&row.checkout_profile_version&&row.checkout_price_id===matching[0].price.id)await db.query("UPDATE GcSaasUser SET billing_source='STRIPE',version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=? AND user_id=? AND version=? AND billing_source='MANUAL' AND manual_status='TRIALING'",[owner.tenant_id,owner.owner_id,row.checkout_profile_version]);
        }
      }
      await db.query('INSERT INTO GcBillingEvent(id,tenant_id,owner_id,type,payload_hash,stripe_created) VALUES(?,?,?,?,?,?)',[event.id,owner.tenant_id,owner.owner_id,event.type,createHash('sha256').update(raw).digest('hex'),event.created]);
    });
    return { received: true };
  }
  async adminAction(actor:AuthenticatedUser,target:{tenant_id:string;user_id:string;id:string},dto:GcStripeActionDto){
    if(!this.saas)throw new ForbiddenException();await this.saas.assertAdmin(actor);
    const stripe=this.stripe();
    return this.db.transaction(async db=>{
      const row=(await db.query('SELECT * FROM GcBillingAccount WHERE tenant_id=? AND owner_id=? FOR UPDATE',[target.tenant_id,target.user_id]))[0];
      if(!row?.subscription_id)throw new BadRequestException('Esta conta não tem assinatura Stripe vinculada.');
      if(row.version!==dto.expectedVersion)throw new ConflictException('Assinatura alterada. Atualize antes de repetir.');
      const sub=await stripe.subscriptions.retrieve(row.subscription_id);
      if(!this.sameMode(sub.livemode)||stripeId(sub.customer)!==row.customer_id)throw new ForbiddenException('Assinatura de outra conta/ambiente.');
      const plans=await db.query('SELECT stripe_price_id FROM GcSaasPlan WHERE stripe_price_id IS NOT NULL'),prices=new Set([this.config.get('GESTAO_STRIPE_PRICE_ID'),...plans.map((p:any)=>p.stripe_price_id)]);
      if(sub.items.data.length!==1||!prices.has(sub.items.data[0].price.id))throw new ForbiddenException('Assinatura não pertence a este produto.');
      if(dto.action!=='SYNC'&&['canceled','incomplete_expired'].includes(sub.status))throw new BadRequestException('Assinatura encerrada não pode ser retomada.');
      await saasAudit(db,actor,'saas.subscription.stripe.request',target.id,{action:dto.action,reason:dto.reason,requestId:dto.requestId});
      const updated=dto.action==='SYNC'?sub:await stripe.subscriptions.update(sub.id,{cancel_at_period_end:dto.action==='CANCEL_AT_PERIOD_END'},{idempotencyKey:`gestao-admin-${target.id}-${dto.requestId}-${dto.action}`});
      const end=updated.status==='trialing'?updated.trial_end:updated.items.data[0].current_period_end;
      await db.query('UPDATE GcBillingAccount SET status=?,current_period_end=?,cancel_at_period_end=?,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=? AND owner_id=?',[updated.status,end?new Date(end*1000):null,updated.cancel_at_period_end,target.tenant_id,target.user_id]);
      await saasAudit(db,actor,'saas.subscription.stripe',target.id,{action:dto.action,status:updated.status,reason:dto.reason,riskBlockPreserved:true});return {saved:true};
    });
  }
}
