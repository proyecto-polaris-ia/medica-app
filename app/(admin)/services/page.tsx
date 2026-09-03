'use client';

import { useEffect, useState } from 'react';
import { DataTable } from '@/components/admin/DataTable';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { FormModal } from '@/components/admin/FormModal';
import { LoadingState } from '@/components/admin/LoadingState';

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  createdAt: string;
  updatedAt: string;
};

const emptyService = { name: '', durationMinutes: 30 };

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState(emptyService);
  const [submitting, setSubmitting] = useState(false);

  async function loadServices() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/services');
      if (!res.ok) throw new Error('Error al cargar servicios');
      const data = await res.json();
      setServices(data.services);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServices();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyService);
    setIsModalOpen(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    setForm({ name: service.name, durationMinutes: service.durationMinutes });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyService);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const url = editing
        ? `/api/admin/services/${editing.id}`
        : '/api/admin/services';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al guardar el servicio');
      }

      closeModal();
      await loadServices();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(service: Service) {
    if (!confirm('¿Eliminar este servicio?')) return;
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar el servicio');
      await loadServices();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Servicios</h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nuevo servicio
        </button>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={loadServices} />}
      {!loading && !error && services.length === 0 && (
        <EmptyState message="No hay servicios registrados." />
      )}
      {!loading && !error && services.length > 0 && (
        <DataTable
          columns={[
            { header: 'Nombre', cell: (s) => s.name },
            { header: 'Duración (min)', cell: (s) => s.durationMinutes },
          ]}
          rows={services}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {isModalOpen && (
        <FormModal
          title={editing ? 'Editar servicio' : 'Nuevo servicio'}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitLabel={editing ? 'Guardar cambios' : 'Crear servicio'}
          isSubmitting={submitting}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nombre
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Duración (minutos)
            </label>
            <input
              type="number"
              min={1}
              value={form.durationMinutes}
              onChange={(e) =>
                setForm({ ...form, durationMinutes: parseInt(e.target.value, 10) || 0 })
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
        </FormModal>
      )}
    </div>
  );
}
