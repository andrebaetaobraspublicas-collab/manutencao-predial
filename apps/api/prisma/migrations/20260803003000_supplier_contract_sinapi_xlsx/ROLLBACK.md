# Rollback — fornecedores, contratos e SINAPI XLSX

O MySQL executa DDL com commits implícitos. Para reverter com segurança depois da publicação,
restaure o backup do banco e o artefato anterior no mesmo ponto de corte. Antes disso, preserve os
fornecedores/consórcios, sanções, aditivos, reajustes, subcontratações e catálogos importados que
tenham sido criados após a migração.

Não remova manualmente colunas ou tabelas em produção e não execute `prisma migrate resolve`
sem reconciliar previamente o schema real e a tabela `_prisma_migrations`.
