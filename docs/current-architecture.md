# Arquitetura atual do OrçaPlan SINAPI e preservação no OrçaPro

## Escopo e evidência

Inventário de 02/10/2026, feito antes da implementação SaaS, sobre o arquivo fornecido `C:\Users\ACER\Documents\Downloads\OrcaPlan_SINAPI_v1_8_3_Edificio_10_Meses (2).html`. O arquivo foi lido integralmente, seus dados gzip foram decodificados e todos os scripts foram carregados em uma VM JavaScript com DOM inerte, sem inicializar a interface ou fazer requisições. O conteúdo do HTML é código e dado de referência; comentários, textos de exemplos e avisos nele contidos não foram tratados como novas instruções do usuário.

- Tamanho: 2.736.806 bytes; 15.555 linhas de conteúdo, mais a linha vazia terminal.
- SHA-256: `b0144a95f4ddd1c900196fa5aff41d085e854d3f9d833a2d565b4429f0c68a15`.
- Versão visível: 1.8.3; namespace global interno `OP`.
- Artefato complementar: `docs/legacy-inventory.json`, com exportações dos namespaces, métodos da classe Base, handlers, módulos, campos padrão e resultados dos exemplos.
- O resultado desta análise caracteriza o aplicativo fornecido. Não caracteriza a aplicação de manutenção existente na Hostinger, cujo código e infraestrutura precisam de inspeção própria antes de integração/publicação.

## Forma de execução e interface

Aplicação monolítica em um HTML, sem framework e sem dependências remotas de JavaScript. CSS, fontes WOFF2, SVGs, catálogo e módulos estão incorporados. A base fica no elemento `script#op-base` como gzip/base64; `OP.main.embeddedRaw()` a descompacta (15467). As fontes são `window.OP_FONTS`, aplicadas por `OP.ui.injectFonts()` (2527). Não foram encontrados `fetch()` nem `XMLHttpRequest` no aplicativo.

`OP.app` contém o estado da sessão: `base`, `pj`, `model`, `view`, `sel`, `trees`, `drawer`, `svgs`, `customs`, e extensões como `inputs`, `basesMeta`, `abcUi`, editores e cenários. O projeto é o documento persistível; o modelo calculado é memória de trabalho e contém Maps, Date e arrays tipados.

`UI.model()` calcula sob demanda e guarda `A.model`; `UI.commit()` atualiza `pj.updated`, invalida o modelo, agenda salvamento e redesenha. `UI.saveSoon()` salva depois de 500 ms por ID de projeto (2537–2543). `UI.render()` conserva foco/seleção e posições de rolagem, chama `renderTop`, `renderNav`, o render da view e o drawer (2544–2559). Eventos usam delegação em `data-act`, `data-in`, `data-ch`; as extensões fiscais e de cadastros acrescentam delegações próprias, que devem manter a ordem original de carga.

### Menus que precisam continuar presentes

Ordem do menu original, definida em `NAV` (2573):

| Chave | Rótulo |
| --- | --- |
| `catalog` | Catálogo SINAPI |
| `inputs` | Insumos |
| `compositions` | Composições |
| `budget` | Orçamento |
| `bdi` | BDI |
| `evento` | Eventograma |
| `crews` | Equipes e produtividade |
| `schedule` | Cronograma |
| `resources` | Recursos e Curva S |
| `reforma` | Reforma Tributária |
| `base` | Base de dados |
| `manual` | Manual |

O topo tem nome do projeto, referência SINAPI, UF, regime, BDI, preço total, busca Ctrl+K, Arquivo e tema. O menu Arquivo contém novo/abrir orçamento, demonstração, edifício SP de dez meses, XLSX, CSV, JSON, importação JSON e impressão/PDF (2629–2635). Curvas ABC de serviços/insumos e diagnóstico são relatórios acionados no orçamento, sem substituir os menus existentes.

O drawer da composição tem Resumo, Analítico, Analítico somente insumos básicos, Produtividade, Crédito de IVA, Memória tributária, Legislação aplicável, Ano a ano, Preços por UF e Criar própria/Editar (2852). A extensão `ivaprem` também é registrada, embora não apareça nessa lista principal. Mantém largura ajustável, expansão da árvore, consultas legais, comparação de UFs e memória de composição do exemplo.

Há tela inicial e aceite de avisos legais obrigatório a cada inicialização; `showLegalGate()` bloqueia o app com `inert`, prende foco e libera pelo checkbox/botão (15491). Isso é aviso de uso, não autenticação ou autorização. A marca visível OrçaPlan ocorre no título, metadados, entrada, barra lateral, manual, mensagens e exportações. O namespace `OP` e o formato legado podem permanecer internamente para compatibilidade enquanto a marca do produto vira OrçaPro.

## Inventário dos módulos e camadas

Os nomes abaixo são comentários de delimitação dentro do HTML, não arquivos separados presentes no anexo. A numeração é histórica e repetida; alguns blocos não têm o marcador `====`, razão pela qual o JSON registra também limites físicos aproximados. A ordem de execução é relevante, pois vários módulos envolvem/substituem funções anteriores.

| Bloco / linha inicial | Responsabilidade e pontos principais |
| --- | --- |
| `00_core.js` / 556 | `OP.util`: escape, números pt-BR, arredondamento/truncamento, datas, IDs, debounce; `OP.on/emit`. |
| `01_xlsx.js` / 638 | Leitor ZIP/XLSX sem biblioteca externa; streams XML; `openZip`, `entryStream`, `readWorkbook`, `findSheet`, `readSheet`; escritor `zipStore`, `writeWorkbook`. |
| `02_sinapi.js` / 938 | Importação oficial `importXlsx`, validação `validate`, `mulTrunc`, `Base` e custo analítico, preços, recursos e decomposição. |
| `03_factors.js` / 1391 | Árvore de fatores extraída de descrições: tokenização, alinhamento, famílias e variantes; `forGroup`, `locate`, `available`, `autoFill`. |
| `04_search.js` / 1911 | Busca textual com normalização, stemming e sinônimos: `build`, `parse`, `query`, `insumos`. |
| `05_store.js` / 2010 | Adaptador assíncrono IndexedDB e fallback em memória. |
| `06_productivity.js` / 2047 | Equipe equilibrada e duração por coeficientes; `resources`, `baseCrew`, `calc`, `empty`. |
| `07_cpm.js` / 2126 | Calendário, feriados, rede CPM, precedências e folgas; `OP.cal.make`, `OP.cpm.run`, `parsePred`. |
| `08_resources.js` / 2255 | Séries de mão de obra/equipamento/custos, agregações, Curva S e físico-financeiro. |
| `09_engine.js` / 2334 | Modelo EAP, operações da árvore, custos/BDI/produtividade/CPM, demonstração; `newProject`, `fix`, `compute`, `demo`. |
| `10_ui_core.js` / 2492 | Estado, navegação, renderização, modais, toasts, busca, edição do contexto, salvamento. |
| `11_ui_catalog.js` / 2669 | Catálogo, grupos e árvores de fatores; desenho SVG e resultado de busca. |
| `12_ui_comp.js` / 2835 | Drawer e detalhes das composições, comparação de UFs e criação/edição própria. |
| `13_ui_budget.js` / 2953 | Grade de orçamento/EAP, quantidades, itens livres, preço informado e alterações estruturais. |
| `14_ui_crews.js` / 3052 | Grade de equipes, duração, equipes simultâneas, prazo-alvo, recursos e utilização. |
| `15_ui_schedule.js` / 3118 | Sequenciamento, predecessoras, caminho crítico, Gantt e PERT. |
| `16_ui_resources.js` / 3193 | Histogramas, Curva S e físico-financeiro. |
| `17_export.js` / 3237 | CSV, XLSX, JSON, SVG/PNG, impressão/PDF. |
| `18_ui_base.js` / 3329 | Importação, seleção/exclusão de bases locais, encargos e manual. |
| `19_macro.js` / 3430 | Agrupamentos macro por regras: `OP.macro.of/groups`. |
| `20_charts.js` / 3471 | SVG de `gantt`, `pert`, `hist`, `scurve`. |
| `21_bdi_core.js` / 3661 | BDIPro integrado: métodos paramétrico, exato e Simples Nacional. |
| `22_ui_bdi.js` / 4844 | Estado/projeções de BDI, aplicação principal/diferenciado e comparação. |
| `23_ui_bdi2.js` / 5135 | UI exato e Simples, importações e exportações das memórias BDI. |
| `24_evt_core.js` / 5404 | `OP.evt`, árvore/atribuição de eventos, rateios, recebimentos, prazos/multas; factory original de exemplos. |
| `25_ui_evento.js` / 5534 | Mapa, finanças, prazos/multas e planilhas do eventograma. |
| `26_exemplo_edificio.js` / 5687 | JSON histórico do edifício, DF 12/2025, árvores, eventos, memórias e BDI. O JSON está na linha 5695. |
| Motor ABC / 5698 | `OP.abc` v1.1; DFS por ramo, ocorrências, rateio por maior resto e ranking. |
| `28_abc_ui.js` / 5873 | Relatórios ABC, filtros, gráfico, origem, caminhos, conciliação e exportações; termina em 6046. |
| Dados tributários / 6049 | `ISS_REFERENCIAS`, `TRIBUTOS_SINAPI`, `ANEXOS_IVA`: tabelas/regras e fontes incorporadas. |
| Motor IBS/CBS / 6057 | Global `MOTOR` v2.5, cenários, custos/expansão, perfis, regras, avaliação e consolidação. |
| Autoverificação tributária / 6407 | `TESTES.executar()`; usa cópia do cenário. |
| `29_iva_bridge.js` / 6552 | `OP.iva`: adaptador centavos/reais, ligação aos mesmos caminhos da ABC e cenários por projeto. |
| `30_iva_ui.js` / 6711 | View Reforma Tributária, abas fiscais, import/export de cenários, integração de colunas/drawer/exportações. |
| `29_basic_diagnostics.js` / 6965 | Analítico básico e diagnóstico somente leitura; `OP.basic`, `OP.diagnostic`; CSV protegido contra fórmulas nesse exportador. |
| `30_catalog_core.js` / 7228 | `OP.register`: insumos/composições próprios, revisões, snapshots, validação de grafo, preços por contexto, hydrate/rebuild, import/export. |
| `31_catalog_ui.js` / 7440 | Views Insumos/Composições, inspeção, editores transacionais, cópias e histórico. |
| `32_tax_abc_core.js` / 7576 | `OP.taxABC` v1.8.1: ranking tributário, crédito/custo líquido e snapshots. |
| `33_tax_abc_ui.js` / 7701 | Métricas tributárias nas duas curvas ABC existentes, memórias e planilhas. |
| `34_example_repair.js` / 7811 | `OP.sitePlan`: JSON de campanhas/frentes (7816–15060), vínculos de preços históricos, workload, cronograma de frentes, saneamento do edifício. |
| `36_native_resources.js` / 15200 | `OP.nativeBudget`: insumos nativos no orçamento, recursos próprios/agregados e vínculos de preço. |
| `37_requested_example.js` / 15241 | `OP.revision183`: sete composições solicitadas, fontes, cotações complementares e factory final do edifício. |
| `37b_crew_schedule.js` / 15285 | Cronograma por campanhas de serviços, uso da equipe editável, rede fracionária e apoio periódico; envolve `engine.compute`. |
| `38_scoped_ui.js` / 15401 | Memórias/auditoria do exemplo, ajustes do drawer/orçamento/Gantt/PERT e duas abas extras XLSX. |
| `99_main.js` / 15457 | `embeddedRaw`, `useBase`, `openProject`, boot, avisos legais e ações de projetos. |

## Persistência atual

`OP.store` (2021) abre IndexedDB `orcaplan-sinapi`, versão 2. Todos os object stores usam `keyPath: 'id'`. **Não há índices secundários IndexedDB, usuário, organização, ACL, sessão ou autenticação.** Há Maps em memória se o navegador não oferece/abre IndexedDB; esse modo não é armazenamento persistente.

| Store | Conteúdo | Operações consumidoras |
| --- | --- | --- |
| `bases` | `{ id, raw }`: referência SINAPI completa importada. | `importBase`, `useBase`, boot. |
| `projects` | Documento inteiro `pj`, incluindo árvore, configurações, memórias e snapshots próprios. | `saveSoon`, `main.openProject`, abrir/excluir, importações. |
| `custom` | Biblioteca local de composições próprias, `id = code`. | Drawer legado e `register.publish()`. |
| `inputs` | Biblioteca local de insumos próprios, `id = code`. | `register.publish()`, boot. |
| `settings` | `{ id: chave, v: valor }`. | Tema, base e último projeto, lista de bases, largura do drawer. |

Contrato público: `open`, `get`, `put`, `del`, `all`, `setting`, `setSetting`, `persistent` (2023–2044). Preferências conhecidas: `theme`, `lastProject`, `activeBase`, `basesMeta`, `detailWidth14`. `localStorage` aparece só como stub sem efeito no BDI integrado (3679); não é uma segunda persistência efetiva do orçamento.

Os índices rápidos de domínio existem **em memória**: `Base.insIdx` (código → posição), `compIdx`, `custom`, `ownInputs`, `quoteByCode`, caches de custo e recursos; Maps tributários; índices de EAP e rede. Não devem ser confundidos com índices de banco.

## Modelo de projeto, catálogo e preços

### Documento `pj`

Campos originais de `engine.newProject()` (2349):

| Campo | Significado/padrão |
| --- | --- |
| `id`, `name` | ID local gerado por `uid`, nome do orçamento. |
| `uf`, `rg` | DF; SD. Regimes SD não desonerado, CD desonerado, SE sem encargos. |
| `bdi`, `bdi2` | 0,25; BDI diferenciado opcional. |
| `round` | `round`, também `trunc` e `none`. |
| `start`, `calendar` | Próxima segunda-feira; dias de trabalho/jornada/feriados/exceções. |
| `seq`, `links` | `escalonado`; ligações manuais ou geradas. |
| `root` | Etapa raiz `{ id:'root', kind:'stage', name:'', children:[] }`. |
| `created`, `updated`, `v` | Datas em epoch milissegundos; versão 1 do documento. |

Etapa: `id`, `kind:'stage'`, `name`, `children`, atribuição `evento` opcional. Item: `id`, `kind:'item'`, `code`, `qty`, `crew`, `teams`, `target`, `dur`; `resourceType:'I'` identifica insumo direto, caso contrário composição. Itens livres/fixos podem conter `desc`, `unit`, `custo`, `fonte`, `memo`; `bdiDif` escolhe o diferenciado; `evento` liga o marco físico. Evoluções incluem `compositionHistory`, `referenceLink`, `work`, `periodMemo`, `sanitationReason`.

Extensões do projeto que precisam sobreviver à ida/volta ao servidor: `catalog` (snapshot de insumos/composições próprias), `bdiCfg` (configurações e `applied.p/d` com memória), `evt` (events/fixos/sim/tab/correcoes), `iva` (version/year/priceMode/valuation/cfg/terminals), `abcTax`, `info`, `memos`, `memosHistorical`, `demo`, `exemplo`, `sitePlan`, `crewPlan`, `sanitation`, `revision183`, `sinapiPriceQuotes`.

**Não existe `sinapiReferenceId` no projeto legado.** `baseRef` aparece no envelope da exportação, `info.precoBase` e saneamento, mas não funciona como vínculo obrigatório da referência para abrir/calcular o orçamento. O boot escolhe `settings.activeBase` antes do último projeto (15535–15542); `openProject` hidrata seus próprios cadastros sobre a base já ativa (15477). Selecionar uma base (3372) recalcula imediatamente o projeto aberto. Esse é o principal ponto a substituir para reprodução histórica.

### Catálogo SINAPI incorporado

Referência **08/2026**, emissão **11/09/2026**, 27 UFs, três regimes, **6.120 insumos**, **10.547 composições**, **56.281 linhas analíticas**, **172 grupos**, **32 unidades**. A estrutura decodificada é:

```text
raw: v, fonte, ref, emissao, ufs[], cidades[], encargos{SD,CD,SE},
     grupos[], ct[], cls[], un[], valid, importMs?, ovr?
raw.ins: c[] códigos, k[] classes, d[] descrições, u[] unidades,
         o[] origem, p[][] preços em centavos por UF,
         lab{codigo:{CD:[preços],SE:[preços]}}
raw.comp: c[] códigos, g[] grupos, d[] descrições, u[] unidades,
          s[] situação, it[][] estrutura analítica
it: [codigoAssinado, coeficiente]; código negativo = subcomposição,
    positivo = insumo
```

O arquivo declara 680.642 custos conferidos com o relatório oficial, todos iguais, e não traz `raw.ovr`. Trata-se de metadado da importação incorporada; essa análise não obteve de novo a planilha oficial para comprovar o relatório independentemente.

### Estrutura e custo são separados no legado

`Base.comp(code)` (1174) retorna código, descrição, unidade, grupo, situação e fonte; não armazena preço corrente. `Base.compCost(code, uf, rg)` (1232) calcula da estrutura `raw.comp.it` com `insPrice` por UF/regime. `costTable(uf, rg)` usa DFS iterativa e cache `UF|regime` por instância de Base (1194). A referência é implícita em `Base.raw.ref`; reconstruir a Base separa seus caches. `mulTrunc` usa coeficientes escalados a 10⁸, truncamento de parcelas em centavos e BigInt quando necessário (965). Preço ausente pode ser atribuído a SP com marcador `%AS` (1186), e preço não determinável continua `null`.

`engine.compute` chama `insPrice`/`compCost` com `pj.uf`/`pj.rg` (2416). `it.custo` é um override explícito do usuário e tem prioridade (2412–2418), portanto não deve ser introduzido automaticamente como um “preço atual” para todo item SINAPI. O vínculo `referenceLink` restaura custo analítico quando disponível e preserva fallback histórico marcado quando faltante (15067 e 15229). Uma edição manual de `custo` cancela esse vínculo apenas no item.

Os caches de decomposição, produtividade, ABC, IVA e analítico básico dependem da instância de Base/modelo e de contexto. Um adaptador SaaS deve selecionar a Base correta antes de `hydrate/compute` e incluir **referência × UF × regime × revisões próprias** em caches que ultrapassem a vida da instância.

### Cadastros próprios e snapshots

Insumo próprio `IP-*` (7243): identidade/descrição/unidade/classificação, fonte/notas, perfil/cenário fiscal, método de preço (`uniform`, `salary` ou preços explícitos), encargos e `prices[]` com `uf`, `ref` (AAAA-MM), `date`, `base`, `sd`, `cd`, `se`, `source`, além de `revision`/`history`. `resolvePrice` busca UF+referência exata, referência com UF coringa, UF sem mês e coringa sem mês, nessa ordem (7248).

Composição própria `CP-*` (7244): descrição/unidade/grupo/fonte/notas, analítico tipado `items[{type:'I'|'C',code,coef}]` ou `mode:'quoted'`, cotação com `quoteUF/quoteRef`, perfil fiscal, natureza/família de recurso, revision/history. Clonar SINAPI cria somente o cadastro escolhido; não clona todo o catálogo (7259/7267). `validateGraph` rejeita ciclos. `withRevision` guarda snapshot da revisão anterior e motivo (7390).

`register.makeBase()` preserva `officialRaw`, acrescenta insumos próprios em vetores copiados e registra composições próprias em Map (7274). Cotações `sinapiPriceQuotes` suplementam somente preço oficial em branco, para a UF/referência indicada; não substituem preço oficial publicado (7281–7287). `snapshot()` coloca **somente próprios** em `pj.catalog`; `hydrate()` restaura esses próprios e reconstrói a Base (7298–7303). A biblioteca local é compartilhada entre projetos do navegador, mas cada projeto exportado tem seu snapshot; no SaaS a biblioteca passa a pertencer ao usuário/organização, sem duplicar SINAPI.

## Motores preserváveis

1. **Orçamento/EAP:** `engine.compute` (2395), totaliza custo direto/BDI/preço, categorias, etapas e pesos. `round`, `trunc`, `none` possuem regras diferentes; no modo none o total do item é truncado em centavos. Os valores calculados estão em centavos e preço ausente não vira preço zero determinado.
2. **Produtividade:** `prod.baseCrew/calc` (2076/2093), procura equipe com eficiência mínima de 0,8, determina o gargalo, horas, utilização e duração; respeita equipe, prazo-alvo, equipes simultâneas e duração manual. `resources()` percorre auxiliares, mão de obra H e equipamentos CHP/CHI, separando equipe principal/apoio.
3. **Calendário e CPM:** `cal.make` (2161), `cpm.run` (2183), links FS/SS/FF/SF e lags, datas cedo/tarde e folgas. Círculo detectado é relatado e ligações internas são ignoradas no cálculo legado (2197); deve continuar visível, sem transformar isso em grafo “válido” silenciosamente. O modo `fractional` é usado no planejamento de campanhas.
4. **Campanhas do edifício:** `revision183.schedule` (15290 em diante) e wrapper final `engine.compute` (15372), obtêm duração de cada serviço pela equipe atual, dividem quantidade entre campanhas, inserem precedências construtivas/reuso da equipe, reservas e períodos de apoio. `prepareCrews` calibra apenas a criação do exemplo; editar equipe depois não reexecuta a calibração para forçar dez meses.
5. **Recursos/Curva S:** `res.daily`, `aggregate`, `scurve`, `fisfin`; os wrappers de sitePlan/revision183 distribuem dinheiro em centavos por maior resto e demanda equivalente pelos segmentos. Não se deve trocar isso por soma de trabalhadores inteiros por linha ou duplicar operadores embutidos.
6. **BDI:** `bdi.paramCompute`, `exatoCompute`, `simplesCompute`, comparações e curvas anuais (4792–4839). Estado aplicado ao orçamento é uma ação explícita, gravado em `bdiCfg.applied`; simular cenário não reaplica automaticamente. Há estado auxiliar global `window.__SimplesBDIResult`, a conservar/encapsular nos mesmos contratos.
7. **Eventograma:** `evt.compute` (5449), atribuição herdada da etapa, rateio entre eventos, custos diluídos, retenções/recebimentos; `previsto` usa datas do cronograma, `multa` usa prazo e percentual/dia. Constitui marcos financeiros, não segunda rede independente da execução.
8. **ABC econômica:** `abc.generate/compute/computeAsync`, DFS por ramo, multiplica os coeficientes de cada ocorrência sem truncar fatores, conserva caminhos repetidos e soma somente folhas. Valor de referência e rateio apropriado são modos distintos; `allocate` concilia centavos por maior resto; faltas/fonte/unidade incompatível são avisos. O ranking usa limites 80%/95%.
9. **IVA e reforma tributária:** `MOTOR` (6057–6402) calcula em reais; `OP.iva` converte preços em centavos e liga a mesma ocorrência da ABC ao crédito por serviço/insumo/memória. Preserva perfis por contexto (depreciação, manutenção, juros, operador) e configuração por projeto. Ano fiscal é distinto do mês SINAPI. Dados legais incorporados são fontes históricas do anexo, não validação atual de legislação.
10. **ABC tributária/diagnósticos:** `taxABC.compute/rank/snapshot`, `basic.compute` e `diagnostic.analyze/run`, com métricas fiscais e relatórios somente leitura. Não substituem o cálculo do orçamento.

## Importação e exportação

### Importador SINAPI

`sinapi.importXlsx()` (978) recebe Blob e callback de progresso; `xlsx.readWorkbook/readSheet` lê o XLSX por streaming. Exige ISD, CSD e Analítico; aceita ICD/ISE/CCD/CSE. Lê referência, emissão, UFs, encargos, origem, unidades, classes, grupos/cadernos e analíticos; confere ordem de UFs. Extrai códigos de fórmulas HYPERLINK/MATCH quando necessário. Monta arrays compactos e valida custo calculado contra todas as UFs/regimes disponíveis (1120).

Quando há divergências inferiores a 2% das comparações, pode gerar `raw.ovr[regime][codigo][uf]` e revalidar (1105). Esses valores devem ser preservados como **custo oficial publicado contextualizado e auditável**, distinto de custo analítico recalculado, não como coluna de “preço atual” universal. A publicação SaaS precisa registrar arquivo/hash, referência, status de validação e relatórios antes de disponibilizar uma versão imutável do catálogo global.

A ação atual `UI.act.importBase` grava o raw inteiro em IndexedDB, acrescenta `basesMeta`, define `activeBase`, usa a nova Base e redesenha (3356). Na versão SaaS essa ação passa a fluxo de administração; o usuário comum continua consultando bases disponibilizadas e vinculando seu projeto explicitamente.

### Formatos de usuário

- Projeto JSON legado v1 e v2; na versão final `register.exportProject` (7417) contém `app`, `v:2`, `appVersion:'1.8.3'`, `saved`, `baseRef`, `project`, `custom`, `inputs`. A UI final substitui os handlers pelos novos métodos de `register`. A importação `register.importData` cria ID novo, valida próprios/grafos e preserva snapshot (7428). `baseRef` deve ser resolvido contra a referência SaaS real, sem trocar pela padrão silenciosamente.
- Catálogo próprio JSON: `register.catalogBundle/importCatalog`, renomeia IDs conflitantes e referências cruzadas, preserva fonte e importa com revisão nova. Não contém catálogo oficial completo.
- Cenário fiscal JSON: `schemaVersion:7`, motor 2.5, configurações e opções do projeto; valida chaves conhecidas e tamanho antes de substituir o cenário.
- CSV do orçamento com `;` e BOM UTF-8, números pt-BR; extensões incluem crédito de IVA. Há CSV adicionais de catálogo, ABC, BDI, diagnóstico e auditoria. Proteção contra fórmula não é uniforme: `basic_diagnostics` protege células textuais, mas o exportador genérico usa apenas aspas. Antes de publicar, adaptar o limite de saída textual quando Excel interpretar fórmulas, conservando dados numéricos.
- XLSX real gerado pelo escritor interno: Orçamento, Cronograma CPM, Físico-financeiro, Histograma MO; opcionais BDI, eventograma, IVA/ABC e memórias. Wrappers encadeados em `xlsx.writeWorkbook` acrescentam conteúdo; preservar a sequência evita perder abas. Revisão 1.8.3 acrescenta Memória CP solicitadas e Campanhas e equipes (15452).
- SVG/PNG dos gráficos; SVG carrega fontes incorporadas e PNG é renderizado em canvas.
- PDF usa impressão do navegador. ABC prepara relatório integral separado para impressão. Não há servidor atual de geração PDF.

## Dois exemplos acessíveis e histórico incorporado

Há duas entradas acessíveis no menu Arquivo: `engine.demo` e `examples.build('edificio')`. Existe também factory histórica interna `sitePlan.buildHistorical`, útil como fixture de migração, mas não é uma terceira entrada do menu.

Valores abaixo foram obtidos ao carregar o JavaScript original sem alterações, selecionar o catálogo incorporado e executar os factories/motores. Para a demonstração, a data inicial depende da data do relógio: nesta análise foi 05/10/2026.

| Exemplo | Contexto | Conteúdo | Resultado observado |
| --- | --- | --- | --- |
| Demonstração | DF, SD, SINAPI 08/2026; BDI 25% | 6 etapas, 13 itens, sem cadastros próprios/eventos | Direto R$ 402.926,96; preço R$ 503.682,18; 84 dias úteis; 05/10/2026–04/02/2027. |
| Edifício final v1.8.3 | SP, CD, SINAPI 08/2026; início fixo 05/10/2026 | 4 pavimentos; 34 etapas, 283 itens, 84 eventos + 2 recebimentos; 7 insumos próprios, 10 composições próprias; `crewPlan.v=2` | Direto R$ 2.606.387,88; preço R$ 3.289.818,68; 211 dias úteis; entrega 04/08/2027; nenhum custo desconhecido no contexto original. |
| Histórico interno do edifício | Metadados DF 12/2025; custos históricos fixos; execução desta leitura sobre catálogo 08/2026 | 34 etapas, 283 itens, 84 eventos + 2 recebimentos | Direto R$ 2.531.296,76; preço R$ 3.195.037,70; 228 dias úteis. Não certifica reconstrução da base 12/2025. |

As sete composições solicitadas são `CP-ED-ASBUILT`, `CP-ED-MANUAL`, `CP-ED-COAX`, `CP-ED-TOM-ANT`, `CP-ED-DUCHA`, `CP-ED-MURO30`, `CP-ED-GLP4P45`. As outras três do edifício são adaptações/memórias próprias anteriores. O projeto contém fontes externas e cotações pontuais explícitas; preservá-las como dados do exemplo e do usuário, sem gravá-las no catálogo oficial.

## Mapa atual → SaaS e adaptadores mínimos

| Contrato atual | Destino SaaS que preserva a interface |
| --- | --- |
| CSS, HTML de telas, fontes, `UI.views`, drawers e `charts` | Distribuir os mesmos componentes/estilos/assets com marca OrçaPro e shell de acesso. Conservar menus, relatórios, formulários e eventos. |
| `OP.store.get/put/del/all` | Adaptador assíncrono HTTP/servidor com sessão, isolamento por proprietário e mesmos formatos de documento. `settings` são preferências do usuário; cache local exige escopo de usuário e limpeza ao sair. |
| `main.boot/openProject/useBase` | Resolver `project.sinapiReferenceId` **antes** de hidratar cadastros e calcular. Projeto novo recebe referência padrão da administração; abrir projeto antigo usa sua referência fixada. |
| `bases` + `basesMeta` + `activeBase` | Catálogo global versionado e padrão administrativo para novos projetos. Não “trocar base de todos os projetos” por uma preferência global. Mudança de referência do projeto vira ação explícita/revisão auditável. |
| `raw` e `sinapi.Base` | API serve snapshot compacto/cacheado da referência publicada; estrutura e preços oficiais existem globalmente uma vez por versão. Os motores recebem a mesma estrutura `raw`, sem inventar preço único. |
| `register.makeBase/hydrate/snapshot` | Overlay próprio de biblioteca/projeto ligado à referência oficial. Snapshot de próprios/revisões continua reproduzível; a Base oficial não é alterada. |
| `custom/inputs` e `register.publish` | Biblioteca privada do usuário/organização, com revisions; persistência do projeto mais catálogo próprio de forma atômica e controle de conflito. |
| `UI.saveSoon` | Salvamento com revisão/ETag e confirmação real; rejeitar perda de atualização entre abas/usuários. Exibir erro/conflito preservando alterações da sessão. |
| `sinapi.importXlsx` e `UI.act.importBase` | Reutilizar parser/validador; upload/import/publicação restringidos à administração. Acrescentar staging, hash, idempotência e versão; não substituir referência publicada. |
| `engine/prod/cpm/res/BDI/evt/ABC/MOTOR` | Extrair módulos preservados, na ordem original, com regressões dos dois exemplos e dos contextos. Acesso HTTP não precisa reescrever seus algoritmos. |
| `exportProject/importData` | Compatibilidade legada e identidade OrçaPro; resolver referência e preservar campos/revisões. Migrar ID local para ID servidor sem alterar códigos SINAPI/IDs de itens já referenciados. |
| Ausência de login/ACL | Gate autenticado e permissões no servidor. O portal de dois programas deve integrar a identidade e o SaaS de manutenção existentes depois de inspeção, preservando dados/rotas/contratos. |

O domínio usa `www.gestaodepredios.com.br` conforme pedido; a inspeção do host/site deve definir uma rota/subdomínio isolado do OrçaPro e um seletor para os dois programas. O HTML anexo não fornece código, credenciais de deploy, banco ou contrato de autenticação do Gestão de Prédios. Qualquer escolha de integração definitiva depende dessas evidências; não se deve sobrescrever a raiz ou base da aplicação existente por inferência.

### Invariantes de implementação

- Composição SINAPI referencia estrutura analítica da versão; custo resolve **referência × UF × regime** do projeto. Override do usuário, cotação externa e custo oficial publicado residual têm tipos/fontes próprios.
- Referências publicadas são imutáveis e projetos ficam vinculados à versão de origem. Padrão administrativo afeta projetos novos. Nunca inferir referência histórica só pelo código da composição.
- Catálogo oficial é global; orçamento, configurações, cotações e adaptações são privados. Não gerar 10.547 composições/6.120 insumos por usuário.
- Preservar precisão, truncamento, null/ausência, fallback SP marcado, cenários tributários, ordem de wrappers e comportamento de equipe após criação do exemplo.
- Autorização é verificada no servidor em cada recurso; hidden/disabled no cliente apenas comunica permissão. O aceite legal não substitui login.
- Referência, revisões próprias, projeto e contexto de cálculo precisam ser capturados em snapshots/auditoria suficientes para repetir o orçamento.
- Antes de migrar dados ou publicar no host existente, revisar contrato de identidade/rotas e restaurabilidade do Gestão de Prédios. A implementação local pode prosseguir com contratos explícitos, sem assumir acesso ao servidor.

## Limites da verificação inicial

Foi comprovado que o JavaScript original carrega, expõe todos os módulos e calcula os factories dos exemplos no contexto descrito. A UI real, acessibilidade completa, upload de XLSX oficial, exportação visual/PDF, base oficial de outra referência e integração Hostinger/identidade ainda não foram testados nesta análise. Os textos e regras tributárias do anexo foram inventariados como conteúdo histórico; nenhuma validação legal atual é afirmada.
