'use client';

import { useEffect, useState } from 'react';
import type { PatientRecord } from '@/lib/admin/types';
import { PatientRecordView } from './PatientRecordView';

export function PatientRecordModal({
  patientId,
  onClose,
}: {
  patientId: string;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRecord() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/patients/${patientId}/record`);
        if (!res.ok) throw new Error('Error al cargar el expediente');
        const data = await res.json();
        if (!cancelled) setRecord(data.record);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRecord();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Expediente del paciente</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
        {loading && <p className="text-sm text-gray-500">Cargando expediente...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && record && <PatientRecordView record={record} />}
      </div>
    </div>
  );
}
