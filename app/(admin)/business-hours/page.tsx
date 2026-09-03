'use client';

import { useEffect, useState } from 'react';
import { DataTable } from '@/components/admin/DataTable';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { FormModal } from '@/components/admin/FormModal';
import { LoadingState } from '@/components/admin/LoadingState';

type Provider = {
  id: string;
  name: string;
};

type BusinessHour = {
  id: string;
  providerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const emptyHour = { providerId: '', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' };

export default function BusinessHoursPage() {
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessHour | null>(null);
  const [form, setForm] = useState(emptyHour);
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [hoursRes, providersRes] = await Promise.all([
        fetch('/api/admin/business-hours'),
        fetch('/api/admin/providers'),
      ]);
      if (!hoursRes.ok) throw new Error('Error al cargar horarios');
      if (!providersRes.ok) throw new Error('Error al cargar proveedores');
      const hoursData = await hoursRes.json();
      const providersData = await providersRes.json();
      setHours(hoursData.businessHours);
      setProviders(providersData.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyHour);
    setIsModalOpen(true);
  }

  function openEdit(hour: BusinessHour) {
    setEditing(hour);
    setForm({
      providerId: hour.providerId,
      dayOfWeek: hour.dayOfWeek,
      startTime: hour.startTime,
      endTime: hour.endTime,
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyHour);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const url = editing
        ? `/api/admin/business-hours/${editing.id}`
        : '/api/admin/business-hours';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al guardar el horario');
      }

      closeModal();
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(hour: BusinessHour) {
    if (!confirm('¿Eliminar este horario?')) return;
    try {
      const res = await fetch(`/api/admin/business-hours/${hour.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar el horario');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  function providerName(id: string) {
    return providers.find((p) => p.id === id)?.name ?? id;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Horarios</h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nuevo horario
        </button>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={loadData} />}
      {!loading && !error && hours.length === 0 && (
        <EmptyState message="No hay horarios registrados." />
      )}
      {!loading && !error && hours.length > 0 && (
        <DataTable
          columns={[
            { header: 'Proveedor', cell: (h) => providerName(h.providerId) },
            { header: 'Día', cell: (h) => DAYS[h.dayOfWeek] },
            { header: 'Inicio', cell: (h) => h.startTime },
            { header: 'Fin', cell: (h) => h.endTime },
          ]}
          rows={hours}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {isModalOpen && (
        <FormModal
          title={editing ? 'Editar horario' : 'Nuevo horario'}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitLabel={editing ? 'Guardar cambios' : 'Crear horario'}
          isSubmitting={submitting}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Proveedor
            </label>
            <select
              value={form.providerId}
              onChange={(e) => setForm({ ...form, providerId: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Selecciona un proveedor</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Día de la semana
            </label>
            <select
              value={form.dayOfWeek}
              onChange={(e) =>
                setForm({ ...form, dayOfWeek: parseInt(e.target.value, 10) })
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            >
              {DAYS.map((day, index) => (
                <option key={index} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Hora inicio
              </label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Hora fin
              </label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
}
