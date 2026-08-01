# Gestão de Prédios — starter técnico v0.1

Base inicial do SaaS hospedado no domínio `www.gestaodepredios.com.br`, com:

- Node.js + TypeScript;
- NestJS para a API;
- Next.js/React para o frontend;
- MySQL + Prisma ORM;
- arquitetura multi-tenant;
- autenticação segura por cookies HttpOnly;
- edificações, fornecedores, contratos e ordens de serviço;
- backlog analítico por fornecedor, edificação e demandante;
- pendências, histórico de status, fotos e PDFs privados;
- dashboard e primeiro relatório PDF;
- documentação preparada para continuidade no Codex.

## Arquitetura escolhida

O MVP é um **monólito modular** em monorepo. É a opção mais segura para começar: uma única base transacional preserva consistência entre OS, contratos, medições e orçamento, reduz custo de hospedagem e permite separar módulos em serviços somente quando métricas reais justificarem.

```text
Navegador
   │
   ├── www.gestaodepredios.com.br  → Next.js
   │
   └── api.gestaodepredios.com.br  → NestJS API
                                         │
                           ┌─────────────┼──────────────┐
                           │             │              │
                         MySQL       arquivos privados  Stripe
```

## Pré-requisitos

- Node.js 24 LTS recomendado;
- npm 10 ou superior;
- Docker Desktop ou MySQL 8.4 local.

## Instalação local

```bash
cp .env.example .env
npm install
npm run db:up
npm run prisma:generate -w @gestaopredios/api
npm run db:migrate
npm run db:seed
npm run dev
```

Acessos locais:

- Frontend: `http://localhost:3000`
- API: `http://localhost:3001/api/v1`
- Swagger: `http://localhost:3001/docs`

Usuário de demonstração criado pelo seed:

```text
Tenant: demonstracao
E-mail: admin@gestaodepredios.com.br
Senha: Con2026!Demo
```

Altere a senha e todos os segredos antes de qualquer publicação.

## Estrutura

```text
apps/api          API NestJS e schema Prisma
apps/web          interface Next.js
infra             configuração de implantação
/docs             especificação e decisões arquiteturais
AGENTS.md         regras para agentes de código e Codex
```

## Publicação de referência

Para produção em VPS, use o arquivo `.env.production.example` como ponto de partida e o `docker-compose.prod.yml`. O `DATABASE_URL` deve ser informado completo, com credenciais codificadas para URL; o Compose não concatena a senha para evitar falhas com caracteres especiais. O procedimento detalhado está em `docs/07-deploy-hostinger.md`.

## Estado desta entrega

Esta é uma fundação de engenharia, não a versão comercial final. O código implementa o caminho crítico da OS e deixa os módulos mais amplos modelados/documentados para evolução incremental. Consulte `docs/05-roadmap.md`.
