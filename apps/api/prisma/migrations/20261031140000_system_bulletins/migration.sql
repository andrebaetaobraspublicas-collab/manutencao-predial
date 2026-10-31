CREATE TABLE `SystemBulletin` (
`id` CHAR(36) NOT NULL, `tenantId` CHAR(36) NOT NULL, `actorUserId` CHAR(36) NOT NULL, `actorName` VARCHAR(160) NOT NULL,
`subject` VARCHAR(180) NOT NULL, `body` TEXT NOT NULL, `products` JSON NOT NULL, `accountStatus` VARCHAR(16) NOT NULL,
`audienceHash` CHAR(64) NOT NULL, `recipientCount` INTEGER NOT NULL, `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `confirmedAt` DATETIME(3) NULL, `completedAt` DATETIME(3) NULL, `lastTestAt` DATETIME(3) NULL,
PRIMARY KEY (`id`), INDEX `SystemBulletin_tenantId_createdAt_idx` (`tenantId`,`createdAt`), INDEX `SystemBulletin_status_createdAt_idx` (`status`,`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `SystemBulletinDelivery` (
`id` CHAR(36) NOT NULL, `bulletinId` CHAR(36) NOT NULL, `userId` CHAR(36) NOT NULL, `emailHash` CHAR(64) NOT NULL,
`status` VARCHAR(16) NOT NULL DEFAULT 'PENDING', `attempts` INTEGER NOT NULL DEFAULT 0, `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
`leaseUntil` DATETIME(3) NULL, `processedAt` DATETIME(3) NULL, `providerMessageId` VARCHAR(190) NULL, `errorCode` VARCHAR(50) NULL,
PRIMARY KEY (`id`), UNIQUE INDEX `SystemBulletinDelivery_bulletinId_userId_key` (`bulletinId`,`userId`), UNIQUE INDEX `SystemBulletinDelivery_bulletinId_emailHash_key` (`bulletinId`,`emailHash`),
INDEX `SystemBulletinDelivery_status_availableAt_idx` (`status`,`availableAt`), CONSTRAINT `SystemBulletinDelivery_bulletinId_fkey` FOREIGN KEY (`bulletinId`) REFERENCES `SystemBulletin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
