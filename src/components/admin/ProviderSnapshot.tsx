import Link from 'next/link';
import { EmptyState } from './EmptyState';
import type { ProviderSnapshot } from '@/lib/admin/types';

type ProviderSnapshotProps = {
  snapshot: ProviderSnapshot;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
  });
}

export function ProviderSnapshot({ snapshot }: ProviderSnapshotProps) {
  const { provider, upcoming, today, recentClients, clientsHref } = snapshot;

  return (
    <div className="space-y-8">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{provider.name}</h1>
        <p className="text-sm text-gray-500">Concentrado del proveedor</p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Próximas citas
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState message="No hay citas próximas." />
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {upcoming.map((appointment) => (
              <li key={appointment.id} className="px-4 py-3">
                <p className="font-medium text-gray-900">
                  {appointment.patientName}
                </p>
                <p className="text-sm text-gray-600">
                  {appointment.serviceName} · {formatDateTime(appointment.startAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Agenda de hoy
        </h2>
        {today.length === 0 ? (
          <EmptyState message="No hay citas programadas para hoy." />
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {today.map((appointment) => (
              <li key={appointment.id} className="px-4 py-3">
                <p className="font-medium text-gray-900">
                  {appointment.patientName}
                </p>
                <p className="text-sm text-gray-600">
                  {appointment.serviceName} · {formatDateTime(appointment.startAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Clientes recientes ({recentClients.length})
          </h2>
          <Link
            href={clientsHref}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Ver listado completo
          </Link>
        </div>
        {recentClients.length === 0 ? (
          <EmptyState message="No hay clientes recientes." />
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {recentClients.map((client) => (
              <li
                key={client.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="font-medium text-gray-900">
                  {client.fullName}
                </span>
                <span className="text-sm text-gray-600">
                  {client.count} cita{client.count === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
