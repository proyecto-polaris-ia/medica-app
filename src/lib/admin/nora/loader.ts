/**
 * Loader de la vista Nora (change `nora-agenda-productiva`, Fase 1 y Fase 2,
 * design.md §4). Adaptador delgado sobre Supabase con el **mismo contrato de
 * degradación** que `getDashboardMetrics` (`isSupabaseConfigured` /
 * `isConfiguredButUnavailable`); nunca lanza hacia el server component.
 *
 * Reutiliza `resolveRange` y `computeMetrics` del motor de `dashboard-metrics`
 * (no reimplementa ocupación ni no-show) y aporta el delta de la capacidad:
 * los huecos (`computeGaps`) y las sugerencias de reacomodo
 * (`computeSuggestions`).
 *
 * Fase 2: las sugerencias nuevas se persisten **solo** como `proposed`, de
 * forma idempotente por la clave `(appointment_id, suggested_start_at)`, y se
 * leen las `proposed` existentes. El loader NUNCA decide ni aplica: no mueve
 * citas ni cambia el estado de una sugerencia ya decidida. Las lecturas se
 * resuelven en un `Promise.all`, sin N+1.
 */

import { getSupabaseAdmin } from '@/lib/supabase/server';
import { isSupabaseConfigured as hasSupabaseConfig } from '@/lib/wcc-client';
import { computeMetrics } from '../metrics/aggregate';
import { resolveRange } from '../metrics/range';
import type {
  ClinicRange,
  MetricAppointment,
  MetricBusinessHour,
  MetricsPreset,
  MetricsResult,
  ProviderRef,
} from '../metrics/types';
import { CLINIC_TZ } from '../timezone';
import type { AppointmentStatus } from '../types';
import { computeGaps } from './gaps';
import { computeSuggestions } from './suggestions';
import {
  isNoraMovableStatus,
  type NoraGap,
  type NoraMovableAppointment,
  type NoraSuggestionReason,
  type NoraSuggestionRecord,
  type NoraSuggestionStatus,
} from './types';

const APPOINTMENT_COLUMNS =
  'id, service_id, provider_id, start_at, end_at, status';
const BUSINESS_HOUR_COLUMNS =
  'id, provider_id, day_of_week, start_time, end_time';
const PROVIDER_COLUMNS = 'id, name';
const SERVICE_COLUMNS = 'id, duration_minutes';
const SUGGESTION_COLUMNS =
  'id, appointment_id, provider_id, original_start_at, original_end_at, suggested_start_at, suggested_end_at, status, reason_code, created_at, decided_by, decided_at';

export type NoraView = {
  isSupabaseConfigured: boolean;
  isConfiguredButUnavailable: boolean;
  generatedAt: string;
  preset: MetricsPreset;
  rangeLabel: string;
  range: { startAt: string; endAt: string };
  /** Reuso del motor de #88; `null` = rango sin datos (estado vacío). */
  metrics: MetricsResult | null;
  /** Huecos improductivos del rango; vacío = sin huecos. */
  gaps: NoraGap[];
  /**
   * Sugerencias persistidas no decididas (`proposed`); vacío = sin sugerencias.
   * Opcional para no romper consumidores construidos antes de la Fase 2.
   */
  suggestions?: NoraSuggestionRecord[];
};

type Row = Record<string, unknown>;
type Result = { data?: Row[] | null; error?: { message?: string } | null };
type Query = PromiseLike<Result> & {
  select: (...args: unknown[]) => Query;
  lt: (...args: unknown[]) => Query;
  gt: (...args: unknown[]) => Query;
  in: (...args: unknown[]) => Query;
};
type WriteQuery = PromiseLike<Result> & {
  select: (...args: unknown[]) => WriteQuery;
};
type Db = {
  from: (table: string) => Query;
};

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

type AppointmentRow = {
  id: string;
  serviceId: string | null;
  providerId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
};

/** Normaliza un `timestamptz` de PostgREST a ISO canónico (`...Z`). */
function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}

function mapAppointment(row: Row): AppointmentRow {
  return {
    id: row.id as string,
    serviceId: (row.service_id as string | null) ?? null,
    providerId: row.provider_id as string,
    startAt: iso(row.start_at),
    endAt: iso(row.end_at),
    status: row.status as AppointmentStatus,
  };
}

function metricOf(appointment: AppointmentRow): MetricAppointment {
  return {
    id: appointment.id,
    providerId: appointment.providerId,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    status: appointment.status,
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

function mapSuggestion(row: Row): NoraSuggestionRecord {
  return {
    id: row.id as string,
    appointmentId: row.appointment_id as string,
    providerId: row.provider_id as string,
    originalStartAt: iso(row.original_start_at),
    originalEndAt: iso(row.original_end_at),
    suggestedStartAt: iso(row.suggested_start_at),
    suggestedEndAt: iso(row.suggested_end_at),
    reasonCode: row.reason_code as NoraSuggestionReason,
    status: row.status as NoraSuggestionStatus,
    createdAt: iso(row.created_at),
    decidedBy: (row.decided_by as string | null) ?? null,
    decidedAt: row.decided_at ? iso(row.decided_at) : null,
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

/** Duración del servicio por id; ausente o inválida = cita no movible. */
function serviceDurations(rows: Row[]): Map<string, number> {
  const durations = new Map<string, number>();
  for (const row of rows) {
    const minutes = Number(row.duration_minutes);
    if (row.id && Number.isFinite(minutes) && minutes > 0) {
      durations.set(row.id as string, minutes);
    }
  }
  return durations;
}

function movableAppointments(
  appointments: AppointmentRow[],
  durations: Map<string, number>
): NoraMovableAppointment[] {
  const movable: NoraMovableAppointment[] = [];
  for (const appointment of appointments) {
    if (!isNoraMovableStatus(appointment.status)) continue;
    if (!appointment.serviceId) continue;
    const serviceDurationMinutes = durations.get(appointment.serviceId);
    if (!serviceDurationMinutes) continue;
    movable.push({
      id: appointment.id,
      providerId: appointment.providerId,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status,
      serviceDurationMinutes,
    });
  }
  return movable;
}

function suggestionKey(appointmentId: string, suggestedStartAt: string): string {
  return `${appointmentId}::${suggestedStartAt}`;
}

/**
 * Persiste las sugerencias nuevas como `proposed` (best-effort idempotente:
 * pre-check por `(appointment_id, suggested_start_at)`). Un fallo de escritura
 * no degrada la lectura: la vista sigue mostrando lo persistido.
 */
async function persistNewSuggestions(
  d: Db,
  generated: ReturnType<typeof computeSuggestions>,
  appointmentById: Map<string, AppointmentRow>,
  existingKeys: Set<string>
): Promise<NoraSuggestionRecord[]> {
  const payload = generated
    .filter(
      (suggestion) =>
        !existingKeys.has(
          suggestionKey(suggestion.appointmentId, suggestion.suggestedStartAt)
        )
    )
    .map((suggestion) => {
      const appointment = appointmentById.get(suggestion.appointmentId);
      return {
        appointment_id: suggestion.appointmentId,
        provider_id: suggestion.providerId,
        original_start_at: appointment?.startAt ?? suggestion.suggestedStartAt,
        original_end_at: appointment?.endAt ?? suggestion.suggestedEndAt,
        suggested_start_at: suggestion.suggestedStartAt,
        suggested_end_at: suggestion.suggestedEndAt,
        status: 'proposed',
        reason_code: suggestion.reasonCode,
      };
    });

  if (payload.length === 0) return [];

  try {
    const query = d.from('nora_reschedule_suggestions') as unknown as {
      insert: (values: unknown) => WriteQuery;
    };
    const result = (await query
      .insert(payload)
      .select(SUGGESTION_COLUMNS)) as Result;
    if (result.error) return [];
    return (result.data ?? []).map(mapSuggestion);
  } catch {
    // Persistencia best-effort: nunca rompe la lectura del panel.
    return [];
  }
}

/** Orden determinista independiente del orden de lectura de la base. */
function sortSuggestions(
  suggestions: NoraSuggestionRecord[]
): NoraSuggestionRecord[] {
  return [...suggestions].sort(
    (a, b) =>
      a.providerId.localeCompare(b.providerId) ||
      a.suggestedStartAt.localeCompare(b.suggestedStartAt) ||
      a.appointmentId.localeCompare(b.appointmentId)
  );
}

export async function getNoraView(
  params: { preset?: string; from?: string; to?: string },
  now: Date = new Date()
): Promise<NoraView> {
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
      gaps: [],
      suggestions: [],
    };
  }

  try {
    const d = getSupabaseAdmin() as unknown as Db;
    const [appointmentRows, businessHourRows, serviceRows] = await Promise.all([
      rows(
        d
          .from('appointments')
          .select(APPOINTMENT_COLUMNS)
          .lt('start_at', base.range.endAt)
          .gt('end_at', base.range.startAt)
      ),
      rows(d.from('business_hours').select(BUSINESS_HOUR_COLUMNS)),
      rows(d.from('services').select(SERVICE_COLUMNS)),
    ]);

    const appointments = appointmentRows.map(mapAppointment);
    const businessHours = businessHourRows.map(mapBusinessHour);
    const durations = serviceDurations(serviceRows);
    const providers = await providersFor(d, [
      ...appointments.map((appointment) => appointment.providerId),
      ...businessHours.map((hour) => hour.providerId),
    ]);

    // Rango sin datos: estado vacío, no ceros engañosos ni huecos inventados.
    if (appointments.length === 0 && businessHours.length === 0) {
      return {
        ...base,
        isSupabaseConfigured: true,
        isConfiguredButUnavailable: false,
        metrics: null,
        gaps: [],
        suggestions: [],
      };
    }

    const gaps = computeGaps({
      businessHours,
      appointments: appointments.map(metricOf),
      range: resolved.range,
    });

    const appointmentIds = [...new Set(appointments.map((a) => a.id))].sort();
    const existingRows =
      appointmentIds.length === 0
        ? []
        : await rows(
            d
              .from('nora_reschedule_suggestions')
              .select(SUGGESTION_COLUMNS)
              .in('appointment_id', appointmentIds)
          );
    const existing = existingRows.map(mapSuggestion);
    const existingKeys = new Set(
      existing.map((suggestion) =>
        suggestionKey(suggestion.appointmentId, suggestion.suggestedStartAt)
      )
    );

    const generated = computeSuggestions({
      gaps,
      movableAppointments: movableAppointments(appointments, durations),
      activeAppointments: appointments.map(metricOf),
    });

    const appointmentById = new Map(appointments.map((a) => [a.id, a]));
    const inserted = await persistNewSuggestions(
      d,
      generated,
      appointmentById,
      existingKeys
    );

    const proposed = [...existing, ...inserted].filter(
      (suggestion) => suggestion.status === 'proposed'
    );

    return {
      ...base,
      isSupabaseConfigured: true,
      isConfiguredButUnavailable: false,
      metrics: computeMetrics({
        appointments: appointments.map(metricOf),
        businessHours,
        providers,
        range: resolved.range,
      }),
      gaps,
      suggestions: sortSuggestions(proposed),
    };
  } catch {
    return {
      ...base,
      isSupabaseConfigured: true,
      isConfiguredButUnavailable: true,
      metrics: null,
      gaps: [],
      suggestions: [],
    };
  }
}
