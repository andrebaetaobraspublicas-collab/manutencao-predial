# Rollback — núcleo gerencial v0.9.0

Esta migration altera enums, faz backfill e adiciona chaves financeiras. MySQL possui commits
implícitos em DDL; não existe downgrade automático seguro.

Antes da publicação, gere backup consistente, valide o ZIP em banco descartável e registre o SHA
da aplicação. Se a migration falhar parcialmente, mantenha a API parada, inventarie objetos e
prefira restaurar o backup completo, inclusive `_prisma_migrations`. Não execute o SQL novamente
nem use `prisma migrate resolve` sem reconciliar exatamente o estado do schema.

Depois de uma migration concluída, rollback exige restaurar banco e anexos para o mesmo ponto e
publicar o artefato v0.8.0. Antes disso, preserve separadamente qualquer dado criado após o corte:
medições/movimentos, revisões de orçamento, catálogos SINAPI, planos/gerações e medições KPI.
