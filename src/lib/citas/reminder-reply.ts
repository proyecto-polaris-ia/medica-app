/**
 * Respuestas al recordatorio de cita (issue #87) — núcleo **puro**.
 *
 * Este módulo no hace I/O: no lee `process.env`, no toca Supabase y no usa
 * `Date.now()` implícito (recibe `now`/`phone`). Interpreta la respuesta del
 * paciente de forma determinista (confirmación / cancelación / ambigua) y
 * resuelve la elegibilidad y el rastro auditable. La orquestación con Supabase
 * vive en `reminder-reply-service.ts` y el update guardado en
 * `appointment-status.ts`.
 *
 * Sobre `flow-control.ts`: `detectConfirmation`/`detectCancellation` se
 * reutilizan tal cual, pero no reconocen `"1"`, `"va"` ni `"no puedo"`, que el
 * spec sí exige. Esas extensiones viven aquí (no se modifica `flow-control.ts`).
 */

import { detectCancellation, detectConfirmation } from '@/lib/flows/flow-control';

export type ReminderReplyIntent = 'confirmation' | 'cancellation' | 'ambiguous' | 'none';

/**
 * Afirmativos simples propios del flujo de recordatorio. `detectConfirmation`
 * no reconoce `"1"` ni `"va"`, que el spec exige explícitamente. La
 * coincidencia es por **token inicial** (contenido posterior permitido) para
 * que una confirmación mezclada con un síntoma ("ok, pero...", "sí, me
 * duele...") siga reconociéndose como afirmativa y pueda clasificarse como
 * ambigua en vez de caer a `'none'`.
 */
export const REPLY_AFFIRMATIVE =
  /^(1|va|ok|okay|s[ií]|confirmo|confirmar|dale|claro|por supuesto|afirmativo|yes)(?![\p{L}\p{N}])/iu;

/**
 * Cancelaciones propias del flujo de recordatorio. `CANCEL_PATTERNS`
 * (`flow-control.ts`) no captura `"no puedo"` ni `"no podré"`. Se usan
 * lookarounds Unicode (no `\b`) para que los límites funcionen con `é`.
 */
export const REPLY_CANCELLATION =
  /(?<![\p{L}])(no puedo|no podr[eé]|no asistir[eé]?|no voy a poder|no alcanzo|cancelar|cancelo)(?![\p{L}])/iu;

/**
 * Señal clínica que convierte una confirmación/cancelación en ambigüedad.
 * Extiende los patrones clínicos de `eve-escalation.ts` (hoy privados) con
 * `dolor|duele` genérico y `medicin\w*` (cubre "medicina" y "medicamento").
 * Candidato a unificación futura; `eve-escalation.ts` no se modifica aquí.
 */
export const CLINICAL_AMBIGUITY =
  /\b(dolor|duele|duel[ea]|urgenc\w*|emergenc\w*|infecci[oó]n\w*|hinchaz[oó]n\w*|sangrado|alerg\w*|medicin\w*|receta|antibi[oó]tico|analg[eé]sico)\b/i;

/** `true` si el mensaje es una confirmación afirmativa de la cita. */
export function isReminderReplyConfirmation(message: string): boolean {
  return detectConfirmation(message) === 'yes' || REPLY_AFFIRMATIVE.test(message.trim());
}

/** `true` si el mensaje expresa que el paciente no podrá asistir. */
export function isReminderReplyCancellation(message: string): boolean {
  return detectCancellation(message) || REPLY_CANCELLATION.test(message);
}

/** `true` si el mensaje mezcla la respuesta con una señal clínica. */
export function hasClinicalAmbiguity(message: string): boolean {
  return CLINICAL_AMBIGUITY.test(message);
}

/**
 * Clasificación determinista de la intención. Orden exigido:
 * ambigüedad → cancelación → confirmación. Si no hay señal de confirmación ni
 * de cancelación devuelve `'none'` (el pipeline general escala por sí mismo si
 * trae señal clínica).
 */
export function classifyReminderReply(message: string): ReminderReplyIntent {
  const confirmation = isReminderReplyConfirmation(message);
  const cancellation = isReminderReplyCancellation(message);
  if (!confirmation && !cancellation) return 'none';
  if (hasClinicalAmbiguity(message)) return 'ambiguous';
  if (cancellation) return 'cancellation';
  return 'confirmation';
}

// ---------------------------------------------------------------------------
// Elegibilidad (design.md §1) y rastro auditable (design.md §4)
// ---------------------------------------------------------------------------

/** Ventana máxima desde el envío del recordatorio para considerarlo vigente. */
export const REMINDER_REPLY_WINDOW_HOURS = 36;

/** Estados de cita que permiten confirmar desde el recordatorio. */
export const CONFIRM_ALLOWED_FROM = ['requested', 'pending'] as const;

/** Estados de cita que permiten cancelar desde el recordatorio. */
export const CANCEL_ALLOWED_FROM = ['requested', 'pending', 'confirmed'] as const;

export type AppointmentReminderReplyStatus =
  | 'requested'
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show'
  | 'attended';

export type ReminderReplyCandidate = {
  reminderId: string;
  appointmentId: string;
  sentAt: string;
  appointmentStatus: AppointmentReminderReplyStatus;
  patientName: string;
  patientPhoneE164: string;
  startAt: string;
  endAt: string;
  notes: string | null;
};

/**
 * Normalización de teléfono, espejo JS de `normalize_whatsapp_phone`
 * (`regexp_replace(coalesce(phone,''), '\D', '', 'g')`). PostgREST no puede
 * invocar la función SQL en un filtro `.eq`, así que se compara en JS.
 */
export function normalizePhoneValue(phone: string): string {
  return phone.replace(/\D/g, '');
}

const HOUR_MS = 60 * 60 * 1000;

/** Inicio (inclusive) de la ventana de elegibilidad: `now - 36 h`. */
export function reminderReplyWindowStart(now: Date): Date {
  return new Date(now.getTime() - REMINDER_REPLY_WINDOW_HOURS * HOUR_MS);
}

/**
 * `true` si el candidato es una respuesta válida al recordatorio para el
 * destino pedido: teléfono coincidente, `sentAt` dentro de `[now-36h, now]` y
 * estado de cita en el set permitido.
 */
export function isEligibleReminderReplyCandidate(
  candidate: ReminderReplyCandidate,
  input: { phone: string; now: Date; to: 'confirmed' | 'cancelled' }
): boolean {
  const allowed: readonly string[] =
    input.to === 'confirmed' ? CONFIRM_ALLOWED_FROM : CANCEL_ALLOWED_FROM;
  if (!allowed.includes(candidate.appointmentStatus)) return false;
  if (
    normalizePhoneValue(candidate.patientPhoneE164) !== normalizePhoneValue(input.phone)
  ) {
    return false;
  }
  const sentAt = Date.parse(candidate.sentAt);
  if (Number.isNaN(sentAt)) return false;
  const now = input.now.getTime();
  return sentAt >= reminderReplyWindowStart(input.now).getTime() && sentAt <= now;
}

/**
 * Elige de forma determinista el candidato elegible: primero el `sentAt` más
 * reciente; en empate, el `startAt` más próximo (más temprano). No depende del
 * orden de la query.
 */
export function pickEligibleReminderReplyCandidate(
  candidates: ReminderReplyCandidate[],
  input: { phone: string; now: Date; to: 'confirmed' | 'cancelled' }
): ReminderReplyCandidate | null {
  const eligible = candidates.filter((candidate) =>
    isEligibleReminderReplyCandidate(candidate, input)
  );
  if (eligible.length === 0) return null;
  const [best] = [...eligible].sort((a, b) => {
    const sentDiff = Date.parse(b.sentAt) - Date.parse(a.sentAt);
    if (sentDiff !== 0) return sentDiff;
    return Date.parse(a.startAt) - Date.parse(b.startAt);
  });
  return best ?? null;
}

const CLINIC_TIME_ZONE = 'America/Mexico_City';
const REASON_MAX_LENGTH = 200;

const CLINIC_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Marca de tiempo clínica normalizada a `YYYY-MM-DD HH:mm`. */
function formatClinicTimestamp(occurredAt: Date): string {
  const parts = CLINIC_TIMESTAMP_FORMATTER.formatToParts(occurredAt);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** Sanea el motivo del paciente: recorta, colapsa espacios/saltos y trunca. */
function sanitizeReason(reasonText: string): string {
  return reasonText.replace(/\s+/g, ' ').trim().slice(0, REASON_MAX_LENGTH);
}

/**
 * Construye la entrada de rastro auditable con el formato exacto del spec:
 * `[YYYY-MM-DD HH:mm America/Mexico_City] Confirmada|Cancelada desde recordatorio
 * (quién: sistema/recordatorio)[. Motivo: <texto>]`.
 */
export function buildReminderReplyNotesEntry(input: {
  to: 'confirmed' | 'cancelled';
  occurredAt: Date;
  reasonText?: string;
}): string {
  const timestamp = formatClinicTimestamp(input.occurredAt);
  const label = input.to === 'confirmed' ? 'Confirmada' : 'Cancelada';
  const base = `[${timestamp} ${CLINIC_TIME_ZONE}] ${label} desde recordatorio (quién: sistema/recordatorio)`;
  const reason = input.reasonText ? sanitizeReason(input.reasonText) : '';
  return reason ? `${base}. Motivo: ${reason}` : base;
}

/** Anexa una entrada al rastro existente, separando con `' | '`. */
export function appendReminderReplyNotes(existing: string | null, entry: string): string {
  const current = existing?.trim();
  return current ? `${current} | ${entry}` : entry;
}
