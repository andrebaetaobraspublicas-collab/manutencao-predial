-- OrçaPro-only access: no changes to tenant memberships, maintenance status or passwords.
CREATE TABLE `OrcaproUserAccess` (
  `userId` CHAR(36) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `updatedByUserId` CHAR(36) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`userId`),
  CONSTRAINT `OrcaproUserAccess_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
