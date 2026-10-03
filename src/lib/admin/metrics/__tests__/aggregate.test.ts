import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../aggregate';
import type {
  ClinicRange,
  MetricAppointment,
  MetricBusinessHour,
  ProviderRef,
} from '../types';
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

const PROVIDERS: ProviderRef[] = [
  { id: 'p1', name: 'Dra. Uno' },
  { id: 'p2', name: 'Dr. Dos' },
  { id: 'p3', name: 'Dra. Tres' },
  { id: 'p4', name: 'Dr. Cuatro' },
];

function appt(
  id: string,
  providerId: string,
  status: AppointmentStatus,
  startAt = mx(2026, 10, 1, 10),
  endAt = mx(2026, 10, 1, 11)
): MetricAppointment {
  return { id, providerId, startAt, endAt, status };
}

describe('computeMetrics', () => {
  it('agrega como Σ ocupados / Σ capacidad, no como promedio de porcentajes', () => {
    const businessHours: MetricBusinessHour[] = [
      { providerId: 'p1', dayOfWeek: 4, startTime: '09:00:00', endTime: '13:00:00' },
      { providerId: 'p2', dayOfWeek: 4, startTime: '09:00:00', endTime: '10:00:00' },
    ];
    const appointments: MetricAppointment[] = [
      appt('a1', 'p1', 'confirmed', mx(2026, 10, 1, 10), mx(2026, 10, 1, 11)), // 60 / 240 = 25 %
      appt('a2', 'p2', 'confirmed', mx(2026, 10, 1, 9), mx(2026, 10, 1, 10)), // 60 / 60 = 100 %
    ];

    const metrics = computeMetrics({
      appointments,
      businessHours,
      providers: PROVIDERS,
      range: RANGE,
    });

    expect(metrics.occupiedMinutes).toBe(120);
    expect(metrics.capacityMinutes).toBe(300);
    expect(metrics.occupancyPct).toBeCloseTo((120 / 300) * 100, 5);
    // El promedio de porcentajes (62.5) sería un cálculo incorrecto.
    expect(metrics.occupancyPct).not.toBeCloseTo(62.5, 5);
  });

  it('desglosa por proveedor sobre la unión de citas y business_hours', () => {
    const businessHours: MetricBusinessHour[] = [
      { providerId: 'p1', dayOfWeek: 4, startTime: '09:00:00', endTime: '13:00:00' },
      // p3 solo tiene horario, sin citas.
      { providerId: 'p3', dayOfWeek: 5, startTime: '09:00:00', endTime: '13:00:00' },
    ];
    const appointments: MetricAppointment[] = [
      appt('a1', 'p1', 'confirmed'),
      // p4 solo tiene citas, sin horario.
      appt('a2', 'p4', 'confirmed'),
    ];

    const metrics = computeMetrics({
      appointments,
      businessHours,
      providers: PROVIDERS,
      range: RANGE,
    });

    const byId = new Map(metrics.providers.map((provider) => [provider.providerId, provider]));
    expect([...byId.keys()].sort()).toEqual(['p1', 'p3', 'p4']);

    expect(byId.get('p1')?.providerName).toBe('Dra. Uno');
    expect(byId.get('p1')?.capacityMinutes).toBe(240);
    expect(byId.get('p1')?.occupancyPct).toBeCloseTo(25, 5);

    // Solo horario → 0 %.
    expect(byId.get('p3')?.providerName).toBe('Dra. Tres');
    expect(byId.get('p3')?.occupiedMinutes).toBe(0);
    expect(byId.get('p3')?.capacityMinutes).toBe(240);
    expect(byId.get('p3')?.occupancyPct).toBe(0);

    // Solo citas sin horario → capacidad 0 y 0 %.
    expect(byId.get('p4')?.capacityMinutes).toBe(0);
    expect(byId.get('p4')?.occupancyPct).toBe(0);
    expect(byId.get('p4')?.occupiedMinutes).toBe(60);
  });

  it('sin ids → providers vacío (fallback al agregado)', () => {
    const metrics = computeMetrics({
      appointments: [],
      businessHours: [],
      providers: PROVIDERS,
      range: RANGE,
    });

    expect(metrics.providers).toEqual([]);
    expect(metrics.occupancyPct).toBe(0);
    expect(metrics.noShowRatePct).toBeNull();
  });

  it('cuenta el total de citas que solapan el rango sin filtrar status', () => {
    const appointments: MetricAppointment[] = [
      appt('a1', 'p1', 'confirmed'),
      appt('a2', 'p1', 'cancelled'),
      appt('a3', 'p1', 'no_show'),
      appt('a4', 'p1', 'attended'),
      appt('a5', 'p1', 'requested'),
      // Fuera del rango: no cuenta.
      appt('a6', 'p1', 'confirmed', mx(2026, 9, 1, 10), mx(2026, 9, 1, 11)),
    ];

    const metrics = computeMetrics({
      appointments,
      businessHours: [],
      range: RANGE,
    });

    expect(metrics.totalAppointments).toBe(5);
    expect(metrics.cancelledCount).toBe(1);
    expect(metrics.statusCounts).toEqual({
      requested: 1,
      confirmed: 1,
      pending: 0,
      cancelled: 1,
      rescheduled: 0,
      no_show: 1,
      attended: 1,
    });
  });

  it('estado vacío (sin citas ni horario) no produce valores inválidos', () => {
    const metrics = computeMetrics({
      appointments: [],
      businessHours: [],
      range: RANGE,
    });

    expect(metrics).toMatchObject({
      occupancyPct: 0,
      occupiedMinutes: 0,
      capacityMinutes: 0,
      noShowRatePct: null,
      noShowCount: 0,
      attendedCount: 0,
      totalAppointments: 0,
      cancelledCount: 0,
      providers: [],
    });
  });

  it('acota el agregado a 100 con datos sucios de business_hours', () => {
    const businessHours: MetricBusinessHour[] = [
      // Un bloque que no cubre la demanda: 30 min de capacidad.
      { providerId: 'p1', dayOfWeek: 4, startTime: '09:00:00', endTime: '09:30:00' },
    ];
    const appointments: MetricAppointment[] = [
      appt('a1', 'p1', 'confirmed', mx(2026, 10, 1, 8), mx(2026, 10, 1, 12)),
    ];

    const metrics = computeMetrics({
      appointments,
      businessHours,
      range: RANGE,
    });

    expect(metrics.occupancyPct).toBe(100);
  });

  it('la tasa de no-show agregada sigue la regla del denominador cero', () => {
    const withNoShow = computeMetrics({
      appointments: [appt('a1', 'p1', 'no_show'), appt('a2', 'p1', 'attended')],
      businessHours: [],
      range: RANGE,
    });
    const withoutDenominator = computeMetrics({
      appointments: [appt('a3', 'p1', 'confirmed')],
      businessHours: [],
      range: RANGE,
    });

    expect(withNoShow.noShowRatePct).toBeCloseTo(50, 5);
    expect(withoutDenominator.noShowRatePct).toBeNull();
  });

  it('desglosa los totales y cancelaciones por proveedor', () => {
    const appointments: MetricAppointment[] = [
      appt('a1', 'p1', 'confirmed'),
      appt('a2', 'p1', 'cancelled'),
      appt('a3', 'p2', 'attended'),
    ];

    const metrics = computeMetrics({
      appointments,
      businessHours: [],
      providers: PROVIDERS,
      range: RANGE,
    });
    const byId = new Map(metrics.providers.map((provider) => [provider.providerId, provider]));

    expect(byId.get('p1')?.totalAppointments).toBe(2);
    expect(byId.get('p1')?.cancelledCount).toBe(1);
    expect(byId.get('p2')?.totalAppointments).toBe(1);
    expect(byId.get('p2')?.cancelledCount).toBe(0);
    expect(byId.get('p2')?.attendedCount).toBe(1);
  });
});
