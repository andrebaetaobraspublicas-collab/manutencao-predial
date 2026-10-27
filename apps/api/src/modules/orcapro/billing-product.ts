import type { ConfigService } from '@nestjs/config';

/** The Infraestrutura installation owns its database and its Stripe catalog. */
export function billingProduct(config: Pick<ConfigService, 'get'>) {
  return config.get<string>('INFRA_COMMERCIAL') === 'true'
    ? { key: 'ORCAPRO_INFRA', prefix: 'orcapro-infra', name: 'OrçaPro Infraestrutura', path: '/orcapro-infraestrutura' }
    : { key: 'ORCAPRO', prefix: 'orcapro', name: 'OrçaPro', path: '/orcapro' };
}
