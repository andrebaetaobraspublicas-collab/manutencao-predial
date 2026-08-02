import { labelFor, priorityLabels, statusLabels } from '@/lib/labels';

export function StatusBadge({ value }: { value: string }) {
  return <span className={`badge status-${value}`}>{labelFor(value, statusLabels)}</span>;
}

export function PriorityBadge({ value }: { value: string }) {
  return <span className={`badge priority-${value}`}>{labelFor(value, priorityLabels)}</span>;
}
