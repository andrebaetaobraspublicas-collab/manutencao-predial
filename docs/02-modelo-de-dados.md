# Modelo e dicionário de dados

## 1. Convenções

- Chaves primárias: UUID armazenado como `CHAR(36)` no início.
- Datas: UTC no banco; apresentação no fuso do tenant.
- Valores: `DECIMAL`, nunca ponto flutuante.
- Exclusão lógica: `deletedAt` nas entidades principais.
- Segregação: entidades de negócio contêm `tenantId` quando precisam de consulta ou validação direta por tenant.
- Nomes no banco permanecem em inglês para consistência técnica; interface e documentação funcional ficam em português.

## 2. Núcleo SaaS

```mermaid
erDiagram
  TENANT ||--o{ TENANT_MEMBERSHIP : possui
  USER ||--o{ TENANT_MEMBERSHIP : participa
  TENANT_MEMBERSHIP ||--o{ REFRESH_SESSION : autentica
  TENANT_MEMBERSHIP ||--o| TENANT_INVITATION : recebe
  USER ||--o{ ACCOUNT_TOKEN : valida
  TENANT ||--o{ TENANT_SUBSCRIPTION : contrata
  SAAS_PLAN ||--o{ TENANT_SUBSCRIPTION : define
  TENANT ||--o{ AUDIT_LOG : registra
  USER o|--o{ AUDIT_LOG : pratica
  TENANT ||--o{ TENANT_SEQUENCE : numera

  TENANT {
    char36 id PK
    varchar slug UK
    enum status
    datetime trialEndsAt
    varchar stripeCustomerId
  }
  USER {
    char36 id PK
    varchar email UK
    varchar passwordHash
    enum status
  }
  TENANT_MEMBERSHIP {
    char36 id PK
    char36 tenantId FK
    char36 userId FK
    enum role
    datetime expiresAt
    int sessionVersion
  }
  TENANT_INVITATION {
    char36 id PK
    char36 tenantId FK
    char36 membershipId FK
    char64 tokenHash UK
    datetime expiresAt
    datetime acceptedAt
    datetime revokedAt
  }
  ACCOUNT_TOKEN {
    char36 id PK
    char36 userId FK
    enum purpose
    char64 tokenHash UK
    datetime expiresAt
    datetime consumedAt
  }
  TENANT_SUBSCRIPTION {
    char36 id PK
    char36 tenantId FK
    char36 planId FK
    enum status
    datetime currentPeriodEnd
  }
```

## 3. Núcleo operacional da OS

```mermaid
erDiagram
  TENANT ||--o{ WORK_ORDER : possui
  BUILDING ||--o{ WORK_ORDER : recebe
  USER ||--o{ WORK_ORDER : solicita
  USER ||--o{ WORK_ORDER : executa
  SUPPLIER o|--o{ WORK_ORDER : atende
  WORK_ORDER ||--o{ WORK_ORDER_CONTRACT : vincula
  CONTRACT ||--o{ WORK_ORDER_CONTRACT : abrange
  WORK_ORDER ||--o{ WORK_ORDER_PENDENCY : bloqueia
  WORK_ORDER ||--o{ WORK_ORDER_ATTACHMENT : evidencia
  WORK_ORDER ||--o{ WORK_ORDER_STATUS_HISTORY : historiza
  WORK_ORDER ||--o| WORK_ORDER_BUDGET : orca
  WORK_ORDER ||--o| SATISFACTION_RESPONSE : avalia
  WORK_ORDER ||--o{ MEASUREMENT_ITEM : mede
  OPERATIONAL_CATALOG_ITEM o|--o{ WORK_ORDER : classifica
  SLA_POLICY o|--o{ WORK_ORDER : rege
  WORK_ORDER ||--o{ WORK_ORDER_COMMENT : comenta
  WORK_ORDER ||--o{ WORK_ORDER_CHECKLIST_ITEM : verifica
  WORK_ORDER_CHECKLIST_ITEM ||--o{ WORK_ORDER_CHECKLIST_RESPONSE : historiza
  WORK_ORDER ||--o{ WORK_ORDER_REOPENING : reabre

  WORK_ORDER {
    char36 id PK
    char36 tenantId FK
    varchar number UK
    char36 buildingId FK
    char36 requesterUserId FK
    char36 supplierId FK
    enum status
    enum priority
    bool hasOpenPendency
    datetime openedAt
    datetime slaResolutionDeadline
    decimal finalCost
    text solution
    bool measurementEligible
    int reopenCount
    json slaSnapshot
    json operationalCriteriaSnapshot
  }
  WORK_ORDER_PENDENCY {
    char36 id PK
    char36 tenantId FK
    char36 workOrderId FK
    enum status
    text reason
    datetime dueAt
    text resolution
  }
  WORK_ORDER_ATTACHMENT {
    char36 id PK
    char36 tenantId FK
    char36 workOrderId FK
    enum kind
    varchar storageKey UK
    bigint sizeBytes
    char64 sha256
  }
```

### 3.1 Extensões operacionais da v0.7

- `OperationalCatalogItem` mantém categorias, especialidades, ambientes e causas por tenant. Categorias carregam prioridade e critérios de evidência, checklist, custo e aceite.
- `ChecklistTemplateItem` define o modelo ativo; `WorkOrderChecklistItem` é o snapshot da OS e `WorkOrderChecklistResponse` é append-only, preservando todas as respostas.
- `SlaCalendar`, `SlaHoliday` e `SlaPolicy` modelam tempo corrido/útil, feriados, múltiplos turnos e precedência tenant/contrato/categoria.
- A OS armazena `slaSnapshot` e `operationalCriteriaSnapshot`, evitando que alterações futuras de configuração mudem seu histórico.
- `WorkOrderComment` e `WorkOrderCommentMention` registram comunicação cronológica sem rotas de edição/exclusão.
- `WorkOrderReopening` preserva motivo, estado, aceite, custos, avaliação e o ciclo completo de SLA do fechamento anterior, além do indicador de reabertura em 30 dias. A avaliação corrente é removida atomicamente na reabertura para que o novo ciclo não reutilize a nota anterior.
- `NotificationPreference`, `Notification` e `NotificationOutbox` implementam preferências, caixa interna e entrega transacional com retry.
- `GeocodingCache` isola por tenant as consultas normalizadas, candidatos e expiração do cache.

## 4. Contratos e financeiro

```mermaid
erDiagram
  TENANT ||--o{ SUPPLIER : cadastra
  SUPPLIER ||--o{ CONTRACT : firma
  CONTRACT ||--o{ CONTRACT_BUILDING : abrange
  BUILDING ||--o{ CONTRACT_BUILDING : integra
  CONTRACT ||--o{ CONTRACT_AMENDMENT : altera
  CONTRACT ||--o{ CONTRACT_ADJUSTMENT : reajusta
  CONTRACT ||--o{ CONTRACT_SUBCONTRACT : subcontrata
  CONTRACT ||--o{ CONTRACT_PENALTY : sanciona
  SUPPLIER ||--o{ CONTRACT_PENALTY : recebe
  CONTRACT ||--o{ COMMITMENT : empenha
  COMMITMENT ||--o{ COMMITMENT_MOVEMENT : movimenta
  CONTRACT ||--o{ MEASUREMENT : mede
  MEASUREMENT ||--o{ MEASUREMENT_ITEM : consolida

  CONTRACT {
    char36 id PK
    char36 tenantId FK
    char36 supplierId FK
    varchar code UK
    enum type
    enum status
    datetime startDate
    datetime endDate
    decimal originalValue
    decimal currentValue
    decimal measuredValue
    decimal paidValue
  }
  COMMITMENT {
    char36 id PK
    char36 tenantId FK
    char36 contractId FK
    varchar number
    int fiscalYear
    decimal originalValue
  }
  MEASUREMENT {
    char36 id PK
    char36 tenantId FK
    char36 contractId FK
    varchar referenceMonth
    enum status
    decimal grossAmount
    decimal netAmount
  }
```

## 5. Manutenção planejada e indicadores

```mermaid
erDiagram
  BUILDING ||--o{ ASSET : contém
  BUILDING ||--o{ MAINTENANCE_PLAN : planeja
  ASSET o|--o{ MAINTENANCE_PLAN : recebe
  CONTRACT o|--o{ MAINTENANCE_PLAN : executa
  TENANT ||--o{ KPI_DEFINITION : define
  KPI_DEFINITION ||--o{ KPI_MEASUREMENT : mede
  BUILDING o|--o{ KPI_MEASUREMENT : dimensiona
  CONTRACT o|--o{ KPI_MEASUREMENT : dimensiona
  SUPPLIER o|--o{ KPI_MEASUREMENT : dimensiona

  MAINTENANCE_PLAN {
    char36 id PK
    char36 tenantId FK
    char36 buildingId FK
    enum type
    enum frequencyUnit
    int frequencyValue
    datetime nextDueAt
    json checklistTemplate
  }
  KPI_DEFINITION {
    char36 id PK
    char36 tenantId FK
    varchar code UK
    enum category
    varchar unit
    enum direction
    text formula
  }
  KPI_MEASUREMENT {
    char36 id PK
    char36 definitionId FK
    datetime periodStart
    datetime periodEnd
    decimal value
    json details
  }
```

## 6. Dicionário das entidades centrais

### 5.1 Extensões gerenciais da v0.9

- `Measurement` usa versão otimista e workflow até pagamento; `MeasurementItem` congela a OS,
  valor bruto, dedução e líquido no tenant autenticado.
- `CommitmentMovement` é o razão append-only de emissão, reforço, anulação, liquidação e
  pagamento. Liquidações/pagamentos podem apontar para a medição que os originou.
- `SinapiCatalog` e `SinapiCatalogItem` preservam competência, UF, versão e hash. O item de
  orçamento congela quantidade/custo e `BudgetRevision` guarda cada decisão.
- `MaintenancePlanGeneration` reserva de forma única o par plano/data antes de criar a OS e
  registra geração, skip ou falha.
- `KpiMeasurement.calculationKey` identifica tenant, escopo, período e versão da fórmula,
  tornando o recálculo idempotente.


| Entidade | Responsabilidade | Invariantes principais |
|---|---|---|
| Tenant | organização cliente | slug único; status controla entitlement |
| TenantMembership | papel do usuário no tenant | um vínculo por usuário/tenant; acesso provisório respeita expiração |
| TenantInvitation | convite de entrada na organização | token armazenado somente em hash; uso único; validade de 72 horas; pertence ao tenant e ao vínculo |
| AccountToken | redefinição de senha e verificação de e-mail | token em hash, finalidade explícita, uso único e expiração; nunca armazenar o valor bruto |
| Building | imóvel gerenciado | código único no tenant; coordenadas devem formar par válido |
| Supplier | fornecedor | documento fiscal único no tenant |
| Contract | instrumento contratual | código único; data final posterior à inicial; fornecedor do mesmo tenant |
| WorkOrder | unidade operacional | número único; imóvel e demandante obrigatórios; status segue máquina de estados |
| WorkOrderContract | relação N:N OS–contrato | no máximo um contrato principal por OS, regra a reforçar na aplicação |
| WorkOrderPendency | bloqueio explicitado | motivo obrigatório; resolução registrada; fechamento exige ausência de pendência aberta |
| WorkOrderAttachment | evidência privada | MIME permitido, hash, tamanho e chave privada |
| WorkOrderBudget | orçamento da OS | um orçamento por OS; totais recalculados no servidor |
| Measurement | medição mensal contratual | OS não deve ser paga duas vezes na mesma medição; fechamento por workflow |
| Commitment | empenho | número único por tenant e exercício; saldo deriva dos movimentos |
| MaintenancePlan | regra recorrente | próxima data e periodicidade válidas; geração idempotente |
| KpiDefinition | definição auditável | fórmula, unidade, direção e meta explícitas |

## 7. Índices críticos do backlog

A tabela `WorkOrder` possui índices compostos para:

- tenant + status + abertura;
- tenant + edificação + status + abertura;
- tenant + fornecedor + status + abertura;
- tenant + demandante + status + abertura;
- tenant + pendência aberta + status;
- tenant + prazo SLA + status;
- tenant + prioridade + status.

Antes de criar novos índices, analisar consultas reais com `EXPLAIN` e métricas de produção.

## 7.1 Registros de homologação do GP-044

O piloto não cria uma estrutura operacional paralela. Cada decisão de cenário usa `AuditLog` com
`entityType = PilotHomologation` e o código do cenário em `entityId`; o aceite final usa
`entityType = PilotAcceptance`. Novas decisões são acrescentadas, nunca sobrescritas, e a leitura
considera o registro mais recente do tenant. Exportações também geram auditoria com ator e data.

Como o GP-044 apenas consolida entidades já existentes e usa a trilha append-only, a v0.10.0 não
exige migration nem seed adicional.

## 8. Evoluções previstas do schema

- comentários e menções na OS;
- checklist executado e respostas estruturadas;
- catálogo de categorias, especialidades e causas de falha;
- arquivo genérico para contratos, fornecedores e medições;
- workflow de aprovação;
- notificações e preferências;
- jobs de geração de plano preventivo e relatório;
- documentos de terceirizados com criptografia e retenção reforçadas;
- tabela de baseline de energia/água e leituras por imóvel;
- outbox transacional para eventos externos quando e-mail/webhooks exigirem robustez.
