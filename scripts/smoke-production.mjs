const webBaseUrl = process.env.SMOKE_WEB_URL ?? 'https://www.gestaodepredios.com.br';
const rootUrl = process.env.SMOKE_ROOT_URL ?? 'https://gestaodepredios.com.br';
const apiBaseUrl = process.env.SMOKE_API_URL ?? 'https://api.gestaodepredios.com.br';

const checks = [
  {
    name: 'domínio raiz',
    url: `${rootUrl}/`,
    validate: (response) => response.ok || (response.status >= 300 && response.status < 400),
  },
  {
    name: 'frontend',
    url: `${webBaseUrl}/`,
    validate: (response) => response.ok,
  },
  {
    name: 'health da API',
    url: `${apiBaseUrl}/api/v1/health`,
    validate: async (response) => {
      if (!response.ok) return false;
      const body = await response.json().catch(() => null);
      return body?.status === 'ok' && body?.service === 'gestao-de-predios-api';
    },
  },
  {
    name: 'prontidão da API e banco',
    url: `${apiBaseUrl}/api/v1/health/ready`,
    validate: async (response) => {
      if (!response.ok) return false;
      const body = await response.json().catch(() => null);
      return body?.readiness === 'ready' && body?.database === 'reachable';
    },
  },
  {
    name: 'Swagger',
    url: `${apiBaseUrl}/docs`,
    validate: (response) => response.ok,
  },
];

let failures = 0;

for (const check of checks) {
  try {
    const response = await fetch(check.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    const passed = await check.validate(response);
    console.log(`${passed ? 'PASS' : 'FAIL'} ${check.name}: HTTP ${response.status} ${check.url}`);
    if (!passed) failures += 1;
  } catch (error) {
    failures += 1;
    console.error(
      `FAIL ${check.name}: ${error instanceof Error ? error.message : 'erro desconhecido'} ${check.url}`,
    );
  }
}

if (failures > 0) {
  console.error(`Smoke test reprovado: ${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Smoke test de produção aprovado.');
}
