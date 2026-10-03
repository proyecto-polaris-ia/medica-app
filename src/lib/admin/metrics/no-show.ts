/**
 * Tasa de no-show (issue #88, design.md §1.2).
 *
 * `no_show / (no_show + attended)` contando citas cuyo intervalo solape el
 * rango. `cancelled` y cualquier otro estado quedan fuera. Denominador cero →
 * `null` (nunca `0`).
 */

import { overlapsRange } from './occupancy';
import type { ClinicRange, MetricAppointment } from './types';

export type NoShowResult = {
  noShowCount: number;
  attendedCount: number;
  noShowRatePct: number | null;
};

export function computeNoShow(input: {
  appointments: MetricAppointment[];
  providerId?: string;
  range: ClinicRange;
}): NoShowResult {
  const { appointments, providerId, range } = input;

  let noShowCount = 0;
  let attendedCount = 0;
  for (const appointment of appointments) {
    if (providerId !== undefined && appointment.providerId !== providerId) continue;
    if (appointment.status !== 'no_show' && appointment.status !== 'attended') continue;
    if (!overlapsRange(appointment, range)) continue;
    if (appointment.status === 'no_show') noShowCount += 1;
    else attendedCount += 1;
  }

  const denominator = noShowCount + attendedCount;
  const noShowRatePct =
    denominator === 0 ? null : (noShowCount / denominator) * 100;

  return { noShowCount, attendedCount, noShowRatePct };
}
