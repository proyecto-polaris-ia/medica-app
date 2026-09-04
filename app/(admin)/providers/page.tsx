'use client';

import { useEffect, useState } from 'react';
import { DataTable } from '@/components/admin/DataTable';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { FormModal } from '@/components/admin/FormModal';
import { LoadingState } from '@/components/admin/LoadingState';
import type { Provider } from '@/lib/admin/types';
import { FALLBACK_COLOR } from '@/lib/admin/timezone';

const emptyProvider = { name: '', color: '' };

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [form, setForm] = useState(emptyProvider);
  const [submitting, setSubmitting] = useState(false);

  async function loadProviders() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/providers');
      if (!res.ok) throw new Error('Error al cargar proveedores');
      const data = await res.json();
      setProviders(data.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProviders();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyProvider);
    setIsModalOpen(true);
  }

  function openEdit(provider: Provider) {
    setEditing(provider);
    setForm({ name: provider.name, color: provider.color ?? '' });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyProvider);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const url = editing
        ? `/api/admin/providers/${editing.id}`
        : '/api/admin/providers';
      const method = editing ? 'PATCH' : 'POST';
      const payload = {
        name: form.name,
        color: form.color || null,
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al guardar el proveedor');
      }

      closeModal();
      await loadProviders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(provider: Provider) {
    if (!confirm('¿Eliminar este proveedor?')) return;
    try {
      const res = await fetch(`/api/admin/providers/${provider.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar el proveedor');
      await loadProviders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  const colorPreview = isValidHex(form.color) ? form.color : FALLBACK_COLOR;
  const colorHint = form.color && !isValidHex(form.color)
    ? 'Formato inválido. Se guardará sin color.'
    : '';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nuevo proveedor
        </button>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={loadProviders} />}
      {!loading && !error && providers.length === 0 && (
        <EmptyState message="No hay proveedores registrados." />
      )}
      {!loading && !error && providers.length > 0 && (
        <DataTable
          columns={[
            { header: 'Nombre', cell: (p) => p.name },
            {
              header: 'Color',
              cell: (p) => (
                <span
                  className="inline-block h-4 w-4 rounded-full border border-gray-300"
                  style={{ backgroundColor: p.color || FALLBACK_COLOR }}
                  aria-label={p.color ? `Color ${p.color}` : 'Sin color'}
                />
              ),
            },
          ]}
          rows={providers}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {isModalOpen && (
        <FormModal
          title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitLabel={editing ? 'Guardar cambios' : 'Crear proveedor'}
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
              Color (hex)
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="text"
                value={form.color}
                placeholder="#1f77b4"
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="block w-full rounded-md border border-gray-300 px-3 py-2"
              />
              <span
                className="inline-block h-8 w-8 shrink-0 rounded-full border border-gray-300"
                style={{ backgroundColor: colorPreview }}
                aria-label="Vista previa del color"
              />
            </div>
            {colorHint && (
              <p className="mt-1 text-xs text-amber-600">{colorHint}</p>
            )}
          </div>
        </FormModal>
      )}
    </div>
  );
}
