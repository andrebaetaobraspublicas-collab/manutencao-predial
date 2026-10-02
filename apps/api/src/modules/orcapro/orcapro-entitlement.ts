export function subscriptionAllowsAccess(subscription: { status: string; currentPeriodEnd: Date | null } | null, managed: boolean, now = new Date()): boolean {
  if (!subscription) return !managed;
  return ['ACTIVE', 'TRIALING', 'MANUAL_CONTRACT'].includes(subscription.status)
    && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now)
    && (subscription.status !== 'TRIALING' || !!subscription.currentPeriodEnd);
}
