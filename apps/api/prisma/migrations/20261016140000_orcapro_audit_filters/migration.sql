-- Additive indexes only; preserve every existing audit record.
CREATE INDEX `OrcaproAudit_createdAt_id_idx` ON `OrcaproAudit`(`createdAt`, `id`);
CREATE INDEX `OrcaproAudit_actorUserId_createdAt_idx` ON `OrcaproAudit`(`actorUserId`, `createdAt`);
