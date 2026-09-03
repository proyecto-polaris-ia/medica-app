'use client';

import { useState } from 'react';
import { StateBlock } from './StateBlock';
import type { Provider, Service, Slot } from './wizard-state';

const timeFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function ConfirmStep({
  service,
  provider,
  slot,
  onConfirm,
  onBack,
  loading,
  error,
}: {
  service: Service;
  provider: Provider;
  slot: Slot;
  onConfirm: (patient: { phone: string; fullName: string }) => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');

  const isValidPhone = /^\+[1-9]\d{7,14}$/.test(phone);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-gray-50 p-4 text-sm">
        <p>
          <strong>Servicio:</strong> {service.name} ({service.durationMinutes}{' '}
          min)
        </p>
        <p>
          <strong>Especialista:</strong> {provider.name}
        </p>
        <p>
          <strong>Horario:</strong>{' '}
          {timeFormatter.format(slot.start_at)} –{' '}
          {timeFormatter.format(slot.end_at)}
        </p>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-gray-700">
          Teléfono (WhatsApp)
        </span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+5215512345678"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-gray-700">
          Nombre completo
        </span>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="María García"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      {error && <StateBlock state="error" message={error} />}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Atrás
        </button>
        <button
          type="button"
          onClick={() => onConfirm({ phone, fullName })}
          disabled={!isValidPhone || loading}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {loading ? 'Reservando…' : 'Confirmar reserva'}
        </button>
      </div>
    </div>
  );
}
