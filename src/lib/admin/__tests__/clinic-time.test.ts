import { describe, expect, it } from 'vitest';
import { clinicDayRange, trailingDaysRange } from '../clinic-time';

const MX_OFFSET_MINUS_6 = 6 * 60 * 60 * 1000;

// Zona no clínica: America/Los_Angeles observa PDT (UTC-7) en verano y
// PST (UTC-8) en invierno, así que los mismos instantes fijos verifican que el
// inicio del día local se mueve con el offset de la zona observadora.
const LOS_ANGELES = 'America/Los_Angeles';

describe('clinic-time', () => {
  it('clinicDayRange returns [localMidnight, nextLocalMidnight) for America/Mexico_City', () => {
    // 2026-09-03 14:30 local (UTC-6) -> local day 2026-09-03
    const now = new Date('2026-09-03T20:30:00.000Z');
    const [start, end] = clinicDayRange(now);

    expect(start.toISOString()).toBe('2026-09-03T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-04T06:00:00.000Z');
    expect(start.getTime()).toBeLessThan(end.getTime());
  });

  it('trailingDaysRange(30) spans 30 local days ending at tomorrow midnight', () => {
    const now = new Date('2026-09-03T20:30:00.000Z');
    const [start, end] = trailingDaysRange(now, 30);

    expect(start.toISOString()).toBe('2026-08-04T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-04T06:00:00.000Z');
  });

  it('range length is exactly days + 1 local days', () => {
    const now = new Date('2026-09-03T20:30:00.000Z');
    const [start, end] = trailingDaysRange(now, 30);

    const msPerDay = 24 * 60 * 60 * 1000;
    expect((end.getTime() - start.getTime()) / msPerDay).toBe(31);
  });

  it('clinicDayRange is exclusive at next-day midnight', () => {
    const now = new Date('2026-09-03T06:00:00.000Z');
    const [start, end] = clinicDayRange(now);

    // This instant is exactly Mexico 2026-09-03 00:00, so still today.
    expect(start.toISOString()).toBe('2026-09-03T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-04T06:00:00.000Z');
  });

  describe('explicit non-clinic time zone', () => {
    it('clinicDayRange shifts the day boundaries to the observer zone (PDT)', () => {
      const now = new Date('2026-09-03T20:30:00.000Z');
      const [start, end] = clinicDayRange(now, LOS_ANGELES);

      // Local midnight in Los Angeles (UTC-7 in September) is 07:00 UTC.
      expect(start.toISOString()).toBe('2026-09-03T07:00:00.000Z');
      expect(end.toISOString()).toBe('2026-09-04T07:00:00.000Z');
    });

    it('clinicDayRange shifts the day boundaries to the observer zone (PST)', () => {
      const now = new Date('2026-01-15T20:30:00.000Z');
      const [start, end] = clinicDayRange(now, LOS_ANGELES);

      // Local midnight in Los Angeles (UTC-8 in January) is 08:00 UTC.
      expect(start.toISOString()).toBe('2026-01-15T08:00:00.000Z');
      expect(end.toISOString()).toBe('2026-01-16T08:00:00.000Z');
    });

    it('clinicDayRange with an explicit zone differs from the clinic default', () => {
      const now = new Date('2026-09-03T20:30:00.000Z');
      const [clinicStart] = clinicDayRange(now);
      const [observerStart] = clinicDayRange(now, LOS_ANGELES);

      expect(clinicStart.toISOString()).toBe('2026-09-03T06:00:00.000Z');
      expect(observerStart.toISOString()).toBe('2026-09-03T07:00:00.000Z');
    });

    it('trailingDaysRange ends at the observer zone day boundary', () => {
      const now = new Date('2026-09-03T20:30:00.000Z');
      const [start, end] = trailingDaysRange(now, 30, LOS_ANGELES);

      expect(start.toISOString()).toBe('2026-08-04T07:00:00.000Z');
      expect(end.toISOString()).toBe('2026-09-04T07:00:00.000Z');
    });
  });
});
