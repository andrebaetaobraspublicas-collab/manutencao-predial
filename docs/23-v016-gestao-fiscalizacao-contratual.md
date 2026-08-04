# v0.16.0 — Gestão e fiscalização contratual

## Objetivo

Complementar o núcleo de manutenção predial com um dossiê contratual capaz de registrar a
fiscalização técnica e administrativa durante toda a execução do instrumento.

## Escopo entregue

- regime de execução contratual e natureza continuada/de escopo;
- cabeçalhos e valores dos eventos apresentados em português;
- cadastro independente de fiscais, com vínculo opcional a usuário do SaaS;
- equipe de fiscalização por contrato, papel, portaria, titularidade e vigência;
- garantias contratuais, suficiência, workflow, execução, recuperação e liberação;
- apostilamentos com memória, índice, percentual e recálculo financeiro transacional;
- recebimentos provisório, definitivo, parcial, por etapa ou rejeição, incluindo pendências;
- diário de obras com clima, equipes, serviços, materiais, riscos, providências e OS opcional;
- comunicações e pleitos com protocolo, instrução, prazos, pareceres, decisão e encaminhamento;
- anexos privados em PDF/JPG/PNG/WebP, assinatura verificada, SHA-256 e download auditado;
- exclusão lógica dos novos atos e bloqueio da exclusão de fiscais com designação ativa;
- carteira demonstrativa idempotente para todos os novos módulos.

## Regras centrais

1. `tenantId` sempre vem da sessão autenticada.
2. Fiscal, usuário, OS e registro vinculado precisam pertencer à mesma organização e contrato.
3. O valor atual do contrato não é editável; inclui somente atos financeiros ativos.
4. Um apostilamento cadastral não altera o valor. Reajuste, repactuação e atualização monetária
   exigem percentual ou impacto financeiro.
5. Documentos não são públicos e cada download gera auditoria.
6. Exclusões arquivam registros; a trilha processual não é apagada fisicamente.

## Migração

`20260804143000_contract_governance` é aditiva. Ela acrescenta duas colunas ao contrato e cria
as tabelas de fiscais, equipe, garantias, apostilamentos, recebimentos, diários, comunicações e
anexos do dossiê.
