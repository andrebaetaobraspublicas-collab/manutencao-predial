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

## 7. Dashboard e relatórios

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/dashboard/overview` | mapa, backlog, contratos e satisfação |
| GET | `/reports/work-orders/backlog.pdf` | PDF inicial do backlog |

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

- usuários, convites e acessos provisórios;
- recuperação de senha e verificação de e-mail;
- geocodificação confirmada;
- comentários/checklists da OS;
- catálogo e configuração de SLA;
- notificações;
- anexos genéricos;
- catálogo de relatórios e exportações;
- consulta de entitlement/limites de plano.
