-- Fornecedores, governança contratual e importação XLSX SINAPI.
-- Migração aditiva; os tenantIds dos registros contratuais legados são preenchidos pelo contrato.

SET time_zone = '+00:00';

ALTER TABLE `Supplier`
  ADD COLUMN `kind` ENUM('COMPANY','CONSORTIUM') NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN `addressLine1` VARCHAR(240) NULL,
  ADD COLUMN `addressLine2` VARCHAR(160) NULL,
  ADD COLUMN `district` VARCHAR(120) NULL,
  ADD COLUMN `city` VARCHAR(120) NULL,
  ADD COLUMN `state` CHAR(2) NULL,
  ADD COLUMN `postalCode` VARCHAR(12) NULL;

CREATE TABLE `SupplierServiceArea` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `supplierId` CHAR(36) NOT NULL,
  `categoryId` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3) NULL,
  UNIQUE INDEX `SupplierServiceArea_supplierId_categoryId_key` (`supplierId`,`categoryId`),
  INDEX `SupplierServiceArea_tenantId_categoryId_deletedAt_idx` (`tenantId`,`categoryId`,`deletedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupplierConsortiumMember` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `consortiumId` CHAR(36) NOT NULL,
  `memberSupplierId` CHAR(36) NOT NULL,
  `participationPercentage` DECIMAL(7,4) NULL,
  `isLeader` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3) NULL,
  UNIQUE INDEX `SupplierConsortiumMember_consortiumId_memberSupplierId_key` (`consortiumId`,`memberSupplierId`),
  INDEX `SupplierConsortium_tenant_member_deleted_idx` (`tenantId`,`memberSupplierId`,`deletedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ContractAmendment`
  ADD COLUMN `tenantId` CHAR(36) NULL,
  ADD COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `canceledAt` DATETIME(3) NULL;
UPDATE `ContractAmendment` ca INNER JOIN `Contract` c ON c.`id`=ca.`contractId` SET ca.`tenantId`=c.`tenantId`;
ALTER TABLE `ContractAmendment` MODIFY `tenantId` CHAR(36) NOT NULL;
CREATE INDEX `ContractAmendment_tenantId_contractId_status_idx` ON `ContractAmendment` (`tenantId`,`contractId`,`status`);

ALTER TABLE `ContractAdjustment`
  ADD COLUMN `tenantId` CHAR(36) NULL,
  ADD COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `canceledAt` DATETIME(3) NULL;
UPDATE `ContractAdjustment` ca INNER JOIN `Contract` c ON c.`id`=ca.`contractId` SET ca.`tenantId`=c.`tenantId`;
ALTER TABLE `ContractAdjustment` MODIFY `tenantId` CHAR(36) NOT NULL;
CREATE INDEX `ContractAdjustment_tenant_contract_period_idx` ON `ContractAdjustment` (`tenantId`,`contractId`,`type`,`referencePeriod`);

ALTER TABLE `ContractSubcontract`
  ADD COLUMN `tenantId` CHAR(36) NULL,
  ADD COLUMN `supplierId` CHAR(36) NULL,
  ADD COLUMN `authorizationCase` VARCHAR(120) NULL,
  ADD COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN `canceledAt` DATETIME(3) NULL;
UPDATE `ContractSubcontract` cs INNER JOIN `Contract` c ON c.`id`=cs.`contractId` SET cs.`tenantId`=c.`tenantId`;
ALTER TABLE `ContractSubcontract` MODIFY `tenantId` CHAR(36) NOT NULL;
CREATE INDEX `ContractSubcontract_tenantId_contractId_status_idx` ON `ContractSubcontract` (`tenantId`,`contractId`,`status`);
CREATE INDEX `ContractSubcontract_supplierId_idx` ON `ContractSubcontract` (`supplierId`);

ALTER TABLE `SinapiCatalog`
  DROP INDEX `SinapiCatalog_tenantId_state_referenceMonth_source_version_key`,
  ADD COLUMN `priceRegime` ENUM('NON_EXEMPT','EXEMPT','NOT_APPLICABLE') NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN `catalogKind` ENUM('INPUTS','COMPOSITIONS','MIXED') NOT NULL DEFAULT 'MIXED',
  ADD UNIQUE INDEX `SinapiCatalog_scope_version_key` (`tenantId`,`state`,`referenceMonth`,`source`,`version`,`priceRegime`,`catalogKind`);

ALTER TABLE `SupplierServiceArea`
  ADD CONSTRAINT `SupplierServiceArea_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `SupplierServiceArea_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `SupplierServiceArea_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `OperationalCatalogItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SupplierConsortiumMember`
  ADD CONSTRAINT `SupplierConsortiumMember_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `SupplierConsortiumMember_consortiumId_fkey` FOREIGN KEY (`consortiumId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `SupplierConsortiumMember_memberSupplierId_fkey` FOREIGN KEY (`memberSupplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ContractAmendment`
  ADD CONSTRAINT `ContractAmendment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ContractAdjustment`
  ADD CONSTRAINT `ContractAdjustment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ContractSubcontract`
  ADD CONSTRAINT `ContractSubcontract_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ContractSubcontract_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
