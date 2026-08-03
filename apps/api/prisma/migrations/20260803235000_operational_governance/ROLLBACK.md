# Rollback da v0.14.0

A coluna `MaintenancePlan.deletedAt` é aditiva. Em rollback de aplicação, versões anteriores ignoram
essa coluna e continuam respeitando `active`/`suspendedAt`.

Não remova a coluna enquanto houver planos arquivados. Para uma reversão destrutiva controlada,
exporte os planos com `deletedAt IS NOT NULL`, recrie o índice anterior e somente depois execute:

```sql
ALTER TABLE `MaintenancePlan` DROP COLUMN `deletedAt`;
```
