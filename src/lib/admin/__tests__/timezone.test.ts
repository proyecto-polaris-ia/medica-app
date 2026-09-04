import { describe, expect, it } from 'vitest';
import {
  CLINIC_TZ,
  clinicDayKey,
  clinicMonthRangeUtc,
  clinicTimeLabel,
} from '../timezone';

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
});
