import { getWccPaymentsQueue, getWccRemindersQueue } from '@/lib/wcc-payments';
import { formatRelativeTime } from '@/lib/date-format';
import { WccEmptyState, WccNotice } from '../components';

export const dynamic = 'force-dynamic';

function formatMxMoney(amount: number | null): string {
  if (amount === null || Number.isNaN(amount)) return 'monto sin registrar';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function intentStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'confirmed':
      return 'Confirmada';
    case 'fulfilled':
      return 'Cumplida';
    case 'cancelled':
      return 'Cancelada';
    default:
      return status;
  }
}

function reminderStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'Programado';
    case 'sent':
      return 'Enviado';
    case 'skipped':
      return 'Omitido';
    case 'failed':
      return 'Falló';
    default:
      return status;
  }
}

function methodLabel(method: string | null): string | null {
  switch (method) {
    case 'cash':
      return 'Efectivo';
    case 'card':
      return 'Tarjeta';
    case 'transfer':
      return 'Transferencia';
    case 'other':
      return 'Otro';
    default:
      return null;
  }
}

function sourceLabel(source: string): string {
  return source === 'manual' ? 'Captura manual' : 'WhatsApp';
}

export default async function Page() {
  const [payments, reminders] = await Promise.all([
    getWccPaymentsQueue(),
    getWccRemindersQueue(),
  ]);

  return (
    <main className="space-y-8">
      <header>
        <h2 className="text-xl font-bold">Pagos y recordatorios</h2>
        <p className="mt-1 text-sm text-gray-600">
          Intenciones de pago declaradas por pacientes vía WhatsApp y bitácora de
          recordatorios automáticos enviados o en modo dry-run.
        </p>
      </header>

      <section aria-labelledby="wcc-payments-intents-heading">
        <h3
          id="wcc-payments-intents-heading"
          className="text-lg font-semibold text-gray-950"
        >
          Intenciones de pago
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          {payments.intents.length} de {payments.totalCount} en esta página
        </p>

        {payments.isConfiguredButUnavailable && (
          <WccNotice tone="warning">
            No se pudieron leer las intenciones de pago. La base de datos no
            respondió como se esperaba.
          </WccNotice>
        )}

        {payments.intents.length === 0 && !payments.isConfiguredButUnavailable ? (
          <div className="mt-4">
            <WccEmptyState
              title="Sin intenciones de pago"
              description="Cuando un paciente manifieste su intención de pagar por WhatsApp, el caso aparecerá aquí."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {payments.intents.map((intent) => {
              const method = methodLabel(intent.method);
              return (
                <article
                  key={intent.id}
                  className="rounded-2xl border bg-white p-5"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <strong className="text-sm text-gray-950">
                      {intent.patientName}
                    </strong>
                    {intent.patientPhoneE164 ? (
                      <span className="text-xs text-gray-500">
                        {intent.patientPhoneE164}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">
                        Teléfono sin registrar
                      </span>
                    )}
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-sm font-semibold text-blue-950">
                      {formatMxMoney(intent.amount)}
                    </span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-sm font-medium text-gray-700">
                      {intentStatusLabel(intent.status)}
                    </span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500">
                      {sourceLabel(intent.source)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Registrada {formatRelativeTime(intent.createdAt)}
                  </p>
                  {method || intent.commitmentText ? (
                    <p className="mt-2 text-sm text-gray-700">
                      {method ? <span>Método: {method}.</span> : null}
                      {intent.commitmentText ? (
                        <span>
                          {' '}
                          Compromiso: {intent.commitmentText}.
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {intent.notes ? (
                    <p className="mt-2 text-sm text-gray-700">
                      <span className="font-medium">Notas:</span> {intent.notes}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="wcc-payments-reminders-heading">
        <h3
          id="wcc-payments-reminders-heading"
          className="text-lg font-semibold text-gray-950"
        >
          Recordatorios
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          {reminders.reminders.length} de {reminders.totalCount} en esta página
        </p>

        {reminders.isConfiguredButUnavailable && (
          <WccNotice tone="warning">
            No se pudieron leer los recordatorios. La base de datos no respondió
            como se esperaba.
          </WccNotice>
        )}

        {reminders.reminders.length === 0 && !reminders.isConfiguredButUnavailable ? (
          <div className="mt-4">
            <WccEmptyState
              title="Sin recordatorios registrados"
              description="Cuando el cron automático procese recordatorios, aparecerán aquí junto con su estado de envío."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {reminders.reminders.map((reminder) => (
              <article
                key={reminder.id}
                className="rounded-2xl border bg-white p-5"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <strong className="text-sm text-gray-950">
                    {reminder.patientName}
                  </strong>
                  {reminder.patientPhoneE164 ? (
                    <span className="text-xs text-gray-500">
                      {reminder.patientPhoneE164}
                    </span>
                  ) : null}
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-sm font-mono text-gray-700">
                    {reminder.templateName}
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-sm font-medium text-gray-700">
                    {reminderStatusLabel(reminder.status)}
                  </span>
                  {reminder.dryRun ? (
                    <span
                      className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900"
                      aria-label="Modo dry-run"
                    >
                      dry-run
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {reminder.sentAt
                    ? `Enviado ${formatRelativeTime(reminder.sentAt)}`
                    : `Registrado ${formatRelativeTime(reminder.createdAt)}`}
                  {reminder.balanceAtSend !== null
                    ? ` · saldo ${formatMxMoney(reminder.balanceAtSend)}`
                    : ''}
                </p>
                {reminder.providerMessageId ? (
                  <p className="mt-1 text-xs text-gray-500">
                    ID de proveedor: <span className="font-mono">{reminder.providerMessageId}</span>
                  </p>
                ) : null}
                {reminder.error ? (
                  <p className="mt-2 text-sm text-rose-700">
                    <span className="font-medium">Error:</span> {reminder.error}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
