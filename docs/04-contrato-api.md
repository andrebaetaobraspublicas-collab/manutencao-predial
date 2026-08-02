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

| Método | Rota | Finalidade |
|---|---|---|
| POST | `/billing/checkout` | cria sessão de contratação |
| POST | `/billing/portal` | abre portal do cliente |
| POST | `/billing/webhooks/stripe` | recebe eventos Stripe assinados |

O endpoint de webhook usa corpo bruto e não exige sessão de usuário, mas exige assinatura Stripe válida.

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
