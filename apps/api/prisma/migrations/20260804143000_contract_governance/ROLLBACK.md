# Reversão manual — gestão e fiscalização contratual

Esta migração é aditiva. Antes de reverter, exporte os registros de dossiê e os arquivos armazenados.

Ordem segura de remoção das tabelas: `ContractDossierAttachment`, `ContractCommunicationClaim`,
`ConstructionDiary`, `ContractReceipt`, `ContractApostille`, `ContractGuarantee`,
`ContractInspectionTeamMember` e `InspectorProfile`. Em seguida, remova de `Contract` as colunas
`executionRegime` e `nature`.
