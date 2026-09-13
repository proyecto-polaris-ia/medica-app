'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/admin/ErrorState';
import { LoadingState } from '@/components/admin/LoadingState';
import { PatientRecordView } from '@/components/admin/PatientRecordView';
import type { PatientRecord } from '@/lib/admin/types';

export default function PatientRecordPage() {
  const params = useParams<{ id: string }>();
  const patientId = params?.id;
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadRecord() {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/record`);
      if (!res.ok) throw new Error('Error al cargar el expediente');
      const data = await res.json();
      setRecord(data.record);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecord();
  }, [patientId]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expediente</h1>
          <p className="text-sm text-gray-500">Resumen inicial del paciente</p>
        </div>
        <Link href="/patients" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          Volver a pacientes
        </Link>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={loadRecord} />}
      {!loading && !error && record && <PatientRecordView record={record} />}
    </div>
  );
}
