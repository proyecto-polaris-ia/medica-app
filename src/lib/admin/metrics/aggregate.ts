/**
 * Agregado y desglose por proveedor (issue #88, design.md §1.2).
 *
 * - La ocupación agregada es `Σ ocupados / Σ capacidad`, no el promedio de
 *   porcentajes por proveedor.
 * - El desglose se construye sobre la unión de `provider_id` de citas y
 *   `business_hours`; sin ids → `providers: []` (el panel cae al agregado).
 * - `totalAppointments` cuenta las citas que solapan el rango sin filtrar
 *   status; `cancelledCount` cuenta las de status `cancelled`.
 */

import { computeNoShow } from './no-show';
import { computeOccupancy, overlapsRange } from './occupancy';
import {
  ALL_APPOINTMENT_STATUSES,
  type ClinicRange,
  type MetricAppointment,
  type MetricBusinessHour,
  type MetricsResult,
  type ProviderMetrics,
  type ProviderRef,
  type StatusCounts,
} from './types';

function emptyStatusCounts(): StatusCounts {
  return ALL_APPOINTMENT_STATUSES.reduce((counts, status) => {
    counts[status] = 0;
    return counts;
  }, {} as StatusCounts);
}

function countStatuses(appointments: MetricAppointment[]): StatusCounts {
  const counts = emptyStatusCounts();
  for (const appointment of appointments) {
    counts[appointment.status] += 1;
  }
  return counts;
}

function buildProviderMetrics(input: {
  providerId: string;
  providerName: string;
  appointments: MetricAppointment[];
  businessHours: MetricBusinessHour[];
  range: ClinicRange;
}): ProviderMetrics {
  const { providerId, providerName, appointments, businessHours, range } = input;

  const overlapping = appointments.filter(
    (appointment) =>
      appointment.providerId === providerId && overlapsRange(appointment, range)
  );
  const occupancy = computeOccupancy({
    appointments,
    businessHours,
    providerId,
    range,
  });
  const noShow = computeNoShow({ appointments, providerId, range });

  return {
    providerId,
    providerName,
    occupancyPct: occupancy.occupancyPct,
    occupiedMinutes: occupancy.occupiedMinutes,
    capacityMinutes: occupancy.capacityMinutes,
    noShowRatePct: noShow.noShowRatePct,
    noShowCount: noShow.noShowCount,
    attendedCount: noShow.attendedCount,
    totalAppointments: overlapping.length,
    cancelledCount: overlapping.filter(
      (appointment) => appointment.status === 'cancelled'
    ).length,
    statusCounts: countStatuses(overlapping),
  };
}

export function computeMetrics(input: {
  appointments: MetricAppointment[];
  businessHours: MetricBusinessHour[];
  providers?: ProviderRef[];
  range: ClinicRange;
}): MetricsResult {
  const { appointments, businessHours, providers = [], range } = input;

  const overlapping = appointments.filter((appointment) =>
    overlapsRange(appointment, range)
  );
  const occupancy = computeOccupancy({ appointments, businessHours, range });
  const noShow = computeNoShow({ appointments, range });

  const providerIds = new Set<string>();
  for (const appointment of appointments) providerIds.add(appointment.providerId);
  for (const hour of businessHours) providerIds.add(hour.providerId);

  const nameById = new Map(providers.map((provider) => [provider.id, provider.name]));
  const providerMetrics = [...providerIds]
    .map((providerId) =>
      buildProviderMetrics({
        providerId,
        providerName: nameById.get(providerId) ?? providerId,
        appointments,
        businessHours,
        range,
      })
    )
    .sort(
      (a, b) =>
        a.providerName.localeCompare(b.providerName) ||
        a.providerId.localeCompare(b.providerId)
    );

  return {
    occupancyPct: occupancy.occupancyPct,
    occupiedMinutes: occupancy.occupiedMinutes,
    capacityMinutes: occupancy.capacityMinutes,
    noShowRatePct: noShow.noShowRatePct,
    noShowCount: noShow.noShowCount,
    attendedCount: noShow.attendedCount,
    totalAppointments: overlapping.length,
    cancelledCount: overlapping.filter(
      (appointment) => appointment.status === 'cancelled'
    ).length,
    statusCounts: countStatuses(overlapping),
    providers: providerMetrics,
  };
}
