import { describe, expect, it } from 'vitest';
import {
  capacityMinutesForProvider,
  clampOccupancyPct,
  computeOccupancy,
  overlapMinutes,
} from '../occupancy';
import type {
  ClinicRange,
  MetricAppointment,
  MetricBusinessHour,
} from '../types';
import type { AppointmentStatus } from '../../types';

const MX_OFFSET_HOURS = 6;

/** Instante UTC de una hora local en America/Mexico_City (UTC-6 fijo). */
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

function rangeOf(
  startKey: [number, number, number],
  endKey: [number, number, number]
): ClinicRange {
  return { start: new Date(mx(...startKey)), end: new Date(mx(...endKey)) };
}

// Jueves 1 → sábado 3 de octubre de 2026 (exclusivo), medianoche local.
const RANGE = rangeOf([2026, 10, 1], [2026, 10, 3]);
const DAY_1 = rangeOf([2026, 10, 1], [2026, 10, 2]);

const HOURS: MetricBusinessHour[] = [
  // Jueves 2026-10-01 = día 4: 4 h
  { providerId: 'p1', dayOfWeek: 4, startTime: '09:00:00', endTime: '13:00:00' },
  // Viernes 2026-10-02 = día 5: 4 h
  { providerId: 'p1', dayOfWeek: 5, startTime: '10:00:00', endTime: '14:00:00' },
];

function appt(
  overrides: Partial<MetricAppointment> & { status: AppointmentStatus }
): MetricAppointment {
  return {
    id: 'a1',
    providerId: 'p1',
    startAt: mx(2026, 10, 1, 10),
    endAt: mx(2026, 10, 1, 11),
    ...overrides,
  };
}

describe('overlapMinutes', () => {
  it('cuenta los minutos completos de una cita dentro del rango', () => {
    expect(
      overlapMinutes(mx(2026, 10, 1, 10), mx(2026, 10, 1, 11), RANGE)
    ).toBe(60);
  });

  it('prorratea una cita que termina después del fin del rango', () => {
    // Local Oct 2 23:00 → Oct 3 01:00; el rango termina en la medianoche del 3.
    expect(
      overlapMinutes(mx(2026, 10, 2, 23), mx(2026, 10, 3, 1), RANGE)
    ).toBe(60);
  });

  it('prorratea una cita que empieza antes del inicio del rango', () => {
    // Local Sep 30 23:00 → Oct 1 01:00; el rango empieza en la medianoche del 1.
    expect(
      overlapMinutes(mx(2026, 9, 30, 23), mx(2026, 10, 1, 1), RANGE)
    ).toBe(60);
  });

  it('cuenta solo la parte dentro del rango cuando la cita cruza medianoche', () => {
    // Local Oct 1 23:30 → Oct 2 00:30; solo 30 min caen dentro del día 1.
    const minutes = overlapMinutes(
      mx(2026, 10, 1, 23, 30),
      mx(2026, 10, 2, 0, 30),
      DAY_1
    );
    expect(minutes).toBe(30);
  });

  it('es semiabierto: una cita que termina exactamente en range.start aporta 0', () => {
    const endAt = RANGE.start.toISOString();
    const startAt = new Date(RANGE.start.getTime() - 60 * 60 * 1000).toISOString();
    expect(overlapMinutes(startAt, endAt, RANGE)).toBe(0);
  });

  it('es semiabierto: una cita que empieza exactamente en range.end aporta 0', () => {
    const startAt = RANGE.end.toISOString();
    const endAt = new Date(RANGE.end.getTime() + 60 * 60 * 1000).toISOString();
    expect(overlapMinutes(startAt, endAt, RANGE)).toBe(0);
  });

  it('devuelve 0 para un rango de longitud cero', () => {
    const empty: ClinicRange = {
      start: new Date(mx(2026, 10, 1)),
      end: new Date(mx(2026, 10, 1)),
    };
    expect(
      overlapMinutes(mx(2026, 10, 1, 9), mx(2026, 10, 1, 17), empty)
    ).toBe(0);
  });
});

describe('capacityMinutesForProvider', () => {
  it('suma los minutos de business_hours por día clínico del rango', () => {
    expect(capacityMinutesForProvider(HOURS, 'p1', RANGE)).toBe(480);
  });

  it('un día sin business_hours aporta capacidad cero', () => {
    const saturday = rangeOf([2026, 10, 3], [2026, 10, 4]);
    expect(capacityMinutesForProvider(HOURS, 'p1', saturday)).toBe(0);
  });

  it('suma dos bloques del mismo día', () => {
    const withSecondBlock: MetricBusinessHour[] = [
      ...HOURS,
      { providerId: 'p1', dayOfWeek: 4, startTime: '15:00:00', endTime: '17:00:00' },
    ];
    expect(capacityMinutesForProvider(withSecondBlock, 'p1', RANGE)).toBe(600);
  });

  it('usa day_of_week 0 = domingo', () => {
    const sunday = rangeOf([2026, 10, 4], [2026, 10, 5]);
    const hours: MetricBusinessHour[] = [
      { providerId: 'p1', dayOfWeek: 0, startTime: '08:00:00', endTime: '12:00:00' },
    ];
    expect(capacityMinutesForProvider(hours, 'p1', sunday)).toBe(240);
  });

  it('filtra por proveedor', () => {
    const hours: MetricBusinessHour[] = [
      ...HOURS,
      { providerId: 'p2', dayOfWeek: 4, startTime: '09:00:00', endTime: '13:00:00' },
    ];
    expect(capacityMinutesForProvider(hours, 'p1', RANGE)).toBe(480);
  });

  it('providerId null agrega todos los proveedores', () => {
    const hours: MetricBusinessHour[] = [
      ...HOURS,
      { providerId: 'p2', dayOfWeek: 4, startTime: '09:00:00', endTime: '13:00:00' },
    ];
    expect(capacityMinutesForProvider(hours, null, RANGE)).toBe(480 + 240);
  });

  it('un bloque con start_time === end_time aporta 0 minutos (guarda defensiva)', () => {
    const hours: MetricBusinessHour[] = [
      { providerId: 'p1', dayOfWeek: 4, startTime: '09:00:00', endTime: '09:00:00' },
    ];
    expect(capacityMinutesForProvider(hours, 'p1', RANGE)).toBe(0);
  });

  it('funciona en un rango que cruza el límite de mes', () => {
    const acrossMonths = rangeOf([2026, 9, 30], [2026, 10, 2]);
    const hours: MetricBusinessHour[] = [
      { providerId: 'p1', dayOfWeek: 3, startTime: '09:00:00', endTime: '17:00:00' },
      { providerId: 'p1', dayOfWeek: 4, startTime: '09:00:00', endTime: '17:00:00' },
    ];
    expect(capacityMinutesForProvider(hours, 'p1', acrossMonths)).toBe(480 + 480);
  });
});

describe('clampOccupancyPct', () => {
  it('acota por debajo a 0', () => {
    expect(clampOccupancyPct(-10)).toBe(0);
    expect(clampOccupancyPct(0)).toBe(0);
  });

  it('acota por arriba a 100', () => {
    expect(clampOccupancyPct(150)).toBe(100);
  });

  it('NaN → 0', () => {
    expect(clampOccupancyPct(Number.NaN)).toBe(0);
  });
});

describe('computeOccupancy', () => {
  it('calcula la razón ocupado / capacidad como porcentaje', () => {
    const result = computeOccupancy({
      appointments: [appt({ status: 'confirmed', startAt: mx(2026, 10, 1, 10), endAt: mx(2026, 10, 1, 11) })],
      businessHours: HOURS,
      providerId: 'p1',
      range: RANGE,
    });

    expect(result.occupiedMinutes).toBe(60);
    expect(result.capacityMinutes).toBe(480);
    expect(result.occupancyPct).toBeCloseTo(12.5, 5);
  });

  it('excluye cancelled, rescheduled y no_show del numerador', () => {
    const appointments: MetricAppointment[] = [
      appt({ id: 'a1', status: 'cancelled' }),
      appt({ id: 'a2', status: 'rescheduled' }),
      appt({ id: 'a3', status: 'no_show' }),
      appt({ id: 'a4', status: 'attended' }),
    ];
    const result = computeOccupancy({
      appointments,
      businessHours: HOURS,
      providerId: 'p1',
      range: RANGE,
    });

    expect(result.occupiedMinutes).toBe(60);
  });

  it('acota a 100 cuando el numerador supera la capacidad', () => {
    const appointments: MetricAppointment[] = [
      appt({ id: 'a1', status: 'confirmed', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 11) }),
      appt({ id: 'a2', status: 'confirmed', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 11) }),
      appt({ id: 'a3', status: 'confirmed', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 11) }),
      appt({ id: 'a4', status: 'confirmed', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 11) }),
      appt({ id: 'a5', status: 'pending', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 11) }),
    ];
    const result = computeOccupancy({
      appointments,
      businessHours: HOURS,
      providerId: 'p1',
      range: RANGE,
    });

    expect(result.occupiedMinutes).toBeGreaterThan(result.capacityMinutes);
    expect(result.occupancyPct).toBe(100);
  });

  it('capacidad 0 → ocupación 0 (nunca NaN ni negativa)', () => {
    const saturday = rangeOf([2026, 10, 3], [2026, 10, 4]);
    const result = computeOccupancy({
      appointments: [appt({ status: 'confirmed', startAt: mx(2026, 10, 3, 10), endAt: mx(2026, 10, 3, 11) })],
      businessHours: HOURS,
      providerId: 'p1',
      range: saturday,
    });

    expect(result.capacityMinutes).toBe(0);
    expect(result.occupancyPct).toBe(0);
  });

  it('agrega todos los proveedores cuando no se pasa providerId', () => {
    const hours: MetricBusinessHour[] = [
      ...HOURS,
      { providerId: 'p2', dayOfWeek: 4, startTime: '09:00:00', endTime: '10:00:00' },
    ];
    const appointments: MetricAppointment[] = [
      appt({ id: 'a1', status: 'confirmed', providerId: 'p1' }),
      appt({ id: 'a2', status: 'confirmed', providerId: 'p2', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 10) }),
    ];
    const result = computeOccupancy({
      appointments,
      businessHours: hours,
      range: RANGE,
    });

    expect(result.occupiedMinutes).toBe(60 + 60);
    expect(result.capacityMinutes).toBe(480 + 60);
    expect(result.occupancyPct).toBeCloseTo((120 / 540) * 100, 5);
  });
});
