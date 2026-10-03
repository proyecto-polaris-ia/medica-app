import { clinicDayRange } from '@/lib/admin/clinic-time';
import { clinicTimeLabel } from '@/lib/admin/timezone';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  sendWhatsAppTemplateMessage,
  type WhatsAppSendResult,
  type WhatsAppTemplateParameter,
} from '@/lib/whatsapp/client';

/**
 * Recordatorios automáticos de citas (issue #86, slice 1/3).
 *
 * Toda la lógica determinista vive aquí: ventanas de selección, llaves de
 * idempotencia, resolución de configuración del consultorio, formateo de las
 * variables de la plantilla y el envío idempotente. El cron
 * `app/api/cron/appointment-reminders` sólo orquesta.
 *
 * Zona horaria clínica: `America/Mexico_City` (la fecha/hora del recordatorio
 * SIEMPRE se resuelve en la zona del consultorio, nunca en UTC).
 */

const CLINIC_TIME_ZONE = 'America/Mexico_City';
const APPOINTMENT_REMINDER_TEMPLATE_NAME = 'recordatorio_cita';
const APPOINTMENT_REMINDER_TEMPLATE_LANGUAGE = 'es_MX';
const DEFAULT_CLINIC_NAME = 'Consultorio Dental';
const FALLBACK_PROVIDER_NAME = 'tu especialista';
const DUPLICATE_KEY_CODE = '23505';
const HOUR_MS = 60 * 60 * 1000;
const H24_WINDOW_START_HOURS = 24;
const H24_WINDOW_END_HOURS = 36;

/**
 * Dirección del consultorio (placeholder editable en código).
 *
 * La plantilla `recordatorio_cita` aprobada en Meta **no** tiene variable de
 * dirección, así que este valor NO se envía en `bodyParameters`; se expone sólo
 * para configuración/uso futuro. El valor efectivo se puede sobreescribir con
 * la variable de entorno `APPOINTMENT_REMINDER_CLINIC_ADDRESS`. Si el
 * consultorio quiere la dirección en el mensaje debe re-aprobarse la plantilla
 * con una sexta variable (ver `docs/plantilla-hsm-recordatorio-cita.md`).
 */
export const APPOINTMENT_REMINDER_CLINIC_ADDRESS = '';

export type AppointmentReminderCadence = 'h24' | 'same_day';

/**
 * Periodo de deduplicación derivado de la **fecha clínica de la cita**.
 * Nunca se deriva de `now`, para que la llave sea estable entre corridas de la
 * misma ventana aunque caigan en semanas ISO distintas.
 */
export type AppointmentReminderPeriod = {
  /** Semana ISO de la fecha clínica de la cita (`YYYY-Www`). */
  isoWeekKey: string;
  /** Fecha clínica local de la cita (`YYYY-MM-DD`) en America/Mexico_City. */
  clinicDate: string;
};

export type AppointmentReminderCandidateStatus = 'requested' | 'pending';

export type AppointmentReminderCandidate = {
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientPhoneE164: string;
  providerName: string;
  startAt: string;
  status: AppointmentReminderCandidateStatus;
};

export type SendAppointmentReminderInput = {
  appointmentId: string;
  cadence: AppointmentReminderCadence;
  patientId: string;
  patientName: string;
  patientPhoneE164: string;
  providerName?: string | null;
  startAt: string;
  period: AppointmentReminderPeriod;
  dryRun: boolean;
};

export type SendAppointmentReminderResult = {
  reminderKey: string;
  sent: boolean;
  skipped: boolean;
  dryRun?: boolean;
  providerMessageId?: string;
  error?: string;
};

export type AppointmentTemplateVars = {
  patientFirstName: string;
  clinicName: string;
  clinicAddress: string;
  dateLabel: string;
  timeLabel: string;
  providerName: string;
};

type PatientEmbed = { full_name: string | null; phone_e164: string | null };
type ProviderEmbed = { name: string | null };

// PostgREST puede devolver el join a-uno como objeto o como arreglo según la
// versión; se normaliza con `firstEmbed`.
type AppointmentRow = {
  id: string;
  patient_id: string | null;
  start_at: string;
  status: string;
  patients: PatientEmbed | PatientEmbed[] | null;
  providers: ProviderEmbed | ProviderEmbed[] | null;
};

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// `en-CA` produce `YYYY-MM-DD`, exactamente la llave de fecha clínica.
const CLINIC_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const CLINIC_DATE_LABEL_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  timeZone: CLINIC_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * Fecha clínica local (`YYYY-MM-DD`) del instante dado, en America/Mexico_City.
 * Helper puro local al módulo: `clinic-time.ts` no expone la fecha clínica de
 * un instante y extenderlo está fuera del alcance de este slice.
 */
export function clinicDateKey(iso: string): string {
  return CLINIC_DATE_FORMATTER.format(new Date(iso));
}

/**
 * Semana ISO (`YYYY-Www`) de una fecha calendario `YYYY-MM-DD`.
 * Se calcula en UTC sobre las partes de la fecha clínica para que el resultado
 * no dependa de la zona del proceso.
 */
export function isoWeekKeyForClinicDate(clinicDate: string): string {
  const [year, month, day] = clinicDate.split('-').map((part) => parseInt(part, 10));
  const target = new Date(Date.UTC(year, month - 1, day));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  const diffMs = target.getTime() - firstThursday.getTime();
  const weekNumber = 1 + Math.round(diffMs / (7 * 24 * HOUR_MS));
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

/** Periodo de deduplicación de una cita a partir de su `start_at`. */
export function appointmentReminderPeriod(startAt: string): AppointmentReminderPeriod {
  const clinicDate = clinicDateKey(startAt);
  return { clinicDate, isoWeekKey: isoWeekKeyForClinicDate(clinicDate) };
}

/** Llave estable de deduplicación por (cita, cadencia, periodo). */
export function buildAppointmentReminderKey(
  appointmentId: string,
  cadence: AppointmentReminderCadence,
  period: AppointmentReminderPeriod
): string {
  if (cadence === 'h24') {
    if (!period.isoWeekKey) {
      throw new Error('buildAppointmentReminderKey: falta period.isoWeekKey para la cadencia h24.');
    }
    return `cita:${appointmentId}:h24:${period.isoWeekKey}`;
  }
  if (!period.clinicDate) {
    throw new Error('buildAppointmentReminderKey: falta period.clinicDate para la cadencia same_day.');
  }
  return `cita:${appointmentId}:same_day:${period.clinicDate}`;
}

/** Configuración efectiva del consultorio (env → placeholder de código). */
export function resolveClinicReminderConfig(): { clinicName: string; clinicAddress: string } {
  return {
    clinicName:
      process.env.APPOINTMENT_REMINDER_CLINIC_NAME ??
      process.env.WEB_CHAT_CLINIC_NAME ??
      DEFAULT_CLINIC_NAME,
    clinicAddress:
      process.env.APPOINTMENT_REMINDER_CLINIC_ADDRESS ?? APPOINTMENT_REMINDER_CLINIC_ADDRESS,
  };
}

/** Primer token del nombre completo con inicial mayúscula (`maría lópez` → `María`). */
export function formatPatientFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Fecha larga en es-MX (`lunes 5 de octubre`) en la zona clínica. */
export function formatClinicDateLabel(startAt: string): string {
  // Intl de es-MX inserta una coma tras el día de la semana ("lunes, 5 de
  // octubre"); la plantilla aprobada usa el formato sin coma.
  return CLINIC_DATE_LABEL_FORMATTER.format(new Date(startAt)).replace(',', '');
}

/** Variables de la plantilla (sin ordenar) a partir de la cita. */
export function formatAppointmentTemplateVars(input: {
  patientName: string;
  providerName?: string | null;
  startAt: string;
  config?: { clinicName: string; clinicAddress: string };
}): AppointmentTemplateVars {
  const config = input.config ?? resolveClinicReminderConfig();
  return {
    patientFirstName: formatPatientFirstName(input.patientName),
    clinicName: config.clinicName,
    clinicAddress: config.clinicAddress,
    dateLabel: formatClinicDateLabel(input.startAt),
    timeLabel: clinicTimeLabel(input.startAt),
    providerName: input.providerName?.trim() || FALLBACK_PROVIDER_NAME,
  };
}

/**
 * Arreglo de `bodyParameters` **congelado** contra la plantilla aprobada en
 * Meta: nombre, consultorio, fecha, hora, doctor. No reordenar ni agregar
 * elementos sin re-aprobar `recordatorio_cita` (ver §7 del design).
 */
export function buildAppointmentReminderBodyParameters(
  vars: AppointmentTemplateVars
): WhatsAppTemplateParameter[] {
  return [
    { type: 'text', text: vars.patientFirstName },
    { type: 'text', text: vars.clinicName },
    { type: 'text', text: vars.dateLabel },
    { type: 'text', text: vars.timeLabel },
    { type: 'text', text: vars.providerName },
  ];
}

const APPOINTMENT_REMINDER_SELECT =
  'id, patient_id, start_at, status, patients(full_name, phone_e164), providers(name)';

/**
 * Candidatas a recordatorio para una cadencia.
 *
 * - `h24`: `start_at` dentro de `[now + 24h, now + 36h]` (instantes absolutos).
 * - `same_day`: `start_at` dentro del día clínico de `now` y `start_at >= now`
 *   (no recordar citas ya pasadas).
 *
 * Ambas cadencias exigen `status IN ('requested','pending')` y descartan filas
 * sin paciente o sin teléfono.
 */
export async function selectAppointmentReminderCandidates(
  cadence: AppointmentReminderCadence,
  now: Date
): Promise<AppointmentReminderCandidate[]> {
  const base = getSupabaseAdmin()
    .from('appointments')
    .select(APPOINTMENT_REMINDER_SELECT)
    .in('status', ['requested', 'pending']);

  const query =
    cadence === 'h24'
      ? base
          .gte('start_at', new Date(now.getTime() + H24_WINDOW_START_HOURS * HOUR_MS).toISOString())
          .lte('start_at', new Date(now.getTime() + H24_WINDOW_END_HOURS * HOUR_MS).toISOString())
      : base
          .gte('start_at', now.toISOString())
          .lt('start_at', clinicDayRange(now)[1].toISOString());

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const candidates: AppointmentReminderCandidate[] = [];
  for (const row of (data ?? []) as unknown as AppointmentRow[]) {
    if (row.status !== 'requested' && row.status !== 'pending') continue;
    const patient = firstEmbed(row.patients);
    const provider = firstEmbed(row.providers);
    const patientName = patient?.full_name?.trim() ?? '';
    const patientPhoneE164 = patient?.phone_e164?.trim() ?? '';
    if (!row.patient_id || !patientName || !patientPhoneE164) continue;
    candidates.push({
      appointmentId: row.id,
      patientId: row.patient_id,
      patientName,
      patientPhoneE164,
      providerName: provider?.name?.trim() ?? '',
      startAt: row.start_at,
      status: row.status,
    });
  }
  return candidates;
}

/** `true` si el contacto de WhatsApp del teléfono está dado de baja. */
async function isPhoneOptedOut(phone: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('whatsapp_contacts')
    .select('opt_in_status')
    .eq('phone_e164', phone)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as { opt_in_status?: string } | null)?.opt_in_status === 'opted_out';
}

async function findExistingReminder(reminderKey: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('appointment_reminders')
    .select('id, status, dry_run')
    .eq('reminder_key', reminderKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as { id: string } | null) ?? null;
}

async function persistReminderRow(input: {
  appointmentId: string;
  reminderKey: string;
  cadence: AppointmentReminderCadence;
  status: 'scheduled' | 'sent' | 'failed';
  dryRun: boolean;
  providerMessageId?: string;
  error?: string;
}): Promise<'inserted' | 'duplicate'> {
  const payload: Record<string, unknown> = {
    appointment_id: input.appointmentId,
    reminder_key: input.reminderKey,
    cadence: input.cadence,
    template_name: APPOINTMENT_REMINDER_TEMPLATE_NAME,
    status: input.status,
    dry_run: input.dryRun,
  };
  if (input.providerMessageId) {
    payload.provider_message_id = input.providerMessageId;
    payload.sent_at = new Date().toISOString();
  }
  if (input.error) {
    payload.error = input.error;
  }

  const { error } = await getSupabaseAdmin().from('appointment_reminders').insert(payload);
  if (error) {
    // Carrera entre dos corridas sobre la misma llave: idempotente, no es error.
    if ((error as { code?: string }).code === DUPLICATE_KEY_CODE) return 'duplicate';
    throw new Error(error.message);
  }
  return 'inserted';
}

/**
 * Acción determinista de envío invocada por el cron. No es una herramienta
 * orientada al paciente: sólo se expone del lado servidor.
 *
 * Idempotente sobre `reminder_key`: si ya existe (o si otra corrida inserta la
 * misma llave en paralelo, `23505`), devuelve `{ sent:false, skipped:true }` y
 * nunca reenvía. En dry-run persiste una fila `scheduled` sin llamar al
 * proveedor. Respeta `whatsapp_contacts.opt_in_status = 'opted_out'`.
 */
export async function sendAppointmentReminder(
  input: SendAppointmentReminderInput
): Promise<SendAppointmentReminderResult> {
  const reminderKey = buildAppointmentReminderKey(
    input.appointmentId,
    input.cadence,
    input.period
  );

  if (await isPhoneOptedOut(input.patientPhoneE164)) {
    return { reminderKey, sent: false, skipped: true };
  }

  const existing = await findExistingReminder(reminderKey);
  if (existing) {
    return { reminderKey, sent: false, skipped: true };
  }

  if (input.dryRun) {
    const outcome = await persistReminderRow({
      appointmentId: input.appointmentId,
      reminderKey,
      cadence: input.cadence,
      status: 'scheduled',
      dryRun: true,
    });
    if (outcome === 'duplicate') {
      return { reminderKey, sent: false, skipped: true };
    }
    return { reminderKey, sent: false, skipped: false, dryRun: true };
  }

  const vars = formatAppointmentTemplateVars({
    patientName: input.patientName,
    providerName: input.providerName,
    startAt: input.startAt,
  });

  const sendResult: WhatsAppSendResult = await sendWhatsAppTemplateMessage({
    to: input.patientPhoneE164,
    templateName: APPOINTMENT_REMINDER_TEMPLATE_NAME,
    languageCode: APPOINTMENT_REMINDER_TEMPLATE_LANGUAGE,
    bodyParameters: buildAppointmentReminderBodyParameters(vars),
  });

  const errorMessage = sendResult.ok ? undefined : sendResult.error ?? 'send_failed';
  const outcome = await persistReminderRow({
    appointmentId: input.appointmentId,
    reminderKey,
    cadence: input.cadence,
    status: sendResult.ok ? 'sent' : 'failed',
    dryRun: false,
    providerMessageId: sendResult.providerMessageId,
    error: errorMessage,
  });

  if (outcome === 'duplicate') {
    return { reminderKey, sent: false, skipped: true };
  }

  return {
    reminderKey,
    sent: sendResult.ok,
    skipped: false,
    providerMessageId: sendResult.providerMessageId,
    error: errorMessage,
  };
}
