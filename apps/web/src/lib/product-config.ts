type ProductEnvironment = { orcaproOnly?: string; marketingUrl?: string };

export function resolveProductConfig(environment: ProductEnvironment) {
  const orcaproOnly = environment.orcaproOnly === 'true';
  const supplied = environment.marketingUrl?.trim();
  let marketingUrl: string | null = null;
  if (supplied || orcaproOnly) {
    const url = new URL(supplied || 'https://orcaproobras.com.br/');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('NEXT_PUBLIC_MARKETING_URL deve ser a raiz HTTPS do site comercial, sem credenciais ou parâmetros.');
    }
    marketingUrl = url.href;
  }
  return { orcaproOnly, marketingUrl };
}

const product = resolveProductConfig({
  orcaproOnly: process.env.NEXT_PUBLIC_ORCAPRO_ONLY,
  marketingUrl: process.env.NEXT_PUBLIC_MARKETING_URL,
});

export const ORCAPRO_ONLY = product.orcaproOnly;
export const MARKETING_URL = product.marketingUrl;
export const PRODUCT_NAME = ORCAPRO_ONLY ? 'OrçaPro' : 'Gestão de Prédios';
export const PRODUCT_DOMAIN = ORCAPRO_ONLY ? 'orcaproobras.com.br' : 'gestaodepredios.com.br';

export type LoginDestination = '/dashboard' | '/orcapro' | '/programas';

export function loginDestination(value: string | null, orcaproOnly = ORCAPRO_ONLY): LoginDestination {
  if (orcaproOnly) return '/orcapro';
  return value === '/orcapro' || value === '/programas' ? value : '/dashboard';
}

export function loginConfiguration(destination: LoginDestination, orcaproOnly = ORCAPRO_ONLY) {
  const target = loginDestination(destination, orcaproOnly);
  const requiresOrganization = target !== '/orcapro';
  return {
    destination: target,
    requiresOrganization,
    endpoint: requiresOrganization ? '/auth/login' : '/auth/orcapro/login',
  };
}

export function authenticatedLoginDestination(
  destination: LoginDestination,
  access: { maintenanceAccess?: boolean; orcaproEnabled?: boolean },
): LoginDestination | '/orcapro/assinatura' {
  if (destination === '/orcapro') return access.orcaproEnabled === true ? '/orcapro' : '/orcapro/assinatura';
  return destination === '/dashboard' && access.maintenanceAccess === false ? '/programas' : destination;
}

export function exitDestination(fallback = '/login', config = product): string {
  return config.orcaproOnly && config.marketingUrl ? config.marketingUrl : fallback;
}

export function stripeDestination(value: string | null): string {
  if (!value) throw new Error('O Stripe não retornou um endereço de contratação.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) {
    throw new Error('Endereço de contratação Stripe inválido.');
  }
  return url.href;
}
