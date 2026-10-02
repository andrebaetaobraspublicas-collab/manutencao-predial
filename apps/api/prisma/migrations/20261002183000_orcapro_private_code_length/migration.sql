-- Preserve the original private identifier format CP-/IP- plus up to 54 characters.
ALTER TABLE `OrcaproCustomComposition` MODIFY `code` VARCHAR(60) NOT NULL;
ALTER TABLE `OrcaproCustomInput` MODIFY `code` VARCHAR(60) NOT NULL;
