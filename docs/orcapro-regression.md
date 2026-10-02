# Preservação e regressão dos motores OrçaPlan → OrçaPro

O original fornecido foi preservado integralmente em `legacy/orcaplan-1.8.3/original.html`, SHA-256 `b0144a95f4ddd1c900196fa5aff41d085e854d3f9d833a2d565b4429f0c68a15`. Nenhum motor original foi reescrito: 41 blocos JavaScript, com seus wrappers históricos na mesma ordem, estão em `apps/api/src/modules/orcapro/legacy/assets/modules/`. O manifesto inclui linha de origem e hash de cada bloco. Os blocos ABC/fiscais sem marcador nominal continuam junto ao módulo adjacente para conservar a ordem exata.

`scripts/orcapro/extract-legacy.cjs` extrai a base oficial compacta como `legacy/orcaplan-1.8.3/sinapi-2026-08.raw.json`: agosto/2026, emissão 11/09/2026, 6.120 insumos, 10.547 composições, 56.281 linhas analíticas e 27 UFs. O catálogo existe uma vez; os projetos de exemplo guardam somente os seus cadastros próprios. O seed global deve ler esse caminho explicitamente, sem copiar o catálogo para cada usuário.

## Extração e atualização deliberada de fixtures

Da raiz do monorepo:

```powershell
node scripts/orcapro/extract-legacy.cjs
```

O comando verifica o original preservado e reextrai os módulos/base; não atualiza os resultados congelados. Somente o comando explícito abaixo escreve as fixtures:

```powershell
node scripts/orcapro/extract-legacy.cjs --update-fixtures
```

Na primeira extração, pode-se fornecer `--source <caminho do HTML original>`. Um HTML de outro hash é rejeitado; uma nova versão exige auditoria e novo diretório/manifesto, em vez de aceitar um arquivo alterado silenciosamente.

Fixtures em `legacy/orcaplan-1.8.3/fixtures/`:

- `demo.project.json`: demonstração original de 13 itens; contexto DF/SD.
- `edificio.project.json`: exemplo final 1.8.3, 283 itens, SP/CD, sete insumos e dez composições próprios.
- `baseline.json`: resultados do orçamento, produtividade por item, CPM/datas/folgas, ABC física, séries diárias de mão de obra/equipamento/dinheiro, Curva S, físico-financeiro, eventos/recebimentos e totais do crédito de IVA.
- `provenance.json`: origem dos exemplos e distinção do histórico DF dezembro/2025 incorporado no arquivo.

O relógio dos factories foi fixado em `2026-10-02T12:00:00-03:00`. IDs aleatórios de projeto/EAP foram substituídos deterministicamente, atualizando as referências a esses IDs. Nenhuma quantidade, código SINAPI, preço, coeficiente ou fórmula foi alterada. O edifício final usa agosto/2026, enquanto preserva memórias/cotações históricas explícitas: a fixture não certifica reconstrução do catálogo SINAPI dezembro/2025.

## Contrato de runtime

```typescript
const runtime = loadLegacyRuntime(); // Instância isolada para a requisição.
const { project: derivedCopy, base, model } = runtime.calculateProject(
  officialRaw,
  authorizedProjectDocument,
  { referenceId: authorizedProject.sinapiReferenceId },
);
```

O wrapper TypeScript está em `apps/api/src/modules/orcapro/legacy/legacy-runtime.ts`. Métodos:

- `createBase(raw, referenceId?, inputs?, compositions?, quotes?)` cria Base e caches independentes, clonando todos os dados.
- `calculateProject(raw, project, {referenceId?})` retorna `{project, base, model}`. O projeto de entrada permanece intacto; os campos derivados periódicos/configurações do original aparecem na cópia retornada.
- `buildExample('demo'|'edificio', raw)` cria um projeto independente; o backend deve atribuir UUID/usuário/tenant/referência oficiais ao persistir.
- `summarizeProject(raw, project)` produz a projeção de regressão serializável.
- `OP` expõe os namespaces originais para operações avançadas, por exemplo `base.itemsOf/breakdown`, `OP.abc.compute`, `OP.evt.compute`, `OP.res.*`, `OP.bdi.*` e `OP.iva.*`.

Não usar singleton: os bridges originais de IVA/BDI possuem estado mutável por contexto. O runtime rejeita UF/regime inexistente e um ID de referência do projeto diferente do ID fornecido. A associação entre o snapshot `raw` e o ID publicado continua responsabilidade do serviço que o obtém do catálogo autorizado; o formato legado por si só não prova essa associação.

A VM carrega exclusivamente assets instalados cujo hash confere com o manifesto. Não recebe `require`, `process`, rede, armazenamento ou DOM ativo. Projetos/raw enviados por usuário nunca são executados. `assetsDirectory` é configuração interna de implantação/teste, não argumento HTTP. A VM não é uma fronteira de segurança para JavaScript arbitrário e não deve ser usada como tal. Toda autorização, tenant/proprietário, DTO/limites e revisão transacional devem ser validados antes de chamar o wrapper.

Dinheiro do orçamento conserva o cálculo original em centavos/truncamento e ramo BigInt; coeficientes e decomposições proporcionais conservam os números do legado. Persistência SaaS utiliza DECIMAL e campos JSON, conforme ADR 0007. Os números projetados para regressão não criam um modelo financeiro alternativo.

## Assets no build

O compilador Nest não transpila os motores `.js/.cjs`: copiar `src/modules/orcapro/legacy/assets/**` para `dist/modules/orcapro/legacy/assets/**` como assets do Nest. O wrapper resolve `__dirname/assets`, de modo que fonte, Jest e build usem o mesmo contrato. O catálogo bruto e as fixtures ficam em `legacy/`, fora de assets públicos da web, e são usados somente para seed/testes explícitos. Não carregar a base inteira por usuário apenas porque ela está disponível no repositório.

## Cobertura executada

```powershell
npm test -w @gestaopredios/api -- --runInBand legacy-runtime.spec.ts
```

Resultado inicial: **10 testes aprovados**. A suíte apenas lê as fixtures congeladas e verifica:

1. SHA do original e manifesto de 41 módulos.
2. Igualdade integral dos dois exemplos com o baseline, incluindo todos os campos/séries congelados, sem mutar projeto/raw de entrada.
3. Troca de UF/regime e retorno ao contexto anterior, com custo calculado da estrutura e sem propriedade preço/custo da composição.
4. Referências independentes com preços e coeficientes distintos, cache isolado e rejeição de vínculo divergente. A segunda referência é sintética e identificada como teste; não é publicação oficial setembro/2026.
5. Ausência de preço, fallback SP marcado e truncamento inteiro/BigInt.
6. Isolamento dos overlays próprios; catálogo oficial permanece em 6.120/10.547 e não vaza cadastros entre projetos.
7. Alterar a equipe do item 6.1 muda horas/duração e não reexecuta calibração para forçar prazo.
8. CPM fracionário, precedência SS e sinal de ciclo.
9. Rejeição de UF/regime não disponível na referência.

## Limites de cobertura

Os totais do IVA foram congelados e comparados. O exemplo edifício mantém crédito **parcial**, com 58 ocorrências fiscais não determinadas, tal como o original; não apresentar o total conhecido como crédito integral certificado. Ano fiscal e mês SINAPI permanecem distintos.

Os motores BDI paramétrico/exato/Simples e as tabelas tributárias estão carregados e acessíveis, mas esta suíte não congela cada cenário BDI nem todas as regras fiscais. A aplicação do BDI do exemplo e o preço final estão cobertos pelo orçamento congelado. A autoverificação fiscal `TESTES` existe nos assets originais e não foi invocada nesta suíte. Nenhuma atualidade legal é afirmada pelo teste.

A equivalência é de motores/resultados, não de renderização visual, acessibilidade, impressão/PDF, SVG/PNG ou conteúdo binário XLSX. Parser XLSX foi preservado, mas uma planilha oficial nova ainda requer teste de importação e validação independente. Banco/tenancy/login/ETag são cobertos pelos testes do módulo SaaS, não pela VM pura. O gate legado de avisos não é autenticação.

## Editor web derivado

`node scripts/orcapro/build-cloud-editor.mjs` verifica o SHA do original, conserva seus motores/interface, renomeia a apresentação para OrçaPro e remove o catálogo embutido e a inicialização IndexedDB. O script lê os arquivos de ambiente com `@next/env`, primeiro em `apps/web`, depois na raiz, preservando valores já definidos. A origem da API é fixada no build a partir de `NEXT_PUBLIC_API_URL`; o parâmetro de URL aceita somente UUID do projeto. Os assets derivados são `apps/web/public/orcapro-legacy/editor.html` e seu manifesto. O original permanece intacto.

O bridge autentica `/orcapro/access`, obtém a referência/UF/regime e o fechamento analítico em `/projects/:id/context`, e salva documentos privados com `expectedVersion`. Um conflito 409 mantém as alterações abertas, bloqueia novas gravações e oferece exportação JSON/reabertura. Falhas não são convertidas em sucesso local. O iframe notifica seu parent exclusivamente na mesma origem, com `type: 'orcapro-save'` e estados `saving`, `saved`, `error`, `conflict`.

Catálogo oficial usa consultas paginadas e bundles analíticos sob demanda. Árvores e troca de variante carregam o caderno completo por filtro `group` antes de chamar o gerador de fatores original; cada bundle contém no máximo 500 raízes. A seleção de insumos usa o handler nativo preservado. Preferências visuais, sem dados de orçamento, são as únicas gravações locais permitidas.

A biblioteca privada consulta as últimas revisões de `/custom-inputs` e `/custom-compositions`. Editar/importar explicitamente um cadastro publica somente os registros afetados, após a gravação do projeto. Salvar projetos antigos ou adaptar uma ocorrência do orçamento conserva os snapshots e não publica sua revisão automaticamente. “Usar neste projeto” inclui a cadeia de cadastros próprios e carrega os recursos oficiais necessários, preservando os códigos/revisões já existentes no projeto. A lista de cadastros originais continua disponível para comparar SD/CD/SE, histórico, exportação/importação JSON e CSV da consulta carregada.

```powershell
node --test scripts/orcapro/cloud-bridge.spec.cjs scripts/orcapro/sanitize-derived-html.spec.mjs
```

Resultado: **11 testes aprovados** para refresh 401, transporte autenticado, fila/versões, conflito, negação de mutações oficiais/IDs externos, merge sparse, publicação privada explícita, preservação de revisões antigas, fechamento privado sem sobrescrever snapshots, rejeição de JSON malicioso antes de mutar/renderizar, escape dos sinks e compilação dos scripts derivados. São testes de contrato com transporte simulado. Não regeneram baselines dos motores.

O sanitizador do HTML derivado escapa IDs/revisões interpolados pela interface original e restringe links dinâmicos a HTTP(S). A importação de projeto só ocorre no portal após validação backend; a importação de cadastros próprios também verifica IDs, revisão/histórico, chaves de protótipo, URLs e limites antes de executar o importador original. Essas medidas complementam os DTOs e a validação recursiva backend; não dispensam esses controles.

Na QA local autenticada, a demonstração exibiu o baseline DF/SD de R$ 503.682,18; trocar UF para SP recalculou R$ 483.478,08; trocar regime para CD recalculou R$ 467.601,00. O servidor confirmou versões 2 e 3, e o contexto reaberto preservou SP/CD. O orçamento, 84 dias e datas foram renderizados com apenas 86 composições no fechamento inicial. A geração do HTML foi corrigida para injetar o bridge após o script principal, sem atingir `</body>` literal dos relatórios internos. O aviso de armazenamento agora descreve confirmação servidor/falhas/conflitos. Códigos ausentes com custos históricos explícitos recebem aviso próprio, sem tratá-los como preços SINAPI atuais.

A instância de navegador do subagente permitiu preenchimento/seleções e leitura, mas cliques posteriores não alteraram menus/checkboxs e visibilidade IAB não é suportada nesse contexto. A QA de interação BDI/CPM/Curva S, catálogo e biblioteca ainda deve ser concluída na instância principal visível. Não confundir carregamento dos motores e contratos aprovados com validação visual completa dessas telas.
