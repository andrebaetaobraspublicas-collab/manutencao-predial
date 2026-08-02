-- GP-020..GP-024: geocodificação, catálogos/SLA, colaboração,
-- notificações transacionais e fechamento/reabertura auditável.

SET time_zone = '+00:00';

CREATE TABLE `OperationalCatalogItem` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `parentId` CHAR(36) NULL,
  `kind` ENUM('CATEGORY','SPECIALTY','ENVIRONMENT','CAUSE') NOT NULL,
  `code` VARCHAR(60) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `defaultPriority` ENUM('LOW','NORMAL','HIGH','URGENT','CRITICAL') NULL,
  `requirePhotoBefore` BOOLEAN NOT NULL DEFAULT false,
  `requirePhotoDuring` BOOLEAN NOT NULL DEFAULT false,
  `requirePhotoAfter` BOOLEAN NOT NULL DEFAULT false,
  `requireChecklist` BOOLEAN NOT NULL DEFAULT false,
  `requireFinalCost` BOOLEAN NOT NULL DEFAULT false,
  `requireAcceptance` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  UNIQUE INDEX `OperationalCatalogItem_tenantId_kind_code_key` (`tenantId`,`kind`,`code`),
  INDEX `OperationalCatalogItem_tenantId_kind_active_sortOrder_idx` (`tenantId`,`kind`,`active`,`sortOrder`),
  INDEX `OperationalCatalogItem_tenantId_parentId_active_idx` (`tenantId`,`parentId`,`active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChecklistTemplateItem` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `categoryId` CHAR(36) NOT NULL,
  `label` VARCHAR(240) NOT NULL,
  `description` TEXT NULL,
  `required` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ChecklistTemplateItem_tenantId_categoryId_active_sortOrder_idx` (`tenantId`,`categoryId`,`active`,`sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SlaCalendar` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `code` VARCHAR(60) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `timezone` VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
  `timeMode` ENUM('CALENDAR','BUSINESS') NOT NULL DEFAULT 'CALENDAR',
  `businessDays` JSON NULL,
  `shifts` JSON NULL,
  `workdayStart` VARCHAR(5) NULL,
  `workdayEnd` VARCHAR(5) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `SlaCalendar_tenantId_code_key` (`tenantId`,`code`),
  INDEX `SlaCalendar_tenantId_active_idx` (`tenantId`,`active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SlaHoliday` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `calendarId` CHAR(36) NOT NULL,
  `date` DATE NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SlaHoliday_calendarId_date_key` (`calendarId`,`date`),
  INDEX `SlaHoliday_tenantId_date_active_idx` (`tenantId`,`date`,`active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SlaPolicy` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `calendarId` CHAR(36) NOT NULL,
  `contractId` CHAR(36) NULL,
  `categoryId` CHAR(36) NULL,
  `code` VARCHAR(80) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `priority` ENUM('LOW','NORMAL','HIGH','URGENT','CRITICAL') NOT NULL,
  `responseMinutes` INTEGER NOT NULL,
  `resolutionMinutes` INTEGER NOT NULL,
  `warningMinutesBefore` INTEGER NOT NULL DEFAULT 60,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `SlaPolicy_tenantId_code_key` (`tenantId`,`code`),
  INDEX `SlaPolicy_tenantId_priority_active_idx` (`tenantId`,`priority`,`active`),
  INDEX `SlaPolicy_tenantId_contractId_categoryId_priority_active_idx` (`tenantId`,`contractId`,`categoryId`,`priority`,`active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GeocodingCache` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `queryHash` CHAR(64) NOT NULL,
  `normalizedAddress` VARCHAR(768) NOT NULL,
  `provider` VARCHAR(60) NOT NULL,
  `candidates` JSON NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GeocodingCache_tenantId_queryHash_provider_key` (`tenantId`,`queryHash`,`provider`),
  INDEX `GeocodingCache_tenantId_expiresAt_idx` (`tenantId`,`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WorkOrderComment` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `workOrderId` CHAR(36) NOT NULL,
  `authorUserId` CHAR(36) NOT NULL,
  `body` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `WorkOrderComment_tenantId_workOrderId_createdAt_idx` (`tenantId`,`workOrderId`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WorkOrderCommentMention` (
  `id` CHAR(36) NOT NULL,
  `commentId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `WorkOrderCommentMention_commentId_userId_key` (`commentId`,`userId`),
  INDEX `WorkOrderCommentMention_userId_createdAt_idx` (`userId`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WorkOrderChecklistItem` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `workOrderId` CHAR(36) NOT NULL,
  `templateItemId` CHAR(36) NULL,
  `label` VARCHAR(240) NOT NULL,
  `description` TEXT NULL,
  `required` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `WorkOrderChecklistItem_tenantId_workOrderId_sortOrder_idx` (`tenantId`,`workOrderId`,`sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WorkOrderChecklistResponse` (
  `id` CHAR(36) NOT NULL,
  `checklistItemId` CHAR(36) NOT NULL,
  `respondedByUserId` CHAR(36) NOT NULL,
  `revision` INTEGER NOT NULL,
  `checked` BOOLEAN NOT NULL,
  `note` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `WorkOrderChecklistResponse_checklistItemId_revision_key` (`checklistItemId`,`revision`),
  INDEX `WorkOrderChecklistResponse_checklistItemId_createdAt_idx` (`checklistItemId`,`createdAt`),
  INDEX `WorkOrderChecklistResponse_respondedByUserId_createdAt_idx` (`respondedByUserId`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NotificationPreference` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `eventType` ENUM('WORK_ORDER_CREATED','WORK_ORDER_ASSIGNED','WORK_ORDER_STATUS_CHANGED','WORK_ORDER_COMMENT_MENTION','WORK_ORDER_PENDENCY_CREATED','WORK_ORDER_PENDENCY_RESOLVED','WORK_ORDER_SLA_WARNING','WORK_ORDER_SLA_BREACHED','CONTRACT_EXPIRING') NOT NULL,
  `inAppEnabled` BOOLEAN NOT NULL DEFAULT true,
  `emailEnabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `NotificationPreference_tenantId_userId_eventType_key` (`tenantId`,`userId`,`eventType`),
  INDEX `NotificationPreference_tenantId_userId_idx` (`tenantId`,`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Notification` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `workOrderId` CHAR(36) NULL,
  `eventType` ENUM('WORK_ORDER_CREATED','WORK_ORDER_ASSIGNED','WORK_ORDER_STATUS_CHANGED','WORK_ORDER_COMMENT_MENTION','WORK_ORDER_PENDENCY_CREATED','WORK_ORDER_PENDENCY_RESOLVED','WORK_ORDER_SLA_WARNING','WORK_ORDER_SLA_BREACHED','CONTRACT_EXPIRING') NOT NULL,
  `title` VARCHAR(220) NOT NULL,
  `message` TEXT NOT NULL,
  `actionUrl` VARCHAR(500) NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `Notification_tenantId_userId_readAt_createdAt_idx` (`tenantId`,`userId`,`readAt`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NotificationOutbox` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `recipientUserId` CHAR(36) NOT NULL,
  `eventKey` VARCHAR(190) NOT NULL,
  `eventType` ENUM('WORK_ORDER_CREATED','WORK_ORDER_ASSIGNED','WORK_ORDER_STATUS_CHANGED','WORK_ORDER_COMMENT_MENTION','WORK_ORDER_PENDENCY_CREATED','WORK_ORDER_PENDENCY_RESOLVED','WORK_ORDER_SLA_WARNING','WORK_ORDER_SLA_BREACHED','CONTRACT_EXPIRING') NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('PENDING','PROCESSING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `NotificationOutbox_eventKey_key` (`eventKey`),
  INDEX `NotificationOutbox_status_availableAt_idx` (`status`,`availableAt`),
  INDEX `NotificationOutbox_tenantId_recipientUserId_createdAt_idx` (`tenantId`,`recipientUserId`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WorkOrderReopening` (
  `id` CHAR(36) NOT NULL,
  `tenantId` CHAR(36) NOT NULL,
  `workOrderId` CHAR(36) NOT NULL,
  `reopenedByUserId` CHAR(36) NOT NULL,
  `previousStatus` ENUM('OPEN','TRIAGED','ASSIGNED','IN_PROGRESS','PENDING','WAITING_APPROVAL','COMPLETED','CLOSED','CANCELED') NOT NULL,
  `reason` TEXT NOT NULL,
  `previousClosedAt` DATETIME(3) NULL,
  `previousSolution` TEXT NULL,
  `previousFinalCost` DECIMAL(16,2) NULL,
  `previousAcceptanceNote` TEXT NULL,
  `previousAcceptedAt` DATETIME(3) NULL,
  `previousAcceptedByUserId` CHAR(36) NULL,
  `previousMeasurementEligible` BOOLEAN NOT NULL DEFAULT false,
  `previousSlaPolicyId` CHAR(36) NULL,
  `previousSlaResponseDeadline` DATETIME(3) NULL,
  `previousSlaResolutionDeadline` DATETIME(3) NULL,
  `previousSlaResolutionWarningAt` DATETIME(3) NULL,
  `previousSlaSnapshot` JSON NULL,
  `previousSatisfactionSnapshot` JSON NULL,
  `within30Days` BOOLEAN NOT NULL,
  `reopenedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `WorkOrderReopening_tenantId_within30Days_reopenedAt_idx` (`tenantId`,`within30Days`,`reopenedAt`),
  INDEX `WorkOrderReopening_workOrderId_reopenedAt_idx` (`workOrderId`,`reopenedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Building`
  ADD COLUMN `geocodingProvider` VARCHAR(60) NULL,
  ADD COLUMN `geocodingAccuracy` VARCHAR(60) NULL,
  ADD COLUMN `geocodingPlaceId` VARCHAR(190) NULL,
  ADD COLUMN `geocodingConfirmedAt` DATETIME(3) NULL,
  ADD COLUMN `geocodingConfirmedByUserId` CHAR(36) NULL;

ALTER TABLE `WorkOrder`
  ADD COLUMN `categoryId` CHAR(36) NULL,
  ADD COLUMN `specialtyId` CHAR(36) NULL,
  ADD COLUMN `environmentId` CHAR(36) NULL,
  ADD COLUMN `causeId` CHAR(36) NULL,
  ADD COLUMN `slaPolicyId` CHAR(36) NULL,
  ADD COLUMN `acceptedByUserId` CHAR(36) NULL,
  ADD COLUMN `acceptedAt` DATETIME(3) NULL,
  ADD COLUMN `reopenedAt` DATETIME(3) NULL,
  ADD COLUMN `solution` TEXT NULL,
  ADD COLUMN `acceptanceNote` TEXT NULL,
  ADD COLUMN `measurementEligible` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `reopenCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `slaResolutionWarningAt` DATETIME(3) NULL,
  ADD COLUMN `slaSnapshot` JSON NULL,
  ADD COLUMN `operationalCriteriaSnapshot` JSON NULL;

ALTER TABLE `OperationalCatalogItem` ADD CONSTRAINT `OperationalCatalogItem_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OperationalCatalogItem` ADD CONSTRAINT `OperationalCatalogItem_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `OperationalCatalogItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ChecklistTemplateItem` ADD CONSTRAINT `ChecklistTemplateItem_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ChecklistTemplateItem` ADD CONSTRAINT `ChecklistTemplateItem_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `OperationalCatalogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SlaCalendar` ADD CONSTRAINT `SlaCalendar_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SlaHoliday` ADD CONSTRAINT `SlaHoliday_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SlaHoliday` ADD CONSTRAINT `SlaHoliday_calendarId_fkey` FOREIGN KEY (`calendarId`) REFERENCES `SlaCalendar`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SlaPolicy` ADD CONSTRAINT `SlaPolicy_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SlaPolicy` ADD CONSTRAINT `SlaPolicy_calendarId_fkey` FOREIGN KEY (`calendarId`) REFERENCES `SlaCalendar`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SlaPolicy` ADD CONSTRAINT `SlaPolicy_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SlaPolicy` ADD CONSTRAINT `SlaPolicy_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `OperationalCatalogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `GeocodingCache` ADD CONSTRAINT `GeocodingCache_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkOrderComment` ADD CONSTRAINT `WorkOrderComment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `WorkOrderComment` ADD CONSTRAINT `WorkOrderComment_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkOrderComment` ADD CONSTRAINT `WorkOrderComment_authorUserId_fkey` FOREIGN KEY (`authorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `WorkOrderCommentMention` ADD CONSTRAINT `WorkOrderCommentMention_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `WorkOrderComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkOrderCommentMention` ADD CONSTRAINT `WorkOrderCommentMention_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkOrderChecklistItem` ADD CONSTRAINT `WorkOrderChecklistItem_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `WorkOrderChecklistItem` ADD CONSTRAINT `WorkOrderChecklistItem_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkOrderChecklistItem` ADD CONSTRAINT `WorkOrderChecklistItem_templateItemId_fkey` FOREIGN KEY (`templateItemId`) REFERENCES `ChecklistTemplateItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkOrderChecklistResponse` ADD CONSTRAINT `WorkOrderChecklistResponse_checklistItemId_fkey` FOREIGN KEY (`checklistItemId`) REFERENCES `WorkOrderChecklistItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkOrderChecklistResponse` ADD CONSTRAINT `WorkOrderChecklistResponse_respondedByUserId_fkey` FOREIGN KEY (`respondedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `NotificationPreference` ADD CONSTRAINT `NotificationPreference_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `NotificationPreference` ADD CONSTRAINT `NotificationPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `NotificationOutbox` ADD CONSTRAINT `NotificationOutbox_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `NotificationOutbox` ADD CONSTRAINT `NotificationOutbox_recipientUserId_fkey` FOREIGN KEY (`recipientUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkOrderReopening` ADD CONSTRAINT `WorkOrderReopening_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `WorkOrderReopening` ADD CONSTRAINT `WorkOrderReopening_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `WorkOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkOrderReopening` ADD CONSTRAINT `WorkOrderReopening_reopenedByUserId_fkey` FOREIGN KEY (`reopenedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Building` ADD CONSTRAINT `Building_geocodingConfirmedByUserId_fkey` FOREIGN KEY (`geocodingConfirmedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `OperationalCatalogItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_specialtyId_fkey` FOREIGN KEY (`specialtyId`) REFERENCES `OperationalCatalogItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_environmentId_fkey` FOREIGN KEY (`environmentId`) REFERENCES `OperationalCatalogItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_causeId_fkey` FOREIGN KEY (`causeId`) REFERENCES `OperationalCatalogItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_slaPolicyId_fkey` FOREIGN KEY (`slaPolicyId`) REFERENCES `SlaPolicy`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkOrder` ADD CONSTRAINT `WorkOrder_acceptedByUserId_fkey` FOREIGN KEY (`acceptedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `WorkOrder_tenantId_categoryId_status_openedAt_idx` ON `WorkOrder`(`tenantId`,`categoryId`,`status`,`openedAt`);
CREATE INDEX `WorkOrder_tenantId_specialtyId_status_openedAt_idx` ON `WorkOrder`(`tenantId`,`specialtyId`,`status`,`openedAt`);
CREATE INDEX `WorkOrder_tenantId_environmentId_status_openedAt_idx` ON `WorkOrder`(`tenantId`,`environmentId`,`status`,`openedAt`);
CREATE INDEX `WorkOrder_tenantId_causeId_status_openedAt_idx` ON `WorkOrder`(`tenantId`,`causeId`,`status`,`openedAt`);
CREATE INDEX `WorkOrder_tenantId_status_slaResolutionDeadline_idx` ON `WorkOrder`(`tenantId`,`status`,`slaResolutionDeadline`);
CREATE INDEX `WorkOrder_tenantId_status_slaResolutionWarningAt_idx` ON `WorkOrder`(`tenantId`,`status`,`slaResolutionWarningAt`);
DROP INDEX `WorkOrder_tenantId_slaResolutionDeadline_status_idx` ON `WorkOrder`;

-- Catálogo e calendário padrão preservam o comportamento anterior para todos os tenants.
INSERT INTO `OperationalCatalogItem` (`id`,`tenantId`,`kind`,`code`,`name`,`active`,`sortOrder`,`requireAcceptance`,`createdAt`,`updatedAt`)
SELECT UUID(), `id`, 'CATEGORY', 'GERAL', 'Serviços gerais', true, 0, true, NOW(3), NOW(3) FROM `Tenant` WHERE `deletedAt` IS NULL;

INSERT INTO `SlaCalendar` (`id`,`tenantId`,`code`,`name`,`timezone`,`timeMode`,`active`,`createdAt`,`updatedAt`)
SELECT UUID(), `id`, 'PADRAO_24X7', 'Calendário corrido 24x7', `timezone`, 'CALENDAR', true, NOW(3), NOW(3) FROM `Tenant` WHERE `deletedAt` IS NULL;

INSERT INTO `SlaPolicy` (`id`,`tenantId`,`calendarId`,`code`,`name`,`priority`,`responseMinutes`,`resolutionMinutes`,`warningMinutesBefore`,`active`,`createdAt`,`updatedAt`)
SELECT UUID(), t.`id`, c.`id`, CONCAT('PADRAO_', p.priority), CONCAT('SLA padrão ', p.priority), p.priority, p.responseMinutes, p.resolutionMinutes, LEAST(60,p.responseMinutes), true, NOW(3), NOW(3)
FROM `Tenant` t
JOIN `SlaCalendar` c ON c.`tenantId`=t.`id` AND c.`code`='PADRAO_24X7'
JOIN (
  SELECT 'LOW' priority, 1440 responseMinutes, 7200 resolutionMinutes UNION ALL
  SELECT 'NORMAL', 480, 4320 UNION ALL
  SELECT 'HIGH', 240, 1440 UNION ALL
  SELECT 'URGENT', 60, 480 UNION ALL
  SELECT 'CRITICAL', 15, 240
) p
WHERE t.`deletedAt` IS NULL;

UPDATE `WorkOrder` wo
JOIN `OperationalCatalogItem` cat ON cat.`tenantId`=wo.`tenantId` AND cat.`kind`='CATEGORY' AND cat.`code`='GERAL'
JOIN `SlaPolicy` sla ON sla.`tenantId`=wo.`tenantId` AND sla.`priority`=wo.`priority` AND sla.`contractId` IS NULL AND sla.`categoryId` IS NULL
SET wo.`categoryId`=cat.`id`, wo.`slaPolicyId`=sla.`id`;

UPDATE `WorkOrder` wo
JOIN `OperationalCatalogItem` cat ON cat.`id`=wo.`categoryId` AND cat.`tenantId`=wo.`tenantId`
JOIN `SlaPolicy` sla ON sla.`id`=wo.`slaPolicyId` AND sla.`tenantId`=wo.`tenantId`
JOIN `SlaCalendar` cal ON cal.`id`=sla.`calendarId` AND cal.`tenantId`=wo.`tenantId`
SET
  wo.`slaResolutionWarningAt`=CASE
    WHEN wo.`slaResolutionDeadline` IS NULL THEN NULL
    ELSE DATE_SUB(wo.`slaResolutionDeadline`, INTERVAL LEAST(sla.`warningMinutesBefore`, sla.`resolutionMinutes`) MINUTE)
  END,
  wo.`operationalCriteriaSnapshot`=JSON_OBJECT(
    'categoryId', cat.`id`,
    'categoryCode', cat.`code`,
    'categoryName', cat.`name`,
    'requirePhotoBefore', cat.`requirePhotoBefore`,
    'requirePhotoDuring', cat.`requirePhotoDuring`,
    'requirePhotoAfter', cat.`requirePhotoAfter`,
    'requireChecklist', cat.`requireChecklist`,
    'requireFinalCost', cat.`requireFinalCost`,
    'requireAcceptance', cat.`requireAcceptance`
  ),
  wo.`slaSnapshot`=JSON_OBJECT(
    'policy', JSON_OBJECT(
      'id', sla.`id`,
      'code', sla.`code`,
      'name', sla.`name`,
      'priority', sla.`priority`,
      'contractId', sla.`contractId`,
      'categoryId', sla.`categoryId`,
      'responseMinutes', sla.`responseMinutes`,
      'resolutionMinutes', sla.`resolutionMinutes`,
      'warningMinutesBefore', sla.`warningMinutesBefore`
    ),
    'calendar', JSON_OBJECT(
      'id', cal.`id`,
      'code', cal.`code`,
      'name', cal.`name`,
      'timezone', cal.`timezone`,
      'timeMode', cal.`timeMode`,
      'businessDays', cal.`businessDays`,
      'shifts', cal.`shifts`,
      'workdayStart', cal.`workdayStart`,
      'workdayEnd', cal.`workdayEnd`,
      'holidays', JSON_ARRAY()
    ),
    'startAt', DATE_FORMAT(wo.`openedAt`, '%Y-%m-%dT%H:%i:%s.000Z'),
    'responseDeadline', CASE
      WHEN wo.`slaResponseDeadline` IS NULL THEN NULL
      ELSE DATE_FORMAT(wo.`slaResponseDeadline`, '%Y-%m-%dT%H:%i:%s.000Z')
    END,
    'resolutionDeadline', CASE
      WHEN wo.`slaResolutionDeadline` IS NULL THEN NULL
      ELSE DATE_FORMAT(wo.`slaResolutionDeadline`, '%Y-%m-%dT%H:%i:%s.000Z')
    END,
    'resolutionWarningAt', CASE
      WHEN wo.`slaResolutionDeadline` IS NULL THEN NULL
      ELSE DATE_FORMAT(
        DATE_SUB(wo.`slaResolutionDeadline`, INTERVAL LEAST(sla.`warningMinutesBefore`, sla.`resolutionMinutes`) MINUTE),
        '%Y-%m-%dT%H:%i:%s.000Z'
      )
    END,
    'capturedAt', DATE_FORMAT(NOW(3), '%Y-%m-%dT%H:%i:%s.000Z'),
    'legacyBackfill', true,
    'deadlinesPreserved', true
  );

-- OS concluídas antes da v0.7 não possuíam o campo de solução. O marcador
-- explícito preserva o fluxo de aceite sem inventar um detalhamento técnico.
UPDATE `WorkOrder`
SET `solution`='Conclusão registrada antes da v0.7; detalhamento não informado.'
WHERE `status` IN ('COMPLETED','CLOSED') AND (`solution` IS NULL OR TRIM(`solution`)='');

-- O indicador representa a elegibilidade registrada no fechamento. Para OS já
-- medidas, o vínculo histórico é a melhor evidência disponível para o backfill.
UPDATE `WorkOrder` wo
JOIN `MeasurementItem` mi ON mi.`workOrderId`=wo.`id`
JOIN `Measurement` m ON m.`id`=mi.`measurementId` AND m.`tenantId`=wo.`tenantId`
SET wo.`measurementEligible`=true
WHERE m.`status`<>'REJECTED';
