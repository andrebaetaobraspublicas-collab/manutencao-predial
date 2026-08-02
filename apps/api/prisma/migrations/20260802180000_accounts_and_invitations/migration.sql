-- Extend audit events used by account administration.
ALTER TABLE `AuditLog` MODIFY `action` ENUM(
  'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'LOGIN', 'LOGOUT',
  'EXPORT', 'DOWNLOAD', 'BILLING_CHANGE', 'INVITE', 'SESSION_REVOKE',
  'PASSWORD_CHANGE', 'EMAIL_VERIFY'
) NOT NULL;

ALTER TABLE `TenantMembership` ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 0;

-- One active or historical invitation is attached to each membership at a time.
CREATE TABLE `TenantInvitation` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `membershipId` CHAR(36) NOT NULL,
  `invitedByUserId` CHAR(36) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `acceptedAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `TenantInvitation_membershipId_key`(`membershipId`),
  UNIQUE INDEX `TenantInvitation_tokenHash_key`(`tokenHash`),
  INDEX `TenantInvitation_tenantId_email_acceptedAt_revokedAt_idx`(`tenantId`, `email`, `acceptedAt`, `revokedAt`),
  INDEX `TenantInvitation_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AccountToken` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `purpose` ENUM('PASSWORD_RESET', 'EMAIL_VERIFICATION') NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `AccountToken_tokenHash_key`(`tokenHash`),
  INDEX `AccountToken_userId_purpose_consumedAt_expiresAt_idx`(`userId`, `purpose`, `consumedAt`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TenantInvitation` ADD CONSTRAINT `TenantInvitation_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `TenantInvitation` ADD CONSTRAINT `TenantInvitation_membershipId_fkey`
  FOREIGN KEY (`membershipId`) REFERENCES `TenantMembership`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TenantInvitation` ADD CONSTRAINT `TenantInvitation_invitedByUserId_fkey`
  FOREIGN KEY (`invitedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AccountToken` ADD CONSTRAINT `AccountToken_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
