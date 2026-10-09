'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/admin/DataTable';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { FormModal } from '@/components/admin/FormModal';
import { LoadingState } from '@/components/admin/LoadingState';
import { Pagination } from '@/components/admin/Pagination';

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

type PaginationMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Tamaño de página fijo: el endpoint usa 20 por defecto y la vista no ofrece
// selector de `pageSize` (requirement "Control de paginación en la vista").
const PAGE_SIZE = 20;
const emptyHour = { providerId: '', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' };

// Parseo defensivo de `?page=n`: vacío, no numérico, cero o negativo cae en 1
// (init única desde la URL, deep link).
function parsePage(raw: string | null | undefined): number {
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 ? value : 1;
}

// Proyección del estado a la URL: `page` solo cuando la página activa no es 1
// y `providerId` solo con filtro activo (requirements de URL). La ruta solo
// define esos dos parámetros, así que reconstruirlos preserva todo su estado.
function businessHoursUrl(page: number, providerId: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (providerId) params.set('providerId', providerId);
  const query = params.toString();
  return query.length > 0 ? `/business-hours?${query}` : '/business-hours';
}

// URL del request paginado: mismos criterios de omisión que la URL pública.
function listRequestUrl(page: number, providerId: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (providerId) params.set('providerId', providerId);
  const query = params.toString();
  return query.length > 0
    ? `/api/admin/business-hours?${query}`
    : '/api/admin/business-hours';
}

export default function BusinessHoursPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(() => parsePage(searchParams?.get('page')));
  const [providerFilter, setProviderFilter] = useState(
    () => searchParams?.get('providerId') ?? ''
  );
  const [loading, setLoading] = useState(true);
  // Verdadero mientras se resuelve una página fuera de rango: evita renderizar
  // una tabla vacía y mantiene el control de paginación visible.
  const [normalizing, setNormalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessHour | null>(null);
  const [form, setForm] = useState(emptyHour);
  const [submitting, setSubmitting] = useState(false);

  // Una sola carga por combinación (página + filtro), con guardia de respuesta
  // obsoleta y sin recargar la aplicación.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [hoursRes, providersRes] = await Promise.all([
          fetch(listRequestUrl(page, providerFilter)),
          fetch('/api/admin/providers'),
        ]);
        if (!hoursRes.ok) throw new Error('Error al cargar horarios');
        if (!providersRes.ok) throw new Error('Error al cargar proveedores');
        const hoursData = await hoursRes.json();
        const providersData = await providersRes.json();
        if (cancelled) return;

        const meta: PaginationMeta | null = hoursData.pagination ?? null;
        const received: BusinessHour[] = hoursData.businessHours ?? [];
        setProviders(providersData.providers ?? []);

        // Página fuera de rango con resultados existentes: el servidor responde
        // vacío con metadatos reales; se normaliza a la última página.
        if (meta && meta.total > 0 && meta.page > meta.totalPages) {
          setPagination(meta);
          setNormalizing(true);
          setPage(meta.totalPages);
          router.replace(businessHoursUrl(meta.totalPages, providerFilter));
          return;
        }
        // Conjunto sin resultados y página ya fuera de rango: se resuelve la
        // página 1 para no dejar la URL apuntando a una página inexistente.
        if (meta && meta.total === 0 && page > 1) {
          setNormalizing(false);
          setHours([]);
          setPagination(meta);
          setPage(1);
          router.replace(businessHoursUrl(1, providerFilter));
          return;
        }

        setNormalizing(false);
        setHours(received);
        // El modo lista trae metadatos; se tolera su ausencia (mocks y
        // respuestas legacy) derivando el total de la página recibida.
        setPagination(
          meta ?? {
            total: received.length,
            page,
            pageSize: PAGE_SIZE,
            totalPages: received.length > 0 ? 1 : 0,
          }
        );
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page, providerFilter, reloadToken, router]);

  function reload() {
    setReloadToken((token) => token + 1);
  }

  // Cambio de página: estado local como fuente de verdad, guardia de
  // reescritura redundante y `router.replace` sin agregar historial.
  function handlePageChange(nextPage: number) {
    if (nextPage === page) return;
    setPage(nextPage);
    router.replace(businessHoursUrl(nextPage, providerFilter));
  }

  // Cambiar el proveedor vuelve a la página 1 (una sola actualización de
  // estado) y reescribe la URL con el filtro nuevo, sin `page`.
  function handleProviderChange(value: string) {
    setProviderFilter(value);
    if (page !== 1) setPage(1);
    router.replace(businessHoursUrl(1, value));
  }

  function clearProviderFilter() {
    setProviderFilter('');
    if (page !== 1) setPage(1);
    router.replace(businessHoursUrl(1, ''));
  }

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
      reload();
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
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  function providerName(id: string) {
    return providers.find((p) => p.id === id)?.name ?? id;
  }

  const hasActiveFilter = providerFilter !== '';
  // El estado vacío distingue catálogo vacío de filtro sin coincidencias.
  const emptyMessage = hasActiveFilter
    ? 'No hay horarios que coincidan con el filtro.'
    : 'No hay horarios registrados.';

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

      <div className="mb-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Filtros</h2>
          {hasActiveFilter && (
            <button
              onClick={clearProviderFilter}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Limpiar filtro
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label
              htmlFor="filter-provider"
              className="block text-xs font-medium text-gray-600"
            >
              Proveedor
            </label>
            <select
              id="filter-provider"
              value={providerFilter}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Todos</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && normalizing && <LoadingState />}
      {!loading && !error && !normalizing && hours.length === 0 && (
        <EmptyState message={emptyMessage} />
      )}
      {!loading && !error && !normalizing && hours.length > 0 && (
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
      {!loading && !error && pagination && pagination.total > 0 && (
        <Pagination
          ariaLabel="Paginación de horarios"
          page={page}
          pageSize={pagination.pageSize || PAGE_SIZE}
          total={pagination.total}
          onPageChange={handlePageChange}
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
