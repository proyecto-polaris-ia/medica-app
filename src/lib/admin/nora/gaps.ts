/**
 * Detección determinista de huecos improductivos (change
 * `nora-agenda-productiva`, Fase 1, design.md §1).
 *
 * Semántica alineada con `booking_free_slots` (`0004_agenda_functions.sql`):
 * una cita ocupa salvo cuando su `status` es `cancelled` o `rescheduled`.
 * Ventanas = `business_hours` del proveedor para el día clínico, unidas antes
 * de restar; huecos = ventanas − citas activas recortadas al borde.
 *
 * Puro y determinista: sin I/O, sin `Date.now()`, sin dependencia del orden de
 * lectura. Reutiliza `overlapsRange` y la aritmética de días clínicos del motor
 * de métricas (`dashboard-metrics`); no la reimplementa.
 */

import { overlapsRange } from '../metrics/occupancy';
import type { ClinicRange, MetricAppointment } from '../metrics/types';
import { clinicDayKey } from '../timezone';
import { NORA_MIN_GAP_MINUTES, type ComputeGapsInput, type NoraGap } from './types';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Estados que NO ocupan agenda (misma semántica que `booking_free_slots`). */
const NON_OCCUPYING_STATUSES = new Set<string>(['cancelled', 'rescheduled']);

type Interval = { start: number; end: number };

function parseTimeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function sortIntervals(intervals: Interval[]): Interval[] {
  return [...intervals].sort(
    (a, b) => a.start - b.start || a.end - b.end
  );
}

/** Fusiona intervalos que se solapan o se tocan (`next.start <= current.end`). */
function unionIntervals(intervals: Interval[]): Interval[] {
  const ordered = sortIntervals(intervals);
  const union: Interval[] = [];
  for (const interval of ordered) {
    const last = union[union.length - 1];
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end;
    } else {
      union.push({ ...interval });
    }
  }
  return union;
}

/** Resta los intervalos ocupados ya recortados a la ventana. */
function subtract(window: Interval, occupied: Interval[]): Interval[] {
  const free: Interval[] = [];
  let cursor = window.start;
  for (const busy of sortIntervals(occupied)) {
    if (busy.start > cursor) free.push({ start: cursor, end: busy.start });
    if (busy.end > cursor) cursor = busy.end;
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}

/**
 * Huecos de los `business_hours` de cada proveedor para los días clínicos del
 * rango, menos las citas activas, filtrados por `minGapMinutes` (default
 * `NORA_MIN_GAP_MINUTES`) y ordenados por `(providerId, startAt)`.
 */
export function computeGaps(input: ComputeGapsInput): NoraGap[] {
  const {
    businessHours,
    appointments,
    range,
    minGapMinutes = NORA_MIN_GAP_MINUTES,
  } = input;

  const activeAppointments = appointments.filter(
    (appointment) => !NON_OCCUPYING_STATUSES.has(appointment.status)
  );

  // Orden de proveedores fijo e independiente del orden de lectura.
  const providerIds = [...new Set(businessHours.map((hour) => hour.providerId))].sort();

  const gaps: NoraGap[] = [];

  const pushGap = (providerId: string, interval: Interval) => {
    const minutes = (interval.end - interval.start) / MS_PER_MINUTE;
    if (minutes < minGapMinutes) return;
    const startAt = new Date(interval.start).toISOString();
    gaps.push({
      providerId,
      dayKey: clinicDayKey(startAt),
      startAt,
      endAt: new Date(interval.end).toISOString(),
      minutes,
    });
  };

  for (const providerId of providerIds) {
    const providerHours = businessHours.filter(
      (hour) => hour.providerId === providerId
    );
    const providerAppointments: MetricAppointment[] = activeAppointments.filter(
      (appointment) => appointment.providerId === providerId
    );

    for (
      let cursor = range.start.getTime();
      cursor < range.end.getTime();
      cursor += MS_PER_DAY
    ) {
      // Igual que `capacityMinutesForProvider`: la medianoche local (UTC−6)
      // cae a las 06:00Z del mismo día, así que el día UTC coincide con el
      // día clínico.
      const dayOfWeek = new Date(cursor).getUTCDay();

      const windows = unionIntervals(
        providerHours
          .filter((hour) => hour.dayOfWeek === dayOfWeek)
          .map((hour) => ({
            start: cursor + parseTimeToMinutes(hour.startTime) * MS_PER_MINUTE,
            end: cursor + parseTimeToMinutes(hour.endTime) * MS_PER_MINUTE,
          }))
          .filter((window) => window.end > window.start)
      );

      for (const window of windows) {
        const windowRange: ClinicRange = {
          start: new Date(window.start),
          end: new Date(window.end),
        };
        const occupied = providerAppointments
          .filter((appointment) => overlapsRange(appointment, windowRange))
          .map((appointment) => ({
            start: Math.max(Date.parse(appointment.startAt), window.start),
            end: Math.min(Date.parse(appointment.endAt), window.end),
          }))
          .filter((interval) => interval.end > interval.start);

        for (const free of subtract(window, occupied)) {
          pushGap(providerId, free);
        }
      }
    }
  }

  return gaps.sort(
    (a, b) =>
      a.providerId.localeCompare(b.providerId) ||
      a.startAt.localeCompare(b.startAt)
  );
}
