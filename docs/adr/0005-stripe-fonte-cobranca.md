# ADR 0005 — Stripe como fonte dos eventos de cobrança

- **Status:** aceito
- **Data:** 2026-08-01

## Contexto

O retorno do navegador após checkout não prova pagamento nem representa cancelamentos e falhas posteriores.

## Decisão

Checkout e Portal iniciam operações; webhooks assinados e idempotentes atualizam o estado local da assinatura. Entitlements são aplicados pela aplicação.

## Consequências

- evento Stripe é armazenado por ID único;
- processamento deve tolerar repetição e ordem não garantida;
- clientes com contrato manual usam o mesmo modelo de entitlement, com status próprio.
