-- v0.14.0: exclusão lógica dos planos de manutenção.
ALTER TABLE `MaintenancePlan`
  ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- O índice anterior também serve de apoio à FK composta criada no schema inicial.
-- Ele deve permanecer para compatibilidade com MySQL/MariaDB (erro 1553 ao removê-lo).
CREATE INDEX `MaintenancePlan_tenantId_active_nextDueAt_deletedAt_idx`
  ON `MaintenancePlan`(`tenantId`, `active`, `nextDueAt`, `deletedAt`);
