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
