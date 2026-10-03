# Extração fiel do OrçaPro Infraestrutura

Fonte aprovada: `legacy/infraestrutura-1.8.3/original.html` (cópia do HTML entregue).
O inventário `extraction-manifest.json` registra a SHA-256 do arquivo original e de cada módulo; finais de linha são normalizados para LF. Não são alteradas fórmulas nem regras de cálculo.

`python scripts/extract.py` extrai 52 módulos JavaScript em `src/modules`, na ordem original. O Vite apenas os empacota. O estilo está em `src/app.css`, e a estrutura HTML, com abertura e avisos legais, em `index.html`.

As únicas adaptações do módulo de inicialização são:

1. Carregar a fotografia SICRO recebida da API em `OP_SICRO_RAW`.
2. Adiar o boot automático para instalar o adapter autenticado antes da abertura do projeto.
3. Retirar a espera artificial de quatro segundos. A tela original de concordância continua obrigatória.

As três declarações de dados (`PD`, `SEED`, `DB`) recebem os mesmos objetos JSON pré-carregados em `OP_DATA`, sem alterar as funções consumidoras. A base de 6.619 composições e os 3.673 demonstrativos PEM ficam em `legacy/infraestrutura-1.8.3/base.json.gz` e `pem.json.gz`, fora das assets públicas do frontend. O servidor publica a fotografia vinculada à referência do projeto. Fontes e sementes metodológicas constantes de AL e mobilização ficam em `public/data`.

## Adapter

`src/api-store.js` é copiado pelo builder a partir de `platform/scripts/infraestrutura/api-store.js`. O adapter define `window.ORCAPRO_INFRA_CONFIG`:

```js
{
  prepare: async () => {},       // sessão, acesso, projeto, referência
  snapshotUrl: '...',
  pemUrl: '...',
  loadSnapshot: async () => raw, // ETag/cache autenticado
  loadPem: async () => pem,
  installAdapter: OP => {},      // antes de 99_main
  afterModules: async OP => {}   // todos os módulos, antes de OP.main.boot()
}
```

Store existente: `open`, `get(store,id)`, `put(store,record)`, `del(store,id)`, `all(store)`, `setting(key)`, `setSetting(key,value)`, `persistent()`. Stores: projects, custom, inputs, settings e bases. Catálogo oficial não pertence ao usuário e não deve usar as escritas de `bases` do frontend legado.

Pontos a substituir no adapter:

- `99_main.openProject`: inicializa referência própria e abre wrapper versionado; o legado salva imediatamente ao abrir.
- `99_main.boot`: último projeto e referência da sessão; o legado cria automaticamente o exemplo.
- `10_ui_core.saveSoon`: debounce por projeto de 500 ms, erro de gravação exibido; conflitos 409 precisam de resolução explícita.
- `17_export`: JSON leva dados integrais, biblioteca própria e análises de risco.
- `30_catalog_core`: adaptações e fotografias próprias; catálogo publicado permanece intacto.
- `risk-local`: análises trabalham no mesmo motor Worker; a persistência de `projects` é trocada pelo adapter.

O JSON de projeto conserva `root.children` (EAP), `uf`, `rg` (SD/CD/SE), BDI, cronograma/equipes, transportes/DMT/FIT/FIC, AL, mobilização, canteiro, IVA, PEM editados, cadastros próprios e riscos. Valores internos do motor usam a representação original; gravação não deve arredondar nem recalcular.

O adapter serializa gravações usando a versão confirmada pelo servidor. Uma resposta 409 bloqueia novas escritas, preserva o rascunho identificado por usuário, organização e projeto, e oferece salvamento como cópia. Cadastros próprios são serializados por código, com sua revisão confirmada; exclusões seguem a mesma fila. Não são criadas cópias do catálogo oficial por usuário.

O portal solicita a gravação antes de sair por `postMessage({type:'infra-flush',requestId})`. O editor aceita apenas mensagens do seu próprio pai e da mesma origem. Responde `infra-flush-result`, `ok` e mensagem; o portal só navega após `ok:true`. Rascunhos ainda não confirmados no formulário de composição/insumo ou na análise de riscos impedem a saída, inclusive quando há formulário pai pendente ou simulação em execução.

## Cache derivado e abertura

O catálogo global usa ETag, com autorização renovada em toda consulta. Um cache privado de resultados derivados em IndexedDB conserva as tabelas originais, incluindo valores BigInt, para evitar repetir os mesmos cálculos ao reabrir exatamente a mesma fotografia. Sua chave SHA-256 inclui a SHA do motor aprovado, a SHA do catálogo, a SHA de PEM, usuário, organização, projeto, versão do projeto, ciclo e **o documento completo do projeto**. UF, regime, coeficientes, preços próprios, DMT, FIT e FIC fazem parte desse documento; mudanças em qualquer campo invalidam o resultado. Projetos sem catálogo próprio versionado não recebem essa otimização. Também são verificadas as assinaturas efetivas de transporte, FIC e PEM da Base recém-construída antes de restaurar as tabelas.

São mantidos no máximo quatro contextos derivados no navegador. O cache não autoriza acesso, não é persistência do projeto e não representa um único preço atual. Sem cache, sem IndexedDB ou em qualquer contexto diferente, o motor aprovado calcula os valores normalmente. A construção inicial redundante da Base foi eliminada: a hidratação do projeto constrói a Base uma única vez.

Na fixture local com o build Vite e o adapter real, a abertura até os avisos legais foi medida em 2.207 ms, seguida de 1.622 ms na reabertura com cache. O critério de menos de três segundos foi observado nesse ambiente; tempo de rede e dispositivo continuam a influenciar a instalação real. O gate permanece com a caixa desmarcada e entrada desabilitada. A cláusula sobre armazenamento foi atualizada para explicar o servidor e o rascunho local; premissas técnicas e concordância continuam preservadas.

O importador administrativo é uma segunda entrada Vite (`import.html`, `src/importer.js`), mantida pelo extrator. Recebe os vetores colunares `raw.comp.c` e `raw.ins.c`; a função original de validação recebe `new OP.sicro.Base(raw)`. A leitura não publica nem substitui referências automaticamente.

## Regressão

`npm test` carrega o HTML aprovado e o conjunto modular em contextos isolados, com a mesma fotografia SICRO. Confere 6.619 custos publicados, todos os regimes, totais do exemplo de 64 serviços, prazo de 172 dias, autotestes AL/Mobilização/Canteiro/FIT/FIC/PEM e simulação/tornado de riscos determinísticos. Produz `test-results/regression.json`.

`tests/bridge.test.cjs` verifica fila de versões, imutabilidade do documento capturado, retenção integral de campos, conflito com recuperação, revisões próprias e exclusões, origem/remetente do IPC, rascunhos em edição, invalidação do cache e restauração exata de todos os custos e do prazo. A fixture de navegador `tests/preview-server.cjs` utiliza somente dados locais e identidade sintética; não autentica usuários reais nem aceita avisos legais.

Os autotestes PEM mantêm exatamente a tolerância do original: 5.708/5.708 fórmulas de equipamentos; 3.468/3.673 equipes pela regra geral; 3.598/3.671 vínculos à base. Não constituem uma conferência de 100% das equipes.

`npm run build` gera `dist`, com base `/infraestrutura-editor/`. As sementes globais SICRO e PEM não são incluídas nessa pasta. O snapshot SICRO comprimido original tem 311.758 bytes, abaixo de 1 MB.

`npm run build:static` copia o adapter vigente, constrói o editor e prepara `apps/web/public/infraestrutura-editor`, para ser incorporado ao export estático do Next.js. `VITE_API_BASE` recebe `NEXT_PUBLIC_API_BASE` quando não informado diretamente. Nenhuma outra pasta de aplicação é alterada.

## Runtime do backend

`npm run build:runtime` gera `apps/api/src/modules/infraestrutura/assets/legacy-runtime.cjs` dos mesmos módulos. A API executa `validateRaw(raw)` para conferir todos os custos publicados, e `compareProjects(oldRaw,newRaw,project,{oldPem,newPem})` para a revisão de referências. Os acervos PEM de cada ciclo são passados explicitamente; os dados de usuário nunca são executados como código.

O exemplo de rodovia completo está em `legacy/infraestrutura-1.8.3/example-road.json`. O campo `example` do raw SICRO original é vazio; esse projeto é gerado pela própria factory `OP.examples.build`.
