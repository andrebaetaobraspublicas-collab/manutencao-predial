# Rollback da v0.14.0

A coluna `MaintenancePlan.deletedAt` é aditiva. Em rollback de aplicação, versões anteriores ignoram
essa coluna e continuam respeitando `active`/`suspendedAt`.

Não remova a coluna enquanto houver planos arquivados. Para uma reversão destrutiva controlada,
exporte os planos com `deletedAt IS NOT NULL`, remova o índice novo e somente depois execute:

```sql
DROP INDEX `MaintenancePlan_tenantId_active_nextDueAt_deletedAt_idx` ON `MaintenancePlan`;
ALTER TABLE `MaintenancePlan` DROP COLUMN `deletedAt`;
```

O índice anterior não é removido pela migration porque também pode ser utilizado pelo MySQL/MariaDB
como apoio à chave estrangeira composta de `tenantId`.
