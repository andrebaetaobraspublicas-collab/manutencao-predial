// The shared development site keeps its original identity.
export const INFRA_PRODUCTION =
  process.env.NEXT_PUBLIC_API_URL === 'https://api.orcaproinfra.com.br/api/v1';
