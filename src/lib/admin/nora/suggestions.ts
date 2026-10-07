/**
 * Generador determinista de sugerencias de reacomodo (change
 * `nora-agenda-productiva`, Fase 2, design.md §2).
 *
 * Reglas duras:
 * - Solo se proponen citas movibles (`requested | pending | confirmed`).
 * - El destino es **siempre** el inicio de un hueco real del mismo proveedor,
 *   con duración suficiente para el servicio. Nunca se inventa disponibilidad.
 * - El código de razón es determinista sobre las citas activas del proveedor.
 * - Mejor candidato por cita (menor `startAt`, desempate por `endAt`), salida
 *   acotada y ordenada.
 *
 * Puro: sin I/O, sin reloj, sin aplicación. Nada se escribe ni se mueve aquí.
 */

import type { MetricAppointment } from '../metrics/types';
import {
  isNoraMovableStatus,
  NORA_MAX_SUGGESTIONS,
  type ComputeSuggestionsInput,
  type NoraGap,
  type NoraMovableAppointment,
  type NoraSuggestion,
  type NoraSuggestionReason,
} from './types';

export { NORA_MAX_SUGGESTIONS } from './types';

const MS_PER_MINUTE = 60_000;

/** Estados que NO ocupan agenda (misma semántica que `booking_free_slots`). */
const NON_OCCUPYING_STATUSES = new Set<string>(['cancelled', 'rescheduled']);

/**
 * Razón determinista del hueco destino:
 * `gap_between` si el hueco queda limitado por dos citas activas del mismo
 * proveedor (una termina justo al inicio y otra empieza justo al final);
 * si no, `gap_before` cuando el destino es anterior al inicio actual y
 * `gap_after` en caso contrario.
 */
function reasonFor(
  gap: NoraGap,
  appointment: NoraMovableAppointment,
  activeAppointments: MetricAppointment[]
): NoraSuggestionReason {
  const endsAtGapStart = activeAppointments.some(
    (active) =>
      active.providerId === gap.providerId && active.endAt === gap.startAt
  );
  const startsAtGapEnd = activeAppointments.some(
    (active) =>
      active.providerId === gap.providerId && active.startAt === gap.endAt
  );

  if (endsAtGapStart && startsAtGapEnd) return 'gap_between';
  return gap.startAt < appointment.startAt ? 'gap_before' : 'gap_after';
}

/** Mejor hueco candidato: menor `startAt`, desempate por `endAt` más temprano. */
function bestGapFor(
  appointment: NoraMovableAppointment,
  gaps: NoraGap[]
): NoraGap | null {
  const candidates = gaps
    .filter(
      (gap) =>
        gap.providerId === appointment.providerId &&
        gap.minutes >= appointment.serviceDurationMinutes &&
        gap.startAt !== appointment.startAt
    )
    .sort(
      (a, b) => a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt)
    );

  return candidates[0] ?? null;
}

/**
 * Sugerencias de reacomodo para las citas movibles dadas, ordenadas por
 * `(providerId, suggestedStartAt, appointmentId)` y acotadas a
 * `maxSuggestions` (default `NORA_MAX_SUGGESTIONS`).
 */
export function computeSuggestions(
  input: ComputeSuggestionsInput
): NoraSuggestion[] {
  const {
    gaps,
    movableAppointments,
    activeAppointments,
    maxSuggestions = NORA_MAX_SUGGESTIONS,
  } = input;

  const active = activeAppointments.filter(
    (appointment) => !NON_OCCUPYING_STATUSES.has(appointment.status)
  );

  const suggestions: NoraSuggestion[] = [];

  for (const appointment of movableAppointments) {
    // Guarda defensiva: los estados terminales nunca son movibles.
    if (!isNoraMovableStatus(appointment.status)) continue;

    const gap = bestGapFor(appointment, gaps);
    if (!gap) continue;

    suggestions.push({
      appointmentId: appointment.id,
      providerId: appointment.providerId,
      suggestedStartAt: gap.startAt,
      suggestedEndAt: new Date(
        Date.parse(gap.startAt) + appointment.serviceDurationMinutes * MS_PER_MINUTE
      ).toISOString(),
      reasonCode: reasonFor(gap, appointment, active),
    });
  }

  return suggestions
    .sort(
      (a, b) =>
        a.providerId.localeCompare(b.providerId) ||
        a.suggestedStartAt.localeCompare(b.suggestedStartAt) ||
        a.appointmentId.localeCompare(b.appointmentId)
    )
    .slice(0, Math.max(0, maxSuggestions));
}
