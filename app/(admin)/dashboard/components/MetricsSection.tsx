import { EmptyState } from '@/components/admin/EmptyState';
import type { DashboardMetricsView } from '@/lib/admin/metrics/loader';
import {
  computeTrendDelta,
  type MetricsSeriesBucket,
  type MetricsTrend,
} from '@/lib/admin/metrics/trend';

/**
 * Sección presentacional de métricas de agenda (issue #88, design.md §2.2 y
 * Fase 3). Server component: recibe la vista ya resuelta por el loader y solo
 * formatea. El bloque de tendencia muestra la variación contra el periodo
 * anterior y una serie simple (una barra por bucket, sin librería de charts).
 */

const numberFormatter = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 1,
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

/**
 * Variación lista para mostrar. Usa el signo menos tipográfico U+2212 en
 * negativos para no confundirse con un guion de rango; `null` = sin
 * comparación (nunca se representa como caída).
 */
function formatDelta(value: number | null, unit: string): string | null {
  if (value === null) return null;
  if (value === 0) return `0 ${unit}`;
  const sign = value > 0 ? '+' : '−';
  return `${sign}${numberFormatter.format(Math.abs(value))} ${unit}`;
}

function DeltaItem({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  const delta = formatDelta(value, unit);
  return (
    <li className="rounded-md bg-gray-50 px-2 py-1">
      <span className="font-medium text-gray-600">{label}</span>{' '}
      <span className="text-gray-900">{delta ?? 'Sin comparación'}</span>
    </li>
  );
}

function seriesGranularityLabel(series: MetricsSeriesBucket[]): string {
  const first = series[0];
  const isDaily =
    first.range.end.getTime() - first.range.start.getTime() <= MS_PER_DAY;
  return isDaily ? 'día' : 'semana';
}

function SeriesRow({ bucket }: { bucket: MetricsSeriesBucket }) {
  const { occupancyPct, noShowRatePct, totalAppointments } = bucket.metrics;
  const noShowLabel =
    noShowRatePct === null ? 'no disponible' : formatPct(noShowRatePct);

  return (
    <li className="grid grid-cols-[5.5rem_1fr_auto_auto] items-center gap-2 text-xs">
      <span className="text-gray-500">{bucket.label}</span>
      <div className="space-y-1" aria-hidden="true">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-blue-500"
            style={{ width: `${occupancyPct}%` }}
          />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-1.5 rounded-full bg-rose-400"
            style={{ width: `${noShowRatePct ?? 0}%` }}
          />
        </div>
      </div>
      <span className="text-gray-700">{formatPct(occupancyPct)}</span>
      <span className="sr-only">
        {`${bucket.label}: ocupación ${formatPct(
          occupancyPct
        )}; citas: ${totalAppointments}; no-show: ${noShowLabel}`}
      </span>
    </li>
  );
}

function TrendBlock({ trend }: { trend: MetricsTrend }) {
  const delta = computeTrendDelta(trend.current, trend.previous);

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">
        Tendencia vs periodo anterior
      </h3>

      {trend.previous === null ? (
        <p className="mt-1 text-sm text-gray-500">
          Comparación no disponible con el periodo anterior.
        </p>
      ) : (
        <ul
          aria-label="Variación contra el periodo anterior"
          className="mt-2 flex flex-wrap gap-2 text-xs"
        >
          <DeltaItem label="Ocupación" value={delta.occupancyPct} unit="pp" />
          <DeltaItem label="No-show" value={delta.noShowRatePct} unit="pp" />
          <DeltaItem
            label="Citas"
            value={delta.totalAppointments}
            unit="citas"
          />
          <DeltaItem
            label="Canceladas"
            value={delta.cancelledCount}
            unit="cancelaciones"
          />
        </ul>
      )}

      {trend.series.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Evolución por {seriesGranularityLabel(trend.series)} — ocupación y
            no-show
          </h4>
          <ul
            aria-label="Serie de evolución de la ocupación"
            className="mt-2 space-y-1"
          >
            {trend.series.map((bucket) => (
              <SeriesRow key={bucket.dayKey} bucket={bucket} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function MetricsSection({ view }: { view: DashboardMetricsView }) {
  const { metrics, trend } = view;

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

          {trend ? <TrendBlock trend={trend} /> : null}
        </>
      )}
    </section>
  );
}
