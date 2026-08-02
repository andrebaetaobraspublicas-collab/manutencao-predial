# Contribuição

1. Leia `AGENTS.md` e a pasta `docs/` antes de alterar código.
2. Crie uma branch curta: `feat/...`, `fix/...`, `docs/...` ou `chore/...`.
3. Toda consulta de dado operacional deve conter `tenantId`.
4. Toda mudança de banco exige migration do Prisma e atualização do diagrama.
5. Toda alteração no fluxo da OS exige teste da máquina de estados.
6. Execute `npm run lint`, `npm run test` e `npm run build` antes do merge; alterações de autorização também exigem `npm run test:e2e -w @gestaopredios/api` em MySQL.
7. Atualize `CHANGELOG.md` quando houver comportamento visível ao usuário.
8. Antes de liberar produção, execute `npm run smoke:production` e registre o resultado real em `VALIDATION.md`.
