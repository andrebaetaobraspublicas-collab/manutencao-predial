-- v0.14.0: exclusão lógica dos planos de manutenção.
ALTER TABLE `MaintenancePlan`
  ADD COLUMN `deletedAt` DATETIME(3) NULL;

DROP INDEX `MaintenancePlan_tenantId_active_nextDueAt_idx` ON `MaintenancePlan`;
CREATE INDEX `MaintenancePlan_tenantId_active_nextDueAt_deletedAt_idx`
  ON `MaintenancePlan`(`tenantId`, `active`, `nextDueAt`, `deletedAt`);
