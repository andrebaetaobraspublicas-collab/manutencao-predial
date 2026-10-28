# TransfereGov BM — somente desenvolvimento

Orçamento → **TransfereGov (BM)** abre o assistente nos dois editores. A exportação é uma cópia da versão salva por submeta do QCI. Não modifica orçamento, catálogo, cronograma, biblioteca ou histórico de versões. PLE não está implementado nesta etapa. Estes produtos de orçamento são independentes do agregado de manutenção/OS; nenhuma OS é criada pela exportação.

## Contrato e fontes

Orientações: https://mandatarias.transferegov.sistema.gov.br/projeto-basico/public/helpImport.html . Exemplos originais de 14/02/2025 preservados em `fixtures/transferegov/`, com hashes e proveniência. Perfis explícitos: documentação `PO-BM/CFF-BM`, códigos numéricos até 13 dígitos; exemplo oficial `BM/CFF-BM`, com códigos alfanuméricos admitidos no exemplo. A aceitação no importador permanece pendente de homologação. Não há envio automático nem acesso à conta gov.br.

PO tem 17 colunas, cabeçalho na linha1, macrosserviço/serviço. Serviços em várias frentes mesclam A:M verticalmente; cada frente ocupa N:Q. CFF tem quatro colunas, identificação A:B mesclada nas parcelas do macrosserviço. Códigos e numerações hierárquicas permanecem texto; custos/quantidades numéricos, BDI fração com formato percentual e parcelas texto pt-BR conforme o exemplo. São valores literais: sem macros, fórmulas, links externos, títulos extras ou abas próprias no arquivo oficial. Textos com aparência de fórmula permanecem strings XML. O relatório de conferência e a configuração são arquivos JSON separados.

## Metodologia

O adaptador utiliza o modelo já calculado e salvo, sem chamar o recálculo mutável dos motores. Sem modelo em cache ou com edição/conflito/gravação pendente, a exportação é recusada. Itens identificados como SINAPI mantêm código, descrição, unidade e custo referencial originais. Custo adotado é separado, incluindo substituições de insumos. Referência ausente utiliza o custo adotado válido na cópia como composição adaptada, com aviso e rastreabilidade; ausência de preço não é convertida em zero. Códigos incompatíveis recebem mapeamento numérico automático, rastreado no relatório.

A compatibilidade usa BigInt/racionais: custo adotado em centavos; BDI truncado em pontos-base; preço unitário = truncar(custo × (1 + BDI)); valor da frente = truncar(quantidade de duas casas × preço unitário); total do serviço = soma das frentes. Macrosserviços somam serviços. Custos, preços e totais até R$9.999.999.999,99; quantidade por frente até 99.999.999,99; BDI de 0 a 100%; até 999 serviços por macro. Diferenças com a origem aparecem e exigem conferência. Não há compensação artificial, desconto de IVA nem risco acrescentado novamente. O arredondamento efetivo no destino ainda deve ser homologado: texto e exemplo oficial não são inteiramente consistentes.

CFF sugerido: valores distribuídos pelos dias úteis em cada mês civil do cronograma existente; percentuais em pontos-base por maiores restos, desempate pelo primeiro período. A sugestão fecha em 100,00% por macro; distribuição positiva abaixo de 100,00% gera aviso, enquanto soma acima de 100,00% ou vazia impede gerar. O usuário revisa a distribuição sem alterar a obra. Duração de 1 a 999 meses numerados a partir do primeiro mês mostrado. Limites: 10.000 serviços; configuração até 2 MB vinculada ao mesmo projeto e conjunto de serviços.

## Segurança e auditoria

UI apenas em hosts de desenvolvimento/loopback. `POST /orcapro/projects/:id/transferegov/bm/receipt` e `/infraestrutura/projects/:id/transferegov/bm/receipt` recusam WEB_BASE_URL fora da lista exata antes de consultar dados. Guards e CSRF existentes mantidos; proprietário/tenant vêm da sessão. expectedVersion e SHA-256 canônico dos dados salvos devem coincidir; divergência retorna409.

O evento `export.transferegov.bm` registra PREPARED, versão/hash de origem, hash do XLSX e da configuração, perfil, submeta, contagens e totais declarados pelo exportador. Não recebe nem armazena documento integral. O servidor confirma vínculo e versão da origem; não certifica independentemente os cálculos do cliente nem comprova download/importação/aprovação. A geração não cria versão de projeto. Configurações são baixadas/carregadas separadamente, sem gravação automática em storage local ou JSON do orçamento. Sem migration/seed.

## Verificação e publicação

Testes: XLSX reaberto (cabeçalhos, tipos, zeros iniciais, fórmulas ausentes, mesclagens e perfis), precisão, limites, mapeamento, dono/tenant, versão e bloqueio em produção. Regressões dos motores originais permanecem obrigatórias. Publicar apenas em www.gestaodepredios.com.br/api.gestaodepredios.com.br após backup e comparação dos registros. Não acionar workflows ou branches das produções. Rollback por artefatos anteriores sem restaurar banco antigo sobre dados atuais. Homologação em treinamento fica pendente sem acesso autorizado a uma submeta de teste.

## Ajustes da cópia — 28/10/2026

Nome do orçamento sugerido como submeta (até 100 caracteres). Códigos inválidos ou ausentes recebem a sequência 9990000000000… de 13 dígitos, preservada como texto, sem colisão com códigos reservados e com reaproveitamento para repetições da mesma origem. Apenas a configuração/cópia é normalizada; relatório relaciona código original/exportado.

Todas as entradas financeiras da cópia e seus produtos usam truncamento decimal com BigInt; resíduos de Number menores que um milionésimo da unidade de saída, imediatamente abaixo de um inteiro, são normalizados para não perder um centavo artificialmente. A comparação mostra o total original, sem modificá-lo. Diferenças ficam em ajustes detalhados e avisos agregados, sem bloquear. O destino ignora campos calculados e usa arredondamento próprio: truncar no XLSX não garante igualdade após a importação.

Referência vazia com custo adotado válido utiliza esse custo na cópia e fonte Composição, com rastreabilidade, sem simular referência SINAPI oficial. Preço adotado ausente/negativo permanece erro explícito. Parcelas positivas cuja soma seja inferior a 100% geram aviso; acima de 100% ou sem distribuição válida continuam impeditivas. Sem alteração de schema, API, dados ou ambientes de produção.

Grafias equivalentes tkm/TXKM e dm³/DM3 são normalizadas sem conversão dimensional. Descrições acima de 500 caracteres são abreviadas somente na cópia; texto integral, fonte e unidade originais constam do relatório. Itens SINAPI cuja descrição seja adaptada são exportados como Composição, evitando falsa identificação com a tupla oficial. Totais com pendência estrutural são parciais e não apresentados como diferença final de truncamento.
