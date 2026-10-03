/**
 * Loader de métricas de agenda para el dashboard (issue #88, design.md §2.1).
 *
 * Adaptador delgado sobre Supabase: hace **dos lecturas base** (citas que
 * solapan el rango y `business_hours`), un join manual por lote a `providers`
 * para resolver nombres, y delega toda la aritmética a la lib pura
 * `computeMetrics`. Nunca lanza hacia el server component: degrada con el
 * contrato `isSupabaseConfigured` / `isConfiguredButUnavailable`.
 */

import { getSupabaseAdmin } from '@/lib/supabase/server';
import { isSupabaseConfigured as hasSupabaseConfig } from '@/lib/wcc-client';
import type { AppointmentStatus } from '../types';
import { CLINIC_TZ } from '../timezone';
import { computeMetrics } from './aggregate';
import { resolveRange } from './range';
import type {
  ClinicRange,
  MetricAppointment,
  MetricBusinessHour,
  MetricsPreset,
  MetricsResult,
  ProviderRef,
} from './types';

const APPOINTMENT_COLUMNS = 'id, provider_id, start_at, end_at, status';
const BUSINESS_HOUR_COLUMNS =
  'id, provider_id, day_of_week, start_time, end_time';
const PROVIDER_COLUMNS = 'id, name';

export type DashboardMetricsView = {
  isSupabaseConfigured: boolean;
  isConfiguredButUnavailable: boolean;
  generatedAt: string;
  preset: MetricsPreset;
  rangeLabel: string;
  range: { startAt: string; endAt: string };
  metrics: MetricsResult | null; // null = rango sin datos (estado vacío)
};

type Row = Record<string, unknown>;
type Result = { data?: Row[] | null; error?: { message?: string } | null };
type Query = PromiseLike<Result> & {
  select: (...args: unknown[]) => Query;
  lt: (...args: unknown[]) => Query;
  gt: (...args: unknown[]) => Query;
  in: (...args: unknown[]) => Query;
};
type Db = { from: (table: string) => Query };

const dayFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: CLINIC_TZ,
  day: 'numeric',
});
const monthFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: CLINIC_TZ,
  month: 'long',
});
const yearFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: CLINIC_TZ,
  year: 'numeric',
});
const monthKeyFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: CLINIC_TZ,
  year: 'numeric',
  month: 'numeric',
});
const fullDateFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: CLINIC_TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Etiqueta legible del rango, con el último día inclusivo (fin semiabierto). */
function formatRangeLabel(range: ClinicRange): string {
  const lastInstant = new Date(range.end.getTime() - 1);
  const startMonth = monthKeyFormatter.format(range.start);
  const endMonth = monthKeyFormatter.format(lastInstant);
  if (startMonth === endMonth) {
    return `${dayFormatter.format(range.start)} – ${dayFormatter.format(
      lastInstant
    )} de ${monthFormatter.format(lastInstant)}, ${yearFormatter.format(
      lastInstant
    )}`;
  }
  return `${fullDateFormatter.format(range.start)} – ${fullDateFormatter.format(
    lastInstant
  )}`;
}

function mapAppointment(row: Row): MetricAppointment {
  return {
    id: row.id as string,
    providerId: row.provider_id as string,
    startAt: row.start_at as string,
    endAt: row.end_at as string,
    status: row.status as AppointmentStatus,
  };
}

function mapBusinessHour(row: Row): MetricBusinessHour {
  return {
    providerId: row.provider_id as string,
    dayOfWeek: Number(row.day_of_week),
    startTime: row.start_time as string,
    endTime: row.end_time as string,
  };
}

async function rows(query: Query): Promise<Row[]> {
  const result = (await query) as Result;
  if (result.error) {
    throw new Error(result.error.message ?? 'Supabase query failed');
  }
  return result.data ?? [];
}

/** Join manual por lote: una sola lectura de `providers` con la unión de ids. */
async function providersFor(d: Db, ids: string[]): Promise<ProviderRef[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const data = await rows(
    d.from('providers').select(PROVIDER_COLUMNS).in('id', unique)
  );
  return data.map((row) => ({
    id: row.id as string,
    name: (row.name as string | null) ?? (row.id as string),
  }));
}

export async function getDashboardMetrics(
  params: { preset?: string; from?: string; to?: string },
  now: Date = new Date()
): Promise<DashboardMetricsView> {
  const resolved = resolveRange(params ?? {}, now);
  const base = {
    generatedAt: now.toISOString(),
    preset: resolved.preset,
    range: {
      startAt: resolved.range.start.toISOString(),
      endAt: resolved.range.end.toISOString(),
    },
    rangeLabel: formatRangeLabel(resolved.range),
  };

  if (!hasSupabaseConfig()) {
    return {
      ...base,
      isSupabaseConfigured: false,
      isConfiguredButUnavailable: false,
      metrics: null,
    };
  }

  try {
    const d = getSupabaseAdmin() as unknown as Db;
    const [appointmentRows, businessHourRows] = await Promise.all([
      rows(
        d
          .from('appointments')
          .select(APPOINTMENT_COLUMNS)
          .lt('start_at', base.range.endAt)
          .gt('end_at', base.range.startAt)
      ),
      rows(d.from('business_hours').select(BUSINESS_HOUR_COLUMNS)),
    ]);

    const appointments = appointmentRows.map(mapAppointment);
    const businessHours = businessHourRows.map(mapBusinessHour);
    const providers = await providersFor(d, [
      ...appointments.map((appointment) => appointment.providerId),
      ...businessHours.map((hour) => hour.providerId),
    ]);

    const metrics =
      appointments.length === 0 && businessHours.length === 0
        ? null
        : computeMetrics({
            appointments,
            businessHours,
            providers,
            range: resolved.range,
          });

    return {
      ...base,
      isSupabaseConfigured: true,
      isConfiguredButUnavailable: false,
      metrics,
    };
  } catch {
    return {
      ...base,
      isSupabaseConfigured: true,
      isConfiguredButUnavailable: true,
      metrics: null,
    };
  }
}
