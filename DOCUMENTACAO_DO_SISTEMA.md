# Gestão de Prédios — documentação consolidada da fundação v0.1

## 1. Produto

O **Gestão de Prédios** é um SaaS multi-tenant para manutenção predial, contratos e acompanhamento gerencial, destinado ao domínio `www.gestaodepredios.com.br`. A ordem de serviço é o agregado central e conecta edificação, demandante, fornecedor, contrato, SLA, pendência, evidência, orçamento, medição, custo e satisfação.

## 2. Stack e implantação

- Node.js LTS e TypeScript;
- NestJS para API REST;
- Next.js/React para frontend;
- MySQL 8 e Prisma ORM;
- Stripe para assinatura;
- MapLibre/provedor configurável para mapas;
- Hostinger, preferencialmente VPS com Docker Compose;
- frontend em `www.gestaodepredios.com.br` e API em `api.gestaodepredios.com.br`.

Diagramas renderizados:

- `docs/assets/arquitetura-tecnica.svg`;
- `docs/assets/modelo-dados-central.svg`.

Diagramas como código:

- `docs/diagrams/arquitetura.dot`;
- `docs/diagrams/modelo-dados-central.dot`;
- diagramas Mermaid em `docs/01-arquitetura-tecnica.md` e `docs/02-modelo-de-dados.md`.

## 3. Decisão arquitetural

O MVP utiliza monólito modular em monorepo. A decisão reduz custo e complexidade, preserva transações entre OS, contratos, orçamento e medição e permite extrair serviços mais tarde somente quando houver justificativa de escala ou isolamento.

## 4. Modelo de dados

O schema cobre:

- tenants, usuários, memberships, sessões e assinatura;
- edificações e georreferenciamento;
- fornecedores;
- contratos, imóveis abrangidos, aditivos, ajustes, subcontratações e penalidades;
- empenhos e movimentos;
- OS, vínculos contratuais, pendências, anexos, histórico, orçamento e satisfação;
- medições e itens;
- ativos e planos de manutenção;
- KPIs;
- auditoria e eventos Stripe.

O dicionário e os diagramas ER estão em `docs/02-modelo-de-dados.md`.

## 5. Código inicial

A fundação implementa autenticação multi-tenant, edificações, fornecedores, contratos, caminho crítico da OS, backlog, anexos privados, dashboard, PDF inicial e esqueleto de cobrança. O status preciso — sem confundir tabela modelada com módulo concluído — está em `docs/12-status-da-implementacao.md`.

## 6. Roadmap

- **v1.0/MVP:** conta SaaS completa, usuários, Stripe, geocodificação, OS operacional completa, contratos essenciais, relatórios e produção confiável;
- **v2.0:** ativos, planos preventivos, SINAPI/orçamento, medições, empenhos, ajustes, penalidades e desempenho de fornecedores;
- **v3.0:** fiscalização administrativa de terceirizados, sustentabilidade, KPIs avançados, confiabilidade e inteligência gerencial explicável.

Detalhamento: `docs/05-roadmap.md`.

## 7. Monetização recomendada

Hipótese de lançamento, sujeita a entrevistas e pilotos:

| Plano | Preço mensal sugerido | Limite principal |
|---|---:|---|
| Trial assistido | R$ 0 por 30 dias | 3 edifícios / 5 operacionais |
| Essencial | R$ 349 | 3 edifícios / 5 operacionais |
| Profissional | R$ 799 | 15 edifícios / 15 operacionais |
| Gestão Ampla | R$ 1.990 | 50 edifícios / 50 operacionais |
| Enterprise | a partir de R$ 4.900 | proposta e requisitos próprios |

Demandantes de abertura/acompanhamento devem ser gratuitos ou ter limite amplo. O preço combina edifícios ativos, usuários operacionais, OS anuais, armazenamento e recursos avançados. Consulte `docs/06-monetizacao.md`.

## 8. Documentação para Codex

- `AGENTS.md`: regras permanentes;
- `CODEX_START_HERE.md`: entrada da próxima sessão;
- `docs/08-handoff-codex.md`: processo de handoff;
- `docs/13-plano-inicial-de-issues-codex.md`: backlog inicial de issues;
- `docs/adr/`: decisões arquiteturais;
- `VALIDATION.md`: o que foi e não foi executado.

## 9. Próxima ação obrigatória

Executar GP-001 em ambiente com acesso ao npm: instalar, gerar lockfile/client Prisma, criar a migração inicial, subir MySQL, rodar seed, lint, testes, builds e Docker. Somente depois iniciar novos módulos.
