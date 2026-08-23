# v0.18 — Orçamento contratual, mão de obra e integração com OS

## Objetivo

Esta versão cria a instância de orçamento do contrato inteiro sem misturá-la aos orçamentos
previsto, aprovado e final executado de cada ordem de serviço. A planilha do contrato passa a ser
uma fonte de preços controlada para as OS vinculadas.

## Funcionalidades

- indicação de dedicação exclusiva de mão de obra no contrato;
- edição direta de itens, materiais, insumos e serviços eventuais;
- seleção de insumos e composições SINAPI no orçamento global;
- cadastro e edição de postos, quantitativos, profissionais, jornada, salário, módulos de custo,
  BDI e valor anual;
- importação de `.xlsx`, `.xlsb` e PDF textual;
- processamento do arquivo apenas em memória, sem retenção do binário importado;
- inclusão, edição e exclusão dos componentes analíticos de cada posto;
- cópia rastreável de preços do contrato para o orçamento da OS.

## Importação do exemplo fornecido

O parser foi validado no `Anexo II - Orçamento Estimativo.xlsb` fornecido pelo proprietário. A
leitura reconheceu 92 abas, 15.233 itens, 17 postos de trabalho e 1.003 componentes analíticos. As
abas auxiliares permanecem registradas no manifesto mesmo quando não geram uma linha de preço.

O arquivo original não deve ser commitado. A carga em produção é feita pelo endpoint autenticado,
que valida a assinatura, calcula SHA-256 para auditoria, processa o conteúdo em memória e descarta
o binário ao terminar. As linhas normalizadas, as contagens e a revisão permanecem no banco.

## Regras de integração com a OS

1. a OS deve estar vinculada ao contrato;
2. o orçamento do contrato deve estar disponível e não arquivado;
3. o item precisa pertencer ao mesmo tenant e estar ativo;
4. o preço unitário é copiado da planilha contratual, sem edição silenciosa na seleção;
5. a revisão da OS registra o identificador e a versão do orçamento contratual usados.

## Segurança e integridade

- consulta sempre limitada por `tenantId`;
- nenhum binário de importação preservado pelo módulo;
- assinatura ZIP/PDF validada antes do processamento;
- exclusão lógica de itens e postos;
- valores calculados com `Prisma.Decimal`;
- auditoria de importação, edição e exclusão.

## Migração e rollback

Aplicar `20260823190000_contract_budgets` e
`20260823220000_discard_contract_budget_source_files` antes de iniciar a API. A primeira migração cria as
tabelas do orçamento, adiciona `Contract.exclusiveLaborDedication` e a referência opcional em
`BudgetItem`; a segunda torna opcionais os campos legados de armazenamento do arquivo. A remoção
física das tabelas não faz parte do rollback operacional; qualquer reversão destrutiva exige
exportação prévia do banco.
