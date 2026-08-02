-- GP-040..GP-043: financeiro, SINAPI, manutenção preventiva e indicadores.
-- Migração aditiva com preenchimento dos registros legados antes de NOT NULL.

SET time_zone = '+00:00';

ALTER TABLE `Measurement`
  MODIFY `status` ENUM('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','LIQUIDATED','PAID','CANCELED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `commitmentId` CHAR(36) NULL,
  ADD COLUMN `createdByUserId` CHAR(36) NULL,
  ADD COLUMN `reviewedByUserId` CHAR(36) NULL,
  ADD COLUMN `reviewedAt` DATETIME(3) NULL,
  ADD COLUMN `liquidatedAt` DATETIME(3) NULL,
  ADD COLUMN `canceledAt` DATETIME(3) NULL,
  ADD COLUMN `decisionNote` TEXT NULL,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `Commitment`
  ADD COLUMN `createdByUserId` CHAR(36) NULL,
  ADD COLUMN `canceledAt` DATETIME(3) NULL;

ALTER TABLE `CommitmentMovement`
  ADD COLUMN `tenantId` CHAR(36) NULL,
  ADD COLUMN `measurementId` CHAR(36) NULL,
  ADD COLUMN `createdByUserId` CHAR(36) NULL;
UPDATE `CommitmentMovement` cm
  INNER JOIN `Commitment` c ON c.`id` = cm.`commitmentId`
  SET cm.`tenantId` = c.`tenantId`;
ALTER TABLE `CommitmentMovement` MODIFY `tenantId` CHAR(36) NOT NULL;

ALTER TABLE `MeasurementItem`
  ADD COLUMN `tenantId` CHAR(36) NULL,
  ADD COLUMN `deductionAmount` DECIMAL(16,2) NOT NULL DEFAULT 0,
  ADD COLUMN `netAmount` DECIMAL(16,2) NULL,
  ADD COLUMN `snapshot` JSON NULL;
UPDATE `MeasurementItem` mi
  INNER JOIN `Measurement` m ON m.`id` = mi.`measurementId`
  SET mi.`tenantId` = m.`tenantId`, mi.`netAmount` = mi.`amount`;
ALTER TABLE `MeasurementItem`
  MODIFY `tenantId` CHAR(36) NOT NULL,
  MODIFY `netAmount` DECIMAL(16,2) NOT NULL;

ALTER TABLE `WorkOrderBudget`
  MODIFY `status` ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `catalogId` CHAR(36) NULL,
  ADD COLUMN `submittedByUserId` CHAR(36) NULL,
  ADD COLUMN `approvedByUserId` CHAR(36) NULL,
  ADD COLUMN `submittedAt` DATETIME(3) NULL,
  ADD COLUMN `approvedAt` DATETIME(3) NULL,
  ADD COLUMN `rejectedAt` DATETIME(3) NULL,
  ADD COLUMN `canceledAt` DATETIME(3) NULL,
  ADD COLUMN `decisionNote` TEXT NULL;

CREATE TABLE `SinapiCatalog` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `importedByUserId` CHAR(36) NULL,
  `referenceMonth` VARCHAR(7) NOT NULL,
  `state` CHAR(2) NOT NULL,
  `source` VARCHAR(40) NOT NULL DEFAULT 'SINAPI',
  `version` VARCHAR(40) NOT NULL,
  `checksum` CHAR(64) NULL,
  `itemCount` INTEGER NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SinapiCatalog_tenantId_state_referenceMonth_source_version_key` (`tenantId`,`state`,`referenceMonth`,`source`,`version`),
  INDEX `SinapiCatalog_tenantId_active_referenceMonth_idx` (`tenantId`,`active`,`referenceMonth`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SinapiCatalogItem` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `catalogId` CHAR(36) NOT NULL,
  `type` ENUM('INPUT','COMPOSITION','SERVICE') NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `description` TEXT NOT NULL,
  `unit` VARCHAR(20) NOT NULL,
  `unitCost` DECIMAL(16,6) NOT NULL,
  `compositionData` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SinapiCatalogItem_catalogId_type_code_key` (`catalogId`,`type`,`code`),
  INDEX `SinapiCatalogItem_tenantId_type_code_idx` (`tenantId`,`type`,`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BudgetItem`
  ADD COLUMN `tenantId` CHAR(36) NULL,
  ADD COLUMN `catalogItemId` CHAR(36) NULL,
  ADD COLUMN `kind` ENUM('SERVICE','INPUT','COMPOSITION','OTHER') NOT NULL DEFAULT 'SERVICE';
UPDATE `BudgetItem` bi
  INNER JOIN `WorkOrderBudget` b ON b.`id` = bi.`budgetId`
  SET bi.`tenantId` = b.`tenantId`;
ALTER TABLE `BudgetItem` MODIFY `tenantId` CHAR(36) NOT NULL;

CREATE TABLE `BudgetRevision` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `budgetId` CHAR(36) NOT NULL,
  `createdByUserId` CHAR(36) NULL,
  `version` INTEGER NOT NULL,
  `status` ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELED') NOT NULL,
  `subtotal` DECIMAL(16,2) NOT NULL,
  `bdiPercentage` DECIMAL(9,6) NOT NULL,
  `total` DECIMAL(16,2) NOT NULL,
  `snapshot` JSON NOT NULL,
  `reason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `BudgetRevision_budgetId_version_key` (`budgetId`,`version`),
  INDEX `BudgetRevision_tenantId_createdAt_idx` (`tenantId`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MaintenancePlan`
  ADD COLUMN `categoryId` CHAR(36) NULL,
  ADD COLUMN `specialtyId` CHAR(36) NULL,
  ADD COLUMN `supplierId` CHAR(36) NULL,
  ADD COLUMN `assignedToUserId` CHAR(36) NULL,
  ADD COLUMN `titleTemplate` VARCHAR(220) NULL,
  ADD COLUMN `advanceDays` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `generationHorizonDays` INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN `suspendedAt` DATETIME(3) NULL,
  ADD COLUMN `lastErrorAt` DATETIME(3) NULL,
  ADD COLUMN `lastError` TEXT NULL;
UPDATE `MaintenancePlan` SET `titleTemplate` = `name` WHERE `titleTemplate` IS NULL;
ALTER TABLE `MaintenancePlan` MODIFY `titleTemplate` VARCHAR(220) NOT NULL;

ALTER TABLE `WorkOrder`
  ADD COLUMN `maintenancePlanId` CHAR(36) NULL,
  ADD COLUMN `preventiveScheduledFor` DATETIME(3) NULL;

CREATE TABLE `MaintenancePlanGeneration` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `planId` CHAR(36) NOT NULL,
  `workOrderId` CHAR(36) NULL,
  `scheduledFor` DATETIME(3) NOT NULL,
  `status` ENUM('PENDING','GENERATED','SKIPPED','FAILED') NOT NULL DEFAULT 'PENDING',
  `generatedAt` DATETIME(3) NULL,
  `skippedAt` DATETIME(3) NULL,
  `skipReason` TEXT NULL,
  `error` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MaintenancePlanGeneration_workOrderId_key` (`workOrderId`),
  UNIQUE INDEX `MaintenancePlanGeneration_planId_scheduledFor_key` (`planId`,`scheduledFor`),
  INDEX `MaintenancePlanGeneration_tenantId_status_scheduledFor_idx` (`tenantId`,`status`,`scheduledFor`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `KpiDefinition`
  ADD COLUMN `periodicity` ENUM('DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY') NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `source` VARCHAR(80) NULL,
  ADD COLUMN `decimalPlaces` INTEGER NOT NULL DEFAULT 2;

ALTER TABLE `KpiMeasurement`
  ADD COLUMN `status` ENUM('FINAL','FAILED') NOT NULL DEFAULT 'FINAL',
  ADD COLUMN `calculationKey` CHAR(64) NULL,
  ADD COLUMN `formulaVersion` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `KpiMeasurement` SET `calculationKey` = SHA2(CONCAT('legacy:', `id`), 256);
ALTER TABLE `KpiMeasurement` MODIFY `calculationKey` CHAR(64) NOT NULL;

CREATE INDEX `CommitmentMovement_tenantId_occurredAt_idx` ON `CommitmentMovement` (`tenantId`,`occurredAt`);
CREATE INDEX `CommitmentMovement_measurementId_type_idx` ON `CommitmentMovement` (`measurementId`,`type`);
CREATE INDEX `Measurement_tenantId_commitmentId_status_idx` ON `Measurement` (`tenantId`,`commitmentId`,`status`);
CREATE INDEX `MeasurementItem_tenantId_measurementId_idx` ON `MeasurementItem` (`tenantId`,`measurementId`);
CREATE INDEX `WorkOrderBudget_tenantId_catalogId_idx` ON `WorkOrderBudget` (`tenantId`,`catalogId`);
CREATE INDEX `BudgetItem_tenantId_catalogItemId_idx` ON `BudgetItem` (`tenantId`,`catalogItemId`);
CREATE INDEX `WorkOrder_tenantId_maintenancePlanId_preventiveScheduledFor_idx` ON `WorkOrder` (`tenantId`,`maintenancePlanId`,`preventiveScheduledFor`);
CREATE UNIQUE INDEX `KpiMeasurement_calculationKey_key` ON `KpiMeasurement` (`calculationKey`);

ALTER TABLE `Commitment` ADD CONSTRAINT `Commitment_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CommitmentMovement` ADD CONSTRAINT `CommitmentMovement_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CommitmentMovement` ADD CONSTRAINT `CommitmentMovement_measurementId_fkey` FOREIGN KEY (`measurementId`) REFERENCES `Measurement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CommitmentMovement` ADD CONSTRAINT `CommitmentMovement_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Measurement` ADD CONSTRAINT `Measurement_commitmentId_fkey` FOREIGN KEY (`commitmentId`) REFERENCES `Commitment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Measurement` ADD CONSTRAINT `Measurement_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Measurement` ADD CONSTRAINT `Measurement_reviewedByUserId_fkey` FOREIGN KEY (`reviewedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `MeasurementItem` ADD CONSTRAINT `MeasurementItem_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SinapiCatalog` ADD CONSTRAINT `SinapiCatalog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SinapiCatalog` ADD CONSTRAINT `SinapiCatalog_importedByUserId_fkey` FOREIGN KEY (`importedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SinapiCatalogItem` ADD CONSTRAINT `SinapiCatalogItem_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SinapiCatalogItem` ADD CONSTRAINT `SinapiCatalogItem_catalogId_fkey` FOREIGN KEY (`catalogId`) REFERENCES `SinapiCatalog`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkOrderBudget` ADD CONSTRAINT `WorkOrderBudget_catalogId_fkey` FOREIGN KEY (`catalogId`) REFERENCES `SinapiCatalog`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkOrderBudget` ADD CONSTRAINT `WorkOrderBudget_submittedByUserId_fkey` FOREIGN KEY (`submittedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkOrderBudget` ADD CONSTRAINT `WorkOrderBudget_approvedByUserId_fkey` FOREIGN KEY (`approvedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `BudgetItem` ADD CONSTRAINT `BudgetItem_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `BudgetItem` ADD CONSTRAINT `BudgetItem_catalogItemId_fkey` FOREIGN KEY (`catalogItemId`) REFERENCES `SinapiCatalogItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `BudgetRevision` ADD CONSTRAINT `BudgetRevision_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `BudgetRevision` ADD CONSTRAINT `BudgetRevision_budgetId_fkey` FOREIGN KEY (`budgetId`) REFERENCES `WorkOrderBudget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BudgetRevision` ADD CONSTRAINT `BudgetRevision_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `MaintenancePlan` ADD CONSTRAINT `MaintenancePlan_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `OperationalCatalogItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `MaintenancePlan` ADD CONSTRAINT `MaintenancePlan_specialtyId_fkey` FOREIGN KEY (`specialtyId`) REFERENCES `OperationalCatalogItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `MaintenancePlan` ADD CONSTRAINT `MaintenancePlan_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `MaintenancePlan` ADD CONSTRAINT `MaintenancePlan_assignedToUserId_fkey` FOREIGN KEY (`assignedToUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_maintenancePlanId_fkey` FOREIGN KEY (`maintenancePlanId`) REFERENCES `MaintenancePlan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `MaintenancePlanGeneration` ADD CONSTRAINT `MaintenancePlanGeneration_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `MaintenancePlanGeneration` ADD CONSTRAINT `MaintenancePlanGeneration_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `MaintenancePlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MaintenancePlanGeneration` ADD CONSTRAINT `MaintenancePlanGeneration_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
