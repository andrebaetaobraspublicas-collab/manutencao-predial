import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  MembershipRole,
  SubscriptionStatus,
  TenantStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = key ? new Stripe(key) : null;
  }

  async createCheckout(tenantId: string, planCode: string) {
    const stripe = this.requireStripe();
    const [tenant, plan, owner] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.saaSPlan.findUnique({ where: { code: planCode } }),
      this.prisma.tenantMembership.findFirst({
        where: { tenantId, role: MembershipRole.OWNER },
        include: { user: true },
      }),
    ]);

    if (!tenant || !owner) throw new BadRequestException('Organização sem proprietário válido.');
    if (!plan?.stripePriceId || !plan.active) {
      throw new BadRequestException('Plano indisponível para contratação online.');
    }

    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        email: owner.user.email,
        metadata: { tenantId },
      });
      customerId = customer.id;
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { stripeCustomerId: customerId },
      });
    }

    const webBaseUrl = this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${webBaseUrl}/dashboard?billing=success`,
      cancel_url: `${webBaseUrl}/dashboard?billing=canceled`,
      client_reference_id: tenantId,
      metadata: { tenantId, planCode: plan.code },
      subscription_data: { metadata: { tenantId, planCode: plan.code } },
    });

    return { url: session.url };
  }

  async createCustomerPortal(tenantId: string) {
    const stripe = this.requireStripe();
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.stripeCustomerId) {
      throw new BadRequestException('A organização ainda não possui cadastro de cobrança.');
    }

    const webBaseUrl = this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${webBaseUrl}/dashboard`,
    });
    return { url: session.url };
  }

  async processWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const stripe = this.requireStripe();
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!rawBody || !signature || !webhookSecret) {
      throw new BadRequestException('Webhook Stripe sem corpo, assinatura ou segredo configurado.');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Assinatura do webhook Stripe inválida.');
    }

    const alreadyProcessed = await this.prisma.stripeWebhookEvent.findUnique({
      where: { stripeId: event.id },
    });
    if (alreadyProcessed?.processedAt) return { received: true, duplicate: true };

    await this.prisma.stripeWebhookEvent.upsert({
      where: { stripeId: event.id },
      create: {
        stripeId: event.id,
        type: event.type,
        apiVersion: event.api_version ?? undefined,
        payload: JSON.parse(JSON.stringify(event)),
      },
      update: {},
    });

    try {
      await this.routeEvent(event);
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeId: event.id },
        data: { processedAt: new Date(), error: null },
      });
    } catch (error) {
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeId: event.id },
        data: { error: error instanceof Error ? error.message : 'Erro desconhecido' },
      });
      throw error;
    }

    return { received: true };
  }

  private async routeEvent(event: Stripe.Event): Promise<void> {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenantId || session.client_reference_id;
      const planCode = session.metadata?.planCode;
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

      if (!tenantId || !planCode) return;
      const plan = await this.prisma.saaSPlan.findUnique({ where: { code: planCode } });
      if (!plan) return;

      await this.prisma.$transaction(async (tx) => {
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            stripeCustomerId: customerId,
            status: TenantStatus.ACTIVE,
          },
        });
        const existing = await tx.tenantSubscription.findFirst({
          where: { tenantId, status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE] } },
        });
        if (existing) {
          await tx.tenantSubscription.update({
            where: { id: existing.id },
            data: {
              planId: plan.id,
              status: SubscriptionStatus.ACTIVE,
              stripeSubscriptionId: subscriptionId,
            },
          });
        } else {
          await tx.tenantSubscription.create({
            data: {
              tenantId,
              planId: plan.id,
              status: SubscriptionStatus.ACTIVE,
              stripeSubscriptionId: subscriptionId,
            },
          });
        }
      });
      return;
    }

    if (event.type.startsWith('customer.subscription.')) {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = subscription.metadata.tenantId;
      if (!tenantId) return;

      const mappedStatus = this.mapSubscriptionStatus(subscription.status);
      const item = subscription.items.data[0];
      const plan = item?.price.id
        ? await this.prisma.saaSPlan.findFirst({ where: { stripePriceId: item.price.id } })
        : null;
      const period = item?.current_period_start && item?.current_period_end
        ? {
            currentPeriodStart: new Date(item.current_period_start * 1000),
            currentPeriodEnd: new Date(item.current_period_end * 1000),
          }
        : {};

      const existing = await this.prisma.tenantSubscription.findFirst({
        where: { tenantId, stripeSubscriptionId: subscription.id },
      });
      if (existing) {
        await this.prisma.tenantSubscription.update({
          where: { id: existing.id },
          data: {
            status: mappedStatus,
            planId: plan?.id,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            ...period,
          },
        });
      }

      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          status:
            mappedStatus === SubscriptionStatus.ACTIVE ||
            mappedStatus === SubscriptionStatus.TRIALING
              ? TenantStatus.ACTIVE
              : mappedStatus === SubscriptionStatus.PAST_DUE
                ? TenantStatus.PAST_DUE
                : mappedStatus === SubscriptionStatus.CANCELED
                  ? TenantStatus.CANCELED
                  : undefined,
        },
      });
    }
  }

  private mapSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    const map: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      trialing: SubscriptionStatus.TRIALING,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      unpaid: SubscriptionStatus.UNPAID,
      incomplete: SubscriptionStatus.PAST_DUE,
      incomplete_expired: SubscriptionStatus.CANCELED,
      paused: SubscriptionStatus.PAST_DUE,
    };
    return map[status];
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe ainda não configurado neste ambiente.');
    }
    return this.stripe;
  }
}
