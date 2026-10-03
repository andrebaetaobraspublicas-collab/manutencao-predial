export type AppEnvironment = Record<string, unknown> & {
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
};

export function validateEnvironment(config: Record<string, unknown>): AppEnvironment {
  const databaseUrl = String(config.DATABASE_URL ?? '');
  const jwtSecret = String(config.JWT_ACCESS_SECRET ?? '');

  if (!databaseUrl.startsWith('mysql://')) {
    throw new Error('DATABASE_URL deve ser uma URL MySQL válida.');
  }

  if (jwtSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET deve possuir pelo menos 32 caracteres.');
  }

  const stripeKey = String(config.ORCAPRO_STRIPE_SECRET_KEY || (config.ORCAPRO_ENABLED === 'true' ? config.STRIPE_SECRET_KEY : '') || '');
  if (stripeKey) {
    const mode = String(config.ORCAPRO_STRIPE_MODE ?? '');
    if (!['TEST', 'LIVE'].includes(mode)) throw new Error('ORCAPRO_STRIPE_MODE deve ser TEST ou LIVE quando a cobrança OrçaPro estiver configurada.');
    if (!new RegExp(`^(?:sk|rk)_${mode === 'LIVE' ? 'live' : 'test'}_`).test(stripeKey)) throw new Error('ORCAPRO_STRIPE_SECRET_KEY não corresponde ao modo de cobrança configurado.');
  }
  const portalConfiguration = String(config.ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID ?? '');
  if (portalConfiguration && !/^bpc_[A-Za-z0-9]+$/.test(portalConfiguration)) throw new Error('ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID deve ser um identificador bpc_ válido.');
  if (config.ORCAPRO_MARKETING_URL) {
    let marketing: URL;
    try { marketing = new URL(String(config.ORCAPRO_MARKETING_URL)); } catch { throw new Error('ORCAPRO_MARKETING_URL deve ser um endereço HTTPS público.'); }
    if (marketing.protocol !== 'https:' || marketing.username || marketing.password) throw new Error('ORCAPRO_MARKETING_URL deve ser um endereço HTTPS público.');
  }

  return config as AppEnvironment;
}
