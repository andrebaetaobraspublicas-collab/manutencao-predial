# Contexto para próximas conversas — família OrçaPro

> Atualização de 21/11/2026: para a Gestão Contratual, leia primeiro o [estado publicado e a correspondência com o GitHub](53-gestao-contratual-publicado-20261121.md). Há código recente publicado nos dois ambientes que ainda não integra a `main` remota; a árvore local contém alterações e arquivos novos que devem ser preservados. O retrato abaixo permanece histórico e não deve ser usado para concluir que a pasta continua limpa ou sincronizada com os servidores.

Referência consolidada em 16/11/2026. Copie o conteúdo abaixo para iniciar uma nova conversa. Este documento é um retrato datado: confirme o estado atual antes de agir. Não autoriza implantação nem mudanças nos ambientes.

## 1. Produtos e ambientes

Você dará continuidade à manutenção da família OrçaPro.

| Produto | Desenvolvimento | Produção |
|---|---|---|
| Gestão de Prédios | gestaodepredios.com.br | Não integra a oferta comercial em produção |
| OrçaPro — SINAPI | gestaodepredios.com.br | sistema.orcaproobras.com.br |
| OrçaPro Infraestrutura — SICRO | gestaodepredios.com.br | orcaproinfra.com.br |
| OrçaPro Gestão Contratual | gestaodepredios.com.br/gestao-contratual/ | orcaprogestaocontratual.com.br |

A página comercial dos três produtos é orcaproobras.com.br. Os sites de produção pertencem à conta Hostinger da titular responsável pela produção, diferente da conta responsável pelo desenvolvimento. Confirme privadamente a titularidade, a conta, o domínio e o destino antes de operar; não presuma que a sessão aberta pertence ao ambiente desejado. Nomes pessoais e identificadores de contas não são necessários nesta referência versionada.

APIs de produção: api.orcaproobras.com.br, api.orcaproinfra.com.br e api.orcaprogestaocontratual.com.br.

## 2. Arquitetura e isolamento

A Gestão Contratual possui banco próprio em cada ambiente. Em produção também possui API e identidade próprias. Sua integração com OrçaPro e Infra consulta ou captura dados autorizados de usuários e orçamentos, sem gravar nos bancos de origem. Não duplicar os catálogos completos SINAPI/SICRO no banco contratual.

Preservar isolamento por organização, permissões e históricos. Licença não concede automaticamente acesso aos contratos de outra organização. Gestor, fiscal e leitor são papéis contratuais diferentes de administrador SaaS. Não modificar OrçaPro, Infra ou seus bancos como efeito colateral de uma alteração na Gestão Contratual.

## 3. Funcionalidades existentes

A Gestão Contratual possui interface alinhada ao OrçaPro, menus verticais à esquerda e planilhas analíticas:

- Aditivos com acréscimos, supressões, serviços novos e quantitativos originais e atualizados.
- Análise do desconto e parcela compensatória negativa, incluindo retenções, recálculos e devoluções após aditivos sucessivos.
- Reajustes por índices, cestas e regras por item, além de reequilíbrios, preservando preços históricos.
- Medições por itens em preço unitário e por eventos em preço global.
- Aprovação, registro de pagamentos, importações Excel e exportações Excel/PDF.
- Acompanhamento do Cronograma: linha de base original, reprogramado e executado, curvas S, Gantt e desvios.
- Administração SaaS, licenças, usuários, sessões, auditoria e manual interativo.

Existem exemplos do edifício de quatro pavimentos e da rodovia SICRO. Testes que modificam contratos devem usar cópias, preservando os históricos originais. Registro de pagamento contratual não representa transferência bancária.

A assinatura comercial da Gestão Contratual custa R$ 299/mês ou R$ 2.990/ano, sem combo, e exige assinatura ativa do OrçaPro ou Infra. Desenvolvimento usa cobrança de teste. Não realizar cobranças reais em testes.

A referência SINAPI foi atualizada para outubro de 2026. Alterar a referência padrão não atualiza automaticamente todos os orçamentos existentes; o demonstrativo solicitado recebeu tratamento específico.

## 4. Diretório e GitHub

- Diretório de trabalho: `C:\Orçapro`.
- Repositório local: `C:\Orçapro\platform`.
- GitHub: `andrebaetaobraspublicas-collab/manutencao-predial`.
- Branch principal: `main`.

Estado conferido em 16/11/2026, antes do commit deste documento:

- PR #84 incorporado.
- PR #85 incorporado, merge `6d36ef6`.
- `main` local e remota em `2c7cdbf`, sem alterações locais pendentes.
- Correção mais recente de teste: `b13ba59`.
- Commit posterior `2c7cdbf` contém somente documentação do sucesso, com `[skip ci]`.

O commit deste arquivo é posterior a esse retrato; consulte `git log` e o remoto para obter o HEAD vigente. GitHub sincronizado não significa que os sites executem exatamente essa revisão. Não promover código para igualar ambientes sem autorização explícita.

## 5. CI: correções e resultado final

CI significa Integração Contínua: verificações automáticas de segurança, testes e compilação. Publicação é uma operação separada.

As falhas tratadas nesta rodada incluíram:

- Mock desatualizado no teste da administração do Infra.
- Caminho de armazenamento de teste específico do Windows, substituído por caminho temporário portátil.
- Comparação do exemplo da rodovia entre cenários fiscais diferentes: valores orçamentários preservados e comparação integral acrescentada sob premissas históricas explícitas.
- Inventário de hashes desatualizado de `21_bdi_core.js` e `28_abc_ui.js`, reconciliado com alterações previamente versionadas.
- Teste de compilação do editor OrçaPro: delimitava incorretamente os scripts e incluía tags HTML entre blocos válidos de JavaScript. Foi corrigido para compilar cada bloco inline separadamente, preservando verificações de ordem e sanitização.

Na última correção passaram 34 testes locais. A [CI 43801374048](https://github.com/andrebaetaobraspublicas-collab/manutencao-predial/actions/runs/43801374048), do commit `b13ba59`, terminou com **success**, incluindo segurança, lint, API, SICRO/Infra, integração e volume, build, exportação estática e editor.

Não existe falha restante conhecida nessa execução. O commit documental posterior não foi submetido a uma nova CI. Não confundir sucesso nessa revisão com garantia sobre alterações futuras ou homologação integral dos sistemas publicados.

## 6. Incidente de publicação automática

O merge do PR #84 disparou uma integração Git nativa da Hostinger, independente do GitHub Actions. Isso publicou um frontend antigo no desenvolvimento, fazendo desaparecer a Gestão Contratual do seletor. Desativar apenas o workflow do GitHub não havia impedido essa publicação.

A interface foi restaurada com autorização, preservando cópia anterior. Foram recuperadas as rotas e os acessos da Gestão Contratual, sem alterações em bancos, API ou produção.

Controles de prevenção:

- `promote-hostinger-runtime.yml`: `disabled_manually`, reconfirmado em 16/11/2026 antes da sincronização desta referência.
- Publicação Git automática nativa do frontend gestaodepredios.com.br: desligada e confirmada no painel durante a recuperação, conforme documento 48. Não confundir essa confirmação histórica com uma consulta ao painel a cada commit.
- API de desenvolvimento: integração acompanha `deploy-api`; não atualizar essa branch nem reativar sua promoção.
- Promoção de produção: fluxo manual; não acionar.
- Considerar também integrações externas e prévias de PR antes de push ou merge.

**`[skip ci]` não é proteção contra publicação nativa da Hostinger.**

Antes de sincronizar alterações futuras, verifique os gatilhos aplicáveis, branches e destinos. Não reative publicação automática. Não execute Redeploy, migrations, seeds, reinícios ou comandos de implantação sem autorização específica.

Uma publicação autorizada deverá identificar ambiente, artefato, backup, procedimento de recuperação e validação. Compilar ou gerar exportação estática em CI não significa enviar arquivos à Hostinger.

## 7. Segurança e documentação

Não enviar ao GitHub senhas, tokens, chaves, configurações reais, conteúdo de `.runtime`, dumps, backups, anexos de clientes, manifestos privados ou dados pessoais/operacionais usados nos testes. Adicionar arquivos explicitamente aos commits. Não incluir indiscriminadamente toda a pasta de trabalho. Não solicitar senhas no chat.

Leia os documentos em `C:\Orçapro\platform\docs`:

- [Estado consolidado](46-estado-consolidado-programas-20261115.md).
- [Revisão sem implantação](47-revisao-codigo-sem-implantacao-20261115.md).
- [Incidente e restauração](48-incidente-interface-dev-20261116.md).
- [Correções da CI Infra](49-correcao-ci-infra-20261116.md).
- [Cenário fiscal e inventário](50-regressao-infra-cenario-e-inventario-20261116.md).
- [Compilação do editor e CI aprovada](51-compilacao-editor-ci-20261116.md).
- ADRs 0010 e 0011, sobre banco independente e produção isolada.

Os documentos preservam histórico; registros posteriores corrigem limitações e afirmações anteriores. A última CI aprovada prevalece sobre relatos antigos de falhas ainda pendentes.

Existe uma ressalva documentada: o acesso e as cópias dos exemplos para uma conta de outra organização foram validados pela API, mas a conferência visual final com a sessão dessa conta não foi registrada como concluída. Não afirmar que ocorreu sem verificá-la.

## 8. Conduta para a próxima tarefa

Comece identificando a solicitação atual e conferindo o estado relevante. Faça alterações somente no escopo autorizado. Para correções de CI, execute testes locais, sincronize com os controles de publicação preservados e acompanhe a execução completa até o resultado final.

**Não alterar desenvolvimento ou produção apenas por receber este contexto.**
