'use client';

import { useState } from 'react';
import type { ClinicalVisit } from '@/lib/admin/types';
import { EmptyState } from '@/components/admin/EmptyState';
import { LoadingState } from '@/components/admin/LoadingState';
import { ErrorState } from '@/components/admin/ErrorState';
import { ClinicalVisitForm } from './ClinicalVisitForm';

type PatientVisitsTabProps = {
  patientId: string;
  visits: ClinicalVisit[];
  loading: boolean;
  error: string | null;
  onVisitsChanged: () => void;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function PatientVisitsTab({
  patientId,
  visits,
  loading,
  error,
  onVisitsChanged,
}: PatientVisitsTabProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<ClinicalVisit | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleEdit(visit: ClinicalVisit) {
    setEditingVisit(visit);
    setIsFormOpen(true);
  }

  function handleNew() {
    setEditingVisit(null);
    setIsFormOpen(true);
  }

  function handleClose() {
    setIsFormOpen(false);
    setEditingVisit(null);
  }

  function handleSaved() {
    handleClose();
    onVisitsChanged();
  }

  async function handleDelete(visit: ClinicalVisit) {
    if (!window.confirm('¿Eliminar esta consulta? Esta acción no se puede deshacer.')) {
      return;
    }

    setDeletingId(visit.id);
    try {
      const res = await fetch(
        `/api/admin/patients/${patientId}/clinical-visits/${visit.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Error al eliminar la consulta');
      onVisitsChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <LoadingState message="Cargando consultas..." />;
  if (error) return <ErrorState message={error} onRetry={onVisitsChanged} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Notas de evolución (SOAP)</h3>
        <button
          type="button"
          onClick={handleNew}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nueva consulta
        </button>
      </div>

      {visits.length === 0 ? (
        <EmptyState message="No hay consultas registradas para este paciente." />
      ) : (
        <div className="space-y-4">
          {visits.map((visit) => (
            <article
              key={visit.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">{formatDateTime(visit.createdAt)}</p>
                  <h4 className="text-base font-semibold text-gray-900">{visit.subjective}</h4>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(visit)}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(visit)}
                    disabled={deletingId === visit.id}
                    className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {deletingId === visit.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Objetivo
                  </dt>
                  <dd className="text-sm text-gray-900">{visit.objective ?? '—'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Valoración
                  </dt>
                  <dd className="text-sm text-gray-900">{visit.assessment ?? '—'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Plan
                  </dt>
                  <dd className="text-sm text-gray-900">{visit.plan ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Tratamiento
                  </dt>
                  <dd className="text-sm text-gray-900">{visit.treatment ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Notas
                  </dt>
                  <dd className="text-sm text-gray-900">{visit.notes ?? '—'}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}

      <ClinicalVisitForm
        patientId={patientId}
        visit={editingVisit}
        isOpen={isFormOpen}
        onClose={handleClose}
        onSaved={handleSaved}
      />
    </div>
  );
}
