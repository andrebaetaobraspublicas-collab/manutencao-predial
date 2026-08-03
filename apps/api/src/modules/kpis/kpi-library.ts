import { KpiAggregation, KpiCategory, KpiDirection, KpiPeriodicity } from '../../generated/prisma/client';

export type KpiLibraryItem = {
  code: string;
  name: string;
  category: KpiCategory;
  unit: string;
  direction: KpiDirection;
  periodicity: KpiPeriodicity;
  aggregation: KpiAggregation;
  calculationMethod: string;
  description: string;
  formula: string;
  formulaExample: string;
  objective: string;
  dataSource: string;
  targetValue: number;
  warningValue: number;
  criticalValue: number;
  acceptableRange: string;
  defaultWeight: number;
  deductionCriteria: string;
  bonusCriteria: string;
  responsibleRole: string;
};

type CompactItem = readonly [
  code: string, name: string, unit?: string, direction?: KpiDirection,
  method?: string, target?: number, warning?: number, critical?: number,
];

const H = KpiDirection.HIGHER_IS_BETTER;
const L = KpiDirection.LOWER_IS_BETTER;
const T = KpiDirection.TARGET_RANGE;

const groups: Array<{ category: KpiCategory; source: string; items: CompactItem[] }> = [
  { category: KpiCategory.SLA, source: 'Ordens de Serviço e histórico de status', items: [
    ['AVG_RESPONSE_TIME', 'Tempo médio de atendimento', 'horas', L, 'WO_AVG_ASSIGNMENT_HOURS', 4, 6, 8],
    ['AVG_TRAVEL_TIME', 'Tempo médio de deslocamento', 'minutos', L, 'DATA_POINT_AVERAGE', 30, 45, 60],
    ['AVG_ARRIVAL_TIME', 'Tempo médio de chegada', 'minutos', L, 'DATA_POINT_AVERAGE', 45, 60, 90],
    ['MTTR_HOURS', 'Tempo médio de solução', 'horas', L, 'WO_AVG_RESOLUTION_HOURS', 24, 36, 48],
    ['AVG_CLOSURE_TIME', 'Tempo médio de fechamento', 'horas', L, 'WO_AVG_CLOSURE_HOURS', 48, 72, 96],
    ['SLA_COMPLIANCE', 'Cumprimento do SLA', '%', H, 'WO_SLA_COMPLIANCE', 95, 90, 85],
    ['SLA_EMERGENCY', 'SLA de emergência', '%', H, 'WO_SLA_BY_PRIORITY:CRITICAL', 98, 95, 90],
    ['SLA_URGENT', 'SLA urgente', '%', H, 'WO_SLA_BY_PRIORITY:URGENT', 97, 93, 88],
    ['SLA_NORMAL', 'SLA normal', '%', H, 'WO_SLA_BY_PRIORITY:NORMAL', 95, 90, 85],
    ['SLA_SCHEDULED', 'SLA programado', '%', H, 'WO_SLA_BY_ORIGIN:PREVENTIVE_PLAN', 98, 95, 90],
    ['SLA_INSIDE_PERCENT', 'Percentual de chamados dentro do SLA', '%', H, 'WO_SLA_COMPLIANCE', 95, 90, 85],
    ['SLA_OUTSIDE_PERCENT', 'Percentual fora do SLA', '%', L, 'WO_SLA_BREACH_RATE', 5, 10, 15],
  ] },
  { category: KpiCategory.PREVENTIVE_MAINTENANCE, source: 'Planos de manutenção e OS preventivas', items: [
    ['PREVENTIVE_EXECUTED', 'Preventivas executadas', 'OS', H, 'PLAN_GENERATED_COUNT', 1, 0, 0],
    ['PREVENTIVE_COMPLETED', 'Preventivas concluídas', 'OS', H, 'PLAN_COMPLETED_COUNT', 1, 0, 0],
    ['PREVENTIVE_LATE', 'Preventivas atrasadas', 'OS', L, 'PLAN_LATE_COUNT', 0, 1, 3],
    ['PREVENTIVE_CANCELED', 'Preventivas canceladas', 'OS', L, 'PLAN_CANCELED_COUNT', 0, 1, 2],
    ['PREVENTIVE_RESCHEDULED', 'Preventivas reprogramadas', 'OS', L, 'DATA_POINT_SUM', 0, 1, 3],
    ['ANNUAL_PLAN_COMPLIANCE', 'Cumprimento do plano anual', '%', H, 'PLAN_COMPLIANCE', 98, 95, 90],
    ['MONTHLY_PLAN_COMPLIANCE', 'Cumprimento do plano mensal', '%', H, 'PLAN_COMPLIANCE', 98, 95, 90],
    ['PREVENTIVE_CORRECTIVE_RATIO', 'Índice Preventiva × Corretiva', '%', H, 'PREVENTIVE_CORRECTIVE_RATIO', 70, 60, 50],
  ] },
  { category: KpiCategory.CORRECTIVE_MAINTENANCE, source: 'Ordens de Serviço corretivas e reaberturas', items: [
    ['CORRECTIVE_COUNT', 'Quantidade de corretivas', 'OS', L, 'WO_CORRECTIVE_COUNT', 10, 20, 30],
    ['CORRECTIVE_AVG_TIME', 'Tempo médio de corretivas', 'horas', L, 'WO_CORRECTIVE_AVG_HOURS', 24, 36, 48],
    ['REOPEN_RATE_30D', 'Reincidência', '%', L, 'WO_REOPEN_RATE', 5, 8, 12],
    ['REPEATED_FAILURES', 'Falhas repetidas', 'OS', L, 'WO_REOPEN_COUNT', 0, 2, 5],
    ['FIRST_TIME_FIX', 'Primeira intervenção resolutiva', '%', H, 'WO_FIRST_TIME_FIX', 95, 90, 85],
    ['BACKLOG_TOTAL', 'Backlog', 'OS', L, 'WO_BACKLOG_COUNT', 20, 30, 50],
    ['PENDING_CALLS', 'Chamados pendentes', 'OS', L, 'WO_PENDING_COUNT', 5, 10, 20],
  ] },
  { category: KpiCategory.AVAILABILITY, source: 'Pontos de disponibilidade por ativo/sistema', items: [
    ['ELEVATOR_AVAILABILITY', 'Disponibilidade dos elevadores'], ['GENERATOR_AVAILABILITY', 'Disponibilidade dos geradores'],
    ['SUBSTATION_AVAILABILITY', 'Disponibilidade da subestação'], ['FIRE_SYSTEM_AVAILABILITY', 'Disponibilidade dos sistemas de incêndio'],
    ['HVAC_AVAILABILITY', 'Disponibilidade do ar condicionado'], ['CRITICAL_SYSTEM_AVAILABILITY', 'Disponibilidade dos sistemas críticos'],
    ['BUILDING_AVAILABILITY', 'Disponibilidade global da edificação'],
  ].map(([code, name]) => [code, name, '%', H, 'DATA_POINT_RATIO', 99, 97, 95] as CompactItem) },
  { category: KpiCategory.QUALITY, source: 'OS, aceite, evidências e registros de conformidade', items: [
    ['SERVICES_APPROVED', 'Serviços aprovados', '%', H, 'WO_APPROVAL_RATE', 98, 95, 90],
    ['SERVICES_REJECTED', 'Serviços rejeitados', '%', L, 'WO_REOPEN_RATE', 2, 5, 10],
    ['NONCONFORMITIES', 'Não conformidades', 'ocorrências', L, 'DATA_POINT_SUM', 0, 2, 5],
    ['REWORK', 'Retrabalho', '%', L, 'WO_REOPEN_RATE', 3, 5, 10],
    ['CONFORMITY_INDEX', 'Índice de conformidade', '%', H, 'WO_DOCUMENTATION_COMPLIANCE', 98, 95, 90],
    ['TECHNICAL_AUDIT', 'Auditoria técnica', '%', H, 'DATA_POINT_AVERAGE', 95, 90, 85],
    ['DOCUMENT_CONFORMITY', 'Conformidade documental', '%', H, 'WO_DOCUMENTATION_COMPLIANCE', 98, 95, 90],
    ['PHOTO_CONFORMITY', 'Conformidade fotográfica', '%', H, 'WO_PHOTO_COMPLIANCE', 98, 95, 90],
  ] },
  { category: KpiCategory.SAFETY, source: 'Registros de segurança e pontos de dados auditáveis', items: [
    ['ACCIDENTS', 'Acidentes', 'ocorrências', L, 'DATA_POINT_SUM', 0, 1, 2],
    ['NEAR_MISSES', 'Quase acidentes', 'ocorrências', L, 'DATA_POINT_SUM', 0, 2, 5],
    ['PPE_COMPLIANCE', 'Uso de EPI', '%', H, 'DATA_POINT_AVERAGE', 100, 95, 90],
    ['CPE_COMPLIANCE', 'Uso de EPC', '%', H, 'DATA_POINT_AVERAGE', 100, 95, 90],
    ['NR_COMPLIANCE', 'Conformidade NR', '%', H, 'DATA_POINT_AVERAGE', 100, 95, 90],
    ['WORK_PERMITS', 'Permissões de trabalho', '%', H, 'DATA_POINT_AVERAGE', 100, 95, 90],
    ['TRAINING_COMPLIANCE', 'Treinamentos', '%', H, 'DATA_POINT_AVERAGE', 100, 95, 90],
    ['SAFETY_INCIDENTS', 'Incidentes', 'ocorrências', L, 'DATA_POINT_SUM', 0, 1, 3],
  ] },
  { category: KpiCategory.SATISFACTION, source: 'Avaliações de satisfação vinculadas às OS', items: [
    ['USER_SATISFACTION', 'Pesquisa de satisfação', 'nota 1-5', H, 'SATISFACTION_AVG', 4.5, 4, 3.5],
    ['NPS', 'NPS', 'pontos', H, 'NPS', 60, 40, 20],
    ['COMPLAINTS', 'Reclamações', 'ocorrências', L, 'DATA_POINT_SUM', 0, 2, 5],
    ['COMPLIMENTS', 'Elogios', 'ocorrências', H, 'DATA_POINT_SUM', 1, 0, 0],
    ['USER_RESPONSE_TIME', 'Tempo de resposta ao usuário', 'horas', L, 'WO_AVG_ASSIGNMENT_HOURS', 4, 8, 12],
  ] },
  { category: KpiCategory.FINANCIAL, source: 'Orçamentos finais, medições e contratos', items: [
    ['COST_PER_M2', 'Custo por m²', 'R$/m²', L, 'COST_PER_M2', 10, 15, 20],
    ['COST_PER_USER', 'Custo por usuário', 'R$/usuário', L, 'DATA_POINT_RATIO', 100, 130, 160],
    ['COST_PER_SYSTEM', 'Custo por sistema', 'R$/sistema', L, 'DATA_POINT_RATIO', 1000, 1500, 2000],
    ['COST_PER_ASSET', 'Custo por ativo', 'R$/ativo', L, 'DATA_POINT_RATIO', 500, 750, 1000],
    ['SAVINGS_GENERATED', 'Economia gerada', 'R$', H, 'DATA_POINT_SUM', 1, 0, 0],
    ['BUDGET_VARIANCE', 'Desvio orçamentário', '%', L, 'BUDGET_VARIANCE', 0, 5, 10],
    ['ECONOMIC_EFFICIENCY', 'Eficiência econômica', '%', H, 'DATA_POINT_RATIO', 100, 95, 90],
    ['CONTRACT_EXECUTION', 'Execução financeira contratual', '%', T, 'CONTRACT_EXECUTION', 100, 90, 80],
  ] },
  { category: KpiCategory.SUSTAINABILITY, source: 'Leituras ambientais e resultados das OS', items: [
    ['ENERGY_CONSUMPTION', 'Consumo de energia', 'kWh', L, 'DATA_POINT_SUM', 0, 0, 0],
    ['WATER_CONSUMPTION', 'Consumo de água', 'm³', L, 'DATA_POINT_SUM', 0, 0, 0],
    ['WASTE_GENERATED', 'Resíduos', 'kg', L, 'DATA_POINT_SUM', 0, 0, 0],
    ['RECYCLING_RATE', 'Reciclagem', '%', H, 'DATA_POINT_RATIO', 60, 50, 40],
    ['CARBON_FOOTPRINT', 'Pegada de carbono', 'tCO₂e', L, 'DATA_POINT_SUM', 0, 0, 0],
  ] },
  { category: KpiCategory.DOCUMENTATION, source: 'Anexos, laudos, checklists e fechamento das OS', items: [
    ['CLOSED_WITH_PHOTOS', 'Ordens encerradas com fotos', '%', H, 'WO_PHOTO_COMPLIANCE', 100, 95, 90],
    ['CLOSED_WITH_REPORT', 'Ordens encerradas com laudo', '%', H, 'WO_REPORT_COMPLIANCE', 100, 95, 90],
    ['CLOSED_WITH_CHECKLIST', 'Ordens encerradas com checklist', '%', H, 'WO_CHECKLIST_COMPLIANCE', 100, 95, 90],
    ['CLOSED_CORRECTLY', 'Ordens encerradas corretamente', '%', H, 'WO_DOCUMENTATION_COMPLIANCE', 100, 95, 90],
    ['DOCUMENT_UPDATE', 'Atualização documental', '%', H, 'DATA_POINT_AVERAGE', 100, 95, 90],
  ] },
  { category: KpiCategory.PREDICTIVE, source: 'Inspeções e sensores registrados como pontos de dados', items: [
    ['THERMOGRAPHY', 'Termografia'], ['VIBRATION', 'Vibração'], ['ULTRASOUND', 'Ultrassom'],
    ['OIL_ANALYSIS', 'Análise de óleo'], ['IOT_SENSORS', 'Sensores IoT'], ['PREDICTED_FAILURES', 'Falhas previstas'],
  ].map(([code, name]) => [code, name, 'leituras', H, 'DATA_POINT_SUM', 1, 0, 0] as CompactItem) },
  { category: KpiCategory.SYSTEM_SPECIFIC, source: 'Ativos, sistemas e pontos de disponibilidade/conformidade', items: [
    ['SYSTEM_ELEVATORS', 'Elevadores'], ['SYSTEM_PUMPS', 'Bombas'], ['SYSTEM_SUBSTATION', 'Subestação'],
    ['SYSTEM_SPDA', 'SPDA'], ['SYSTEM_TRANSFORMERS', 'Transformadores'], ['SYSTEM_RESERVOIRS', 'Reservatórios'],
    ['SYSTEM_FACADES', 'Fachadas'], ['SYSTEM_ROOF', 'Cobertura'], ['SYSTEM_WATERPROOFING', 'Impermeabilização'],
    ['SYSTEM_POOLS', 'Piscinas'], ['SYSTEM_AUTOMATION', 'Automação'], ['SYSTEM_CCTV', 'CFTV'],
    ['SYSTEM_GENERATORS', 'Geradores'], ['SYSTEM_UPS', 'No-breaks'],
  ].map(([code, name]) => [code, name, '%', H, 'DATA_POINT_AVERAGE', 95, 90, 85] as CompactItem) },
];

function automaticFormula(method: string, name: string, unit: string) {
  if (method.includes('RATIO') || unit === '%') return `${name} = numerador elegível ÷ denominador elegível × 100`;
  if (method.includes('AVG') || method.includes('AVERAGE')) return `${name} = Σ valores elegíveis ÷ quantidade de registros`;
  if (method.includes('COUNT')) return `${name} = contagem dos registros elegíveis no período`;
  if (method.includes('SUM')) return `${name} = Σ valores auditáveis no período`;
  return `${name} calculado automaticamente a partir da fonte declarada`;
}

export const KPI_LIBRARY: KpiLibraryItem[] = groups.flatMap(({ category, source, items }) => items.map((item, index) => {
  const [code, name, unit = '%', direction = H, calculationMethod = 'DATA_POINT_AVERAGE', targetValue = 95, warningValue = 90, criticalValue = 80] = item;
  const aggregation = calculationMethod.includes('COUNT') ? KpiAggregation.COUNT
    : calculationMethod.includes('SUM') ? KpiAggregation.SUM
      : calculationMethod.includes('RATIO') || unit === '%' ? KpiAggregation.RATIO : KpiAggregation.AVERAGE;
  return {
    code, name, category, unit, direction, periodicity: KpiPeriodicity.MONTHLY, aggregation,
    calculationMethod,
    description: `${name} no escopo e período selecionados, com rastreabilidade até a fonte operacional.`,
    formula: automaticFormula(calculationMethod, name, unit),
    formulaExample: `Exemplo: resultado 95 ${unit} para a competência, conforme registros detalhados na memória de cálculo.`,
    objective: `Monitorar ${name.toLocaleLowerCase('pt-BR')} e orientar decisões de desempenho contratual.`,
    dataSource: source, targetValue, warningValue, criticalValue,
    acceptableRange: direction === L ? `até ${targetValue} ${unit}` : `a partir de ${targetValue} ${unit}`,
    defaultWeight: index < 3 ? 10 : 5,
    deductionCriteria: `Aplicável somente quando configurado no contrato e enquadrado em faixa de glosa.`,
    bonusCriteria: `Aplicável somente quando previsto no contrato e enquadrado em faixa de bonificação.`,
    responsibleRole: 'Gestor ou fiscal do contrato',
  };
}));

export const KPI_LIBRARY_VERSION = 'PERFORMANCE_BR_2026.1';
