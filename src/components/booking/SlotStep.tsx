'use client';

import { useMemo } from 'react';
import { StateBlock } from './StateBlock';
import type { Slot } from './wizard-state';

const timeFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function formatSlot(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  return `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
}

function getTodayLocal(): string {
  return dateFormatter.format(new Date());
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
  const today = useMemo(() => getTodayLocal(), []);
  const now = useMemo(() => new Date(), []);

  // Filter out past slots for today
  const availableSlots = useMemo(() => {
    if (date !== today) return slots;
    return slots.filter((slot) => slot.start_at > now);
  }, [date, today, slots, now]);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Fecha</span>
        <input
          type="date"
          value={date}
          min={today}
          onChange={(e) => onDateChange(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      {loading && <StateBlock state="loading" />}
      {!loading && error && (
        <StateBlock state="error" message={error} onRetry={onRetry} />
      )}
      {!loading && !error && date && availableSlots.length === 0 && (
        <StateBlock
          state="empty"
          message="Sin horarios libres para esta fecha."
          onRetry={onRetry}
        />
      )}
      {!loading && !error && availableSlots.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="listbox" aria-label="Horarios disponibles">
          {availableSlots.map((slot, index) => (
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
