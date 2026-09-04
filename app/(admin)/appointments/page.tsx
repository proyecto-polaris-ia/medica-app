'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/admin/DataTable';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { FormModal } from '@/components/admin/FormModal';
import { LoadingState } from '@/components/admin/LoadingState';

type Appointment = {
  id: string;
  patientId: string | null;
  serviceId: string;
  providerId: string;
  startAt: string;
  endAt: string;
  status: string;
};

type Reference = {
  id: string;
  name: string;
};

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
};

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

export default function AppointmentsPage() {
  const searchParams = useSearchParams();
  const providerFilter = searchParams.get('providerId') ?? undefined;

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Reference[]>([]);
  const [providers, setProviders] = useState<Reference[]>([]);
  const [services, setServices] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState(emptyAppointment);
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [apptRes, patientRes, providerRes, serviceRes] = await Promise.all([
        fetch('/api/admin/appointments'),
        fetch('/api/admin/patients'),
        fetch('/api/admin/providers'),
        fetch('/api/admin/services'),
      ]);
      if (!apptRes.ok) throw new Error('Error al cargar citas');
      const apptData = await apptRes.json();
      const patientData = await patientRes.json();
      const providerData = await providerRes.json();
      const serviceData = await serviceRes.json();
      setAppointments(apptData.appointments);
      setPatients(
        (patientData.patients ?? []).map((p: { id: string; fullName: string }) => ({
          id: p.id,
          name: p.fullName,
        }))
      );
      setProviders(providerData.providers);
      setServices(serviceData.services);
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
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyAppointment);
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

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('es-MX');
  }

  const visibleAppointments = providerFilter
    ? appointments.filter((a) => a.providerId === providerFilter)
    : appointments;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Citas</h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nueva cita
        </button>
      </div>

      {providerFilter && (
        <div className="mb-4 flex items-center justify-between rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <span>Filtrando por proveedor</span>
          <Link href="/appointments" className="font-medium underline">
            Quitar filtro
          </Link>
        </div>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={loadData} />}
      {!loading && !error && visibleAppointments.length === 0 && (
        <EmptyState
          message={
            providerFilter
              ? 'No hay citas registradas para este proveedor.'
              : 'No hay citas registradas.'
          }
        />
      )}
      {!loading && !error && visibleAppointments.length > 0 && (
        <DataTable
          columns={[
            { header: 'Paciente', cell: (a) => refName(patients, a.patientId ?? '') || 'Sin paciente' },
            { header: 'Servicio', cell: (a) => refName(services, a.serviceId) },
            { header: 'Proveedor', cell: (a) => refName(providers, a.providerId) },
            { header: 'Inicio', cell: (a) => formatDate(a.startAt) },
            { header: 'Fin', cell: (a) => formatDate(a.endAt) },
            { header: 'Estado', cell: (a) => a.status },
          ]}
          rows={visibleAppointments}
          onEdit={openEdit}
          onDelete={handleDelete}
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
        </FormModal>
      )}
    </div>
  );
}
