# Codex — comece por aqui

## Leitura obrigatória

1. `AGENTS.md`
2. `docs/00-especificacao-do-produto.md`
3. `docs/12-status-da-implementacao.md`
4. `docs/13-plano-inicial-de-issues-codex.md`
5. `docs/08-handoff-codex.md`
6. ADRs relacionados à tarefa

## Próxima issue

A baseline de **GP-001** foi concluída, exceto pelo build Docker local indisponível nesta máquina. Continuar por **GP-002 — Testes de isolamento multi-tenant**, já iniciado na CI, e depois **GP-003 — Hardening inicial da API**. Não desenvolver um novo módulo antes de concluir os gates da Fase A registrados em `docs/14-diagnostico-fase-a.md`.

## Prompt inicial recomendado

```text
Trabalhe no repositório Gestão de Prédios e continue a Fase A descrita em
docs/14-diagnostico-fase-a.md.

Leia AGENTS.md, docs/12-status-da-implementacao.md e os ADRs antes de alterar
qualquer arquivo. Preserve Node.js/TypeScript, NestJS, Next.js, MySQL/Prisma,
monólito modular, cookies HttpOnly e isolamento por tenant.

Conclua GP-002 e GP-003, valide as migrações versionadas e o isolamento entre
organizações em MySQL, corrija o roteamento público da Hostinger e execute os
smoke tests. Corrija os erros encontrados sem ampliar o escopo funcional.
Mostre os comandos e resultados reais; não declare sucesso sem execução.
```
