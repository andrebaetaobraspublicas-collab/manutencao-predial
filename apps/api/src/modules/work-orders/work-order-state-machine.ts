import { WorkOrderStatus } from '../../generated/prisma/client';

export const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.OPEN,
  WorkOrderStatus.TRIAGED,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PENDING,
  WorkOrderStatus.WAITING_APPROVAL,
];

export const TERMINAL_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.CLOSED,
  WorkOrderStatus.CANCELED,
];

const transitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  OPEN: ['TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING', 'CANCELED'],
  TRIAGED: ['ASSIGNED', 'IN_PROGRESS', 'PENDING', 'CANCELED'],
  ASSIGNED: ['IN_PROGRESS', 'PENDING', 'CANCELED'],
  IN_PROGRESS: ['PENDING', 'WAITING_APPROVAL', 'COMPLETED', 'CANCELED'],
  PENDING: ['ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL', 'CANCELED'],
  WAITING_APPROVAL: ['IN_PROGRESS', 'PENDING', 'COMPLETED', 'CANCELED'],
  COMPLETED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELED: [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return transitions[from].includes(to);
}

export function allowedTransitions(from: WorkOrderStatus): WorkOrderStatus[] {
  return [...transitions[from]];
}
