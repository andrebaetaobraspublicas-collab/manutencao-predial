# API OrçaPro Infraestrutura

Prefixo `/api/v1/infraestrutura`. Implantação desta entrega somente em DEV. Controllers NestJS expõem as rotas no Swagger existente. Este contrato complementa os schemas de validação de `infra-domain.ts`; campos desconhecidos em corpos privados são recusados.

Datas de metadados retornam instantes UTC em ISO8601. Janelas de login, bloqueios e retenção usam a mesma referência UTC, independentemente do fuso do processo que executa a API ou os CLI.

## Identidade e segurança

Sessão central em cookies HttpOnly `gp_access` e `gp_refresh`. O servidor deriva `userId` e `tenantId` do principal autenticado; nenhum projeto aceita proprietário/tenant enviado pelo cliente. Perfil local ativo é obrigatório. Papéis `USER` e `ADMIN` são independentes do papel de manutenção. Administração global pode consultar diretório de contas para concessão, mas não torna projetos ordinários públicos.

`GET access` retorna `{enabled,userId,tenantId,name,email,role,status,csrfToken}` e define `infra_csrf` HttpOnly. Enviar `X-Infra-CSRF` em toda mutação autenticada, com credenciais e `Origin` permitido. O token HMAC está vinculado à sessão de acesso atual; após refresh, repetir o bootstrap. A origem deve corresponder à lista do ambiente. HTTPS é exigido quando `COOKIE_SECURE=true`.

O login específico tem `GET auth/csrf` e `POST auth/login` com `{email,password,tenantSlug?}`. Ambos exigem origem permitida; o POST precisa de `X-Infra-Login-CSRF` recebido no GET e do cookie próprio. Reutiliza a senha central. Mais de um vínculo Infraestrutura ativo exige selecionar organização. Cinco tentativas por minuto por IP/e-mail são persistidas com chaves HMAC; cinco falhas bloqueiam15 minutos. O retorno contém os cookies de sessão central.

Enquanto `INFRA_ENABLED=true`, um interceptor global aplica os mesmos buckets às entradas de senha compartilhadas `/api/v1/auth/login` e `/api/v1/auth/orcapro/login`, incluindo alias `/api/v1/orcapro/auth/login`, maiúsculas e barra final. Trocar de rota não reinicia a quota ou o bloqueio. Esses clientes preservam seus corpos e cookies e precisam de `Origin` permitido; não recebem exigência de um novo cookie CSRF. A rota Infraestrutura já contabiliza a tentativa uma vez e fica fora do interceptor. Erros401 incrementam falhas; outros erros não apagam contadores. Com o produto desativado, o interceptor não consulta seu banco nem altera login dos programas existentes. Buckets HMAC inativos por sete dias são removidos pelo expurgo, preservando bloqueios ainda vigentes.

`GET health` é público e devolve503 se o produto estiver desativado, sem banco disponível ou sem migration registrada. Não expõe nomes, credenciais ou erros SQL. Desabilitar o produto não muda a saúde dos outros módulos.

## Catálogo global e importação

| Método/rota | Contrato |
| --- | --- |
| `GET cycles` | `{items:[{id,source,uf,ref,status,contentHash,rawSize,publishedAt}]}`. Referências publicadas; arquivadas somente quando vinculadas a projeto próprio. |
| `GET cycles/:id/snapshot` | JSON raw SICRO **direto**, sem envelope. Gzip HTTP, ETag SHA-256 e cache privado. `If-None-Match` pode produzir304. |
| `GET cycles/:id/pem` | JSON PEM direto `{names,pem,obs}`, com gzip/ETag. |
| `GET cycles/:id/compositions` | Busca paginada por código/descrição/grupo; `{items,total,page,pageSize}`. `total` é string decimal. |
| `GET cycles/:id/pem/:code` | `{code,data:{sheet,obs,names},version}`. Código identifica a ficha PEM, não posição no vetor de composições. |
| `GET admin/cycles` | Todas as referências, incluindo `importStatus` e relatório `validation`. |
| `POST admin/cycles` | `{uf,ref,expectedChunks,expectedBytes,contentHash,files?}`; cria DRAFT/UPLOADING. Referência `AAAA-MM`, hashhex64, máximo40 MB e1.000 lotes. |
| `POST admin/cycles/:id/chunks` | `{index,dataBase64,sha256,encoding}`. Índices0..N−1; `encoding` utf8/gzip. Envelope e fragmento descompactado até2 MB. Reenvio idêntico é idempotente; fragmento distinto no mesmo índice dá409. |
| `POST admin/cycles/:id/finalize` | Verifica tamanho/contiguidade e marcaQUEUED; não confere a base completa no HTTP. |
| `POST admin/cycles/:id/publish` | Somente DRAFT/PASSED com snapshot completo; torna a versão imutável. |
| `POST admin/cycles/:id/archive` | Preserva versão e projetos anteriores; deixa de oferecer a novos projetos. |
| `DELETE admin/cycles/:id` | Somente rascunho sem uso e fora da fila/processamento. Não exclui catálogo publicado. |

Payload administrativo é UTF-8 `JSON.stringify({raw,pem})`, opcionalmente com `example`. `expectedBytes` e `contentHash` medem **o JSON completo descompactado**. Dividir seus bytes em fragmentos, comprimir cada fragmento separadamente e calcular `sha256` de cada fragmento **antes da compressão**. Base64 só transporta os bytes. O servidor guarda fragmentos decodificados, une-os no CLI, confere hash completo e valida o motor original contra todos os custos oficiais. O snapshot servido contém só `raw`; seu ETag é o hash desse JSON, distinto do hash do bundle. Cada raw contém exatamente uma UF correspondente ao ciclo: o motor SICRO preservado usa índice estadual0, portanto bundles com múltiplas UFs são recusados.

Importação transita UPLOADING→QUEUED→PROCESSING→PASSED/FAILED. Diagnósticos persistidos são controlados e não contêm erro bruto SQL/JSON. O cron finito usa `GET_LOCK` de conexão para excluir workers concorrentes e retomar PROCESSING interrompido com lotes. Normalização, snapshot e statusPASSED gravam na mesma transação. Nenhum custo inconsistente pode ser publicado. PEM acompanha o ciclo; nesta entrega não existe biblioteca global de PEM editável que altere versões publicadas.

## Projetos, versões e migração

Envelope detalhado: `{id,name,cycleId,uf,regime,version,createdAt,updatedAt,deletedAt,data}`. `data` conserva o projeto legado inteiro, inclusive orçamento/EAP, próprios, BDI, tributação, cronograma, PEM e riscos. Até20 ×1024² bytes JSON UTF-8 para `data`; parser específico permite22 MB para o envelope. Contexto e ID são normalizados no servidor. Não se recompilam custos ao salvar.

| Método/rota | Contrato |
| --- | --- |
| `POST workspace/open` | Retoma o projeto próprio mais recente ou cria uma cópia única do exemplo do ciclo publicado mais recente. Lock do perfil evita duplicação por duas abas. |
| `GET projects?trash=true` | `{items}` com metadados privados, sem grandes documentos. Sem `trash`, mostra ativos. |
| `POST projects` | `{cycleId,name?,uf?,regime?,data?,example?}`; ciclo publicado, UF disponível e regimeSD/CD/SE. |
| `GET projects/:id` | Envelope detalhado somente do proprietário/tenant. Outro usuário recebe404. |
| `PUT projects/:id` | `{version,name?,uf?,regime?,data}`; ciclo imutável nesta rota. Comparação atômica de versão; conflito409 com `currentVersion/updatedAt`. |
| `DELETE projects/:id` | `{version}` para lixeira; `POST .../unarchive` com versão restaura. |
| `POST projects/:id/duplicate` | `{name?}`; copia documento privado para novoUUID, sem duplicar catálogo. |
| `GET projects/:id/versions` | Metadados de versões retidas. `POST .../restore/:version` com `{version:versãoAtual}` cria nova revisão histórica. |
| `POST projects/:id/migrate-cycle` | Primeira chamada `{cycleId,version,dryRun:true}`; aplicação exige `{cycleId,version,dryRun:false,confirmationToken}`. |

O comparativo retorna `report.before/after` com totais, prazo e `iva` (`year`, `creditCents`, `ibsCents`, `cbsCents`, `complete`, `known`, `missing` e demais métricas do motor original); `report.items` contém quantidades, custos anteriores/novos e deltas. Créditos incompletos são identificados como parciais, nunca tratados como totais determinados. Worker Thread usa o motor original, timeout35 s, memória256 MB e uma comparação simultânea por API. O token HMAC vincula o relatório, usuário/tenant, ciclos e versão atual por10 minutos. A aplicação valida de novo o relatório e recusa custos ausentes; cria versão e auditoria e atualiza `data.sicroCycleId`. Preferência por ciclo publicado mais recente afeta só projetos novos; históricos mantêm sua referência.

### UF/data-base no editor e comparação por estado

Os seletores de **UF, data-base e regime da consulta** em Catálogo SICRO, Insumos e Composições têm estado transitório independente do orçamento. Selecionar outra referência publicada solicita somente o snapshot autorizado (GET/ETag), sem flush, migração, gravação do projeto ou recálculo da obra. O cabeçalho continua mostrando o preço total do orçamento e a tela explicita ambas as referências. Filtros, paginação, árvores, CSV e gavetas de composição/IVA usam o contexto consultado. Adicionar um serviço ou insumo usa seu código na referência do orçamento; códigos inexistentes nela são recusados. Edição de próprios continua no catálogo privado, com preços por UF/mês e sem alterar a referência oficial. Premissas tributárias nas gavetas de consulta são somente leitura; edite o cenário da obra em Reforma Tributária.

**Somente no menu Orçamento**, os seletores de UF e data-base abrem o comparativo versionado acima. Cancelar preserva a referência; **Aplicar ao orçamento** troca o ciclo e cria uma nova versão. A aplicação recarrega SICRO/PEM e invalida os caches de preços, produtividade e IVA; quantidades, cotações, preços fixos, planejamento, BDI e premissas tributárias são preservados. Fotografias de risco anteriores conservam sua base histórica. Nas outras telas de planejamento, UF/data-base do projeto aparecem sem permitir migração. O ano do IVA é independente do mês SICRO.

A gaveta inclui **Preços por UF**, com mínimo, mediana, máximo e barras por estado na mesma data-base. Valores são referenciais sem BDI, DMT/FIT, PEM ou substituições de FIC/preços oficiais específicas da obra. SD lê `raw.comp.o`, o total do relatório importado. CD e detalhes analíticos reutilizam `_calc` do motor original, com arredondamento BigInt inalterado, avaliando apenas o código solicitado e suas dependências. Uma instância e caches separados impedem contaminação do motor do orçamento; bases recentes de consulta são mantidas em cache limitado na sessão. Próprios usam suas cotações explícitas por UF/mês. Snapshots continuam autorizados a cada carregamento, inclusive ETag/304; nenhum catálogo é duplicado no banco por usuário. Códigos/preços ausentes aparecem como indisponíveis. **Clicar numa barra de UF abre consulta, inclusive a partir do Orçamento, e nunca abre/aplica migração.**

Rollback: retornar os artefatos frontend/API anteriores. Nenhum schema, preço oficial ou projeto existente é alterado pela publicação deste recurso; migrações confirmadas podem ser recuperadas pelo histórico normal do projeto.

Histórico gzip retém100 versões por padrão, configurável10..500 por projeto. Uma referência arquivada pode continuar sendo usada/restaurada por projeto já vinculado, nunca substituída silenciosamente. A UF do projeto deve ser igual à UF do ciclo; trocar de estado requer migração para outra fotografia estadual. Referências no banco são normalizadas `AAAA-MM`, preservando ordenação cronológica por ano/mês; o raw mantém a representação original `MM/AAAA`. O padrão de abertura é a referência publicada mais recente por competência, com desempate por UF/data de publicação/ID; não muda projetos já existentes.

## Próprios, preferências e administração

`GET me/inputs` e `GET me/compositions` retornam `{items:[{code,data,revision,updatedAt}]}`. POST usa `{code,data,revision?}`; PUT por `/:code` usa `{data,revision}`; DELETE usa `{revision}`. Documento até2 MB, revisão otimista e código seguro. São privados por usuário+tenant e não mudam SICRO/PEM oficiais. `GET settings` devolve mapaid→valor; `PUT settings` aceita `{id,v}`.

| Administração | Contrato |
| --- | --- |
| `GET admin/users` | Perfis locais sem senhas/hashes. |
| `GET admin/accounts?search=...&page=...` | Diretório central mínimo,30 registros/página: usuário/tenant/nome/e-mail/organização/slug. |
| `POST admin/users` | `{name,email,password,organizationName?,organizationSlug?,role?,status?}`. Nova identidade; conta existente precisa concessão. Nome e slug de organização juntos ou ambos vazios. |
| `POST admin/users/grant` | `{userId,tenantId,role,status}`; IDs resolvidos pelo diretório e vínculo conferido no servidor. Não altera licença de outro produto. |
| `PATCH admin/users/:id` | `{tenantId,role,status}`; ACTIVE/PENDING/BLOCKED eADMIN/USER. |
| `DELETE admin/users/:id` | `{tenantId}`; arquivamento local recuperável, sem pedido LGPD automático. |
| `POST admin/users/:id/password` | `{newPassword}`;10..72 caracteres e até72 bytes UTF-8; senha central compartilhada, sessões/tokens revogados. |
| `GET admin/projects/:id` | Consulta global somente leitura com auditoria obrigatória; não modifica acesso ordinário aos projetos. |
| `GET admin/audit`, `GET admin/stats` | Eventos paginados e contagens globais do produto. |
| `PUT admin/policies/:privacy\|terms` | `{text,version?}`; texto até100.000 caracteres, versão otimista. `GET policies` disponível aos usuários ativos. |

Administradores iniciais configurados são protegidos contra remoção/bloqueio/despromoção. A própria senha usa o fluxo central adequado. Diretório administrativo é a única concessão que admite seleção explícita de tenant; dados operacionais continuam derivados do token. Criação em dois bancos utiliza transação central e compensação de perfil local em falha de commit, sem prometer atomicidade distribuída. Senha tem auditoria autoritativa na mesma transação central e intenção local; se somente a cópia local da conclusão falhar, retorna sucesso com `localAuditPending:true`, evitando indicar falha após a senha já ter sido alterada.

## LGPD e recuperação

`GET me/export/archive` é download `.json.gz` por streaming e inclui projetos/lixeira, todas as versões retidas, próprios excluídos, preferências e auditoria do usuário/tenant. Não inclui hash de senha, dados alheios ou catálogo global. A resposta usa `application/gzip`, sem `Content-Encoding`, para preservar o arquivo. `GET me/export` é resumo compatível que aponta ao arquivo completo.

`DELETE me/data` exige `{confirm:'EXCLUIR MEUS DADOS'}`. Revoga o perfil e registra expurgo agendado; resposta informa `retentionDays/scheduledErasureAt`. Prazo padrão30 dias, configurável1..365. O CLI remove dados privados após esse prazo e anonimiza conteúdo/referências pessoais da auditoria no mesmo escopo. Outro tenant do mesmo usuário é preservado. Conta apenas bloqueada pelo administrador não é expurgada. Identidade central e outros produtos são preservados. Backups antigos têm retenção14 dias adicionais até expirar. Termos/privacidade iniciais são rascunhos editáveis, não parecer jurídico.

Operação e rollback: [infraestrutura-deploy.md](infraestrutura-deploy.md). Decisão de arquitetura: [ADR 0009](adr/0009-infraestrutura-banco-independente-identidade-compartilhada.md).
