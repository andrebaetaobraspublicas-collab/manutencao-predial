# OrçaPro Infraestrutura — instalação no desenvolvimento Hostinger

O OrçaPro Infraestrutura é o terceiro produto de `www.gestaodepredios.com.br`, ao lado do OrçaPro e do Gestão de Prédios. Usa Node/NestJS existente e MySQL exclusivo. A escolha preserva autenticação, gestão de usuários e operação da plataforma. Os sites `orcaproobras.com.br` e `sistema.orcaproobras.com.br` são ambientes de produção e ficam fora deste deploy.

## Banco e identidade

No hPanel da conta de desenvolvimento, criar banco **novo** e usuário MySQL **novo**, com permissão somente para esse banco. Guardar os nomes completos, incluindo prefixo Hostinger. Não importar no banco existente. O limite de quantidade de bancos depende do plano contratado; vários bancos no mesmo domínio funcionam porque a API seleciona a conexão no servidor.

Configurar `INFRA_DATABASE_URL=mysql://usuario:senha-URL-encoded@host:3306/banco_novo` fora de `public_html`. `DATABASE_URL` permanece a conexão da identidade/OrçaPro/manutenção. Não há cópia de senhas: o usuário e a organização vêm da identidade central; InfraUser guarda papel e status exclusivos da Infraestrutura. Proprietário/admin da manutenção não recebe automaticamente administração global do SICRO. A lista de usuários administradores globais é `INFRA_ADMIN_USER_IDS` com IDs internos existentes.

Definir `INFRA_ENABLED=true` no processo da API somente depois das migrations e do seed conferido. Durante a preparação, os CLIs recebem essa variável apenas no comando, enquanto o processo web permanece desabilitado. Na ausência desta variável o módulo não abre conexão com o banco novo e não concede acesso. Manter `ORCAPRO_ONLY=false` no desenvolvimento e preservar as variáveis dos dois programas existentes. `WEB_BASE_URL`, `API_BASE_URL`, `CORS_ORIGINS` e cookies devem continuar apontando apenas para o domínio de desenvolvimento e sua API.

## Instalação e catálogo

O backend mantém migrations SQL do banco separado; não editar tabelas Prisma existentes para armazenar SICRO/projetos. Rodar o CLI de migration e depois o CLI de instalação com admin central existente e JSON raw SICRO extraído do HTML. Toda importação tem estado rascunho, validação e publicação. Um ciclo publicado é imutável: UF, referência, revisão e regime contextualizam custos. Projetos antigos continuam com `cycle_id` original.

Os CLIs substituem o comando `php artisan` do documento inicial, conforme a decisão de preservar Node/NestJS. Usar o runtime Node já observado na Hostinger e o arquivo de configuração privado:

```sh
INFRA_ENABLED=true INFRA_ENV_FILE=/home/usuario/hbuilds/config/.env node apps/api/scripts/infraestrutura-migrate.mjs
INFRA_ENABLED=true INFRA_ENV_FILE=/home/usuario/hbuilds/config/.env node apps/api/scripts/infraestrutura-install.mjs --admin-email andrebaeta@hotmail.com --tenant-id UUID_DA_ORGANIZACAO --raw legacy/infraestrutura-1.8.3/base.json.gz --pem legacy/infraestrutura-1.8.3/pem.json.gz --example legacy/infraestrutura-1.8.3/example-road.json --uf SP --publish
```

Conferir os nomes/caminhos reais dos três JSON extraídos na entrega. Os dois catálogos gzip são descompactados no CLI com limite de tamanho, preservando o raw original. `--tenant-id` evita escolher silenciosamente a organização quando a conta central participa de várias. O instalador reaproveita somente uma identidade central ativa já existente e não solicita nem redefine sua senha; concede o papel ADMIN exclusivamente ao novo produto. Sem `--publish`, a referência permanece em rascunho. A execução é explicitamente registrada na auditoria.

O catálogo SICRO e PEM são globais; projetos, insumos e composições próprias filtram **proprietário e tenant autenticados**. Compartilhamento com colegas da mesma organização está desabilitado nesta versão. Um demonstrativo editado gera CP privada, sem modificar a composição oficial. O frontend preserva o motor, o layout e os módulos do HTML.

Durante homologação, usar banco de teste novo em loopback, nunca o banco operacional ou produção. As provas de custo vêm do snapshot servido pela API e do mesmo motor legado; registrar hash/contagens e os autotestes. Não afirmar publicado/validado antes de executar as provas.

## Login, acesso e operação privada

O acesso já autenticado usa a sessão central da plataforma e o guard da Infraestrutura verifica seu papel/status em cada requisição. O login específico fica em `POST /api/v1/infraestrutura/auth/login`, com `{email,password,tenantSlug?}`. Antes, chamar `GET /api/v1/infraestrutura/auth/csrf` com credenciais, receber `csrfToken` e enviar `X-Infra-Login-CSRF`. O servidor confere a origem permitida, HTTPS quando `COOKIE_SECURE=true`, o cookie HttpOnly correspondente e o token em tempo constante. Esse login usa o acesso local da Infraestrutura e não exige licença OrçaPro.

São permitidas cinco tentativas por minuto por IP e por e-mail normalizado. Cinco falhas bloqueiam temporariamente por 15 minutos; contadores e bloqueios ficam no banco exclusivo e sobrevivem a reinício. As chaves dos contadores são HMAC, sem e-mails/IPs em claro. Sucesso não repõe a cota da janela. Enquanto `INFRA_ENABLED=true`, um interceptor compartilha esses buckets com os logins centrais `/auth/login` e `/auth/orcapro/login`, exigindo origem permitida, sem adicionar cookie CSRF aos clientes existentes; trocar de rota não contorna o limite. Desabilitar Infraestrutura deixa o login central inalterado. O expurgo remove buckets inativos por sete dias, preservando bloqueios vigentes. Mutações autenticadas também exigem o token CSRF do produto, verificado pelo guard. Bloqueio local ou revogação central impedem acesso. Logs não registram senha, cookie, token, URL de banco ou conteúdo integral dos projetos.

A configuração SMTP permanece na identidade central: preservar as variáveis privadas existentes e conferir remetente, TLS e entrega de recuperação de senha no desenvolvimento. Não criar um segundo cadastro de credenciais SMTP nem copiar senhas de usuários. A alteração administrativa de senha usa o serviço central e, por isso, altera a senha de login compartilhada pelos três programas; bloqueio e papel de Infraestrutura continuam exclusivos do produto.

`data` do projeto aceita até 20 × 1024² bytes UTF-8 serializados, sem compressão. O proxy/parser precisa permitir também o pequeno envelope de transporte; configurar o limite específico do produto acima de 20 MB, conservando os limites das rotas dos produtos existentes. Preços/coeficientes mantêm escalas originais e ausência de preço é `null`, sem herdar valor de outro contexto. Atualizações usam comparação atômica de versão; 409 exige recarregar ou salvar como cópia e o editor conserva seu rascunho.

## Backup diário com retenção de 14 dias

Criar diretório privado fora de `public_html`, por exemplo `/home/usuario/backups/orcapro-infraestrutura`. Dar permissão 700. O `.env` privado da API contém:

```dotenv
INFRA_ENABLED=true
INFRA_DATABASE_URL=mysql://usuario:senha-url-encoded@localhost:3306/banco_novo
INFRA_BACKUP_DIR=/home/usuario/backups/orcapro-infraestrutura
INFRA_MYSQLDUMP_BIN=mysqldump
WEB_BASE_URL=https://www.gestaodepredios.com.br
```

No cron Hostinger, rodar diariamente às 03:17 no fuso documentado da conta:

```sh
INFRA_ENV_FILE=/home/usuario/hbuilds/config/.env /caminho/node /home/usuario/hbuilds/current/nodejs/apps/api/scripts/infraestrutura-backup.mjs >> /home/usuario/logs/infra-backup.log 2>&1
```

Ajustar os caminhos absolutos com os observados no servidor. O script lê somente `INFRA_DATABASE_URL`; recusa usar o banco igual ao `DATABASE_URL` e recusa os domínios comerciais em `WEB_BASE_URL`. O dump usa transação consistente, streaming, rotinas/triggers/eventos e BLOBs em hexadecimal. Um arquivo temporário privado de opções fornece a senha ao cliente; ela não aparece nos argumentos do processo nem na saída. O SQL é comprimido diretamente em gzip; somente depois de sucesso do cliente é publicado o arquivo final e seu manifesto SHA-256. Arquivos parciais/opções temporárias são removidos em falha.

Retenção remove exclusivamente arquivos produzidos por este script para o banco correspondente, com mais de 14 dias. Não alcança backups do Gestão de Prédios/OrçaPro nem arquivos alheios. Opcionalmente `INFRA_BACKUP_UPLOAD_URL` aceita PUT HTTPS para armazenamento **privado** pré-assinado; o segredo da URL fica no `.env`, nunca na documentação/log. Falha de upload preserva a cópia local e produz erro. Não oferecer URL pública de backup.

Para finalizar importações recebidas pela interface sem processar a base completa numa requisição HTTP, adicionar outro cron a cada minuto:

```sh
INFRA_ENV_FILE=/home/usuario/hbuilds/config/.env /caminho/node /home/usuario/hbuilds/current/nodejs/apps/api/scripts/infraestrutura-process-imports.mjs >> /home/usuario/logs/infra-imports.log 2>&1
```

O worker pega somente importações em espera no banco exclusivo, retoma trabalho seguro e só publica snapshot após validação. Conferir a disponibilidade de execução e os limites do plano Hostinger; o cron usa processo finito, sem Redis ou worker permanente. Executar também limpeza de contadores antigos de login segundo retenção mínima, preservando bloqueios ainda vigentes; a tabela armazena apenas chaves HMAC e datas/contadores.

Validar mensalmente restauração em **outro banco de teste**, com usuário MySQL distinto e permissão apenas para o destino. Conferir SHA-256 do gzip, descompactar num caminho privado e importar com `mysql --defaults-extra-file=arquivo_privado.cnf --max_allowed_packet=128M banco_restore`; conferir contagens de usuários/projetos/versões/ciclos/PEM e hash de snapshots. O servidor também precisa aceitar o pacote de um projeto de 20MB e seus metadados. Só um dump que restaura serve como evidência de backup. Não restaurar sobre o banco ativo para testar.

## Segurança, LGPD e documentos

HTTPS é obrigatório na hospedagem. Manter headers do backend, CSP compatível com os workers/fontes/exportações do legado e HSTS no domínio com TLS. `.env`, código privado, dumps e exportações LGPD ficam fora da raiz pública. Garantir que `.env`, `.git`, backups e arquivos privados retornem 403/404. Sanitização precisa ocorrer nos campos textuais editáveis e o frontend escapa descrições em todos os relatórios; não mudar conteúdo das fórmulas.

Exportação LGPD tem escopo por usuário+tenant e não inclui hash de senha, segredos ou dados alheios. `GET /api/v1/infraestrutura/me/export/archive` fornece arquivo `.json.gz` por streaming, incluindo projetos e lixeira, versões históricas, próprios inclusive excluídos, configurações e auditoria próprios. A consulta resumida `/me/export` contém o link para esse arquivo completo.

Exclusão de projeto usa lixeira. `DELETE /me/data` exige a confirmação textual `EXCLUIR MEUS DADOS`, encerra o acesso **neste programa** e registra o pedido de eliminação. `INFRA_DELETED_DATA_RETENTION_DAYS` determina o prazo de recuperação/expurgo (padrão 30 dias, permitido 1 a 365). Um cron finito diário executa o expurgo dos pedidos vencidos, remove projetos/versões/próprios/configurações/perfil local e elimina conteúdo/referências pessoais da auditoria, mantendo somente registros mínimos anônimos. Uma conta apenas bloqueada pelo admin, sem pedido de eliminação, não é expurgada.

```sh
INFRA_ENV_FILE=/home/usuario/hbuilds/config/.env /caminho/node /home/usuario/hbuilds/current/nodejs/apps/api/scripts/infraestrutura-purge.mjs >> /home/usuario/logs/infra-purge.log 2>&1
```

Após o expurgo, cópias anteriores ainda presentes nos backups privados expiram pela retenção de 14 dias; a política informa esse prazo residual. Como a identidade é compartilhada, a eliminação Infraestrutura preserva contas e dados dos outros dois produtos e não modifica o catálogo global SICRO/PEM. As políticas são editáveis pelo admin e mantêm número de versão para impedir sobrescrita concorrente. Os avisos legais originais do editor exigem concordância expressa do próprio usuário.

## Verificação e rollback

Antes de habilitar: migrations, snapshot/hash, 6.619/6.619 custos SP07/2026, exemplo da rodovia e 172 dias úteis, AL44/44, Mobilização6/6, Canteiro39/39, FIT9/9, FIC7/7 e PEM; testes HTTP/MySQL de admin403, usuário+tenant, conflito409, próprios, versões, CSRF e 20MB. Repetir se houver mudanças no motor/importação, sem criar expectativas de testes que não rodaram.

Em rollback desabilitar `INFRA_ENABLED`, retirar a opção Infraestrutura do seletor se necessário e voltar ao artefato anterior do desenvolvimento. Preservar o banco novo para recuperação; não executar DROP nas tabelas/dados existentes. O rollback dos três aplicativos não depende de alterar os dois sites de produção.

## Operação adotada neste ambiente

No desenvolvimento, o banco é `u296746636_orcapro_infra`. Seu usuário acessa MySQL em `127.0.0.1:3306` na própria Hostinger; a conexão dos dois aplicativos existentes continua inalterada. O SICRO SP 07/2026 é semeado uma única vez, com 6.619 composições, 2.398 insumos e 3.673 demonstrativos PEM. O administrador inicial reutiliza a identidade central de André, sem copiar ou redefinir a senha.

O painel desta aplicação Node não apresentou Cron Jobs e o shell não disponibiliza `crontab`. Por isso, o cron operacional está no workflow `.github/workflows/infraestrutura-development-jobs.yml`, usando o acesso SSH de desenvolvimento já configurado. A cada cinco minutos, aciona processos finitos de importação e expurgo na Hostinger. O backup diário roda às 06:17 UTC (03:17 em Brasília). GitHub pode atrasar execuções agendadas; o envio dos lotes continua persistido no MySQL e a interface permite acompanhar a fila e atualizar sua situação. Também é possível disparar `imports` ou `backup` manualmente pelo workflow.

O executor `scripts/infraestrutura/hostinger-jobs.mjs` verifica conta, diretório real do runtime, permissão privada do `.env`, domínio de desenvolvimento e nome exato do banco antes de operar. Quando `INFRA_ENABLED` está desabilitado, não opera o banco. O workflow não usa o ambiente `orcapro-production`; o nome histórico `production` em seu contexto GitHub contém apenas o SSH de `gestaodepredios.com.br`. Logs públicos mostram somente a conclusão e a operação, sem saída SQL, dados pessoais ou credenciais.

Backups ficam em `/home/u296746636/backups/orcapro-infraestrutura`, com retenção de 14 dias. O expurgo respeita a solicitação explícita e `INFRA_DELETED_DATA_RETENTION_DAYS=30`; a política explica o prazo adicional de expiração das cópias de segurança. O catálogo global e as identidades/dados dos outros produtos são preservados. O `.env` preparado começa com a Infraestrutura desabilitada; habilitar somente após conferência do seed e deploy dos artefatos.

O importador usa um lock MySQL de conexão para impedir processamento concorrente e retoma importações interrompidas com lotes persistidos. Os exemplos de cron Hostinger acima servem para planos futuros que exponham esse recurso; não ativar dois agendadores em paralelo sem planejamento.
