import { BadRequestException } from '@nestjs/common';
import {
  addSlaMinutes,
  calculateSlaDeadlines,
  type SlaCalendarValue,
} from './sla-calculator';

const BUSINESS_CALENDAR: SlaCalendarValue = {
  timeMode: 'BUSINESS',
  timezone: 'America/Sao_Paulo',
  businessDays: [1, 2, 3, 4, 5],
  workdayStart: '09:00',
  workdayEnd: '17:00',
  holidays: [],
};

describe('cálculo de SLA', () => {
  it('soma minutos corridos sem alterar o instante inicial para o fuso', () => {
    const deadline = addSlaMinutes(
      { timeMode: 'CALENDAR', timezone: 'America/Sao_Paulo' },
      new Date('2026-08-07T19:00:00.000Z'),
      120,
    );

    expect(deadline.toISOString()).toBe('2026-08-07T21:00:00.000Z');
  });

  it('consome apenas a jornada útil e atravessa o fim de semana', () => {
    // Sexta-feira, 16h no fuso de São Paulo.
    const deadline = addSlaMinutes(
      BUSINESS_CALENDAR,
      new Date('2026-08-07T19:00:00.000Z'),
      120,
    );

    // Uma hora na sexta e outra na segunda: segunda-feira, 10h local.
    expect(deadline.toISOString()).toBe('2026-08-10T13:00:00.000Z');
  });

  it('ignora feriados cadastrados no calendário', () => {
    const deadline = addSlaMinutes(
      {
        ...BUSINESS_CALENDAR,
        holidays: [{ date: new Date('2026-08-10T00:00:00.000Z') }],
      },
      new Date('2026-08-07T19:00:00.000Z'),
      120,
    );

    expect(deadline.toISOString()).toBe('2026-08-11T13:00:00.000Z');
  });

  it('suporta jornada partida sem contar o intervalo entre turnos', () => {
    const deadline = addSlaMinutes(
      {
        ...BUSINESS_CALENDAR,
        shifts: [
          { days: [1, 2, 3, 4, 5], start: '08:00', end: '12:00' },
          { days: [1, 2, 3, 4, 5], start: '13:00', end: '17:00' },
        ],
      },
      new Date('2026-08-10T14:00:00.000Z'), // segunda-feira, 11h local
      120,
    );

    expect(deadline.toISOString()).toBe('2026-08-10T17:00:00.000Z'); // 14h local
  });

  it('permite turnos diferentes por dia da semana', () => {
    const deadline = addSlaMinutes(
      {
        ...BUSINESS_CALENDAR,
        shifts: [
          { days: [1], start: '08:00', end: '12:00' },
          { days: [2], start: '13:00', end: '17:00' },
        ],
      },
      new Date('2026-08-10T14:00:00.000Z'), // segunda-feira, 11h local
      120,
    );

    expect(deadline.toISOString()).toBe('2026-08-11T17:00:00.000Z'); // terça-feira, 14h local
  });

  it('calcula o alerta anterior usando o mesmo calendário útil', () => {
    const result = calculateSlaDeadlines(
      BUSINESS_CALENDAR,
      new Date('2026-08-07T19:00:00.000Z'),
      60,
      120,
      60,
    );

    expect(result.responseDeadline.toISOString()).toBe('2026-08-07T20:00:00.000Z');
    expect(result.resolutionDeadline.toISOString()).toBe('2026-08-10T13:00:00.000Z');
    expect(result.resolutionWarningAt.toISOString()).toBe('2026-08-10T12:00:00.000Z');
  });

  it('rejeita calendário útil sem uma jornada válida', () => {
    expect(() =>
      addSlaMinutes(
        { ...BUSINESS_CALENDAR, workdayStart: '18:00', workdayEnd: '08:00' },
        new Date('2026-08-07T19:00:00.000Z'),
        60,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejeita turnos sobrepostos no mesmo dia', () => {
    expect(() =>
      addSlaMinutes(
        {
          ...BUSINESS_CALENDAR,
          shifts: [
            { days: [1], start: '08:00', end: '12:00' },
            { days: [1], start: '11:30', end: '17:00' },
          ],
        },
        new Date('2026-08-10T11:00:00.000Z'),
        60,
      ),
    ).toThrow(BadRequestException);
  });
});
