import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Prisma, type OrcaproSubscription } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrcaproAccess } from './orcapro.guard';
import { SaasStripeActionDto } from './orcapro-saas.dto';

@Injectable()
export class OrcaproStripeService {
  private readonly stripe: Stripe | null;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly access: OrcaproAccess) {
    const key = config.get<string>('ORCAPRO_STRIPE_SECRET_KEY') || config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = key ? new Stripe(key) : null;
  }
  integration() {
    return { keyConfigured: !!this.stripe, webhookConfigured: !!(this.config.get<string>('ORCAPRO_STRIPE_WEBHOOK_SECRET') || this.config.get<string>('STRIPE_WEBHOOK_SECRET')), mode: this.config.get<string>('ORCAPRO_STRIPE_MODE') ?? null, webhookPath: '/api/v1/orcapro/billing/webhooks/stripe', product: 'ORCAPRO', billingUnit: 'USER' };
  }
  private client() {
    if (!this.stripe || !['TEST', 'LIVE'].includes(this.config.get<string>('ORCAPRO_STRIPE_MODE') ?? '')) throw new ServiceUnavailableException('Configure o Stripe e o modo TEST/LIVE no ambiente da API antes de usar cobrança automática.');
    return this.stripe;
  }
  private validateMode(value: { livemode?: boolean }) {
    if (typeof value.livemode !== 'boolean' || value.livemode !== (this.config.get<string>('ORCAPRO_STRIPE_MODE') === 'LIVE')) throw new BadRequestException('O recurso Stripe pertence a outro modo de cobrança. Confira a configuração de teste e produção.');
  }
  private marketingUrl(): string | undefined {
    const value = this.config.get<string>('ORCAPRO_MARKETING_URL');
    if (!value) return undefined;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new ServiceUnavailableException('Configure um endereço HTTPS público para ORCAPRO_MARKETING_URL.');
    return url.href;
  }
  async own(user: AuthenticatedUser) {
    return { subscription: await this.prisma.orcaproSubscription.findUnique({ where: { userId: user.userId }, include: { plan: true } }), integration: this.integration() };
  }
  private validateRemote(remote: Stripe.Subscription, row: OrcaproSubscription) {
    this.validateMode(remote);
    if (remote.metadata.product !== 'ORCAPRO' || remote.metadata.orcaproSubscriptionId !== row.id || remote.metadata.userId !== row.userId) throw new BadRequestException('Assinatura Stripe não corresponde ao usuário OrçaPro.');
    const customerId = typeof remote.customer === 'string' ? remote.customer : remote.customer.id;
    if (row.stripeCustomerId && customerId !== row.stripeCustomerId) throw new BadRequestException('Cliente Stripe não corresponde à assinatura.');
    return customerId;
  }
  private async apply(db: Prisma.TransactionClient, row: OrcaproSubscription, remote: Stripe.Subscription, resumeStripe = false) {
    const customerId = this.validateRemote(remote, row);
    const period = remote.items.data[0]?.current_period_end;
    if (!period) throw new BadRequestException('Assinatura Stripe sem período definido.');
    const plan = await db.orcaproPlan.findFirst({ where: { stripePriceId: remote.items.data[0]?.price.id } });
    if (!plan) throw new BadRequestException('Preço Stripe não cadastrado entre os planos OrçaPro.');
    const map: Record<string, 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'UNPAID'> = { active: 'ACTIVE', trialing: 'TRIALING', past_due: 'PAST_DUE', canceled: 'CANCELED', unpaid: 'UNPAID', incomplete: 'PAST_DUE', incomplete_expired: 'CANCELED', paused: 'PAST_DUE' };
    const source = resumeStripe ? 'STRIPE' : row.billingSource;
    return db.orcaproSubscription.update({ where: { id: row.id }, data: {
      stripeSubscriptionId: remote.id, stripeCustomerId: customerId, stripeStatus: remote.status, stripePeriodEnd: new Date(period * 1000), cancelAtPeriodEnd: remote.cancel_at_period_end,
      ...(source === 'STRIPE' ? { billingSource: source, status: map[remote.status] ?? 'UNPAID', planId: plan.id, currentPeriodStart: new Date(remote.items.data[0].current_period_start * 1000), currentPeriodEnd: new Date(period * 1000) } : {}),
      version: { increment: 1 },
    } });
  }
  async checkoutPlan(planId: string) {
    const stripe = this.client();
    if (!this.integration().webhookConfigured) throw new ServiceUnavailableException('Configure o webhook Stripe antes de gerar uma contratação.');
    const plan = await this.prisma.orcaproPlan.findFirst({ where: { id: planId, active: true } });
    if (!plan?.stripePriceId) throw new BadRequestException('Plano sem preço Stripe configurado.');
    const price = await stripe.prices.retrieve(plan.stripePriceId);
    this.validateMode(price);
    const cents = new Prisma.Decimal(plan.priceBrl).mul(100).toFixed(0);
    if (!price.active || price.currency !== 'brl' || String(price.unit_amount) !== cents || price.recurring?.interval !== (plan.billingInterval === 'MONTH' ? 'month' : 'year') || price.recurring.interval_count !== 1) throw new BadRequestException('Valor, moeda ou periodicidade do preço Stripe divergem do plano.');
    return plan;
  }
  async checkout(user: AuthenticatedUser, planId: string) {
    const stripe = this.client();
    const plan = await this.checkoutPlan(planId);
    return this.prisma.$transaction(async db => {
      await db.$queryRaw(Prisma.sql`SELECT id FROM User WHERE id = ${user.userId} FOR UPDATE`);
      await db.$queryRaw(Prisma.sql`SELECT id FROM OrcaproSubscription WHERE userId = ${user.userId} FOR UPDATE`);
      await db.$queryRaw(Prisma.sql`SELECT id FROM OrcaproPlan WHERE id = ${plan.id} FOR UPDATE`);
      const lockedPlan = await db.orcaproPlan.findUnique({ where: { id: plan.id } });
      if (!lockedPlan?.active || lockedPlan.version !== plan.version) throw new ConflictException('Plano alterado. Atualize a tela antes de contratar.');
      const current = await db.orcaproSubscription.findUnique({ where: { userId: user.userId } });
      if (current?.stripeSubscriptionId && !['canceled', 'incomplete_expired'].includes(current.stripeStatus ?? 'active')) throw new ConflictException('Já existe cobrança Stripe. Use o portal para alterar a contratação.');
      const managed = (await db.orcaproUserAccess.findUnique({ where: { userId: user.userId } }))?.managed === true;
      const row = current ?? await db.orcaproSubscription.create({ data: { userId: user.userId, tenantId: user.tenantId, status: managed ? 'TRIALING' : 'MANUAL_CONTRACT', currentPeriodEnd: managed ? new Date(Date.now() + 30 * 86400000) : null } });
      if (row.stripeCheckoutId) {
        const pending = await stripe.checkout.sessions.retrieve(row.stripeCheckoutId);
        if (pending.status === 'open' && row.stripeCheckoutPriceId === plan.stripePriceId) return { url: pending.url };
        if (pending.status === 'complete') throw new ConflictException('Contratação concluída; aguarde a confirmação do Stripe.');
        // An explicit plan change cancels only the unpaid checkout, never a subscription.
        if (pending.status === 'open') await stripe.checkout.sessions.expire(row.stripeCheckoutId, {}, { idempotencyKey: `orcapro-expire-${row.id}-${row.version}` });
      }
      const customerId = row.stripeCustomerId ?? (await stripe.customers.create({ email: user.email, name: user.name, metadata: { product: 'ORCAPRO', userId: user.userId } }, { idempotencyKey: `orcapro-customer-${row.id}` })).id;
      const metadata = { product: 'ORCAPRO', userId: user.userId, orcaproSubscriptionId: row.id, activationVersion: String(row.version + 1) };
      const web = (this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
      const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer: customerId, line_items: [{ price: plan.stripePriceId!, quantity: 1 }], metadata, subscription_data: { metadata }, success_url: `${web}/orcapro/assinatura?checkout=success`, cancel_url: this.marketingUrl() ?? `${web}/orcapro/assinatura?checkout=canceled` }, { idempotencyKey: `orcapro-checkout-${row.id}-${row.version}` });
      await db.orcaproSubscription.update({ where: { id: row.id }, data: { stripeCustomerId: customerId, stripeCheckoutId: session.id, stripeCheckoutPriceId: plan.stripePriceId, version: { increment: 1 } } });
      return { url: session.url };
    }, { timeout: 30000 });
  }
  async portal(user: AuthenticatedUser) {
    const row = await this.prisma.orcaproSubscription.findUnique({ where: { userId: user.userId } });
    if (!row?.stripeCustomerId) throw new BadRequestException('Usuário sem cliente Stripe.');
    const stripe = this.client();
    const configuration = this.config.get<string>('ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID');
    if (configuration) {
      const remote = await stripe.billingPortal.configurations.retrieve(configuration);
      this.validateMode(remote);
      if (!remote.active) throw new ServiceUnavailableException('A configuração do portal de cobrança OrçaPro está desativada.');
    }
    const web = (this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    const session = await stripe.billingPortal.sessions.create({ customer: row.stripeCustomerId, return_url: `${web}/orcapro/assinatura`, ...(configuration ? { configuration } : {}) });
    this.validateMode(session);
    return { url: session.url };
  }
  async action(actor: AuthenticatedUser, id: string, dto: SaasStripeActionDto) {
    this.access.assertAdmin(actor);
    return this.prisma.$transaction(async db => {
      await db.$queryRaw(Prisma.sql`SELECT id FROM OrcaproSubscription WHERE id = ${id} FOR UPDATE`);
      const row = await db.orcaproSubscription.findUnique({ where: { id } });
      if (!row?.stripeSubscriptionId) throw new NotFoundException('Cobrança Stripe não encontrada.');
      if (row.version !== dto.expectedVersion) throw new ConflictException('Assinatura alterada. Atualize a tela.');
      const stripe = this.client();
      const current = await stripe.subscriptions.retrieve(row.stripeSubscriptionId);
      this.validateRemote(current, row);
      const remote = dto.action === 'SYNC' ? current : await stripe.subscriptions.update(current.id, { cancel_at_period_end: dto.action === 'CANCEL_AT_PERIOD_END' }, { idempotencyKey: `orcapro-${id}-${row.version}-${dto.action}` });
      const result = await this.apply(db, row, remote, dto.action === 'SYNC');
      await db.orcaproAudit.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, action: 'saas.subscription.stripe', entityId: id, metadata: { action: dto.action, userId: row.userId, customerTenantId: row.tenantId } } });
      return result;
    }, { timeout: 30000 });
  }
  async webhook(raw: Buffer | undefined, signature: string | undefined) {
    const secret = this.config.get<string>('ORCAPRO_STRIPE_WEBHOOK_SECRET') || this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!raw || !signature || !secret) throw new BadRequestException('Webhook sem corpo, assinatura ou configuração.');
    let event: Stripe.Event;
    try { event = this.client().webhooks.constructEvent(raw, signature, secret); } catch { throw new BadRequestException('Assinatura Stripe inválida.'); }
    this.validateMode(event);
    return { received: true, handled: await this.handleEvent(event) };
  }
  // Called only after signature verification, including the shared billing endpoint.
  async handleEvent(event: Stripe.Event): Promise<boolean> {
    const object = event.data.object;
    let remoteId: string | undefined;
    let localId: string | undefined;
    if (event.type.startsWith('customer.subscription.')) {
      const remote = object as Stripe.Subscription;
      if (remote.metadata.product !== 'ORCAPRO') return false;
      remoteId = remote.id; localId = remote.metadata.orcaproSubscriptionId;
    } else if (event.type === 'checkout.session.completed') {
      const session = object as Stripe.Checkout.Session;
      if (session.metadata?.product !== 'ORCAPRO') return false;
      if (session.mode !== 'subscription') return true;
      remoteId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      localId = session.metadata.orcaproSubscriptionId;
    } else if (['invoice.paid', 'invoice.payment_failed'].includes(event.type)) {
      const invoice = object as Stripe.Invoice;
      const sub = invoice.parent?.subscription_details?.subscription;
      remoteId = typeof sub === 'string' ? sub : sub?.id;
      if (!remoteId) return false;
      const known = await this.prisma.orcaproSubscription.findUnique({ where: { stripeSubscriptionId: remoteId } });
      if (!known) return false;
      localId = known.id;
    } else return false;
    this.validateMode(event);
    if (!remoteId || !localId) throw new BadRequestException('Evento OrçaPro sem vínculo de assinatura.');
    await this.prisma.$transaction(async db => {
      await db.$queryRaw(Prisma.sql`SELECT id FROM OrcaproSubscription WHERE id = ${localId} FOR UPDATE`);
      const row = await db.orcaproSubscription.findUnique({ where: { id: localId } });
      if (!row) throw new NotFoundException('Assinatura OrçaPro ausente.');
      if ((await db.orcaproStripeEvent.findUnique({ where: { stripeId: event.id } }))?.processedAt) return;
      if (row.stripeSubscriptionId && row.stripeSubscriptionId !== remoteId && row.stripeStatus !== 'canceled') {
        await db.orcaproStripeEvent.create({ data: { stripeId: event.id, type: event.type, processedAt: new Date() } }); return;
      }
      // Retrieve after the per-subscription lock: duplicated and out-of-order
      // deliveries cannot replay an obsolete status from the event snapshot.
      const remote = await this.client().subscriptions.retrieve(remoteId);
      const firstStripe = row.stripeSubscriptionId !== remoteId && remote.metadata.activationVersion === String(row.version);
      await this.apply(db, row, remote, firstStripe);
      if (firstStripe) await db.orcaproSubscription.update({ where: { id: row.id }, data: { stripeCheckoutId: null, stripeCheckoutPriceId: null } });
      await db.orcaproStripeEvent.upsert({ where: { stripeId: event.id }, create: { stripeId: event.id, type: event.type, processedAt: new Date() }, update: { processedAt: new Date() } });
      await db.orcaproAudit.create({ data: { tenantId: row.tenantId, actorUserId: row.userId, action: 'saas.subscription.webhook', entityId: row.id, metadata: { eventId: event.id, type: event.type, source: row.billingSource } } });
    }, { timeout: 30000 });
    return true;
  }
}
