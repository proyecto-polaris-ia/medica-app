import { getProvider } from './providers';
import { listByProviderRange, listUpcomingByProvider } from './appointments';
import { clinicDayRange, trailingDaysRange } from './clinic-time';
import type { ProviderSnapshot, ProviderAppointment, RecentClient } from './types';

const RECENT_DAYS = 30;
const RECENT_STATUSES = new Set(['attended', 'confirmed']);
const UPCOMING_LIMIT = 10;

function buildRecentClients(appointments: ProviderAppointment[]): RecentClient[] {
  const counts = new Map<string, { id: string; fullName: string; count: number }>();

  for (const appointment of appointments) {
    if (!RECENT_STATUSES.has(appointment.status)) continue;
    if (!appointment.patientId) continue;

    const existing = counts.get(appointment.patientId);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(appointment.patientId, {
        id: appointment.patientId,
        fullName: appointment.patientName,
        count: 1,
      });
    }
  }

  return Array.from(counts.values()).sort((a, b) =>
    a.fullName.localeCompare(b.fullName)
  );
}

/**
 * Single source of truth for the provider concentrado view.
 * Consumed by both the Server Component page and the API route.
 */
export async function getProviderSnapshot(
  providerId: string,
  now: Date
): Promise<ProviderSnapshot> {
  const provider = await getProvider(providerId);

  const [upcoming, today, recent] = await Promise.all([
    listUpcomingByProvider(providerId, now, UPCOMING_LIMIT),
    listByProviderRange(providerId, ...clinicDayRange(now)),
    listByProviderRange(providerId, ...trailingDaysRange(now, RECENT_DAYS)),
  ]);

  return {
    provider,
    upcoming,
    today,
    recentClients: buildRecentClients(recent),
    clientsHref: `/appointments?providerId=${provider.id}`,
  };
}
