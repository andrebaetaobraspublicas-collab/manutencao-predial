# v0.13.0 — Gestão contratual por desempenho

## Resultado funcional

O módulo transforma KPIs e SLAs em configuração contratual utilizável. A biblioteca
`PERFORMANCE_BR_2026.1` contém indicadores agrupados por SLA, manutenção preventiva e corretiva,
disponibilidade, qualidade, segurança, satisfação, financeiro, sustentabilidade, documentação,
preditiva e sistemas. Cada item apresenta memória de cálculo, exemplo, objetivo, fonte, meta,
faixa, periodicidade, peso sugerido e critérios financeiros.

O gestor pode criar indicadores ilimitados, selecionar os aplicáveis ao contrato, definir pesos,
metas, faixas, tetos e o papel na medição. O motor calcula os indicadores com fontes já existentes,
normaliza escores, calcula o IGD e cria alertas. Quando uma medição mensal em rascunho é criada,
glosas e bonificações previstas são calculadas automaticamente e vinculadas ao KPI que as originou.

## Fontes automáticas atuais

- tempos e SLA das ordens de serviço;
- backlog, pendências, corretivas e reaberturas;
- planos preventivos e OS recorrentes;
- evidências fotográficas, laudos, checklists e aceite;
- satisfação e NPS;
- custos finais, orçamento, área construída e execução contratual.

Disponibilidade, sensores, segurança, consumo, resíduos e indicadores próprios são calculados a
partir de `KpiDataPoint`. Isso permite integração posterior com IoT, planilhas ou APIs sem usar
`eval` nem permitir fórmulas executáveis arbitrárias. Um período sem fonte não gera medição nem
glosa; o sistema não converte ausência de dados em zero.

## Controles

- todas as consultas e mutações recebem `tenantId` exclusivamente do token;
- cálculos usam chave idempotente com tenant, definição, versão, período e dimensões;
- valores financeiros usam `Decimal`, teto contratual e arredondamento explícito;
- definições do sistema são versionadas e não editáveis; personalização cria novo KPI;
- faixas retiradas de uso recebem desativação lógica;
- ajuste conserva valor medido, meta, faixa, fórmula, percentual, base e valor financeiro;
- alertas são deduplicados por contrato, KPI, competência e tipo.

## Dashboard

A interface apresenta velocímetro do IGD, cards, semáforos, série histórica, radar de categorias,
ranking de contratos/fornecedores/edificações, alertas, memória de cálculo e reflexos financeiros.
A tela de medições apresenta bruto, IGD, glosa de desempenho, bônus, deduções totais e líquido.

## Rollback

A migration é aditiva. Para voltar ao binário anterior, mantenha as novas tabelas e colunas; a
versão antiga as ignorará. Removê-las exige antes exportar medições, ajustes e memórias, desvincular
as chaves estrangeiras e recalcular `Measurement.deductions`/`netAmount` sem componentes de
desempenho. Não há rollback destrutivo automático em produção.
