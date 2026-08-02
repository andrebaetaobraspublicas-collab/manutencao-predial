# Registro de validação da fundação v0.1

Consulte `docs/12-status-da-implementacao.md` para a matriz completa.

## Concluído no pacote original

- JSON válido;
- YAML válido;
- 84 arquivos TypeScript/TSX sem erro sintático;
- imports relativos verificados;
- diagramas Graphviz renderizados;
- arquivo privado e isolamento de tenant revisados no caminho crítico;
- documentação e Docker revisados estaticamente.

## Validação executada em 1º de agosto de 2026

- Node.js `24.16.0` e npm `11.13.0`;
- instalação limpa com `package-lock.json` e `npm ci --dry-run`;
- `prisma validate` e `prisma generate` com Prisma `7.9.1`;
- migração MySQL `20260801195500_initial_schema` gerada e revisada estaticamente;
- `npm run lint` aprovado na API e no frontend;
- três testes unitários da máquina de estados aprovados;
- build NestJS aprovado;
- build Next.js de produção aprovado, incluindo type-check e geração das dez rotas;
- scripts independentes `build:web` e `build:api` aprovados para o deploy gerenciado da Hostinger;
- `npm audit` e `npm audit --omit=dev` sem vulnerabilidades conhecidas após atualização de dependências e overrides compatíveis.

## Pendente no ambiente com MySQL/Docker

O Docker Desktop e um servidor MySQL local não estavam disponíveis nesta máquina. Permanecem obrigatórios no VPS/staging:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d mysql
docker compose -f docker-compose.prod.yml run --rm api npm run prisma:deploy -w @gestaopredios/api
npm run db:seed
docker compose -f docker-compose.prod.yml up -d
```

Depois, executar health check, fluxo autenticado, isolamento entre tenants, upload/download e smoke tests de navegador. A v0.1 permanece restrita a piloto controlado até os bloqueadores de segurança do roadmap serem concluídos.

## Piloto Hostinger em 1º de agosto de 2026

- frontend Next.js implantado no Web App `gestaodepredios.com.br`, com build standalone v0.3.0 concluído, processo marcado como `Running` e zero erros no runtime após o redeploy;
- API NestJS implantada no Web App `api.gestaodepredios.com.br`, com build v0.2.8 concluído e processo marcado como `Running`;
- banco MySQL da Hostinger criado, migração `20260801195500_initial_schema` aplicada e seed administrativo idempotente executado;
- variáveis de produção configuradas no hPanel sem versionar segredos;
- CNAME `api` criado para `api.gestaodepredios.com.br.cdn.hstgr.net`, com TTL de 300 segundos;
- build standalone da API validado com `prisma generate`, `nest build`, materialização de `apps/api/dist`, migração, seed e verificação do entrypoint;
- runtime standalone do Next.js validado com dependências rastreadas, `server.js`, arquivos estáticos e conteúdo público;
- `npm audit --omit=dev` permaneceu sem vulnerabilidades conhecidas.

As validações públicas de `/api/v1/health`, `/docs` e do frontend ficaram pendentes da publicação/propagação do DNS e do roteamento CDN. A regra temporária de MySQL remoto `Any Host` deve ser substituída por uma origem restrita assim que o IP de saída do runtime puder ser confirmado.

## Diagnóstico da Fase A em 1º de agosto de 2026

- `npm ci` aprovado com 1.089 pacotes e zero vulnerabilidades conhecidas;
- Prisma validado com URL MySQL sintaticamente válida para build;
- lint da API e do frontend aprovado;
- três testes unitários aprovados;
- build NestJS e build Next.js das dez rotas aprovados;
- nova suíte e2e de isolamento multiempresa compilou e foi integrada à CI;
- a CI passou de `prisma db push` para `prisma migrate deploy`;
- Dockerfiles passaram a usar `package-lock.json` e `npm ci`;
- `npm run smoke:production` reprovou as quatro verificações: raiz 503, `www` 503, health 404 e Swagger 404;
- hPanel confirmou frontend e API como `Running`, deployments `Completed` e zero erros nos logs da última hora;
- o bloqueio público foi classificado como DNS/roteamento CDN e permanece aberto.

Não executados localmente por ausência de Docker/MySQL: build das imagens, aplicação real da migração, seed e suíte e2e. Consulte `docs/14-diagnostico-fase-a.md`.
