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
export const GESTAO_ONLY = process.env.NEXT_PUBLIC_GESTAO_ONLY === 'true';
export const PRODUCT_NAME = GESTAO_ONLY ? 'OrçaPro Gestão Contratual' : ORCAPRO_ONLY ? 'OrçaPro' : 'Gestão de Prédios';
export const PRODUCT_DOMAIN = GESTAO_ONLY ? 'orcaprogestaocontratual.com.br' : ORCAPRO_ONLY ? 'orcaproobras.com.br' : 'gestaodepredios.com.br';

export const isContractDevelopmentHost = (hostname: string) => ['gestaodepredios.com.br', 'www.gestaodepredios.com.br', 'localhost', '127.0.0.1'].includes(hostname);

export const isContractHost = (hostname: string) => isContractDevelopmentHost(hostname) || (GESTAO_ONLY && ['orcaprogestaocontratual.com.br','www.orcaprogestaocontratual.com.br'].includes(hostname));

export type LoginDestination = '/dashboard' | '/orcapro' | '/orcapro-infraestrutura' | '/programas' | '/gestao-contratual';

export function loginDestination(value: string | null, orcaproOnly = ORCAPRO_ONLY, contractDevelopment = false): LoginDestination {
  if (GESTAO_ONLY) return '/gestao-contratual';
  if (orcaproOnly) return '/orcapro';
  if (value === '/gestao-contratual' && contractDevelopment) return value;
  return value === '/orcapro' || value === '/programas' || value === '/orcapro-infraestrutura' ? value : '/dashboard';
}

export function loginConfiguration(destination: LoginDestination, orcaproOnly = ORCAPRO_ONLY, contractDevelopment = false) {
  const target = loginDestination(destination, orcaproOnly, contractDevelopment);
  const requiresOrganization = target !== '/orcapro' && target !== '/orcapro-infraestrutura' && target !== '/gestao-contratual';
  return {
    destination: target,
    requiresOrganization,
    endpoint: target === '/gestao-contratual' ? '/auth/gestao/login' : target === '/orcapro-infraestrutura' ? '/infraestrutura/auth/login' : requiresOrganization ? '/auth/login' : '/auth/orcapro/login',
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
