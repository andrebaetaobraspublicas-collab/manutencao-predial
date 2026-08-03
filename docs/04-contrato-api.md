# Contrato inicial da API

Base local: `/api/v1`. Em produção: `https://api.gestaodepredios.com.br/api/v1`.

A documentação executável fica em `/docs` via Swagger. Este arquivo registra o contrato conceitual e deve ser atualizado com mudanças incompatíveis.

## 1. Convenções

- JSON UTF-8;
- datas ISO 8601;
- moeda enviada como número decimal na API e persistida como `DECIMAL`;
- paginação: `page`, `pageSize`, `total`, `totalPages`;
- erros de validação retornam HTTP 400;
- autenticação ausente/inválida retorna 401;
- permissão insuficiente retorna 403;
- objeto não encontrado no tenant retorna 404;
- conflitos de unicidade retornam 409.

Exemplo de erro:

```json
{
  "statusCode": 400,
  "message": ["buildingId must be a UUID"],
  "error": "Bad Request"
}
```

## 2. Autenticação

| Método | Rota | Finalidade |
|---|---|---|
| POST | `/auth/register-tenant` | cria tenant trial e proprietário |
| POST | `/auth/login` | autentica por tenant, e-mail e senha |
| POST | `/auth/refresh` | rotaciona sessão |
| POST | `/auth/logout` | revoga refresh e limpa cookies |
| GET | `/auth/me` | retorna usuário, tenant e papel atuais |
| POST | `/auth/invitations/inspect` | valida convite sem consumi-lo |
| POST | `/auth/invitations/accept` | aceita convite e ativa o vínculo |
| POST | `/auth/password/change` | altera senha autenticada e revoga sessões |
| POST | `/auth/password/forgot` | solicita recuperação sem enumerar contas |
| POST | `/auth/password/reset` | redefine senha com token de uso único |
| POST | `/auth/email-verification/request` | envia confirmação para a conta autenticada |
| POST | `/auth/email-verification/confirm` | confirma o endereço com token de uso único |

## 2.1 Usuários e convites

| Método | Rota | Perfil |
|---|---|---|
| GET | `/members` | proprietário ou administrador |
| GET | `/members/directory` | qualquer membro autenticado; somente vínculos/usuários ativos |
| GET | `/members/invitations` | proprietário ou administrador |
| POST | `/members/invitations` | proprietário ou administrador |
| PATCH | `/members/:membershipId` | proprietário ou administrador, com proteção hierárquica |
| POST | `/members/:membershipId/revoke-sessions` | proprietário ou administrador, com proteção hierárquica |

O `tenantId` de todas essas operações deriva do token. Convites não podem atribuir `OWNER`;
administradores não podem conceder ou administrar outro `ADMIN`. Alterações de papel, situação
ou validade revogam as sessões do vínculo e geram auditoria.

Login:

```json
{
  "tenantSlug": "demonstracao",
  "email": "admin@gestaodepredios.com.br",
  "password": "senha"
}
```

## 3. Edificações

| Método | Rota | Perfil mínimo conceitual |
|---|---|---|
| GET | `/buildings` | autenticado |
| GET | `/buildings/:id` | autenticado |
| POST | `/buildings` | gestor |
| PATCH | `/buildings/:id` | gestor |
| DELETE | `/buildings/:id` | administrador |
| POST | `/geocoding/search` | gestor |

Criação:

```json
{
  "code": "EDF-001",
  "name": "Edifício-Sede",
  "type": "Administrativo",
  "addressLine1": "Praça Central, 100",
  "city": "Brasília",
  "state": "DF",
  "postalCode": "70000-000",
  "latitude": -15.79,
  "longitude": -47.88,
  "geocodingConfirmed": true,
  "geocodingProvider": "nominatim",
  "geocodingLookupId": "uuid",
  "geocodingCandidateId": "identificador-do-candidato",
  "grossAreaM2": 12500
}
```

## 4. Fornecedores

| Método | Rota |
|---|---|
| GET | `/suppliers` |
| GET | `/suppliers/:id` |
| POST | `/suppliers` |
| PATCH | `/suppliers/:id` |

## 5. Contratos

| Método | Rota |
|---|---|
| GET | `/contracts` |
| GET | `/contracts/:id` |
| POST | `/contracts` |
| PATCH | `/contracts/:id` |

Criação:

```json
{
  "code": "CT-2026/001",
  "supplierId": "uuid",
  "object": "Manutenção preventiva e corretiva",
  "type": "INTEGRATED_MAINTENANCE",
  "status": "ACTIVE",
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "originalValue": 1500000,
  "buildingIds": ["uuid"]
}
```

## 6. Ordens de serviço

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/work-orders` | lista e filtra |
| POST | `/work-orders` | emite OS |
| GET | `/work-orders/:id` | detalhe integral |
| PATCH | `/work-orders/:id` | altera dados editáveis |
| POST | `/work-orders/:id/transitions` | muda status |
| POST | `/work-orders/:id/comments` | adiciona comentário imutável e menções |
| POST | `/work-orders/:id/checklist/:itemId/responses` | adiciona resposta histórica ao checklist |
| POST | `/work-orders/:id/close` | registra aceite e fecha |
| POST | `/work-orders/:id/reopen` | reabre com motivo obrigatório |
| POST | `/work-orders/:id/pendencies` | cria pendência |
| PATCH | `/work-orders/:id/pendencies/:pendencyId/resolve` | resolve pendência |
| POST | `/work-orders/:id/satisfaction` | registra avaliação |
| POST | `/work-orders/:id/attachments` | envia foto/PDF |
| GET | `/work-orders/:id/attachments/:attachmentId/download` | download autorizado |

### Filtros da lista

| Parâmetro | Tipo | Uso |
|---|---|---|
| `status` | enum | status específico |
| `priority` | enum | prioridade |
| `buildingId` | UUID | edificação |
| `supplierId` | UUID | fornecedor |
| `requesterUserId` | UUID | demandante |
| `hasOpenPendency` | boolean | pendência aberta |
| `overdue` | boolean | SLA de resolução vencido |
| `backlogOnly` | boolean | somente estados abertos |
| `search` | string | número, título ou descrição |
| `openedFrom/openedTo` | data | período de abertura |
| `page/pageSize` | inteiro | paginação |

Criação:

```json
{
  "buildingId": "uuid",
  "categoryId": "uuid",
  "specialtyId": "uuid",
  "environmentId": "uuid",
  "causeId": "uuid",
  "title": "Vazamento no 3º pavimento",
  "description": "Vazamento contínuo próximo à prumada.",
  "locationDetail": "Banheiro masculino",
  "priority": "HIGH",
  "origin": "USER_REQUEST",
  "supplierId": "uuid",
  "contractIds": ["uuid"],
  "estimatedCost": 2500
}
```

Transição:

```json
{
  "toStatus": "IN_PROGRESS",
  "note": "Equipe mobilizada e acesso liberado."
}
```

Ao transicionar para `COMPLETED`, o corpo também exige `solution`. `CLOSED` e a volta para `IN_PROGRESS` não são aceitos pela rota genérica; use os fluxos dedicados:

```json
{
  "solution": "Registro substituído e instalação testada.",
  "toStatus": "COMPLETED"
}
```

```json
{
  "finalCost": 1850.50,
  "measurementEligible": true,
  "acceptanceNote": "Serviço conferido em vistoria."
}
```

O aceitante é sempre o usuário autenticado; a API não aceita identidade delegada no payload.
Fechamento e reabertura exigem papel gerencial/fiscal. Quando `measurementEligible=true`, o
contrato principal deve abranger a edificação, estar `ACTIVE`/`EXPIRING` e vigente; o custo final
deve estar aprovado e a OS não pode integrar medição não rejeitada. Reabrir OS já medida exige
primeiro um fluxo financeiro formal de estorno.

```json
{
  "reason": "A falha reapareceu após a vistoria e exige nova intervenção."
}
```

Pendência:

```json
{
  "reason": "Aguardando peça de reposição.",
  "dueAt": "2026-08-10T18:00:00.000Z"
}
```

Upload multipart:

- campo `kind`: valor de `AttachmentKind`;
- campo `file`: arquivo único.

### 6.1 Catálogos, checklist e SLA

| Método | Rota | Finalidade |
|---|---|---|
| GET/POST | `/operations/catalogs` | lista/cria itens operacionais |
| PATCH/DELETE | `/operations/catalogs/:id` | altera/desativa item |
| GET/PUT | `/operations/catalogs/:categoryId/checklist-template` | consulta/substitui template ativo |
| GET/POST | `/operations/sla/calendars` | lista/cria calendários |
| PATCH | `/operations/sla/calendars/:id` | altera dias, janela e turnos |
| POST | `/operations/sla/calendars/:id/holidays` | adiciona feriado |
| DELETE | `/operations/sla/calendars/:id/holidays/:holidayId` | desativa feriado |
| GET/POST | `/operations/sla/policies` | lista/cria políticas; acesso de configuração |
| PATCH | `/operations/sla/policies/:id` | altera/desativa política |
| POST | `/operations/sla/calculate` | simula a política e os prazos aplicáveis |

A precedência de SLA é contrato+categoria, contrato, categoria e tenant. Cada prioridade mantém
um fallback global ativo. A OS persiste política, prazos, instante do aviso e snapshot completo;
mudanças posteriores não recalculam retroativamente registros existentes. Reabertura inicia novo
ciclo de SLA e preserva integralmente o ciclo anterior.

### 6.2 Notificações

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/notifications` | lista a caixa interna paginada |
| GET | `/notifications/unread-count` | total não lido |
| PATCH | `/notifications/:id/read` | marca uma como lida |
| PATCH | `/notifications/read-all` | marca todas como lidas |
| GET/PATCH | `/notifications/preferences` | consulta/atualiza canais por evento |
| GET | `/notifications/outbox/metrics` | saúde tenant-scoped para owner/admin |

Eventos de domínio são gravados na `NotificationOutbox` dentro da mesma transação da OS. O worker entrega caixa interna/e-mail, respeita preferências e aplica deduplicação e retry exponencial. A autorização é reavaliada na entrega e na leitura: após rebaixamento para `REQUESTER`, listagem, contagem e marcação ficam limitadas às notificações vinculadas às próprias OS, e alertas contratuais deixam de ser visíveis. Se o provedor de e-mail não estiver configurado, uma entrega interna bem-sucedida conclui o evento com anotação do canal indisponível; o evento falha quando nenhum canal habilitado puder entregar.

## 7. Dashboard e relatórios

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/dashboard/overview` | mapa, backlog, contratos e satisfação |
| GET | `/reports/work-orders/backlog.pdf` | backlog filtrado em PDF |
| GET | `/reports/work-orders/backlog.csv` | o mesmo backlog filtrado em CSV |
| GET | `/reports/work-orders/:id.pdf` | ficha individual da OS |
| GET | `/reports/contracts/expiring.pdf` | contratos a vencer em PDF |
| GET | `/reports/contracts/expiring.csv` | os mesmos contratos a vencer em CSV |
| GET | `/reports/contracts/:id/mirror.pdf` | espelho cadastral e financeiro do contrato |
| GET | `/reports/contracts/:id/financial.csv` | medições, empenhos e saldos do contrato |

O backlog aceita os filtros da listagem de OS e também `assignedToUserId`, `categoryId`,
`contractId`, `ageMinDays` e `ageMaxDays`. Todas as consultas derivam o `tenantId` do token;
PDF e CSV compartilham o mesmo dataset, ordenação e hash SHA-256. A exportação síncrona
é limitada aos 5.000 registros mais antigos e informa quando houver truncamento.

## 8. Billing

## 7.1 Núcleo gerencial v0.9

| Método | Rota | Finalidade |
|---|---|---|
| GET/POST | `/finance/commitments` | lista/emite empenhos |
| POST | `/finance/commitments/:id/movements` | reforça ou anula saldo |
| GET/POST | `/finance/measurements` | lista/cria medições de OS elegíveis |
| GET | `/finance/measurements/:id` | rastreia boletim, itens e movimentos |
| POST | `/finance/measurements/:id/transitions` | submete, revisa, aprova, liquida e paga |
| GET/POST | `/budgets/sinapi/catalogs` | lista/importa base versionada |
| GET | `/budgets/sinapi/catalogs/:id/items` | pesquisa itens da base |
| GET/PUT | `/budgets/work-orders/:workOrderId` | consulta/salva orçamento da OS |
| POST | `/budgets/:id/transitions` | submete, aprova, rejeita ou cancela |
| GET/POST/PATCH | `/maintenance/assets` | inventário de ativos |
| GET/POST/PATCH | `/maintenance/plans` | agenda preventiva |
| POST | `/maintenance/generate` | gera OS idempotentes no horizonte |
| GET | `/kpis/definitions` | catálogo de fórmulas versionadas |
| POST | `/kpis/calculate` | calcula/recalcula um período e escopo |
| GET | `/kpis/executive` | cards gerenciais e variação |
| GET | `/kpis/:code/trend` | série histórica |
| GET | `/kpis/exports/executive.pdf` | caderno gerencial PDF |
| GET | `/kpis/exports/executive.csv` | base gerencial CSV |

Todas as rotas usam o `tenantId` do token. Transições financeiras recebem a versão lida pelo
cliente e retornam conflito em gravação concorrente. Totais monetários são recalculados no
servidor com `Decimal`; rejeições e cancelamentos exigem justificativa.

### 7.2 Extensões operacionais v0.12

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/budgets/work-orders/:workOrderId/stages` | consulta os três estágios e revisões |
| GET/PUT | `/budgets/work-orders/:workOrderId?stage=...` | consulta/salva um estágio |
| POST | `/finance/measurements/consolidate-final-budgets` | consolida finais aprovados da competência |
| GET | `/maintenance/intelligent/systems` | lista sistemas e versão do motor |
| POST | `/maintenance/intelligent/preview` | calcula recomendações sem persistir |
| POST | `/maintenance/intelligent/create` | confirma planos e gera OS opcionalmente |

`Contract` aceita `adjustmentBaseDate` e `adjustmentIndex`. A prévia inteligente sempre declara
validação humana obrigatória e não reproduz texto normativo.

### 7.3 Gestão contratual por desempenho v0.13

| Método | Rota | Finalidade |
|---|---|---|
| GET/POST | `/kpis/definitions` | consulta a biblioteca ou cria KPI personalizado |
| PATCH | `/kpis/definitions/:id` | versiona definição personalizada ou ativa/desativa item |
| POST | `/kpis/definitions/defaults` | sincroniza a biblioteca `PERFORMANCE_BR_2026.1` |
| GET/POST | `/kpis/contracts/:contractId/configurations` | lista/vincula KPIs, pesos e faixas ao contrato |
| PATCH | `/kpis/contract-configurations/:id` | altera configuração contratual preservando histórico |
| POST | `/kpis/data-points` | registra leitura auditável para fontes externas/manuais |
| POST | `/kpis/contracts/:contractId/calculate` | calcula competência, escores, IGD, alertas e ajustes |
| GET | `/kpis/contracts/:contractId/dashboard` | dashboard executivo reconciliado da competência |
| GET | `/kpis/analysis` | rankings de contratos, fornecedores e edificações |
| GET | `/kpis/alerts` | alertas tenant-scoped por severidade e contrato |

O cálculo usa somente dados do tenant autenticado. Ao criar uma medição em contrato configurado,
a API calcula automaticamente a competência e aplica glosas/bonificações enquanto o boletim está
em rascunho. Indicadores sem fonte nativa ficam sem medição até receberem `KpiDataPoint`; ausência
de dados não é interpretada como desempenho zero.

### 7.4 Governança operacional v0.14

| Método | Rota | Finalidade |
|---|---|---|
| PATCH/DELETE | `/suppliers/:id` | edita ou arquiva fornecedor e vínculos de especialidades |
| PATCH/DELETE | `/contracts/:id` | edita ou encerra/arquiva contrato preservando o dossiê |
| DELETE | `/work-orders/:id` | cancela e arquiva a OS com histórico e auditoria |
| PATCH/DELETE | `/finance/commitments/:id` | edita empenho ainda não movimentado ou o anula logicamente |
| PATCH/DELETE | `/finance/measurements/:id` | edita ou cancela medição antes da aprovação/liquidação |
| DELETE | `/maintenance/assets/:id` | baixa ativo e suspende planos relacionados |
| DELETE | `/maintenance/plans/:id` | arquiva plano preventivo |
| POST | `/members` | cria usuário ativo diretamente na organização |
| POST | `/members/:membershipId/password` | redefine senha e revoga sessões ativas |

As exclusões são lógicas e tenant-aware. Fatos financeiros já liquidados ou pagos dependem de
estorno; auditoria, histórico e movimentos não são destruídos.


| Método | Rota | Finalidade |
|---|---|---|
| POST | `/billing/checkout` | cria sessão de contratação |
| POST | `/billing/portal` | abre portal do cliente |
| POST | `/billing/webhooks/stripe` | recebe eventos Stripe assinados |

O endpoint de webhook usa corpo bruto e não exige sessão de usuário, mas exige assinatura Stripe válida.

## 8.1 Piloto operacional e homologação

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/pilot/overview` | consolida critérios automáticos, decisões e aceite do tenant |
| POST | `/pilot/scenarios/:code/decision` | registra parecer append-only e referência de evidência |
| POST | `/pilot/acceptance` | aprova ou rejeita formalmente o piloto |
| GET | `/pilot/exports/homologation.csv` | exporta a matriz conciliada em CSV |
| GET | `/pilot/exports/homologation.pdf` | exporta o relatório formal em PDF |

A consulta e as exportações admitem perfis gerenciais, contratuais, de fiscalização e auditoria.
Somente `OWNER`, `ADMIN` e `MANAGER` registram decisões. `APPROVED` é recusado enquanto qualquer
checagem automática estiver pendente ou qualquer cenário não tiver decisão `PASSED`. Todos os
dados e agregações são derivados do `tenantId` autenticado.

## 9. Versionamento

Mudanças aditivas permanecem em `/api/v1`. Alterações incompatíveis exigem:

- novo prefixo de versão;
- período de convivência;
- changelog;
- migração do frontend e consumidores;
- teste de contrato.

## 10. Endpoints necessários para completar o MVP

- transferência formal de propriedade da organização;
- anexos genéricos;
- catálogo de relatórios e exportações;
- consulta de entitlement/limites de plano.
