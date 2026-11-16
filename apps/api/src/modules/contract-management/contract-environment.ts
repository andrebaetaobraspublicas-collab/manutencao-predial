export const GESTAO_PRODUCTION_HOSTS = ['orcaprogestaocontratual.com.br', 'www.orcaprogestaocontratual.com.br'];
type Configuration = { get(key: string): unknown };
export function contractProduction(config: Configuration): boolean {
  try {
    const url = new URL(String(config.get('WEB_BASE_URL') || ''));
    return config.get('GESTAO_STANDALONE') === 'true' && url.protocol === 'https:' && GESTAO_PRODUCTION_HOSTS.includes(url.hostname);
  } catch { return false; }
}
export function contractEnvironment(config: Configuration): boolean {
  if (config.get('GESTAO_ENABLED') !== 'true') return false;
  if (config.get('GESTAO_STANDALONE') === 'true') return contractProduction(config);
  try { return ['gestaodepredios.com.br', 'www.gestaodepredios.com.br', 'localhost', '127.0.0.1'].includes(new URL(String(config.get('WEB_BASE_URL') || '')).hostname); }
  catch { return false; }
}
