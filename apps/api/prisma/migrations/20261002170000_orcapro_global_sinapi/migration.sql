-- CreateTable
CREATE TABLE `OrcaproReference` (
    `id` CHAR(36) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `label` VARCHAR(100) NOT NULL,
    `status` ENUM('DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `sourceChecksum` CHAR(64) NOT NULL,
    `sourceName` VARCHAR(255) NOT NULL,
    `importedByUserId` CHAR(36) NOT NULL,
    `metadata` JSON NOT NULL,
    `validation` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `validatedAt` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `OrcaproReference_status_year_month_idx`(`status`, `year`, `month`),
    INDEX `OrcaproReference_sourceChecksum_idx`(`sourceChecksum`),
    UNIQUE INDEX `OrcaproReference_year_month_revision_key`(`year`, `month`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproSettings` (
    `id` VARCHAR(30) NOT NULL,
    `defaultReferenceId` CHAR(36) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproInput` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,

    UNIQUE INDEX `OrcaproInput_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproInputVersion` (
    `id` CHAR(36) NOT NULL,
    `referenceId` CHAR(36) NOT NULL,
    `inputId` CHAR(36) NOT NULL,
    `description` TEXT NOT NULL,
    `unit` VARCHAR(40) NOT NULL,
    `nature` VARCHAR(100) NOT NULL,
    `origin` VARCHAR(100) NOT NULL,
    `metadata` JSON NULL,

    INDEX `OrcaproInputVersion_referenceId_nature_idx`(`referenceId`, `nature`),
    UNIQUE INDEX `OrcaproInputVersion_referenceId_inputId_key`(`referenceId`, `inputId`),
    FULLTEXT INDEX `OrcaproInputVersion_description_idx`(`description`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproInputPrice` (
    `id` CHAR(36) NOT NULL,
    `referenceId` CHAR(36) NOT NULL,
    `inputId` CHAR(36) NOT NULL,
    `uf` CHAR(2) NOT NULL,
    `regime` ENUM('SD', 'CD', 'SE') NOT NULL,
    `amount` DECIMAL(18, 6) NULL,
    `source` VARCHAR(100) NOT NULL,

    INDEX `OrcaproInputPrice_referenceId_uf_regime_idx`(`referenceId`, `uf`, `regime`),
    UNIQUE INDEX `OrcaproInputPrice_referenceId_inputId_uf_regime_key`(`referenceId`, `inputId`, `uf`, `regime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproComposition` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,

    UNIQUE INDEX `OrcaproComposition_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproCompositionVersion` (
    `id` CHAR(36) NOT NULL,
    `referenceId` CHAR(36) NOT NULL,
    `compositionId` CHAR(36) NOT NULL,
    `description` TEXT NOT NULL,
    `unit` VARCHAR(40) NOT NULL,
    `group` VARCHAR(255) NOT NULL,
    `metadata` JSON NULL,

    INDEX `OrcaproCompositionVersion_referenceId_group_idx`(`referenceId`, `group`),
    UNIQUE INDEX `OrcaproCompositionVersion_referenceId_compositionId_key`(`referenceId`, `compositionId`),
    FULLTEXT INDEX `OrcaproCompositionVersion_description_idx`(`description`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproAnalyticItem` (
    `id` CHAR(36) NOT NULL,
    `compositionVersionId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `inputId` CHAR(36) NULL,
    `childCompositionId` CHAR(36) NULL,
    `coefficient` DECIMAL(24, 12) NOT NULL,

    INDEX `OrcaproAnalyticItem_inputId_idx`(`inputId`),
    INDEX `OrcaproAnalyticItem_childCompositionId_idx`(`childCompositionId`),
    UNIQUE INDEX `OrcaproAnalyticItem_compositionVersionId_position_key`(`compositionVersionId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproProject` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `ownerUserId` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `referenceId` CHAR(36) NOT NULL,
    `uf` CHAR(2) NOT NULL,
    `regime` ENUM('SD', 'CD', 'SE') NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `data` JSON NOT NULL,
    `templateId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `OrcaproProject_tenantId_ownerUserId_archivedAt_updatedAt_idx`(`tenantId`, `ownerUserId`, `archivedAt`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproProjectVersion` (
    `id` CHAR(36) NOT NULL,
    `projectId` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `referenceId` CHAR(36) NOT NULL,
    `uf` CHAR(2) NOT NULL,
    `regime` ENUM('SD', 'CD', 'SE') NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `data` JSON NOT NULL,
    `engineVersion` VARCHAR(80) NOT NULL,
    `createdByUserId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OrcaproProjectVersion_projectId_version_key`(`projectId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproTemplate` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(80) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `referenceId` CHAR(36) NOT NULL,
    `uf` CHAR(2) NOT NULL,
    `regime` ENUM('SD', 'CD', 'SE') NOT NULL,
    `data` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `isPublic` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OrcaproTemplate_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproCustomComposition` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `ownerUserId` CHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `description` TEXT NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `data` JSON NOT NULL,
    `originType` VARCHAR(30) NOT NULL,
    `originCode` VARCHAR(40) NULL,
    `originReferenceId` CHAR(36) NULL,
    `originCompositionId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `archivedAt` DATETIME(3) NULL,

    INDEX `OrcaproCustomComposition_tenantId_ownerUserId_archivedAt_idx`(`tenantId`, `ownerUserId`, `archivedAt`),
    UNIQUE INDEX `OrcaproCustomComposition_tenantId_ownerUserId_code_revision_key`(`tenantId`, `ownerUserId`, `code`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproCustomInput` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `ownerUserId` CHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `archivedAt` DATETIME(3) NULL,

    INDEX `OrcaproCustomInput_tenantId_ownerUserId_archivedAt_idx`(`tenantId`, `ownerUserId`, `archivedAt`),
    UNIQUE INDEX `OrcaproCustomInput_tenantId_ownerUserId_code_revision_key`(`tenantId`, `ownerUserId`, `code`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproImport` (
    `id` CHAR(36) NOT NULL,
    `referenceId` CHAR(36) NOT NULL,
    `createdByUserId` CHAR(36) NOT NULL,
    `checksum` CHAR(64) NOT NULL,
    `sourceName` VARCHAR(255) NOT NULL,
    `report` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrcaproImport_referenceId_idx`(`referenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproAudit` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NULL,
    `actorUserId` CHAR(36) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `entityId` VARCHAR(100) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrcaproAudit_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `OrcaproAudit_entityId_createdAt_idx`(`entityId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrcaproSettings` ADD CONSTRAINT `OrcaproSettings_defaultReferenceId_fkey` FOREIGN KEY (`defaultReferenceId`) REFERENCES `OrcaproReference`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproInputVersion` ADD CONSTRAINT `OrcaproInputVersion_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `OrcaproReference`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproInputVersion` ADD CONSTRAINT `OrcaproInputVersion_inputId_fkey` FOREIGN KEY (`inputId`) REFERENCES `OrcaproInput`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproInputPrice` ADD CONSTRAINT `OrcaproInputPrice_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `OrcaproReference`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproInputPrice` ADD CONSTRAINT `OrcaproInputPrice_inputId_fkey` FOREIGN KEY (`inputId`) REFERENCES `OrcaproInput`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproCompositionVersion` ADD CONSTRAINT `OrcaproCompositionVersion_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `OrcaproReference`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproCompositionVersion` ADD CONSTRAINT `OrcaproCompositionVersion_compositionId_fkey` FOREIGN KEY (`compositionId`) REFERENCES `OrcaproComposition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproAnalyticItem` ADD CONSTRAINT `OrcaproAnalyticItem_compositionVersionId_fkey` FOREIGN KEY (`compositionVersionId`) REFERENCES `OrcaproCompositionVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproAnalyticItem` ADD CONSTRAINT `OrcaproAnalyticItem_inputId_fkey` FOREIGN KEY (`inputId`) REFERENCES `OrcaproInput`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OrcaproAnalyticItem` ADD CONSTRAINT `OrcaproAnalyticItem_childCompositionId_fkey` FOREIGN KEY (`childCompositionId`) REFERENCES `OrcaproComposition`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OrcaproProject` ADD CONSTRAINT `OrcaproProject_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproProject` ADD CONSTRAINT `OrcaproProject_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproProject` ADD CONSTRAINT `OrcaproProject_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `OrcaproReference`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproProject` ADD CONSTRAINT `OrcaproProject_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `OrcaproTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproProjectVersion` ADD CONSTRAINT `OrcaproProjectVersion_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `OrcaproProject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproProjectVersion` ADD CONSTRAINT `OrcaproProjectVersion_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `OrcaproReference`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproTemplate` ADD CONSTRAINT `OrcaproTemplate_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `OrcaproReference`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproCustomComposition` ADD CONSTRAINT `OrcaproCustomComposition_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproCustomComposition` ADD CONSTRAINT `OrcaproCustomComposition_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproCustomComposition` ADD CONSTRAINT `OrcaproCustomComposition_originReferenceId_fkey` FOREIGN KEY (`originReferenceId`) REFERENCES `OrcaproReference`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproCustomComposition` ADD CONSTRAINT `OrcaproCustomComposition_originCompositionId_fkey` FOREIGN KEY (`originCompositionId`) REFERENCES `OrcaproComposition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproCustomInput` ADD CONSTRAINT `OrcaproCustomInput_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproCustomInput` ADD CONSTRAINT `OrcaproCustomInput_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproImport` ADD CONSTRAINT `OrcaproImport_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `OrcaproReference`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- MySQL 8.0.16+: typagem exclusiva dos componentes e coeficientes não negativos.
ALTER TABLE `OrcaproAnalyticItem` ADD CONSTRAINT `OrcaproAnalyticItem_typed_child_check`
  CHECK ((`inputId` IS NOT NULL AND `childCompositionId` IS NULL) OR (`inputId` IS NULL AND `childCompositionId` IS NOT NULL));
ALTER TABLE `OrcaproAnalyticItem` ADD CONSTRAINT `OrcaproAnalyticItem_coefficient_check` CHECK (`coefficient` >= 0);
ALTER TABLE `OrcaproReference` ADD CONSTRAINT `OrcaproReference_month_check` CHECK (`month` BETWEEN 1 AND 12 AND `revision` >= 1);
ALTER TABLE `OrcaproInputPrice` ADD CONSTRAINT `OrcaproInputPrice_amount_check` CHECK (`amount` IS NULL OR `amount` >= 0);

