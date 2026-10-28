# TransfereGov PLE — somente desenvolvimento

Orçamento → **TransfereGov (PLE)** nos dois sistemas. Segue o modelo de acompanhamento por eventos: cada serviço pertence a um evento e distribui quantidades entre frentes. Cada par evento/frente recebe um mês inteiro de conclusão entre 1 e a duração da obra. Um evento pode reunir serviços de vários macrosserviços. Sem alteração do agregado OS de manutenção (ADR0007/0009).

## Fontes e contrato XLSX

Manual oficial: https://mandatarias.transferegov.sistema.gov.br/projeto-basico/public/helpImport.html . Exemplo oficial `fixtures/transferegov/official-ple-20250214.xlsx`, proveniência/hash em `sources.json`, reconferido em 28/10/2026. O perfil documentação usa `PO-PLE/CFF-PLE` e grafias Nível/Nº; o exemplo usa `PO-PLE/CFF - PLE` e Nivel/N°. A divergência é exposta no seletor; aceitação no importador ainda exige homologação.

PO: 19 colunas A:S; A:M coincidem com BM, N:O identificam evento, P:S frente/quantidade/valor. Serviços em várias frentes mesclam A:O verticalmente. CFF: cinco colunas, número/título do evento, número/nome da frente, período de conclusão. A:B são mescladas nas linhas do mesmo evento. Duas abas, cabeçalhos na linha 1, valores literais, códigos textuais preservando zeros, BDI fracionário percentual; sem fórmulas, macros, links ou abas extras. Não se exportam linhas artificiais de compensação ou saldo de QCI presumido.

## Fluxo e sugestões

O assistente reutiliza a fotografia calculada e salva, os adaptadores de unidades/códigos e a aritmética BigInt da cópia BM. Sugere nome do orçamento como submeta, um evento por etapa principal e as quantidades em uma frente inicial. É possível editar numeração/títulos, adicionar eventos/frentes, selecionar serviços e reatribuir cada serviço. Eventos em uso não podem ser removidos antes da reatribuição. Números de eventos únicos entre 1 e 999; títulos até 100 caracteres; até 10.000 serviços e 100.000 conclusões.

O mês sugerido para cada par evento/frente é o último mês de execução de seus serviços no cronograma existente. Todas as frentes partem daquele cronograma porque a origem não contém um planejamento independente por frente; o usuário revisa os meses explicitamente. Ao navegar, pares novos recebem sugestão e pares existentes conservam meses revisados. Refazer sugestão substitui os meses da cópia. Não há percentuais BM no CFF-PLE. Desvincular serviços elimina somente pares não mais usados da configuração da cópia.

O Eventograma original pode conter subeventos, múltiplas atribuições, custos diluídos, multas ou retenções. Esses conceitos não são convertidos automaticamente no vínculo único exigido pelo PLE; ficam intactos. Não há recálculo ou gravação de documento, EAP, preço, equipes, risco, IVA, cronograma ou versões. Configuração e relatório JSON são baixados separadamente; importação de configuração valida projeto, conjunto de serviços e modalidade. BM e PLE não se misturam.

Custos, BDI, quantidades e produtos da cópia truncam duas casas; ausência de referência com custo adotado gera composição adaptada rastreada. Códigos incompatíveis recebem números desde 9990000000000 sem colisão. Diferenças financeiras não bloqueiam. O TransfereGov ignora campos derivados e recalcula com sua regra de arredondamento; não se garante igualdade do total importado.

## Auditoria, autorização e operação

`POST /orcapro/projects/:id/transferegov/ple/receipt` e `/infraestrutura/projects/:id/transferegov/ple/receipt` usam guards/CSRF/proprietário/tenant do produto. Configuração WEB_BASE_URL fora dos hosts DEV autorizados retorna404 antes de leitura de projeto. DTO herda metadados BM e acrescenta `events` (1…999) e `completions` (1…100000). Versão e SHA-256 canônico de origem devem coincidir; conflito409 impede baixar arquivo obsoleto. A identidade não é recebida do corpo.

Evento `export.transferegov.ple` acrescenta apenas auditoria PREPARED com versão/hash da origem, hash do XLSX/configuração, perfil, submeta, contagens declaradas e totais. Não armazena o documento integral nem certifica cálculos do cliente ou importação/aprovação. Nenhum schema, migration ou seed novo. O navegador gera o XLSX depois da revisão e registra o recibo antes do download.

Testes: contrato do exemplo, roundtrip XLSX, mesclagens, literais seguros, múltiplas frentes/eventos/macros, períodos inválidos/duplicados, identidade de configuração, CSRF, isolamento de owner/tenant, conflito e bloqueio em produção. Regressões BM e dos motores permanecem obrigatórias. Publicar exclusivamente DEV após backup privado e comparação de hashes/contagens. Rollback por artefato anterior; nunca restaurar banco antigo sobre registros atuais. Importação gov.br não é automática e permanece pendente de homologação autorizada.
