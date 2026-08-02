# v0.12.0 — custos por OS e Plano Inteligente

## Entregas

- data-base e índice de reajuste no cadastro contratual;
- até dez fotos JPG/PNG/WebP na emissão da OS, usando armazenamento privado;
- botão de orçamento no detalhe da OS e composição com catálogo ou item próprio;
- orçamentos `PLANNED`, `APPROVED` e `FINAL_EXECUTED`, cada um com aprovação e revisão;
- consolidação mensal dos finais executados aprovados, com vínculo direto na medição;
- prévia explicável por edificação e sistemas, com risco, recorrência, procedimento e checklist;
- confirmação humana que cria planos editáveis e OS pelo motor recorrente existente;
- seed cumulativo com dados sintéticos nos principais fluxos funcionais.

## Limites declarados

O motor `RULESET_BR_2026.1` é uma primeira biblioteca determinística. Ele não reproduz normas e
não substitui projeto, laudo, fabricante, PMOC, inspeção legal ou decisão do responsável técnico.
Catálogo amplo de componentes, sensores, Gantt, memorial, LCC e exportações profissionais
continuam no roadmap. O seed não cria sessões, tokens ou anexos sem arquivo físico só para
“preencher tabela”.

## Rollback

A aplicação anterior deve ser restaurada antes de remover a migration. Os novos dados são
aditivos. A unicidade antiga de um único orçamento por OS não pode ser restaurada enquanto houver
mais de um estágio registrado para a mesma ordem.
