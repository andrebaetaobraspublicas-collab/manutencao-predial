# Preparação local da Gestão Contratual de produção

Esta receita **não implanta**, não abre conexão com banco, não inicia a API e não executa migrations, seeds, SSH ou chamadas de cobrança. Ela gera uma pasta local nova para revisão. Nenhum workflow existente é modificado. Os comandos gerais de deploy do monorepo não são adequados a este pacote exclusivo.

## Fonte e dependências

Use um checkout isolado do commit a reproduzir, nunca a pasta de trabalho com alterações pendentes. Node **22.23.5**, igual ao runtime auditado. Instale a ferramenta de compilação pelo `package-lock.json` da raiz com `npm ci --ignore-scripts`. Não copiar `.env`, anexos, dumps nem configuração da hospedagem para o checkout.

O `runtime/package-lock.json` é a cópia integral do lock auditado em produção em 21/11/2026, sem credenciais. Fixa inclusive Nodemailer 10.5.0 e as versões transitivas instaladas. Está separado do lock do monorepo: não se removem overrides nem se alteram bibliotecas dos outros produtos. É uma referência de reprodução, não uma declaração de que todas as bibliotecas são as versões mais recentes. Atualizações de dependências exigem revisão própria.

```sh
# Dentro do checkout isolado, usando Node 22.23.5.
npm ci --ignore-scripts
node --test scripts/gestao-production/prepare.test.mjs scripts/gestao-production/source.test.mjs
node scripts/gestao-production/build.mjs --output /caminho/local/novo-pacote --source-commit <SHA-completo-do-checkout>
node scripts/gestao-production/verify.mjs /caminho/local/novo-pacote
```

O build exige que o SHA informado corresponda ao HEAD e recusa alterações pendentes em arquivos versionados. Lê os blobs diretamente desse commit, excluindo arquivos locais não versionados e configurações privadas, e os materializa numa pasta temporária. Assim, diferenças locais de quebra de linha não falsificam a origem. Usa URL fictícia de banco apenas para gerar o cliente Prisma e chama TypeScript/Next diretamente. Não usa os comandos `hostinger:deploy`, `prisma:deploy`, `prisma:seed` nem os prebuilds dos editores. O manifesto também registra um hash dos insumos efetivamente compilados. A pasta temporária é mantida para inspeção. A saída precisa estar fora do checkout e não pode existir previamente.

O pacote contém `api/`, `web/` e `manifest.json`. O inicializador é exclusivamente `api/main.js` → `dist/main-gestao.js`. Módulos compartilhados compilados podem existir na distribuição, mas o módulo Nest exclusivo continua controlando os serviços e controllers carregados. Não há publicação de rotas operacionais dos demais produtos.

Os parâmetros públicos estão em `build-env.json`. A seleção explícita de páginas inclui Gestão Contratual, cadastro, login, senhas, troca de programa, raiz e 404, com os arquivos RSC e recursos necessários. `web.htaccess` conserva HTTPS, domínio canônico, cabeçalhos e regras de cache observados. Arquivos antigos sem referência, mapas de código e a página padrão da hospedagem não são necessários ao funcionamento e não são copiados. Uma publicação futura não deve apagá-los indiscriminadamente durante sessões ativas.

Para materializar localmente as dependências de execução, em uma pasta de artefato sem relação com workspace npm:

```sh
cd /caminho/local/novo-pacote/api
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
# De volta ao checkout isolado:
node scripts/gestao-production/verify-dependencies.mjs /caminho/local/novo-pacote/api
```

Use o mesmo sistema operacional/arquitetura do destino para gerar um pacote com dependências nativas. A instalação de teste no Windows verifica resolução/versões compatíveis, mas não substitui a preparação Linux. Não copiar nem depender do `node_modules` de uma release remota antiga. `verify.mjs` confere os arquivos da release; `verify-dependencies.mjs` confere versões instaladas e recusa dependências vinculadas a diretórios externos, permitindo a ausência das dependências opcionais específicas de plataforma. A integridade dos bytes baixados é conferida por `npm ci` usando o lock.

## Configuração privada e identidade administrativa

`.env.production.example` é somente a relação de parâmetros; campos sensíveis permanecem vazios. Não substituir uma configuração real por esse exemplo. O inicializador futuro requer `GESTAO_ENV_FILE`, caminho absoluto para o arquivo privado já preparado fora de `public_html`. Lê os valores sem escrever o arquivo.

**Administrador principal exige e-mail E ID, não e-mail OU ID.** Nos quatro módulos auditados, o GitHub utiliza `GESTAO_ADMIN_EMAIL` em conjunto com `GESTAO_ADMIN_USER_IDS`. A produção auditada ainda comparava um e-mail privado fixo em conjunto com os IDs. A presença somente dos IDs não reproduz o reconhecimento administrativo completo. Não publicar identidade pessoal no código nem criar um fallback que amplie privilégios.

Antes de uma futura implantação autorizada, o operador deverá conferir privadamente o e-mail e o ID da identidade local existente, preservando os vínculos. Nenhum usuário deve ser recriado, importado ou promovido por este procedimento. A configuração atual auditada não tinha `GESTAO_ADMIN_EMAIL`: **este pacote ainda não deve ser ativado nela sem resolver esse requisito**. Proprietário, gestor, fiscal e leitor permanecem regidos pelo código existente.

```sh
# Verificação offline, sem imprimir segredos nem conectar a qualquer serviço.
node scripts/gestao-production/preflight.cjs /caminho/privado/config.env
```

O preflight verifica presença/formato e isolamento. Não prova que senhas são válidas, que o administrador indicado é o correto ou que o banco tem o nome autorizado pelo validador existente da aplicação. Essas verificações pertencem à homologação de uma implantação autorizada.

Na inicialização futura, `RELEASE_SHA` será derivado do manifesto no processo, sem reescrever o arquivo privado. O marcador remoto auditado de 15/11 é histórico; não indica que o código atual tenha sido revertido. O manifesto deve permanecer ao lado de `api/`, conforme a estrutura gerada.

## Banco e preservação

`production-reference.json` registra hashes de scripts e artefatos, sem dados de usuários/contratos. A comparação de 21/11 encontrou estrutura compatível (115 tabelas, 1.518 colunas, 264 vínculos e 53 validações JSON), mas `GcMigration` estava vazia e `_prisma_migrations` não existia.

Não executar as seis migrations desde o início, `migrate reset`, `db push`, seeds ou inicialização de banco vazio. Esta entrega não contém mudança de schema nem script que preencha o histórico de migrations. Uma adoção futura de baseline requer inventário estrutural atualizado, backup restaurável e registro explícito de estruturas já existentes, sem apresentar scripts reaplicados como migrações históricas.

Preservar banco próprio, `GcSource`, bases dos contratos, `GcAction`, pagamentos, auditorias, permissões, anexos/importações e armazenamento privado. O rollback de código não deve restaurar um dump antigo sobre movimentação posterior. Conferir compatibilidade do código de retorno antes de trocar uma release.

## Limites de reprodução e revisão futura

A equivalência procurada é do funcionamento e do conjunto de dependências. Identificadores aleatórios do Next, mapas de compilação, arquivos obsoletos e a antiga identidade administrativa literal não são restaurados para obter igualdade artificial de bytes. O manifesto permite conferir o pacote gerado.

Ainda exige autorização própria: ajustar a configuração administrativa/entrada do processo, preparar dependências Linux, homologar sessão administrativa e isolamento, obter backup e testar recuperação, publicar somente nos dois domínios contratuais e validar a nova release. Nada disso é executado pelo build ou por este PR.
