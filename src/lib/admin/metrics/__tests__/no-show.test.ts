import { describe, expect, it } from 'vitest';
import { computeNoShow } from '../no-show';
import type { ClinicRange, MetricAppointment } from '../types';
import type { AppointmentStatus } from '../../types';

const MX_OFFSET_HOURS = 6;

function mx(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): string {
  return new Date(
    Date.UTC(year, month - 1, day, hour + MX_OFFSET_HOURS, minute)
  ).toISOString();
}

const RANGE: ClinicRange = {
  start: new Date(mx(2026, 10, 1)),
  end: new Date(mx(2026, 10, 3)),
};

function appt(
  id: string,
  status: AppointmentStatus,
  overrides: Partial<MetricAppointment> = {}
): MetricAppointment {
  return {
    id,
    providerId: 'p1',
    startAt: mx(2026, 10, 1, 10),
    endAt: mx(2026, 10, 1, 11),
    status,
    ...overrides,
  };
}

describe('computeNoShow', () => {
  it('calcula no_show / (no_show + attended)', () => {
    const result = computeNoShow({
      appointments: [
        appt('a1', 'no_show'),
        appt('a2', 'attended'),
        appt('a3', 'attended'),
        appt('a4', 'attended'),
      ],
      range: RANGE,
    });

    expect(result.noShowCount).toBe(1);
    expect(result.attendedCount).toBe(3);
    expect(result.noShowRatePct).toBeCloseTo(25, 5);
  });

  it('sin no_show pero con attended → 0 %', () => {
    const result = computeNoShow({
      appointments: [appt('a1', 'attended'), appt('a2', 'attended')],
      range: RANGE,
    });

    expect(result.noShowRatePct).toBe(0);
  });

  it('sin no_show ni attended → null (no 0)', () => {
    const result = computeNoShow({
      appointments: [appt('a1', 'cancelled'), appt('a2', 'confirmed')],
      range: RANGE,
    });

    expect(result.noShowCount).toBe(0);
    expect(result.attendedCount).toBe(0);
    expect(result.noShowRatePct).toBeNull();
  });

  it('rango sin citas → null', () => {
    const result = computeNoShow({ appointments: [], range: RANGE });

    expect(result).toEqual({
      noShowCount: 0,
      attendedCount: 0,
      noShowRatePct: null,
    });
  });

  it('cancelled queda fuera del numerador y del denominador', () => {
    const result = computeNoShow({
      appointments: [
        appt('a1', 'cancelled'),
        appt('a2', 'cancelled'),
        appt('a3', 'no_show'),
        appt('a4', 'attended'),
      ],
      range: RANGE,
    });

    expect(result.noShowCount).toBe(1);
    expect(result.attendedCount).toBe(1);
    expect(result.noShowRatePct).toBeCloseTo(50, 5);
  });

  it('las citas fuera del rango no cuentan', () => {
    const result = computeNoShow({
      appointments: [
        appt('a1', 'no_show', {
          startAt: mx(2026, 9, 10, 10),
          endAt: mx(2026, 9, 10, 11),
        }),
        appt('a2', 'attended', {
          startAt: mx(2026, 10, 20, 10),
          endAt: mx(2026, 10, 20, 11),
        }),
      ],
      range: RANGE,
    });

    expect(result.noShowRatePct).toBeNull();
  });

  it('es semiabierto en los bordes del rango', () => {
    const result = computeNoShow({
      appointments: [
        // Termina exactamente en range.start: fuera.
        appt('a1', 'no_show', {
          startAt: new Date(RANGE.start.getTime() - 3_600_000).toISOString(),
          endAt: RANGE.start.toISOString(),
        }),
        // Empieza exactamente en range.end: fuera.
        appt('a2', 'attended', {
          startAt: RANGE.end.toISOString(),
          endAt: new Date(RANGE.end.getTime() + 3_600_000).toISOString(),
        }),
      ],
      range: RANGE,
    });

    expect(result.noShowRatePct).toBeNull();
  });

  it('desglosa por proveedor y también agrega', () => {
    const appointments = [
      appt('a1', 'no_show', { providerId: 'p1' }),
      appt('a2', 'attended', { providerId: 'p1' }),
      appt('a3', 'attended', { providerId: 'p2' }),
    ];

    const p1 = computeNoShow({ appointments, providerId: 'p1', range: RANGE });
    const p2 = computeNoShow({ appointments, providerId: 'p2', range: RANGE });
    const aggregate = computeNoShow({ appointments, range: RANGE });

    expect(p1.noShowRatePct).toBeCloseTo(50, 5);
    expect(p2.noShowRatePct).toBe(0);
    expect(aggregate.noShowCount).toBe(1);
    expect(aggregate.attendedCount).toBe(2);
    expect(aggregate.noShowRatePct).toBeCloseTo(100 / 3, 5);
  });
});
