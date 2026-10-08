'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/admin/DataTable';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { FormModal } from '@/components/admin/FormModal';
import { LoadingState } from '@/components/admin/LoadingState';

type Patient = {
  id: string;
  fullName: string;
  phoneE164: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const emptyPatient = {
  fullName: '',
  phoneE164: '',
  email: '',
  notes: '',
};

const DEBOUNCE_MS = 300;
const SEARCH_MIN_CHARS = 2;
const PAGE_SIZE = 20;
const SEARCH_PLACEHOLDER = 'Buscar paciente por nombre, teléfono o correo';
const SUGGESTIONS_LABEL = 'Sugerencias de pacientes';
const LOAD_ERROR_MESSAGE = 'Error al cargar pacientes';

/**
 * Texto efectivo de búsqueda: por debajo del mínimo la vista no filtra y
 * muestra el listado completo, así que un texto corto colapsa a `''`.
 */
function effectiveQuery(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= SEARCH_MIN_CHARS ? trimmed : '';
}

function initialPageFromParam(raw: string | null | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildListUrl(q: string, page: number, pageSize: number): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return `/api/admin/patients?${params.toString()}`;
}

export default function PatientsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams?.get('q') ?? '';

  const [searchInput, setSearchInput] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(() => effectiveQuery(initialQuery));
  const [page, setPage] = useState(() => initialPageFromParam(searchParams?.get('page')));
  const [patients, setPatients] = useState<Patient[]>([]);
  const [suggestions, setSuggestions] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState(emptyPatient);
  const [submitting, setSubmitting] = useState(false);
  // Última búsqueda efectiva aplicada: evita refetch cuando el texto se queda
  // por debajo del mínimo (1 carácter no debe disparar ninguna consulta).
  const appliedQueryRef = useRef(effectiveQuery(initialQuery));

  // Debounce: la consulta efectiva cambia 300 ms después de la última edición.
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = effectiveQuery(searchInput);
      if (next !== appliedQueryRef.current) {
        appliedQueryRef.current = next;
        setDebouncedQuery(next);
        setPage(1);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [searchInput]);

  // Un solo fetch de lista por (búsqueda efectiva, page); las sugerencias
  // derivan de la misma respuesta (design.md, Decisión 6).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(buildListUrl(debouncedQuery, page, PAGE_SIZE));
        if (!res.ok) throw new Error(LOAD_ERROR_MESSAGE);

        const data = (await res.json()) as {
          patients?: Patient[];
          page?: number;
          total?: number;
          totalPages?: number;
        };
        if (cancelled) return;

        const received = data.patients ?? [];
        const serverTotalPages = Math.max(1, data.totalPages ?? 1);
        setPatients(received);
        setTotal(data.total ?? 0);
        setTotalPages(serverTotalPages);
        setSuggestions(debouncedQuery ? received : []);

        // Página fuera de rango: el servidor responde vacío con metadatos
        // reales; se normaliza a la última página y se refresca una sola vez.
        if (typeof data.page === 'number' && data.page > serverTotalPages) {
          setPage(serverTotalPages);
        }
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
  }, [debouncedQuery, page, reloadToken]);

  // Proyección del estado a la URL (navegación del cliente, sin recarga). El
  // guard de redundancia evita bucles con `searchParams`.
  const currentQueryString = searchParams?.toString() ?? '';
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (page > 1) params.set('page', String(page));
    const next = params.toString();
    if (next !== currentQueryString) {
      router.replace(next ? `/patients?${next}` : '/patients');
    }
  }, [debouncedQuery, page, router, currentQueryString]);

  const searchActive = debouncedQuery.length >= SEARCH_MIN_CHARS;
  const rows = selectedPatient ? [selectedPatient] : patients;
  const showSearchEmpty = !loading && !error && rows.length === 0 && searchActive;
  const showNoPatientsEmpty = !loading && !error && rows.length === 0 && !searchActive;
  const showPagination =
    !selectedPatient && !loading && !error && !showSearchEmpty && patients.length > 0;

  function reload() {
    setReloadToken((token) => token + 1);
  }

  function clearSearch() {
    appliedQueryRef.current = '';
    setSearchInput('');
    setDebouncedQuery('');
    setSelectedPatient(null);
    setSuggestions([]);
    setPage(1);
  }

  function selectSuggestion(patient: Patient) {
    setSelectedPatient(patient);
    setSuggestions([]);
    setSearchInput(patient.fullName);
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setSelectedPatient(null);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyPatient);
    setIsModalOpen(true);
  }

  function openEdit(patient: Patient) {
    setEditing(patient);
    setForm({
      fullName: patient.fullName,
      phoneE164: patient.phoneE164 ?? '',
      email: patient.email ?? '',
      notes: patient.notes ?? '',
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyPatient);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const url = editing
        ? `/api/admin/patients/${editing.id}`
        : '/api/admin/patients';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          phoneE164: form.phoneE164 || null,
          email: form.email || null,
          notes: form.notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al guardar el paciente');
      }

      closeModal();
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(patient: Patient) {
    if (!confirm('¿Eliminar este paciente?')) return;
    try {
      const res = await fetch(`/api/admin/patients/${patient.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar el paciente');
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Pacientes</h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nuevo paciente
        </button>
      </div>

      <div className="mb-4">
        <label htmlFor="patient-search" className="sr-only">
          Buscar pacientes
        </label>
        <div className="flex items-center gap-2">
          <input
            id="patient-search"
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={SEARCH_PLACEHOLDER}
            autoComplete="off"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          {searchInput.length > 0 && !showSearchEmpty && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Limpiar búsqueda"
              className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Limpiar
            </button>
          )}
        </div>

        {!selectedPatient && suggestions.length > 0 && (
          <ul
            aria-label={SUGGESTIONS_LABEL}
            className="mt-1 rounded-lg border border-gray-200 bg-white"
          >
            {suggestions.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  onClick={() => selectSuggestion(patient)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50"
                >
                  <span className="font-medium">{patient.fullName}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {patient.phoneE164 ?? patient.email ?? 'Sin contacto'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}
      {showSearchEmpty && (
        <div>
          <EmptyState message="Sin coincidencias para esta búsqueda." />
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Limpiar búsqueda
            </button>
          </div>
        </div>
      )}
      {showNoPatientsEmpty && <EmptyState message="No hay pacientes registrados." />}

      {!loading && !error && rows.length > 0 && (
        <>
          <DataTable
            columns={[
              {
                header: 'Expediente',
                cell: (p) => (
                  <Link
                    href={`/patients/${p.id}`}
                    aria-label={`Ver expediente de ${p.fullName}`}
                    title={`Ver expediente de ${p.fullName}`}
                    className="text-lg text-green-700 hover:text-green-900"
                  >
                    📋
                  </Link>
                ),
              },
              { header: 'Nombre', cell: (p) => p.fullName },
              { header: 'Teléfono', cell: (p) => p.phoneE164 || '-' },
              { header: 'Correo', cell: (p) => p.email || '-' },
              { header: 'Notas', cell: (p) => p.notes || '-' },
            ]}
            rows={rows}
            onEdit={openEdit}
            onDelete={handleDelete}
          />

          {showPagination && (
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>
                  Página {page} de {totalPages}
                </span>
                <span className="text-gray-500">({total} pacientes)</span>
              </div>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}

      {isModalOpen && (
        <FormModal
          title={editing ? 'Editar paciente' : 'Nuevo paciente'}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitLabel={editing ? 'Guardar cambios' : 'Crear paciente'}
          isSubmitting={submitting}
        >
          <div>
            <label htmlFor="patient-full-name" className="block text-sm font-medium text-gray-700">
              Nombre completo
            </label>
            <input
              id="patient-full-name"
              type="text"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="patient-phone" className="block text-sm font-medium text-gray-700">
              Teléfono (E.164)
            </label>
            <input
              id="patient-phone"
              type="tel"
              value={form.phoneE164}
              onChange={(e) => setForm({ ...form, phoneE164: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="+5215512345678"
            />
          </div>
          <div>
            <label htmlFor="patient-email" className="block text-sm font-medium text-gray-700">Correo electrónico</label>
            <input id="patient-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" placeholder="maria@ejemplo.com" />
          </div>
          <div>
            <label htmlFor="patient-notes" className="block text-sm font-medium text-gray-700">
              Notas
            </label>
            <textarea
              id="patient-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              rows={3}
            />
          </div>
        </FormModal>
      )}
    </div>
  );
}
