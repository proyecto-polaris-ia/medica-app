'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/admin/DataTable';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { FormModal } from '@/components/admin/FormModal';
import { LoadingState } from '@/components/admin/LoadingState';
import { MonthCalendar } from '@/components/admin/calendar/MonthCalendar';
import { CalendarNav } from '@/components/admin/calendar/CalendarNav';
import { ProviderLegend } from '@/components/admin/calendar/ProviderLegend';
import { ServiceFilter } from '@/components/admin/calendar/ServiceFilter';
import { PatientRecordModal } from '@/components/admin/PatientRecordModal';
import type { Appointment, AppointmentReminderSummary, Provider } from '@/lib/admin/types';
import { statusLabel } from '@/lib/admin/appointment-labels';
import {
  clinicLocalInputToUtc,
  clinicMonthRangeUtc,
  clinicTimeLabel,
  CLINIC_TZ,
  FALLBACK_COLOR,
  getCurrentClinicMonth,
  groupAppointmentsByDay,
  toClinicLocalInput,
} from '@/lib/admin/timezone';

type Reference = {
  id: string;
  name: string;
};

type ViewMode = 'list' | 'calendar';
type SortField = 'startAt' | 'endAt' | 'patient' | 'service' | 'provider' | 'status';
type SortDirection = 'asc' | 'desc';

const STATUS_OPTIONS = [
  'requested',
  'confirmed',
  'pending',
  'cancelled',
  'rescheduled',
  'no_show',
  'attended',
];

const emptyAppointment = {
  patientId: '',
  serviceId: '',
  providerId: '',
  startAt: '',
  endAt: '',
  status: 'requested',
  notes: '',
};

// La captura y el despliegue de horas de la cita usan SIEMPRE la zona
// clínica (America/Mexico_City), nunca la zona del navegador.
function toLocalInput(iso: string): string {
  return toClinicLocalInput(iso);
}

function fromLocalInput(value: string): string {
  return clinicLocalInputToUtc(value);
}

// Fecha/hora del envío del recordatorio SIEMPRE en la zona clínica
// (America/Mexico_City), nunca en la zona del navegador. Produce
// "3 oct 2026, 09:15".
const REMINDER_DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatReminderSentAt(iso: string): string {
  return REMINDER_DATE_FORMATTER.format(new Date(iso));
}

// Fecha/hora de la cita en la lista: SIEMPRE en la zona clínica
// (America/Mexico_City), nunca en la zona del navegador.
const APPOINTMENT_DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  timeZone: CLINIC_TZ,
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(iso: string): string {
  return APPOINTMENT_DATE_FORMATTER.format(new Date(iso));
}

function statusLabel(status: Appointment['status']): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmada';
    case 'requested':
    case 'pending':
      return 'Sin confirmar';
    case 'cancelled':
      return 'Cancelada';
    case 'rescheduled':
      return 'Reagendada';
    case 'no_show':
      return 'No asistió';
    case 'attended':
      return 'Atendida';
    default:
      return status;
  }
}

// Nunca muestra una fecha de recordatorio inexistente: cuando no hay `sentAt`
// cae en el estado correspondiente (programado/falló/simulado).
function reminderLabel(reminder: AppointmentReminderSummary): string {
  if (reminder.dryRun && reminder.status === 'scheduled') {
    return 'Simulado (dry-run)';
  }
  if (reminder.status === 'sent' && reminder.sentAt) {
    return reminder.cadence === 'h24'
      ? `Recordatorio H-24 enviado el ${formatReminderSentAt(reminder.sentAt)}`
      : `Recordatorio día mismo enviado el ${formatReminderSentAt(reminder.sentAt)}`;
  }
  if (reminder.status === 'failed') {
    return reminder.cadence === 'h24'
      ? 'Recordatorio H-24 falló'
      : 'Recordatorio día mismo falló';
  }
  return reminder.cadence === 'h24'
    ? 'Recordatorio H-24 programado'
    : 'Recordatorio día mismo programado';
}

// Parseo defensivo del parámetro de URL del calendario. `'all'` se tolera solo
// al leer (enlaces escritos a mano); el estado interno nunca usa ese centinela:
// la selección vacía `[]` es la única representación de "todos".
function parseIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of raw.split(',')) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === 'all') continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

// #174: conserva el nombre y el comportamiento (tolerante a `all`, vacíos).
function parseProviderIds(raw: string | null | undefined): string[] {
  return parseIdList(raw);
}

// #177: mismo contrato de parseo para servicios.
function parseServiceIds(raw: string | null | undefined): string[] {
  return parseIdList(raw);
}

// Siguiente conjunto de selección al alternar una entrada de la leyenda.
function nextCalendarSelection(
  effective: string[],
  id: string
): string[] {
  return effective.includes(id)
    ? effective.filter((value) => value !== id)
    : [...effective, id];
}

// Expansión `[]`→`allIds`: el estado vacío significa "todos", así que al
// alternar una entrada se parte del universo visible completo.
function effectiveSelection(selected: string[], allIds: string[]): string[] {
  return selected.length === 0 ? allIds : selected;
}

// Normalización inversa: "todos los ids" se guarda como `[]` (misma
// representación de "todos").
function normalizeSelection(next: string[], allIds: string[]): string[] {
  return next.length === allIds.length ? [] : next;
}

// URL destino del filtro del calendario: compone ambos parámetros y omite los
// vacíos (providerId primero, serviceId después; orden determinista de #174).
// `URLSearchParams` codifica la coma como `%2C`; se decodifica para conservar la
// forma exacta de URL de #174 (`providerId=prov-a,prov-b`).
function calendarFilterUrl(providerIds: string[], serviceIds: string[]): string {
  const params = new URLSearchParams();
  if (providerIds.length > 0) params.set('providerId', providerIds.join(','));
  if (serviceIds.length > 0) params.set('serviceId', serviceIds.join(','));
  const query = params.toString().replace(/%2C/g, ',');
  return query.length > 0 ? `/appointments?${query}` : '/appointments';
}

export default function AppointmentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawProviderId = searchParams?.get('providerId') ?? '';
  // La lista solo honra un id único; `a,b` es del calendario y no le corresponde.
  const urlProviderFilter =
    rawProviderId && !rawProviderId.includes(',') ? rawProviderId : undefined;

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Reference[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState(emptyAppointment);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [visibleMonth, setVisibleMonth] = useState(getCurrentClinicMonth());
  const [recordPatientId, setRecordPatientId] = useState<string | null>(null);
  
  const [serviceFilter, setServiceFilter] = useState('');
  const [patientFilter, setPatientFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState(urlProviderFilter ?? '');
  const [calendarProviderFilter, setCalendarProviderFilter] = useState<string[]>(
    parseProviderIds(searchParams?.get('providerId'))
  );
  // Estado separado del `<select>` de servicio de la lista (`serviceFilter`):
  // el calendario admite multi-selección y solo él escribe `serviceId`.
  const [calendarServiceFilter, setCalendarServiceFilter] = useState<string[]>(
    parseServiceIds(searchParams?.get('serviceId'))
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState<SortField>('startAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const providerColor = useCallback(
    (providerId: string) =>
      providers.find((p) => p.id === providerId)?.color || FALLBACK_COLOR,
    [providers]
  );

  const calendarAppointments = useMemo(() => {
    const providerActive = calendarProviderFilter.length > 0;
    const serviceActive = calendarServiceFilter.length > 0;
    // `[]` = todos en ambos filtros: sin nada activo se devuelve el mes completo.
    if (!providerActive && !serviceActive) return appointments;
    const selectedProviders = new Set(calendarProviderFilter);
    const selectedServices = new Set(calendarServiceFilter);
    return appointments.filter(
      (a) =>
        (!providerActive || selectedProviders.has(a.providerId)) &&
        (!serviceActive || selectedServices.has(a.serviceId))
    );
  }, [appointments, calendarProviderFilter, calendarServiceFilter]);

  const blocksByDay = useMemo(() => {
    const enriched = calendarAppointments.map((appointment) => ({
      id: appointment.id,
      patientName: refName(patients, appointment.patientId ?? '') || 'Sin paciente',
      serviceName: refName(services, appointment.serviceId),
      patientId: appointment.patientId,
      providerId: appointment.providerId,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status,
    }));
    return groupAppointmentsByDay(enriched, providerColor);
  }, [calendarAppointments, patients, services, providerColor]);

  const visibleProviders = useMemo(() => {
    const providerIds = new Set(appointments.map((a) => a.providerId));
    return providers.filter((p) => providerIds.has(p.id));
  }, [appointments, providers]);

  // Universo del control de servicios: los servicios con citas en el mes
  // **sin filtrar** (no de `calendarAppointments`), de modo que un servicio
  // deseleccionado siga visible aun con un filtro de proveedores activo. El
  // nombre cae en `refName`, que devuelve el id si falta en el catálogo.
  const visibleServices = useMemo<Reference[]>(() => {
    const seen = new Set<string>();
    const result: Reference[] = [];
    for (const appointment of appointments) {
      const id = appointment.serviceId;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({ id, name: refName(services, id) });
    }
    return result;
  }, [appointments, services]);

  // El handler escribe la URL (proyección del estado), sin `useEffect`: el
  // estado local es la fuente de verdad y se inicializa una sola vez desde la
  // URL (deep link). El guard evita reescrituras redundantes.
  const applyCalendarFilters = useCallback(
    (nextProvider: string[], nextService: string[]) => {
      // Guard de reescritura redundante: si ninguno de los dos filtros cambia,
      // no se toca ni el estado ni la URL.
      if (
        nextProvider.join(',') === calendarProviderFilter.join(',') &&
        nextService.join(',') === calendarServiceFilter.join(',')
      ) {
        return;
      }
      setCalendarProviderFilter(nextProvider);
      setCalendarServiceFilter(nextService);
      router.replace(calendarFilterUrl(nextProvider, nextService));
    },
    [calendarProviderFilter, calendarServiceFilter, router]
  );

  function toggleCalendarProvider(id: string) {
    const allIds = visibleProviders.map((p) => p.id);
    const next = nextCalendarSelection(
      effectiveSelection(calendarProviderFilter, allIds),
      id
    );
    // `[]` y "todos los ids" son equivalentes: se guarda `[]`. Caso borde
    // aceptado (design.md §2.5): desmarcar el último proveedor visible vuelve
    // a "todos" porque no existe representación de "ninguno visible".
    applyCalendarFilters(
      normalizeSelection(next, allIds),
      calendarServiceFilter
    );
  }

  function toggleCalendarService(id: string) {
    const allIds = visibleServices.map((s) => s.id);
    const next = nextCalendarSelection(
      effectiveSelection(calendarServiceFilter, allIds),
      id
    );
    // Mismo caso borde aceptado que en proveedores: desmarcar el último
    // servicio visible vuelve a "todos" (`[]`).
    applyCalendarFilters(
      calendarProviderFilter,
      normalizeSelection(next, allIds)
    );
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const appointmentsUrl =
        view === 'calendar'
          ? (() => {
              const { startAt, endAt } = clinicMonthRangeUtc(
                visibleMonth.year,
                visibleMonth.month
              );
              return `/api/admin/appointments?start=${encodeURIComponent(startAt)}&end=${encodeURIComponent(endAt)}`;
            })()
          : '/api/admin/appointments';

      const [apptRes, patientRes, providerRes, serviceRes] = await Promise.all([
        fetch(appointmentsUrl),
        fetch('/api/admin/patients'),
        fetch('/api/admin/providers'),
        fetch('/api/admin/services'),
      ]);
      if (!apptRes.ok) throw new Error('Error al cargar citas');
      const apptData = await apptRes.json();
      const patientData = await patientRes.json();
      const providerData = await providerRes.json();
      const serviceData = await serviceRes.json();
      setAppointments(apptData.appointments ?? []);
      setPatients(
        (patientData.patients ?? []).map((p: { id: string; fullName: string }) => ({
          id: p.id,
          name: p.fullName,
        }))
      );
      setProviders(providerData.providers ?? []);
      setServices(serviceData.services ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [view, visibleMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openCreate() {
    setEditing(null);
    setForm(emptyAppointment);
    setIsModalOpen(true);
  }

  function openEdit(appointment: Appointment) {
    setEditing(appointment);
    setForm({
      patientId: appointment.patientId ?? '',
      serviceId: appointment.serviceId,
      providerId: appointment.providerId,
      startAt: toLocalInput(appointment.startAt),
      endAt: toLocalInput(appointment.endAt),
      status: appointment.status,
      notes: appointment.notes ?? '',
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyAppointment);
  }

  function handleSelectBlock(id: string) {
    const appointment = appointments.find((a) => a.id === id);
    if (appointment) {
      openEdit(appointment);
    }
  }

  function openPatientRecord(patientId: string | null) {
    if (patientId) {
      setRecordPatientId(patientId);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const url = editing
        ? `/api/admin/appointments/${editing.id}`
        : '/api/admin/appointments';
      const method = editing ? 'PATCH' : 'POST';
      const payload = {
        ...form,
        patientId: form.patientId || null,
        startAt: fromLocalInput(form.startAt),
        endAt: fromLocalInput(form.endAt),
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al guardar la cita');
      }

      closeModal();
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(appointment: Appointment) {
    if (!confirm('¿Eliminar esta cita?')) return;
    try {
      const res = await fetch(`/api/admin/appointments/${appointment.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar la cita');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  function refName(list: Reference[], id: string) {
    return list.find((item) => item.id === id)?.name ?? id;
  }

  function formatNotes(notes: string | null) {
    if (!notes || notes.length === 0) return '—';
    return notes.length > 80 ? `${notes.slice(0, 80)}…` : notes;
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  function clearFilters() {
    setServiceFilter('');
    setPatientFilter('');
    setProviderFilter('');
    setDateFrom('');
    setDateTo('');
  }

  const filteredAndSortedAppointments = useMemo(() => {
    let result = [...appointments];

    if (serviceFilter) {
      result = result.filter((a) => a.serviceId === serviceFilter);
    }
    if (patientFilter) {
      result = result.filter((a) => a.patientId === patientFilter);
    }
    if (providerFilter) {
      result = result.filter((a) => a.providerId === providerFilter);
    }
    if (dateFrom) {
      result = result.filter((a) => new Date(a.startAt) >= new Date(dateFrom));
    }
    if (dateTo) {
      result = result.filter((a) => new Date(a.startAt) <= new Date(dateTo));
    }

    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'startAt':
          comparison = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
          break;
        case 'endAt':
          comparison = new Date(a.endAt).getTime() - new Date(b.endAt).getTime();
          break;
        case 'patient':
          comparison = refName(patients, a.patientId ?? '').localeCompare(refName(patients, b.patientId ?? ''));
          break;
        case 'service':
          comparison = refName(services, a.serviceId).localeCompare(refName(services, b.serviceId));
          break;
        case 'provider':
          comparison = refName(providers, a.providerId).localeCompare(refName(providers, b.providerId));
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [appointments, serviceFilter, patientFilter, providerFilter, dateFrom, dateTo, sortField, sortDirection, patients, services, providers]);

  const hasActiveFilters = serviceFilter || patientFilter || providerFilter || dateFrom || dateTo;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Citas</h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setView('list')}
              className={[
                'rounded-l-md border px-4 py-2 text-sm font-medium',
                view === 'list'
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={[
                'rounded-r-md border px-4 py-2 text-sm font-medium',
                view === 'calendar'
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              Calendario
            </button>
          </div>
          <button
            onClick={openCreate}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Nueva cita
          </button>
        </div>
      </div>

      {view === 'list' && (
        <div className="mb-4 rounded-lg border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Filtros</h2>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Servicio
              </label>
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Todos</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Paciente
              </label>
              <select
                value={patientFilter}
                onChange={(e) => setPatientFilter(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Todos</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Proveedor
              </label>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
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
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Desde
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Hasta
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {view === 'calendar' && (
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CalendarNav
            year={visibleMonth.year}
            month={visibleMonth.month}
            onChange={(year, month) => setVisibleMonth({ year, month })}
          />
          <div className="flex flex-wrap items-center gap-3">
            <ProviderLegend
              providers={visibleProviders}
              selectedIds={calendarProviderFilter}
              onToggle={toggleCalendarProvider}
            />
            <ServiceFilter
              services={visibleServices}
              selectedIds={calendarServiceFilter}
              onToggle={toggleCalendarService}
            />
            {(calendarProviderFilter.length > 0 ||
              calendarServiceFilter.length > 0) && (
              <button
                type="button"
                onClick={() => applyCalendarFilters([], [])}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={loadData} />}
      {!loading && !error && view === 'list' && filteredAndSortedAppointments.length === 0 && (
        <EmptyState 
          message={hasActiveFilters 
            ? 'No hay citas que coincidan con los filtros.' 
            : 'No hay citas registradas.'} 
        />
      )}
      {!loading && !error && view === 'list' && filteredAndSortedAppointments.length > 0 && (
        <DataTable
          columns={[
            { 
              header: (
                <button
                  onClick={() => handleSort('startAt')}
                  className="flex items-center gap-1 font-semibold"
                >
                  Inicio
                  {sortField === 'startAt' && (
                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ),
              cell: (a) => formatDate(a.startAt)
            },
            { 
              header: (
                <button
                  onClick={() => handleSort('endAt')}
                  className="flex items-center gap-1 font-semibold"
                >
                  Fin
                  {sortField === 'endAt' && (
                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ),
              cell: (a) => formatDate(a.endAt)
            },
            { 
              header: (
                <button
                  onClick={() => handleSort('patient')}
                  className="flex items-center gap-1 font-semibold"
                >
                  Paciente
                  {sortField === 'patient' && (
                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ),
              cell: (a) => {
                const patientName = refName(patients, a.patientId ?? '') || 'Sin paciente';
                if (!a.patientId) return patientName;
                return (
                  <button
                    type="button"
                    onClick={() => openPatientRecord(a.patientId)}
                    className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {patientName}
                  </button>
                );
              }
            },
            { 
              header: (
                <button
                  onClick={() => handleSort('service')}
                  className="flex items-center gap-1 font-semibold"
                >
                  Servicio
                  {sortField === 'service' && (
                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ),
              cell: (a) => refName(services, a.serviceId)
            },
            { 
              header: (
                <button
                  onClick={() => handleSort('provider')}
                  className="flex items-center gap-1 font-semibold"
                >
                  Proveedor
                  {sortField === 'provider' && (
                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ),
              cell: (a) => refName(providers, a.providerId)
            },
            { 
              header: (
                <button
                  onClick={() => handleSort('status')}
                  className="flex items-center gap-1 font-semibold"
                >
                  Estado
                  {sortField === 'status' && (
                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ),
              cell: (a) => statusLabel(a.status)
            },
            {
              header: 'Recordatorio',
              cell: (a) =>
                a.reminders && a.reminders.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {a.reminders.map((reminder, index) => (
                      <span
                        key={`${reminder.cadence}-${reminder.createdAt}-${index}`}
                        className="inline-flex w-fit rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-900"
                      >
                        {reminderLabel(reminder)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-500">Sin recordatorio</span>
                ),
            },
            {
              header: 'Notas',
              cell: (a) => formatNotes(a.notes),
            },
          ]}
          rows={filteredAndSortedAppointments}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {!loading && !error && view === 'calendar' && (
        <MonthCalendar
          year={visibleMonth.year}
          month={visibleMonth.month}
          blocksByDay={blocksByDay}
          onSelectBlock={handleSelectBlock}
          onSelectPatient={openPatientRecord}
        />
      )}

      {isModalOpen && (
        <FormModal
          title={editing ? 'Editar cita' : 'Nueva cita'}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitLabel={editing ? 'Guardar cambios' : 'Crear cita'}
          isSubmitting={submitting}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Paciente (opcional)
            </label>
            <select
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Sin paciente</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Servicio
            </label>
            <select
              value={form.serviceId}
              onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Selecciona un servicio</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Inicio
              </label>
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Fin
              </label>
              <input
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Estado
            </label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
              Notas de la cita
            </label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              maxLength={1000}
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
        </FormModal>
      )}

      {recordPatientId && (
        <PatientRecordModal
          patientId={recordPatientId}
          onClose={() => setRecordPatientId(null)}
        />
      )}
    </div>
  );
}
