# v0.17.0 — Manual do Usuário interativo

## Objetivo

Disponibilizar orientação funcional dentro do próprio Gestão de Prédios, sem depender de PDF ou
documento externo, para que usuários de diferentes perfis aprendam o fluxo operacional no mesmo
ambiente em que trabalham.

## Entregas

- novo grupo **Ajuda** na barra lateral, com o item **Manual do Usuário**;
- rota autenticada `/manual`, disponível a todos os papéis da organização;
- pesquisa por palavras-chave em títulos, regras, campos, passos e dicas, ignorando acentuação;
- filtros por Primeiros passos, Operação, Cadastros, Contratos, Custos e medições, Planejamento,
  Gestão, Administração e Ajuda;
- índice lateral navegável e responsivo;
- conteúdo didático sobre 14 áreas do produto, incluindo início rápido, OS, edificações,
  contratos, SINAPI, medições, planos, KPIs, segurança e solução de problemas;
- tópicos expansíveis, passos numerados, regras de negócio, alertas, dicas e resultado esperado;
- atalhos contextuais para abrir diretamente o módulo explicado;
- controle de tamanho do texto;
- marcação opcional de tópicos lidos e barra de progresso armazenada em `localStorage`.

## Privacidade e arquitetura

O progresso de leitura não contém dado operacional e permanece somente no navegador do usuário.
Não há endpoint, tabela, cookie adicional ou sincronização entre dispositivos. Se o armazenamento
local estiver indisponível, todo o conteúdo e os controles de pesquisa continuam funcionais.

## Critérios de aceite

1. **Manual do Usuário** aparece na barra lateral de qualquer usuário autenticado.
2. A rota `/manual` faz parte da exportação estática usada pela Hostinger.
3. Pesquisar `medição`, `medicao` ou termos relacionados filtra os tópicos pertinentes.
4. Filtros, expansão, atalhos e ajuste de fonte são operáveis por teclado.
5. O leiaute se adapta a desktop, tablet e celular sem sobreposição.
6. Lint e build de produção do frontend são aprovados.

## Banco de dados

Esta versão não altera o schema Prisma e não requer migration.
