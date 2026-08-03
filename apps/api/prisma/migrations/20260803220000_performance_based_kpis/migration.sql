-- GP-045 / v0.13.0 — gestão contratual por desempenho.
-- Alterações aditivas; rollback exige preservar/exportar as memórias de cálculo antes de remover tabelas.

ALTER TABLE `KpiDefinition`
  MODIFY `category` ENUM(
    'OPERATIONAL','SLA','PREVENTIVE_MAINTENANCE','CORRECTIVE_MAINTENANCE','AVAILABILITY',
    'QUALITY','SATISFACTION','FINANCIAL','CONTRACTUAL','SUSTAINABILITY','RELIABILITY',
    'SAFETY','DOCUMENTATION','PREDICTIVE','SYSTEM_SPECIFIC'
  ) NOT NULL,
  MODIFY `periodicity` ENUM(
    'REAL_TIME','DAILY','WEEKLY','BIWEEKLY','MONTHLY','BIMONTHLY','QUARTERLY',
    'SEMIANNUAL','YEARLY','PER_WORK_ORDER','PER_ASSET','PER_SYSTEM','PER_CONTRACT'
  ) NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN `aggregation` ENUM('COUNT','SUM','AVERAGE','RATIO','LATEST') NOT NULL DEFAULT 'AVERAGE',
  ADD COLUMN `calculationMethod` VARCHAR(100) NOT NULL DEFAULT 'DATA_POINT_AVERAGE',
  ADD COLUMN `systemProvided` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `formulaExample` TEXT NULL,
  ADD COLUMN `objective` TEXT NULL,
  ADD COLUMN `dataSource` VARCHAR(220) NULL,
  ADD COLUMN `acceptableRange` VARCHAR(180) NULL,
  ADD COLUMN `responsibleRole` VARCHAR(120) NULL,
  ADD COLUMN `defaultWeight` DECIMAL(7,4) NULL,
  ADD COLUMN `deductionCriteria` TEXT NULL,
  ADD COLUMN `bonusCriteria` TEXT NULL,
  ADD COLUMN `benchmarkValue` DECIMAL(18,6) NULL,
  ADD COLUMN `formulaConfig` JSON NULL,
  ADD COLUMN `deletedAt` DATETIME(3) NULL;

DROP INDEX `KpiDefinition_tenantId_category_active_idx` ON `KpiDefinition`;
CREATE INDEX `KpiDefinition_tenantId_category_active_deletedAt_idx`
  ON `KpiDefinition` (`tenantId`,`category`,`active`,`deletedAt`);

ALTER TABLE `KpiMeasurement`
  DROP FOREIGN KEY `KpiMeasurement_definitionId_fkey`,
  ADD COLUMN `workOrderId` CHAR(36) NULL,
  ADD COLUMN `maintenancePlanId` CHAR(36) NULL,
  ADD COLUMN `assetId` CHAR(36) NULL,
  ADD COLUMN `normalizedScore` DECIMAL(9,4) NULL,
  ADD COLUMN `performanceBand` VARCHAR(30) NULL,
  ADD COLUMN `formulaSnapshot` TEXT NULL;

CREATE INDEX `KpiMeasurement_tenantId_supplierId_periodEnd_idx`
  ON `KpiMeasurement` (`tenantId`,`supplierId`,`periodEnd`);
CREATE INDEX `KpiMeasurement_tenantId_workOrderId_periodEnd_idx`
  ON `KpiMeasurement` (`tenantId`,`workOrderId`,`periodEnd`);

ALTER TABLE `KpiMeasurement`
  ADD CONSTRAINT `KpiMeasurement_definitionId_fkey` FOREIGN KEY (`definitionId`) REFERENCES `KpiDefinition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiMeasurement_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiMeasurement_maintenancePlanId_fkey` FOREIGN KEY (`maintenancePlanId`) REFERENCES `MaintenancePlan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiMeasurement_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Measurement`
  ADD COLUMN `performanceDeductions` DECIMAL(16,2) NOT NULL DEFAULT 0,
  ADD COLUMN `bonuses` DECIMAL(16,2) NOT NULL DEFAULT 0,
  ADD COLUMN `performanceIndex` DECIMAL(9,4) NULL;

CREATE TABLE `ContractKpi` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `contractId` CHAR(36) NOT NULL,
  `definitionId` CHAR(36) NOT NULL,
  `targetValue` DECIMAL(18,6) NULL,
  `warningValue` DECIMAL(18,6) NULL,
  `criticalValue` DECIMAL(18,6) NULL,
  `weight` DECIMAL(7,4) NOT NULL DEFAULT 0,
  `financialRole` ENUM('INFORMATIONAL','PERFORMANCE','DEDUCTION','BONUS','DEDUCTION_AND_BONUS') NOT NULL DEFAULT 'PERFORMANCE',
  `deductionCapPercent` DECIMAL(7,4) NULL,
  `bonusCapPercent` DECIMAL(7,4) NULL,
  `roundingScale` INTEGER NOT NULL DEFAULT 2,
  `roundingMode` VARCHAR(30) NOT NULL DEFAULT 'HALF_UP',
  `actionPlanTrigger` BOOLEAN NOT NULL DEFAULT false,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  UNIQUE INDEX `ContractKpi_contractId_definitionId_key` (`contractId`,`definitionId`),
  INDEX `ContractKpi_tenantId_contractId_active_deletedAt_idx` (`tenantId`,`contractId`,`active`,`deletedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `KpiPerformanceBand` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `contractKpiId` CHAR(36) NOT NULL,
  `label` VARCHAR(80) NOT NULL,
  `rating` VARCHAR(30) NOT NULL,
  `minValue` DECIMAL(18,6) NULL,
  `maxValue` DECIMAL(18,6) NULL,
  `score` DECIMAL(7,4) NOT NULL,
  `adjustmentType` ENUM('NONE','DEDUCTION','BONUS') NOT NULL DEFAULT 'NONE',
  `adjustmentPercent` DECIMAL(7,4) NULL,
  `fixedAmount` DECIMAL(16,2) NULL,
  `triggerActionPlan` BOOLEAN NOT NULL DEFAULT false,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  UNIQUE INDEX `KpiPerformanceBand_contractKpiId_rating_key` (`contractKpiId`,`rating`),
  INDEX `KpiPerformanceBand_tenantId_contractKpiId_active_sortOrder_idx` (`tenantId`,`contractKpiId`,`active`,`sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `KpiDataPoint` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `definitionId` CHAR(36) NOT NULL,
  `buildingId` CHAR(36) NULL,
  `contractId` CHAR(36) NULL,
  `supplierId` CHAR(36) NULL,
  `occurredAt` DATETIME(3) NOT NULL,
  `value` DECIMAL(18,6) NOT NULL,
  `numerator` DECIMAL(18,6) NULL,
  `denominator` DECIMAL(18,6) NULL,
  `source` VARCHAR(80) NOT NULL DEFAULT 'USER_INPUT',
  `sourceReference` VARCHAR(160) NULL,
  `dimensions` JSON NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `KpiDataPoint_tenantId_definitionId_sourceReference_key` (`tenantId`,`definitionId`,`sourceReference`),
  INDEX `KpiDataPoint_tenantId_definitionId_occurredAt_idx` (`tenantId`,`definitionId`,`occurredAt`),
  INDEX `KpiDataPoint_tenantId_contractId_occurredAt_idx` (`tenantId`,`contractId`,`occurredAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `KpiFinancialAdjustment` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `contractId` CHAR(36) NOT NULL,
  `contractKpiId` CHAR(36) NOT NULL,
  `kpiMeasurementId` CHAR(36) NOT NULL,
  `financialMeasurementId` CHAR(36) NULL,
  `referenceMonth` VARCHAR(7) NOT NULL,
  `type` ENUM('NONE','DEDUCTION','BONUS') NOT NULL,
  `percentage` DECIMAL(7,4) NOT NULL DEFAULT 0,
  `basisAmount` DECIMAL(16,2) NOT NULL,
  `amount` DECIMAL(16,2) NOT NULL,
  `formula` TEXT NOT NULL,
  `calculationMemory` JSON NOT NULL,
  `status` ENUM('CALCULATED','APPLIED','WAIVED') NOT NULL DEFAULT 'CALCULATED',
  `appliedAt` DATETIME(3) NULL,
  `waivedAt` DATETIME(3) NULL,
  `justification` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `KpiAdjustment_measurement_contractKpi_key` (`financialMeasurementId`,`contractKpiId`),
  INDEX `KpiAdjustment_tenant_contract_month_status_idx` (`tenantId`,`contractId`,`referenceMonth`,`status`),
  INDEX `KpiAdjustment_tenant_kpiMeasurement_idx` (`tenantId`,`kpiMeasurementId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `KpiAlert` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `contractId` CHAR(36) NULL,
  `contractKpiId` CHAR(36) NULL,
  `kpiMeasurementId` CHAR(36) NULL,
  `type` ENUM('NEAR_LIMIT','TARGET_MISSED','SLA_EXPIRING','CRITICAL_ASSET','PERFORMANCE_DROP','CONTRACT_RISK','ACTION_PLAN') NOT NULL,
  `severity` ENUM('INFO','WARNING','CRITICAL') NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `message` TEXT NOT NULL,
  `dedupeKey` CHAR(64) NOT NULL,
  `actionPlanRequired` BOOLEAN NOT NULL DEFAULT false,
  `acknowledgedAt` DATETIME(3) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `KpiAlert_tenantId_dedupeKey_key` (`tenantId`,`dedupeKey`),
  INDEX `KpiAlert_tenantId_severity_resolvedAt_createdAt_idx` (`tenantId`,`severity`,`resolvedAt`,`createdAt`),
  INDEX `KpiAlert_tenantId_contractId_resolvedAt_idx` (`tenantId`,`contractId`,`resolvedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ContractKpi`
  ADD CONSTRAINT `ContractKpi_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ContractKpi_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ContractKpi_definitionId_fkey` FOREIGN KEY (`definitionId`) REFERENCES `KpiDefinition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `KpiPerformanceBand`
  ADD CONSTRAINT `KpiPerformanceBand_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiPerformanceBand_contractKpiId_fkey` FOREIGN KEY (`contractKpiId`) REFERENCES `ContractKpi`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `KpiDataPoint`
  ADD CONSTRAINT `KpiDataPoint_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiDataPoint_definitionId_fkey` FOREIGN KEY (`definitionId`) REFERENCES `KpiDefinition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiDataPoint_buildingId_fkey` FOREIGN KEY (`buildingId`) REFERENCES `Building`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiDataPoint_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiDataPoint_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `KpiFinancialAdjustment`
  ADD CONSTRAINT `KpiFinancialAdjustment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiFinancialAdjustment_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiFinancialAdjustment_contractKpiId_fkey` FOREIGN KEY (`contractKpiId`) REFERENCES `ContractKpi`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiFinancialAdjustment_kpiMeasurementId_fkey` FOREIGN KEY (`kpiMeasurementId`) REFERENCES `KpiMeasurement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiFinancialAdjustment_financialMeasurementId_fkey` FOREIGN KEY (`financialMeasurementId`) REFERENCES `Measurement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `KpiAlert`
  ADD CONSTRAINT `KpiAlert_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiAlert_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiAlert_contractKpiId_fkey` FOREIGN KEY (`contractKpiId`) REFERENCES `ContractKpi`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `KpiAlert_kpiMeasurementId_fkey` FOREIGN KEY (`kpiMeasurementId`) REFERENCES `KpiMeasurement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
