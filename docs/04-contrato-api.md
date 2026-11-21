# Contrato inicial da API

## Gestão Contratual — correções e preços publicados em 21/11/2026

Extensões já publicadas em desenvolvimento e produção, sincronizadas conforme [registro 54](54-sincronizacao-gestao-producao-20261121.md). Sem mudança de schema ou dos endpoints dos orçamentadores.

`POST /api/v1/contract-management/contracts` aceita opcionalmente `contractedPrices:[{itemId,price}]`, além de `referencePrices`. Quando fornecida, a lista deve identificar todos os itens, sem duplicação e com valores válidos não negativos. A ausência conserva compatibilidade com clientes anteriores. A fotografia de origem permanece preservada. Desconto linear é aplicado pela interface aos preços enviados, sem novo endpoint.

As operações existentes `/contracts/:id/preview` e `/contracts/:id/actions` aceitam os tipos `revise-measurement`, `revise-record` e `delete-record`, com versão esperada e os controles de confirmação/idempotência já existentes. O payload identifica `measurementId` ou `recordId`, informa `revisionReason` e, para retificação, `replacement`. São exclusivas do proprietário, respeitam tenant e acrescentam ações ao diário. Não apagam registros anteriores nem pagamentos. Aprovação pelo próprio autor é permitida quando ele é proprietário; papéis dos demais usuários permanecem preservados. Consulte o registro 53 e o manual para efeitos sobre lançamentos vinculados.

## Conferência do novo usuário da Gestão Contratual — desenvolvimento, 14/11/2026

`POST /auth/password/change` continua sendo a operação compartilhada de troca autenticada. A interface `Minha conta` da Gestão Contratual a utiliza, confirma a senha e o encerramento das sessões e mantém o retorno em `/login?next=/gestao-contratual`. O servidor invalida também tokens de recuperação anteriores na mesma transação da senha/sessões e rejeita senhas que excedam 72 bytes UTF-8, evitando truncamento pelo bcrypt.

Quando existe perfil `GcSaasUser` no tenant autenticado, o resultado aparece em `GcSaasAudit` como `account.password.changed` ou `account.password.failed`. Somente status e efeito sobre sessões são gravados; corpos, senhas e cookies não são lidos pela auditoria. A ausência de perfil não registra identidades de outros produtos. `activity/navigation` aceita a seção `account`. Nenhuma nova permissão para contratos ou administração é concedida por essa tela, que permanece acessível sem licença contratual ativa.

## Gestão Contratual V3 — planilhas integrais e prévias

`GET /contract-management/contracts/:id/metadata-preview` requer papel de gestor e retorna `{requestId,expectedVersion,kind:'metadata-enrichment',payload,previewHash,checkedSourceItems,unresolved,changes,ready}` sem gravar. Confere a fotografia privada pelo tenant/proprietário e resolve descrição/unidade faltantes na referência SINAPI capturada. O gestor confirma por `POST /contracts/:id/actions` com os mesmos `requestId`, `expectedVersion`, `kind`, `payload` e `previewHash`. A confirmação recalcula no servidor todos os descritores, rejeita payload divergente ou pendência e registra uma única ação auditada/idempotente. Não aceita preço ou quantidade cadastral enviado pelo cliente. `metadata-enrichment` também pode usar a prévia genérica; não converte unidades nem altera qualquer valor financeiro.

Planilhas atuais e históricas retornam rótulos legíveis com `descriptionAtSnapshot`, `unitAtSnapshot` e `metadataProvenance:{actionId,contractVersion,sourceHash,referenceId,definitionVersionId,resourceType,code,descriptionSource,unitSource}` quando houver enriquecimento posterior. A versão histórica, as quantidades, os preços, os totais e a memória original do movimento permanecem preservados. Exportadores devem explicitar a anotação cadastral nas evidências, inclusive quando a versão da anotação for posterior à aprovação do boletim.

Extensão aditiva destinada ao desenvolvimento, após migration independente `004_contract_scenarios.sql`. Mantém identidade, licença do proprietário do contrato, papéis, origem confiável, tenant e versão. Não altera os endpoints dos orçamentadores nem modifica a origem capturada.

| Método | Rota após `/api/v1/contract-management` | Contrato |
|---|---|---|
| GET | `/contracts/:id/worksheet?date=YYYY-MM-DD` | Todas as linhas com EAP/grupos, quantidades da data, preços vigentes, paradigma, desconto comparável e saldos. Data opcional. |
| GET | `/contracts/:id/worksheet?measurementId=UUID` | Replay até aprovação, ou criação do rascunho, com todas as linhas e memória de anterior/período/acumulado/saldo. |
| GET | `/contracts/:id/worksheet?amendmentId=UUID` | Planilha após o termo, `before` integral anterior e memória `amendment`. Não incorpora movimentos posteriores. |
| POST | `/contracts/:id/preview` | Corpo `{expectedVersion,kind,payload,requestId?}`. Calcula sem persistir e retorna ID, hashes, resultado, antes/depois, detalhe e planilha. |
| POST | `/contracts/:id/actions` | Acrescenta `price-batch` e `previewHash?`; confirmação usa o mesmo ID, versão e payload da prévia. |

Os cortes `date`, `measurementId` e `amendmentId` são mutuamente exclusivos. Resposta histórica tem `historical:true` e a versão efetivamente reconstruída. Medições unitárias retornam `rows` com todos os itens, `contractQuantity`, `previousQuantity`, `presentedQuantity`, `periodQuantity`, `accumulatedQuantity`, `remainingQuantity`, `unitPrice`, `previousAmount`, `periodAmount`/`amount` e `accumulatedAmount`. Valores anteriores são os valores históricos aprovados, sem reprecificação. Eventos globais têm `isAggregate` e `coveredByParent`; totais vêm do boletim, nunca da soma indiscriminada de pais e filhos.

Prévia aceita `measurement`, `difference-measurement`, `amendment`, `price-rule` e `price-batch`. Sua resposta contém `{requestId,expectedVersion,kind,payloadHash,previewHash,before:{summary},after:{summary},result,detail,worksheet}`. Para boletim, acrescenta `approvalPreview`, explicitamente hipotética e dependente de aprovação: estima glosa, centavos e compensação com o motor real, sem aceitar execução, reservar valores ou gravar ações. Alteração de versão ou payload invalida a confirmação. O hash é vinculado ao ator e ao contrato; não substitui autorização nem recalculação financeira.

`price-batch` recebe campos comuns `{title,reason,effectiveDate,mode,baseIndex?,currentIndex?,components?,formalReference?,retroactive?}` e `targets:[{targetType:'ITEM'|'EVENT',itemId?/eventId?,newPrice?,anchorRuleId?}]`. São permitidos até 1.000 alvos distintos. Falha em qualquer alvo rejeita o lote inteiro, sem regras parciais. Uma ação conserva auditoria e idempotência; regras derivadas usam IDs `actionId-índice`. Reequilíbrio exige referência formal. Medições e aditivos também aceitam até 1.000 linhas, com corpo limitado a 512 KiB.

`POST /contracts/demo` aceita `demoScenario:'BUILDING_ANALYTICAL_V3'`, `scenarioReason`, `proposalPrices` integrais e `referencePrices` opcionais. Mantém preços e totais originais da fonte como memória; a proposta é demonstrativa. Eventograma fornecido aceita `parentId`, valida ciclos, soma dos pais e total das folhas. O cenário cria uma captura independente e reutiliza o snapshot autorizado; não sobrescreve demonstrações anteriores.

## Gestão Contratual v2 — desenvolvimento, 14/11/2026

Prefixo `/api/v1/contract-management`, identidade JWT/cookie central, host de desenvolvimento e `GESTAO_ENABLED=true` obrigatórios. Produção responde404 mesmo com flag ativa. Banco próprio e arquivos privados independentes; tenant nunca é recebido do corpo. Mutações exigem Origin confiável. Administrador cadastrado por ID/e-mail é isento comercialmente; membros usam a licença do proprietário do contrato alvo. Licença compartilhada não permite criar contratos próprios.

- `GET /access`: enabled/admin/entitled/canCreate/databaseConfigured e limitações. Permite identidade sem assinatura consultar opções comerciais. `GET /sources` retorna fontes autorizadas ORCAPRO/INFRA; `GET /sources/:product/:id/preview` calcula versão/hash/itens/eventos sem alterar origem. `GET /capacity` informa estimativa MySQL.
- `GET /contracts`, `GET /contracts/:id`: contratos próprios/compartilhados autorizados, permissões, itens/eventos, resumo, planejamento, auditoria e exemplos calculados.
- `POST /contracts`: sourceProduct, sourceProjectId, expectedSourceVersion, sourceHash, name, regime UNIT_PRICE/GLOBAL_PRICE, referencePrices[{itemId,price}], baseDate, reason e eventDefinitions opcionais [{id,name,value,deadline?}]. Prazo é o dia da obra, inteiro entre 0 e 36.500; não é data ISO. Confere cobertura do paradigma, versão/hash, totais e eventograma. `POST /contracts/demo` captura demonstração explicitamente didática.
- `POST /contracts/:id/actions`: expectedVersion, requestId UUID, kind e payload. Tipos: amendment, price-rule, measurement, difference-measurement, approve-measurement, cancel-measurement, payment, refund, compensation-reconciliation e progress. Decimal em string, data ISO; conflito409, inconsistência400, objeto alheio/licença contratual insuficiente404. Lock/versionamento/idempotência e auditoria na mesma transação.
- `GET /members/candidates`: candidatos ativos, não excluídos e com vínculo vigente na organização. `GET/POST /contracts/:id/members`: gestor atribui userId/role MANAGER/FISCAL/READER/REVOKED; revogação preserva dados e histórico.
- `GET/POST /contracts/:id/attachments`: listar ou anexar multipart `file` PDF/XLSX/PNG/JPEG de até10MB; fiscal/gestor anexa. `GET /contracts/:id/attachments/:aid/download` sempre autoriza tenant/contrato, retorna attachment/no-store, nunca URL pública. `GET /contracts/:id/measurements/:mid/export?format=xlsx|pdf` exporta boletim com estado, valores, origem/hash e identificação de demonstração.
- `POST /imports/preview`: XLSX/PDF textual multipart, até10MB, 40abas/10.000linhas/50colunas úteis, PDF até1.000páginas. XLSX usa valores numéricos brutos, sem executar fórmulas. PDF escaneado requer OCR externo; relatórios de composições unitárias não são tratados como orçamento contratual e retornam supported:false/unsupportedReason.
- `POST /imports/:id/map`: sheet, headerRow base1, mapping de colunas base0 (code/description/unit/quantity/unitPrice/referencePrice), referenceOverrides[{row,price}] opcionais; referencePrice=-1 permite completar paradigma na tela. excludedRows base1 exigem exclusionReason. Códigos repetidos ficam distintos por linha/aba, nunca mesclados. Retorna rows/errors/warnings/hash/ready. `POST /imports/:id/confirm` recebe hash/name/regime/baseDate/reason/eventDefinitions; cria contrato real somente com prévia integralmente válida e preserva original como anexo.
- `POST /contracts/:id/imports/preview`: prévia de medição acessível a fiscal/gestor do contrato. `POST /imports/:id/measurement-map`: contractId, expectedVersion, sheet/headerRow, mapping{code,quantity}, itemMappings[{row,itemId}], exclusões justificadas. Quantidade corresponde ao período; códigos ambíguos exigem correspondência explícita. Arquivo idêntico à origem pode resolver por linha/aba/hash; valores nulos/zero são contados e ignorados. Global seleciona eventos integrais; não há pagamento por percentual de evento.
- `POST /imports/:id/measurement-confirm`: contractId/hash/expectedVersion/requestId/title/period/executionDate/evidence. Revalida mapa/versão; cria DRAFT, vincula arquivo original e audita em uma transação. Não toma preço do arquivo nem incorpora automaticamente acumulados anteriores: medições históricas devem ser importadas na sequência e aprovadas separadamente.

Medições reais exigem autor e aprovador distintos; demonstrações permitem treino pelo administrador. Aprovação global exige accepted:true explícito. Aditivos globais preservam eventos medidos e reconciliam os futuros; preços por índice/cesta/recomposição têm vigência/âncora e referência formal. Retroatividade gera boletim de diferenças, sem reescrever boletim aprovado. Novas recomposições exigem formalReference. Limites de aditivos e exceções ficam em memória explícita; o sistema não certifica regularidade jurídica automaticamente. Pagamentos parciais, liquidação sem desembolso, recuperação e restituição mantêm caixa separado de reservas. Planejamento compara previsto/executado/medido/pago com bases declaradas, sem inventar progresso ausente. Cobrança Stripe é exclusivamente teste; não há transferência bancária de pagamentos contratuais.

### Login e assinatura própria de teste

`POST /auth/gestao/login` recebe `{email,password}`, reutiliza a identidade central e cria a sessão autenticada do desenvolvimento. Não recebe tenant livre, não concede acesso por mero e-mail e não depende da licença OrçaPro para apresentar o painel de assinatura da Gestão Contratual. Exige host/flag de desenvolvimento, origem autorizada e limite de tentativas. O frontend oferece essa opção exclusivamente nos hosts DEV permitidos.

Os endpoints abaixo usam o prefixo `/api/v1/contract-management/billing`:

| Método e rota | Entrada / resposta | Regra |
|---|---|---|
| `GET /config` | `configured`, `testMode:true`, `adminExempt`, `canCheckout`, `canPortal`, `subscription` e `message` | Usuário autenticado pode consultar sem assinatura prévia. Ausência de configuração mantém botões de cobrança desabilitados. |
| `POST /checkout` | `{requestId:UUID}` → `{url}` | Sessão recorrente exclusivamente de teste, vinculada à identidade autenticada. Retorno do navegador não libera licença. |
| `POST /portal` | Corpo vazio → `{url}` | Portal da conta Stripe associada ao tenant/proprietário autenticados, nunca customer arbitrário enviado pelo cliente. |
| `POST /webhook` | Corpo bruto e cabeçalho `stripe-signature` | Exceção de autenticação por cookie: assinatura própria é obrigatória. Rejeita `livemode`, valida produto/conta, deduplica evento e atualiza estado no banco próprio. |

Há um produto/preço **fictício de R$ 1,00/mês em Stripe TEST**, para homologação do fluxo. Não é plano comercial e não gera cobrança real. A configuração utiliza `GESTAO_STRIPE_MODE=test`, chave de teste, `GESTAO_STRIPE_PRICE_ID` e segredo próprio de webhook; configuração de portal é opcional. Nenhuma credencial é retornada pela API. `GcBillingAccount` e `GcBillingEvent` mantêm conta/assinatura e recibos de eventos independentes dos outros produtos.

`enabled` indica disponibilidade técnica do módulo; `entitled` indica licença aplicável à sessão; `canCreate` exige licença própria ou isenção administrativa. Licença do proprietário de contrato compartilhado permite somente as operações autorizadas naquele contrato. O administrador isento continua sujeito ao isolamento de tenant e contrato. Os redirects do frontend aceitam somente HTTPS nos hosts exatos do Checkout/portal Stripe.

### Payloads financeiros e revisão de estado

Todos os exemplos de chaves abaixo fazem parte de `payload` em `POST /contracts/:id/actions`; o envelope externo exige `expectedVersion` e `requestId` UUID. Valores financeiros, quantidades e índices usam strings decimais. Datas de efeitos/execução são `YYYY-MM-DD`; prazos de eventos são inteiros em dias. A versão e as regras são verificadas novamente na transação.

| `kind` | Campos e comportamento |
|---|---|
| `amendment` | `title,effectiveDate,reason,lines`. Item existente usa `{itemId,quantityDelta}`; serviço novo usa `{description,unit,quantity,unitPrice,referencePrice}`. Global acrescenta `formalReference,eventChanges` com evento existente/novo, valor, prazo, pai ou supressão; total das folhas deve reconciliar com o escopo. |
| `price-rule` | `title,effectiveDate,reason,targetType,itemId/eventId,mode`. `INDEX`: base/currentIndex; `BASKET`: components com weight/baseIndex/currentIndex, até 12 componentes; `REEQUILIBRIUM`: newPrice e formalReference. Reajuste posterior a reequilíbrio exige anchorRuleId explícito e formalReference. Alvo global deve ser evento-folha. |
| `measurement` | `title,period,executionDate,evidence`; unitário: lines com itemId/quantity/presentedQuantity; global: eventIds. Cria DRAFT, sem movimentar pagamento. Quantidade aprovada e apresentada são distintas para explicitar glosa. |
| `difference-measurement` | `title,period,executionDate,reason,originalMeasurementIds`. Calcula diferenças de preço nas datas de execução originais, descontando diferenças já aprovadas; não consome novas quantidades. |
| `approve-measurement` | measurementId; medição global ordinária exige accepted:true. Contrato real veda aprovação pelo autor do rascunho. Preço/evento alterado depois do rascunho exige reconferência e novo boletim. |
| `cancel-measurement` | measurementId,reason; apenas rascunhos, preservando histórico. |
| `payment` | measurementId,amount,date,reference. Pagamento parcial é limitado ao saldo efetivo; recuperação de diferença negativa exige direction:RECOVERY e amount positivo informado. Líquido zero exige amount:"0" e noCashSettlement:true. Não executa transferência bancária. |
| `refund` | amount,date,reason; limitada ao excesso efetivamente retido, não à reserva ainda não paga. |
| `compensation-reconciliation` | reason,formalReference e mode. REALLOCATE recebe allocations[{measurementId,deduction}], sendo deduction o total pretendido, preservando já pago/retido. RECOVERY recebe amount,date,reference e registra recuperação efetivada. |
| `progress` | date,plannedPercent,executedPercent,reason; avanço informado independentemente de medição e pagamento. |

Aditivos recebem `additionLimitPercent` (25/50), `renovationJustification` quando aplicável e `limitExceptionReason`/`formalReference` para exceções. Acréscimos e supressões são cumulativos e separados. Em global com preços atualizados, `limitsMemory` informa originalUpdatedValue/additionsUpdatedValue/suppressionsUpdatedValue/referenceDate/justification/documentReference. `compensationResolution:MANUAL_RECONCILIATION` admite pendência expressa quando o saldo futuro não comporta a compensação. A aceitação do registro não certifica enquadramento jurídico.

Regras com impacto em boletins aprovados exigem `retroactive:true` e referência formal. O detalhe conserva bruto/dedução/líquido originais e disponibiliza `effectiveDeduction`/`effectiveNet` após conciliações. O frontend e as exportações mostram valores efetivos, mantendo memória original consultável. `summary.currentValue` permanece na data-base; `currentPricedValue`, `priceAdjustmentValue` e `priceReferenceDate` apresentam valorização na última referência registrada, sem se confundirem com saldo a pagar. `planningComparison` declara a base e distingue execução informada, medição e caixa.

### Estado de entrega documentado

A v2 foi implementada para desenvolvimento e suas migrations foram aplicadas antes da ativação. Este contrato documenta interfaces e invariantes; não declara concluídas as verificações remotas dessa versão. A [ADR 0010](adr/0010-gestao-contratual-banco-independente.md) conserva a entrega histórica da v1, identifica as limitações superadas e separa testes locais de homologação operacional.

## Exportação TransfereGov BM / PLE — DEV

`POST /orcapro/projects/:id/transferegov/bm/receipt` e `POST /infraestrutura/projects/:id/transferegov/bm/receipt`: guard/CSRF do produto, proprietário e tenant autenticados. Recebem expectedVersion, sourceHash/fileHash/configHash SHA-256, profile documentation|example, services/groups/fronts, submeta e totais em centavos textuais. Exigem versão/hash da origem salva; retornam409 para divergência e404 fora do desenvolvimento. Acrescentam somente auditoria PREPARED, sem alteração de projeto ou nova versão. Não enviam ao TransfereGov. [Contrato e metodologia](transferegov-bm.md).

PLE: os endpoints paralelos /orcapro/projects/:id/transferegov/ple/receipt e /infraestrutura/projects/:id/transferegov/ple/receipt recebem os mesmos campos e vents (1 a 999), completions (1 a 100000). Mesmos guards, CSRF, owner/tenant, conflito409 e bloqueio em produção. Registram somente auditoria xport.transferegov.ple, sem alterar orçamento ou versões. [Layout e metodologia PLE](transferegov-ple.md).

## Auditoria Infraestrutura detalhada — 27/10/2026

`GET /infraestrutura/admin/audit` aceita `user`, `from`, `to`, `category=all|access|activity|failure`, `page` e `pageSize` (máximo 100); requer administrador global do produto. Retorna itens enriquecidos, `total`, `page`, `pages`, `pageSize` e `timezone=America/Sao_Paulo`. Datas incluem o dia final completo. `POST /infraestrutura/activity/navigation` aceita `{screen,projectId?}` com guard, CSRF e validação de proprietário/tenant do projeto. Não altera o orçamento. [Contrato operacional e proteção dos detalhes](infraestrutura-audit.md).

## Preços de insumos por orçamento — 27/10/2026 (DEV)

Os endpoints existentes de gravação de projetos OrçaPro e Infraestrutura aceitam `data.inputPriceOverrides`: até 2.000 objetos `{code,uf,ref,regime,priceCents,chiCents?,source,date}`. `ref` é YYYY-MM, data YYYY-MM-DD, valores são centavos inteiros não negativos. O escopo continua proprietário+tenant autenticados, CSRF e versão esperada; conflito retorna409. Nenhum endpoint de catálogo global é alterado. `inputPriceHistory` conserva o histórico local e versões/auditoria registram a gravação. Prévia e confirmação acontecem no editor, com o mesmo motor usado no servidor. [Fluxo, metodologia e limites](project-input-prices.md).

Base local: `/api/v1`. Em produção: `https://api.gestaodepredios.com.br/api/v1`.

A busca administrativa `GET /infraestrutura/admin/accounts?search=...` localiza
contas da identidade compartilhada por trecho literal do nome ou e-mail (sem
diferenciar maiúsculas ou acentos). A comparação normaliza a collation UTF-8
somente na consulta, sem alterar o cadastro. Retorna apenas usuários e vínculos
ativos em organizações não excluídas e com situação TRIAL, ACTIVE ou PAST_DUE;
paginação de 30 vínculos. Continua restrita ao administrador do Infraestrutura.
Procurar uma conta não concede acesso: a concessão exige a ação administrativa
separada, validando novamente o vínculo e registrando auditoria no banco Infraestrutura.

A documentação executável fica em `/docs` via Swagger. Este arquivo registra o contrato conceitual e deve ser atualizado com mudanças incompatíveis.

Assistente SINAPI OrçaPro: `/orcapro/admin/imports/file/stream` (XLSX multipart) e `/orcapro/admin/imports/stream` (JSON) adicionam `baselineReferenceId?` e retornam NDJSON autenticado com `progress`, `heartbeat`, `error` ou `result`. `GET /orcapro/admin/references/:id/import-report` pagina diferenças por `kind/status/search/page/pageSize`; `.csv` exporta todas as diferenças filtradas. O contrato completo e a recuperação de conexão estão em [orcapro-api.md](orcapro-api.md). Os endpoints síncronos anteriores continuam disponíveis.

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
| POST | `/auth/orcapro/login` | autentica OrçaPro por e-mail e senha; usa tenant original da licença |
| POST | `/auth/gestao/login` | autentica Gestão Contratual por e-mail/senha da identidade central, somente DEV; assinatura verificada separadamente |
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
  "email": "<email-da-conta>",
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
| GET | `/buildings/:id/deletion-impact` | autenticado; contabiliza vínculos antes do arquivamento |
| POST | `/buildings/:id/inspections` | gestor; cadastra vistoria |
| DELETE | `/buildings/:id/inspections/:inspectionId` | gestor; arquiva vistoria |
| POST | `/buildings/:id/attachments` | gestor; envia laudo, documento ou foto privada |
| GET | `/buildings/:id/attachments/:attachmentId/download` | autenticado; download tenant-aware |
| DELETE | `/buildings/:id/attachments/:attachmentId` | gestor; arquiva anexo |
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

Os anexos usam `multipart/form-data`, com `file` e `kind`. `INSPECTION_REPORT` e
`PROPERTY_DOCUMENT` aceitam somente PDF; `BUILDING_PHOTO` aceita JPG, PNG ou WebP. O GET da
edificação retorna vistorias, anexos privados e os planos de manutenção associados. A
exclusão é lógica, preserva o dossiê e suspende planos ativos.

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

### 7.5 Gestão e fiscalização contratual v0.16

| Método | Rota | Finalidade |
|---|---|---|
| GET/POST | `/inspectors` | lista e cadastra perfis de gestores e fiscais |
| GET/PATCH/DELETE | `/inspectors/:id` | consulta, altera ou arquiva fiscal sem designação ativa |
| POST | `/contracts/:id/inspection-team` | registra gestor/fiscal, função, portaria e período da designação |
| POST | `/contracts/:id/guarantees` | controla modalidade, suficiência, vigência, execução e liberação da garantia |
| POST | `/contracts/:id/apostilles` | formaliza apostilamento e recalcula o valor contratual quando financeiro |
| POST | `/contracts/:id/receipts` | registra recebimento, vistoria, decisão, observação e pendências |
| POST | `/contracts/:id/construction-diaries` | registra diário de obras e vínculo opcional com OS do contrato |
| POST | `/contracts/:id/communications` | registra comunicação/pleito, instrução, prazos, pareceres e decisão |
| DELETE | `/contracts/:id/governance/:kind/:entryId` | arquiva ato do dossiê e preserva auditoria |
| POST | `/contracts/:id/dossier-attachments` | envia PDF ou imagem para um ato contratual |
| GET/DELETE | `/contracts/:id/dossier-attachments/:attachmentId` | download auditado ou arquivamento do documento |

Todas as rotas derivam `tenantId` da sessão. O contrato passou a separar o tipo operacional, a
natureza jurídica (`CONTINUOUS`/`SCOPE`) e o regime de execução. O valor atual considera valor
original, aditivos, reajustes/repactuações e apostilamentos financeiros ativos.


| Método | Rota | Finalidade |
|---|---|---|
| POST | `/billing/checkout` | cria sessão de contratação |
| POST | `/billing/portal` | abre portal do cliente |
| POST | `/billing/webhooks/stripe` | recebe eventos Stripe assinados |

O endpoint de webhook usa corpo bruto e não exige sessão de usuário, mas exige assinatura Stripe válida.

### Contratação individual online OrçaPro

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/orcapro/billing/public/plans` | catálogo público de planos ativos vinculados ao Stripe |
| POST | `/orcapro/billing/public/register` | cria conta privada pendente e inicia Checkout |
| GET | `/orcapro/billing` | licença individual autenticada e disponibilidade da integração |
| GET | `/orcapro/billing/plans` | planos ativos para renovação autenticada |
| POST | `/orcapro/billing/checkout` | inicia/retoma Checkout com `{planId}` |
| POST | `/orcapro/billing/portal` | portal do cliente Stripe individual |
| POST | `/orcapro/billing/webhooks/stripe` | webhook exclusivo, assinado e idempotente |

O catálogo público retorna `{plans:[{id,name,billingInterval,priceBrl}],integration:{keyConfigured,webhookConfigured,mode}}`.
`priceBrl` é decimal em reais; `billingInterval` é `MONTH`/`YEAR`; `mode` é `TEST`/`LIVE` ou null. Sem
integração completa, a lista online fica vazia. Identificadores e segredos Stripe não são publicados.

O cadastro recebe `{name,email,password,planId}` e devolve cookies HttpOnly mais
`{user,tenant:{id,name,slug},role,checkoutUrl}`. O slug é gerado pelo servidor. O tenant e o vínculo
não são recebidos do cliente. A licença inicial é `UNPAID`, sem teste ou acesso aos orçamentos;
o vínculo tem `maintenanceAccess=false`. A confirmação visual do Checkout não concede acesso.
Somente webhook verificado ou concessão administrativa manual ativa a licença.

Se o Checkout falhar depois da criação, a resposta HTTP 201 mantém a sessão e retorna
`checkoutUrl:null` e `checkoutError`: o usuário retoma pela área de assinatura. Repetir um cadastro
com e-mail existente recebe 409 com orientação para entrar; tentativas concorrentes não criam
organizações órfãs. A senha segue os limites de 10 a 72 caracteres e no máximo 72 bytes UTF-8.

O login específico recebe `{email,password}`. O tenant original da licença é escolhido no servidor;
contas anteriores sem licença usam seu vínculo válido mais antigo. Suspensão do tenant da licença
não permite fallback para outro vínculo. A resposta inclui `{user,tenant,role}` e cookies de sessão.
O login por organização da manutenção permanece disponível. POSTs de cadastro/login OrçaPro
exigem `Origin` da lista `CORS_ORIGINS` e têm limite de dez tentativas por IP por minuto.
Na API comercial, `ORCAPRO_ONLY=true` bloqueia `/auth/register-tenant` com HTTP 403 antes de
criar qualquer identidade/tenant. Isso impede usar o trial público da manutenção para contornar
a contratação OrçaPro pendente. Desenvolvimento usa `ORCAPRO_ONLY=false`; contas históricas,
login, convites existentes e cadastros/concessões pelo administrador permanecem preservados.

`ORCAPRO_STRIPE_MODE` deve corresponder à chave, aos preços, aos eventos e às assinaturas remotas.
Use TEST no desenvolvimento e LIVE na produção. `ORCAPRO_MARKETING_URL` define o retorno HTTPS
ao cancelar Checkout; a confirmação volta a `WEB_BASE_URL/orcapro/assinatura?checkout=success`.
O portal de cobrança volta à área de assinatura. `ORCAPRO_STRIPE_PORTAL_CONFIGURATION_ID` é opcional
e seleciona uma configuração `bpc_` exclusiva do OrçaPro, validada como ativa e do mesmo modo TEST/LIVE
antes de abrir a sessão. Sem essa variável, mantém-se o padrão existente da conta Stripe. A configuração
comercial preparada permite atualizar o meio de pagamento, consultar faturas e cancelar a renovação
no fim do período; a troca de planos está desativada para não oferecer preços de validação. Configurar
o Portal exclusivo não altera o Portal padrão utilizado por outros sistemas na mesma conta.
A administração manual, senhas e vendas diretas
permanecem independentes da integração Stripe; eventos externos preservam `billingSource=MANUAL`.
Uma sessão de Checkout aberta é reutilizada somente para o mesmo preço. Selecionar outro plano
expira a sessão não paga e abre a contratação no novo preço; uma assinatura já concluída deve
ser alterada pelo portal, evitando duas cobranças simultâneas.

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

## 9.1 Orçamento contratual v0.18

| Método | Endpoint | Uso |
|---|---|---|
| GET | `/budgets/contracts/:contractId` | resumo, postos, importações, manifesto de abas e revisões |
| PATCH | `/budgets/contracts/:contractId` | título, competência, observações e status |
| POST | `/budgets/contracts/:contractId/import` | importa XLSX, XLSB ou PDF textual (multipart) |
| GET | `/budgets/contracts/:contractId/items` | pesquisa paginada dos preços do contrato |
| POST/PATCH/DELETE | `/budgets/contracts/:contractId/items[/:itemId]` | manutenção dos materiais e serviços |
| POST/PATCH/DELETE | `/budgets/contracts/:contractId/labor-posts[/:postId]` | manutenção dos postos e formação de preço |
| GET | `/budgets/work-orders/:workOrderId/contract-items` | preços dos contratos vinculados disponíveis para a OS |

O importador limita o arquivo a 80 MB, valida assinatura e extensão, normaliza os dados em lotes e
descarta o binário após o processamento. Arquivos PDF dependem de camada textual e produzem aviso de
conferência. O tenant é obrigatório em toda leitura e escrita.

## 9.2 Conciliação financeira v0.19

| Método | Endpoint | Uso |
|---|---|---|
| GET | `/finance/reconciliation` | consolida a integridade financeira de todos os contratos do tenant |
| GET | `/finance/reconciliation/contracts/:id` | detalha valores, saldos e inconsistências de um contrato |

Os endpoints são somente leitura. Bloqueios de teto são aplicados nas rotas de ativação da planilha,
aprovação do orçamento de OS e movimentação de empenhos.

## 10. Endpoints necessários para completar o MVP

- transferência formal de propriedade da organização;
- anexos genéricos;
- catálogo de relatórios e exportações;
- consulta de entitlement/limites de plano.

## 11. OrçaPro Infraestrutura

### Auditoria administrativa OrçaPro (16/10/2026)

`GET /orcapro/admin/logs`: exclusivo de administrador global OrçaPro. `user` procura nome/e-mail inclusive de contas removidas; `from`/`to` são datas YYYY-MM-DD inclusivas em America/Sao_Paulo; `category=all|access|activity|failure`; `page` e `pageSize` (máximo100). Resposta mantém items/total e acrescenta pages, page/pageSize normalizados, actor{id,name,email}, entityName e metadata limitada sem credenciais/documentos. Ordem createdAt DESC,id DESC. Datas impossíveis ou invertidas retornam400. Usuários comuns403; anônimos401.

`POST /orcapro/activity/navigation`: tela técnica de até50 caracteres e projectId opcional; valida proprietário+tenant antes de registrar navegação. Não concede acesso a projetos. Interceptor registra requisições autenticadas OrçaPro e resultados (rota sem query/body, método, status, duração, IP observado e navegador); login compartilhado registra sucesso/falha, logout revoga e registra uma vez. Falhas de login não são atribuídas a um usuário não autenticado. Consultas da própria auditoria, OPTIONS, refresh e chamadas de navegação duplicadas não geram eventos HTTP adicionais. Rejeições anteriores ao interceptor, como bloqueios dos guards, permanecem nos mecanismos de segurança existentes. Falha na captura HTTP é enviada ao log operacional sem dados sensíveis e não provoca repetição de mutação já concluída. Eventos de negócio transacionais permanecem obrigatórios.

Registros antigos sem esses detalhes permanecem válidos; eventos não capturados no passado não podem ser recuperados. Nenhuma retenção destrutiva foi introduzida. Publicação desta entrega: apenas desenvolvimento; promoção comercial exige solicitação separada.

Terceiro aplicativo autorizado em03/10/2026, somente no ambiente DEV nesta entrega. O contrato aditivo `/api/v1/infraestrutura` compartilha a identidade central e usa outro banco para perfis do produto, catálogo SICRO/PEM e dados privados. [infraestrutura-api.md](infraestrutura-api.md) descreve todos os endpoints, envelopes, CSRF/login, importação incremental/hash, ETag, projetos/versões409, migração confirmada, administração e exportação/expurgo LGPD. Rotas da manutenção e do OrçaPro não mudam de versão ou formato.

GET `/infraestrutura/health` é público; os demais recursos exigem perfil próprio, cookies e filtros de proprietário+tenant. Rotas administrativas verificam ADMIN local/configurado, sem herdar OWNER da organização. Senha permanece central; nenhuma nova API aceita hash/senha de outro produto como credencial de bridge.

### Cópia compatível TransfereGov (somente desenvolvimento)

`POST /orcapro/projects/:id/transferegov/compatible-copy` e `POST /infraestrutura/projects/:id/transferegov/compatible-copy` exigem autenticação, permissão do produto, CSRF e propriedade pelo usuário/tenant do token. Corpo: `expectedVersion`, `sourceHash` SHA-256 canônico, `requestId` UUID idempotente e `rows` de 1 a 10.000 `{id,quantity,cost}` com strings decimais de duas casas. A API valida cobertura exata dos IDs do orçamento salvo, limites financeiros e conflito de versão/hash (409).

Cria apenas um novo orçamento privado, versão inicial e auditoria `export.transferegov.compatible-copy`; nunca atualiza a origem, biblioteca ou referência. Repetir o mesmo requestId/origem/hash retorna a cópia já criada. O ambiente é validado antes da transação; produção responde 404. As rotas de recibo BM/PLE existentes continuam somente acrescentando auditoria.


## Informativos do sistema (desenvolvimento)

Rotas /api/v1/system-bulletins: GET capabilities; POST preview (subject, body texto simples, products ORCAPRO/INFRA, accountStatus ACTIVE/INACTIVE/ALL); GET ?page (20/página); POST :id/test (somente administrador atual); POST :id/confirm (confirmation=ENVIAR INFORMATIVO, audienceHash). JWT, administrador global, ambiente de desenvolvimento e origem confiável são obrigatórios. Falha 404 em produção/desativado, 403 sem privilégios, 409 se o público mudou. Confirmar enfileira de forma idempotente; não envia na requisição. Consulte docs/system-bulletins.md.


## Sessão única — desenvolvimento, 02/11/2026
AUTH_SINGLE_SESSION=true, restrito por WEB_BASE_URL ao desenvolvimento. Login comum incrementa sessionVersion de todos os vínculos e revoga refresh anteriores numa transação serializada por identidade (User FOR UPDATE). JWT já verifica a versão em cada requisição. Refresh opaco inclui geração autenticada pelo hash existente; rotação confere geração e revogação dentro da mesma transação. Nenhuma tabela nova. Administradores globais OrçaPro/Infra configurados e perfis locais Infra ADMIN ativos são isentos. Não usa IP ou fingerprint. Abas compartilham cookies; outro navegador exige novo login e encerra o anterior. Os dois produtos compartilham a sessão de desenvolvimento. Não salva ou descarta automaticamente edições locais, nem cria versões de orçamentos. Sessões anteriores à ativação permanecem válidas até novo login. Rollback: AUTH_SINGLE_SESSION=false, sem restaurar dados. Produção não alterada.


### Detecção visual de sessão encerrada
GET /auth/session-status é público, sem cache, sem renovar cookies e sem expor identidade. No desenvolvimento retorna enforced e active, conferindo o refresh opaco com hash, validade, revogação e situação da conta/vínculo. Fora do desenvolvimento retorna apenas enforced:false. Monitor externo nas páginas verifica a cada 15 segundos e ao voltar ao navegador; duas respostas inativas exibem bloqueio sem desmontar o iframe ou apagar alterações locais. Falha de rede não invalida sessão. Nova autenticação permite retomar a aba preservada.

Verificação publicada em 02/11/2026: geração anterior da conta informada recebeu HTTP401 e geração atual HTTP200. Endpoint e script público conferidos. Foram atualizadas somente API e páginas estáticas de desenvolvimento; backups privados em single-session-monitor-dev-20261102. Nenhuma escrita em orçamento ou sessão durante a verificação.


## Promoção de sessões únicas à produção — 02/11/2026
A regra e o monitor foram promovidos para sistema.orcaproobras.com.br e orcaproinfra.com.br por autorização expressa. AUTH_SINGLE_SESSION=true nos dois backends; lista explícita de domínios permite desenvolvimento e essas produções. O monitor escolhe exclusivamente a API correspondente ao hostname. Contas e sessões permanecem independentes entre os dois bancos de produção. Novo login comum invalida versões anteriores; administradores configurados e perfis Infra ADMIN ativos são isentos. Não exige migration ou cópia de orçamento. Rollback: remover a inclusão do monitor nas páginas ou repor os HTML de backup, desativar AUTH_SINGLE_SESSION e restaurar o symlink de runtime anterior, sem restaurar banco de dados. Backups privados completos e arquivos anteriores em single-session-production-20261102 na conta <conta-hostinger>.

### Conciliação de centavos nas planilhas contratuais

`GET /contract-management/contracts/:id/worksheet` inclui no `summary` os campos decimais opcionais `lineSumBaseValue`, `baseRoundingAdjustment`, `lineSumPricedValue` e `priceRoundingAdjustment`. A soma das linhas arredondadas mais o ajuste informado resulta em `currentValue` ou `currentPricedValue`, respectivamente. Esses totais respeitam a política de arredondamento agregado do histórico, sem regravar ações ou medições. Os campos também acompanham as fotografias históricas de aditivos e suas versões anteriores.


### Exportações da Gestão Contratual (desenvolvimento, 14/11/2026)

`GET /contract-management/contracts/:id/amendments/:aid/export?format=xlsx|pdf` retorna a fotografia do termo, com quantitativos originais, anteriores e atualizados, acréscimos/supressões, conciliação e eventograma nos contratos globais.

`GET /contract-management/contracts/:id/prices/export?format=xlsx|pdf&date=YYYY-MM-DD` retorna a valorização do escopo na data selecionada e a memória dos atos de preço aplicáveis. Regras posteriores à data são excluídas. A data omitida usa a data padrão da planilha.

As rotas usam a mesma autenticação, tenant e autorização de leitura do contrato. Formato inválido é recusado. Os arquivos são gerados em memória e enviados como anexos privados, sem gravação no banco. Medições continuam em `/contracts/:id/measurements/:mid/export`; valores históricos não são recalculados pela exportação. XLSX contém células numéricas, cabeçalho congelado e filtros. PDF A3 paisagem repete cabeçalhos e identifica subtotais não aditivos.

### Histórico de desenvolvimento por sessão/dia

Com a retenção de desenvolvimento ativa, os endpoints de histórico OrçaPro e Infra acrescentam `retentionState: KEPT | RECOVERY` e `recoveryUntil: ISO UTC | null`. Registros antigos e protegidos são `KEPT`; campos são aditivos e não alteram a restauração, que cria uma nova versão. A lista do OrçaPro deixa de cortar em 200 itens para permitir consultar todos os pontos preservados. O cliente exibe intermediários mediante opção de recuperação. `workSessionId` é emitido internamente no JWT e não é aceito livremente no corpo das operações. A API Gestão Contratual mantém todos os atos; seus metadados de retenção são internos e protegidos.


### Importação de medições: vínculos explícitos (desenvolvimento, 14/11/2026)

`POST /contract-management/imports/:id/measurement-map` aceita `identifierKind: CODE | NUMBER` opcional (padrão CODE), persistido no mapeamento e incluído no hash da confirmação. CODE identifica a composição; NUMBER usa o número do item do orçamento, sem confundi-lo com códigos iguais de outros serviços. Eventos continuam identificados pelo ID do eventograma. Código repetido exige vínculo manual. Identificação e quantidade não podem usar a mesma coluna.

A prévia global valida sobreposição pai/filho e eventos previamente medidos com a mesma regra do motor financeiro. Colunas mapeadas contendo erros do Excel ou fórmulas sem valor calculado geram pendência, em vez de serem tratadas como células vazias. Os preços do XLSX não são importados. Quantidade zero é ignorada; quantidade negativa, saldo excedido, alvo inexistente/arquivado e duplicidade impedem confirmar. A confirmação continua criando apenas rascunho, com arquivo original privado, controle de tenant/usuário, versão e hash.


## Retenção automática no OrçaPro comercial — 14/11/2026

Autorização específica: somente `sistema.orcaproobras.com.br`, banco `<conta-hostinger>_orcapro_live`. A flag `VERSION_RETENTION_ORCAPRO_PROD=true` exige origem HTTPS e nome exatos; a flag de desenvolvimento não ativa produção. Infraestrutura comercial permanece inalterado. Migration manual `apps/api/retention-migrations/002_orcapro_production_history.sql`, com os mesmos nove campos da tabela de desenvolvimento. Sem seed de histórico: sessões antigas não são inventadas.

Novos logins recebem identificador aleatório de sessão assinado no JWT; refresh mantém o identificador. Cada orçamento mantém a última versão de cada sessão/dia (America/Sao_Paulo), mesmo após fechar o navegador sem logoff. Versões intermediárias ficam recuperáveis por 24 horas desde sua substituição; o worker roda a cada minuto enquanto o processo estiver ativo. Atraso do processo apenas amplia a recuperação. Salvamentos sem alteração material não criam cópias. Logout aguarda o salvamento pendente. A interface apresenta recuperação opcional e o prazo; restaurar cria nova versão.

Worker comercial separado acessa somente o banco OrçaPro. Usa transação/bloqueio do orçamento, tenant em consultas/mutações e auditoria atômica `history.consolidate`. Protege versão atual, metadados protegidos, fontes e alterações das análises de riscos, referências de auditoria (incluindo `details.sourceVersion`) e contratos. Referência contratual opaca ao orçamento preserva todo seu histórico. Tabela Gc* nova, GESTAO_DATABASE_URL configurada, FK histórica não revisada ou falha de consulta interrompem limpeza até revisão explícita. Atos contratuais não são removidos. Históricos legados sem metadados continuam preservados. Não há OPTIMIZE automático.

Publicação restrita: seis módulos JS sobre o runtime comercial anterior, páginas gerenciar/editor e recursos estáticos necessários. Nenhum módulo de Gestão Contratual em desenvolvimento é promovido. Backup privado verificado do histórico/configuração e runtime/páginas anteriores em `/home/<conta-hostinger>/version-retention-production-20261114`; hashes no manifesto. Rollback: desativar VERSION_RETENTION_ORCAPRO_PROD, repor symlink e páginas anteriores; conservar VersionRetention. Expurgo posterior ao prazo é definitivo e eventual recuperação exige backup.


### Gestão Contratual: acompanhamento do cronograma (desenvolvimento)

`GET /api/v1/contract-management/contracts/:id/planning?date=AAAA-MM-DD` autoriza contrato/tenant antes de ler sua fotografia comprimida. Retorna curva S original, execução física, medições aprovadas, pagamentos na base e caixa separado, Gantt por serviço, desvios em dias corridos, folgas/durações úteis, equipes e recursos da origem. A consulta não altera nem substitui a fotografia por uma versão viva do OrçaPro/Infra. Capturas Infra novas preservam datas, produtividades e curva S calculadas pelo motor original. Capturas antigas sem esses dados exibem a lacuna.

A ação auditada `progress-items` aceita `{date, reason, lines:[{itemId, executedPercent, actualStart?, actualEnd?, forecastEnd?, actualTeams?}]}`; gestor/fiscal, versão esperada e ID idempotente obrigatórios. Quantidades e valor-base do apontamento ficam congelados no registro. Bloqueia IDs duplicados/inexistentes, percentuais fora de 0–100, início/término incoerentes e regressão da quantidade física. Não transforma execução física em aceite ou pagamento. Levantamento parcial não gera percentual físico total presumido.

Pagamentos que usam deduções conciliadas não podem anteceder o ajuste aplicado. Movimentos financeiros respeitam sua ordem cronológica. Restituições não podem anteceder o aditivo vigente ou movimentos financeiros anteriores, nem ultrapassar o excesso efetivamente retido. A tela informa saldo, retenção efetivada e dedução vigente antes do registro.


## Retenção automática Infraestrutura comercial — 14/11/2026

Ativação exclusiva por `VERSION_RETENTION_INFRA_PROD=true`, origem `https://orcaproinfra.com.br`, identidade `<conta-hostinger>_infra_auth` e orçamentos `<conta-hostinger>_infra_live`; os três destinos são validados. Migration manual `003_infra_production_history.sql` apenas no banco de orçamentos. Não há migration no banco de identidade, sem seed de sessões históricas.

A mesma política sessão/dia e recuperação de 24 horas substitui o corte numérico INFRA_PROJECT_VERSION_RETENTION quando habilitada. Versões sem sessão/metadados, última de cada sessão/dia, versão atual e referências protegidas permanecem. Datas UTC e agrupamento America/Sao_Paulo. Refresh conserva a sessão; novo login cria outra. Saves sem mudança material não criam cópias. Logout da interface aguarda flush. Histórico inclui retentionState/recoveryUntil e permite mostrar/restaurar intermediárias.

`InfraProductionVersionRetentionWorker` executa a cada minuto. Antes de exclusão transacional com tenant/bloqueio do orçamento, revalida fontes e alterações de análises decodificando snapshots gzip com limite de 21 MiB, auditorias e referências contratuais nos bancos Infra e identidade. Contrato opaco protege todo o orçamento; erro de leitura, gzip inválido, GESTAO_DATABASE_URL, novo registro Gc* ou FK histórica não revisada impedem limpeza. O banco de identidade é somente consultado pelo worker. Exclusão e auditoria InfraAudit history.consolidate são atômicas no banco Infra.

Backup privado verificado do histórico e configuração em `/home/<conta-hostinger>/version-retention-infra-production-20261114`; runtime anterior `single-session-production-20261102` e páginas previous-web preservados. Rollback: desativar flag, restaurar ponteiro/páginas e conservar metadados. Não promove alterações da Gestão Contratual. O build web isolado exclui a rota de Gestão Contratual em desenvolvimento e usa NEXT_PUBLIC_ORCAPRO_ONLY=false com API Infra explícita. Apenas páginas gerenciar/editor e recursos necessários publicados; nenhum catálogo, orçamento ou runtime de outro ambiente alterado. Sem compactação automática.


## Compressão nativa do histórico e importações OrçaPro — 14/11/2026

Aplicação manual exclusiva em `<conta-hostinger>_orcapro_live`, MariaDB 11.8: `OrcaproProjectVersion.data` e `OrcaproImport.report` usam `LONGTEXT COMPRESSED` (zlib). O banco comprime ao gravar e descomprime ao ler. JSON, bytes lógicos, metadados, PKs/FKs e assinaturas de análise continuam intactos; nenhum envelope/base64 ou mudança de payload/API é introduzido. Prisma continua declarando esses campos como Json. Não foram alterados runtime, páginas, configurações, Infraestrutura ou desenvolvimento.

Migration física manual: `apps/api/retention-migrations/004_orcapro_column_compression.sql`. Rollback: arquivo `.rollback.sql` correspondente. Não integra deploy Prisma automático, não requer seed e depende de MariaDB com suporte a COMPRESSED. Antes de futuras reconstruções/migrations desses campos, conferir SHOW CREATE TABLE para conservar compressão e validação; não usar db push para remover atributos físicos por acidente. Exports lógicos seguem legíveis; restauração em MySQL Oracle requer schema sem o atributo específico MariaDB.

A cláusula `CHECK (JSON_VALID(...))` deve ser declarada explicitamente no MODIFY: o teste temporário demonstrou que a alteração sem CHECK remove a validação inline. MariaDB exibe DEFAULT '' na definição comprimida; JSON_VALID continua rejeitando esse valor inválido. Charset utf8mb4, collation utf8mb4_bin e NOT NULL preservados. Colunas comprimidas não são indexadas; índices e relacionamentos existentes das demais colunas foram comparados antes/depois.

Backup privado antes da alteração: `/home/<conta-hostinger>/orcapro-column-compression-20261114`, com schema, 146 versões, três relatórios, texto integral, metadados, vínculos e SHA-256, relidos antes de cada alteração. A conversão levou aproximadamente 5,3 s no histórico e 0,5 s nos relatórios. As 149 linhas originais tiveram conteúdo e metadados verificados após a conversão; nenhum registro eliminado.

Validação no runtime comercial: criação/conversão/leitura/escrita em tabelas TEMPORARY via Prisma; JSON inválido recusado; restauração avaliada sem efetivar um novo orçamento; três relatórios completos comparados com backup; endpoints JSON/CSV retornaram HTTP200 e 23.507.246 bytes de CSV conferidos incluindo BOM; histórico HTTP200; isolamento de tenant; fingerprint de origem de análise reconstruído pelo motor real; API ok/ready. Não houve mudança de código de aplicação, portanto não é necessário novo build.

Alocação física das duas tabelas caiu de 154.206.208 para 23.134.208 bytes, incluindo índices: redução de 131.072.000 bytes (125 MiB). A migration já reconstrói as tabelas, sem necessidade de OPTIMIZE adicional. O total do hPanel é medido separadamente.


### Reprogramação contratual após aditivos — desenvolvimento, 14/11/2026

`POST /contract-management/contracts/:id/planning/proposal` aceita `{expectedVersion,effectiveDate}` e exige gestor do contrato/tenant autenticado. Retorna proposta editável por saldo físico, duração/equipes capturadas e calendário útil da origem; serviços novos sem duração ficam pendentes de prazo informado. Não grava nem altera OrçaPro/Infra. O gestor confere precedências, frentes e capacidade de recursos. A proposta não executa novo CPM nem nivelamento de equipes.

A ação `schedule-revision` usa `/preview` e `/actions`, com hash de prévia obrigatório, versão esperada, requestId idempotente e auditoria. Payload: `{title,reason,formalReference,effectiveDate,amendmentId,calendar,lines:[{itemId,start,end,teams}]}`. Exige último aditivo, todos os serviços (inclusive suprimidos), levantamento físico completo, calendário válido, início/fim úteis do saldo estritamente posteriores ao corte e datas reais intactas nos serviços concluídos. A data não antecede último aditivo/revisão/apontamento. Datas editáveis representam somente saldo; novo registro conserva todos os anteriores.

`GET .../planning?date=YYYY-MM-DD&revisionId=UUID|ORIGINAL` compara original, revisão selecionada e execução. Sem revisionId adota última revisão até o corte. Revisão de outro contrato é recusada. O retorno inclui metadados de revisões, curva reprogramada, datas/equipes reprogramadas por item, desvios ante origem e revisão, compatibilidade com escopo vigente e histórico. O saldo é distribuído linearmente por dias úteis e fecha no valor-base congelado; reajustes não criam avanço físico. Novo aditivo torna a revisão anterior desatualizada para indicadores agregados, sem modificar seu conteúdo. Revisões não alteram aceite do eventograma, medições, pagamentos, valores ou fontes.

A ponderação das curvas conserva a precisão decimal por serviço e arredonda apenas a soma acumulada; o último ponto coincide exatamente com o valor-base contratual. Metadados da revisão incluem `lineSumBaseValue` e `baseRoundingAdjustment` para conciliar a apresentação das linhas arredondadas.


## Gestão Contratual — SaaS e manual (DEV)

`/api/v1/contract-management/admin` exige identidade autenticada, origem permitida e administrador específico deste produto; `OWNER` da organização não basta. O diretório SaaS é uma consulta administrativa global explícita, independente das permissões sobre contratos privados. Serviços de contrato continuam usando tenant e associação do token. Nunca aceitar tenant livre no cadastro: a concessão recebe `membershipId`, resolvido no servidor; organização nova é criada pelo fluxo administrativo.

- `GET overview`, `GET users`, `GET accounts`: indicadores sem segredos, diretório e busca paginados.
- `POST users`, `POST users/grant`: cadastrar conta/organização com teste local de 30 dias ou conceder acesso a identidade existente.
- `PATCH users/:id`: papel/situação com versão e motivo; suspensão e exclusão recuperável do produto. Administrador inicial e própria conta protegidos. Só o administrador inicial concede ADMIN.
- `GET users/:id/sessions`, `POST users/:id/password`, `POST users/:id/revoke-sessions`: senha compartilhada exige confirmação de alcance, 10 caracteres a 72 bytes, revoga JWTs/refresh e consome links de reset; nunca retorna ou audita senhas.
- `PUT users/:id/subscription`: licença manual ou controle Stripe, sem alterar cobranças. Validade obrigatória para trial; manual não remove bloqueio de risco.
- `GET/POST plans`, `PUT plans/:id`: catálogo mensal/anual manual ou Stripe TEST, valor exato, produto/periodicidade verificados; plano usado não muda condições financeiras.
- `POST users/:id/stripe`: `SYNC`, `CANCEL_AT_PERIOD_END`, `RESUME`, com versão da conta de cobrança, UUID idempotente e motivo. Recusa ambiente/cliente/produto divergente e não retoma assinatura encerrada.
- `GET audit`, `GET audit/export`: filtros por responsável, operação, registro e datas de Brasília; CSV da página filtrada, máximo 100 linhas, com neutralização de fórmulas. Inclui registros anteriores sem expor payloads de contratos.
- `GET settings`, `PUT settings/:name`: `privacy`, `terms`, `notice`, com versão/motivo. Informativo apenas dentro do aplicativo; não envia e-mail.

`GET /contract-management/saas-access`, `GET /content` e `POST /activity/navigation` exigem login e ambiente DEV, mas não assinatura ativa. Manual também acessível sem contrato. Navegação envia apenas uma seção da lista permitida. Atividades, downloads, ações e login do módulo geram metadados compactos. Interceptor não registra corpo, senha ou token. Guard administrativo limita 120 requisições/minuto/usuário e não permite cache.

Manual interativo: 17 capítulos pesquisáveis, percursos de uso, listas de conferência, questões comentadas, atalhos para as telas, impressão e três simuladores isolados (medição unitária, cesta de índices e compensação/restituição). Não escreve medições, contratos nem pagamentos. Os exemplos são didáticos; a memória aprovada do contrato é a fonte dos valores reais.

### Compartilhamento contratual — validação de desenvolvimento (14/11/2026)

- `GET /contract-management/contracts/:id/members` inclui o titular com papel de apresentação `OWNER` (gestor permanente). Esse papel não é aceito para concessões; o proprietário não pode ser rebaixado ou removido. Demais papéis: `MANAGER`, `FISCAL`, `READER`, `REVOKED`.
- `POST .../members` registra autor e alteração em auditoria. A autorrevogação de gestor delegado responde `201 []` após confirmação da transação, sem reler a equipe após perder autorização. O cliente recarrega os direitos e remove o contrato da tela.
- Cada boletim em `GET .../contracts/:id` informa `canApprove`, calculado por papel, situação e autoria. Em contratos reais, nenhum gestor ou fiscal aprova o próprio boletim. Demonstrações preservam a exceção didática. A API revalida a regra dentro da transação; a indicação na interface não substitui a autorização.
- O gestor altera escopo/preços, registra pagamentos e administra a equipe; o fiscal apresenta medições, aprova as de outro autor, registra execução física e anexa documentos; o leitor consulta e exporta. Acesso limitado a contratos explicitamente compartilhados da mesma organização.
- Revogação e rebaixamento valem na próxima requisição, inclusive para downloads e exportações. A licença do titular permite colaborar, mas não constituir contratos próprios; suspensão do perfil e perda da licença do titular prevalecem.
- Mudanças desta validação publicadas somente em desenvolvimento; sem migração de banco e com versão anterior preservada para rollback.


### Gestão Contratual — cadastro autônomo DEV (14/11/2026)

- `GET /contract-management/billing/public/plans`: planos ativos vinculados a preços Stripe TEST.
- `POST /contract-management/billing/public/register`: nome, email, senha e planId; valida origem/host DEV e limite por IP, cria organização e acesso exclusivo ao produto, inicia sessão e Checkout TEST. Email existente não altera a identidade.
- O cadastro não concede administrador nem licença manual. A assinatura é liberada pelo webhook assinado e idempotente. Falha no Checkout preserva a conta para nova tentativa autenticada.
- Captura Infra preserva versão, preços e fotografia original. Linhas com quantidade e total exatamente zero são omitidas da planilha contratual com aviso explícito. Descrições, unidades e curva S vêm do cálculo SICRO. O projeto temporário gerado pelo cálculo (timestamps e IDs voláteis) não integra o hash; o projeto original integral permanece na fotografia.

### Correção de preferências do Infraestrutura — desenvolvimento, 15/11/2026

O driver MariaDB decodifica automaticamente colunas JSON. Preferências escalares como `"light"` chegavam como `light` e eram decodificadas novamente, causando HTTP 500 em `GET /infraestrutura/settings` e impedindo a inicialização do editor. A leitura das preferências e sua exportação agora usam `CAST(data AS CHAR) AS data`, mantendo exatamente uma decodificação, inclusive para strings que parecem números/booleanos/JSON. Filtros de tenant e usuário permanecem obrigatórios. Nenhuma alteração de schema ou dados.

Publicado somente no desenvolvimento, runtime `infra-settings-fix-20261115`, com o runtime anterior preservado e backup privado em `/home/<conta-hostinger>/infra-settings-fix-20261115`. Apenas duas consultas no módulo compilado InfraService foram alteradas; 1.175 arquivos conferidos. Testes: 17 unitários, 12 tipos de valores no MariaDB com tabela temporária e isolamento entre tenant/usuário; preferências e orçamento retornaram HTTP 200 após a publicação. Orçamento afetado permaneceu na versão 68, gravada em 15/11/2026 às 16:20:21 UTC (13:20:21 São Paulo). Produção não alterada.

### Publicação da correção de preferências — Infraestrutura em produção, 15/11/2026

A falha de dupla decodificação de `"light"` foi reproduzida no runtime de produção por tabela temporária, sem modificar preferências reais. Publicado somente em `api.orcaproinfra.com.br`, runtime `infra-settings-production-20261115`, com duas substituições SQL no InfraService (consulta e exportação de preferências); os demais 1.091 arquivos compilados permaneceram idênticos. Backup privado do arquivo e configuração em `/home/<conta-hostinger>/infra-settings-production-20261115`; runtime anterior `version-retention-infra-production-20261114` preservado integralmente. Rollback: apontar `hbuilds/current` para esse runtime anterior e reiniciar somente a API Infraestrutura; não há migração ou alteração persistente de dados a reverter.

Verificação: 12 valores JSON em tabela temporária MariaDB e isolamento por tenant/usuário; reprodução original passou após correção; sete endpoints HTTP 200 (preferências, saúde geral/Infra, referências, insumos próprios, composições próprias e orçamento). Preferências existentes preservadas, configuração inalterada, arquivo anterior validado por SHA-256. O ponteiro de runtime e a configuração do OrçaPro em produção continuaram idênticos; desenvolvimento não acessado nesta publicação.


### 2026-11-15 — Infraestrutura: analítico básico e famílias de escavação (desenvolvimento)

- Corrigido o cancelamento/reinício indefinido do analítico básico na consulta do catálogo: a tarefa assíncrona captura a referência de consulta e compara o contexto efetivo do drawer, sem manter `OP.app.base/pj` trocados durante `await`. Fechar o painel/trocar a aba cancela o trabalho. Filtros, CSV e caminhos usam a mesma referência. Nenhuma gravação do orçamento é disparada por essa consulta.
- As 283 composições da família Escavação do SICRO SP 07/2026 foram distribuídas em 25 famílias de navegação (1–13 composições): material, camada final quando aplicável, via e equipamento. Os 308 códigos do grupo Terraplenagem continuam presentes exatamente uma vez, com caminhos localizáveis; o catálogo, coeficientes e preços não são alterados.
- Publicação restrita a `gestaodepredios.com.br/public_html/infraestrutura-editor`: novos assets e substituição atômica do index, preservando assets antigos. Backup privado: `/home/<conta-hostinger>/infra-catalog-dev-20261115/editor-before.tar.gz`, SHA256 `6f73dfcb8f4a8fee139fe32cb0f3972b54c7d4cd62704c6d5579f37a8b189a9f`. Rollback: recuperar index.html desse arquivo; os assets anteriores permanecem disponíveis. API, bancos e produção não foram modificados.
- Verificação: 25 testes direcionados passaram; build Vite concluído; 8 arquivos publicados conferidos por hash; index e 4 assets referenciados conferidos via HTTP 200. Suíte completa: 93/95 passaram. Divergências preexistentes: comparação do IVA com o HTML legado e hash desatualizado de `21_bdi_core.js` no inventário. Comparação adicional com os módulos anteriores à correção confirmou todos os totais, inclusive IVA, idênticos. Hashes do inventário atualizados somente para os dois módulos alterados nesta tarefa.
- Teste visual autenticado pendente de reentrada do usuário no navegador integrado. Evidências e scripts locais em `.runtime/infra-catalog-dev-20261115` (raiz do workspace), teste de regressão novo em `apps/infraestrutura/tests/basic-consultation.test.cjs`.

- Validação visual concluída em 15/11/2026 no navegador integrado, após login e aceite pelo usuário: consulta SP com orçamento QA em AP; composição 5502978 abriu o analítico com 25 linhas, total R$ 6,38, filtro Servente 1/25 mantendo o total; botão Fechar encerrou o painel normalmente. Família 1ª categoria / leito natural / carregadeira apresentou 13 composições; escolha DMT 200–400 m selecionou 5501876, R$ 12,11. Nenhuma composição adicionada ao orçamento. As 25 partições de escavação são apresentadas como 22 árvores e 3 serviços avulsos. Capturas em .runtime/infra-catalog-dev-20261115/analitico-validado.jpg e arvore-validada.jpg, na raiz do workspace. Produção não acessada nem alterada nesta validação.


### 2026-11-15 — Publicação autorizada do analítico e famílias em Infraestrutura produção

- Escopo exclusivo: `/home/<conta-hostinger>/domains/orcaproinfra.com.br/public_html/infraestrutura-editor`. Sem alterações de API, banco, OrçaPro ou desenvolvimento.
- Build da versão anterior (retirando somente as duas correções) comparado com produção: os sete assets coincidem por SHA256; index coincide desconsiderando finais de linha. Build publicado usa `https://api.orcaproinfra.com.br/api/v1`; módulos de cálculo e interface coincidem com os validados visualmente no desenvolvimento.
- Backup privado validado por leitura do tar: `/home/<conta-hostinger>/infra-catalog-production-20261115/editor-before.tar.gz`, SHA256 `36218c5cc81882960ab6b21f2db31e8e36543e447647ca1da5940694fd0da863`. Index anterior também guardado em `index-before.html` nessa pasta. Rollback: repor index anterior atomicamente; assets antigos foram preservados.
- Oito arquivos publicados conferidos por hash; index e quatro assets referenciados confirmados via HTTP 200/hash. Index novo SHA256 `8dd672e5ac76a738ee5c187859ce3f42a479f236352beedfd84273210d9ef31f`. Ponteiros das APIs Infraestrutura e OrçaPro e index do OrçaPro permaneceram iguais.
- Navegador integrado autenticado abriu o orçamento informado pelo usuário; editor carregou até o aviso legal. Teste visual aguardando aceite pelo usuário na aba de produção. Evidências/scripts locais: `.runtime/infra-catalog-production-20261115` na raiz do workspace.

- Validação visual de produção concluída em 15/11/2026 após aceite pelo usuário: 5502978, PR 07/2026, analítico com 25 linhas/3 níveis, custo e soma R$ 6,56, sem linhas não detalhadas ou preços ausentes. Filtro Servente 1/25 preservou total; painel Fechar funcionou. Escavação: 22 árvores somando 280 composições e três avulsos 5501710/5502187/5502820 confirmados (283 preservadas); grupo Terraplenagem continua com 308 composições. Árvore 1ª categoria/leito natural/carregadeira com 13 opções; DMT 200–400 m selecionou 5501876 por R$ 12,41. Total do orçamento permaneceu R$ 33.851.075,92. Nenhuma edição de orçamento ou adição de serviço realizada. Capturas analitico-validado.jpg e arvore-validada.jpg em .runtime/infra-catalog-production-20261115 na raiz do workspace.
# Gestão Contratual — API independente de produção (15/11/2026)

Base: `https://api.orcaprogestaocontratual.com.br/api/v1`. O entrypoint `main-gestao.ts` registra apenas identidade, saúde e Gestão Contratual. Os endpoints operacionais de OrçaPro, Infra e manutenção não estão disponíveis nessa implantação.

- `POST /auth/gestao/login`: no primeiro acesso, valida conta/assinatura prévia em OrçaPro ou Infra e cria identidade independente. A senha local não modifica a origem.
- `GET /auth/gestao/sources`: informa elegibilidade comercial por vínculos verificados do usuário autenticado.
- `POST /auth/gestao/sources`: vincula outro produto após validar a senha e a assinatura desse mesmo e-mail; não aceita tenant livre.
- `GET /contract-management/billing/public/plans`: planos mensal/anual de produção e `requiresExistingSubscription=true`.
- `POST /contract-management/billing/public/register`: recusado em produção; não existe contratação avulsa.
- Checkout: exige assinatura ativa de pelo menos uma origem, preço recorrente BRL do produto próprio e valores R$ 299/mês ou R$ 2.990/ano. A verificação é repetida antes de criar a sessão.
- `POST /contract-management/billing/webhook`: valida assinatura, modo LIVE e cliente próprio; eventos de outros produtos são ignorados antes de qualquer escrita. Modo TEST é recusado.

Demais operações contratuais conservam autorização por tenant, papel, versão/hash e auditoria. Somente a própria API emite suas sessões e altera suas senhas. Ver ADR 0011.
