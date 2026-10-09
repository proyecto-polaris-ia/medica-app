import { describe, expect, it } from 'vitest';
import {
  CLINIC_TZ,
  clinicDayKey,
  clinicLocalInputToUtc,
  clinicMonthRangeUtc,
  clinicTimeLabel,
  getCalendarGrid,
  getCurrentClinicMonth,
  groupAppointmentsByDay,
  isValidIanaTimeZone,
  resolveTimeZone,
  toClinicLocalInput,
} from '../timezone';

// Zona no clínica para probar la parametrización. America/Los_Angeles observa
// PDT (UTC-7) en verano y PST (UTC-8) en invierno, así que los mismos instantes
// fijos también ejercitan el cálculo del offset dependiente de DST.
const LOS_ANGELES = 'America/Los_Angeles';

describe('timezone helpers', () => {
  it('exports the clinic timezone', () => {
    expect(CLINIC_TZ).toBe('America/Mexico_City');
  });

  it('clinicDayKey returns the clinic-local date for a UTC instant', () => {
    // 2026-01-15 01:00 UTC is 2026-01-14 19:00 in Mexico City (CST, -06:00)
    expect(clinicDayKey('2026-01-15T01:00:00.000Z')).toBe('2026-01-14');
  });

  it('clinicTimeLabel returns HH:mm in clinic time', () => {
    // Mexico City observes CST (UTC-6) year-round since 2022.
    expect(clinicTimeLabel('2026-06-10T14:00:00.000Z')).toBe('08:00');
  });

  it('clinicMonthRangeUtc returns [start, end) for a month', () => {
    const { startAt, endAt } = clinicMonthRangeUtc(2026, 6);
    expect(startAt).toBe('2026-06-01T06:00:00.000Z');
    expect(endAt).toBe('2026-07-01T06:00:00.000Z');
  });

  it('clinicMonthRangeUtc wraps December to January', () => {
    const { startAt, endAt } = clinicMonthRangeUtc(2026, 12);
    expect(startAt).toBe('2026-12-01T06:00:00.000Z');
    expect(endAt).toBe('2027-01-01T06:00:00.000Z');
  });

  it('clinicMonthRangeUtc handles April', () => {
    const { startAt, endAt } = clinicMonthRangeUtc(2026, 4);
    expect(startAt).toBe('2026-04-01T06:00:00.000Z');
    expect(endAt).toBe('2026-05-01T06:00:00.000Z');
  });

  it('clinicMonthRangeUtc handles October', () => {
    const { startAt, endAt } = clinicMonthRangeUtc(2026, 10);
    expect(startAt).toBe('2026-10-01T06:00:00.000Z');
    expect(endAt).toBe('2026-11-01T06:00:00.000Z');
  });

  it('clinicMonthRangeUtc handles February in a non-leap year', () => {
    const { startAt, endAt } = clinicMonthRangeUtc(2025, 2);
    expect(startAt).toBe('2025-02-01T06:00:00.000Z');
    expect(endAt).toBe('2025-03-01T06:00:00.000Z');
  });

  describe('toClinicLocalInput', () => {
    it('formats a UTC instant as clinic-local datetime-local input', () => {
      // 23:00 UTC = 17:00 in Mexico City (CST, -06:00)
      expect(toClinicLocalInput('2026-09-16T23:00:00.000Z')).toBe(
        '2026-09-16T17:00'
      );
    });

    it('handles the midnight boundary without shifting the day', () => {
      // 06:00 UTC on the 17th = 00:00 on the 17th in Mexico City
      expect(toClinicLocalInput('2026-09-17T06:00:00.000Z')).toBe(
        '2026-09-17T00:00'
      );
    });
  });

  describe('clinicLocalInputToUtc', () => {
    it('interprets the input as clinic time, not device time', () => {
      expect(clinicLocalInputToUtc('2026-09-16T17:00')).toBe(
        '2026-09-16T23:00:00.000Z'
      );
    });

    it('converts clinic midnight to the correct UTC instant', () => {
      expect(clinicLocalInputToUtc('2026-09-17T00:00')).toBe(
        '2026-09-17T06:00:00.000Z'
      );
    });
  });

  it('clinic local input round-trips through UTC', () => {
    const input = '2026-09-16T17:00';
    expect(toClinicLocalInput(clinicLocalInputToUtc(input))).toBe(input);
  });

  describe('explicit non-clinic time zone', () => {
    it('clinicDayKey shifts the day when the observer zone is behind the clinic', () => {
      // 06:30 UTC on the 10th is 00:30 in Mexico City but 23:30 on the 9th in LA (PDT).
      const instant = '2026-06-10T06:30:00.000Z';
      expect(clinicDayKey(instant)).toBe('2026-06-10');
      expect(clinicDayKey(instant, LOS_ANGELES)).toBe('2026-06-09');
    });

    it('clinicTimeLabel uses the observer zone offset (PDT, UTC-7)', () => {
      expect(clinicTimeLabel('2026-09-16T23:00:00.000Z', LOS_ANGELES)).toBe(
        '16:00'
      );
    });

    it('clinicTimeLabel uses the observer zone offset (PST, UTC-8)', () => {
      expect(clinicTimeLabel('2026-01-15T16:00:00.000Z', LOS_ANGELES)).toBe(
        '08:00'
      );
    });

    it('toClinicLocalInput formats in the observer zone, not the clinic zone', () => {
      expect(toClinicLocalInput('2026-09-16T23:00:00.000Z', LOS_ANGELES)).toBe(
        '2026-09-16T16:00'
      );
    });

    it('clinicLocalInputToUtc interprets the input in the observer zone (PDT)', () => {
      expect(clinicLocalInputToUtc('2026-09-16T16:00', LOS_ANGELES)).toBe(
        '2026-09-16T23:00:00.000Z'
      );
    });

    it('clinicLocalInputToUtc interprets the input in the observer zone (PST)', () => {
      expect(clinicLocalInputToUtc('2026-01-15T08:00', LOS_ANGELES)).toBe(
        '2026-01-15T16:00:00.000Z'
      );
    });

    it('observer-zone local input round-trips through UTC', () => {
      const input = '2026-09-16T16:00';
      expect(toClinicLocalInput(clinicLocalInputToUtc(input, LOS_ANGELES), LOS_ANGELES)).toBe(
        input
      );
    });

    it('clinicMonthRangeUtc uses the observer zone DST offset (PDT)', () => {
      const { startAt, endAt } = clinicMonthRangeUtc(2026, 6, LOS_ANGELES);
      expect(startAt).toBe('2026-06-01T07:00:00.000Z');
      expect(endAt).toBe('2026-07-01T07:00:00.000Z');
    });

    it('clinicMonthRangeUtc uses the observer zone DST offset (PST)', () => {
      const { startAt, endAt } = clinicMonthRangeUtc(2026, 1, LOS_ANGELES);
      expect(startAt).toBe('2026-01-01T08:00:00.000Z');
      expect(endAt).toBe('2026-02-01T08:00:00.000Z');
    });

    it('getCalendarGrid keeps wall-clock cells with a non-clinic zone', () => {
      // July 1, 2026 is a Wednesday: two leading pad cells, then the month.
      const grid = getCalendarGrid(2026, 7, LOS_ANGELES);

      expect(grid).toHaveLength(42);
      expect(grid[0]).toEqual({ day: 0, inMonth: false, dayKey: null });
      expect(grid[1]).toEqual({ day: 0, inMonth: false, dayKey: null });
      expect(grid[2]).toEqual({
        day: 1,
        inMonth: true,
        dayKey: '2026-07-01',
      });
      expect(grid[32]).toEqual({
        day: 31,
        inMonth: true,
        dayKey: '2026-07-31',
      });
    });

    it('groupAppointmentsByDay buckets and labels in the observer zone', () => {
      const groups = groupAppointmentsByDay(
        [
          {
            id: 'a1',
            patientName: 'Ana',
            serviceName: 'Limpieza',
            providerId: 'p1',
            startAt: '2026-06-10T06:30:00.000Z',
            endAt: '2026-06-10T07:00:00.000Z',
            status: 'confirmed',
          },
        ],
        () => '#000000',
        LOS_ANGELES
      );

      expect(Object.keys(groups)).toEqual(['2026-06-09']);
      expect(groups['2026-06-09']).toHaveLength(1);
      expect(groups['2026-06-09'][0].startLabel).toBe('23:30');
    });

    it('getCurrentClinicMonth honors an explicit observer zone', () => {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: LOS_ANGELES,
        year: 'numeric',
        month: '2-digit',
      });
      const parts = formatter.formatToParts(new Date());
      const year = Number(parts.find((p) => p.type === 'year')?.value);
      const month = Number(parts.find((p) => p.type === 'month')?.value);

      expect(getCurrentClinicMonth(LOS_ANGELES)).toEqual({ year, month });
    });
  });

  describe('isValidIanaTimeZone', () => {
    it('accepts a valid IANA zone', () => {
      expect(isValidIanaTimeZone('America/Los_Angeles')).toBe(true);
      expect(isValidIanaTimeZone('UTC')).toBe(true);
    });

    it('rejects an unknown zone', () => {
      expect(isValidIanaTimeZone('Not/AZone')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isValidIanaTimeZone('')).toBe(false);
    });
  });

  describe('resolveTimeZone', () => {
    it('returns a valid zone unchanged', () => {
      expect(resolveTimeZone(LOS_ANGELES)).toBe(LOS_ANGELES);
    });

    it('falls back to the clinic zone for null, undefined and invalid values', () => {
      expect(resolveTimeZone(null)).toBe(CLINIC_TZ);
      expect(resolveTimeZone(undefined)).toBe(CLINIC_TZ);
      expect(resolveTimeZone('Not/AZone')).toBe(CLINIC_TZ);
      expect(resolveTimeZone('')).toBe(CLINIC_TZ);
    });
  });
});

// La fila de la agenda necesita la hora de fin del rango, derivada de `endAt`.
describe('groupAppointmentsByDay endLabel', () => {
  it('derives the end label in clinic time by default', () => {
    const groups = groupAppointmentsByDay(
      [
        {
          id: 'a1',
          patientName: 'Ana',
          serviceName: 'Limpieza',
          providerId: 'p1',
          startAt: '2026-06-10T14:00:00.000Z',
          endAt: '2026-06-10T14:30:00.000Z',
          status: 'confirmed',
        },
      ],
      () => '#000000'
    );

    expect(groups['2026-06-10'][0].startLabel).toBe('08:00');
    expect(groups['2026-06-10'][0].endLabel).toBe('08:30');
  });

  it('derives the end label in the observer zone (PDT)', () => {
    const groups = groupAppointmentsByDay(
      [
        {
          id: 'a1',
          patientName: 'Ana',
          serviceName: 'Limpieza',
          providerId: 'p1',
          startAt: '2026-06-10T06:30:00.000Z',
          endAt: '2026-06-10T07:00:00.000Z',
          status: 'confirmed',
        },
      ],
      () => '#000000',
      LOS_ANGELES
    );

    expect(groups['2026-06-09'][0].startLabel).toBe('23:30');
    expect(groups['2026-06-09'][0].endLabel).toBe('00:00');
  });

  it('omits endLabel when endAt is null or absent', () => {
    const base = {
      id: 'a1',
      patientName: 'Ana',
      serviceName: 'Limpieza',
      providerId: 'p1',
      startAt: '2026-06-10T14:00:00.000Z',
      status: 'confirmed' as const,
    };

    const withNull = groupAppointmentsByDay(
      [{ ...base, endAt: null }],
      () => '#000000'
    );
    expect(withNull['2026-06-10'][0].endLabel).toBeUndefined();

    const withMissing = groupAppointmentsByDay([base], () => '#000000');
    expect(withMissing['2026-06-10'][0].endLabel).toBeUndefined();
  });
});
