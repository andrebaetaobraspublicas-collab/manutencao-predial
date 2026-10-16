import { BadRequestException } from '@nestjs/common';

// Calendar dates are interpreted in the product's Brazilian timezone, not the server timezone.
export function auditPeriod(from?: string, to?: string) {
  const parse = (day: string) => {
    const value = new Date(`${day}T00:00:00-03:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(value.getTime()) || new Date(value.getTime() - 10800000).toISOString().slice(0, 10) !== day) throw new BadRequestException('Data inválida.');
    return value;
  };
  const start = from ? parse(from) : undefined, end = to ? parse(to) : undefined;
  if (start && end && start > end) throw new BadRequestException('A data inicial deve preceder a data final.');
  return { ...(start ? { gte: start } : {}), ...(end ? { lt: new Date(end.getTime() + 86400000) } : {}) };
}

// Existing business events may have large reports; never return credentials or project documents.
export function auditDetails(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[Detalhe resumido]';
  if (typeof value === 'string') return value.slice(0, 1000);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(v => auditDetails(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|senha|token|secret|cookie|authorization|credential|data$|raw|payload|body/i.test(key)).slice(0, 30).map(([key, v]) => [key, auditDetails(v, depth + 1)]));
  return null;
}
