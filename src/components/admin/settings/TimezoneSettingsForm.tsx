'use client';

import { useState, type FormEvent } from 'react';
import { isValidIanaTimeZone } from '@/lib/admin/timezone';

/**
 * Zonas IANA comunes del consultorio. El valor `__custom__` habilita la
 * captura libre de cualquier zona IANA válida.
 */
const COMMON_TIMEZONES = [
  'America/Mexico_City',
  'America/Tijuana',
  'America/Los_Angeles',
  'America/Chicago',
  'America/New_York',
  'Europe/Madrid',
];

const CUSTOM_OPTION = '__custom__';

const INVALID_MESSAGE =
  'La zona horaria no es válida. Usa un identificador IANA, por ejemplo America/Mexico_City.';
const SAVE_ERROR_MESSAGE = 'No se pudo guardar la zona horaria. Intenta de nuevo.';

export function TimezoneSettingsForm({
  initialTimezone,
}: {
  initialTimezone: string;
}) {
  const initialIsCommon = COMMON_TIMEZONES.includes(initialTimezone);

  // `savedTimezone` es la preferencia vigente confirmada; sólo cambia cuando
  // el guardado (en cliente o servidor) es exitoso, para no sobrescribirla
  // ante un error de validación.
  const [savedTimezone, setSavedTimezone] = useState(initialTimezone);
  const [selection, setSelection] = useState(
    initialIsCommon ? initialTimezone : CUSTOM_OPTION
  );
  const [customTimezone, setCustomTimezone] = useState(
    initialIsCommon ? '' : initialTimezone
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedTimezone =
    selection === CUSTOM_OPTION ? customTimezone.trim() : selection;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isValidIanaTimeZone(selectedTimezone)) {
      setError(INVALID_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/settings/timezone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: selectedTimezone }),
      });

      if (!res.ok) {
        throw new Error(SAVE_ERROR_MESSAGE);
      }

      setSavedTimezone(selectedTimezone);
      setSuccess('Zona horaria actualizada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : SAVE_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <p className="text-sm text-gray-600">
        Zona horaria vigente:{' '}
        <strong data-testid="current-timezone" className="text-gray-900">
          {savedTimezone}
        </strong>
      </p>

      <div className="mt-4">
        <label
          htmlFor="timezone-select"
          className="block text-sm font-medium text-gray-700"
        >
          Zona horaria
        </label>
        <select
          id="timezone-select"
          value={selection}
          onChange={(event) => setSelection(event.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
        >
          {COMMON_TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
          <option value={CUSTOM_OPTION}>Otra zona horaria…</option>
        </select>
      </div>

      {selection === CUSTOM_OPTION && (
        <div className="mt-4">
          <label
            htmlFor="timezone-custom"
            className="block text-sm font-medium text-gray-700"
          >
            Otra zona horaria (IANA)
          </label>
          <input
            id="timezone-custom"
            type="text"
            value={customTimezone}
            onChange={(event) => setCustomTimezone(event.target.value)}
            placeholder="America/Cancun"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-4 text-sm text-green-700">
          {success}
        </p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
