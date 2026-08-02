import { BadRequestException } from '@nestjs/common';

export type SlaTimeModeValue = 'CALENDAR' | 'BUSINESS';

export type SlaHolidayValue = {
  date: Date | string;
};

export type SlaCalendarValue = {
  timeMode: SlaTimeModeValue;
  timezone: string;
  businessDays?: unknown;
  shifts?: unknown;
  workdayStart?: string | null;
  workdayEnd?: string | null;
  holidays?: SlaHolidayValue[];
};

type LocalDate = {
  year: number;
  month: number;
  day: number;
};

type ZonedParts = LocalDate & {
  hour: number;
  minute: number;
  second: number;
};

type WorkingShift = {
  days: number[];
  start: number;
  end: number;
};

const DAY_GUARD = 36600;
const DEFAULT_BUSINESS_DAYS = [1, 2, 3, 4, 5];
const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function validateIanaTimezone(timezone: string): void {
  try {
    getFormatter(timezone).format(new Date(0));
  } catch {
    throw new BadRequestException('Fuso horário IANA inválido.');
  }
}

export function validateSlaCalendar(calendar: SlaCalendarValue): void {
  validateIanaTimezone(calendar.timezone);
  if (hasConfiguredShifts(calendar.shifts)) parseConfiguredShifts(calendar.shifts);
  if (calendar.timeMode === 'CALENDAR') return;
  resolveWorkingShifts(calendar);
}

export function addSlaMinutes(
  calendar: SlaCalendarValue,
  startAt: Date,
  minutes: number,
): Date {
  assertValidInstantAndDuration(startAt, minutes);
  if (calendar.timeMode === 'CALENDAR' || minutes === 0) {
    return new Date(startAt.getTime() + minutes * 60_000);
  }

  validateSlaCalendar(calendar);
  return moveThroughBusinessTime(calendar, startAt, minutes, 1);
}

export function subtractSlaMinutes(
  calendar: SlaCalendarValue,
  startAt: Date,
  minutes: number,
): Date {
  assertValidInstantAndDuration(startAt, minutes);
  if (calendar.timeMode === 'CALENDAR' || minutes === 0) {
    return new Date(startAt.getTime() - minutes * 60_000);
  }

  validateSlaCalendar(calendar);
  return moveThroughBusinessTime(calendar, startAt, minutes, -1);
}

export function calculateSlaDeadlines(
  calendar: SlaCalendarValue,
  startAt: Date,
  responseMinutes: number,
  resolutionMinutes: number,
  warningMinutesBefore: number,
) {
  const responseDeadline = addSlaMinutes(calendar, startAt, responseMinutes);
  const resolutionDeadline = addSlaMinutes(calendar, startAt, resolutionMinutes);
  const warningOffset = Math.min(warningMinutesBefore, resolutionMinutes);
  const resolutionWarningAt = subtractSlaMinutes(
    calendar,
    resolutionDeadline,
    warningOffset,
  );

  return { responseDeadline, resolutionDeadline, resolutionWarningAt };
}

function moveThroughBusinessTime(
  calendar: SlaCalendarValue,
  startAt: Date,
  minutes: number,
  direction: 1 | -1,
): Date {
  const timezone = calendar.timezone;
  const shifts = resolveWorkingShifts(calendar);
  const holidays = new Set((calendar.holidays ?? []).map((holiday) => holidayKey(holiday.date)));
  let remainingMs = minutes * 60_000;
  let cursorMs = startAt.getTime();
  let localDate = localDateAt(startAt, timezone);

  for (let inspectedDays = 0; inspectedDays < DAY_GUARD; inspectedDays += 1) {
    const dateKey = toDateKey(localDate);
    const weekday = weekdayForLocalDate(localDate);
    if (!holidays.has(dateKey)) {
      const dailyShifts = shifts
        .filter((shift) => shift.days.includes(weekday))
        .sort((left, right) => left.start - right.start);
      if (direction === -1) dailyShifts.reverse();

      for (const shift of dailyShifts) {
        const intervalStart = zonedDateTimeToUtc(
          localDate,
          Math.floor(shift.start / 60),
          shift.start % 60,
          timezone,
        ).getTime();
        const intervalEnd = zonedDateTimeToUtc(
          localDate,
          Math.floor(shift.end / 60),
          shift.end % 60,
          timezone,
        ).getTime();

        if (direction === 1) {
          const usableStart = Math.max(cursorMs, intervalStart);
          const availableMs = Math.max(0, intervalEnd - usableStart);
          if (remainingMs <= availableMs) return new Date(usableStart + remainingMs);
          remainingMs -= availableMs;
        } else {
          const usableEnd = Math.min(cursorMs, intervalEnd);
          const availableMs = Math.max(0, usableEnd - intervalStart);
          if (remainingMs <= availableMs) return new Date(usableEnd - remainingMs);
          remainingMs -= availableMs;
        }
      }
    }

    localDate = addLocalDays(localDate, direction);
    cursorMs = zonedDateTimeToUtc(
      localDate,
      direction === 1 ? 0 : 23,
      direction === 1 ? 0 : 59,
      timezone,
      direction === 1 ? 0 : 59,
      direction === 1 ? 0 : 999,
    ).getTime();
  }

  throw new BadRequestException('Não foi possível calcular o prazo no calendário informado.');
}

function assertValidInstantAndDuration(startAt: Date, minutes: number): void {
  if (Number.isNaN(startAt.getTime())) {
    throw new BadRequestException('Data inicial inválida para o cálculo de SLA.');
  }
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new BadRequestException('A duração do SLA deve ser expressa em minutos inteiros.');
  }
}

function parseBusinessDays(value: unknown): number[] {
  if (value === null || value === undefined) return DEFAULT_BUSINESS_DAYS;
  if (!Array.isArray(value)) {
    throw new BadRequestException('Dias úteis devem ser uma lista de inteiros entre 0 e 6.');
  }
  const days = value.filter(
    (day): day is number => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6,
  );
  if (days.length !== value.length || new Set(days).size !== days.length) {
    throw new BadRequestException('Dias úteis devem ser únicos e estar entre 0 e 6.');
  }
  return days;
}

function hasConfiguredShifts(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function resolveWorkingShifts(calendar: SlaCalendarValue): WorkingShift[] {
  if (hasConfiguredShifts(calendar.shifts)) return parseConfiguredShifts(calendar.shifts);
  if (calendar.shifts !== null && calendar.shifts !== undefined && !Array.isArray(calendar.shifts)) {
    throw new BadRequestException('Turnos devem ser informados como uma lista.');
  }

  const businessDays = parseBusinessDays(calendar.businessDays);
  if (!businessDays.length) {
    throw new BadRequestException('Calendário útil deve possuir ao menos um dia de trabalho.');
  }
  const start = parseClock(calendar.workdayStart, 'início');
  const end = parseClock(calendar.workdayEnd, 'fim');
  assertShiftRange(start, end);
  return [{ days: businessDays, start, end }];
}

function parseConfiguredShifts(value: unknown): WorkingShift[] {
  if (!Array.isArray(value)) throw new BadRequestException('Turnos devem ser informados como uma lista.');
  const shifts = value.map((rawShift) => {
    if (!rawShift || typeof rawShift !== 'object' || Array.isArray(rawShift)) {
      throw new BadRequestException('Cada turno deve informar dias, início e fim.');
    }
    const candidate = rawShift as { days?: unknown; start?: unknown; end?: unknown };
    if (!Array.isArray(candidate.days) || !candidate.days.length) {
      throw new BadRequestException('Cada turno deve possuir ao menos um dia de trabalho.');
    }
    const days = parseBusinessDays(candidate.days);
    const start = parseClock(
      typeof candidate.start === 'string' ? candidate.start : undefined,
      'início',
    );
    const end = parseClock(
      typeof candidate.end === 'string' ? candidate.end : undefined,
      'fim',
    );
    assertShiftRange(start, end);
    return { days, start, end };
  });

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const intervals = shifts
      .filter((shift) => shift.days.includes(weekday))
      .sort((left, right) => left.start - right.start);
    for (let index = 1; index < intervals.length; index += 1) {
      if (intervals[index].start < intervals[index - 1].end) {
        throw new BadRequestException('Turnos do mesmo dia não podem se sobrepor.');
      }
    }
  }
  return shifts;
}

function assertShiftRange(start: number, end: number): void {
  if (end <= start) {
    throw new BadRequestException(
      'O fim da jornada deve ser posterior ao início; jornadas noturnas devem ser divididas.',
    );
  }
}

function parseClock(value: string | null | undefined, label: string): number {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new BadRequestException(`Horário de ${label} da jornada é inválido.`);
  }
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function holidayKey(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function getFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(timezone, formatter);
  return formatter;
}

function zonedPartsAt(date: Date, timezone: string): ZonedParts {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of getFormatter(timezone).formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour!,
    minute: values.minute!,
    second: values.second!,
  };
}

function localDateAt(date: Date, timezone: string): LocalDate {
  const { year, month, day } = zonedPartsAt(date, timezone);
  return { year, month, day };
}

function zonedDateTimeToUtc(
  date: LocalDate,
  hour: number,
  minute: number,
  timezone: string,
  second = 0,
  millisecond = 0,
): Date {
  const desiredAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute, second, millisecond);
  let candidate = desiredAsUtc;

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const actual = zonedPartsAt(new Date(candidate), timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      millisecond,
    );
    const difference = desiredAsUtc - actualAsUtc;
    if (difference === 0) break;
    candidate += difference;
  }

  return new Date(candidate);
}

function addLocalDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function weekdayForLocalDate(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function toDateKey(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}
