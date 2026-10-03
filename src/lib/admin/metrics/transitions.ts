/**
 * Mapeo puro status → columna de transición (issue #88, design.md §1.3).
 *
 * Cada escritor de `appointments.status` compone este estampado dentro de la
 * misma sentencia (`UPDATE`/`INSERT`), de modo que el estado y su instante
 * quedan atómicos. `attended` no tiene columna: solo existen `confirmed_at`,
 * `cancelled_at` y `no_show_at`.
 */

import type { AppointmentStatus } from '../types';

export type TransitionStamp = Partial<
  Record<'confirmed_at' | 'cancelled_at' | 'no_show_at', string>
>;

export const TRANSITION_COLUMN_BY_STATUS: Readonly<
  Partial<Record<AppointmentStatus, keyof TransitionStamp>>
> = {
  confirmed: 'confirmed_at',
  cancelled: 'cancelled_at',
  no_show: 'no_show_at',
};

/** Columna de transición del status, o `{}` si no es estampable. */
export function buildTransitionStamp(
  status: AppointmentStatus,
  at: Date
): TransitionStamp {
  const column = TRANSITION_COLUMN_BY_STATUS[status];
  return column ? { [column]: at.toISOString() } : {};
}
