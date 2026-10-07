import { EmptyState } from '@/components/admin/EmptyState';
import type { NoraView } from '@/lib/admin/nora/loader';
import type { NoraGap } from '@/lib/admin/nora/types';
import { clinicTimeLabel } from '@/lib/admin/timezone';

/**
 * Sección presentacional de agenda productiva (change `nora-agenda-productiva`,
 * Fase 1, design.md §6). Server component: recibe la vista ya resuelta por el
 * loader (`getNoraView`) y solo agrupa y formatea. Reutiliza `EmptyState` y el
 * mismo patrón de tarjetas/banner que `MetricsSection`; nunca muestra valores
 * `null`, `undefined` ni negativos.
 */

const numberFormatter = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 1,
});

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

function formatMinutes(value: number): string {
  return `${numberFormatter.format(Math.max(0, value))} min`;
}

function formatPct(value: number): string {
  return `${numberFormatter.format(Math.max(0, value))}%`;
}

/** `YYYY-MM-DD` (día clínico) → `5 oct 2026`, sin usar el reloj del server. */
function formatClinicDay(dayKey: string): string {
  const [year, month, day] = dayKey.split('-');
  const monthLabel = MONTHS_ES[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthLabel} ${year}`;
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

type ProviderDayGroup = {
  providerId: string;
  providerName: string;
  dayKey: string;
  gaps: NoraGap[];
  minutes: number;
};

/**
 * Agrupa los huecos por proveedor y día clínico resolviendo el nombre del
 * proveedor desde los `metrics` reutilizados del motor (mismo join por lote).
 * `computeGaps` ya entrega la lista ordenada, así que el agrupamiento es
 * determinista sin reordenar.
 */
function groupGapsByProviderDay(view: NoraView): ProviderDayGroup[] {
  const nameById = new Map(
    (view.metrics?.providers ?? []).map((provider) => [
      provider.providerId,
      provider.providerName,
    ])
  );
  const groups = new Map<string, ProviderDayGroup>();

  for (const gap of view.gaps) {
    const key = `${gap.providerId}::${gap.dayKey}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        providerId: gap.providerId,
        providerName: nameById.get(gap.providerId) ?? gap.providerId,
        dayKey: gap.dayKey,
        gaps: [],
        minutes: 0,
      };
      groups.set(key, group);
    }
    group.gaps.push(gap);
    group.minutes += gap.minutes;
  }

  return [...groups.values()];
}

export function NoraSection({ view }: { view: NoraView }) {
  const { metrics } = view;
  const groups = groupGapsByProviderDay(view);
  const totalMinutes = view.gaps.reduce((sum, gap) => sum + gap.minutes, 0);

  return (
    <section aria-label="Nora — agenda productiva" className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Agenda productiva</h2>
      </div>

      {view.isConfiguredButUnavailable ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          No se pudieron leer los indicadores de agenda productiva. Intenta de
          nuevo más tarde.
        </div>
      ) : null}

      {metrics === null ? (
        <EmptyState message="Sin datos de agenda productiva para el rango seleccionado." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Ocupación del rango %"
              value={formatPct(metrics.occupancyPct)}
            />
            <SummaryCard
              label="No-show del rango %"
              value={
                metrics.noShowRatePct === null
                  ? 'No disponible'
                  : formatPct(metrics.noShowRatePct)
              }
            />
            <SummaryCard
              label="Huecos improductivos"
              value={numberFormatter.format(view.gaps.length)}
            />
            <SummaryCard
              label="Minutos improductivos"
              value={formatMinutes(totalMinutes)}
            />
          </div>

          {groups.length === 0 ? (
            <div className="mt-4">
              <EmptyState message="Sin huecos improductivos en el rango seleccionado." />
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Huecos improductivos por proveedor y día
                </caption>
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Proveedor y día
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Huecos
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Minutos
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Detalle
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr
                      key={`${group.providerId}-${group.dayKey}`}
                      className="border-t border-gray-100 align-top"
                    >
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {`${group.providerName} · ${formatClinicDay(group.dayKey)}`}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {numberFormatter.format(group.gaps.length)}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {formatMinutes(group.minutes)}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        <ul className="space-y-1">
                          {group.gaps.map((gap) => (
                            <li key={gap.startAt}>
                              {`${clinicTimeLabel(gap.startAt)}–${clinicTimeLabel(
                                gap.endAt
                              )} (${formatMinutes(gap.minutes)})`}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
