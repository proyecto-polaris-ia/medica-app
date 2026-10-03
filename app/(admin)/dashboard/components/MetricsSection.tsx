import { EmptyState } from '@/components/admin/EmptyState';
import type { DashboardMetricsView } from '@/lib/admin/metrics/loader';

/**
 * Sección presentacional de métricas de agenda (issue #88, design.md §2.2).
 * Server component: recibe la vista ya resuelta por el loader y solo formatea.
 */

const numberFormatter = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 1,
});

function formatPct(value: number): string {
  // La lib acota a [0, 100]; el `max` es defensa en profundidad contra
  // porcentajes negativos si llegara un valor inesperado.
  return `${numberFormatter.format(Math.max(0, value))}%`;
}

function formatMinutes(value: number): string {
  return `${numberFormatter.format(value)} min`;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-950">{value}</p>
    </div>
  );
}

export function MetricsSection({ view }: { view: DashboardMetricsView }) {
  const { metrics } = view;

  return (
    <section aria-label="Métricas de agenda" className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Métricas de agenda</h2>
        <p className="text-sm text-gray-500">{view.rangeLabel}</p>
      </div>

      {view.isConfiguredButUnavailable ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          No se pudieron leer las métricas de agenda. Intenta de nuevo más tarde.
        </div>
      ) : null}

      {metrics === null ? (
        <EmptyState message="Sin datos para el rango seleccionado." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Ocupación %" value={formatPct(metrics.occupancyPct)} />
            <SummaryCard
              label="Tasa de no-show %"
              value={
                metrics.noShowRatePct === null
                  ? 'No disponible'
                  : formatPct(metrics.noShowRatePct)
              }
            />
            <SummaryCard
              label="Citas totales"
              value={numberFormatter.format(metrics.totalAppointments)}
            />
            <SummaryCard
              label="Cancelaciones"
              value={numberFormatter.format(metrics.cancelledCount)}
            />
          </div>

          {metrics.providers.length > 0 ? (
            <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Desglose por proveedor</caption>
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Proveedor
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Ocupación
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Capacidad
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Minutos ocupados
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Citas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.providers.map((provider) => (
                    <tr key={provider.providerId} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {provider.providerName}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {formatPct(provider.occupancyPct)}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {formatMinutes(provider.capacityMinutes)}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {formatMinutes(provider.occupiedMinutes)}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {numberFormatter.format(provider.totalAppointments)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
