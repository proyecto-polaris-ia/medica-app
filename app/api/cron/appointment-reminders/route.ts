import {
  appointmentReminderPeriod,
  selectAppointmentReminderCandidates,
  sendAppointmentReminder,
  type AppointmentReminderCadence,
} from '@/lib/citas/send-appointment-reminder';
import { sendOnboardingNudge } from '@/lib/citas/send-onboarding-nudge';
import { isOnboardingNudgeEnabled } from '@/lib/whatsapp/onboarding-flag';

/**
 * Cron único de recordatorios de citas (issue #86, slice 2/3).
 *
 * En una sola corrida ejecuta las dos cadencias (`h24` y `same_day`) y delega
 * toda la lógica determinista —ventanas, llaves, formateo, opt-out y envío
 * idempotente— en `src/lib/citas/send-appointment-reminder.ts`. Aquí sólo vive
 * la orquestación: auth bearer timing-safe, feature flag, dry-run fail-closed y
 * el conteo real por cadencia.
 *
 * Tras un recordatorio enviado (`sent === true`) y con
 * `WHATSAPP_ONBOARDING_NUDGE_ENABLED` encendido, se dispara el nudge de
 * onboarding pendiente (`src/lib/citas/send-onboarding-nudge.ts`). El nudge es
 * aditivo y aguas abajo: un fallo suyo nunca afecta el resultado del
 * recordatorio (se envuelve en try/catch).
 *
 * Referencia de patrón: `app/api/cron/payment-reminders/route.ts`.
 */
export const dynamic = 'force-dynamic';

type CadenceKey = 'h24' | 'sameDay';

type CadenceCounters = { sent: number; skipped: number; total: number };

const CADENCES: ReadonlyArray<{ cadence: AppointmentReminderCadence; key: CadenceKey }> = [
  { cadence: 'h24', key: 'h24' },
  { cadence: 'same_day', key: 'sameDay' },
];

function isFeatureEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase().trim();
  return normalized === 'true' || normalized === '1';
}

function resolveDryRun(value: string | undefined): boolean {
  if (value === undefined) return true;
  const normalized = value.toLowerCase().trim();
  return !(normalized === 'false' || normalized === '0');
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: Request): Promise<Response> {
  // 1. Authorize — fail-closed: sin CRON_SECRET configurado o sin un Bearer
  //    válido no se hace ningún trabajo (ni se toca Supabase).
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length === 0) {
    return new Response('Unauthorized', { status: 401 });
  }

  const presentedSecret = readBearerToken(request);
  if (!presentedSecret || !timingSafeStringEqual(presentedSecret, cronSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Feature flag gate — operadores pueden apagar ambas cadencias con un flag.
  if (!isFeatureEnabled(process.env.APPOINTMENT_REMINDERS_ENABLED)) {
    return Response.json({ skipped: true });
  }

  const dryRun = resolveDryRun(process.env.APPOINTMENT_REMINDERS_DRY_RUN);
  const now = new Date();

  const cadencias: Record<CadenceKey, CadenceCounters> = {
    h24: { sent: 0, skipped: 0, total: 0 },
    sameDay: { sent: 0, skipped: 0, total: 0 },
  };
  let sent = 0;
  let skipped = 0;

  // 3. Ejecutar ambas cadencias en la misma corrida. Un fallo de lectura de la
  //    selección SÍ propaga (500 sin escribir); un fallo de un candidato no.
  for (const { cadence, key } of CADENCES) {
    const candidates = await selectAppointmentReminderCandidates(cadence, now);
    const counters: CadenceCounters = { sent: 0, skipped: 0, total: candidates.length };

    for (const candidate of candidates) {
      try {
        const result = await sendAppointmentReminder({
          appointmentId: candidate.appointmentId,
          cadence,
          patientId: candidate.patientId,
          patientName: candidate.patientName,
          patientPhoneE164: candidate.patientPhoneE164,
          providerName: candidate.providerName,
          startAt: candidate.startAt,
          period: appointmentReminderPeriod(candidate.startAt),
          dryRun,
        });
        // Sólo un envío real cuenta como `sent`; dedup, opt-out, simulación y
        // fallos del proveedor se contabilizan como `skipped` (nada salió).
        if (result.sent) {
          counters.sent += 1;
          // Nudge de onboarding aguas abajo del recordatorio. Un fallo del
          // nudge NUNCA afecta el resultado del recordatorio.
          if (isOnboardingNudgeEnabled()) {
            try {
              await sendOnboardingNudge({
                patientId: candidate.patientId,
                patientName: candidate.patientName,
                patientPhoneE164: candidate.patientPhoneE164,
                appointmentId: candidate.appointmentId,
                startAt: candidate.startAt,
                dryRun,
              });
            } catch {
              // Degradación: el nudge es aditivo; el recordatorio ya salió.
            }
          }
        } else {
          counters.skipped += 1;
        }
      } catch {
        // Degradación: un fallo inesperado de una fila no aborta la corrida.
        counters.skipped += 1;
      }
    }

    sent += counters.sent;
    skipped += counters.skipped;
    cadencias[key] = counters;
  }

  return Response.json({ sent, skipped, dryRun, cadencias });
}

// Vercel Cron invoca el path con GET; delegamos a POST para no depender del verbo.
export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
