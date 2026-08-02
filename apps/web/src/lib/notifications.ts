import type { AppNotification } from './types';

export function notificationHref(notification: AppNotification): string | null {
  if (notification.actionUrl?.startsWith('/')) return notification.actionUrl;
  if (notification.workOrderId) {
    return `/ordens-servico/detalhe?id=${encodeURIComponent(notification.workOrderId)}&section=activity`;
  }
  if (!notification.entityId) return null;
  if (notification.entityType === 'WORK_ORDER') {
    return `/ordens-servico/detalhe?id=${encodeURIComponent(notification.entityId)}&section=activity`;
  }
  if (notification.entityType === 'CONTRACT') return '/contratos';
  if (notification.entityType === 'BUILDING') return '/edificacoes';
  return null;
}

export function notificationSeverity(notification: AppNotification): 'INFO' | 'WARNING' | 'CRITICAL' {
  if (notification.severity) return notification.severity;
  if (notification.eventType.includes('BREACHED') || notification.eventType.includes('REOPENED')) return 'CRITICAL';
  if (notification.eventType.includes('WARNING') || notification.eventType.includes('DUE') || notification.eventType.includes('EXPIRING')) return 'WARNING';
  return 'INFO';
}

export function notificationEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    WORK_ORDER_CREATED: 'Nova ordem de serviço',
    WORK_ORDER_ASSIGNED: 'Atribuição de OS',
    WORK_ORDER_STATUS_CHANGED: 'Mudança de status',
    WORK_ORDER_COMMENT_MENTION: 'Menção em comentário',
    WORK_ORDER_PENDENCY_CREATED: 'Nova pendência',
    WORK_ORDER_PENDENCY_RESOLVED: 'Pendência resolvida',
    WORK_ORDER_SLA_WARNING: 'SLA próximo do vencimento',
    WORK_ORDER_SLA_BREACHED: 'SLA vencido',
    CONTRACT_EXPIRING: 'Contrato próximo do vencimento',
  };
  return labels[eventType] ?? eventType.replaceAll('_', ' ').toLowerCase();
}
