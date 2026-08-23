# v0.19 — Conciliação financeira e homologação analítica

## Objetivo

A versão 0.19 transforma os valores antes exibidos de forma isolada em uma cadeia financeira
verificável por contrato. O valor atual continua sendo derivado do valor original, aditivos,
reajustes, repactuações e apostilamentos. A planilha do contrato passa a ser um detalhamento desse
mesmo limite, e não uma nova fonte capaz de ampliar silenciosamente o valor contratado.

## Invariantes implementadas

Para cada contrato, o motor verifica:

1. `valor atual = valor original + aditivos + ajustes + apostilamentos ativos`;
2. uma planilha orçamentária `ACTIVE` deve ser exatamente igual ao valor contratual atual;
3. uma planilha acima do contrato permanece editável como rascunho, mas sua ativação é recusada;
4. alterações em itens ou postos devolvem a planilha à situação `DRAFT`;
5. somente itens de planilha ativa podem ser usados como fonte de novos orçamentos de OS;
6. a soma oficial dos orçamentos de OS não pode ultrapassar o teto contratual/orçamentário;
7. orçamentos finais executados limitam as medições das respectivas OS;
8. medições oficiais não podem exceder o contrato e seus cabeçalhos devem fechar com os itens;
9. o total líquido empenhado não pode exceder o valor contratual;
10. liquidação não pode exceder empenho, pagamento não pode exceder liquidação e os pagamentos
    dos empenhos devem fechar com as medições pagas.

Os cálculos são feitos sob demanda, sem duplicar uma nova fonte persistida. A divergência existente
na planilha de demonstração do contrato `CT-2026/001` é, portanto, preservada para correção e passa
a aparecer como bloqueio explícito de homologação.

## API e interfaces

- `GET /finance/reconciliation`: fotografia de todos os contratos do tenant;
- `GET /finance/reconciliation/contracts/:id`: conciliação detalhada de um contrato;
- lista de contratos: situação e quantidade de inconsistências;
- planilha contratual: valor do contrato, total da planilha, diferença e motivos do bloqueio;
- dashboard: quantidade consolidada de inconsistências críticas;
- piloto: novo cenário `CONTRACT_FINANCIAL_INTEGRITY` e verificação financeira fortalecida.

## Bloqueios transacionais

A API valida o teto dentro da transação ao ativar a planilha, aprovar orçamento de OS, emitir ou
reforçar empenho. Assim, a proteção não depende da tela nem pode ser contornada por chamada direta.

## Banco e reversão

Não há migration nesta versão. O motor usa os relacionamentos já existentes. A reversão de código
remove as novas verificações e telas, sem alterar os dados. Planilhas automaticamente reabertas como
rascunho devem ser conciliadas antes de uma eventual reativação.

## Homologação

O GP-044 passa de 9 para 10 cenários. O aceite final permanece bloqueado enquanto houver cenário
automaticamente pendente. A versão registrada no novo aceite é `0.19.0`.

