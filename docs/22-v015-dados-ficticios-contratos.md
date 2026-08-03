# v0.15.0 — Carteira contratual fictícia

Data de referência: **3 de agosto de 2026**.

## Objetivo

Alimentar os módulos contratuais e financeiros da organização de demonstração
com registros relacionados e coerentes, sem misturá-los silenciosamente com
dados reais. O provisionamento é idempotente: uma nova publicação não duplica
os mesmos números de contrato, OS, empenho, medição ou termo.

## Massa de homologação

- cinco contratos no conjunto principal, com fornecedores, edificações,
  processos administrativos, vigências e valores distintos;
- nove termos de aditamento no conjunto total, incluindo acréscimo, supressão,
  alteração de escopo e prorrogação;
- oito ajustes no conjunto total, cobrindo reajuste, repactuação e reequilíbrio;
- cinco subcontratações autorizadas;
- cinco empenhos, além de emissão, reforço, anulação, liquidação e pagamento;
- oito OS financeiras adicionais, numeradas de `OS-2026-000013` a
  `OS-2026-000020`;
- 24 orçamentos, com previsto, aprovado e final executado para cada OS;
- 48 itens orçamentários próprios e respectivas revisões;
- oito medições adicionais em estados variados: rascunho, submetida, em
  análise, aprovada, rejeitada, liquidada e paga.

Os saldos de valor atual, medido e pago dos contratos são reconciliados a
partir dos eventos e medições persistidos, usando `Decimal`.

## Identificação e futura limpeza

Os textos produzidos por esta carga usam o marcador
`[DADOS FICTÍCIOS PARA TESTES]`. Os números adicionais usam os prefixos
`TA-DEMO`, `SUB-DEMO` e `MED-DEMO`; as OS financeiras ocupam a faixa
`000013–000020`.

Antes da limpeza definitiva, configure
`SEED_CONTRACT_TEST_DATA_ENABLED=false` na Hostinger para impedir que o seed
recrie a carteira em publicações posteriores. A remoção deve usar os fluxos de
arquivamento/cancelamento do sistema, respeitando a ordem financeira: estornar
ou cancelar fatos dependentes, arquivar OS, medições e empenhos e somente então
arquivar contratos. Não executar exclusão física direta no MySQL.

## Verificação

- typecheck e teste do manifesto da massa;
- execução do seed no build da API Hostinger;
- consulta autenticada às listas e ao dossiê de um contrato;
- reconciliação dos contadores de aditivos, ajustes, subcontratações,
  empenhos, medições e orçamentos.
