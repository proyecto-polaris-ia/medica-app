import { listAccountsReceivable } from '@/lib/admin/accounts-receivable';
import { sendPaymentReminder } from '@/lib/payments/send-payment-reminder';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DEFAULT_THRESHOLD_DAYS = 30;
const REMINDER_TEMPLATE_NAME = 'recordatorio_pago';

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

/**
 * ISO 8601 week-of-year key in the shape `YYYY-Www` (e.g. `2026-W39`).
 * Used as the cadence period for the reminder key — same patient/plan
 * reminded at most once per week.
 */
function isoWeekKey(now: Date): string {
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  const diffMs = target.getTime() - firstThursday.getTime();
  const weekNumber = 1 + Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

function buildReminderKey(input: {
  patientId: string;
  treatmentPlanId: string;
  periodKey: string;
}): string {
  return `patient:${input.patientId}:plan:${input.treatmentPlanId}:${input.periodKey}`;
}

type ContactRow = { phone_e164: string; opt_in_status: string };

async function fetchOptedOutPhones(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const { data, error } = await getSupabaseAdmin()
    .from('whatsapp_contacts')
    .select('phone_e164, opt_in_status')
    .in('phone_e164', phones);

  if (error) {
    throw new Error(error.message);
  }

  const optedOut = new Set<string>();
  for (const row of (data ?? []) as ContactRow[]) {
    if (row.opt_in_status === 'opted_out') {
      optedOut.add(row.phone_e164);
    }
  }
  return optedOut;
}

async function findExistingReminderKey(reminderKey: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('payment_reminders')
    .select('id')
    .eq('reminder_key', reminderKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data !== null;
}

async function persistDryRunReminder(input: {
  patientId: string;
  treatmentPlanId: string;
  reminderKey: string;
  balance: number;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('payment_reminders')
    .insert({
      patient_id: input.patientId,
      treatment_plan_id: input.treatmentPlanId,
      reminder_key: input.reminderKey,
      template_name: REMINDER_TEMPLATE_NAME,
      status: 'scheduled',
      dry_run: true,
      balance_at_send: input.balance,
    });

  if (error) {
    throw new Error(error.message);
  }
}

export async function POST(request: Request): Promise<Response> {
  // 1. Authorize — guardrail 4 from the threat matrix.
  // CRON_SECRET is the Vercel cron auth shared secret; if it is not configured
  // or the request does not present a matching Bearer token, refuse to do work.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length === 0) {
    return new Response('Unauthorized', { status: 401 });
  }

  const presentedSecret = readBearerToken(request);
  if (!presentedSecret || !timingSafeStringEqual(presentedSecret, cronSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Feature flag gate — operators can disable the entire job with one flag.
  if (!isFeatureEnabled(process.env.MORA_REMINDERS_ENABLED)) {
    return Response.json({ skipped: true });
  }

  const dryRun = resolveDryRun(process.env.MORA_REMINDERS_DRY_RUN);

  // 3. Selection — listAccountsReceivable already filters to positive balances.
  // We additionally require a phone number and at least one past-due plan.
  const rows = await listAccountsReceivable({ thresholdDays: DEFAULT_THRESHOLD_DAYS });
  const candidates = rows.filter(
    (row) =>
      Boolean(row.patientPhoneE164) &&
      row.pastDuePlans.some((plan) => plan.isPastDue)
  );

  if (candidates.length === 0) {
    return Response.json({ sent: 0, skipped: 0, dryRun });
  }

  // 4. Opt-out filter — respect whatsapp_contacts.opt_in_status = 'opted_out'.
  const phones = Array.from(
    new Set(
      candidates
        .map((row) => row.patientPhoneE164)
        .filter((phone): phone is string => Boolean(phone))
    )
  );
  const optedOutPhones = await fetchOptedOutPhones(phones);

  const eligible = candidates.filter(
    (row) => !optedOutPhones.has(row.patientPhoneE164 as string)
  );

  // 5. Per (patient, plan) — dedupe by reminder_key, then either persist a
  // dry-run row directly or hand off to sendPaymentReminder for the real send.
  let sent = 0;
  let skipped = 0;
  const periodKey = isoWeekKey(new Date());

  for (const row of eligible) {
    for (const plan of row.pastDuePlans) {
      if (!plan.isPastDue) continue;

      const reminderKey = buildReminderKey({
        patientId: row.patientId,
        treatmentPlanId: plan.treatmentPlanId,
        periodKey,
      });

      const alreadyExists = await findExistingReminderKey(reminderKey);
      if (alreadyExists) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        await persistDryRunReminder({
          patientId: row.patientId,
          treatmentPlanId: plan.treatmentPlanId,
          reminderKey,
          balance: plan.balance,
        });
        skipped += 1;
        continue;
      }

      const result = await sendPaymentReminder({
        patientId: row.patientId,
        treatmentPlanId: plan.treatmentPlanId,
        patientPhoneE164: row.patientPhoneE164 as string,
        patientName: row.patientName,
        balance: plan.balance,
        daysPastDue: plan.daysPastDue,
        periodKey,
        dryRun: false,
      });

      if (result.sent) {
        sent += 1;
      } else if (result.skipped) {
        skipped += 1;
      } else {
        // Real send attempted but the provider refused — count as skipped so the
        // operator sees the failure surfaced, not silently absorbed.
        skipped += 1;
      }
    }
  }

  return Response.json({ sent, skipped, dryRun });
}
