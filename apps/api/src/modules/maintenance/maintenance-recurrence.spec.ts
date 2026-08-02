import { FrequencyUnit } from '../../generated/prisma/client';
import { nextOccurrence } from './maintenance-recurrence';

describe('nextOccurrence', () => {
  it('preserva o fim do mês em recorrências mensais', () => {
    expect(nextOccurrence(new Date('2026-01-31T12:00:00.000Z'), FrequencyUnit.MONTH, 1).toISOString())
      .toBe('2026-02-28T12:00:00.000Z');
  });
  it('calcula frequência trimestral', () => {
    expect(nextOccurrence(new Date('2026-02-10T00:00:00.000Z'), FrequencyUnit.QUARTER, 1).toISOString())
      .toBe('2026-05-10T00:00:00.000Z');
  });
});

