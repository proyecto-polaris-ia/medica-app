'use client';

import { StateBlock } from './StateBlock';
import type { Slot } from './wizard-state';

const timeFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function formatSlot(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  return `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
}

export function SlotStep({
  date,
  slots,
  loading,
  error,
  onDateChange,
  onSelect,
  onRetry,
}: {
  date: string;
  slots: Slot[];
  loading: boolean;
  error: string | null;
  onDateChange: (date: string) => void;
  onSelect: (slot: Slot) => void;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Fecha</span>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      {loading && <StateBlock state="loading" />}
      {!loading && error && (
        <StateBlock state="error" message={error} onRetry={onRetry} />
      )}
      {!loading && !error && date && slots.length === 0 && (
        <StateBlock
          state="empty"
          message="Sin horarios libres para esta fecha."
          onRetry={onRetry}
        />
      )}
      {!loading && !error && slots.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="listbox" aria-label="Horarios disponibles">
          {slots.map((slot, index) => (
            <li key={`${slot.start_at.toISOString()}-${index}`}>
              <button
                type="button"
                onClick={() => onSelect(slot)}
                className="w-full rounded-lg border border-gray-200 p-3 text-center hover:border-blue-500 hover:bg-blue-50"
              >
                {formatSlot(slot.start_at.toISOString(), slot.end_at.toISOString())}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
