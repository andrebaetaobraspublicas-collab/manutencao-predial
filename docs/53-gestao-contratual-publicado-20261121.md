# Gestão Contratual — estado publicado e correspondência com o GitHub

Referência: 21/11/2026, horário de Brasília. Este registro atualiza a Gestão Contratual e complementa os documentos 46 e 52, preservando seu conteúdo histórico. Não autoriza implantação, migração, restauração de banco ou alteração de qualquer produto.

## Repositório correto, mas código remoto ainda incompleto

O repositório é [andrebaetaobraspublicas-collab/manutencao-predial](https://github.com/andrebaetaobraspublicas-collab/manutencao-predial), ID GitHub `1284502303`, branch principal `main`. Corresponde ao remoto `origin` de `C:\Orçapro\platform` e ao histórico documentado da família OrçaPro.

**Identificar o repositório correto não significa que sua branch principal reproduza o que está em produção.** Na conferência desta atualização, o HEAD local e a `main` remota estavam em `28d3b822623d4e2425407c251bb4a96321ce1305`, de 16/11/2026. As alterações recentes da Gestão Contratual existem na árvore de trabalho local, incluindo arquivos novos ainda não versionados, e nos artefatos publicados. Portanto, não há um commit remoto que possa ser indicado como reprodução integral desta versão em produção.

Esta atualização envia somente documentação para a branch `docs/gestao-estado-publicado-20261121`. Não incorpora código, não move `main` ou `deploy-api` e não publica aplicações. Não usar essa branch documental como versão de aplicação. A incorporação do código recente exige reconciliação específica, incluindo os arquivos ainda não versionados; não substituir a pasta local pela `main` antiga.

## Ambientes conferidos

| Componente | Desenvolvimento | Produção |
|---|---|---|
| Interface | https://gestaodepredios.com.br/gestao-contratual/ | https://orcaprogestaocontratual.com.br/gestao-contratual/ |
| API | api.gestaodepredios.com.br | api.orcaprogestaocontratual.com.br |
| Runtime da API | `gestao-source-prices-dev-20261121` | `gestao-source-prices-production-20261121` |
| Última entrega da interface/manual | `gestao-manual-corrections-dev-20261121` | `gestao-manual-corrections-production-20261121` |
| Conferência atual dos arquivos web | 88 hashes coincidentes | 88 hashes coincidentes |
| Conferência atual dos módulos de API alterados | 15 hashes coincidentes | 15 hashes coincidentes |

Conferência atual realizada por SSH somente leitura: usuário/destino, apontamento de runtime, diretório do processo em execução, arquivos publicados e hash da configuração. Os 15 artefatos da API correspondem ao conjunto das entregas de correções e de preços, com prevalência dos arquivos mais recentes. Não representam uma comparação de todo o servidor com uma árvore Git.

Configurações permaneceram iguais às registradas na última publicação. Não houve consulta nem escrita de dados de negócio nesta revisão documental. Desenvolvimento e produção possuem bancos próprios; produção possui API e identidade próprias. As contas de hospedagem são diferentes e devem ser conferidas a cada operação.

## Funcionalidades publicadas em ambos os ambientes

| Área | Comportamento atual |
|---|---|
| Proprietário | Mantém papel de gestor do próprio contrato e pode aprovar sua própria medição. Os controles de correção/exclusão descritos abaixo são do proprietário. Permissões dos demais membros e isolamento por organização foram preservados. |
| Preenchimento da medição | `Usar saldo` preenche Apresentada e No período com a quantidade contratada restante. Em lote, atua nas linhas visíveis com ambos os campos vazios. |
| Editar medição | Permite corrigir rascunhos e medições aprovadas, com motivo e conferência dos valores. A retificação conserva o estado de aprovação, registra o histórico e recalcula os lançamentos vinculados. Medições canceladas não entram no editor. |
| Excluir medição | Exclusão da medição completa, inclusive aprovada, mediante motivo e confirmação. Retira seus efeitos do estado calculado, preservando o diário e os pagamentos já registrados. Cancelar rascunho e excluir são operações distintas. |
| Validação após aditivo | A existência de aditivo posterior à data de execução, isoladamente, deixou de bloquear a medição. Permanecem verificações de quantidade disponível, supressões incompatíveis e outras inconsistências reais dos registros vinculados. |
| Editar/excluir aditivo | Proprietário pode corrigir ou excluir o termo, mediante motivo e confirmação. O sistema reconstitui os efeitos sobre os lançamentos vinculados e preserva os registros anteriores. |
| Editar/excluir reajuste | Proprietário pode corrigir ou excluir regras de preço e lotes de reajuste; a interface informa os efeitos e dependências. Pagamentos existentes permanecem registrados. |
| Percentuais do aditivo | Acréscimos e supressões acumulados aparecem destacados no quadro de aditivos. |
| Eventograma do aditivo | No regime unitário, os valores antes/depois são recalculados pelos vínculos dos serviços aos eventos da fotografia de origem; as diferenças alcançam os eventos superiores e consideram termos sucessivos. |
| Constituição do contrato | Na importação de OrçaPro/Infra, Preço contratado e Preço paradigma começam com os preços unitários importados, e ambos são editáveis por item. |
| Desconto linear | Aplica ao contratado o percentual informado sobre o paradigma atual de cada item. Não modifica o paradigma nem acumula descontos ao reaplicar. |
| Manual interativo | Contém orientações de preços, desconto linear, proprietário, aprovação, edição/exclusão e preservação do histórico, em desenvolvimento e produção. |

Ter acesso ao orçamento de origem, licença ou administração SaaS não concede propriedade nem acesso aos contratos de outra organização. As integrações consultam/capturam dados autorizados, sem escrever nos bancos OrçaPro/Infra nem duplicar integralmente seus catálogos.

## Preços contratado, paradigma e desconto linear

O orçamento importado serve como ponto de partida do paradigma. O contratado começa igual a ele; o usuário informa os preços da contratação por desconto linear ou edição individual. Preços contratados acima do paradigma são permitidos.

Fórmula por item: `contratado = paradigma atual × (1 − desconto / 100)`. O campo aceita de 0% a menos de 100%, com preços calculados a seis casas decimais. Aplicar 10% a R$ 100 produz R$ 90; reaplicar 10% mantém R$ 90. Aplicar 0% iguala todos os contratados aos paradigmas atuais.

A aplicação substitui os contratados de todos os itens, inclusive ajustes manuais anteriores. Para exceções, aplicar o desconto e depois editar os itens desejados. Alterar um paradigma não reaplica automaticamente o desconto: é necessário reaplicar ou editar o contratado.

Quando o contratado muda, o total da linha passa a refletir quantidade e novo preço. Quando permanece igual, conserva-se o total adotado da origem, inclusive seu fechamento de centavos. A fotografia de origem permanece preservada.

No regime global, contratados alterados exigem eventos com valores compatíveis com o novo total; não há redistribuição silenciosa. O fluxo separado Excel/PDF permanece com suas próprias conferências. Esta alteração de constituição não recalcula contratos existentes. Os descontos e as parcelas compensatórias continuam derivados dos totais finais do contratado em relação ao paradigma, podendo diferir do percentual linear após edições individuais.

## Históricos, pagamentos e correções

As retificações/exclusões acrescentam ações `revise-measurement`, `revise-record` e `delete-record` ao diário. Não apagam fisicamente o histórico. O cálculo reconstrói os efeitos dos registros e preserva autoria, motivo e valores anteriores.

Pagamentos existentes não são desfeitos pela correção ou exclusão de uma medição. Um valor pago superior ao corrigido pode produzir saldo negativo; pagamentos vinculados à medição excluída continuam identificados para conferência gerencial. Registrar pagamento no sistema não efetua transferência bancária.

Uma reversão futura precisa manter um leitor compatível com essas ações. Não restaurar uma API antiga que desconheça as retificações, não apagar o diário e não restaurar o banco apenas para reverter uma interface.

## Manual e evidências das entregas

- Capítulos 2 e 10: formação dos preços, desconto linear, edição individual, conferência global e relação entre os totais finais.
- Capítulos 3, 5, 6 e 8: proprietário, medição unitária/global, aprovação, edição/exclusão e efeitos financeiros.
- Capítulos 9 e 11: correção/exclusão de aditivos e reajustes, percentuais, eventograma e dependências.
- Capítulos 4, 12 e 17: orientações correlatas e solução de pendências. O subtítulo fixo que identificava o manual como desenvolvimento foi removido.

As entregas registram builds específicos de ambos os ambientes, 40 testes de frontend na versão final e testes da API para autorização, correção/reconstituição e constituição com preços. A alteração de preços acrescentou sete testes e passou também em 17 testes existentes de isolamento/planilhas. Esses resultados pertencem às validações locais das entregas; não são uma execução de CI do código recente no GitHub.

Na publicação de preços em produção, os 20 contratos então não arquivados foram comparados entre APIs antiga/nova, com igualdade de resumos, itens, aditivos, preços, pagamentos, restituições e medições. Cinco tabelas operacionais foram comparadas com o backup sem diferenças. Esses números são evidência histórica daquela publicação, não contagem atual de contratos.

As validações funcionais que alteraram dados ocorreram em cópias de QA no desenvolvimento. A conferência dos manuais nos dois ambientes não editou, excluiu ou aprovou contratos. Na última entrega do manual, arquivos preexistentes fora da publicação foram preservados por hash: 376 em desenvolvimento e 112 em produção. APIs, configurações e outros produtos permaneceram preservados.

## Identificação dos artefatos conferidos agora

| SHA-256 | Desenvolvimento | Produção |
|---|---|---|
| Manifesto da última interface/manual | `9f96acfb1bc265fa609f372e08b82e3d4e634c3b6b174923a1fe3c8b4bc7b908` | `17df720b2845945bdbf942d7b184bfa837d8748616fdd50fa22e4dc0b9cb2d34` |
| `gestao-contratual/index.html` | `d2d52b26bf2ef413fec89ef841af1dd81ce3793ff3a3f03da56d7e6a69151ebe` | `217b98cad6de4ce1bb234dd5f89abc27e9b83bf23f50735874e1de48f780e8f5` |

Os hashes diferem entre ambientes por configuração de build. As evidências completas e os backups permanecem no armazenamento operacional privado; não publicar `.runtime`, configurações reais, dumps, anexos ou dados de clientes.

Os sete relatos locais `docs/gestao-*-20261121.md` detalham as entregas de medições, correções, preços e manuais. Conservam escopos e runtimes válidos no momento de cada entrega; este documento informa o estado consolidado posterior. Relatos com identificadores operacionais privados não foram copiados para o GitHub nesta atualização.

## Preservação da árvore local e prevenção de implantação indevida

Antes da edição documental, foram copiadas as alterações locais existentes, incluindo arquivos novos, e salvos os diffs e hashes. O HEAD e o índice Git local foram preservados. Não foram usados reset, checkout, stash, rebase, limpeza da árvore ou push forçado.

A conferência atual do GitHub encontrou o workflow de promoção de desenvolvimento `disabled_manually`, produção com disparo manual e nenhum webhook de repositório cadastrado. Isso não equivale a uma nova auditoria de todas as integrações externas da hospedagem. Por isso a documentação foi destinada à branch própria, sem alterar as branches acompanhadas pelas implantações. Não abrir uma promoção, reiniciar serviços ou reativar automações como efeito desta documentação. `[skip ci]` não protege contra integrações nativas da hospedagem.

Para reconciliar o código posteriormente: preservar novamente o trabalho local, comparar o HEAD remoto atualizado, selecionar explicitamente os arquivos da Gestão Contratual, incluir seus arquivos novos/testes, manter de fora alterações independentes de Infra e validar o resultado antes de qualquer incorporação. A correspondência de artefatos publicada neste documento não autoriza substituir arquivos dos servidores pelo conteúdo da `main`.
