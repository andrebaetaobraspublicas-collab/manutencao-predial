# Diagnóstico e estabilização — Fase A

Data de referência: **1º de agosto de 2026** (`America/Sao_Paulo`).

Este documento registra somente constatações verificadas no repositório e no ambiente Hostinger. Ele não altera a classificação comercial da fundação: a versão atual continua sendo candidata a piloto controlado, e não o MVP Comercial 1.0 concluído.

## 1. Resumo

### Objetivo

- auditar a fundação existente sem recriar o projeto;
- reproduzir instalação, análise estática, testes e builds;
- conferir schema, migração, publicação e documentação;
- corrigir problemas de estabilidade e automação antes de novos módulos.

### Resultado atual

- a instalação limpa, o lint, os três testes unitários, o schema Prisma e os builds de API e frontend foram aprovados;
- a auditoria de dependências não encontrou vulnerabilidades conhecidas;
- os 33 modelos Prisma estão cobertos pela migração inicial versionada, também com 33 tabelas;
- frontend e API estão com processo `Running` e último deployment `Completed` na Hostinger;
- a publicação ainda **não está disponível publicamente**: raiz e `www` retornam HTTP 503; health e Swagger da API retornam HTTP 404;
- a CI passou a aplicar migrações versionadas e a executar uma suíte integrada de isolamento multiempresa;
- os builds Docker passaram a usar `package-lock.json` e `npm ci`;
- foi criado um smoke test público reproduzível.

## 2. Estrutura e tecnologias verificadas

```text
apps/api      NestJS 11, Prisma 7, MySQL/MariaDB adapter, JWT, Stripe e PDFKit
apps/web      Next.js 16, React 19, MapLibre GL e App Router
docs          especificação, arquitetura, modelo, API, roadmap, segurança e ADRs
infra/nginx   reverse proxy de referência para frontend e API
.github       pipeline de integração contínua
```

O repositório é um monorepo npm workspaces e preserva o monólito modular documentado. Não foram encontrados microserviços ou uma segunda implementação paralela dos módulos existentes.

Versões verificadas nesta máquina:

- Node.js `24.16.0`;
- npm `11.13.0`;
- Prisma `7.9.1`;
- TypeScript `5.9.2`.

## 3. Arquitetura implementada

### Backend

- API REST NestJS com prefixo `/api/v1` e Swagger em `/docs`;
- validação global com lista positiva de campos;
- `helmet`, compressão, CORS com credenciais e cookies;
- Prisma usando MySQL e adaptador MariaDB;
- módulos atuais: autenticação, billing, edificações, fornecedores, contratos, ordens de serviço, dashboard, relatórios e health.

### Frontend

- Next.js com App Router;
- páginas de login, dashboard, edificações, fornecedores, contratos e ordens de serviço;
- build `standalone` preparado para o Web App gerenciado da Hostinger;
- cliente REST configurado por `NEXT_PUBLIC_API_URL`.

### Autenticação e autorização

- access token JWT curto e refresh token opaco rotativo;
- tokens enviados em cookies HttpOnly, `SameSite=Lax` e `Secure` configurável;
- hash SHA-256 do refresh token no banco;
- revalidação de usuário, vínculo, expiração e situação da organização em cada access token;
- RBAC inicial por vínculo usuário–organização;
- `tenantId` do contexto autenticado usado nos serviços operacionais inspecionados.

O RBAC atual ainda depende de papéis fixos. Permissões granulares, convites, recuperação de senha, verificação real de e-mail, rate limiting e CSRF adicional permanecem pendentes.

### Isolamento multiempresa

As rotas de edificações, fornecedores, contratos e OS consultadas derivam o `tenantId` do usuário autenticado. Referências relacionadas são verificadas contra a mesma organização antes de criar vínculos. Demandantes são limitados às próprias OS e anexos passam pela OS autorizada.

Foi adicionada uma suíte e2e que cria duas organizações sintéticas e verifica:

- listagem e detalhe sem vazamento entre organizações;
- bloqueio de edição cruzada de edificação;
- rejeição de OS vinculada a edificação de outra organização;
- bloqueio de pendência em OS de outra organização;
- bloqueio de download de anexo de outra organização.

Essa suíte compilou no lint local, mas depende de MySQL para execução. A execução real foi integrada à CI.

### Arquivos

- armazenamento fora da pasta pública;
- diretório segregado por organização e OS;
- nome interno UUID;
- limite de tamanho no interceptor;
- lista positiva de MIME;
- verificação de assinatura para JPEG, PNG, WebP e PDF;
- hash SHA-256 e metadados no banco;
- download autenticado e auditado;
- proteção contra saída do diretório configurado.

O armazenamento do Web App gerenciado ainda precisa de garantia formal de persistência, backup e restauração. A regra temporária de Remote MySQL `Any Host` também precisa ser restringida.

## 4. Banco de dados e migrações

### Estado verificado

- banco: MySQL 8 compatível;
- schema: 33 modelos e 28 enums;
- migrações: uma migração versionada, `20260801195500_initial_schema`;
- SQL da migração: 33 instruções de criação de tabela;
- valores monetários principais usam `Decimal`;
- entidades operacionais centrais possuem `tenantId` e índices compostos;
- entidades principais usam `deletedAt` ou estado, conforme o estágio atual.

### Compatibilidade e reversão

Não houve alteração de schema nesta fase. A migração publicada não foi modificada. Portanto:

- não há conversão de dados nesta entrega;
- não há nova migração;
- rollback de aplicação continua sendo feito por artefato anterior;
- rollback de banco continua dependendo de backup/restauração e de migrações compatíveis, conforme `docs/07-deploy-hostinger.md`.

### Limitação de validação local

Não há Docker nem MySQL local nesta máquina. Por isso `prisma migrate status`, aplicação da migração, seed e teste e2e não puderam ser executados localmente. A migração e o seed já foram executados durante o deployment da API na Hostinger, conforme o histórico de publicação registrado.

## 5. Estado real dos módulos

| Área | Estado verificado | Observação |
|---|---|---|
| Autenticação básica | Implementado, parcialmente testado | registro de tenant, login, refresh, logout e `me`; faltam fluxos de conta do MVP |
| RBAC | Implementado inicialmente | papéis fixos; permissões granulares pendentes |
| Multiempresa | Implementado no caminho atual | nova suíte e2e integrada; execução em MySQL pendente de CI |
| Edificações | Implementado inicialmente | CRUD, arquivo lógico, coordenadas e mapa; geocodificação pendente |
| Fornecedores | Implementado inicialmente | cadastro, edição e contadores |
| Contratos | Implementado inicialmente | cadastro, edição, imóveis, fornecedor, gestor/fiscal e valores |
| Ordens de serviço | Implementado inicialmente | emissão, filtros, detalhe, transições, pendências, anexos e satisfação |
| Backlog/dashboard | Implementado inicialmente | indicadores e dimensões iniciais, ainda sem toda a análise do MVP |
| Relatórios | Parcialmente implementado | um PDF de backlog, limitado a 100 OS |
| Billing | Parcialmente implementado | estrutura Stripe existente; validação comercial completa pendente |
| Ativos e planos | Modelado | sem API/interface/fluxo completo |
| Orçamentos e medições | Modelado | sem fluxo de aplicação completo |
| KPIs amplos | Modelado | dashboard contém somente indicadores iniciais |
| Notificações e gestão de usuários | Planejado | não implementado |

## 6. Alterações da Fase A

### Arquivos novos

- `apps/api/test/multi-tenant-isolation.e2e-spec.ts`;
- `scripts/smoke-production.mjs`;
- `docs/14-diagnostico-fase-a.md`.

### Arquivos modificados

- `.github/workflows/ci.yml`;
- `apps/api/Dockerfile`;
- `apps/web/Dockerfile`;
- `apps/api/test/jest-e2e.json`;
- `package.json`;
- documentação de validação, status, continuidade e changelog.

### Banco, APIs e frontend

- banco: nenhuma mudança de schema ou dados;
- APIs: nenhuma mudança de contrato funcional;
- frontend: nenhuma mudança funcional;
- publicação: nenhum redeploy foi disparado nesta fase até o domínio público ser corrigido.

## 7. Validação executada

| Verificação | Resultado |
|---|---|
| `npm ci` | aprovado: 1.089 pacotes instalados, 0 vulnerabilidades |
| `npm audit --omit=dev` | aprovado: 0 vulnerabilidades |
| `prisma validate` com URL sintática de build | aprovado |
| `npm run lint` | aprovado na API e no frontend |
| `npm run test` | aprovado: 1 suíte, 3 testes |
| `npm run build` com variáveis obrigatórias de build | aprovado: NestJS + 10 rotas Next.js |
| tipos da nova suíte e2e | aprovados pelo `tsc --noEmit` |
| `npm run smoke:production` | reprovado: 4 de 4 verificações públicas falharam |
| Docker build | não executado: Docker ausente nesta máquina |
| migração/seed local | não executado: MySQL local ausente |
| teste e2e local | não executado: MySQL local ausente |

## 8. Publicação Hostinger

### Estado do painel

- frontend `gestaodepredios.com.br`: processo `Running`, deployment v0.3.0 `Completed`, zero issues e zero errors nos logs da última hora;
- API `api.gestaodepredios.com.br`: processo `Running`, deployment v0.2.8 `Completed`, zero issues e zero errors nos logs da última hora;
- DNS no hPanel: ALIAS de `@`, CNAME de `www` e CNAME de `api` aparecem cadastrados com TTL 300;
- nameservers: Hostinger (`aurora.dns-parking.com` e `nebula.dns-parking.com`).

### Estado público

- `https://gestaodepredios.com.br/`: HTTP 503;
- `https://www.gestaodepredios.com.br/`: HTTP 503;
- `https://api.gestaodepredios.com.br/api/v1/health`: HTTP 404;
- `https://api.gestaodepredios.com.br/docs`: HTTP 404.

Os cabeçalhos e páginas de erro são emitidos pelo CDN da Hostinger. Como os processos estão ativos e não registram erros, a evidência atual aponta para vínculo/roteamento de domínio no CDN, não para falha de compilação do código.

## 9. Problemas, riscos e débitos técnicos

### Bloqueadores do piloto público

1. corrigir o roteamento dos três hosts na Hostinger;
2. executar novamente o smoke test até obter sucesso integral;
3. executar a suíte e2e em MySQL e registrar o resultado;
4. restringir o Remote MySQL atualmente liberado para `Any Host`;
5. comprovar persistência e backup dos anexos no Web App gerenciado;
6. testar restauração do banco e dos anexos.

### Bloqueadores antes de dados reais de produção

- rate limiting e proteção contra tentativas repetidas;
- recuperação/alteração de senha, convites e verificação de e-mail;
- permissões granulares e revogação administrativa de sessões;
- CSRF adicional compatível com cookies;
- request ID, logs estruturados, mascaramento e alertas;
- fechamento e reabertura robustos da OS;
- validação completa do Stripe em modo de teste;
- termos, privacidade, retenção e resposta a incidentes.

## 10. Próxima etapa recomendada

Concluir o restante do Marco A na ordem:

```text
roteamento público Hostinger
→ CI com migrações e isolamento multiempresa
→ GP-003 hardening inicial da API
→ somente então iniciar gestão de usuários e demais módulos do MVP
```
