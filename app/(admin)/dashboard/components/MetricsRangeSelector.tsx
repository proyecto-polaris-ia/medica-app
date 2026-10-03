'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { MetricsPreset } from '@/lib/admin/metrics/types';

/**
 * Selector de rango de métricas (issue #88, design.md §2.2).
 *
 * No guarda el rango en memoria: cada acción empuja la URL (`preset`, `from`,
 * `to`) y el server component resuelve el rango y recalcula las métricas.
 */

const PRESETS: { value: MetricsPreset; label: string }[] = [
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
];

const buttonClass = (active: boolean) =>
  `rounded-lg border px-3 py-2 text-sm font-medium transition ${
    active
      ? 'border-blue-700 bg-blue-700 text-white'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
  }`;

const inputClass =
  'mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900';

export function MetricsRangeSelector({
  preset,
  from,
  to,
}: {
  preset: MetricsPreset;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const applyPreset = (value: MetricsPreset) => {
    router.push(`/dashboard?preset=${value}`);
  };

  const applyCustom = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextFrom = String(data.get('from') ?? '');
    const nextTo = String(data.get('to') ?? '');
    if (!nextFrom || !nextTo) return;
    router.push(
      `/dashboard?preset=custom&from=${encodeURIComponent(
        nextFrom
      )}&to=${encodeURIComponent(nextTo)}`
    );
  };

  const defaultFrom = from ?? searchParams?.get('from') ?? '';
  const defaultTo = to ?? searchParams?.get('to') ?? '';

  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="flex gap-2">
        {PRESETS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => applyPreset(option.value)}
            aria-pressed={preset === option.value}
            className={buttonClass(preset === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <form onSubmit={applyCustom} className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Desde
          <input
            type="date"
            name="from"
            defaultValue={defaultFrom}
            className={inputClass}
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Hasta
          <input
            type="date"
            name="to"
            defaultValue={defaultTo}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          aria-pressed={preset === 'custom'}
          className={buttonClass(preset === 'custom')}
        >
          Aplicar rango
        </button>
      </form>
    </div>
  );
}
