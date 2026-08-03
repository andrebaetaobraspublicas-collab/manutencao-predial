# Catálogo inicial de KPIs e relatórios

## 1. Regras para indicadores

Todo KPI deve conter:

- código e nome;
- objetivo;
- fórmula;
- unidade;
- fonte dos campos;
- período;
- dimensões;
- direção desejada;
- meta e faixas;
- responsável;
- data de atualização;
- limitações e cobertura da amostra.

Indicadores de redução exigem linha de base comparável. O sistema não deve atribuir causalidade à manutenção sem método explícito.

## 2. Operação e backlog

| KPI | Fórmula resumida | Dimensões |
|---|---|---|
| Backlog total | contagem de OS em estados abertos | edifício, fornecedor, contrato, demandante |
| Aging médio | média de dias desde abertura das OS abertas | mesmas dimensões |
| Backlog >30 dias | OS abertas com idade >30 / backlog | mesmas dimensões |
| Tempo de primeira resposta | primeira ação qualificada − abertura | prioridade, categoria |
| Tempo de resolução | conclusão − abertura | prioridade, fornecedor |
| Tempo de fechamento | fechamento − abertura | contrato, fiscal |
| Taxa de pendência | OS com pendência / OS abertas | motivo, responsável |
| Tempo em pendência | soma de intervalos pendentes | motivo, fornecedor |
| Vazão de fechamento | OS fechadas no período | edifício, equipe |
| Razão entrada/saída | OS abertas / OS fechadas | período |

## 3. SLA e qualidade

| KPI | Fórmula |
|---|---|
| Cumprimento de resposta | OS respondidas no prazo / OS elegíveis |
| Cumprimento de resolução | OS resolvidas no prazo / OS elegíveis |
| SLA global | OS que cumprem todos os SLAs / OS elegíveis |
| Reabertura em 30 dias | OS reabertas em até 30 dias / OS fechadas |
| Reincidência | falhas equivalentes no ativo/local em janela / OS fechadas |
| First-time fix | OS resolvidas sem retorno, pendência ou reabertura / concluídas |
| Aceite sem ressalva | OS fechadas sem devolução / submetidas a aceite |

Relatórios devem informar exclusões, cancelamentos e dados ausentes.

## 4. Satisfação

| KPI | Método |
|---|---|
| CSAT | média ou percentual de notas 4–5 em escala 1–5 |
| NPS | % promotores (9–10) − % detratores (0–6) |
| CES | média da pergunta de esforço em escala definida |
| Taxa de resposta | avaliações recebidas / convites elegíveis |
| Satisfação por dimensão | fornecedor, edifício, categoria, prazo e período |

Nunca exibir NPS sem quantidade de respostas. Evitar comparação entre grupos muito pequenos.

## 5. Manutenção preventiva e confiabilidade

| KPI | Fórmula resumida |
|---|---|
| Cumprimento preventivo | tarefas preventivas realizadas no prazo / previstas |
| Preventiva/corretiva | OS preventivas / OS totais ou custo preventivo/corretivo |
| MTTR | tempo total de reparo / falhas reparadas |
| MTBF | tempo operacional / número de falhas |
| Disponibilidade | MTBF / (MTBF + MTTR) |
| Falha pós-preventiva | corretivas após preventiva dentro de janela / preventivas |
| Manutenção vencida | planos vencidos / planos ativos |
| Redução de corretivas | variação contra baseline ajustada por portfólio e período |
| Falhas por falta de manutenção | falhas classificadas e validadas como decorrentes de preventiva atrasada / falhas |

A classificação “por falta de manutenção” exige causa validada por responsável, não inferência automática isolada.

## 6. Contratos e fornecedores

| KPI | Fórmula resumida |
|---|---|
| Execução contratual | valor medido / valor contratual atual |
| Saldo não medido | valor atual − valor medido |
| Medido não pago | valor medido − valor pago |
| Cobertura de empenho | saldo de empenho / saldo contratual previsto |
| OS por R$ contratado | número de OS / valor atual |
| Custo por OS | custo final total / OS fechadas |
| SLA do fornecedor | OS do fornecedor no prazo / elegíveis |
| Índice de reincidência do fornecedor | reincidentes / OS fechadas |
| Penalidades | quantidade e valor por fornecedor/contrato |
| Prazo para medição | aprovação da OS → inclusão em medição |

## 7. Financeiros

- custo de manutenção por m²;
- custo por edifício, sistema, categoria e ativo;
- desvio orçamento × custo final;
- custo preventivo × corretivo;
- comprometimento anual;
- valor de glosas;
- prazo de pagamento;
- projeção de consumo do saldo;
- custo de falhas recorrentes.

## 8. Sustentabilidade

| KPI | Fórmula/observação |
|---|---|
| Intensidade energética | kWh / m² / período |
| Redução de energia | (baseline ajustada − consumo atual) / baseline ajustada |
| Energia evitada por intervenção | kWh estimados/medidos atribuídos à OS, com método |
| Intensidade hídrica | m³ / m² / período |
| Água evitada | baseline ajustada − consumo atual |
| Emissões evitadas | energia evitada × fator de emissão documentado |
| Resíduos desviados | massa reutilizada/reciclada / massa total |
| Compras sustentáveis | valor/itens com critério sustentável / total elegível |
| Vazamentos evitados | ocorrências e volume estimado, com metodologia |

Cada baseline deve registrar janela, normalização por ocupação/clima quando aplicável e qualidade da fonte.

## 9. Segurança e terceirização

- documentos trabalhistas entregues no prazo;
- conformidade de folha e benefícios;
- pendências administrativas abertas e idade;
- empregados com EPI válido;
- treinamentos e exames vigentes;
- acidentes/incidentes e quase acidentes;
- postos cobertos versus previstos;
- absenteísmo e substituições;
- glosas por não conformidade.

Acesso a dados individualizados deve ser restrito. Dashboards amplos devem privilegiar agregação.

## 10. Relatórios PDF/Excel prioritários

### MVP

1. OS individual com histórico e anexos listados;
2. backlog analítico com filtros;
3. OS abertas por fornecedor;
4. OS por edificação;
5. OS por demandante;
6. OS com pendência;
7. SLA vencido;
8. cadastro de fornecedores;
9. espelho contratual;
10. contratos a vencer;
11. execução financeira do contrato;
12. painel mensal de KPIs.

### v2

- plano preventivo e aderência;
- orçamento por OS;
- medição e memória de consolidação;
- empenhos e saldos;
- penalidades;
- desempenho de fornecedor;
- reajustes/repactuações;
- relatório de ativos.

### v3

- fiscalização administrativa mensal;
- segurança do trabalho;
- sustentabilidade e baselines;
- confiabilidade de ativos;
- relatório executivo de portfólio;
- caderno gerencial do contrato.

## 11. Requisitos de apresentação

Todo relatório deve conter:

- tenant e logotipo;
- título e período;
- data/hora e usuário gerador;
- filtros e critérios;
- paginação;
- totais conciliáveis;
- fonte e fórmula de indicadores;
- aviso quando houver cobertura incompleta;
- identificador verificável do relatório;
- versão do layout/motor.

## 12. Implementação da gestão por desempenho

A v0.13 materializa este catálogo na biblioteca `PERFORMANCE_BR_2026.1`. O contrato escolhe os
KPIs aplicáveis, pesos, metas, faixas e papel financeiro. O motor normaliza os resultados para
escores de 0 a 100, calcula `IGD = Σ(escore × peso) ÷ Σ(pesos)` e classifica Excelente, Bom,
Regular, Insatisfatório ou Crítico.

Faixas podem produzir glosa, bonificação ou apenas alerta. O reflexo na medição conserva o KPI,
valor medido, meta, faixa, fórmula, percentual, base, teto e valor financeiro. Ausência de fonte
não é zero: indicadores sem dados nativos permanecem sem medição até receberem ponto auditável.
