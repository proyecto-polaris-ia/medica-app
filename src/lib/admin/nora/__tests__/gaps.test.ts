import { describe, expect, it } from 'vitest';
import { computeGaps } from '../gaps';
import { NORA_MIN_GAP_MINUTES, type NoraGap } from '../types';
import type {
  ClinicRange,
  MetricAppointment,
  MetricBusinessHour,
} from '../../metrics/types';
import type { AppointmentStatus } from '../../types';

const MX_OFFSET_HOURS = 6;

/** Instante UTC de una hora local en America/Mexico_City (UTC−6 fijo). */
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

function bh(
  overrides: Partial<MetricBusinessHour> = {}
): MetricBusinessHour {
  return {
    providerId: 'p1',
    dayOfWeek: 4, // jueves
    startTime: '09:00:00',
    endTime: '18:00:00',
    ...overrides,
  };
}

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

// Jueves 1 de octubre de 2026 (día clínico UTC−6), rango de un día [start, end).
const OCT_1 = rangeOf([2026, 10, 1], [2026, 10, 2]);

describe('computeGaps', () => {
  it('reporta un hueco entre dos citas con la duración exacta del espacio libre', () => {
    const gaps = computeGaps({
      businessHours: [bh()],
      appointments: [
        appt({ status: 'confirmed', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 11) }),
        appt({ id: 'a2', status: 'confirmed', startAt: mx(2026, 10, 1, 13), endAt: mx(2026, 10, 1, 18) }),
      ],
      range: OCT_1,
    });

    expect(gaps).toEqual<NoraGap[]>([
      {
        providerId: 'p1',
        dayKey: '2026-10-01',
        startAt: mx(2026, 10, 1, 11),
        endAt: mx(2026, 10, 1, 13),
        minutes: 120,
      },
    ]);
  });

  it('no reporta huecos cuando la ventana está cubierta por citas activas contiguas', () => {
    const gaps = computeGaps({
      businessHours: [bh()],
      appointments: [
        appt({ status: 'confirmed', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 12) }),
        appt({ id: 'a2', status: 'pending', startAt: mx(2026, 10, 1, 12), endAt: mx(2026, 10, 1, 18) }),
      ],
      range: OCT_1,
    });

    expect(gaps).toEqual([]);
  });

  it('una cita cancelled o rescheduled no ocupa su tramo', () => {
    const gaps = computeGaps({
      businessHours: [bh()],
      appointments: [
        appt({ status: 'cancelled', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 12) }),
        appt({ id: 'a2', status: 'rescheduled', startAt: mx(2026, 10, 1, 12), endAt: mx(2026, 10, 1, 15) }),
        appt({ id: 'a3', status: 'confirmed', startAt: mx(2026, 10, 1, 15), endAt: mx(2026, 10, 1, 18) }),
      ],
      range: OCT_1,
    });

    expect(gaps).toEqual<NoraGap[]>([
      {
        providerId: 'p1',
        dayKey: '2026-10-01',
        startAt: mx(2026, 10, 1, 9),
        endAt: mx(2026, 10, 1, 15),
        minutes: 360,
      },
    ]);
  });

  it('une ventanas solapadas antes de restar (sin huecos duplicados)', () => {
    const gaps = computeGaps({
      businessHours: [
        bh({ startTime: '09:00:00', endTime: '13:00:00' }),
        bh({ startTime: '12:00:00', endTime: '18:00:00' }),
      ],
      appointments: [
        appt({ status: 'confirmed', startAt: mx(2026, 10, 1, 10), endAt: mx(2026, 10, 1, 11) }),
      ],
      range: OCT_1,
    });

    expect(gaps).toEqual<NoraGap[]>([
      {
        providerId: 'p1',
        dayKey: '2026-10-01',
        startAt: mx(2026, 10, 1, 9),
        endAt: mx(2026, 10, 1, 10),
        minutes: 60,
      },
      {
        providerId: 'p1',
        dayKey: '2026-10-01',
        startAt: mx(2026, 10, 1, 11),
        endAt: mx(2026, 10, 1, 18),
        minutes: 420,
      },
    ]);
  });

  it('une ventanas que se tocan en el borde (no solo las que se solapan)', () => {
    const gaps = computeGaps({
      businessHours: [
        bh({ startTime: '09:00:00', endTime: '12:00:00' }),
        bh({ startTime: '12:00:00', endTime: '18:00:00' }),
      ],
      appointments: [
        appt({ status: 'confirmed', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 10) }),
        appt({ id: 'a2', status: 'confirmed', startAt: mx(2026, 10, 1, 17), endAt: mx(2026, 10, 1, 18) }),
      ],
      range: OCT_1,
    });

    expect(gaps).toEqual<NoraGap[]>([
      {
        providerId: 'p1',
        dayKey: '2026-10-01',
        startAt: mx(2026, 10, 1, 10),
        endAt: mx(2026, 10, 1, 17),
        minutes: 420,
      },
    ]);
  });

  it('descarta el tramo por debajo del mínimo y respeta minGapMinutes explícito', () => {
    const input = {
      businessHours: [bh({ startTime: '09:00:00', endTime: '12:00:00' })],
      appointments: [
        appt({ status: 'confirmed', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 10) }),
        appt({ id: 'a2', status: 'confirmed', startAt: mx(2026, 10, 1, 10, 20), endAt: mx(2026, 10, 1, 12) }),
      ],
      range: OCT_1,
    };

    expect(NORA_MIN_GAP_MINUTES).toBe(30);
    // El tramo libre es de 20 min, por debajo del mínimo por defecto.
    expect(computeGaps(input)).toEqual([]);

    expect(computeGaps({ ...input, minGapMinutes: 10 })).toEqual<NoraGap[]>([
      {
        providerId: 'p1',
        dayKey: '2026-10-01',
        startAt: mx(2026, 10, 1, 10),
        endAt: mx(2026, 10, 1, 10, 20),
        minutes: 20,
      },
    ]);
  });

  it('recorta la cita que cruza el borde de la ventana y no reporta como libre el tiempo ocupado', () => {
    const gaps = computeGaps({
      businessHours: [bh({ startTime: '09:00:00', endTime: '13:00:00' })],
      appointments: [
        appt({ status: 'confirmed', startAt: mx(2026, 10, 1, 8), endAt: mx(2026, 10, 1, 10) }),
        appt({ id: 'a2', status: 'confirmed', startAt: mx(2026, 10, 1, 12), endAt: mx(2026, 10, 1, 14) }),
      ],
      range: OCT_1,
    });

    expect(gaps).toEqual<NoraGap[]>([
      {
        providerId: 'p1',
        dayKey: '2026-10-01',
        startAt: mx(2026, 10, 1, 10),
        endAt: mx(2026, 10, 1, 12),
        minutes: 120,
      },
    ]);
  });

  it('interpreta los límites de business_hours y el día clínico en America/Mexico_City', () => {
    // Ventana local 20:00–23:00 del jueves 1: en UTC cae ya el viernes 2.
    const gaps = computeGaps({
      businessHours: [bh({ startTime: '20:00:00', endTime: '23:00:00' })],
      appointments: [],
      range: OCT_1,
    });

    expect(gaps).toEqual<NoraGap[]>([
      {
        providerId: 'p1',
        dayKey: '2026-10-01',
        startAt: '2026-10-02T02:00:00.000Z',
        endAt: '2026-10-02T05:00:00.000Z',
        minutes: 180,
      },
    ]);
  });

  it('itera los días clínicos en un rango que cruza el límite de mes', () => {
    const gaps = computeGaps({
      businessHours: [
        bh({ dayOfWeek: 3, startTime: '09:00:00', endTime: '11:00:00' }), // mié 30 sep
        bh({ dayOfWeek: 4, startTime: '09:00:00', endTime: '11:00:00' }), // jue 1 oct
      ],
      appointments: [],
      range: rangeOf([2026, 9, 30], [2026, 10, 2]),
    });

    expect(gaps).toEqual<NoraGap[]>([
      {
        providerId: 'p1',
        dayKey: '2026-09-30',
        startAt: mx(2026, 9, 30, 9),
        endAt: mx(2026, 9, 30, 11),
        minutes: 120,
      },
      {
        providerId: 'p1',
        dayKey: '2026-10-01',
        startAt: mx(2026, 10, 1, 9),
        endAt: mx(2026, 10, 1, 11),
        minutes: 120,
      },
    ]);
  });

  it('sin business_hours no hay huecos, aunque existan citas', () => {
    const gaps = computeGaps({
      businessHours: [],
      appointments: [
        appt({ status: 'confirmed', startAt: mx(2026, 10, 1, 10), endAt: mx(2026, 10, 1, 11) }),
      ],
      range: OCT_1,
    });

    expect(gaps).toEqual([]);
  });

  it('ordena la salida por (providerId, startAt) sin depender del orden de lectura', () => {
    const gaps = computeGaps({
      businessHours: [
        bh({ providerId: 'p2', startTime: '09:00:00', endTime: '10:00:00' }),
        bh({ providerId: 'p1', startTime: '09:00:00', endTime: '11:00:00' }),
      ],
      appointments: [],
      range: OCT_1,
    });

    expect(gaps.map((gap) => [gap.providerId, gap.startAt, gap.minutes])).toEqual([
      ['p1', mx(2026, 10, 1, 9), 120],
      ['p2', mx(2026, 10, 1, 9), 60],
    ]);
  });

  it('es determinista: el mismo estado de agenda produce la misma lista', () => {
    const businessHours = [
      bh({ providerId: 'p1', startTime: '09:00:00', endTime: '12:00:00' }),
      bh({ providerId: 'p2', startTime: '09:00:00', endTime: '10:00:00' }),
    ];
    const appointments = [
      appt({ status: 'confirmed', startAt: mx(2026, 10, 1, 9, 30), endAt: mx(2026, 10, 1, 10) }),
    ];

    const first = computeGaps({ businessHours, appointments, range: OCT_1 });
    const second = computeGaps({
      businessHours: [...businessHours].reverse(),
      appointments: [...appointments].reverse(),
      range: OCT_1,
    });

    expect(second).toEqual(first);
  });
});
