/**
 * Aritmética de ocupación (issue #88, design.md §1.2).
 *
 * - Solape de intervalos semiabiertos `[start, end)` con prorrateo en los bordes.
 * - Capacidad = minutos de `business_hours` por día clínico del rango.
 * - Clamp defensivo `[0, 100]` (`NaN → 0`).
 *
 * Toda la aritmética de días asume el rango alineado a medianoches locales de
 * `America/Mexico_City` (UTC−6 fijo, sin horario de verano), igual que
 * `clinic-time.ts`. Por eso el `day_of_week` de cada día se obtiene con
 * `getUTCDay()` sobre la medianoche local: en UTC−6 esa medianoche cae a las
 * 06:00Z del mismo día, así que el día UTC coincide con el día clínico.
 */

import {
  OCCUPANCY_STATUSES,
  type ClinicRange,
  type MetricAppointment,
  type MetricBusinessHour,
} from './types';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ¿Los intervalos `[start, end)` de la cita y el rango se solapan? */
export function overlapsRange(
  appointment: Pick<MetricAppointment, 'startAt' | 'endAt'>,
  range: ClinicRange
): boolean {
  const start = Date.parse(appointment.startAt);
  const end = Date.parse(appointment.endAt);
  return start < range.end.getTime() && end > range.start.getTime();
}

/** Minutos de `[startAt, endAt)` dentro de `range`, con prorrateo en los bordes. */
export function overlapMinutes(
  startAt: string,
  endAt: string,
  range: ClinicRange
): number {
  const start = Math.max(Date.parse(startAt), range.start.getTime());
  const end = Math.min(Date.parse(endAt), range.end.getTime());
  const ms = end - start;
  return ms > 0 ? ms / MS_PER_MINUTE : 0;
}

function parseTimeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function businessHourMinutes(hour: MetricBusinessHour): number {
  return Math.max(0, parseTimeToMinutes(hour.endTime) - parseTimeToMinutes(hour.startTime));
}

/**
 * Minutos de `business_hours` del proveedor para los días clínicos de `range`.
 * `providerId === null` agrega todos los proveedores. Un día sin horario aporta 0.
 */
export function capacityMinutesForProvider(
  businessHours: MetricBusinessHour[],
  providerId: string | null,
  range: ClinicRange
): number {
  let total = 0;
  for (
    let cursor = range.start.getTime();
    cursor < range.end.getTime();
    cursor += MS_PER_DAY
  ) {
    const dayOfWeek = new Date(cursor).getUTCDay();
    for (const hour of businessHours) {
      if (providerId !== null && hour.providerId !== providerId) continue;
      if (hour.dayOfWeek !== dayOfWeek) continue;
      total += businessHourMinutes(hour);
    }
  }
  return total;
}

/** Acota el porcentaje a `[0, 100]`; `NaN`/infinito → 0. */
export function clampOccupancyPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export type OccupancyResult = {
  occupiedMinutes: number;
  capacityMinutes: number;
  occupancyPct: number;
};

/**
 * Minutos ocupados sobre minutos de capacidad del rango. Sin capacidad
 * medible la ocupación es `0` (nunca `NaN` ni negativa).
 */
export function computeOccupancy(input: {
  appointments: MetricAppointment[];
  businessHours: MetricBusinessHour[];
  providerId?: string;
  range: ClinicRange;
}): OccupancyResult {
  const { appointments, businessHours, providerId, range } = input;

  let occupiedMinutes = 0;
  for (const appointment of appointments) {
    if (providerId !== undefined && appointment.providerId !== providerId) continue;
    if (!(OCCUPANCY_STATUSES as readonly string[]).includes(appointment.status)) continue;
    if (!overlapsRange(appointment, range)) continue;
    occupiedMinutes += overlapMinutes(appointment.startAt, appointment.endAt, range);
  }

  const capacityMinutes = capacityMinutesForProvider(
    businessHours,
    providerId ?? null,
    range
  );
  const occupancyPct =
    capacityMinutes === 0
      ? 0
      : clampOccupancyPct((occupiedMinutes / capacityMinutes) * 100);

  return { occupiedMinutes, capacityMinutes, occupancyPct };
}
