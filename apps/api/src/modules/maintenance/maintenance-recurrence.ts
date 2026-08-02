import { BadRequestException } from '@nestjs/common';
import { FrequencyUnit } from '../../generated/prisma/client';

export function nextOccurrence(current: Date, unit: FrequencyUnit, value: number): Date {
  if (!Number.isInteger(value) || value < 1) throw new BadRequestException('Frequência inválida.');
  const next = new Date(current);
  if (unit === FrequencyUnit.DAY) next.setUTCDate(next.getUTCDate() + value);
  else if (unit === FrequencyUnit.WEEK) next.setUTCDate(next.getUTCDate() + value * 7);
  else if (unit === FrequencyUnit.MONTH) addMonths(next, value);
  else if (unit === FrequencyUnit.BIMONTH) addMonths(next, value * 2);
  else if (unit === FrequencyUnit.QUARTER) addMonths(next, value * 3);
  else if (unit === FrequencyUnit.SEMESTER) addMonths(next, value * 6);
  else if (unit === FrequencyUnit.YEAR) addMonths(next, value * 12);
  else throw new BadRequestException('Planos por leitura de medidor exigem lançamento manual.');
  return next;
}

function addMonths(date: Date, months: number): void {
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
}

