# Verificações fiscais SINAPI: regressão histórica e cenário atual

Escopo de publicação: somente o OrçaPro em www.gestaodepredios.com.br.
Não há migration, seed, importação, envio de e-mail ou alteração de produção.

O antigo botão aplicava a suíte histórica à parte do catálogo carregada sob
demanda no orçamento. Isso exigia composições ausentes da sessão e comparava
o subconjunto carregado com os 4.876 códigos da matriz histórica. Mensagens
em cascata envolvendo `null`, `oc` e `filhos` não distinguiam ausência da massa
de teste de uma divergência numérica.

Agora o relatório contém três escopos explícitos:

1. **Regressão histórica — SINAPI 08/2026 / IVA 28%:** mantém as 124 verificações
   e seus resultados numéricos de referência. Uma massa fixa é derivada do raw
   arquivado no repositório, contendo os insumos originais e a cadeia completa
   das composições utilizadas pelos testes. É carregada somente ao executar
   o botão, em memória, com SHA-256 validado antes da descompressão. Não é
   importada no MySQL nem incorporada ao projeto.
2. **Cenário atual:** verifica os novos padrões CBS/IBS, os doze exercícios,
   CBS ad rem/B15, recuperação progressiva, anexos, parâmetros manuais, três
   padrões de BDI e conciliação dos créditos do orçamento aberto. Os padrões
   numéricos são testados em configurações isoladas, sem substituir as escolhas
   tributárias do usuário.
3. **Integridade:** confirma que orçamento, referência e catálogo ativo não
   foram modificados. A base histórica fica anexada ao motor somente durante
   uma operação síncrona, com restauração em `finally`, mesmo se houver erro.

O carregamento dos recursos necessários ao orçamento usa os bundles autenticados
existentes da referência atual. Não grava novas versões. O botão fica ocupado
durante a preparação, pode ser reutilizado ao terminar e informa falhas de rede
ou de integridade. Uma mudança de orçamento/referência durante a preparação
cancela a execução para impedir resultados misturados.

A cobertura histórica agora exige a presença de todos os códigos da matriz,
permitindo os insumos adicionais da referência. A conferência do cenário atual
expõe a quantidade efetivamente carregada e não confunde isso com o total do
catálogo. Crédito parcial continua identificado na memória tributária.

As comparações rejeitam valores não finitos nos dois lados. Os vetores de
transição dos testes foram completados até 2037; os títulos antigos de oito
exercícios foram corrigidos. Nenhuma fórmula operacional foi alterada.

Validação: `node --test scripts/orcapro/fiscal-self-tests.spec.cjs
scripts/shared/tax-scenario-defaults.spec.cjs`. Os testes reproduzem um catálogo
parcial de setembro, verificam preservação dos dados, detectam dependências
históricas ausentes e regressões provocadas, validam SHA-256 e recuperação após
falha de download. A suíte de regressão do runtime da API também deve passar.

Rollback: restaurar o diretório estático anterior `orcapro-legacy` e o runtime
anterior da API de desenvolvimento. Nenhuma restauração de banco é necessária.
