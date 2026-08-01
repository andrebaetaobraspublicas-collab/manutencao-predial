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
