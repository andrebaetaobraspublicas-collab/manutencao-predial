# OrçaPro — desenvolvimento, produção e migração integral

Decisão do proprietário em 03/10/2026: desenvolvimento em `www.gestaodepredios.com.br`;
produção comercial em `sistema.orcaproobras.com.br`; apresentação/vendas em
`orcaproobras.com.br`. O sistema anterior do subdomínio de produção será inativado
após backup recuperável e validação do OrçaPro. Sua inativação não autoriza excluir
fisicamente bancos, arquivos ou usuários históricos.

## Aplicações e isolamento

| Recurso | Desenvolvimento | Produção comercial |
| --- | --- | --- |
| Frontend | `www.gestaodepredios.com.br` | `sistema.orcaproobras.com.br` |
| API | `api.gestaodepredios.com.br` | `api.orcaproobras.com.br` |
| Origem web | Branch Hostinger `main` | Artefato estático do SHA aprovado, enviado por SSH |
| Origem API | Branch Hostinger `deploy-api` | Source do SHA aprovado, build Linux privada enviada por SSH |
| GitHub environment | `production` (nome histórico) | `orcapro-production` |
| Promoção | CI aprovada de push `main` | `workflow_dispatch` com SHA completo aprovado |
| MySQL | Banco existente de desenvolvimento | Banco novo, exclusivo da produção |
| Uploads | Diretório privado da API de desenvolvimento | Diretório privado próprio da nova API |
| Stripe | Chaves/preços/webhook em modo teste | Chaves/preços/webhook em modo produção |

O espelho é uma cópia inicial verificada. Os bancos passam a evoluir independentemente:
não há replicação contínua nem escrita de desenvolvimento na produção. Senhas dos usuários
são preservadas como hashes; não precisam ser redefinidas para a mudança de domínio.
Manter segredo JWT distinto, cookies no domínio correspondente e sessões próprias por ambiente.

A aplicação web permanece exportação estática React/Next, saída `apps/web/out`,
`HOSTINGER_STATIC_EXPORT=1`, sem entry file. Em produção, o workflow constrói essa
saída em Node 24 no GitHub e envia o artefato para a raiz estática Hostinger.
A API usa Other/Node 22, entry `main.js`, com runtime privado em
`hbuilds/current/nodejs`. O wrapper carrega explicitamente `hbuilds/config/.env`
e inicia `apps/api/dist/main.js`. O `public_html` da API contém somente a configuração
Passenger, nunca source, segredos ou uploads. Nenhum OAuth/autodeploy Hostinger é
necessário para a promoção comercial; o desenvolvimento conserva sua integração atual.

## Inventário de configuração

GitHub environment **orcapro-production** — variables, sem valores secretos:

| Nome | Configuração |
| --- | --- |
| `HOSTINGER_SSH_HOST` | Host SSH da conta que hospeda a produção |
| `HOSTINGER_SSH_PORT` | Porta SSH observada no hPanel |
| `HOSTINGER_SSH_USER` | Usuário SSH dessa conta |
| `HOSTINGER_API_DOMAIN` | `api.orcaproobras.com.br` |
| `HOSTINGER_WEB_DOMAIN` | `sistema.orcaproobras.com.br` |
| `HOSTINGER_READY_URL` | `https://api.orcaproobras.com.br/api/v1/health/ready` |
| `HOSTINGER_WEB_BASE_URL` | `https://sistema.orcaproobras.com.br` |
| `HOSTINGER_PUBLIC_API_URL` | `https://api.orcaproobras.com.br/api/v1` |

Secrets: `HOSTINGER_SSH_PRIVATE_KEY` e `HOSTINGER_SSH_KNOWN_HOSTS`. Fixar a chave
do servidor já verificada; o workflow exige `StrictHostKeyChecking=yes`. Não copiar
os secrets para código, PRs, prints, logs ou documentação.

API Hostinger de produção:

- `DATABASE_URL`: usuário/senha novos e URL-encoded, banco novo da conta de produção;
- `WEB_BASE_URL=https://sistema.orcaproobras.com.br`;
- `API_BASE_URL=https://api.orcaproobras.com.br`;
- `CORS_ORIGINS=https://sistema.orcaproobras.com.br`;
- `COOKIE_DOMAIN=.orcaproobras.com.br`, `COOKIE_SECURE=true`;
- `JWT_ACCESS_SECRET`: segredo aleatório exclusivo desse ambiente;
- `UPLOAD_ROOT`: caminho privado persistente fora de `public_html` e `.builds`;
- `SEED_MAINTENANCE_ON_DEPLOY=false` e `ORCAPRO_SEED_ON_DEPLOY=false`;
- `ORCAPRO_ENABLED`, `ORCAPRO_ADMIN_USER_IDS` e parâmetros de operação revisados;
- `ORCAPRO_STRIPE_SECRET_KEY`, `ORCAPRO_STRIPE_WEBHOOK_SECRET`: conta Stripe de produção
  e segredo específico do endpoint OrçaPro;
- notificações/e-mail inicialmente desligados até revisar a fila copiada e destinatários.

Na produção exclusiva OrçaPro, configurar o gate de produto no backend e
`NEXT_PUBLIC_ORCAPRO_ONLY=true` no frontend. Ocultar a manutenção no navegador não
substitui bloquear seu onboarding público no servidor. A API continua exigindo
tenant e permissões nas rotas existentes. O ambiente de desenvolvimento preserva
a entrada independente dos dois programas.

Frontend: `NEXT_PUBLIC_API_URL=https://api.orcaproobras.com.br/api/v1` e as variáveis
públicas de identidade/retorno comercial. O valor da API é incorporado à build e ao
editor; mudar só o ambiente da API não atualiza o frontend. Segredos Stripe ficam
exclusivamente no backend. Gestão manual de usuários, senhas e assinaturas permanece
disponível sem Stripe; um webhook não sobrescreve licença com fonte manual.

## Backup anterior e cópia nova

1. Registrar commit, domínios, DNS, configuração dos Web Apps e caminhos persistentes.
   Guardar os segredos em armazenamento privado restrito, sem exibi-los.
2. Preservar o **sistema anterior de produção** inteiro: artefato/source, configuração,
   bancos, diretórios de dados e uploads. Se houver SQLite em uso, usar SQLite backup
   API ou pausar o processo para copiar banco/WAL/SHM consistentemente; copiar apenas
   `.db` de aplicação ativa pode perder transações. Gerar SHA-256 e manter cópia fora
   da hospedagem. Não arquivar sob `public_html`.
3. Provisionar API, DNS/TLS e um **banco novo vazio** com usuário exclusivo. Não importar
   em nenhum banco do sistema anterior. Banco e uploads de desenvolvimento continuam
   intactos.
4. Impedir gravações de desenvolvimento durante a fotografia final (incluindo workers),
   ou coordenar janela controlada. Dump e manifestos precisam representar o mesmo
   instante lógico; snapshots consistentes separados não garantem igualdade se a
   aplicação continuar recebendo alterações entre eles.
5. Exportar todos os dados/tabelas e `_prisma_migrations` com `mysqldump` consistente:
   `--single-transaction --quick --hex-blob --routines --triggers --events`, charset
   `utf8mb4`, sem `--databases` para não incluir seleção/criação do schema de origem.
   Usar arquivo de credenciais mode 600 ou ambiente privado; não incluir senha em
   argumentos/logs. Conferir privilégios, engine transacional e compatibilidade das
   versões MySQL/MariaDB/definers. Compactar, calcular SHA-256 e testar restauração.
6. Copiar o diretório privado de uploads, preservando nomes/chaves/permissões. Gerar
   hash de cada arquivo. Nunca incluir arquivos privados em exportação pública web.
7. Importar somente no banco novo vazio, validar schema/ledger/counts/hashes/FKs e
   comparar uploads. Não executar seed demonstrativo sobre o espelho.
8. Desligar os workers de desenvolvimento que poderiam enviar notificações reais ou
   cobrar via Stripe. Após o espelho, desenvolvimento usa Stripe teste. Auditar
   notificações pendentes/sessões copiadas antes de habilitar worker na produção.

Os scripts antigos `backup-mysql.ps1` e `verify-mysql-restore.ps1` continuam disponíveis
para backup/restauração descartável; o segundo verifica apenas presença de tabelas e
deve ser complementado pela comparação abaixo. A restauração descartável só aceita
nome contendo `restore`, `staging` ou `test`, protegendo o banco operacional.

## Verificação de um espelho

`scripts/verify-deployment-mirror.mjs` é somente leitura no banco. Captura, em uma
transação consistente/READ ONLY, estrutura das tabelas, digest de **todos** os registros
ordenados pela chave primária, counts, definição das FKs e número de órfãos. Inclui
hashes/tamanhos/chaves de todos os uploads privados; recusa symlinks. Representa cada
campo por HEX da representação binária do banco, distinguindo NULL, vazio e zero,
sem converter DECIMAL para float nem imprimir registros, hashes de senha ou credenciais.
O manifesto é criado com mode 600 e não sobrescreve um arquivo existente. Windows
exige também diretório com ACL restrita. Guardar manifestos fora do repo/pasta pública.

Exemplo, em shell que já recebeu `DATABASE_URL` secretamente:

```text
node scripts/verify-deployment-mirror.mjs capture --output <manifesto-privado.json> --uploads <UPLOAD_ROOT>
node scripts/verify-deployment-mirror.mjs compare <manifesto-origem.json> <manifesto-destino.json>
```

No SSH, usar Node compatível e `--runtime-root <diretório-nodejs>` quando o script foi
copiado para um diretório privado fora da aplicação. A dependência `mariadb` vem do
runtime do projeto. `ORCAPRO_SNAPSHOT_DATABASE_URL` pode selecionar explicitamente
a conexão; nunca passe a URL na linha de comando.

O resultado precisa ser `identical`. Nome do schema e horário podem ser diferentes;
estrutura, registros, FKs e arquivos devem ser iguais. O script recusa views, tabela
sem PK e referência para outro schema: essas estruturas exigem revisão explícita,
não aprovação silenciosa. Rotinas/eventos/triggers/definers adicionais devem ser
inventariados e validados no dump; o verificador não substitui esse passo.
Repetir a comparação **antes** de login, migrações novas ou alterações operacionais
no destino; depois, alterações esperadas geram novo baseline documentado.

## Promoção e smoke

1. Concluir CI do push `main` escolhido. Registrar SHA completo; CI de PR não basta.
2. Confirmar cópias/restore, seeds desligados, domínio/SSL/CORS/cookies e ambiente
   GitHub `orcapro-production`. Provisionar a API Other/Node 22 com `main.js` e
   `PassengerAppRoot` apontando para `hbuilds/current/nodejs`; guardar `.env` mode 600
   em `hbuilds/config`, uploads fora da raiz pública. A API pode começar com um
   bootstrap 503 sem dados até o runtime completo estar validado.
3. Executar `Promote OrçaPro commercial production` com `release_sha`. O workflow
   exige commit pertencente a `main` e CI bem-sucedida desse SHA, confere isolamento,
   constrói os dois artefatos antes de carregar secrets SSH, verifica hashes e recusa
   links/traversal no tar. A API é instalada em uma versão privada imutável,
   recompilada no Node 22 Linux, aplica migrations e **não executa seeds**. O ponteiro
   `hbuilds/current` só muda depois da build e verificações; somente o Passenger da API
   de produção é reciclado. Readiness exige release exata e banco reachable.
4. Na primeira publicação, após readiness da API, converter o Web App anterior para
   frontend React/estático no hPanel e confirmar `public_html` real, sem diretivas
   Passenger. Somente então criar o marcador privado de operação
   `public_html/.orcapro-static-root`. O workflow espera esse gate por até dez minutos.
   Renomeia o document root anterior para `hbuilds/manual-web/previous-<release-id>`
   e instala o artefato validado como novo `public_html`. Uma falha no segundo rename
   restaura automaticamente a raiz anterior. O processo Node anterior desse domínio
   é encerrado; suas versões e backups ficam preservados. Nas publicações seguintes,
   o marcador estático já existe e dispensa a mudança de preset no hPanel.
5. Conferir marcador público `/hostinger-release-sha.txt`, manifesto do editor com
   `apiBase` da produção, login e fluxo legal/editor. Validar senha existente,
   projetos/histórico/catálogo versionado/admin manual, isolamento, uploads privados,
   assinaturas e retorno comercial. Não executar testes destrutivos contra produção.
6. Configurar/testar webhook assinado/idempotente Stripe em cada modo e endpoint.
   Não liberar licença pelo retorno visual do checkout. Conferir pedidos duplicados,
   pagamento confirmado, cancelamento, inadimplência e prevalência manual.
7. Atualizar botões comerciais e retorno de logout/cancelamento. Só após esses gates
   inativar o sistema anterior, registrar a revisão servida e habilitar a operação.

## Rollback

Conservar o artefato anterior, configuração, dados e DNS até validar recuperação.
Rollback de código comercial pode promover SHA anterior de `main` com CI aprovada,
usando esse mesmo workflow de artefatos, sem alterar desenvolvimento.
O SHA precisa conter o gate `maintenance:deploy-seed`; revisões anteriores a esse
gate e ao helper SSH são recusadas pelo workflow. Cada versão API preserva
`previous-pointer.txt`; o document root anterior fica em `hbuilds/manual-web`.
Se readiness falhar depois da troca da API, o workflow para antes de publicar o
frontend e mantém a versão anterior recuperável. Restaurar o ponteiro API exige
validar sua resolução dentro de `hbuilds/versions`, trocar o link atomicamente e
reciclar somente esse Passenger; não reverter migrations incompatíveis automaticamente.
Migrations precisam continuar compatíveis; não apagar tabelas novas para reverter UI.
Para recuperar o sistema antigo, restaurar sua aplicação/configuração/conexão **próprias**
e seus arquivos privados; não substituir o banco novo OrçaPro pelo banco do antigo sistema.
Restaurar snapshot OrçaPro sobre gravações posteriores exige janela e análise de perda
de dados; preserve o estado atual antes de qualquer recuperação.

## Evidência da cópia inicial — 03/10/2026

A cópia inicial foi comparada integralmente **antes** de publicar o runtime novo
ou cadastrar planos/configurações comerciais. A captura do destino terminou em
`2026-10-03T14:20:35.486Z`. Os dois servidores MariaDB foram lidos por túneis SSH
ligados somente a loopback local; os túneis foram encerrados após a verificação.
Nenhuma credencial ou registro pessoal foi incluído nesta evidência.

| Verificação | Resultado |
| --- | --- |
| Tabelas/DDL e digest de todos os registros | 97 tabelas, idênticas |
| Registros totais | 633.601, idênticos |
| Chaves estrangeiras | 257, definições idênticas |
| Referências órfãs | 0 em ambos os bancos |
| Uploads privados | 3 arquivos, 26.754.929 bytes; chaves/tamanhos/hashes idênticos |
| Identidades/organizações/vínculos | 3 usuários, 2 organizações, 3 vínculos; registros integrais idênticos |
| SINAPI global | 1 referência, 6.120 insumos, 495.720 preços, 10.547 composições |
| Orçamentos/histórico | 5 projetos, 47 versões, idênticos |
| Ledger Prisma | 16 migrations, registros idênticos |
| Resultado do comparador | `identical`, nenhuma diferença |

Hashes SHA-256 das cópias/manifestos, mantidos em diretório privado e fora do repo:

- dump consistente compactado: `f0c8fccb3d80fb1076462cd132ba828728566e53c3fbfdc4ba31a740790c2a76`;
- archive dos uploads: `99a8156dbf3169a9a88ffb65bfd9fdc5cdce4cdb34ee914ebda5ad1fa0d8c361`;
- manifesto completo origem: `89634b3a761af0e90e7da7447fe74d7b9227e8379240bf212126377a6ac6c142`;
- manifesto completo destino: `b247d27a37b15019de8709bc1d52b41a0273fa8a016dd35e06e99f9b80ebc8e5`;
- resultado da comparação: `ae360257590b505d27fc90b44ac1f90f98d4c4a4199f9ae6c4bf46acaaa7be85`.

Os hashes de manifestos completos diferem porque seus cabeçalhos incluem schema
e horário próprios. O comparador exclui esses dois campos e confirmou igualdade
de DDL, todas as linhas, FKs e uploads. As senhas foram copiadas como hashes dentro
do registro de usuário, sem alteração. A fila/outbox, auditorias e sessões também
foram idênticas nesse baseline. Cadastro de planos e configurações comerciais
posteriores é alteração esperada e não deve ser confundido com falha na cópia.
Este gate comprova o espelho inicial; não comprova sozinho login, Stripe ou publicação.
