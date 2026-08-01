# Codex — comece por aqui

## Leitura obrigatória

1. `AGENTS.md`
2. `docs/00-especificacao-do-produto.md`
3. `docs/12-status-da-implementacao.md`
4. `docs/13-plano-inicial-de-issues-codex.md`
5. `docs/08-handoff-codex.md`
6. ADRs relacionados à tarefa

## Primeira issue

Começar por **GP-001 — Baseline instalável, lockfile e migração inicial**. Não desenvolver um novo módulo antes de comprovar instalação, geração Prisma, migração, seed, lint, testes, builds e Docker.

## Prompt inicial recomendado

```text
Trabalhe no repositório Gestão de Prédios e execute a issue GP-001 descrita em
docs/13-plano-inicial-de-issues-codex.md.

Leia AGENTS.md, docs/12-status-da-implementacao.md e os ADRs antes de alterar
qualquer arquivo. Preserve Node.js/TypeScript, NestJS, Next.js, MySQL/Prisma,
monólito modular, cookies HttpOnly e isolamento por tenant.

Instale as dependências, gere package-lock.json e o client Prisma, valide o
schema, gere e revise a migração initial_schema, execute seed, lint, testes,
builds e Docker. Corrija os erros encontrados sem ampliar o escopo funcional.
Mostre os comandos e resultados reais; não declare sucesso sem execução.
Atualize VALIDATION.md, CHANGELOG.md e a documentação pertinente.
```
