import { formatRelativeTime } from '@/lib/date-format';
import {
  getWccUnconfirmedAppointments,
  type WccAppointmentReminderRow,
} from '@/lib/wcc-appointments';
import { WccEmptyState, WccNotice } from '../components';

export const dynamic = 'force-dynamic';

function reminderLabel(reminder: WccAppointmentReminderRow): string {
  if (reminder.dryRun && reminder.status === 'scheduled') {
    return 'Simulado (dry-run)';
  }
  if (reminder.status === 'sent' && reminder.sentAt) {
    return reminder.cadence === 'h24'
      ? `Recordatorio H-24 enviado ${formatRelativeTime(reminder.sentAt)}`
      : `Recordatorio día mismo enviado ${formatRelativeTime(reminder.sentAt)}`;
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

function reminderTone(reminder: WccAppointmentReminderRow): string {
  if (reminder.dryRun && reminder.status === 'scheduled') {
    return 'border-amber-300 bg-amber-50 text-amber-900';
  }
  if (reminder.status === 'sent') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-900';
  }
  if (reminder.status === 'failed') {
    return 'border-rose-300 bg-rose-50 text-rose-900';
  }
  return 'border-blue-200 bg-blue-50 text-blue-900';
}

function ReminderBadge({ reminder }: { reminder: WccAppointmentReminderRow }) {
  return (
    <span
      className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${reminderTone(reminder)}`}
    >
      {reminderLabel(reminder)}
    </span>
  );
}

export default async function Page() {
  const queue = await getWccUnconfirmedAppointments();

  return (
    <main>
      <h2 className="text-xl font-bold">Citas sin confirmar</h2>
      <p className="mt-1 text-sm text-gray-600">
        Citas en estado solicitado o pendiente en las próximas {queue.windowHours}{' '}
        horas, con el estado de sus recordatorios.
      </p>

      {queue.isConfiguredButUnavailable && (
        <WccNotice tone="warning">
          No se pudieron leer las citas. La base de datos no respondió como se
          esperaba.
        </WccNotice>
      )}

      {queue.appointments.length === 0 && !queue.isConfiguredButUnavailable ? (
        <div className="mt-4">
          <WccEmptyState
            title="Todas las citas están confirmadas"
            description="No hay citas sin confirmar dentro de la ventana operativa."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {queue.appointments.map((appointment) => (
            <article
              key={appointment.appointmentId}
              className="rounded-2xl border bg-white p-5"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <strong className="text-sm text-gray-950">
                  {appointment.patientName}
                </strong>
                {appointment.patientPhoneE164 ? (
                  <span className="text-xs text-gray-500">
                    {appointment.patientPhoneE164}
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">
                    Teléfono sin registrar
                  </span>
                )}
                <span className="text-xs text-gray-400">·</span>
                <span className="text-sm text-gray-700">
                  {appointment.serviceName}
                </span>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-sm font-medium text-gray-700">
                  {appointment.providerName}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {formatRelativeTime(appointment.startAt)} · en{' '}
                {appointment.hoursUntilStart} h
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {appointment.reminders.length === 0 ? (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                    Sin recordatorio
                  </span>
                ) : (
                  appointment.reminders.map((reminder, index) => (
                    <ReminderBadge
                      key={`${reminder.cadence}-${index}`}
                      reminder={reminder}
                    />
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
