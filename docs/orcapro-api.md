# OrçaPro — contrato da API e integridade

GET `/api/v1/orcapro/catalog/navigation?referenceId=<UUID>` devolve índice global autenticado de descrições, unidades, cadernos e quantidade de insumos da referência publicada/arquivada solicitada. Não inclui preços nem analíticos. O editor reutiliza a navegação original por macrocategoria → caderno → família → árvore; busca por sinônimos usa o índice em memória. Analíticos e custos são carregados por bundles sob demanda, com referência/UF/regime do projeto. O índice nunca integra o documento privado salvo.

## Gestão SaaS e assinatura individual

Prefixo `/api/v1/orcapro`. `/admin/saas/*` exige administrador global explícito, sessão válida e Origin autorizado nas mutações. OWNER/ADMIN da manutenção recebe 403. DTOs rejeitam campos desconhecidos, incluindo tenantId. IDs UUID validados. Dados operacionais permanecem privados por tenant/proprietário.

| Método/caminho | Contrato |
| --- | --- |
| GET `/admin/saas/users?search&deleted&page&pageSize` | Diretório paginado seguro, vínculos por programa, licença, acesso e proteção global. Sem senha/hash. |
| POST `/admin/saas/users` | name,email,password; organizationName/organizationSlug opcionais em par. Cria REQUESTER OrçaPro somente, teste 30 dias; devolve id e slug de login. |
| PATCH `/admin/saas/users/:id/status` | status ACTIVE/SUSPENDED/DELETED; exclusão recuperável somente OrçaPro, sessões compartilhadas revogadas. |
| POST `/admin/saas/users/:id/password` | newPassword, 10–72 caracteres e até 72 bytes; invalida todos JWT/refresh/reset tokens. |
| POST `/admin/saas/users/:id/revoke-sessions` | Encerra sessões da identidade compartilhada. |
| PUT `/admin/saas/users/:id/subscription` | status, planId opcional, currentPeriodEnd ISO opcional, expectedVersion para licença existente, reason obrigatório. Controle MANUAL, sem cancelar cobrança externa. |
| GET/POST `/admin/saas/plans`, PUT `/admin/saas/plans/:id` | code,name,billingInterval MONTH/YEAR,priceBrl decimal,active,stripePriceId opcional; atualização exige expectedVersion. Preço de plano com Stripe contratado exige novo plano. |
| GET `/admin/saas/stripe` | Booleanos de configuração; nunca devolve segredos. |
| POST `/admin/saas/subscriptions/:id/stripe` | action SYNC/CANCEL_AT_PERIOD_END/RESUME + expectedVersion. SYNC retoma fonte STRIPE; demais alteram renovação externa da assinatura vinculada. |
| GET `/billing`, GET `/billing/plans` | Somente licença própria e planos ativos; acessível mesmo com licença vencida, mas não após suspensão/exclusão OrçaPro. |
| POST `/billing/checkout` | planId ativo; valida valor BRL/intervalo, quantidade 1 e customer individual; sessão aberta reutilizada. Sem cobrança Stripe configurada retorna 503. |
| POST `/billing/portal` | Portal do customer individual próprio, return URL do servidor. |
| POST `/billing/webhooks/stripe` | Público, raw body + stripe-signature obrigatório; consulta remota/deduplicação sem afetar manutenção. |

Auditoria usa saas.user.*, saas.plan.save, saas.subscription.manual/stripe/webhook. Justificativa manual e origem do cliente registradas; senha/hash não registrados. Administradores globais protegidos. Conta de login compartilhada; licença OrçaPro individual não altera Subscription/SaaSPlan da manutenção. Campo maintenanceAccess em `/auth/me` e usuário de login/refresh sinaliza acesso efetivo à manutenção; false impede rotas dela no JwtAuthGuard.

Base: `/api/v1/orcapro`. Autenticação reutiliza os cookies/JWT já existentes. Nenhuma rota altera login, senha, membership ou catálogo SINAPI de manutenção. Swagger registra os DTOs do módulo.

## Configuração e autorização

- `ORCAPRO_ENABLED=true` habilita o módulo; qualquer outro valor deixa todas as rotas OrçaPro em 503.
- `ORCAPRO_ADMIN_USER_IDS` é uma lista explícita de UUIDs de contas existentes. OWNER/ADMIN de manutenção não concedem administração global SINAPI.
- `OrcaproUserAccess.enabled=false` suspende somente OrçaPro para esse usuário em todos os seus tenants. Registro ausente acompanha a habilitação global e membership ativa. Não altera a manutenção.
- Mutações exigem `Origin` exatamente presente em `CORS_ORIGINS`; origem ausente, `null` ou outro domínio recebe 403. Isso também se aplica ao uso de Bearer nas rotas HTTP; os CLIs usam serviços diretamente.
- Limite inicial em memória: 600 solicitações por usuário/minuto, ajustável por `ORCAPRO_REQUESTS_PER_MINUTE` (1–5000), e 10 importações por usuário/minuto. Excesso recebe 429. Instalações com múltiplos processos devem substituir esse contador por armazenamento compartilhado.
- Toda operação privada usa simultaneamente `tenantId` e `ownerUserId` derivados da sessão revalidada. ADMIN continua limitado aos próprios projetos nas rotas normais. Usuário desativado no OrçaPro recebe 403 sem perder acesso à manutenção.

## Rotas de consulta

| Método / rota | Resultado |
| --- | --- |
| `GET /access` | `{enabled:true,role:'ADMIN'\|'USER',userId,tenantId}` |
| `GET /references` | `{items,defaultReferenceId}`; referências publicadas e arquivadas historicamente publicadas |
| `GET /catalog/inputs` | `{items,total,page,pageSize}`; código, descrição, unidade, natureza, preço contextual e atribuição SP |
| `GET /catalog/compositions` | `{items,total,page,pageSize}`; código, descrição, unidade, grupo, `cost`, `costCents`, `fallbackInputs` |
| `GET /catalog/compositions/:code` | Analítico com tipo I/C, código, descrição, unidade, coeficiente, preço e subtotal exatos |
| `GET /catalog/bundle` | `{referenceId,raw,fallbackInputs}`; somente fecho transitivo dos códigos solicitados |

Catálogo exige `referenceId`. `uf=SP`, `regime=SD`, `page=1`, `pageSize=30` são padrões de consulta, sem alterar o contexto de projeto. `search`, `nature` (insumos), `group` (composições, texto exato) são filtros opcionais. `pageSize` máximo 100. Bundle recebe `codes` e `inputCodes` separados por vírgula, máximo 500 raízes somadas; o grafo é limitado a 12 mil composições e 20 mil insumos. Não existe campo de preço atual na composição.

Valores monetários chegam como strings decimais ou strings inteiras em centavos. `null` significa preço indisponível; zero permanece zero. A política preservada é usar SP quando o preço da UF solicitada estiver ausente, com `attributedToSP` e `fallbackInputs` explícitos. UF desconhecida é rejeitada. Coeficientes são persistidos com 12 casas e o custo reproduz o legado: escala 10⁸ e truncagem de cada parcela em centavos, inclusive subcomposições.

## Projetos e versões

| Método / rota | Entrada / resultado |
| --- | --- |
| `GET /projects?archived=false` | Lista os últimos 200 projetos ativos do proprietário; `archived=true` lista arquivados |
| `POST /workspace/open` | `{id}` do orçamento ativo privado mais recente; primeira entrada cria uma cópia privada de `EDIFICIO_4_PAVIMENTOS` ou orçamento vazio no padrão publicado quando o exemplo não existe |
| `POST /projects` | `{name,referenceId?,uf?,regime?,data?}`; resolve o padrão uma única vez quando a referência for omitida |
| `POST /projects/import` | Mesmos campos; `referenceId` e `data` obrigatórios, nunca assume referência histórica pelo padrão |
| `GET /projects/:id` | `{id,name,referenceId,uf,regime,version,data,...}` |
| `GET /projects/:id/context` | `{project,raw,fallbackInputs,historicalFixedCodes}`; `project.data` é o documento legado privado |
| `PUT /projects/:id` | `{expectedVersion,data,name?,referenceId?,uf?,regime?}`; retorna a versão incrementada |
| `GET /projects/:id/calculation` | Resumo recalculado no servidor por runtime isolado e fonte preservada/checksummed |
| `GET /projects/:id/export` | Envelope JSON com referência explícita e apenas dados privados |
| `GET /projects/:id/versions` | Últimas 200 versões, sem dados de outro proprietário |
| `POST /projects/:id/restore` | `{expectedVersion,version}`; cria nova versão e pode restaurar referência histórica arquivada |
| `DELETE /projects/:id` | `{expectedVersion}`; arquivamento com snapshot e auditoria |
| `POST /projects/:id/unarchive` | `{expectedVersion}`; restauração do projeto arquivado, snapshot e auditoria |

Todos os IDs internos e o contexto do documento são canonizados no servidor. Documento privado não aceita catálogo oficial incorporado, IDs contendo HTML/aspas, chaves de protótipo, revisões textuais, vínculos com identificadores inseguros, EAP inválida, ciclos próprios, números não finitos ou quantidades negativas. Limites: 15 MiB de JSON, 250 mil valores percorridos, profundidade 80 e 10 mil cadastros de cada tipo. HTML em descrições/notas permanece texto e precisa de escape no consumidor.

Um código de outra base não é convertido em SINAPI por coincidência. Itens históricos com custo explícito, descrição e memórias mantêm o preço informado quando não há registro oficial; o contexto relata `historicalFixedCodes`. Quando o analítico existe, é hidratado para preservar produtividade, recursos e relatórios. Uma raiz sem preço explícito ausente é rejeitada; relações analíticas pendentes nunca são ignoradas.

## Análises privadas de riscos

Prefixo `/projects/:projectId/risks`, sob `/api/v1/orcapro`; mesmas regras de autenticação, Origin, licença, tenant e proprietário do orçamento. Swagger atualizado. Leituras vêm do documento privado do projeto. Todos os corpos exigem `expectedVersion`.

| Método / rota | Corpo e regra |
| --- | --- |
| `POST /` | `{expectedVersion,name}`; fotografia autoritativa da versão atual |
| `PUT /:riskId` | `{expectedVersion,config}`; valida premissas e invalida resultado |
| `POST /:riskId/simulate` | `{expectedVersion}`; reproduz versão histórica em worker |
| `POST /:riskId/bdi-preview` | `{expectedVersion,method,mode,confirmDoubleCounting?}`; reexecuta e calcula prévia sem mutação |
| `POST /:riskId/bdi-apply` | Mesma prévia e `reason` obrigatório; aplica BDI com snapshot e auditoria |

`method`: param/exato/simples; `mode`: replace/add. Fotografias desatualizadas bloqueiam BDI com 409. O PUT geral não aceita alterações em `data.risks`. Clone/importação como novo projeto inicia sem fotografias do projeto original. Matemática, configuração, limites e reprodução: [orcapro-risks.md](orcapro-risks.md).

## Templates e cadastros privados

- `GET /templates` retorna os exemplos públicos `DEMO_SMALL` e `EDIFICIO_4_PAVIMENTOS`.
- `POST /templates/:id/clone {name?,uf?,regime?}` cria projeto privado, fixa referência e registra ID/versão do template. Não copia o catálogo oficial.
- `PUT /templates/:id` é somente ADMIN, usando `SaveProjectDto` e versão esperada. Projetos já clonados mantêm seus próprios snapshots.
- `GET /custom-inputs` e `/custom-compositions` retornam as últimas revisões da biblioteca privada, com `row.data` no formato legado.
- `POST /custom-inputs` e `/custom-compositions {data}` são publicação explícita na biblioteca privada. Cada alteração cria revisão; não altera snapshots de projetos existentes.
- `POST /custom-compositions/from-sinapi/:code {referenceId}` cria cópia privada com `originType`, `originCode`, `originReferenceId`, `originCompositionId` e os campos de proveniência no documento.
- Cópias criadas pelo editor podem enviar `origin_reference_id` e `origin_code`; o servidor verifica os registros oficiais e mantém proveniência anterior. Origem numérica sem referência verificável do legado fica `LEGACY_UNVERIFIED`, sem referência fabricada.
- Salvar um projeto guarda seu snapshot próprio e **não publica a biblioteca**. Criar/importar projeto apenas acrescenta cadastros ainda inexistentes; não reverte revisões mais recentes da biblioteca.

## Administração global

| Método / rota | Regra |
| --- | --- |
| `GET /admin/references` | Inclui DRAFT/VALIDATED e históricos |
| `POST /admin/imports` | `{raw,sourceName,revision}`; importação normalizada transacional em DRAFT |
| `POST /admin/imports/file` | Multipart `file` XLSX e `revision`; usa o parser original protegido |
| `POST /admin/references/:id/validate` | Confere grafo, códigos, grade de preços e integridade; DRAFT → VALIDATED |
| `POST /admin/references/:id/publish` | VALIDATED → PUBLISHED; não altera padrão nem projetos |
| `POST /admin/references/:id/archive` | PUBLISHED → ARCHIVED; bloqueia arquivamento do padrão e preserva leituras históricas |
| `PUT /admin/default-reference {referenceId}` | Somente PUBLISHED; ponteiro separado, sem UPDATE em projetos |
| `GET /admin/logs?page&pageSize` | `{items,total,page,pageSize}`; auditoria administrativa explícita |
| `GET /admin/users?page&pageSize` | Nomes/e-mails, status de manutenção somente para consulta e habilitação/papel OrçaPro |
| `PATCH /admin/users/:id/access {enabled}` | Ativa/desativa somente OrçaPro; administrador não pode suspender a si mesmo |

Referências publicadas não têm rota de alteração de estruturas ou preços. Correções exigem nova revisão `(ano,mês,revisão)`. Default/arquivamento usam lock transacional das configurações e referência. FKs oficiais e privadas usam RESTRICT; nenhuma exclusão física é exposta.

XLSX: limite comprimido 40 MiB, descomprimido acumulado 256 MiB, 96 MiB por entrada, 2048 entradas, razão máxima 250 quando a entrada excede 1 MiB e limite de 120 segundos verificado a cada bloco de leitura. Valida diretório central, assinaturas, limites, nomes, duplicidades, criptografia e método; ZIP64 é recusado. A leitura também limita bytes **reais**, incluindo `usize` declarado falso. O limite temporal não encerra forçadamente um bloco síncrono do parser; isolamento em worker com cancelamento de CPU é evolução futura. O arquivo é processado em memória e descartado; registram-se SHA-256 do arquivo e do raw normalizado, nome, estatísticas e autoria. O raw anexado com 6.120 insumos gera 495.720 preços para 27 UFs e três regimes, sem registros por usuário.

## CLIs e verificação

CLIs são explícitos e ficam fora do seed automático de manutenção. Exigem `DATABASE_URL` selecionada pelo operador; nunca executá-los apenas para inspecionar produção.

```powershell
npx tsx apps/api/scripts/orcapro-admin.ts --email=andrebaeta@hotmail.com
npx tsx apps/api/scripts/orcapro-seed.ts --confirm-orcapro-seed --admin-email=andrebaeta@hotmail.com
npx tsx apps/api/scripts/orcapro-verify.ts
```

O bootstrap resolve conta ativa já existente e informa UUID para `ORCAPRO_ADMIN_USER_IDS`; não altera senha, papéis ou status de manutenção. Conta inexistente requer convite/verificação pelo fluxo seguro existente. Seed aceita alternativamente `--admin-user-id` ou `ORCAPRO_SEED_ADMIN_USER_ID`, publica a base inicial e cria os dois templates. Segunda execução preserva dados existentes e o padrão escolhido pelo administrador. `orcapro-verify` somente lê MySQL e confronta a hidratação parcial com os dois baselines integrais.

O pipeline Hostinger pode executar esse seed **somente por opt-in**: `ORCAPRO_SEED_ON_DEPLOY=true` e `ORCAPRO_SEED_ADMIN_USER_ID` de conta existente autorizada. O padrão é false. O wrapper `scripts/orcapro-deploy-seed.mjs` fica após o seed de manutenção e não altera seu código/dados. Após a carga inicial, retornar o flag a false; seeds futuros de referências exigem decisão administrativa explícita. O comando `npm run orcapro:seed -w @gestaopredios/api -- --confirm-orcapro-seed` é equivalente ao CLI acima. Habilitar o produto em produção continua separado do seed.

## Evidências e limites

As três migrations adicionais foram aplicadas em MySQL 8.4 isolado. Seed global foi executado duas vezes. Regressão: todas as 10.547 composições em SP/DF e cinco combinações de regime, e os dois projetos com hidratação parcial MySQL comparados integralmente às fixtures. Os dados complementares e motores legados continuam preservados em JSON/runtime; isso não significa que todos os módulos fiscais, cronogramas e relatórios já foram normalizados em tabelas relacionais próprias. O resumo é recalculado no servidor; persistência de relatórios pesados e storage externo são etapas posteriores. Publicação na Hostinger exige validação e promoção explícitas do checkout, sem substituir a manutenção.
