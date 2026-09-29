'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  ClinicalVisit,
  Provider,
  Service,
  TreatmentPlanItem,
  TreatmentPlanItemInput,
  TreatmentPlanItemUpdateInput,
  TreatmentPlanWithItems,
} from '@/lib/admin/types';
import { FormModal } from '@/components/admin/FormModal';

type TreatmentPlanFormProps = {
  patientId: string;
  plan: TreatmentPlanWithItems | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type DraftItem = {
  id?: string;
  description: string;
  serviceId: string | null;
  tooth: string | null;
  quantity: number;
  unitPrice: number;
  status: 'pending' | 'done';
};

function emptyItem(): DraftItem {
  return {
    description: '',
    serviceId: null,
    tooth: null,
    quantity: 1,
    unitPrice: 0,
    status: 'pending',
  };
}

function itemToDraft(item: TreatmentPlanItem): DraftItem {
  return {
    id: item.id,
    description: item.description,
    serviceId: item.serviceId,
    tooth: item.tooth,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    status: item.status,
  };
}

function moneyToCents(amount: number): number {
  return Math.round(amount * 100);
}

function sumLineTotals(items: { quantity: number; unitPrice: number }[]): number {
  const cents = items.reduce((acc, it) => acc + it.quantity * moneyToCents(it.unitPrice), 0);
  return cents / 100;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' });
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  presented: 'Presentado',
  accepted: 'Aceptado',
  in_progress: 'En progreso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const NEXT_TRANSITIONS: Record<string, { status: string; label: string }[]> = {
  draft: [{ status: 'presented', label: 'Presentar' }],
  presented: [
    { status: 'accepted', label: 'Aceptar' },
    { status: 'draft', label: 'Volver a borrador' },
  ],
  accepted: [{ status: 'in_progress', label: 'Iniciar tratamiento' }],
  in_progress: [{ status: 'completed', label: 'Completar' }],
  completed: [],
  cancelled: [],
};

export function TreatmentPlanForm({
  patientId,
  plan,
  isOpen,
  onClose,
  onSaved,
}: TreatmentPlanFormProps) {
  const isReadOnly = plan ? plan.status !== 'draft' : false;
  const isCreate = !plan;

  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [visits, setVisits] = useState<ClinicalVisit[]>([]);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const [name, setName] = useState(plan?.name ?? '');
  const [providerId, setProviderId] = useState(plan?.providerId ?? '');
  const [clinicalVisitId, setClinicalVisitId] = useState<string | null>(plan?.clinicalVisitId ?? null);
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [items, setItems] = useState<DraftItem[]>(() =>
    plan ? plan.items.map(itemToDraft) : [emptyItem()]
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setMetadataLoading(true);
    setMetadataError(null);

    Promise.all([
      fetch('/api/admin/providers').then((res) => res.json()),
      fetch('/api/admin/services').then((res) => res.json()),
      fetch(`/api/admin/patients/${patientId}/clinical-visits`).then((res) => res.json()),
    ])
      .then(([providersData, servicesData, visitsData]) => {
        setProviders(providersData.providers ?? []);
        setServices(servicesData.services ?? []);
        setVisits(visitsData.clinicalVisits ?? []);
      })
      .catch(() => {
        setMetadataError('Error al cargar datos del formulario');
      })
      .finally(() => {
        setMetadataLoading(false);
      });
  }, [isOpen, patientId]);

  useEffect(() => {
    setName(plan?.name ?? '');
    setProviderId(plan?.providerId ?? '');
    setClinicalVisitId(plan?.clinicalVisitId ?? null);
    setNotes(plan?.notes ?? '');
    setItems(plan ? plan.items.map(itemToDraft) : [emptyItem()]);
    setError(null);
  }, [plan, isOpen]);

  const total = useMemo(() => sumLineTotals(items), [items]);

  function handleItemChange(index: number, field: keyof DraftItem, value: unknown) {
    if (isReadOnly) return;
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === 'quantity' || field === 'unitPrice') {
          const num = typeof value === 'string' ? Number(value) : Number(value ?? 0);
          return { ...item, [field]: Number.isNaN(num) ? 0 : num };
        }
        return { ...item, [field]: value };
      })
    );
  }

  function handleAddItem() {
    if (isReadOnly) return;
    setItems((prev) => [...prev, emptyItem()]);
  }

  function handleRemoveItem(index: number) {
    if (isReadOnly) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function buildItemInput(item: DraftItem): TreatmentPlanItemInput {
    return {
      description: item.description,
      serviceId: item.serviceId || null,
      tooth: item.tooth || null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    };
  }

  async function handleSubmit() {
    if (isReadOnly) return;

    setSaving(true);
    setError(null);

    try {
      const validItems = items.filter((it) => it.description.trim() !== '');

      if (isCreate) {
        const res = await fetch(`/api/admin/patients/${patientId}/treatment-plans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            providerId,
            clinicalVisitId: clinicalVisitId || null,
            notes: notes || null,
            items: validItems.map(buildItemInput),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Error al crear el plan');
        }
      } else {
        const headerRes = await fetch(
          `/api/admin/patients/${patientId}/treatment-plans/${plan.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              providerId,
              clinicalVisitId: clinicalVisitId || null,
              notes: notes || null,
            }),
          }
        );

        if (!headerRes.ok) {
          const data = await headerRes.json().catch(() => ({}));
          throw new Error(data.error || 'Error al actualizar el plan');
        }

        const originalById = new Map(plan.items.map((it) => [it.id, it]));
        const currentById = new Map(items.filter((it) => it.id).map((it) => [it.id, it]));

        for (const original of plan.items) {
          if (!currentById.has(original.id)) {
            const res = await fetch(
              `/api/admin/patients/${patientId}/treatment-plans/${plan.id}/items/${original.id}`,
              { method: 'DELETE' }
            );
            if (!res.ok) throw new Error('Error al eliminar un ítem');
          }
        }

        for (const item of items) {
          if (!item.id) {
            const res = await fetch(
              `/api/admin/patients/${patientId}/treatment-plans/${plan.id}/items`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildItemInput(item)),
              }
            );
            if (!res.ok) throw new Error('Error al agregar un ítem');
          } else {
            const original = originalById.get(item.id);
            const changed: Partial<TreatmentPlanItemUpdateInput> = {};
            if (original && item.description !== original.description) {
              changed.description = item.description;
            }
            if (original && item.serviceId !== original.serviceId) {
              changed.serviceId = item.serviceId || null;
            }
            if (original && item.tooth !== original.tooth) {
              changed.tooth = item.tooth || null;
            }
            if (original && item.quantity !== original.quantity) {
              changed.quantity = item.quantity;
            }
            if (original && item.unitPrice !== original.unitPrice) {
              changed.unitPrice = item.unitPrice;
            }
            if (original && item.status !== original.status) {
              changed.status = item.status;
            }

            if (Object.keys(changed).length > 0) {
              const res = await fetch(
                `/api/admin/patients/${patientId}/treatment-plans/${plan.id}/items/${item.id}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(changed),
                }
              );
              if (!res.ok) throw new Error('Error al actualizar un ítem');
            }
          }
        }
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(status: string) {
    if (!plan) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/patients/${patientId}/treatment-plans/${plan.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al cambiar el estado del plan');
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  const title = isCreate
    ? 'Nuevo plan de tratamiento'
    : isReadOnly
      ? 'Ver plan de tratamiento'
      : 'Editar plan de tratamiento';

  const inputClass =
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500';
  const labelClass = 'block text-sm font-medium text-gray-700';
  const selectClass = `${inputClass} bg-white`;
  const tableInputClass =
    'w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500';

  return (
    <FormModal
      title={title}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isReadOnly ? undefined : isCreate ? 'Guardar plan' : 'Guardar cambios'}
      isSubmitting={saving}
    >
      {metadataLoading && <p className="text-sm text-gray-500">Cargando formulario...</p>}
      {metadataError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{metadataError}</div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!isCreate && (
        <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
          <span className="text-sm font-medium text-gray-700">
            Estado: {STATUS_LABELS[plan.status] ?? plan.status}
          </span>
          <span className="text-sm text-gray-500">Total guardado: {formatCurrency(plan.totalAmount)}</span>
        </div>
      )}

      <div>
        <label htmlFor="plan-name" className={labelClass}>
          Nombre del plan
        </label>
        <input
          id="plan-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isReadOnly}
          className={inputClass}
          required
        />
      </div>

      <div>
        <label htmlFor="plan-provider" className={labelClass}>
          Dentista responsable
        </label>
        <select
          id="plan-provider"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          disabled={isReadOnly}
          className={selectClass}
          required
        >
          <option value="">Seleccionar dentista</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="plan-visit" className={labelClass}>
          Consulta relacionada (opcional)
        </label>
        <select
          id="plan-visit"
          value={clinicalVisitId ?? ''}
          onChange={(e) => setClinicalVisitId(e.target.value || null)}
          disabled={isReadOnly}
          className={selectClass}
        >
          <option value="">Ninguna</option>
          {visits.map((v) => (
            <option key={v.id} value={v.id}>
              {formatDate(v.createdAt)} — {v.subjective}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="plan-notes" className={labelClass}>
          Notas
        </label>
        <textarea
          id="plan-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isReadOnly}
          className={`${inputClass} resize-y`}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Ítems del plan</h3>
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleAddItem}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              + Agregar ítem
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="pb-2 pr-2">Descripción</th>
                <th className="pb-2 pr-2">Diente (FDI)</th>
                <th className="pb-2 pr-2">Cant.</th>
                <th className="pb-2 pr-2">Precio unit.</th>
                <th className="pb-2 pr-2">Servicio</th>
                <th className="pb-2 pr-2">Estado</th>
                {!isReadOnly && <th className="pb-2">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b border-gray-100">
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Descripción"
                      className={tableInputClass}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={item.tooth ?? ''}
                      onChange={(e) => handleItemChange(index, 'tooth', e.target.value || null)}
                      disabled={isReadOnly}
                      placeholder="11"
                      className={`${tableInputClass} w-16`}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="1"
                      className={`${tableInputClass} w-16`}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="0.00"
                      className={`${tableInputClass} w-24`}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={item.serviceId ?? ''}
                      onChange={(e) => handleItemChange(index, 'serviceId', e.target.value || null)}
                      disabled={isReadOnly}
                      className={tableInputClass}
                    >
                      <option value="">—</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    {isReadOnly ? (
                      <span className="text-sm text-gray-700">
                        {item.status === 'done' ? 'Realizado' : 'Pendiente'}
                      </span>
                    ) : (
                      <select
                        value={item.status}
                        onChange={(e) =>
                          handleItemChange(index, 'status', e.target.value as 'pending' | 'done')
                        }
                        className={tableInputClass}
                      >
                        <option value="pending">Pendiente</option>
                        <option value="done">Realizado</option>
                      </select>
                    )}
                  </td>
                  {!isReadOnly && (
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end border-t border-gray-200 pt-3">
          <span className="text-base font-semibold text-gray-900">
            Total: {formatCurrency(total)}
          </span>
        </div>
      </div>

      {!isCreate && NEXT_TRANSITIONS[plan.status]?.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
          {NEXT_TRANSITIONS[plan.status].map((transition) => (
            <button
              key={transition.status}
              type="button"
              onClick={() => handleTransition(transition.status)}
              disabled={saving}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {transition.label}
            </button>
          ))}
        </div>
      )}
    </FormModal>
  );
}
