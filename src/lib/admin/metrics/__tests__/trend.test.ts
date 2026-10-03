import { describe, expect, it } from 'vitest';
import {
  bucketRange,
  computeTrend,
  computeTrendDelta,
  previousRangeOf,
  type MetricsSeriesBucket,
} from '../trend';
import type {
  ClinicRange,
  MetricAppointment,
  MetricBusinessHour,
  ProviderRef,
} from '../types';
import type { AppointmentStatus } from '../../types';

const MX_OFFSET_HOURS = 6;

/** Instante UTC fijo a partir de una fecha/hora local de America/Mexico_City. */
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

function range(
  from: [number, number, number],
  to: [number, number, number]
): ClinicRange {
  return {
    start: new Date(mx(from[0], from[1], from[2])),
    end: new Date(mx(to[0], to[1], to[2])),
  };
}

// Mes clínico de octubre 2026: jueves 1 → domingo 1 de noviembre (31 días).
const OCT = range([2026, 10, 1], [2026, 11, 1]);
// Mes clínico de septiembre 2026 (30 días).
const SEP = range([2026, 9, 1], [2026, 10, 1]);
// Semana del lunes 28 de septiembre al lunes 5 de octubre (cruza el mes).
const WEEK = range([2026, 9, 28], [2026, 10, 5]);
// Semana anterior (lunes 21 → lunes 28 de septiembre).
const PREV_WEEK = range([2026, 9, 21], [2026, 9, 28]);
// Personalizado de 11 días.
const CUSTOM_11D = range([2026, 10, 5], [2026, 10, 16]);
const PREV_CUSTOM_11D = range([2026, 9, 24], [2026, 10, 5]);
// Marzo 2026 (31 días) para probar el mes anterior corto (febrero, 28 días).
const MARCH = range([2026, 3, 1], [2026, 4, 1]);

const PROVIDERS: ProviderRef[] = [
  { id: 'p1', name: 'Dra. Uno' },
  { id: 'p2', name: 'Dr. Dos' },
];

// Plantilla semanal: lunes 09:00–10:00 local (60 min por lunes del rango).
const MONDAY_HOURS: MetricBusinessHour[] = [
  {
    providerId: 'p1',
    dayOfWeek: 1,
    startTime: '09:00:00',
    endTime: '10:00:00',
  },
];

function appt(
  id: string,
  providerId: string,
  status: AppointmentStatus,
  startAt: string,
  endAt: string
): MetricAppointment {
  return { id, providerId, startAt, endAt, status };
}

function bucketOf(
  series: MetricsSeriesBucket[],
  dayKey: string
): MetricsSeriesBucket | undefined {
  return series.find((bucket) => bucket.dayKey === dayKey);
}

const CURRENT_APPTS: MetricAppointment[] = [
  // Lunes 5: 60 min ocupados sobre 60 de capacidad → 100 %.
  appt('ca1', 'p1', 'confirmed', mx(2026, 10, 5, 9), mx(2026, 10, 5, 10)),
  // Lunes 12: no_show no ocupa capacidad.
  appt('ca2', 'p1', 'no_show', mx(2026, 10, 12, 9), mx(2026, 10, 12, 10)),
  // Lunes 19: attended sí ocupa capacidad.
  appt('ca3', 'p1', 'attended', mx(2026, 10, 19, 9), mx(2026, 10, 19, 10)),
];

const PREVIOUS_APPTS: MetricAppointment[] = [
  appt('pa1', 'p1', 'confirmed', mx(2026, 9, 7, 9), mx(2026, 9, 7, 10)),
  appt('pa2', 'p1', 'attended', mx(2026, 9, 14, 9), mx(2026, 9, 14, 10)),
  appt('pa3', 'p1', 'attended', mx(2026, 9, 21, 9), mx(2026, 9, 21, 10)),
];

describe('previousRangeOf', () => {
  it('mes → mes calendario inmediatamente anterior', () => {
    const previous = previousRangeOf('month', OCT);

    expect(previous.start.toISOString()).toBe('2026-09-01T06:00:00.000Z');
    expect(previous.end.toISOString()).toBe('2026-10-01T06:00:00.000Z');
  });

  it('mes anterior de marzo es febrero, aunque tenga menos días', () => {
    const previous = previousRangeOf('month', MARCH);

    expect(previous.start.toISOString()).toBe('2026-02-01T06:00:00.000Z');
    expect(previous.end.toISOString()).toBe('2026-03-01T06:00:00.000Z');
    // Febrero 2026 tiene 28 días: la duración no se preserva (semántica
    // calendario, no "igual duración").
    expect(previous.end.getTime() - previous.start.getTime()).toBe(
      28 * 24 * 60 * 60 * 1000
    );
  });

  it('semana → los mismos 7 días inmediatamente anteriores (cruza el mes)', () => {
    const previous = previousRangeOf('week', WEEK);

    expect(previous.start.toISOString()).toBe('2026-09-21T06:00:00.000Z');
    expect(previous.end.toISOString()).toBe('2026-09-28T06:00:00.000Z');
    expect(previous.end.getTime() - previous.start.getTime()).toBe(
      WEEK.end.getTime() - WEEK.start.getTime()
    );
  });

  it('personalizado → ventana de igual duración que termina donde inicia el rango', () => {
    const previous = previousRangeOf('custom', CUSTOM_11D);

    expect(previous.start.toISOString()).toBe('2026-09-24T06:00:00.000Z');
    expect(previous.end.toISOString()).toBe('2026-10-05T06:00:00.000Z');
    expect(previous.end.getTime()).toBe(CUSTOM_11D.start.getTime());
    expect(previous.end.getTime() - previous.start.getTime()).toBe(
      CUSTOM_11D.end.getTime() - CUSTOM_11D.start.getTime()
    );
  });

  it('personalizado de un solo día → el día inmediatamente anterior', () => {
    const singleDay = range([2026, 10, 5], [2026, 10, 6]);
    const previous = previousRangeOf('custom', singleDay);

    expect(previous.start.toISOString()).toBe('2026-10-04T06:00:00.000Z');
    expect(previous.end.toISOString()).toBe('2026-10-05T06:00:00.000Z');
  });

  it('mes no alineado a los bordes del mes se ancla al mes clínico de su inicio', () => {
    // Caso borde declarado: un `month` desalineado no "resta la duración",
    // regresa el mes calendario anterior al mes en que inicia el rango.
    const misaligned = range([2026, 10, 10], [2026, 10, 20]);
    const previous = previousRangeOf('month', misaligned);

    expect(previous.start.toISOString()).toBe('2026-09-01T06:00:00.000Z');
    expect(previous.end.toISOString()).toBe('2026-10-01T06:00:00.000Z');
  });

  it('no desplaza los límites cerca de la medianoche UTC (UTC−6 fijo)', () => {
    const previous = previousRangeOf('month', OCT);

    for (const limit of [previous.start, previous.end]) {
      expect(limit.getUTCHours()).toBe(6);
      expect(limit.getUTCMinutes()).toBe(0);
      expect(limit.getUTCSeconds()).toBe(0);
    }
  });
});

describe('bucketRange', () => {
  it('rango de 31 días → un bucket diario por día clínico', () => {
    const buckets = bucketRange(OCT);

    expect(buckets).toHaveLength(31);
    expect(buckets[0].start.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(buckets[0].end.toISOString()).toBe('2026-10-02T06:00:00.000Z');
    expect(buckets[30].start.toISOString()).toBe('2026-10-31T06:00:00.000Z');
    expect(buckets[30].end.toISOString()).toBe(OCT.end.toISOString());
  });

  it('todos los buckets diarios están alineados a medianoche local (06:00Z)', () => {
    for (const bucket of bucketRange(OCT)) {
      expect(bucket.start.getUTCHours()).toBe(6);
      expect(bucket.start.getUTCSeconds()).toBe(0);
      expect(bucket.end.getTime() - bucket.start.getTime()).toBe(
        24 * 60 * 60 * 1000
      );
    }
  });

  it('rango de 32 días → buckets semanales, el último recortado al rango', () => {
    const buckets = bucketRange(range([2026, 9, 1], [2026, 10, 3]));

    expect(buckets).toHaveLength(5);
    expect(buckets[0].start.toISOString()).toBe('2026-09-01T06:00:00.000Z');
    expect(buckets[0].end.toISOString()).toBe('2026-09-08T06:00:00.000Z');
    expect(buckets[4].start.toISOString()).toBe('2026-09-29T06:00:00.000Z');
    expect(buckets[4].end.toISOString()).toBe('2026-10-03T06:00:00.000Z');
    // El último bucket es un remanente de 4 días, nunca desborda el rango.
    expect(buckets[4].end.getTime() - buckets[4].start.getTime()).toBe(
      4 * 24 * 60 * 60 * 1000
    );
  });

  it('rango de 45 días → 7 buckets semanales, el último recortado', () => {
    const buckets = bucketRange(range([2026, 9, 1], [2026, 10, 16]));

    expect(buckets).toHaveLength(7);
    expect(buckets[6].start.toISOString()).toBe('2026-10-13T06:00:00.000Z');
    expect(buckets[6].end.toISOString()).toBe('2026-10-16T06:00:00.000Z');
  });

  it('rango de longitud cero → sin buckets', () => {
    const empty: ClinicRange = { start: new Date(mx(2026, 10, 1)), end: new Date(mx(2026, 10, 1)) };
    expect(bucketRange(empty)).toEqual([]);
  });
});

describe('computeTrend', () => {
  it('compara mes contra mes anterior y bucketea la serie en memoria', () => {
    const trend = computeTrend({
      preset: 'month',
      range: OCT,
      previousRange: SEP,
      appointments: CURRENT_APPTS,
      previousAppointments: PREVIOUS_APPTS,
      businessHours: MONDAY_HOURS,
      providers: PROVIDERS,
    });

    // Actual: 120 min ocupados sobre 240 de capacidad (4 lunes) → 50 %.
    expect(trend.current.occupancyPct).toBeCloseTo(50, 5);
    expect(trend.current.capacityMinutes).toBe(240);
    expect(trend.current.noShowRatePct).toBeCloseTo(50, 5);
    expect(trend.current.totalAppointments).toBe(3);

    // Anterior: 180 min sobre 240 → 75 %; sin no_show.
    expect(trend.previous).not.toBeNull();
    expect(trend.previous?.occupancyPct).toBeCloseTo(75, 5);
    expect(trend.previous?.noShowRatePct).toBe(0);
    expect(trend.previous?.totalAppointments).toBe(3);

    expect(trend.previousRange.start.toISOString()).toBe(
      '2026-09-01T06:00:00.000Z'
    );
    expect(trend.previousRange.end.toISOString()).toBe(
      '2026-10-01T06:00:00.000Z'
    );

    // Serie: un bucket diario por día clínico, 31 en octubre.
    expect(trend.series).toHaveLength(31);
    expect(trend.series[0].label).toBe('1 oct');
    expect(trend.series[0].dayKey).toBe('2026-10-01');
    expect(trend.series[30].label).toBe('31 oct');
  });

  it('la serie incluye los días sin datos como bucket en cero', () => {
    const trend = computeTrend({
      preset: 'month',
      range: OCT,
      previousRange: SEP,
      appointments: CURRENT_APPTS,
      previousAppointments: PREVIOUS_APPTS,
      businessHours: MONDAY_HOURS,
      providers: PROVIDERS,
    });

    const withoutData = bucketOf(trend.series, '2026-10-01');
    expect(withoutData).toBeDefined();
    expect(withoutData?.metrics.occupancyPct).toBe(0);
    expect(withoutData?.metrics.totalAppointments).toBe(0);
    expect(withoutData?.metrics.noShowRatePct).toBeNull();
    expect(withoutData?.range.start.toISOString()).toBe(
      '2026-10-01T06:00:00.000Z'
    );
    expect(withoutData?.range.end.toISOString()).toBe(
      '2026-10-02T06:00:00.000Z'
    );
  });

  it('cada bucket calcula sus métricas solo con las citas que solapan ese día', () => {
    const trend = computeTrend({
      preset: 'month',
      range: OCT,
      previousRange: SEP,
      appointments: CURRENT_APPTS,
      previousAppointments: PREVIOUS_APPTS,
      businessHours: MONDAY_HOURS,
      providers: PROVIDERS,
    });

    const monday5 = bucketOf(trend.series, '2026-10-05');
    expect(monday5?.metrics.occupancyPct).toBe(100);
    expect(monday5?.metrics.totalAppointments).toBe(1);
    expect(monday5?.metrics.noShowRatePct).toBeNull();

    const monday12 = bucketOf(trend.series, '2026-10-12');
    expect(monday12?.metrics.occupancyPct).toBe(0);
    expect(monday12?.metrics.noShowRatePct).toBe(100);

    const monday19 = bucketOf(trend.series, '2026-10-19');
    expect(monday19?.metrics.occupancyPct).toBe(100);
    expect(monday19?.metrics.noShowRatePct).toBe(0);
  });

  it('ignora las citas fuera del rango actual (misma lectura cruda, sin fugas)', () => {
    const outside = appt(
      'ca4',
      'p1',
      'confirmed',
      mx(2026, 11, 3, 9),
      mx(2026, 11, 3, 10)
    );
    const trend = computeTrend({
      preset: 'month',
      range: OCT,
      previousRange: SEP,
      appointments: [...CURRENT_APPTS, outside],
      previousAppointments: PREVIOUS_APPTS,
      businessHours: MONDAY_HOURS,
      providers: PROVIDERS,
    });

    expect(trend.current.totalAppointments).toBe(3);
    expect(bucketOf(trend.series, '2026-11-03')).toBeUndefined();
  });

  it('semana contra semana anterior filtra por el rango anterior indicado', () => {
    const inside = appt(
      'pa4',
      'p1',
      'confirmed',
      mx(2026, 9, 23, 9),
      mx(2026, 9, 23, 10)
    );
    const outside = appt(
      'pa5',
      'p1',
      'confirmed',
      mx(2026, 9, 2, 9),
      mx(2026, 9, 2, 10)
    );
    const trend = computeTrend({
      preset: 'week',
      range: WEEK,
      previousRange: PREV_WEEK,
      appointments: [
        appt('wa1', 'p1', 'confirmed', mx(2026, 9, 29, 9), mx(2026, 9, 29, 10)),
      ],
      previousAppointments: [inside, outside],
      businessHours: MONDAY_HOURS,
      providers: PROVIDERS,
    });

    expect(trend.series).toHaveLength(7);
    expect(trend.previous?.totalAppointments).toBe(1);
  });

  it('personalizado compara contra la ventana anterior de igual duración', () => {
    const trend = computeTrend({
      preset: 'custom',
      range: CUSTOM_11D,
      previousRange: PREV_CUSTOM_11D,
      appointments: [
        appt('cu1', 'p1', 'confirmed', mx(2026, 10, 5, 9), mx(2026, 10, 5, 10)),
      ],
      previousAppointments: [
        appt('cu2', 'p1', 'confirmed', mx(2026, 9, 28, 9), mx(2026, 9, 28, 10)),
      ],
      businessHours: MONDAY_HOURS,
      providers: PROVIDERS,
    });

    expect(trend.previousRange.end.toISOString()).toBe(
      CUSTOM_11D.start.toISOString()
    );
    expect(trend.previous?.totalAppointments).toBe(1);
    // 11 días → buckets diarios.
    expect(trend.series).toHaveLength(11);
  });

  it('rango mayor a 31 días usa buckets semanales rotulados', () => {
    const longRange = range([2026, 9, 1], [2026, 10, 16]);
    const trend = computeTrend({
      preset: 'custom',
      range: longRange,
      previousRange: previousRangeOf('custom', longRange),
      appointments: [],
      previousAppointments: [],
      businessHours: MONDAY_HOURS,
      providers: PROVIDERS,
    });

    expect(trend.series).toHaveLength(7);
    expect(trend.series[0].label).toBe('1 sep – 7 sep');
    expect(trend.series[6].label).toBe('13 oct – 15 oct');
  });

  it('periodo anterior sin citas ni capacidad → previous null (nunca una caída)', () => {
    const trend = computeTrend({
      preset: 'month',
      range: OCT,
      previousRange: SEP,
      appointments: CURRENT_APPTS,
      previousAppointments: [],
      businessHours: [],
      providers: PROVIDERS,
    });

    expect(trend.current.totalAppointments).toBe(3);
    expect(trend.previous).toBeNull();
  });

  it('periodo anterior con capacidad pero sin citas no es null (ocupación 0 real)', () => {
    const trend = computeTrend({
      preset: 'month',
      range: OCT,
      previousRange: SEP,
      appointments: CURRENT_APPTS,
      previousAppointments: [],
      businessHours: MONDAY_HOURS,
      providers: PROVIDERS,
    });

    expect(trend.previous).not.toBeNull();
    expect(trend.previous?.occupancyPct).toBe(0);
    expect(trend.previous?.capacityMinutes).toBe(240);
    expect(trend.previous?.noShowRatePct).toBeNull();
  });

  it('cita que termina exactamente al inicio del rango no cuenta en el actual', () => {
    const boundary = appt(
      'cb1',
      'p1',
      'confirmed',
      mx(2026, 9, 30, 23),
      mx(2026, 10, 1, 0) // == OCT.start
    );
    const trend = computeTrend({
      preset: 'month',
      range: OCT,
      previousRange: SEP,
      appointments: [boundary],
      previousAppointments: [],
      businessHours: [],
      providers: PROVIDERS,
    });

    expect(trend.current.totalAppointments).toBe(0);
  });
});

describe('computeTrendDelta', () => {
  const current = computeTrend({
    preset: 'month',
    range: OCT,
    previousRange: SEP,
    appointments: CURRENT_APPTS,
    previousAppointments: PREVIOUS_APPTS,
    businessHours: MONDAY_HOURS,
    providers: PROVIDERS,
  }).current;
  const previous = computeTrend({
    preset: 'month',
    range: OCT,
    previousRange: SEP,
    appointments: CURRENT_APPTS,
    previousAppointments: PREVIOUS_APPTS,
    businessHours: MONDAY_HOURS,
    providers: PROVIDERS,
  }).previous;

  it('calcula diferencias en puntos porcentuales y totales', () => {
    const delta = computeTrendDelta(current, previous);

    expect(delta.occupancyPct).toBeCloseTo(-25, 5); // 50 % − 75 %
    expect(delta.noShowRatePct).toBeCloseTo(50, 5); // 50 % − 0 %
    expect(delta.totalAppointments).toBe(0);
    expect(delta.noShowCount).toBe(1);
    expect(delta.cancelledCount).toBe(0);
  });

  it('sin periodo anterior (previous null) todas las variaciones son null', () => {
    const delta = computeTrendDelta(current, null);

    expect(delta).toEqual({
      occupancyPct: null,
      noShowRatePct: null,
      totalAppointments: null,
      noShowCount: null,
      cancelledCount: null,
    });
  });

  it('no-show null en cualquiera de los periodos → sin variación de no-show', () => {
    const noShowNullPrevious = { ...previous!, noShowRatePct: null };
    const delta = computeTrendDelta(current, noShowNullPrevious);

    expect(delta.noShowRatePct).toBeNull();
    expect(delta.occupancyPct).toBeCloseTo(-25, 5);
  });

  it('periodos idénticos → variaciones en cero, no null', () => {
    const delta = computeTrendDelta(current, current);

    expect(delta.occupancyPct).toBe(0);
    expect(delta.noShowRatePct).toBe(0);
    expect(delta.totalAppointments).toBe(0);
  });
});
