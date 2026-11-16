# ADR 0010 — Gestão Contratual com banco próprio

Status: piloto v2 publicado e verificado exclusivamente em desenvolvimento em 14/11/2026. Produção preservada.

## Decisão

OrçaPro Gestão Contratual é um produto de gestão de contratos de obras independente da manutenção/OS, integrado aos orçamentadores OrçaPro e Infra. Reutiliza a API modular e a identidade autenticada, mas mantém dados em banco MySQL próprio. A produção não faz parte desta autorização. Não criar banco, configuração, assinatura ou artefato em produção.

`GESTAO_ENABLED` e uma lista explícita de hosts de desenvolvimento fecham o acesso por padrão. `GESTAO_DATABASE_URL` é obrigatório e não pode apontar para os bancos de identidade, OrçaPro ou Infra. Não existe fallback. A migration independente precede qualquer uso; inicializar a API não executa DDL. O administrador inicial é a identidade verificada de André Baeta, com UUID configurado e e-mail correspondente. Nenhum acesso contratual resulta apenas de um e-mail fornecido pelo cliente.

## Integração e capacidade

Os serviços existentes autorizam a leitura da versão de origem. Contratos guardam uma fotografia identificada, privada e imutável; alterações contratuais não voltam ao orçamento. Não duplicar catálogos SINAPI/SICRO. O mesmo arquivo de origem pode alimentar cenários demonstrativos alternativos sem novas cópias integrais. Eventos e movimentos guardam deltas; salvamento sem alteração não deve criar histórico redundante. Dinheiro usa decimais textuais/racionais no cálculo e DECIMAL no banco; não usar ponto flutuante financeiro.

Na v2, anexos ficam fora do banco e da raiz pública. O banco guarda metadados autorizados. Índices, logs e versões fazem parte da medição de capacidade. Informação do MySQL não equivale à cota física do hPanel. Exemplos são rotulados e isolados de contratos reais.

## Consequências

Não há transação distribuída com o orçamento: capturar versão/hash, verificar autorização e manter fotografia local. Identidade e licenciamento mantêm contratos de integração próprios. A v2 integra Checkout, portal e webhook Stripe exclusivamente em modo de teste; não autoriza planos comerciais nem cobranças reais.

## Rollback

Desabilitar o gate e retornar o runtime/frontend de desenvolvimento anterior. Preservar banco próprio e registros novos; nunca restaurar bancos dos orçamentadores nem apagar dados para reverter código. Guardar backup privado da configuração antes de acrescentar a nova URL. Produção permanece fora dos scripts desta entrega.

## Histórico — entrega do piloto v1 em 14/11/2026

Os dados de publicação, capacidade e verificações desta seção pertencem à v1; não representam uma nova verificação da v2.

Endereço: https://gestaodepredios.com.br/gestao-contratual/. Banco dedicado `<conta-hostinger>_gestao_dev`, acesso restrito ao administrador inicial. A fotografia da versão 21 do edifício de quatro pavimentos (SINAPI SP 10/2026), com 283 itens e valor original de R$ 3.136.249,59, alimenta dois contratos demonstrativos, unitário e global. Os nove projetos existentes da conta foram comparados por versão e hash após a publicação e permaneceram intactos. A produção não foi alterada.

Os exemplos persistidos incluem três aditivos (acréscimo, supressão e serviço novo), três regras de preço (índice, cesta e reequilíbrio), duas medições aprovadas, dois pagamentos parciais fictícios e um registro de execução. Dez exemplos calculados explicam também retenções e restituições de compensação. A demonstração usa paradigma didático; não substitui a informação de referência da licitação. O eventograma de origem apresenta R$ 0,05 de diferença por arredondamento, explicitamente indicada na captura.

Consumo observado de dados e índices: 425.984 bytes (0,41 MiB), com uma fotografia comprimida compartilhada pelos dois cenários. Essa medida não inclui eventual overhead físico contabilizado pelo provedor. O valor do escopo é exibido na data-base; reajustes e reequilíbrios repercutem nas medições elegíveis e não estão somados nesse indicador.

Validação: builds de API e web aprovados; suíte geral com 62 suítes e 321 testes aprovados (27 testes previamente ignorados), seguida de nove testes restritos aprovados após o bloqueio de fontes vazias, zeradas ou quantidades que se tornam zero na normalização. Verificação remota confirmou API saudável, acesso anônimo negado e persistência dos exemplos. Backups privados de configuração, runtime e páginas foram mantidos no desenvolvimento.

### Limitações históricas da v1 — superadas pela implementação v2

Registro da situação anterior: este piloto não conclui a especificação integral. A captura de contratos do Infra, importação XLSX/PDF, anexos, segregação fiscal/gestor, aprovações de terceiros e cobrança Stripe não estão habilitadas. Aditivos e reajustes de contratos globais dependem do versionamento do eventograma; operações retroativas e reajustes após reequilíbrio também permanecem bloqueados. Contratos reais dependem da conclusão e homologação desses fluxos.


## V2 — operação contratual e assinatura de teste, 14/11/2026

As indisponibilidades enumeradas na seção histórica foram superadas pela implementação v2 descrita abaixo. Isso registra funcionalidades e verificações locais, sem antecipar o resultado da ativação ou da homologação remota. Permanecem os limites de leitura de arquivos, a necessidade de OCR externo para documentos escaneados e as conferências humanas do paradigma e das medições.

### Integração, identidade e isolamento

- Login próprio `/auth/gestao/login`, com e-mail e senha da identidade central e proteção de origem/ambiente. O seletor oferece Gestão Contratual somente no host de desenvolvimento. A navegação não depende do redirecionamento de assinatura do OrçaPro.
- Captura autorizada de OrçaPro e Infra por versão/hash, ou constituição de contrato a partir de arquivo conferido. Contratos reais exigem paradigma explícito; igualdade entre preços contratuais e paradigma demanda confirmação, sem presumir desconto zero.
- A fonte de 283 itens do edifício de quatro pavimentos sustenta dois contratos demonstrativos alternativos. Esses exemplos são registros da Gestão Contratual, não alterações dos orçamentos originais. Fotografias comprimidas são reutilizadas e não incluem cópia dos catálogos SINAPI/SICRO.
- Papéis por contrato: gestor, fiscal e leitor, com revogação auditada. O proprietário conserva a responsabilidade de gestor. O administrador inicial tem isenção de assinatura, mas essa isenção não concede visibilidade irrestrita a contratos alheios.
- A licença do proprietário autoriza o trabalho dos membros naquele contrato. Criar contratos próprios e capturar novas origens exige licença própria, salvo a isenção administrativa. Contratos reais exigem aprovador diferente de quem apresentou a medição; demonstrações permitem treinamento pela mesma pessoa.

### Operações e memória financeira

A v2 oferece medições por quantidades ou por eventos integrais, rascunho/aprovação/cancelamento, pagamentos parciais e liquidação por compensação sem desembolso. O aceite de eventos é explícito; avanço físico ou percentual vindo de planilha não libera pagamento. Aditivos reúnem acréscimos, supressões e serviços novos no mesmo termo; o eventograma global é versionado, preservando eventos já medidos. Linhas de serviços novos conservam sua memória original após alterações posteriores.

Reajustes por índice único ou cesta e reequilíbrios têm vigência e referência formal. Depois de reequilíbrio, a nova âncora deve ser selecionada expressamente. Efeitos retroativos geram boletins de diferenças vinculados aos originais, sem repetir quantitativos nem reescrever pagamentos. Diferenças negativas admitem registro de recuperação.

Compensação total requerida, reservas aprovadas, retenções efetivadas e restituições permanecem separadas. Aditivos subsequentes reavaliam reservas e saldo futuro; insuficiência pode gerar pendência formal de conciliação. O usuário pode registrar realocação de deduções ou recuperação comprovada. O sistema registra os fatos financeiros; não realiza transferências bancárias.

Limites de acréscimos e supressões são apurados separadamente, com configuração de 25%/50%, enquadramento de reforma e exceção fundamentada. Contratos globais com preços atualizados exigem memória formal dos valores utilizados nos limites. Esses controles não substituem a análise jurídica. O resumo distingue escopo na data-base de valorização na última referência de preços. Planejamento confronta previsto, executado informado, medido e pago com base declarada, sem inventar progresso ausente.

### Importação e documentos privados

XLSX e PDF textual tabular passam por upload, seleção de aba/cabeçalho, mapeamento, resolução de pendências e confirmação do hash. Paradigma pode ser preenchido por linha; exclusões exigem justificativa. Códigos repetidos permanecem itens distintos pela linha/aba. Relatório de composições unitárias não é orçamento contratual: o importador informa `supported:false` e permite utilizá-lo como documento privado. PDF escaneado exige OCR externo.

Importar medição é um fluxo separado dentro de contrato existente, disponível a gestor/fiscal. Usa quantidade do período e correspondência explícita em casos ambíguos; preço vem do contrato na data de execução. A confirmação cria somente rascunho, anexa o arquivo e registra o recibo atomicamente. Históricos devem ser importados em sequência; um boletim isolado não cria medições anteriores. Em preço global, quantidade positiva seleciona evento integral. Boletins são exportáveis em XLSX/PDF.

Anexos ficam em armazenamento privado sob `GESTAO_STORAGE_ROOT`, com download autorizado por tenant/contrato. Banco conserva metadados e contabilização; arquivos são deduplicados por hash no escopo privado. A quota é verificada sob bloqueio transacional. Prévia expira para uso em 24 horas; isso não apaga automaticamente documentos nem libera espaço contabilizado. Retenção e manutenção continuam explícitas.

### Stripe exclusivamente TEST

Foi configurado um produto/preço fictício de **R$ 1,00 por mês**, exclusivamente no ambiente Stripe de teste. Não é plano comercial, preço anunciado ou cobrança real. Checkout, portal e webhook pertencem à Gestão Contratual; contas e eventos ficam em `GcBillingAccount` e `GcBillingEvent` no banco próprio.

A configuração exige modo `test`, chave de teste, preço específico e segredo próprio do webhook. Chaves de produção e eventos `livemode` são recusados. Webhooks têm assinatura validada, idempotência e vínculo verificado com conta/produto; retorno visual do Checkout não concede licença. Situação, período e bloqueios da assinatura governam o acesso. O administrador cadastrado permanece isento, e membros compartilhados dependem da licença do proprietário de cada contrato.

### Estado de validação desta revisão

Migrations `001_contract_management.sql`, `002_contract_operations.sql` e `003_contract_billing.sql` compõem o banco independente; checksums conferidos antes da ativação v2. Não houve DDL de startup nem migração nos bancos dos orçamentadores.

Validação local do frontend: TypeScript e ESLint aprovados; 21 testes de login/configuração e fluxos contratuais aprovados. Cobrem inclusive seleção do programa por host, acesso sem licença ao painel de teste, criação bloqueada para membro sem licença própria, prévia concorrente, paradigma faltante, importação de medição, diferenças compensatórias e liquidação sem desembolso. Não equivalem a conferência visual no navegador nem a teste remoto de cobrança.

API e páginas publicadas em `gestaodepredios.com.br`, com opção Gestão Contratual no seletor de programas. Login próprio verificado por HTTPS, inclusive com origem `www`; acesso anônimo recusado. Páginas e seus arquivos JavaScript responderam HTTP 200. Testes de interface executados em DOM simulado; conferência visual no navegador não realizada nesta rodada, pois o controle do navegador foi interrompido por não conseguir verificar sua URL.

O contrato global do edifício recebeu 16 movimentos fictícios e chegou à versão 20: dois aditivos com revisão do eventograma, quatro regras de preço, medição reajustada, boletim de diferenças retroativas, reequilíbrio com nova âncora, pagamentos parciais e execução informada. Reexecução não criou movimentos. Memória do serviço incluído no primeiro aditivo permaneceu intacta após supressão posterior. O demonstrativo unitário chegou à versão 12 com uma medição importada em rascunho: preço externo ignorado em favor do preço contratual, confirmação idempotente, arquivo original conferido por hash e exportações XLSX/PDF verificadas. Nenhum movimento representa pagamento ou ateste real da obra.

Stripe TEST: Checkout e portal criados; assinatura com cartão fictício ativada por webhook assinado; reenvio duplicado preservou um único recibo; cancelamento fictício confirmado por webhook. Assinaturas de validação foram canceladas e o Checkout aberto de teste expirado. Administrador mantém isenção. Nenhuma cobrança real ou configuração de produção alterada.

Captura Infra corrigiu exclusivamente a exportação do total calculado (`row.total`) e passou a recusar custos ausentes. Testes com base SICRO conferiram quantidades, preços, total e imutabilidade. As três fontes Infra existentes da conta ainda têm serviço 6106330 com quantidade zero; sua captura continua bloqueada até revisão pelo usuário, sem alterar esses orçamentos.

Auditoria final de 14/11/2026 confirmou versões e hashes inalterados em **todos os 14 projetos OrçaPro e quatro projetos Infra**. Banco próprio: **753.664 bytes (0,71875 MiB)** de dados e índices, 12 tabelas, dois contratos, uma fotografia compartilhada, 30 ações e seis recibos Stripe. Arquivos privados: 8.932 bytes, fora da raiz pública, diretório com permissão 0700. A cota física do provedor pode contabilizar overhead adicional.

Backups privados de banco contratual, configuração, runtime e páginas anteriores preservados. Evidências locais em `C:\Orçapro\.runtime\gestao-dev-20261114-v2`: `final-audit.json`, `stripe-smoke.json`, relatórios `live-smoke*.json`, manifesto de hashes e pacote de implantação. Resta homologação visual e operacional pelo usuário; PDFs escaneados exigem OCR externo e relatórios apenas de composições não são convertidos automaticamente em orçamento contratual.

## Revisão V3 — planilhas analíticas e conferência visual em desenvolvimento

Em 14/11/2026, a interface foi revista com a identidade OrçaPro: Barlow/Barlow Semi Condensed, logo compartilhado, fundo cinza, cabeçalhos e abas compactos, planilhas com etapas, busca e rolagem própria. O quarto cartão permanece visível em `/programas/` no desenvolvimento mesmo quando a consulta de disponibilidade falha; a produção continua excluída por host. A troca de contrato bloqueia o editor enquanto a resposta chega e ignora respostas antigas. O descarte de edição usa diálogo HTML acessível.

Medições apresentam toda a planilha contratada na versão do boletim, com anterior, período, acumulado e saldo. Aditivos apresentam original, situação anterior, acréscimos, supressões, novos serviços e resultado do termo. Reajustes trabalham com seleção de vários itens, índice único, cesta, reequilíbrio e âncora formal. A conferência ocorre no servidor sem gravar; ID, versão e hash vinculam a confirmação à prévia, invalidada ao editar. Lotes são atômicos. Valores monetários da interface respeitam o arredondamento por linha e os totais calculados pelo servidor.

A migration aditiva `004_contract_scenarios.sql` acrescenta `scenario_key` e amplia o índice único, preservando os contratos LEGACY. Os dois novos exemplos `BUILDING_ANALYTICAL_V3` reutilizam a única fotografia comprimida da versão 21 do edifício de quatro pavimentos, sem duplicar catálogo ou modificar a origem. A proposta heterogênea demonstrativa totaliza R$ 2.798.010,22, frente ao paradigma de R$ 3.136.249,59. Índices, atos, execução e pagamentos dos exemplos são fictícios e identificados como demonstração.

O exemplo unitário parte de 283 serviços e chega a 288 com cinco novos. Três aditivos alteram 52, 55 e 82 linhas. BM01/BM02/BM03-R/BM04/BM05 medem 121/215/169/118/164 serviços; há cancelamento de rascunho, boletim de diferenças com 24 itens, pagamentos parciais e BM06 em rascunho com 87 itens. O índice atinge 288 itens, o reequilíbrio 24 e a cesta 209. A compensação requerida evolui de R$ 19.196,21 para R$ 29.393,42 e depois zero; R$ 16.511,37 efetivamente retidos são restituídos. A reexecução das ações com a fonte real reproduziu integralmente os valores publicados.

O exemplo global preserva 86 nós/70 folhas do eventograma. Seus aditivos têm 52/55 serviços e revisam 38/46 eventos. Três boletins aprovados medem 25/26/17 eventos, além de um rascunho de recebimentos. Índice e cesta abrangem 45/19 eventos remanescentes. A distribuição inicial registra o ajuste de R$ 0,05 entre eventos e orçamento da origem e a alocação proporcional de centavos, sem reescrever a fotografia. Não há conversão automática de aceite de evento em quantidade de serviço.

A conferência cadastral dos 283 itens encontrou nove insumos diretos sem descrição/unidade no catálogo privado. A ação `metadata-enrichment`, resolvida e revalidada pelo servidor na referência SINAPI capturada, corrige somente esses rótulos, conserva antes/depois e proveniência e mantém integralmente preços, quantidades, boletins, aditivos e pagamentos. Planilhas históricas exibem a anotação cadastral sem reescrever sua memória financeira. O XLSX registra os nove casos em aba própria.

Os boletins XLSX/PDF incluem a planilha completa. O PDF usa A3 paisagem, paginação e cabeçalhos repetidos; a conferência visual identificou e corrigiu corte do bloco de evidências. O XLSX mantém abas anteriores e acrescenta planilha integral e conferência cadastral. Capturas e evidências desta revisão ficam em `C:\Orçapro\.runtime\gestao-dev-20261114-v3`.

A auditoria após os exemplos e o enriquecimento confirmou os hashes e versões dos 14 projetos OrçaPro e quatro Infra, os 32 registros anteriores de contratos/ações e a configuração da API inalterados. O banco exclusivo tem quatro contratos, uma fotografia, 82 ações e 2.293.760 bytes (2,1875 MiB) estimados de dados e índices. Arquivos privados permanecem em 8.932 bytes. O overhead físico contabilizado pelo provedor não integra essa estimativa. Backups e runtimes anteriores foram preservados; nenhuma operação desta revisão atingiu produção.

### Fechamento da conferência V3

Runtime final de desenvolvimento: `gestao-contract-v3qb-20261114`. Os 169 arquivos do manifesto foram conferidos por SHA-256. API e frontend compilaram; TypeScript/lint e testes das regras, isolamento, projeções históricas e telas passaram. A regressão final do eventograma confere os 86 nós/16 pais do BG02 real: soma dos subtotais das raízes e dos eventos diretamente medidos igual a R$ 868.864,92, sem regravar o ledger nem ratear ficticiamente eventos pagos pelo pai.

A conferência no navegador integrado validou os quatro cartões de programas, identidade visual, BM02 com 285 linhas históricas e filtro de 215 serviços medidos, TA03 com 82 linhas alteradas, restituição de R$ 16.511,37, eventograma BG02 com 86 linhas e 26 eventos folha medidos, planejamento e seleção em lote de 288 itens. A prévia de reajuste recusou âncoras ausentes; após selecioná-las, calculou e perdeu validade ao editar o índice. A simulação foi descartada sem gravação. Também foram conferidos carregamento protegido na troca de contrato, diálogo de descarte, descrição/unidade histórica do insumo 10775, totais em centavos e ausência de erros de console. Tela estreita manteve rolagem dentro das tabelas, sem transbordamento da página. Capturas: `programas-v3.jpg`, `medicao-final.jpg`, `eventograma-final.jpg` e `medicao-mobile.jpg` no diretório privado local de evidências.

### Conferência de planilhas — 14/11/2026

A projeção de `worksheet` conserva o arredondamento agregado do histórico contratual. O resumo acrescenta `lineSumBaseValue`, `baseRoundingAdjustment`, `lineSumPricedValue` e `priceRoundingAdjustment`: a soma das linhas exibidas mais a conciliação é igual ao total contratual. Não há alteração de ações, boletins ou pagamentos. A tela de aditivos explicita também a conciliação entre total anterior, acréscimos, supressões e total posterior. Reajustes globais usam a hierarquia e os identificadores reais do eventograma para filtro e seleção; totais integrais são diferenciados de subtotais filtrados.

A auditoria independente dos dois exemplos do edifício conferiu 12 boletins, cinco aditivos, índices/cestas e manutenção do desconto em 9.250 comparações decimais; a reexecução confirmou os resumos financeiros e todas as linhas históricas das medições inalterados. Evidências locais: `.runtime/gestao-audit-20261114`. Publicação restrita ao desenvolvimento, sem migração nem gravação nos contratos; rollback pelo runtime e arquivos estáticos anteriores.

A conferência visual adicional corrigiu o carregamento inicial do editor: ele consulta a planilha vigente mesmo antes da seleção de data; sem itens selecionados, o total antes/depois é idêntico. Trocas de data invalidam dados anteriores durante o carregamento. Validação final: 22 testes de interface, 102 testes do módulo (incluindo nova regressão de arredondamento), builds API/web; 88 arquivos da primeira publicação e 85 arquivos estáticos da correção final conferidos. A extração após publicação confirmou igualdade integral de baseline, ações e detalhes financeiros, e correspondência de todas as planilhas com o resultado validado localmente.


### Revisão de exportações — 14/11/2026, somente desenvolvimento

Exportadores privados de aditivos e preços adicionados; boletins usam o mesmo renderizador tabular. XLSX mantém tipos numéricos, formatos, filtros, cabeçalho congelado e memória histórica. PDF A3 paisagem preserva precisão e evita quebra de dígitos, repete cabeçalho e paginação. Aditivos apresentam movimentos e conciliação do total agregado; contratos globais incluem eventograma com pais identificados como subtotais. Preços respeitam a data de corte. Arquivos são gerados em memória, sem blobs no banco.

Validação: 52 arquivos dos exemplos reais de desenvolvimento (12 medições, 5 aditivos, 9 datas de valorização, em dois formatos), com conferência numérica das linhas/totais, estrutura OOXML sem partes duplicadas, leitura dos PDFs e revisão visual de páginas representativas dos seis tipos de relatório. Doze downloads pela interface (três módulos, dois regimes, dois formatos) comparados com os relatórios locais. Os snapshots completos dos dois contratos antes/depois permanecem idênticos.

Testes: 106 testes da API de gestão e 23 de interface aprovados; build de API/web e lint da API e dos dois componentes alterados aprovados. O lint geral da web permanece reprovado por ocorrências fora destes arquivos, incluindo assets gerados e regras React em outros componentes.

Publicação limitada à API `api.gestaodepredios.com.br` e página `/gestao-contratual` de `gestaodepredios.com.br`; 94 arquivos conferidos por hash. Release `gestao-contract-exports-20261114`; runtime anterior `gestao-contract-audit-20261114` preservado e páginas anteriores guardadas na pasta privada `gestao-exports-20261114/previous-web`. Sem migration, alteração de configuração, escrita em contratos ou intervenção na produção. Rollback: restaurar ponteiro do runtime anterior, reiniciar apenas a API de desenvolvimento e restaurar as páginas guardadas; assets com hash podem permanecer.


### Importação Excel de medições — 14/11/2026, somente desenvolvimento

Incluída identificação explícita por número do item, mantendo código de composição como padrão e exigindo resolução de ambiguidades. O modo integra o hash da prévia. A prévia global agora usa a mesma validação pai/filho e de eventos já medidos do motor. Células com erro ou fórmula sem resultado em colunas mapeadas não são ignoradas. Vínculo indisponível permanece legível na interface. Cancelamento de rascunho passou a usar formulário com justificativa, substituindo window.prompt incompatível com o navegador integrado.

Teste real pela interface, usando os dois exemplos do edifício: XLSX unitário com 288 itens, 87 quantidades positivas e 201 zeros; vínculos pelo número do item, total R$ 11.297,30, ignorando preço artificial 999999 do arquivo. XLSX global com 86 eventos, 84 indicadores zero e eventos 30/31 selecionados; total R$ 300.226,50. Casos adversos de saldo excedido, código inexistente, quantidade negativa, evento medido e duplicado foram bloqueados. Testes automatizados adicionais cobrem 288 códigos repetidos resolvidos por numeração, sobreposição pai/filho, tenant estranho, fórmula sem cache e erros Excel.

Ambos os rascunhos QA-XLSX-U-1411 e QA-XLSX-G-1411 foram cancelados pela interface, sem aprovação ou pagamento. A conferência independente dos dados persistidos confirmou todos os IDs, quantidades, preços e valores, preservação integral dos lançamentos anteriores e igualdade dos itens, eventos, aditivos, regras de preço, pagamentos e resumos financeiros. Versões finais: unitário 37 e global 21. Somente duas ações novas por contrato (importar rascunho e cancelar), com arquivo de teste e auditoria preservados.

Build API/web, lint da API e dos três componentes alterados, 110 testes do módulo (antes do último caso Excel), suíte final de operações com 19 casos e 25 testes frontend aprovados. Release API gestao-contract-imports-20261114; backup anterior gestao-contract-exports-20261114. Página final e backup em gestao-imports-ui-20261114 (91 hashes conferidos). Rollback: restaurar runtime anterior e páginas guardadas; sem migration ou alteração de configuração. Produção não acessada nem alterada.


### Acompanhamento e auditoria financeira — 14/11/2026

O acompanhamento deriva dados da fotografia `GcSource.document_gz` já existente, sob autorização do contrato, sem duplicar catálogos ou gravar séries gráficas calculadas. Apontamentos por serviço são eventos `GcAction`, com a quantidade vigente congelada para preservar significado após aditivos. A curva original é preservada; ampliação de escopo não equivale a reprogramação automática. Datas reais são informadas pela fiscalização, nunca inferidas de medição/pagamento. Não houve mudança de schema.

Ensaios financeiros e apontamentos demonstrativos usam contratos `QA V3`, cópias identificadas dos exemplos com IDs próprios e referência à versão de origem. A implantação é restrita aos domínios de desenvolvimento. Rollback: ponteiro da API para versão anterior e restauração das páginas guardadas em pasta privada; nenhum arquivo de produção integra o pacote.


### Reprogramação após aditivos (14/11/2026, somente DEV)

Revisão independente e imutável por ato, vinculada ao aditivo vigente. Mantém original, revisões anteriores e dados físicos separados. Proposta assistida redistribui saldo conforme duração/equipes anteriores e calendário; responsável confere frentes/precedências e informa prazos de serviços novos. Aprovação exige prévia vinculada a versão/hash; não altera preços, eventos, medições ou orçadores. Curva original é conservada; curva da revisão congela execução no corte e distribui saldo em dias úteis. Escopo posterior invalida comparabilidade, mantendo o histórico consultável. Não há cópia de SINAPI/SICRO nem migration.

Validação usa novas cópias QA dos cenários unitário/global, com comparação dos hashes dos contratos/atos de origem. Publicação restrita a arquivos do módulo contratual e sua página no desenvolvimento, sobre o runtime anterior; configuração é preservada. Rollback: repor ponteiro/páginas privados da etapa gestao-reprogramming-20261114; manter atos e fontes no banco. Leitura das revisões exige runtime que conheça schedule-revision, portanto restaurar a versão anterior exige ocultar temporariamente apenas as novas cópias QA até reaplicar o código. Nunca apagar atos para rollback.

Validação publicada: cópia unitária QA Reprogramação com 288 serviços (267 concluídos, 18 remanescentes e três suprimidos), R1 até 26/11/2027; global com 286 serviços, R1 até 25/11/2027 e R2 após TA04 de prazo até 06/12/2027. Datas meramente demonstrativas. Originais, atos completos e fontes dos quatro exemplos preexistentes foram comparados por hash e preservados. Valores de medições, pagamentos e restituições não mudaram. Testados idempotência, conflito de versão, isolamento de tenant, seleção de revisão histórica, calendário e fechamento centesimal. A interface passou por gravação real da R1 na nova cópia unitária; corrigido o evento de edição dos campos de data.

Publicação final: web em gestao-reprogramming-final-20261114; API em gestao-reprogramming-cents-20261114 sobre o mesmo runtime, somente dois módulos de cálculo na última etapa. Arquivos privados de verificação e cópias em gestao-reprogramming-20261114. Produção, catálogos e configurações não alterados.


### Administração e suporte do produto — 14/11/2026

Adicionado painel Gestão do SaaS no menu vertical existente, reutilizando a linguagem visual OrçaPro. Paridade administrativa: cadastro/concessão, teste, perfis, suspensão/exclusão recuperável/restauração, senha e sessões compartilhadas, licenças, planos, sincronização/cancelamento programado/retomada Stripe de teste, auditoria filtrada/CSV, textos de privacidade/termos e informativo interno. Administração de catálogos SINAPI/SICRO permanece nos produtos de origem. Não foi criado envio de e-mails em massa.

Permissão SaaS não concede leitura de contratos de outros clientes. Banco próprio guarda só acesso, plano, configurações e auditoria compacta; identidades centrais são referenciadas. Cobrança continua exclusivamente TEST com o produto dedicado já configurado. Nenhum produto/preço LIVE é criado, nenhuma configuração de produção é alterada. O manual é um menu independente, com conteúdo versionado no aplicativo e simuladores sem gravação operacional.


Validação desta entrega: 164 testes da API e 31 testes de interface passaram; lint e builds da API/web concluídos. No DEV, 16 verificações de serviço e 17 verificações HTTP com duas contas sintéticas cobriram cadastro, isolamento, duplicidade, conflitos de versão, suspensão/restauração, licença, planos imutáveis, senha, revogação de JWTs/refresh, auditoria e CSV. Contas de QA foram excluídas logicamente do produto e o plano de QA foi desativado. Os oito contratos, 156 atos, fonte imutável, arquivos e cinco identidades/vínculos preexistentes conservaram seus hashes. O navegador confirmou menu, formulários, consulta de auditoria sem datas e com período, download CSV, busca do manual, exercícios, progresso persistente e simuladores. Corrigido envio de datas vazias pela interface.

Publicação restrita a `gestaodepredios.com.br/gestao-contratual/`, seus assets e aos módulos da API em `api.gestaodepredios.com.br`; 115 arquivos conferidos por SHA-256. Backup privado de configuração, schema/dados e arquivos anteriores em `gestao-saas-manual-20261114` no servidor DEV. Credenciais reais e históricos operacionais preservados; nenhuma mudança em produção.

### Fluxo de novo usuário — 14/11/2026, somente desenvolvimento

Testadas duas contas fictícias, cadastradas pelo painel/API SaaS em organizações separadas. Checkout hospedado Stripe TEST exercitado no navegador com cartão de recusa e cartão de aprovação; a ativação veio de entregas assinadas reais de `customer.subscription.created`, `invoice.paid` e `checkout.session.completed`. Duplo clique reutilizou Checkout aberto. Portal próprio, agendamento de cancelamento, retomada e cancelamento definitivo da assinatura fictícia foram conferidos. Não houve cobrança real nem modificação de conta LIVE.

Importado contrato sintético de 120 itens via prévia, mapeamento e confirmação XLSX, total R$ 10.800,00. Conferidos vínculos privados, isolamento entre organizações, bloqueio de administração, acesso após assinatura, bloqueio após cancelamento e manutenção da ajuda/conta. O login visual confirmou apenas o contrato da nova conta e ausência de menu administrativo. O cadastro é administrativo; esta verificação não equivale a cadastro público autônomo.

Corrigida a ausência de Minha conta no menu do produto, preservando a linguagem visual e o acesso independente de licença contratual. A troca usa a operação compartilhada existente, pede senha atual e confirmação, encerra sessões e permite voltar ao login da Gestão Contratual. O próprio usuário agora tem sua troca registrada na auditoria do produto, vinculada ao tenant autenticado, sem capturar senhas. A troca compartilhada também consome links antigos de recuperação atomicamente e recusa mais de 72 bytes UTF-8. O manual explica esse percurso.

Validação: 177 testes de API em 19 suítes, 33 testes de interface, TypeScript, lint dos componentes modificados e builds API/web aprovados. No DEV publicado, 43 verificações confirmaram cadastro, cobrança, contrato, senha, JWT/refresh, inutilização de link de recuperação antigo, auditoria sem credenciais, cancelamento e preservação de dados. A API possui política de sessão única: novo login visual invalida a sessão anterior do roteiro; o teste passou a autenticar novamente antes da etapa seguinte.

Release `gestao-user-flow-20261114`: 95 arquivos conferidos por SHA-256; configuração preservada, sem migration. Runtime anterior `gestao-saas-manual-20261114` e páginas anteriores preservados no diretório privado da tarefa. Rollback: restaurar esse runtime anterior (já compatível com licenças SaaS) e páginas guardadas; reiniciar somente API DEV. Contas e contrato sintéticos arquivados de forma recuperável, sessões revogadas e assinatura TEST cancelada. Senhas/cookies fictícios removidos dos registros de trabalho. Os oito contratos, atos, fontes, arquivos e sete identidades/vínculos preexistentes conservaram seus hashes. Produção não acessada nem alterada.


### Validação do cadastro autônomo e Infra — 14/11/2026

Cadastro autônomo publicado exclusivamente no desenvolvimento, com Checkout Stripe TEST, organização isolada e auditoria. Teste pela interface criou conta fictícia, ativou assinatura pelo webhook e importou primeiro contrato com 285 itens e R$ 2.969.200,25. Importador passou a preservar descrições até 10.000 caracteres (central de GLP excedia o limite anterior).

Integração com o orçamento existente “Exemplo de rodovia — SICRO” v23: 64 serviços positivos, R$ 35.249.373,14; linha 9.4 de quantidade/total zero preservada somente na fotografia original, com aviso. Descrições, unidades e curva S capturadas. Identificadores e timestamps do projeto temporário do calculador não podem invalidar a conferência da origem. Falta de eventograma é informada como ausência, mantendo bloqueio de preço global sem eventos conciliados.

Validação automatizada: 76 suítes/498 testes aprovados antes do ajuste final do hash; 13 testes de captura e isolamento aprovados após o ajuste, incluindo regressão de hash estável e rejeição de código divergente. Builds API/web concluídos. Rollback: runtime anterior preservado em `gestao-selfsignup-20261114`; release anterior a esta tarefa em `gestao-sharing-20261114`. Configuração privada e páginas anteriores preservadas no staging DEV. Sem migration, exclusão de histórico ou alteração da produção.


Resultado final pela interface: contrato `QA Integração Infra — Exemplo de rodovia SICRO` criado (64 itens, R$ 35.249.373,14), curva S e Gantt carregados, término original 07/07/2027. Conferência por hash do projeto original antes/depois confirmou igualdade integral e versão 23. Exemplo usa paradigma didático igual à planilha; não representa contrato real. Conta de cadastro e assinatura continuam exclusivamente em TEST, para revisão do fluxo.
