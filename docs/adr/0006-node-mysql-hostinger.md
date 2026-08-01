# ADR 0006 — Node.js, MySQL e Hostinger

- **Status:** aceito
- **Data:** 2026-08-01

## Contexto

A tecnologia e a hospedagem foram definidas pelo proprietário do produto.

## Decisão

Usar Node.js/TypeScript, NestJS, Next.js, MySQL/Prisma e implantar no domínio `gestaodepredios.com.br` em ambiente Hostinger compatível. Para produção complexa, preferir VPS com Docker.

## Consequências

- dependências devem permanecer compatíveis com Node LTS;
- SQL e índices devem considerar MySQL;
- deploy deve ser reproduzível e não depender de recursos exclusivos de outro provedor.
