# Rollback — núcleo operacional GP-020 a GP-024

Esta migração cria tabelas, colunas e chaves, faz backfill e substitui o índice antigo de prazo de SLA. Como MySQL executa `DDL` com commits implícitos, uma falha pode deixar objetos parcialmente criados. O rollback suportado em produção é a restauração do backup completo.

## Antes da publicação

1. ative uma janela de manutenção que suspenda cadastros de tenants e gravações de OS;
2. gere e valide um backup do banco imediatamente antes de `prisma migrate deploy`;
3. registre o hash do artefato anterior e confirme espaço livre para tabelas e índices;
4. confira `SHOW INDEX FROM WorkOrder`, `SELECT @@session.time_zone, @@system_time_zone` e a tabela `_prisma_migrations`;
5. execute migration, seed idempotente, smoke test e somente então libere o tráfego.

## Falha durante a migração

1. mantenha a API parada e não tente executar o arquivo SQL novamente;
2. prefira restaurar o backup, que também restaura o ledger `_prisma_migrations`;
3. se a limpeza manual for inevitável, inventarie tabelas, colunas, FKs e índices realmente criados antes de removê-los;
4. dentro de `apps/api`, depois de devolver o schema exatamente ao estado anterior, execute `prisma migrate resolve --rolled-back 20260802210000_operational_core`;
5. use `prisma migrate resolve --applied 20260802210000_operational_core` somente quando um reparo controlado tiver concluído integralmente o mesmo schema e backfill;
6. valide `prisma migrate status` no mesmo diretório antes de uma nova tentativa.

O índice anterior, caso precise ser recomposto numa limpeza manual, é:

```sql
CREATE INDEX `WorkOrder_tenantId_slaResolutionDeadline_status_idx`
  ON `WorkOrder`(`tenantId`,`slaResolutionDeadline`,`status`);
```

## Rollback depois de uma migração concluída

Restaure o backup completo e publique o artefato anterior. Antes de qualquer restauração, exporte os dados criados após o corte, incluindo:

- comentários, menções e respostas/revisões de checklist;
- notificações, preferências e outbox;
- reaberturas e histórico de status;
- classificações, solução, aceite, custos, elegibilidade, `reopenCount`, SLA, snapshots e instante de aviso das OS;
- coordenadas e metadados de proveniência geográfica dos edifícios;
- catálogos, templates, calendários, feriados e políticas de SLA.

Não há script genérico de `DROP`: a ordem correta depende de até onde o MySQL chegou e remover objetos sem reconciliar `_prisma_migrations` deixa o próximo deploy inseguro.
