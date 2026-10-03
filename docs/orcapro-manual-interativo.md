# Manual interativo do OrçaPro

O menu **Manual** no editor fornece capítulos, trilhas, busca por conteúdo, mapa entre módulos, exercícios e exemplos numéricos. Esta extensão substitui somente a visualização do manual do OrçaPro; preserva o manual do Gestão de Prédios, o orçamento, os motores e o HTML original.

## Conteúdo e navegação

- 29 capítulos: acesso, engenharia de custos, SINAPI versionado, catálogo em árvore, cadastros próprios, orçamento, BDI, equipes, planejamento, cronograma, recursos/Curva S, eventograma, ABC de serviços/insumos, tributação, riscos, integrações, conferência, arquivos e administração.
- Quatro trilhas: primeiro orçamento; orçamento → cronograma; riscos → preço; IBS/CBS → auditoria das curvas ABC.
- Tributação: metodologia monetária, preço com/sem IVA, transição protegida, perfis, anexos, combustíveis ad rem, aquisição/depreciação, origem de preços, valoração, conciliação de centavos e campos editáveis/protegidos.
- BDI: métodos Paramétrico, Exato e Simples, matriz, participações, importação de recursos, fatores iniciais e premissas independentes da Reforma Tributária. O manual expõe as fórmulas efetivamente preservadas, sem apresentar parâmetros futuros como alíquotas legais definitivas.
- Busca sem distinção de acentos, filtro de assunto, índice de seções, capítulos relacionados, controles de fonte e progresso opcional local.
- Download HTML completo, consultável offline e imprimível pelo navegador, com capítulos, glossário e fontes oficiais. Não inclui dados do orçamento.

## Isolamento dos exemplos

O laboratório é didático, sem gravar ou carregar configurações financeiras do projeto. O exemplo IBS/CBS chama `window.MOTOR.avaliarOcorrencia` com configuração nova e ocorrência sintética, passando por `validarCfg`; não utiliza `OP.iva.config` nem altera premissas operacionais. Os outros exemplos explicam quantidade/capacidade e inclusão de R na fórmula clássica. Não executam Monte Carlo nem pretendem reproduzir todos os métodos BDI.

O progresso salva somente identificadores de capítulos na chave local `orcapro.manual.read.v1`. Falha ou bloqueio de localStorage não impede a leitura. Fonte, exercícios e entradas do laboratório permanecem em memória da página. Links para módulos usam navegação permitida já existente; não criam permissões de administrador.

## Manutenção e publicação

Conteúdo editorial: `scripts/orcapro/manual-content.json`. Apresentação e navegação: `manual-ui.js` e `manual-ui.css` no mesmo diretório. A instalação ocorre depois dos módulos preservados e antes do bootstrap autenticado. O gerador escapa `<` no JSON embutido; o renderizador escapa texto e atributos. Fontes são URLs HTTPS oficiais.

O manifesto do editor inclui versão/data editorial e SHA-256 normalizado de conteúdo, UI e CSS. A soma do editor altera a chave de cache do iframe. O original e os 41 módulos permanecem protegidos por checksums.

Validação: consistência de capítulos/trilhas/referências, cálculos usando motor preservado, distinção de zero/ausência, anexos sem redução duplicada, transição, ausência de mutação financeira, exportação sem scripts e entradas escapadas. Executar `node --test scripts/orcapro/manual-ui.spec.cjs` após gerar o editor, junto aos testes de derivação/ponte/riscos. A CI exige os mesmos checks, além dos testes da API e builds.

Revisão visual em fixture local sintética: leitura, busca, trilhas, mapa, laboratório, glossário, exercícios, fontes, download, tema escuro e layout estreito. Publicação segue PR, CI, merge, promoção Hostinger e conferência do release e manifesto em produção.

Mudanças de cálculo fiscal ou fluxos devem vir acompanhadas de revisão do capítulo correspondente e dos exemplos. A edição atual descreve o comportamento implementado; referências normativas são identificadas separadamente de hipóteses econômicas e padrões de cenário.
