export const PILOT_SCENARIOS = [
  {
    code: 'MASTER_DATA',
    title: 'Base cadastral do piloto',
    category: 'CADASTRO',
    description: 'Organização, equipe, prédio, fornecedor, contrato, categorias e SLA configurados.',
    href: '/edificacoes',
  },
  {
    code: 'WORK_ORDER_CYCLE',
    title: 'Ciclo completo da ordem de serviço',
    category: 'OPERACAO',
    description: 'OS fechada com aceite, custo, comentário, checklist e evidência privada.',
    href: '/ordens-servico',
  },
  {
    code: 'FINANCIAL_RECONCILIATION',
    title: 'Medição e empenho conciliados',
    category: 'FINANCEIRO',
    description: 'Empenho emitido e medição paga com rastreabilidade até as ordens de serviço.',
    href: '/medicoes',
  },
  {
    code: 'BUDGET_SINAPI',
    title: 'Orçamento e referência SINAPI',
    category: 'ORCAMENTO',
    description: 'Catálogo versionado importado e orçamento de OS aprovado.',
    href: '/orcamentos',
  },
  {
    code: 'PREVENTIVE_MAINTENANCE',
    title: 'Manutenção preventiva recorrente',
    category: 'PREVENTIVA',
    description: 'Plano ativo com geração idempotente de ordem de serviço comprovada.',
    href: '/planos-manutencao',
  },
  {
    code: 'KPI_REPORTS',
    title: 'KPIs e relatórios reconciliados',
    category: 'GESTAO',
    description: 'Indicadores calculados e relatórios confrontados com as telas operacionais.',
    href: '/indicadores',
  },
  {
    code: 'ACCESS_SECURITY',
    title: 'Acessos, perfis e arquivos privados',
    category: 'SEGURANCA',
    description: 'Papéis distintos, revogação de sessões e autorização de anexos homologados.',
    href: '/administracao',
  },
  {
    code: 'BACKUP_RECOVERY',
    title: 'Backup, restauração e prontidão',
    category: 'OPERACAO_TECNICA',
    description: 'Evidência do backup, ensaio de restauração e health check registrada.',
    href: '/piloto',
  },
  {
    code: 'USER_ACCEPTANCE',
    title: 'Aceite dos usuários do piloto',
    category: 'HOMOLOGACAO',
    description: 'Responsáveis confirmam que o ciclo mensal pode ocorrer sem planilha paralela.',
    href: '/piloto',
  },
] as const;

export type PilotScenarioCode = (typeof PILOT_SCENARIOS)[number]['code'];
export type PilotAutomaticStatus = 'PASSED' | 'PENDING' | 'MANUAL';
export type PilotDecisionOutcome = 'PASSED' | 'FAILED' | 'BLOCKED' | 'PENDING';
export type PilotAcceptanceOutcome = 'APPROVED' | 'REJECTED';
export type PilotStatus =
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'FAILED'
  | 'READY_FOR_ACCEPTANCE'
  | 'APPROVED'
  | 'REJECTED'
  | 'REGRESSION_DETECTED';

export function isPilotScenarioCode(value: string): value is PilotScenarioCode {
  return PILOT_SCENARIOS.some((scenario) => scenario.code === value);
}

export function summarizePilot(
  scenarios: Array<{ automaticStatus: PilotAutomaticStatus; decisionOutcome?: PilotDecisionOutcome | null }>,
  acceptanceOutcome?: PilotAcceptanceOutcome | null,
) {
  const automaticPassed = scenarios.filter((item) => item.automaticStatus === 'PASSED').length;
  const automaticPending = scenarios.filter((item) => item.automaticStatus === 'PENDING').length;
  const manualOnly = scenarios.filter((item) => item.automaticStatus === 'MANUAL').length;
  const decisionsPassed = scenarios.filter((item) => item.decisionOutcome === 'PASSED').length;
  const allPassed = scenarios.every(
    (item) => item.automaticStatus !== 'PENDING' && item.decisionOutcome === 'PASSED',
  );

  let status: PilotStatus = 'IN_PROGRESS';
  if (acceptanceOutcome === 'APPROVED') status = allPassed ? 'APPROVED' : 'REGRESSION_DETECTED';
  else if (acceptanceOutcome === 'REJECTED') status = 'REJECTED';
  else if (scenarios.some((item) => item.decisionOutcome === 'BLOCKED')) status = 'BLOCKED';
  else if (scenarios.some((item) => item.decisionOutcome === 'FAILED')) status = 'FAILED';
  else if (allPassed) status = 'READY_FOR_ACCEPTANCE';

  return {
    status,
    canAccept: allPassed,
    total: scenarios.length,
    automaticPassed,
    automaticPending,
    manualOnly,
    decisionsPassed,
    progressPercentage: scenarios.length
      ? Math.round((decisionsPassed / scenarios.length) * 100)
      : 0,
  };
}
