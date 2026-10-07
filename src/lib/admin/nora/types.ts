/**
 * Tipos y constantes de la capacidad determinista Nora (change
 * `nora-agenda-productiva`, Fase 1). Sin I/O ni reloj implícito: extiende los
 * tipos planos del motor de métricas (`dashboard-metrics`) sin duplicarlos.
 */

import type {
  ClinicRange,
  MetricAppointment,
  MetricBusinessHour,
} from '../metrics/types';

/** Duración mínima (minutos) para que un tramo libre sea hueco improductivo. */
export const NORA_MIN_GAP_MINUTES = 30;

/** Máximo de sugerencias devueltas por corrida (salida acotada). */
export const NORA_MAX_SUGGESTIONS = 20;

/** Estados de cita que pueden reacomodarse (los terminales nunca entran). */
export const NORA_MOVABLE_STATUSES = [
  'requested',
  'pending',
  'confirmed',
] as const;

export type NoraMovableStatus = (typeof NORA_MOVABLE_STATUSES)[number];

export function isNoraMovableStatus(status: string): status is NoraMovableStatus {
  return (NORA_MOVABLE_STATUSES as readonly string[]).includes(status);
}

/** Código determinista de por qué el reacomodo aprovecha un hueco. */
export type NoraSuggestionReason = 'gap_before' | 'gap_after' | 'gap_between';

/** Ciclo de vida propio de una sugerencia (no toca `appointment_status`). */
export const NORA_SUGGESTION_STATUSES = [
  'proposed',
  'accepted',
  'rejected',
  'expired',
  'applied',
] as const;

export type NoraSuggestionStatus = (typeof NORA_SUGGESTION_STATUSES)[number];

/** Cita candidata a reacomodo, con la duración del servicio ya resuelta. */
export type NoraMovableAppointment = {
  id: string;
  providerId: string;
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
  status: NoraMovableStatus;
  serviceDurationMinutes: number;
};

/** Sugerencia generada en memoria (pura, sin persistir ni aplicar). */
export type NoraSuggestion = {
  appointmentId: string;
  providerId: string;
  suggestedStartAt: string; // ISO UTC, inicio del hueco destino
  suggestedEndAt: string; // inicio + duración del servicio
  reasonCode: NoraSuggestionReason;
};

/** Sugerencia persistida en `nora_reschedule_suggestions`. */
export type NoraSuggestionRecord = {
  id: string;
  appointmentId: string;
  providerId: string;
  /** Horario de la cita al generarse la propuesta (referencia de expiración). */
  originalStartAt: string;
  originalEndAt: string;
  suggestedStartAt: string;
  suggestedEndAt: string;
  reasonCode: NoraSuggestionReason;
  status: NoraSuggestionStatus;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
};

/** Hueco improductivo: ventana de `business_hours` sin cita activa. */
export type NoraGap = {
  providerId: string;
  /** `YYYY-MM-DD` en `America/Mexico_City`. */
  dayKey: string;
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
  minutes: number;
};

export type ComputeGapsInput = {
  businessHours: MetricBusinessHour[];
  appointments: MetricAppointment[];
  range: ClinicRange;
  minGapMinutes?: number;
};

export type ComputeSuggestionsInput = {
  gaps: NoraGap[];
  movableAppointments: NoraMovableAppointment[];
  /** Citas activas del rango: base determinista para el código de razón. */
  activeAppointments: MetricAppointment[];
  maxSuggestions?: number;
};
