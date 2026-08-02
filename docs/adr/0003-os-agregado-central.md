# ADR 0003 — Ordem de serviço como agregado central

- **Status:** aceito
- **Data:** 2026-08-01

## Contexto

O valor do produto depende da ligação entre demanda, execução, contrato, custo, evidência e resultado.

## Decisão

Modelar a OS como agregado central, com máquina de estados explícita, histórico, pendências, anexos, contratos, orçamento, medição e satisfação.

## Consequências

- novos módulos devem declarar relação com a OS;
- fechamento e medição respeitam invariantes do agregado;
- relatórios gerenciais partem da OS e de suas dimensões.
