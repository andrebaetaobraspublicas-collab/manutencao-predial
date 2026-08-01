export const statusLabels: Record<string, string> = {
  OPEN: 'Aberta',
  TRIAGED: 'Triada',
  ASSIGNED: 'Atribuída',
  IN_PROGRESS: 'Em execução',
  PENDING: 'Com pendência',
  WAITING_APPROVAL: 'Aguardando aprovação',
  COMPLETED: 'Concluída',
  CLOSED: 'Fechada',
  CANCELED: 'Cancelada',
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  EXPIRING: 'A vencer',
  EXPIRED: 'Vencido',
  TERMINATED: 'Rescindido',
};

export const priorityLabels: Record<string, string> = {
  LOW: 'Baixa',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
  CRITICAL: 'Crítica',
};

export function labelFor(value: string, dictionary: Record<string, string>): string {
  return dictionary[value] ?? value.replaceAll('_', ' ').toLowerCase();
}
