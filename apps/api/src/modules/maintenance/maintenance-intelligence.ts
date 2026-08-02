import { FrequencyUnit, MaintenancePlanType, WorkOrderPriority } from '../../generated/prisma/client';

export type IntelligentMaintenanceInput = {
  buildingType?: string;
  constructionYear?: number | null;
  environmentalExposure: 'LOW' | 'MEDIUM' | 'HIGH';
  occupationIntensity: 'LOW' | 'MEDIUM' | 'HIGH';
  systems: string[];
  startDate: Date;
};

export type MaintenanceRecommendation = {
  code: string;
  system: string;
  title: string;
  objective: string;
  type: MaintenancePlanType;
  frequencyUnit: FrequencyUnit;
  frequencyValue: number;
  priority: WorkOrderPriority;
  riskScore: number;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  nextDueAt: string;
  estimatedHours: number;
  specialty: string;
  checklist: string[];
  procedure: string[];
  acceptanceCriteria: string[];
  technicalReferences: string[];
  rationale: string;
};

type Template = Omit<MaintenanceRecommendation, 'riskScore' | 'criticality' | 'nextDueAt' | 'rationale'> & {
  baseRisk: number;
  firstDueDays: number;
};

const COMMON_REFERENCES = ['ABNT NBR 5674 — gestão da manutenção', 'ABNT NBR 14037 — uso, operação e manutenção'];

const TEMPLATES: Template[] = [
  template('COBERTURA', 'COB-INS', 'Inspeção de cobertura, calhas e rufos', 4, 90, FrequencyUnit.SEMESTER,
    ['Verificar telhas, fixações e pontos de infiltração', 'Limpar calhas e condutores', 'Registrar fotos das anomalias'],
    ['Inspecionar em condição climática segura', 'Desobstruir drenagem e registrar patologias'], ['Drenagem livre', 'Sem peças soltas ou infiltração aparente']),
  template('FACHADAS', 'FAC-INS', 'Inspeção visual de fachadas e selantes', 5, 60, FrequencyUnit.YEAR,
    ['Inspecionar fissuras, destacamentos e selantes', 'Mapear áreas de risco', 'Registrar fotos georreferenciadas'],
    ['Executar inspeção visual a partir de áreas seguras', 'Classificar manifestações e recomendar ensaio especializado'], ['Sem risco iminente de desprendimento', 'Anomalias registradas e priorizadas']),
  template('ESTRUTURA', 'EST-INS', 'Inspeção de elementos estruturais aparentes', 6, 30, FrequencyUnit.YEAR,
    ['Verificar fissuras, deformações e corrosão', 'Comparar manifestações com registro anterior'],
    ['Inspecionar sem intervenção destrutiva', 'Encaminhar anomalias relevantes ao responsável técnico'], ['Ausência de risco aparente', 'Evolução das manifestações documentada']),
  template('IMPERMEABILIZACAO', 'IMP-INS', 'Inspeção de impermeabilizações e juntas', 4, 60, FrequencyUnit.SEMESTER,
    ['Verificar bolhas, fissuras e falhas em juntas', 'Registrar pontos de umidade'], ['Inspecionar superfícies e encontros', 'Executar teste localizado quando autorizado'], ['Sem infiltração ativa', 'Juntas íntegras']),
  template('RESERVATORIOS', 'RES-LIM', 'Limpeza e inspeção de reservatórios', 6, 30, FrequencyUnit.SEMESTER,
    ['Isolar e sinalizar a área', 'Inspecionar tampas, vedação e extravasor', 'Registrar antes e depois'],
    ['Programar parada e contingência', 'Executar limpeza por equipe habilitada', 'Restabelecer e verificar estanqueidade'], ['Reservatório limpo e vedado', 'Abastecimento restabelecido sem vazamento']),
  template('BOMBAS', 'BOM-PREV', 'Manutenção preventiva de bombas', 6, 14, FrequencyUnit.MONTH,
    ['Verificar ruído, vibração e vazamentos', 'Registrar corrente elétrica', 'Verificar alinhamento e fixação'],
    ['Inspecionar em operação', 'Desenergizar antes de intervenção mecânica', 'Testar após o serviço'], ['Sem vazamento ou ruído anormal', 'Parâmetros dentro da referência do fabricante']),
  template('PAINEIS_ELETRICOS', 'ELE-PAI', 'Inspeção de painéis elétricos', 8, 14, FrequencyUnit.QUARTER,
    ['Verificar aquecimento, ruído e sinalização', 'Inspecionar conexões conforme procedimento seguro', 'Registrar termografia quando aplicável'],
    ['Aplicar bloqueio e etiquetagem quando houver intervenção', 'Registrar medições e pontos quentes'], ['Sem ponto quente crítico', 'Proteções identificadas e acessíveis']),
  template('SPDA', 'SPDA-INS', 'Inspeção do SPDA e aterramento', 8, 30, FrequencyUnit.YEAR,
    ['Verificar captores, descidas e conexões aparentes', 'Registrar condição do aterramento'],
    ['Inspecionar continuidade aparente', 'Programar medições por profissional habilitado'], ['Componentes aparentes íntegros', 'Medições registradas quando requeridas']),
  template('AR_CONDICIONADO', 'HVAC-PREV', 'Manutenção preventiva de climatização', 6, 7, FrequencyUnit.MONTH,
    ['Verificar filtros, drenos e serpentinas', 'Registrar temperatura de insuflamento', 'Verificar ruído e vibração'],
    ['Higienizar conforme plano aplicável', 'Desobstruir drenos', 'Testar operação'], ['Dreno livre', 'Filtros limpos', 'Operação estável']),
  template('COMBATE_INCENDIO', 'INC-TEST', 'Inspeção funcional do sistema de incêndio', 10, 7, FrequencyUnit.MONTH,
    ['Verificar acesso e sinalização', 'Inspecionar hidrantes, alarmes e iluminação de emergência', 'Registrar não conformidades'],
    ['Executar testes sem comprometer a proteção da edificação', 'Comunicar previamente os ocupantes quando necessário'], ['Equipamentos acessíveis e sinalizados', 'Testes registrados sem falha crítica']),
  template('ELEVADORES', 'ELV-CTRL', 'Acompanhamento da manutenção de elevadores', 9, 7, FrequencyUnit.MONTH,
    ['Conferir registro da empresa mantenedora', 'Verificar portas, nivelamento e comunicação de emergência'],
    ['Acompanhar testes sem acessar áreas restritas', 'Registrar ocorrências e indisponibilidades'], ['Operação sem anomalia aparente', 'Registro mensal disponível']),
  template('HIDRAULICO', 'HID-INS', 'Inspeção de instalações hidráulicas', 5, 14, FrequencyUnit.QUARTER,
    ['Verificar vazamentos e pressão aparente', 'Inspecionar válvulas e registros', 'Registrar consumo anormal'],
    ['Percorrer prumadas e áreas técnicas acessíveis', 'Testar registros por amostragem'], ['Sem vazamento ativo', 'Registros identificados e operáveis']),
  template('GERADOR', 'GER-TEST', 'Teste funcional do grupo gerador', 9, 7, FrequencyUnit.MONTH,
    ['Verificar combustível, bateria e alarmes', 'Executar teste funcional', 'Registrar tensão e frequência'],
    ['Inspecionar antes da partida', 'Executar teste conforme fabricante e plano de contingência'], ['Partida sem falha', 'Parâmetros registrados e estáveis']),
  template('CFTV', 'CFTV-INS', 'Inspeção do sistema de CFTV', 4, 14, FrequencyUnit.QUARTER,
    ['Verificar câmeras indisponíveis', 'Conferir gravação e data/hora', 'Inspecionar limpeza das lentes'],
    ['Testar visualização e recuperação de amostra autorizada'], ['Câmeras essenciais disponíveis', 'Gravação recuperável conforme política']),
];

function template(system: string, code: string, title: string, baseRisk: number, firstDueDays: number,
  frequencyUnit: FrequencyUnit, checklist: string[], procedure: string[], acceptanceCriteria: string[]): Template {
  return { system, code, title, objective: `Preservar desempenho, segurança e disponibilidade do sistema ${system.toLowerCase().replaceAll('_', ' ')}.`,
    type: MaintenancePlanType.PREVENTIVE, frequencyUnit, frequencyValue: 1,
    priority: baseRisk >= 8 ? WorkOrderPriority.HIGH : WorkOrderPriority.NORMAL,
    baseRisk, firstDueDays, estimatedHours: baseRisk >= 8 ? 4 : 2, specialty: system,
    checklist, procedure, acceptanceCriteria, technicalReferences: COMMON_REFERENCES };
}

export const INTELLIGENCE_VERSION = 'RULESET_BR_2026.1';

export function recommendMaintenance(input: IntelligentMaintenanceInput, now = new Date()): MaintenanceRecommendation[] {
  const age = input.constructionYear ? Math.max(0, now.getUTCFullYear() - input.constructionYear) : 0;
  const ageFactor = age >= 30 ? 2 : age >= 15 ? 1 : 0;
  const exposureFactor = input.environmentalExposure === 'HIGH' ? 2 : input.environmentalExposure === 'MEDIUM' ? 1 : 0;
  const useFactor = input.occupationIntensity === 'HIGH' ? 1 : 0;
  const selected = new Set(input.systems.map((item) => item.trim().toUpperCase()));
  return TEMPLATES.filter((item) => selected.has(item.system)).map((item) => {
    const riskScore = Math.min(12, item.baseRisk + ageFactor + exposureFactor + useFactor);
    const criticality = riskScore >= 10 ? 'CRITICAL' : riskScore >= 8 ? 'HIGH' : riskScore >= 5 ? 'MEDIUM' : 'LOW';
    const firstDueDays = riskScore >= 10 ? Math.min(7, item.firstDueDays) : riskScore >= 8 ? Math.min(30, item.firstDueDays) : item.firstDueDays;
    const nextDueAt = new Date(input.startDate.getTime() + firstDueDays * 86_400_000).toISOString();
    const rationale = `Recomendação baseada no sistema informado, idade aproximada de ${age} ano(s), exposição ${input.environmentalExposure.toLowerCase()} e ocupação ${input.occupationIntensity.toLowerCase()}. Validação do responsável técnico é obrigatória.`;
    return { ...item, riskScore, criticality, nextDueAt, rationale };
  });
}

export function availableMaintenanceSystems() {
  return [...new Set(TEMPLATES.map((item) => item.system))];
}
