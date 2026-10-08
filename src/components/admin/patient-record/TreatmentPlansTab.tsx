'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Provider, TreatmentPlan, TreatmentPlanWithItems } from '@/lib/admin/types';
import { EmptyState } from '@/components/admin/EmptyState';
import { LoadingState } from '@/components/admin/LoadingState';
import { ErrorState } from '@/components/admin/ErrorState';
import { TreatmentPlanForm } from './TreatmentPlanForm';
import { TreatmentPlanDetailModal } from './TreatmentPlanDetailModal';

type TreatmentPlansTabProps = {
  patientId: string;
  treatmentPlans: TreatmentPlan[];
  loading: boolean;
  error: string | null;
  onPlansChanged: () => void;
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-gray-100 text-gray-800' },
  presented: { label: 'Presentado', className: 'bg-blue-100 text-blue-800' },
  accepted: { label: 'Aceptado', className: 'bg-green-100 text-green-800' },
  in_progress: { label: 'En progreso', className: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Completado', className: 'bg-purple-100 text-purple-800' },
  cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' });
}

export function TreatmentPlansTab({
  patientId,
  treatmentPlans,
  loading,
  error,
  onPlansChanged,
}: TreatmentPlansTabProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TreatmentPlan | null>(null);
  const [detailPlanId, setDetailPlanId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setProvidersLoading(true);
    fetch('/api/admin/providers')
      .then((res) => res.json())
      .then((data) => setProviders(data.providers ?? []))
      .catch(() => {
        // Provider names are cosmetic; do not block the list on this fetch.
      })
      .finally(() => setProvidersLoading(false));
  }, []);

  const providerById = useMemo(() => {
    const map = new Map<string, Provider>();
    for (const provider of providers) {
      map.set(provider.id, provider);
    }
    return map;
  }, [providers]);

  function handleNew() {
    setEditingPlan(null);
    setIsFormOpen(true);
  }

  function handleEdit(plan: TreatmentPlan) {
    setEditingPlan(plan);
    setIsFormOpen(true);
  }

  // "Editar" desde el detalle: cierra el detalle y reutiliza el flujo de
  // edición existente (`TreatmentPlanEditFormWrapper`).
  function handleEditFromDetail(planId: string) {
    const plan = treatmentPlans.find((candidate) => candidate.id === planId) ?? null;
    setDetailPlanId(null);
    setEditingPlan(plan);
    setIsFormOpen(true);
  }

  function handleOpenDetail(plan: TreatmentPlan) {
    setDetailPlanId(plan.id);
  }

  function handleClose() {
    setIsFormOpen(false);
    setEditingPlan(null);
  }

  function handleSaved() {
    handleClose();
    onPlansChanged();
  }

  async function handleDelete(plan: TreatmentPlan) {
    if (!window.confirm('¿Eliminar este plan de tratamiento? Esta acción no se puede deshacer.')) {
      return;
    }

    setDeletingId(plan.id);
    try {
      const res = await fetch(
        `/api/admin/patients/${patientId}/treatment-plans/${plan.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Error al eliminar el plan de tratamiento');
      onPlansChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <LoadingState message="Cargando planes de tratamiento..." />;
  if (error) return <ErrorState message={error} onRetry={onPlansChanged} />;

  const detailPlan = detailPlanId
    ? treatmentPlans.find((plan) => plan.id === detailPlanId) ?? null
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Planes de tratamiento</h3>
        <button
          type="button"
          onClick={handleNew}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nuevo plan
        </button>
      </div>

      {treatmentPlans.length === 0 ? (
        <EmptyState message="No hay planes de tratamiento" />
      ) : (
        <div className="space-y-4">
          {treatmentPlans.map((plan) => {
            const badge = STATUS_BADGES[plan.status] ?? {
              label: plan.status,
              className: 'bg-gray-100 text-gray-800',
            };
            const providerName = providerById.get(plan.providerId)?.name ?? '—';
            const isDraft = plan.status === 'draft';

            return (
              <article
                key={plan.id}
                role="button"
                tabIndex={0}
                aria-label={`Ver detalle del plan ${plan.name}`}
                onClick={() => handleOpenDetail(plan)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleOpenDetail(plan);
                  }
                }}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:bg-gray-50"
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                      <p className="text-sm text-gray-500">{formatDate(plan.createdAt)}</p>
                    </div>
                    <h4 className="text-base font-semibold text-gray-900">{plan.name}</h4>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenDetail(plan);
                      }}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      Ver detalle
                    </button>
                    {isDraft && (
                      <>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEdit(plan);
                          }}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(plan);
                          }}
                          disabled={deletingId === plan.id}
                          className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          {deletingId === plan.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Dentista responsable
                    </dt>
                    <dd className="text-sm text-gray-900">{providerName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Monto total
                    </dt>
                    <dd className="text-sm font-semibold text-gray-900">{formatCurrency(plan.totalAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Consulta relacionada
                    </dt>
                    <dd className="text-sm text-gray-900">{plan.clinicalVisitId ? 'Sí' : 'Ninguna'}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}

      <TreatmentPlanForm
        patientId={patientId}
        plan={null}
        isOpen={isFormOpen && editingPlan === null}
        onClose={handleClose}
        onSaved={handleSaved}
      />

      {/* Detail/edit form requires the full plan with items; fetch it when editing. */}
      {editingPlan && (
        <TreatmentPlanEditFormWrapper
          patientId={patientId}
          planId={editingPlan.id}
          isOpen={isFormOpen}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}

      {detailPlan && (
        <TreatmentPlanDetailModal
          patientId={patientId}
          planId={detailPlan.id}
          planName={detailPlan.name}
          providerName={providerById.get(detailPlan.providerId)?.name ?? '—'}
          onClose={() => setDetailPlanId(null)}
          onEdit={handleEditFromDetail}
        />
      )}
    </div>
  );
}

function TreatmentPlanEditFormWrapper({
  patientId,
  planId,
  isOpen,
  onClose,
  onSaved,
}: {
  patientId: string;
  planId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [plan, setPlan] = useState<TreatmentPlanWithItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPlan(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetch(`/api/admin/patients/${patientId}/treatment-plans/${planId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Error al cargar el plan');
        const data = await res.json();
        setPlan(data.treatmentPlan);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error desconocido'))
      .finally(() => setLoading(false));
  }, [isOpen, patientId, planId]);

  if (!isOpen) return null;
  if (loading) return null;
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
          <p className="text-red-700">{error}</p>
          <button onClick={onClose} className="mt-4 rounded-md bg-gray-200 px-4 py-2 text-sm">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <TreatmentPlanForm
      patientId={patientId}
      plan={plan}
      isOpen={isOpen}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
