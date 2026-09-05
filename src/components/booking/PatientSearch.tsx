'use client';

import { useEffect, useState } from 'react';
import type { Patient } from '@/lib/admin/types';

const DEBOUNCE_MS = 300;

export function PatientSearch({ onSelect }: { onSelect: (patient: Patient) => void }) {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setPatients([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/patients?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          if (res.status === 401) {
            setError('Tu sesión expiró. Inicia sesión de nuevo.');
          } else {
            setError('No se pudieron buscar los pacientes.');
          }
          setPatients([]);
          return;
        }

        const data = (await res.json()) as { patients: Patient[] };
        setPatients(data.patients ?? []);
      } catch {
        setError('No se pudieron buscar los pacientes.');
        setPatients([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar paciente por nombre, teléfono o correo"
        className="block w-full rounded-lg border border-gray-300 px-3 py-2"
      />

      {loading && <p className="text-sm text-gray-500">Buscando…</p>}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {patients.length > 0 && (
        <ul className="rounded-lg border border-gray-200 bg-white">
          {patients.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                onClick={() => onSelect(patient)}
                className="w-full px-4 py-2 text-left hover:bg-gray-50"
              >
                <span className="font-medium">{patient.fullName}</span>
                <span className="ml-2 text-sm text-gray-500">
                  {patient.phoneE164 ?? patient.email ?? 'Sin contacto'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
