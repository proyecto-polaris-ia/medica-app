import { describe, expect, it } from 'vitest';
import { clinicDayRange, trailingDaysRange } from '../clinic-time';

const MX_OFFSET_MINUS_6 = 6 * 60 * 60 * 1000;

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
});
