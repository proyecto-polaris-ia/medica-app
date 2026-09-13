import type { PatientRecord, PatientRecordAppointment } from '@/lib/admin/types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function valueOrDash(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '—';
}

function AppointmentList({
  appointments,
  emptyMessage,
}: {
  appointments: PatientRecordAppointment[];
  emptyMessage: string;
}) {
  if (appointments.length === 0) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Fecha</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Servicio</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Doctor</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {appointments.map((appointment) => (
            <tr key={appointment.id}>
              <td className="px-3 py-2 text-sm text-gray-900">{formatDateTime(appointment.startAt)}</td>
              <td className="px-3 py-2 text-sm text-gray-900">{appointment.serviceName}</td>
              <td className="px-3 py-2 text-sm text-gray-900">{appointment.providerName}</td>
              <td className="px-3 py-2 text-sm text-gray-600">{appointment.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PatientRecordView({ record }: { record: PatientRecord }) {
  const { patient } = record;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-gray-900">{patient.fullName}</h2>
          <p className="text-sm text-gray-500">Expediente inicial del paciente</p>
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Teléfono</dt>
            <dd className="text-sm text-gray-900">{valueOrDash(patient.phoneE164)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Correo</dt>
            <dd className="text-sm text-gray-900">{valueOrDash(patient.email)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Registrado</dt>
            <dd className="text-sm text-gray-900">{formatDateTime(patient.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notas</dt>
            <dd className="text-sm text-gray-900">{valueOrDash(patient.notes)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">Citas futuras</h3>
        <AppointmentList
          appointments={record.upcomingAppointments}
          emptyMessage="No hay citas futuras para este paciente."
        />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">Citas asistidas</h3>
        <AppointmentList
          appointments={record.attendedAppointments}
          emptyMessage="No hay citas asistidas registradas para este paciente."
        />
      </section>
    </div>
  );
}
