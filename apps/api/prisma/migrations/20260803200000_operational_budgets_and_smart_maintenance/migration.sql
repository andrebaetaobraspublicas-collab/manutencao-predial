-- Orçamentos passam a representar três estágios independentes por ordem de serviço.
ALTER TABLE `WorkOrderBudget`
  ADD COLUMN `stage` ENUM('PLANNED', 'APPROVED', 'FINAL_EXECUTED') NOT NULL DEFAULT 'PLANNED';

CREATE UNIQUE INDEX `WorkOrderBudget_workOrderId_stage_key`
  ON `WorkOrderBudget`(`workOrderId`, `stage`);

-- O novo índice composto preserva workOrderId como prefixo para a FK durante a troca.
DROP INDEX `WorkOrderBudget_workOrderId_key` ON `WorkOrderBudget`;

CREATE INDEX `WorkOrderBudget_tenantId_stage_status_idx`
  ON `WorkOrderBudget`(`tenantId`, `stage`, `status`);

-- A medição preserva a origem exata no orçamento final executado.
ALTER TABLE `MeasurementItem`
  ADD COLUMN `budgetId` CHAR(36) NULL;

CREATE INDEX `MeasurementItem_budgetId_idx` ON `MeasurementItem`(`budgetId`);

ALTER TABLE `MeasurementItem`
  ADD CONSTRAINT `MeasurementItem_budgetId_fkey`
  FOREIGN KEY (`budgetId`) REFERENCES `WorkOrderBudget`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Metadados explicáveis do motor de recomendação.
ALTER TABLE `MaintenancePlan`
  ADD COLUMN `generationSource` VARCHAR(40) NULL,
  ADD COLUMN `technicalBasis` JSON NULL,
  ADD COLUMN `riskScore` INTEGER NULL,
  ADD COLUMN `recommendationVersion` VARCHAR(40) NULL;
