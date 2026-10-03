# ADR 0009 — OrçaPro Infraestrutura com banco independente e identidade compartilhada

Status: aceito pelo proprietário em 03/10/2026. Escopo de implantação: desenvolvimento em `www.gestaodepredios.com.br`.

O proprietário solicitou um terceiro aplicativo, OrçaPro Infraestrutura, preservando as telas e todas as regras do HTML SICRO entregue. A especificação inicial mencionava Laravel. Depois de comparar o custo de manter dois runtimes e os riscos de duplicar autenticação, o proprietário confirmou manter Node/NestJS e criar um banco MySQL independente. Os domínios comerciais `orcaproobras.com.br` e `sistema.orcaproobras.com.br` ficam fora desta entrega.

## Decisão

O portal Next.js passa a selecionar Gestão de Prédios, OrçaPro e OrçaPro Infraestrutura. O novo aplicativo usa `/orcapro-infraestrutura`; seu frontend Vite preserva módulos, estilos e ordem de execução do original. A API ocupa `/api/v1/infraestrutura` no NestJS existente. `INFRA_ENABLED` fecha todo o produto por padrão. `INFRA_DATABASE_URL` aponta para outro banco; um pool `mariadb` próprio evita incorporar tabelas SICRO nas migrations Prisma da manutenção. O driver recusa o mesmo destino do banco principal, mesmo com outro usuário MySQL.

Identidade, bcrypt e sessões `gp_access`/`gp_refresh` permanecem no diretório central. `InfraUser` guarda somente referência ao usuário/tenant e papel/status do novo produto, sem hash de senha. A JWT strategy central continua conferindo identidade, membership e versão de sessão. O guard Infraestrutura exige também perfil local ativo; `OWNER` da manutenção não concede administração global. `INFRA_ADMIN_USER_IDS` protege administradores iniciais e perfis locais `ADMIN` habilitam os demais administradores do produto.

Cadastro novo cria uma identidade central, membership `REQUESTER` com `maintenanceAccess=false`, acesso OrçaPro `managed=true/enabled=false` e perfil Infraestrutura. Assim, cadastrar neste programa não concede licenças dos outros dois. Alterar senha administrativa muda a identidade compartilhada e revoga todas as suas sessões; a transação central inclui auditoria sem segredo. O banco local registra intenção e conclusão, sem presumir uma transação distribuída entre os bancos.

SICRO e PEM são catálogos globais imutáveis por ciclo UF/referência. Projetos, versões, configurações e adaptações pertencem ao par **usuário + tenant autenticados**, inclusive quando dois usuários pertencem à mesma organização. A referência de um projeto não muda quando outro ciclo é publicado. Trocar ciclo exige comparação de custos com o motor original e confirmação vinculada à versão do projeto. Preços não disponíveis permanecem ausentes; a fotografia SP não pode aparecer como custo de outra UF.

O orçamento de infraestrutura é um produto de engenharia de custos explicitamente solicitado pelo proprietário, independente da OS de manutenção, como o OrçaPro do ADR 0007. Isso não cria fluxo paralelo de manutenção nem altera a centralidade da OS no Gestão de Prédios.

## Precisão e compatibilidade

Os módulos JavaScript SICRO conservam fórmulas, r4/r2, FIC/FIT, produção, encargos, transportes, AL, canteiro, mobilização, calendário e regras de arredondamento do arquivo entregue. Valores computados em centavos e coeficientes seguem o original; não se reescrevem essas regras em Decimal ou PHP. A exigência explícita de ausência de divergência numérica governa essa migração. Valores relacionais de consulta usam `DECIMAL`, mantendo o raw intacto como entrada autoritativa do cálculo. O backend não acrescenta fórmulas financeiras alternativas. A regressão integral confere 6.619 custos; o exemplo conserva 172 dias úteis e seus totais.

Normalização e conferência completa ocorrem em CLI finito, após upload incremental com SHA-256. O HTTP apenas recebe lotes e enfileira. O worker usa lock MySQL de conexão; interrupção libera o lock e o próximo ciclo operacional retoma o trabalho. Comparações entre referências executam o motor em Worker Thread com timeout e limite de memória.

## Segurança e descarte

Mutações exigem origem permitida e CSRF vinculado à sessão; login específico tem CSRF, limite persistente de cinco tentativas/minuto e bloqueio temporário. Documentos privados têm limite20 MB, validação estrutural e sanitização de descrições. Administração não substitui os filtros operacionais: uma consulta global de projeto existe apenas em rota administrativa de leitura com auditoria.

Exclusões usuais são lógicas. O pedido expresso LGPD registra recuperação por30 dias por padrão, revoga o acesso local e depois elimina dados privados desse produto por CLI. A política operacional documenta esse descarte, preservando identidade compartilhada e dados dos demais produtos. Referências pessoais e conteúdo da auditoria local são anonimizados no escopo solicitado; backups expiram em14 dias, podendo conservar cópia anterior por esse prazo adicional. Textos jurídicos iniciais são rascunhos editáveis pelo administrador e exigem revisão do responsável.

## Rollback

Desabilitar `INFRA_ENABLED` e retornar o artefato DEV anterior. Preservar banco e backups novos; não executar DROP nem restaurar sobre bancos dos outros produtos. As migrations independentes têm ledger e hash; erro parcial de DDL MySQL exige reconciliação/recuperação documentada, sem apagar tabelas para forçar repetição. Reverter para código central antigo que ignore `maintenanceAccess` exige antes bloquear memberships exclusivos, conforme ADR 0008.

Contratos: [infraestrutura-api.md](../infraestrutura-api.md). Operação: [infraestrutura-deploy.md](../infraestrutura-deploy.md).
