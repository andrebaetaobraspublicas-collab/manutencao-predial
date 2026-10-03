type SubscriptionStatus = { billingSource: string; status: string; currentPeriodEnd: string | null };

export function stripeSubscriptionConfirmed(subscription: SubscriptionStatus | null | undefined, now = Date.now()): boolean {
  if (!subscription || subscription.billingSource !== 'STRIPE' || !['ACTIVE', 'TRIALING'].includes(subscription.status) || !subscription.currentPeriodEnd) return false;
  const end = Date.parse(subscription.currentPeriodEnd);
  return Number.isFinite(end) && end > now;
}
