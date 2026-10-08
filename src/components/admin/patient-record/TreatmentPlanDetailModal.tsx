'use client';

import { useEffect, useId, useState } from 'react';
import type { TreatmentPlanItem, TreatmentPlanWithItems } from '@/lib/admin/types';

type TreatmentPlanDetailModalProps = {
  patientId: string;
  planId: string;
  providerName: string;
  planName?: string;
  onClose: () => void;
  onEdit?: (planId: string) => void;
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-gray-100 text-gray-800' },
  presented: { label: 'Presentado', className: 'bg-blue-100 text-blue-800' },
  accepted: { label: 'Aceptado', className: 'bg-green-100 text-green-800' },
  in_progress: { label: 'En progreso', className: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Completado', className: 'bg-purple-100 text-purple-800' },
  cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
};

const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  done: 'Realizado',
};

function moneyToCents(amount: number): number {
  return Math.round(amount * 100);
}

function lineTotal(item: TreatmentPlanItem): number {
  return (item.quantity * moneyToCents(item.unitPrice)) / 100;
}

function sumLineTotals(items: TreatmentPlanItem[]): number {
  const cents = items.reduce((acc, it) => acc + it.quantity * moneyToCents(it.unitPrice), 0);
  return cents / 100;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' });
}

export function TreatmentPlanDetailModal({
  patientId,
  planId,
  providerName,
  planName,
  onClose,
  onEdit,
}: TreatmentPlanDetailModalProps) {
  const titleId = useId();

  const [plan, setPlan] = useState<TreatmentPlanWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setPlan(null);

    fetch(`/api/admin/patients/${patientId}/treatment-plans/${planId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Error al cargar el plan de tratamiento');
        const data = await res.json();
        if (!cancelled) setPlan(data.treatmentPlan);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error desconocido');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, planId, reloadKey]);

  // Escape cierra el detalle desde cualquier parte del documento.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const badge = plan
    ? STATUS_BADGES[plan.status] ?? { label: plan.status, className: 'bg-gray-100 text-gray-800' }
    : null;
  const subtotal = plan ? sumLineTotals(plan.items) : 0;
  const canEdit = plan?.status === 'draft' && onEdit !== undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {badge && (
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                {badge.label}
              </span>
            )}
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-gray-900">
              {plan?.name ?? planName ?? 'Detalle del plan de tratamiento'}
            </h2>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ✕
          </button>
        </div>

        {loading && <p className="text-sm text-gray-500">Cargando plan de tratamiento...</p>}

        {error && (
          <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="mt-3 rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
            >
              Reintentar
            </button>
          </div>
        )}

        {plan && (
          <div className="space-y-6">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Dentista responsable
                </dt>
                <dd className="text-sm text-gray-900">{providerName || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Fecha de creación
                </dt>
                <dd className="text-sm text-gray-900">{formatDate(plan.createdAt)}</dd>
              </div>
              {plan.acceptedAt && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Fecha de aceptación
                  </dt>
                  <dd className="text-sm text-gray-900">{formatDate(plan.acceptedAt)}</dd>
                </div>
              )}
              {plan.clinicalVisitId && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Consulta relacionada
                  </dt>
                  <dd className="text-sm text-gray-900">Sí</dd>
                </div>
              )}
            </dl>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Ítems del plan</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="pb-2 pr-2">Descripción</th>
                      <th className="pb-2 pr-2">Diente (FDI)</th>
                      <th className="pb-2 pr-2">Cantidad</th>
                      <th className="pb-2 pr-2">Costo unitario</th>
                      <th className="pb-2 pr-2">Costo de línea</th>
                      <th className="pb-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.items.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="py-2 pr-2 text-gray-900">{item.description}</td>
                        <td className="py-2 pr-2 text-gray-700">{item.tooth ?? '—'}</td>
                        <td className="py-2 pr-2 text-gray-700">{item.quantity}</td>
                        <td className="py-2 pr-2 text-gray-700">{formatCurrency(item.unitPrice)}</td>
                        <td className="py-2 pr-2 text-gray-700">{formatCurrency(lineTotal(item))}</td>
                        <td className="py-2 text-gray-700">
                          {ITEM_STATUS_LABELS[item.status] ?? item.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-1 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Subtotal</span>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">Total</span>
                <span className="text-base font-semibold text-gray-900">
                  {formatCurrency(plan.totalAmount)}
                </span>
              </div>
            </div>

            {plan.notes && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Notas</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{plan.notes}</p>
              </div>
            )}

            {canEdit && (
              <div className="flex justify-end border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => onEdit?.(plan.id)}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Editar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
