/**
 * Tipos planos y constantes de la librería pura de métricas (issue #88,
 * design.md §1.2). Sin I/O ni reloj implícito: recibe filas planas y un rango.
 */

import type { AppointmentStatus } from '../types';

export type MetricsPreset = 'week' | 'month' | 'custom';

/** Intervalo semiabierto `[start, end)` en UTC. */
export type ClinicRange = { start: Date; end: Date };

export type MetricAppointment = {
  id: string;
  providerId: string;
  startAt: string; // timestamptz ISO
  endAt: string; // timestamptz ISO
  status: AppointmentStatus;
};

export type MetricBusinessHour = {
  providerId: string;
  /** 0 = domingo .. 6 = sábado (convención `EXTRACT(dow)`, ver 0004). */
  dayOfWeek: number;
  startTime: string; // "HH:MM:SS" (time)
  endTime: string; // "HH:MM:SS" (time)
};

export type ProviderRef = { id: string; name: string };

/** Status que suman al numerador de ocupación (issue #88 / proposal). */
export const OCCUPANCY_STATUSES = [
  'confirmed',
  'attended',
  'pending',
  'requested',
] as const;

/** Status que nunca suman al numerador de ocupación. */
export const NON_OCCUPANCY_STATUSES = [
  'cancelled',
  'rescheduled',
  'no_show',
] as const;

/** Status que alimentan el numerador y el denominador de la tasa de no-show. */
export const NO_SHOW_STATUSES = ['no_show', 'attended'] as const;

export const ALL_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'requested',
  'confirmed',
  'pending',
  'cancelled',
  'rescheduled',
  'no_show',
  'attended',
];

export type StatusCounts = Record<AppointmentStatus, number>;

export type ProviderMetrics = {
  providerId: string;
  providerName: string;
  occupancyPct: number; // clamp [0, 100]
  occupiedMinutes: number;
  capacityMinutes: number;
  noShowRatePct: number | null; // null cuando el denominador es 0
  noShowCount: number;
  attendedCount: number;
  totalAppointments: number;
  cancelledCount: number;
  statusCounts: StatusCounts;
};

export type MetricsResult = {
  occupancyPct: number;
  occupiedMinutes: number;
  capacityMinutes: number;
  noShowRatePct: number | null;
  noShowCount: number;
  attendedCount: number;
  totalAppointments: number;
  cancelledCount: number;
  statusCounts: StatusCounts;
  providers: ProviderMetrics[];
};
