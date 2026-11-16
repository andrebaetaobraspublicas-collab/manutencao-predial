-- MANUAL ONLY: MariaDB 11.8, u528277311_orcapro_live. Backup and temporary-table probe required.
-- Keep CHECK explicit: MODIFY otherwise removes the inline JSON validation.
ALTER TABLE `u528277311_orcapro_live`.`OrcaproProjectVersion` MODIFY COLUMN `data` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (JSON_VALID(`data`));
ALTER TABLE `u528277311_orcapro_live`.`OrcaproImport` MODIFY COLUMN `report` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (JSON_VALID(`report`));
