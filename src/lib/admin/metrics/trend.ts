/**
 * Tendencia contra el periodo anterior y serie de evolución (issue #88,
 * design.md Fase 3 / decisión 20). Todo es puro: recibe las mismas filas
 * crudas que consume la Fase 1 y resuelve periodo anterior, comparación y
 * buckets en memoria, sin I/O ni reloj implícito.
 *
 * Zona: `America/Mexico_City` vía `../timezone`. MX no observa horario de
 * verano (UTC−6 fijo), así que desplazar días con 24 h es exacto, igual que en
 * `range.ts` / `clinic-time.ts`. Los rangos llegan alineados a días clínicos
 * (medianoche local = 06:00Z).
 */

import { CLINIC_TZ, clinicDayKey, clinicMonthRangeUtc } from '../timezone';
import { computeMetrics } from './aggregate';
import { overlapsRange } from './occupancy';
import type {
  ClinicRange,
  MetricAppointment,
  MetricBusinessHour,
  MetricsPreset,
  MetricsResult,
  ProviderRef,
} from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
/** La serie es diaria hasta 31 días; más larga, semanal. */
const DAILY_BUCKET_MAX_DAYS = 31;

const dayMonthFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: CLINIC_TZ,
  day: 'numeric',
  month: 'short',
});

/**
 * Periodo inmediatamente anterior a `range` (design.md Fase 3):
 * - `month` → mes calendario anterior al mes clínico en que inicia el rango.
 * - `week` → los mismos días desplazados 7 días hacia atrás.
 * - `custom` → ventana de igual duración que termina donde inicia el rango.
 *
 * Casos borde declarados: un `month` desalineado a los bordes del mes se ancla
 * igual al mes clínico de `range.start` (no resta la duración); un `week`
 * desalineado produce una ventana de 7 días que termina donde inicia el rango
 * (para una semana alineada es idéntica a desplazar los mismos días 7 hacia
 * atrás).
 */
export function previousRangeOf(
  preset: MetricsPreset,
  range: ClinicRange
): ClinicRange {
  if (preset === 'month') {
    const [year, month] = clinicDayKey(range.start.toISOString())
      .split('-')
      .map(Number);
    const previousYear = month === 1 ? year - 1 : year;
    const previousMonth = month === 1 ? 12 : month - 1;
    const { startAt, endAt } = clinicMonthRangeUtc(previousYear, previousMonth);
    return { start: new Date(startAt), end: new Date(endAt) };
  }

  const span =
    preset === 'week' ? MS_PER_WEEK : range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - span),
    end: new Date(range.start.getTime()),
  };
}

function formatBucketLabel(bucket: ClinicRange): string {
  const startLabel = dayMonthFormatter.format(bucket.start);
  // Un bucket de un solo día se rotula con una fecha; el resto, con el rango.
  if (bucket.end.getTime() - bucket.start.getTime() <= MS_PER_DAY) {
    return startLabel;
  }
  return `${startLabel} – ${dayMonthFormatter.format(
    new Date(bucket.end.getTime() - 1)
  )}`;
}

/**
 * Sub-rangos alineados a días clínicos: diarios si el rango mide ≤ 31 días,
 * semanales (el último recortado al rango) si es mayor. Un rango de longitud
 * cero no produce buckets.
 */
export function bucketRange(range: ClinicRange): ClinicRange[] {
  const totalMs = range.end.getTime() - range.start.getTime();
  if (totalMs <= 0) return [];

  const step = totalMs <= DAILY_BUCKET_MAX_DAYS * MS_PER_DAY ? MS_PER_DAY : MS_PER_WEEK;
  const buckets: ClinicRange[] = [];
  for (
    let cursor = range.start.getTime();
    cursor < range.end.getTime();
    cursor += step
  ) {
    buckets.push({
      start: new Date(cursor),
      end: new Date(Math.min(cursor + step, range.end.getTime())),
    });
  }
  return buckets;
}

export type MetricsSeriesBucket = {
  range: ClinicRange;
  /** Día clínico `YYYY-MM-DD` del inicio del bucket. */
  dayKey: string;
  /** Rótulo legible es-MX: "5 oct" (diario) o "28 sep – 4 oct" (semanal). */
  label: string;
  metrics: MetricsResult;
};

export type MetricsTrend = {
  current: MetricsResult;
  /** `null` = periodo anterior sin citas ni capacidad (sin comparación). */
  previous: MetricsResult | null;
  previousRange: ClinicRange;
  series: MetricsSeriesBucket[];
};

/**
 * Resuelve la tendencia completa en memoria: métricas del rango actual, del
 * periodo anterior (o `null` cuando no hay citas ni capacidad que comparar) y
 * una serie de buckets que reutiliza `computeMetrics` sobre el mismo conjunto
 * de citas ya cargado. La variación se calcula aparte con
 * `computeTrendDelta` (el panel solo la formatea).
 *
 * `preset` forma parte de la firma del diseño; el bucketing depende de la
 * duración del rango y el periodo anterior llega ya resuelto en
 * `previousRange`.
 */
export function computeTrend(input: {
  preset: MetricsPreset;
  range: ClinicRange;
  previousRange: ClinicRange;
  appointments: MetricAppointment[];
  previousAppointments: MetricAppointment[];
  businessHours: MetricBusinessHour[];
  providers: ProviderRef[];
}): MetricsTrend {
  const {
    range,
    previousRange,
    appointments,
    previousAppointments,
    businessHours,
    providers,
  } = input;

  const current = computeMetrics({
    appointments,
    businessHours,
    providers,
    range,
  });
  const previousMetrics = computeMetrics({
    appointments: previousAppointments,
    businessHours,
    providers,
    range: previousRange,
  });

  const previousHasAppointments = previousAppointments.some((appointment) =>
    overlapsRange(appointment, previousRange)
  );
  const previous =
    previousHasAppointments || previousMetrics.capacityMinutes > 0
      ? previousMetrics
      : null;

  const series = bucketRange(range).map((bucket) => ({
    range: bucket,
    dayKey: clinicDayKey(bucket.start.toISOString()),
    label: formatBucketLabel(bucket),
    metrics: computeMetrics({
      appointments,
      businessHours,
      providers,
      range: bucket,
    }),
  }));

  return { current, previous, previousRange, series };
}

export type TrendDelta = {
  /** Diferencia en puntos porcentuales; `null` si no hay comparación. */
  occupancyPct: number | null;
  noShowRatePct: number | null;
  totalAppointments: number | null;
  noShowCount: number | null;
  cancelledCount: number | null;
};

function differenceOrNull(
  current: number | null,
  previous: number | null
): number | null {
  return current === null || previous === null ? null : current - previous;
}

/**
 * Variación `actual − anterior`, lista para formatear. `null` cuando no hay
 * periodo anterior o cuando el indicador no es numérico en ambos periodos
 * (`noShowRatePct` puede ser `null`).
 */
export function computeTrendDelta(
  current: MetricsResult,
  previous: MetricsResult | null
): TrendDelta {
  if (previous === null) {
    return {
      occupancyPct: null,
      noShowRatePct: null,
      totalAppointments: null,
      noShowCount: null,
      cancelledCount: null,
    };
  }

  return {
    occupancyPct: current.occupancyPct - previous.occupancyPct,
    noShowRatePct: differenceOrNull(current.noShowRatePct, previous.noShowRatePct),
    totalAppointments: current.totalAppointments - previous.totalAppointments,
    noShowCount: current.noShowCount - previous.noShowCount,
    cancelledCount: current.cancelledCount - previous.cancelledCount,
  };
}
