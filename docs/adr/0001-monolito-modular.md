# ADR 0001 — Monólito modular no início

- **Status:** aceito
- **Data:** 2026-08-01

## Contexto

OS, contratos, orçamentos e medições compartilham invariantes e transações. A equipe e a carga ainda não justificam sistemas distribuídos.

## Decisão

Manter uma API NestJS como monólito modular, com módulos de domínio separados e um banco MySQL. Frontend Next.js permanece como aplicação independente no mesmo monorepo.

## Consequências

- implantação e transações mais simples;
- menor custo operacional;
- disciplina necessária para impedir acoplamento entre módulos;
- extração futura somente quando métricas, escala ou isolamento justificarem.
