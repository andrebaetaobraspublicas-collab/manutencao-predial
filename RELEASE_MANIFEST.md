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

## Estado de validação atual

A limitação do pacote original foi superada em 1º de agosto de 2026: dependências, Prisma, lint, Jest e builds de API/frontend foram executados com sucesso. A migração e o seed também foram aplicados no deployment da Hostinger. Permanecem sem execução local o build Docker e a suíte e2e dependente de MySQL. O diagnóstico atualizado está em `docs/14-diagnostico-fase-a.md`.

## Natureza da entrega

Esta é uma **fundação técnica v0.1**, adequada para desenvolvimento incremental e piloto controlado depois de corrigir o roteamento público. Não deve ser apresentada como produto comercial pronto antes dos gates descritos em `docs/12-status-da-implementacao.md`.
