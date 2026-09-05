'use client';

import { useState } from 'react';
import { PatientSearch } from './PatientSearch';
import { StateBlock } from './StateBlock';
import { TurnstileWidget } from './TurnstileWidget';
import type { Patient } from '@/lib/admin/types';
import type { Provider, Service, Slot } from './wizard-state';

const timeFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export type ConfirmPatient = {
  phone: string;
  fullName: string;
  patientId?: string;
  captchaToken?: string;
  notes?: string;
};

export function ConfirmStep({
  mode,
  service,
  provider,
  slot,
  onConfirm,
  onBack,
  loading,
  error,
  siteKey,
}: {
  mode: 'public' | 'internal';
  service: Service;
  provider: Provider;
  slot: Slot;
  onConfirm: (patient: ConfirmPatient) => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
  siteKey?: string;
}) {
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [patientId, setPatientId] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const isValidPhone = /^\+[1-9]\d{7,14}$/.test(phone);

  const canSubmit =
    isValidPhone &&
    fullName.trim().length > 0 &&
    (mode === 'internal' || captchaToken !== null);

  const handleSelectPatient = (patient: Patient) => {
    setPatientId(patient.id);
    setPhone(patient.phoneE164);
    setFullName(patient.fullName);
  };

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

      {mode === 'internal' && (
        <PatientSearch onSelect={handleSelectPatient} />
      )}

      <label className="block">
        <span className="text-sm font-medium text-gray-700">
          Teléfono (WhatsApp)
        </span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+5215512345678"
          disabled={patientId !== null}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
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
          disabled={patientId !== null}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-gray-700">
          Notas de la cita
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="¿Quieres agregar algo más para tener en consideración para tu cita?"
          maxLength={1000}
          rows={3}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      {mode === 'public' && (
        <>
          {!siteKey ? (
            <StateBlock
              state="error"
              message="La reserva en línea no está habilitada en este momento."
            />
          ) : (
            <TurnstileWidget
              siteKey={siteKey}
              onToken={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
            />
          )}
        </>
      )}

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
          onClick={() =>
            onConfirm({
              phone,
              fullName,
              ...(patientId ? { patientId } : {}),
              ...(captchaToken ? { captchaToken } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            })
          }
          disabled={!canSubmit || loading}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {loading ? 'Reservando…' : 'Confirmar reserva'}
        </button>
      </div>
    </div>
  );
}
