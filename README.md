# Gestão de Prédios — v0.8.0

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
- geocodificação confirmada com fallback manual;
- catálogos, checklists e SLA configurável com calendários/turnos;
- comentários, menções e notificações transacionais;
- aceite, fechamento, elegibilidade de medição e reabertura auditáveis;
- dashboard e central de relatórios de OS/contratos em PDF e CSV;
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

Antes do seed, defina `SEED_ADMIN_PASSWORD` no `.env` com pelo menos 12 caracteres. O usuário de demonstração criado é:

```text
Tenant: demonstracao
E-mail: admin@gestaodepredios.com.br
Senha: valor configurado em SEED_ADMIN_PASSWORD
```

Nunca use a senha de desenvolvimento em produção; configure uma senha exclusiva no ambiente da hospedagem. O seed cria a credencial apenas quando a conta ainda não existe e não restaura senha, papel, situação ou sequência em execuções posteriores.

## E-mail de convites e recuperação

A v0.6 usa a API da Resend para convites, redefinição de senha e verificação de e-mail.
Configure `EMAIL_FROM` com um remetente de domínio validado e `RESEND_API_KEY` apenas no ambiente.
Sem essas variáveis, o desenvolvimento registra o link no log; em produção, convites e verificações
falham de forma explícita, enquanto a recuperação mantém resposta genérica para não enumerar contas.

Validação antes de liberar o ambiente publicado:

```bash
npm run smoke:production
```

O comando verifica domínio raiz, frontend, health da API e Swagger, retornando código diferente de zero quando qualquer endpoint falha.

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
