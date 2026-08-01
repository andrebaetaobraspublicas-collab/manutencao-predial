# Manifesto da entrega — fundação v0.1

Data de referência: **1º de agosto de 2026**.

## Artefatos principais

- código-fonte do monorepo Node.js/TypeScript;
- API NestJS e frontend Next.js;
- schema Prisma para MySQL;
- Docker Compose local e de produção;
- Nginx de referência para `www.gestaodepredios.com.br` e `api.gestaodepredios.com.br`;
- diagramas de arquitetura e modelo de dados em SVG/PNG;
- especificação funcional, ADRs, contrato de API, roadmap e monetização;
- documentação operacional e pacote de handoff para Codex.

## Escala do pacote

- **147 arquivos** no pacote;
- **11363 linhas** de código, configuração e documentação textual;
- **84 arquivos TypeScript/TSX** verificados sintaticamente.

## Validação concluída

- JSON e YAML válidos;
- sintaxe TypeScript/TSX válida;
- imports relativos existentes, com exceção explícita do client Prisma gerado;
- ausência de `.env` real, `node_modules` e artefatos de build;
- varredura básica sem chaves reais do Stripe ou chaves privadas;
- diagramas Graphviz renderizados;
- revisão estática de Docker, multi-tenancy, autorização da OS e anexos privados.

## Limitação conhecida

O ambiente de geração não conseguiu baixar as dependências npm. Por isso não foram executados `npm install`, geração real do Prisma, migração inicial, build completo, Jest nem build Docker. O primeiro gate do Codex é a issue **GP-001**, descrita em `docs/13-plano-inicial-de-issues-codex.md`.

## Natureza da entrega

Esta é uma **fundação técnica v0.1**, adequada para iniciar desenvolvimento incremental e transferência ao Codex. Não deve ser apresentada como produto comercial pronto antes dos gates descritos em `docs/12-status-da-implementacao.md`.
