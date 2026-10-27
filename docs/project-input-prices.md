# Preço de um insumo em todo o orçamento

Validado no desenvolvimento em `www.gestaodepredios.com.br` e autorizado em 27/10/2026 para produção em `sistema.orcaproobras.com.br` (SINAPI) e `orcaproinfra.com.br` (SICRO). A promoção comercial preserva as configurações e bancos independentes de cada produto; não copia bancos do desenvolvimento, não executa seed e não modifica documentos de projetos existentes. Os novos campos são gravados somente quando o usuário confirma uma substituição no seu orçamento.

## Uso

1. Abra o orçamento e entre em **Insumos**.
2. Procure o código e clique **Preço no orçamento**. Mesmo que a consulta SICRO esteja em outra UF, a edição informa e usa a referência real do orçamento.
3. Informe preço final do regime do orçamento, data e fonte/justificativa. Equipamentos SICRO pedem CHP e CHI separadamente. Zero é permitido; campo vazio não é zero.
4. Clique **Conferir serviços afetados**. A prévia lista item, código, descrição, quantidade, custo unitário anterior/novo e variação direta, inclusive em auxiliares; compara também o custo direto e o total com BDI do orçamento.
5. Confira os custos fixos preservados, marque a autorização e clique **Aplicar ao orçamento**. Cancelar não modifica o projeto. Se o projeto mudar depois da prévia, é necessário gerar outra.
6. Aguarde a confirmação de gravação na nuvem. Os conflitos entre abas conservam o mecanismo 409/rascunho já existente.
7. Em **Preços deste orçamento**, revise substituições ativas e fora do contexto. **Revisar / restaurar** oferece uma prévia da retirada da substituição.

## Escopo e cálculo

- Chave: código + UF + referência mensal + regime. Não se aplica a outra UF/mês/regime silenciosamente. O código referencial permanece o mesmo; não é necessário criar uma cópia IP para substituir o preço em todas as ocorrências.
- Todas as ocorrências analíticas do projeto usam o novo preço, inclusive auxiliares em múltiplos níveis, itens diretos e composições próprias analíticas. Novas inclusões na mesma combinação usam a substituição já confirmada.
- Custos unitários fixos (`custo`) e composições com preço fechado mantêm seu valor. A prévia identifica ocorrências analíticas dentro de itens fixos; terminais com preço fechado não possuem consumo analítico recalculável.
- Mantém quantidades, coeficientes, produção, equipes, calendário, dependências e percentuais de BDI. Reutiliza truncamento SINAPI e r4/r2, DMT, FIT e FIC do SICRO. Curvas e valores financeiros acompanham os custos.
- No SICRO, equipamentos têm CHP/CHI distintos. A memória das parcelas do equipamento é rateada proporcionalmente ao CHP substituído, com fator próprio de CHI, e permanece estimada; não inventa uma nova composição oficial de aquisição/manutenção. Insumos materiais não alteram automaticamente custos horários agregados de equipamentos que não possuam vínculo analítico com aquele material.
- Invalida caches de custos, próprios, recursos e IVA. Créditos são estimados pelo motor fiscal com o preço do orçamento quando essa opção está selecionada; o modo fiscal explícito de preços de origem continua respeitado. Não desconta créditos automaticamente do preço.
- Fotografias de análises de risco já realizadas são preservadas; refaça a análise para considerar o custo alterado. O BDI percentual vigente não muda sozinho.
- Catálogo global, biblioteca privada e outros projetos/usuários não são alterados. A consulta SICRO permanece referencial, independente do orçamento.

## Persistência, auditoria e segurança

Campos JSON aditivos `inputPriceOverrides` e `inputPriceHistory` dentro do projeto existente, sem mudança de schema. Cada preço usa centavos inteiros não negativos, até R$1 bilhão; máximo 2.000 combinações. O backend valida código, UF, mês, regime, valor, fonte e data. Continua usando os endpoints de salvamento autenticados, CSRF, proprietário + tenant e versão esperada. Uma prévia local não concede autorização adicional.

O histórico contém contexto, preço anterior/novo e itens afetados. Salvamentos criam as versões já existentes e registram alteração na auditoria: `project.input-prices.update` no OrçaPro, e detalhes de preços no `project.save` do Infraestrutura. A informação fica no orçamento, não no cadastro global. Dados previamente salvos sem esses campos continuam válidos.

O mesmo módulo `apps/api/src/modules/orcapro/legacy/assets/project-input-prices.js` é carregado pelos motores de servidor e pelos dois editores. A UI comum está em `scripts/shared/project-input-prices-ui.js`. O cache derivado SICRO inclui a assinatura de preços; consultas de catálogo não usam substituições do orçamento.

## Verificação e rollback

Regressões cobrem ocorrência direta, auxiliar, item fixo, cadastro próprio, zero, valor inválido, restauração, contexto UF/mês/regime, concorrência entre prévia/confirmação, reabertura, IVA e equipamentos SICRO. A regressão do relatório SICRO original deve continuar 6.619/6.619. Os testes de autorização existentes verificam tenant/proprietário e conflitos do mesmo endpoint de gravação; nenhuma rota nova é aberta.

Rollback operacional: retornar ao artefato de aplicação anterior preservando os documentos/versões. Código anterior ignora a substituição; exporte o JSON e restaure o artefato novo antes de voltar a editar orçamentos com substituições para não apresentar valores oficiais como se fossem os ajustados. Não restaurar banco sobre dados atuais e não remover usuários ou projetos.
