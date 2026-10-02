-- AlterTable
ALTER TABLE `TenantMembership` ADD COLUMN `maintenanceAccess` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `OrcaproUserAccess` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `managed` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `OrcaproPlan` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `billingInterval` ENUM('MONTH', 'YEAR') NOT NULL,
    `priceBrl` DECIMAL(12, 2) NOT NULL,
    `stripePriceId` VARCHAR(120) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrcaproPlan_code_key`(`code`),
    UNIQUE INDEX `OrcaproPlan_stripePriceId_key`(`stripePriceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproSubscription` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `planId` CHAR(36) NULL,
    `status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'MANUAL_CONTRACT') NOT NULL DEFAULT 'TRIALING',
    `billingSource` VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
    `currentPeriodStart` DATETIME(3) NULL,
    `currentPeriodEnd` DATETIME(3) NULL,
    `stripeCustomerId` VARCHAR(120) NULL,
    `stripeSubscriptionId` VARCHAR(120) NULL,
    `stripeStatus` VARCHAR(30) NULL,
    `stripeCheckoutId` VARCHAR(120) NULL,
    `stripeCheckoutPriceId` VARCHAR(120) NULL,
    `stripePeriodEnd` DATETIME(3) NULL,
    `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrcaproSubscription_userId_key`(`userId`),
    UNIQUE INDEX `OrcaproSubscription_stripeCustomerId_key`(`stripeCustomerId`),
    UNIQUE INDEX `OrcaproSubscription_stripeSubscriptionId_key`(`stripeSubscriptionId`),
    INDEX `OrcaproSubscription_tenantId_status_idx`(`tenantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrcaproStripeEvent` (
    `stripeId` VARCHAR(120) NOT NULL,
    `type` VARCHAR(120) NOT NULL,
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`stripeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrcaproSubscription` ADD CONSTRAINT `OrcaproSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproSubscription` ADD CONSTRAINT `OrcaproSubscription_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrcaproSubscription` ADD CONSTRAINT `OrcaproSubscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `OrcaproPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
