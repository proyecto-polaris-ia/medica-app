'use client';

import { useEffect, useState } from 'react';
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

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState(emptyPatient);
  const [submitting, setSubmitting] = useState(false);

  async function loadPatients() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/patients');
      if (!res.ok) throw new Error('Error al cargar pacientes');
      const data = await res.json();
      setPatients(data.patients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPatients();
  }, []);

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
      await loadPatients();
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
      await loadPatients();
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

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={loadPatients} />}
      {!loading && !error && patients.length === 0 && (
        <EmptyState message="No hay pacientes registrados." />
      )}
      {!loading && !error && patients.length > 0 && (
        <DataTable
          columns={[
            { header: 'Nombre', cell: (p) => p.fullName },
            { header: 'Teléfono', cell: (p) => p.phoneE164 || '-' },
            { header: 'Correo', cell: (p) => p.email || '-' },
            { header: 'Notas', cell: (p) => p.notes || '-' },
          ]}
          rows={patients}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
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
