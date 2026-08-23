-- Imported contract budgets are parsed in memory. The source binary is not retained.
ALTER TABLE `ContractBudgetImport`
  MODIFY `storageKey` VARCHAR(500) NULL,
  MODIFY `fileName` VARCHAR(255) NULL;
