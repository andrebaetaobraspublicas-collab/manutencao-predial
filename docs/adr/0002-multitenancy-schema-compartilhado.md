# ADR 0002 — Multi-tenancy em schema compartilhado

- **Status:** aceito
- **Data:** 2026-08-01

## Contexto

O SaaS precisa atender múltiplos clientes com custo inicial controlado e consultas analíticas padronizadas.

## Decisão

Usar banco e schema compartilhados, com `tenantId` nas entidades de domínio, autorização derivada da sessão e índices compostos iniciados pelo tenant nas consultas críticas.

## Consequências

- operação e migrações centralizadas;
- risco crítico de acesso horizontal, mitigado por padrões e testes;
- banco separado pode ser oferecido futuramente apenas sob requisito enterprise e ADR específico.
