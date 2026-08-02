-- CreateTable
CREATE TABLE `Tenant` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `taxId` VARCHAR(24) NULL,
    `status` ENUM('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED') NOT NULL DEFAULT 'TRIAL',
    `timezone` VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    `locale` VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    `trialEndsAt` DATETIME(3) NULL,
    `stripeCustomerId` VARCHAR(120) NULL,
    `settings` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Tenant_slug_key`(`slug`),
    UNIQUE INDEX `Tenant_stripeCustomerId_key`(`stripeCustomerId`),
    INDEX `Tenant_status_idx`(`status`),
    INDEX `Tenant_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(30) NULL,
    `status` ENUM('ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `emailVerifiedAt` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_status_idx`(`status`),
    INDEX `User_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantMembership` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MANAGER', 'CONTRACT_MANAGER', 'CONTRACT_INSPECTOR', 'OPERATOR', 'REQUESTER', 'AUDITOR') NOT NULL DEFAULT 'REQUESTER',
    `status` ENUM('ACTIVE', 'INVITED', 'SUSPENDED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `invitedAt` DATETIME(3) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TenantMembership_tenantId_role_status_idx`(`tenantId`, `role`, `status`),
    INDEX `TenantMembership_userId_status_idx`(`userId`, `status`),
    UNIQUE INDEX `TenantMembership_tenantId_userId_key`(`tenantId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshSession` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `membershipId` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `userAgent` VARCHAR(500) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshSession_tokenHash_key`(`tokenHash`),
    INDEX `RefreshSession_userId_revokedAt_expiresAt_idx`(`userId`, `revokedAt`, `expiresAt`),
    INDEX `RefreshSession_membershipId_revokedAt_idx`(`membershipId`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantSequence` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `currentValue` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TenantSequence_tenantId_key_key`(`tenantId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Building` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `type` VARCHAR(100) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'UNDER_CONSTRUCTION', 'DISPOSED') NOT NULL DEFAULT 'ACTIVE',
    `managerUserId` CHAR(36) NULL,
    `addressLine1` VARCHAR(220) NOT NULL,
    `addressLine2` VARCHAR(160) NULL,
    `district` VARCHAR(120) NULL,
    `city` VARCHAR(120) NOT NULL,
    `state` CHAR(2) NOT NULL,
    `postalCode` VARCHAR(12) NOT NULL,
    `country` CHAR(2) NOT NULL DEFAULT 'BR',
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `geocodedAt` DATETIME(3) NULL,
    `grossAreaM2` DECIMAL(14, 2) NULL,
    `constructionYear` INTEGER NULL,
    `floors` INTEGER NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Building_tenantId_status_deletedAt_idx`(`tenantId`, `status`, `deletedAt`),
    INDEX `Building_tenantId_city_state_idx`(`tenantId`, `city`, `state`),
    INDEX `Building_latitude_longitude_idx`(`latitude`, `longitude`),
    UNIQUE INDEX `Building_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Supplier` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `legalName` VARCHAR(200) NOT NULL,
    `tradeName` VARCHAR(180) NULL,
    `taxId` VARCHAR(24) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'BLOCKED', 'UNDER_REVIEW') NOT NULL DEFAULT 'ACTIVE',
    `email` VARCHAR(190) NULL,
    `phone` VARCHAR(30) NULL,
    `contactName` VARCHAR(160) NULL,
    `address` JSON NULL,
    `serviceAreas` JSON NULL,
    `notes` TEXT NULL,
    `rating` DECIMAL(3, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Supplier_tenantId_status_deletedAt_idx`(`tenantId`, `status`, `deletedAt`),
    INDEX `Supplier_tenantId_legalName_idx`(`tenantId`, `legalName`),
    UNIQUE INDEX `Supplier_tenantId_taxId_key`(`tenantId`, `taxId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contract` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `supplierId` CHAR(36) NOT NULL,
    `code` VARCHAR(80) NOT NULL,
    `administrativeProcess` VARCHAR(120) NULL,
    `object` TEXT NOT NULL,
    `type` ENUM('PREVENTIVE_MAINTENANCE', 'CORRECTIVE_MAINTENANCE', 'INTEGRATED_MAINTENANCE', 'OUTSOURCED_LABOR', 'SUPPLY', 'OTHER') NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRING', 'EXPIRED', 'TERMINATED', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `managerUserId` CHAR(36) NULL,
    `inspectorUserId` CHAR(36) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `signatureDate` DATETIME(3) NULL,
    `originalValue` DECIMAL(16, 2) NOT NULL,
    `currentValue` DECIMAL(16, 2) NOT NULL,
    `measuredValue` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `paidValue` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `adjustmentBaseDate` DATETIME(3) NULL,
    `adjustmentIndex` VARCHAR(80) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Contract_tenantId_status_endDate_deletedAt_idx`(`tenantId`, `status`, `endDate`, `deletedAt`),
    INDEX `Contract_tenantId_supplierId_status_idx`(`tenantId`, `supplierId`, `status`),
    UNIQUE INDEX `Contract_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContractBuilding` (
    `id` CHAR(36) NOT NULL,
    `contractId` CHAR(36) NOT NULL,
    `buildingId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContractBuilding_buildingId_idx`(`buildingId`),
    UNIQUE INDEX `ContractBuilding_contractId_buildingId_key`(`contractId`, `buildingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContractAmendment` (
    `id` CHAR(36) NOT NULL,
    `contractId` CHAR(36) NOT NULL,
    `number` VARCHAR(60) NOT NULL,
    `type` ENUM('VALUE_INCREASE', 'VALUE_DECREASE', 'SCOPE_CHANGE', 'TERM_EXTENSION', 'OTHER') NOT NULL,
    `description` TEXT NOT NULL,
    `signedAt` DATETIME(3) NULL,
    `effectiveAt` DATETIME(3) NULL,
    `endDateBefore` DATETIME(3) NULL,
    `endDateAfter` DATETIME(3) NULL,
    `valueChange` DECIMAL(16, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ContractAmendment_contractId_number_key`(`contractId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContractAdjustment` (
    `id` CHAR(36) NOT NULL,
    `contractId` CHAR(36) NOT NULL,
    `type` ENUM('PRICE_ADJUSTMENT', 'REPACTUATION', 'ECONOMIC_REBALANCING') NOT NULL,
    `referencePeriod` VARCHAR(20) NOT NULL,
    `requestDate` DATETIME(3) NULL,
    `approvalDate` DATETIME(3) NULL,
    `percentage` DECIMAL(9, 6) NULL,
    `amount` DECIMAL(16, 2) NULL,
    `indexName` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContractAdjustment_contractId_type_referencePeriod_idx`(`contractId`, `type`, `referencePeriod`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContractSubcontract` (
    `id` CHAR(36) NOT NULL,
    `contractId` CHAR(36) NOT NULL,
    `subcontractorName` VARCHAR(200) NOT NULL,
    `subcontractorTaxId` VARCHAR(24) NULL,
    `scope` TEXT NOT NULL,
    `amount` DECIMAL(16, 2) NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContractSubcontract_contractId_idx`(`contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContractPenalty` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `contractId` CHAR(36) NULL,
    `supplierId` CHAR(36) NOT NULL,
    `registeredByUserId` CHAR(36) NULL,
    `type` ENUM('WARNING', 'FINE', 'TEMPORARY_SUSPENSION', 'DEBARMENT', 'OTHER') NOT NULL,
    `administrativeCase` VARCHAR(120) NULL,
    `description` TEXT NOT NULL,
    `amount` DECIMAL(16, 2) NULL,
    `appliedAt` DATETIME(3) NOT NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContractPenalty_tenantId_supplierId_appliedAt_idx`(`tenantId`, `supplierId`, `appliedAt`),
    INDEX `ContractPenalty_contractId_idx`(`contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Commitment` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `contractId` CHAR(36) NOT NULL,
    `number` VARCHAR(80) NOT NULL,
    `fiscalYear` INTEGER NOT NULL,
    `issueDate` DATETIME(3) NOT NULL,
    `originalValue` DECIMAL(16, 2) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Commitment_tenantId_contractId_fiscalYear_idx`(`tenantId`, `contractId`, `fiscalYear`),
    UNIQUE INDEX `Commitment_tenantId_number_fiscalYear_key`(`tenantId`, `number`, `fiscalYear`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommitmentMovement` (
    `id` CHAR(36) NOT NULL,
    `commitmentId` CHAR(36) NOT NULL,
    `type` ENUM('ISSUE', 'REINFORCEMENT', 'CANCELLATION', 'LIQUIDATION', 'PAYMENT') NOT NULL,
    `amount` DECIMAL(16, 2) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `documentRef` VARCHAR(120) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CommitmentMovement_commitmentId_occurredAt_idx`(`commitmentId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkOrder` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `buildingId` CHAR(36) NOT NULL,
    `requesterUserId` CHAR(36) NOT NULL,
    `assignedToUserId` CHAR(36) NULL,
    `createdByUserId` CHAR(36) NOT NULL,
    `supplierId` CHAR(36) NULL,
    `title` VARCHAR(220) NOT NULL,
    `description` TEXT NOT NULL,
    `locationDetail` VARCHAR(220) NULL,
    `origin` ENUM('USER_REQUEST', 'PREVENTIVE_PLAN', 'INSPECTION', 'RECURRENT_FAILURE', 'CONTRACT_REQUIREMENT', 'OTHER') NOT NULL DEFAULT 'USER_REQUEST',
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING', 'WAITING_APPROVAL', 'COMPLETED', 'CLOSED', 'CANCELED') NOT NULL DEFAULT 'OPEN',
    `hasOpenPendency` BOOLEAN NOT NULL DEFAULT false,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `triagedAt` DATETIME(3) NULL,
    `assignedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `canceledAt` DATETIME(3) NULL,
    `dueAt` DATETIME(3) NULL,
    `slaResponseDeadline` DATETIME(3) NULL,
    `slaResolutionDeadline` DATETIME(3) NULL,
    `estimatedCost` DECIMAL(16, 2) NULL,
    `approvedCost` DECIMAL(16, 2) NULL,
    `finalCost` DECIMAL(16, 2) NULL,
    `energySavedKwh` DECIMAL(16, 3) NULL,
    `waterSavedLiters` DECIMAL(16, 2) NULL,
    `avoidedCorrectiveFail` BOOLEAN NULL DEFAULT false,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `WorkOrder_tenantId_status_openedAt_deletedAt_idx`(`tenantId`, `status`, `openedAt`, `deletedAt`),
    INDEX `WorkOrder_tenantId_buildingId_status_openedAt_idx`(`tenantId`, `buildingId`, `status`, `openedAt`),
    INDEX `WorkOrder_tenantId_supplierId_status_openedAt_idx`(`tenantId`, `supplierId`, `status`, `openedAt`),
    INDEX `WorkOrder_tenantId_requesterUserId_status_openedAt_idx`(`tenantId`, `requesterUserId`, `status`, `openedAt`),
    INDEX `WorkOrder_tenantId_hasOpenPendency_status_idx`(`tenantId`, `hasOpenPendency`, `status`),
    INDEX `WorkOrder_tenantId_slaResolutionDeadline_status_idx`(`tenantId`, `slaResolutionDeadline`, `status`),
    INDEX `WorkOrder_tenantId_priority_status_idx`(`tenantId`, `priority`, `status`),
    UNIQUE INDEX `WorkOrder_tenantId_number_key`(`tenantId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkOrderContract` (
    `id` CHAR(36) NOT NULL,
    `workOrderId` CHAR(36) NOT NULL,
    `contractId` CHAR(36) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `allocatedAmount` DECIMAL(16, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorkOrderContract_contractId_idx`(`contractId`),
    UNIQUE INDEX `WorkOrderContract_workOrderId_contractId_key`(`workOrderId`, `contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkOrderPendency` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `workOrderId` CHAR(36) NOT NULL,
    `responsibleUserId` CHAR(36) NULL,
    `status` ENUM('OPEN', 'RESOLVED', 'CANCELED') NOT NULL DEFAULT 'OPEN',
    `previousStatus` ENUM('OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING', 'WAITING_APPROVAL', 'COMPLETED', 'CLOSED', 'CANCELED') NOT NULL,
    `reason` TEXT NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolution` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WorkOrderPendency_tenantId_status_dueAt_idx`(`tenantId`, `status`, `dueAt`),
    INDEX `WorkOrderPendency_workOrderId_status_idx`(`workOrderId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkOrderAttachment` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `workOrderId` CHAR(36) NOT NULL,
    `uploadedByUserId` CHAR(36) NOT NULL,
    `kind` ENUM('PHOTO_BEFORE', 'PHOTO_DURING', 'PHOTO_AFTER', 'INVOICE_PDF', 'TECHNICAL_REPORT', 'QUOTATION', 'OTHER_DOCUMENT') NOT NULL,
    `storageKey` VARCHAR(500) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `sizeBytes` BIGINT NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `WorkOrderAttachment_storageKey_key`(`storageKey`),
    INDEX `WorkOrderAttachment_tenantId_workOrderId_kind_deletedAt_idx`(`tenantId`, `workOrderId`, `kind`, `deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkOrderStatusHistory` (
    `id` CHAR(36) NOT NULL,
    `workOrderId` CHAR(36) NOT NULL,
    `changedByUserId` CHAR(36) NOT NULL,
    `fromStatus` ENUM('OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING', 'WAITING_APPROVAL', 'COMPLETED', 'CLOSED', 'CANCELED') NULL,
    `toStatus` ENUM('OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING', 'WAITING_APPROVAL', 'COMPLETED', 'CLOSED', 'CANCELED') NOT NULL,
    `note` TEXT NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorkOrderStatusHistory_workOrderId_changedAt_idx`(`workOrderId`, `changedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkOrderBudget` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `workOrderId` CHAR(36) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `referenceMonth` VARCHAR(7) NULL,
    `state` CHAR(2) NULL,
    `subtotal` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `bdiPercentage` DECIMAL(9, 6) NOT NULL DEFAULT 0,
    `total` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkOrderBudget_workOrderId_key`(`workOrderId`),
    INDEX `WorkOrderBudget_tenantId_status_idx`(`tenantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BudgetItem` (
    `id` CHAR(36) NOT NULL,
    `budgetId` CHAR(36) NOT NULL,
    `source` VARCHAR(30) NOT NULL DEFAULT 'SINAPI',
    `code` VARCHAR(40) NOT NULL,
    `description` TEXT NOT NULL,
    `unit` VARCHAR(20) NOT NULL,
    `quantity` DECIMAL(18, 6) NOT NULL,
    `unitCost` DECIMAL(16, 6) NOT NULL,
    `totalCost` DECIMAL(16, 2) NOT NULL,
    `sourceData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BudgetItem_budgetId_idx`(`budgetId`),
    INDEX `BudgetItem_source_code_idx`(`source`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Measurement` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `contractId` CHAR(36) NOT NULL,
    `approvedByUserId` CHAR(36) NULL,
    `number` VARCHAR(60) NOT NULL,
    `referenceMonth` VARCHAR(7) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PAID') NOT NULL DEFAULT 'DRAFT',
    `grossAmount` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `deductions` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `netAmount` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Measurement_tenantId_referenceMonth_status_idx`(`tenantId`, `referenceMonth`, `status`),
    INDEX `Measurement_tenantId_contractId_referenceMonth_idx`(`tenantId`, `contractId`, `referenceMonth`),
    UNIQUE INDEX `Measurement_contractId_number_key`(`contractId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeasurementItem` (
    `id` CHAR(36) NOT NULL,
    `measurementId` CHAR(36) NOT NULL,
    `workOrderId` CHAR(36) NOT NULL,
    `description` TEXT NULL,
    `amount` DECIMAL(16, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MeasurementItem_workOrderId_idx`(`workOrderId`),
    UNIQUE INDEX `MeasurementItem_measurementId_workOrderId_key`(`measurementId`, `workOrderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SatisfactionResponse` (
    `id` CHAR(36) NOT NULL,
    `workOrderId` CHAR(36) NOT NULL,
    `respondedByUserId` CHAR(36) NULL,
    `score` INTEGER NOT NULL,
    `npsScore` INTEGER NULL,
    `comment` TEXT NULL,
    `respondedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SatisfactionResponse_workOrderId_key`(`workOrderId`),
    INDEX `SatisfactionResponse_respondedAt_idx`(`respondedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `buildingId` CHAR(36) NOT NULL,
    `tag` VARCHAR(80) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `category` VARCHAR(120) NOT NULL,
    `location` VARCHAR(180) NULL,
    `manufacturer` VARCHAR(120) NULL,
    `model` VARCHAR(120) NULL,
    `serialNumber` VARCHAR(120) NULL,
    `criticality` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE', 'DISPOSED') NOT NULL DEFAULT 'ACTIVE',
    `installedAt` DATETIME(3) NULL,
    `warrantyEndsAt` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Asset_tenantId_buildingId_status_deletedAt_idx`(`tenantId`, `buildingId`, `status`, `deletedAt`),
    UNIQUE INDEX `Asset_tenantId_tag_key`(`tenantId`, `tag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaintenancePlan` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `buildingId` CHAR(36) NOT NULL,
    `assetId` CHAR(36) NULL,
    `contractId` CHAR(36) NULL,
    `name` VARCHAR(180) NOT NULL,
    `description` TEXT NULL,
    `type` ENUM('PREVENTIVE', 'PREDICTIVE', 'INSPECTION', 'LEGAL_COMPLIANCE') NOT NULL,
    `frequencyUnit` ENUM('DAY', 'WEEK', 'MONTH', 'BIMONTH', 'QUARTER', 'SEMESTER', 'YEAR', 'METER_READING') NOT NULL,
    `frequencyValue` INTEGER NOT NULL DEFAULT 1,
    `nextDueAt` DATETIME(3) NOT NULL,
    `lastGeneratedAt` DATETIME(3) NULL,
    `defaultPriority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL') NOT NULL DEFAULT 'NORMAL',
    `checklistTemplate` JSON NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MaintenancePlan_tenantId_active_nextDueAt_idx`(`tenantId`, `active`, `nextDueAt`),
    INDEX `MaintenancePlan_buildingId_type_idx`(`buildingId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KpiDefinition` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `code` VARCHAR(80) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `description` TEXT NULL,
    `category` ENUM('OPERATIONAL', 'SLA', 'SATISFACTION', 'FINANCIAL', 'CONTRACTUAL', 'SUSTAINABILITY', 'RELIABILITY', 'SAFETY') NOT NULL,
    `unit` VARCHAR(40) NOT NULL,
    `direction` ENUM('HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'TARGET_RANGE') NOT NULL,
    `formula` TEXT NULL,
    `targetValue` DECIMAL(18, 6) NULL,
    `warningValue` DECIMAL(18, 6) NULL,
    `criticalValue` DECIMAL(18, 6) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `KpiDefinition_tenantId_category_active_idx`(`tenantId`, `category`, `active`),
    UNIQUE INDEX `KpiDefinition_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KpiMeasurement` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `definitionId` CHAR(36) NOT NULL,
    `buildingId` CHAR(36) NULL,
    `contractId` CHAR(36) NULL,
    `supplierId` CHAR(36) NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `value` DECIMAL(18, 6) NOT NULL,
    `targetValue` DECIMAL(18, 6) NULL,
    `source` VARCHAR(80) NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `KpiMeasurement_tenantId_definitionId_periodEnd_idx`(`tenantId`, `definitionId`, `periodEnd`),
    INDEX `KpiMeasurement_tenantId_buildingId_periodEnd_idx`(`tenantId`, `buildingId`, `periodEnd`),
    INDEX `KpiMeasurement_tenantId_contractId_periodEnd_idx`(`tenantId`, `contractId`, `periodEnd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SaaSPlan` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `billingInterval` ENUM('MONTH', 'YEAR') NOT NULL,
    `priceBrl` DECIMAL(12, 2) NOT NULL,
    `stripePriceId` VARCHAR(120) NULL,
    `maxBuildings` INTEGER NULL,
    `maxOperationalUsers` INTEGER NULL,
    `maxStorageGb` INTEGER NULL,
    `maxWorkOrdersYear` INTEGER NULL,
    `features` JSON NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SaaSPlan_code_key`(`code`),
    UNIQUE INDEX `SaaSPlan_stripePriceId_key`(`stripePriceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantSubscription` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `planId` CHAR(36) NOT NULL,
    `status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'MANUAL_CONTRACT') NOT NULL,
    `stripeSubscriptionId` VARCHAR(120) NULL,
    `currentPeriodStart` DATETIME(3) NULL,
    `currentPeriodEnd` DATETIME(3) NULL,
    `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TenantSubscription_stripeSubscriptionId_key`(`stripeSubscriptionId`),
    INDEX `TenantSubscription_tenantId_status_idx`(`tenantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StripeWebhookEvent` (
    `id` CHAR(36) NOT NULL,
    `stripeId` VARCHAR(120) NOT NULL,
    `type` VARCHAR(120) NOT NULL,
    `apiVersion` VARCHAR(30) NULL,
    `payload` JSON NOT NULL,
    `processedAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StripeWebhookEvent_stripeId_key`(`stripeId`),
    INDEX `StripeWebhookEvent_type_processedAt_idx`(`type`, `processedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `actorUserId` CHAR(36) NULL,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'LOGIN', 'LOGOUT', 'EXPORT', 'DOWNLOAD', 'BILLING_CHANGE') NOT NULL,
    `entityType` VARCHAR(100) NOT NULL,
    `entityId` VARCHAR(64) NULL,
    `beforeData` JSON NULL,
    `afterData` JSON NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(500) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_tenantId_entityType_entityId_occurredAt_idx`(`tenantId`, `entityType`, `entityId`, `occurredAt`),
    INDEX `AuditLog_tenantId_actorUserId_occurredAt_idx`(`tenantId`, `actorUserId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TenantMembership` ADD CONSTRAINT `TenantMembership_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantMembership` ADD CONSTRAINT `TenantMembership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshSession` ADD CONSTRAINT `RefreshSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshSession` ADD CONSTRAINT `RefreshSession_membershipId_fkey` FOREIGN KEY (`membershipId`) REFERENCES `TenantMembership`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantSequence` ADD CONSTRAINT `TenantSequence_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Building` ADD CONSTRAINT `Building_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Building` ADD CONSTRAINT `Building_managerUserId_fkey` FOREIGN KEY (`managerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Supplier` ADD CONSTRAINT `Supplier_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contract` ADD CONSTRAINT `Contract_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contract` ADD CONSTRAINT `Contract_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contract` ADD CONSTRAINT `Contract_managerUserId_fkey` FOREIGN KEY (`managerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contract` ADD CONSTRAINT `Contract_inspectorUserId_fkey` FOREIGN KEY (`inspectorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractBuilding` ADD CONSTRAINT `ContractBuilding_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractBuilding` ADD CONSTRAINT `ContractBuilding_buildingId_fkey` FOREIGN KEY (`buildingId`) REFERENCES `Building`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractAmendment` ADD CONSTRAINT `ContractAmendment_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractAdjustment` ADD CONSTRAINT `ContractAdjustment_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractSubcontract` ADD CONSTRAINT `ContractSubcontract_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractPenalty` ADD CONSTRAINT `ContractPenalty_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractPenalty` ADD CONSTRAINT `ContractPenalty_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractPenalty` ADD CONSTRAINT `ContractPenalty_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContractPenalty` ADD CONSTRAINT `ContractPenalty_registeredByUserId_fkey` FOREIGN KEY (`registeredByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Commitment` ADD CONSTRAINT `Commitment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Commitment` ADD CONSTRAINT `Commitment_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommitmentMovement` ADD CONSTRAINT `CommitmentMovement_commitmentId_fkey` FOREIGN KEY (`commitmentId`) REFERENCES `Commitment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_buildingId_fkey` FOREIGN KEY (`buildingId`) REFERENCES `Building`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_requesterUserId_fkey` FOREIGN KEY (`requesterUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_assignedToUserId_fkey` FOREIGN KEY (`assignedToUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderContract` ADD CONSTRAINT `WorkOrderContract_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderContract` ADD CONSTRAINT `WorkOrderContract_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderPendency` ADD CONSTRAINT `WorkOrderPendency_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderPendency` ADD CONSTRAINT `WorkOrderPendency_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderPendency` ADD CONSTRAINT `WorkOrderPendency_responsibleUserId_fkey` FOREIGN KEY (`responsibleUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderAttachment` ADD CONSTRAINT `WorkOrderAttachment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderAttachment` ADD CONSTRAINT `WorkOrderAttachment_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderAttachment` ADD CONSTRAINT `WorkOrderAttachment_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderStatusHistory` ADD CONSTRAINT `WorkOrderStatusHistory_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderStatusHistory` ADD CONSTRAINT `WorkOrderStatusHistory_changedByUserId_fkey` FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderBudget` ADD CONSTRAINT `WorkOrderBudget_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkOrderBudget` ADD CONSTRAINT `WorkOrderBudget_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BudgetItem` ADD CONSTRAINT `BudgetItem_budgetId_fkey` FOREIGN KEY (`budgetId`) REFERENCES `WorkOrderBudget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Measurement` ADD CONSTRAINT `Measurement_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Measurement` ADD CONSTRAINT `Measurement_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Measurement` ADD CONSTRAINT `Measurement_approvedByUserId_fkey` FOREIGN KEY (`approvedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeasurementItem` ADD CONSTRAINT `MeasurementItem_measurementId_fkey` FOREIGN KEY (`measurementId`) REFERENCES `Measurement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeasurementItem` ADD CONSTRAINT `MeasurementItem_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SatisfactionResponse` ADD CONSTRAINT `SatisfactionResponse_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SatisfactionResponse` ADD CONSTRAINT `SatisfactionResponse_respondedByUserId_fkey` FOREIGN KEY (`respondedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_buildingId_fkey` FOREIGN KEY (`buildingId`) REFERENCES `Building`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenancePlan` ADD CONSTRAINT `MaintenancePlan_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenancePlan` ADD CONSTRAINT `MaintenancePlan_buildingId_fkey` FOREIGN KEY (`buildingId`) REFERENCES `Building`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenancePlan` ADD CONSTRAINT `MaintenancePlan_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenancePlan` ADD CONSTRAINT `MaintenancePlan_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KpiDefinition` ADD CONSTRAINT `KpiDefinition_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KpiMeasurement` ADD CONSTRAINT `KpiMeasurement_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KpiMeasurement` ADD CONSTRAINT `KpiMeasurement_definitionId_fkey` FOREIGN KEY (`definitionId`) REFERENCES `KpiDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KpiMeasurement` ADD CONSTRAINT `KpiMeasurement_buildingId_fkey` FOREIGN KEY (`buildingId`) REFERENCES `Building`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KpiMeasurement` ADD CONSTRAINT `KpiMeasurement_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KpiMeasurement` ADD CONSTRAINT `KpiMeasurement_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantSubscription` ADD CONSTRAINT `TenantSubscription_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantSubscription` ADD CONSTRAINT `TenantSubscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SaaSPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
