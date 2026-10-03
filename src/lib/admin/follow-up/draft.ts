import { ValidationError } from '../validate';
import type { FollowUpReason } from './rules';

/**
 * Generación determinista de borradores de seguimiento (puro, sin LLM ni I/O).
 *
 * Las plantillas son fijas por motivo y se redactan en español de México con
 * tono amable. Todo texto pasa por `validateFollowUpDraftText` al generarse y se
 * vuelve a validar antes de enviarse: nunca diagnósticos, consejos clínicos,
 * precios ni presión comercial.
 */

/** Nombre de la plantilla HSM aprobada en Meta para el seguimiento. */
export const FOLLOW_UP_TEMPLATE_NAME = 'seguimiento_paciente';

/** Longitud máxima permitida del cuerpo de un borrador. */
export const MAX_DRAFT_LENGTH = 600;

/**
 * Delimita una lista de términos sin depender de `\b`: los términos que inician
 * con vocal acentuada (`última oportunidad`) no coinciden con `\b`, que solo
 * entiende límites ASCII. Los lookarounds Unicode evitan falsos positivos
 * (`precioso` no dispara `precio`) y sí detectan los términos acentuados.
 */
function phrasePattern(terms: string[]): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(${terms.join('|')})(?![\\p{L}\\p{N}])`,
    'iu'
  );
}

const PRICE_PATTERNS: RegExp[] = [
  /\$\s?\d/,
  phrasePattern(['precio', 'costo', 'cuánto cuesta', 'descuento']),
];

const CLINICAL_PATTERNS: RegExp[] = [
  phrasePattern([
    'diagnóstico',
    'receta',
    'medicamento',
    'antibiótico',
    'analgésico',
    'infección',
    'dolor intenso',
  ]),
];

const PRESSURE_PATTERNS: RegExp[] = [
  phrasePattern([
    'última oportunidad',
    'oferta',
    'promoción',
    'urgente',
    'ahora o nunca',
  ]),
];

const FORBIDDEN_PATTERNS: RegExp[] = [
  ...PRICE_PATTERNS,
  ...CLINICAL_PATTERNS,
  ...PRESSURE_PATTERNS,
];

const TEMPLATES: Record<FollowUpReason, (firstName: string) => string> = {
  no_show: (name) =>
    `Hola ${name}, notamos que no pudimos atenderte en tu cita anterior. ¿Te gustaría agendar un nuevo espacio? Con gusto te ayudamos.`,
  treatment_in_progress: (name) =>
    `Hola ${name}, queremos dar seguimiento a tu tratamiento para que puedas continuar con tu plan. ¿Te gustaría agendar tu siguiente visita?`,
  quote_no_response: (name) =>
    `Hola ${name}, seguimos a tus órdenes para resolver cualquier duda sobre tu plan de tratamiento. Cuando quieras podemos agendar una valoración.`,
  inactive: (name) =>
    `Hola ${name}, hace tiempo que no te vemos en el consultorio. ¿Te gustaría agendar una revisión?`,
};

/**
 * Normaliza el texto: `trim`, colapso de saltos de línea y espacios múltiples a
 * un solo espacio. Devuelve el texto listo para persistir o enviar.
 */
function normalizeDraftText(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

/**
 * Primer token del nombre con inicial mayúscula (`maría lópez` → `María`).
 * Cadena vacía si no hay nombre utilizable.
 */
export function followUpFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * Valida y normaliza el cuerpo de un borrador.
 *
 * Lanza `ValidationError('body', ...)` si el texto queda vacío, excede
 * `MAX_DRAFT_LENGTH` o contiene un patrón prohibido (precios, términos clínicos
 * o presión comercial). En caso contrario devuelve el texto normalizado.
 */
export function validateFollowUpDraftText(body: string): string {
  const normalized = normalizeDraftText(body);

  if (normalized.length === 0) {
    throw new ValidationError('body', 'Draft body cannot be empty');
  }

  if (normalized.length > MAX_DRAFT_LENGTH) {
    throw new ValidationError(
      'body',
      `Draft body exceeds ${MAX_DRAFT_LENGTH} characters`
    );
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new ValidationError('body', 'Draft body contains a forbidden phrase');
    }
  }

  return normalized;
}

/**
 * Construye el borrador determinista de un paciente a partir de su motivo.
 *
 * El cuerpo se valida con los mismos guardrails antes de devolverse, de modo
 * que un nombre con texto prohibido (por ejemplo un precio) no pueda colarse.
 */
export function buildFollowUpDraft(input: {
  patientName: string;
  reason: FollowUpReason;
}): { body: string; templateName: string } {
  const firstName = followUpFirstName(input.patientName);
  if (!firstName) {
    throw new ValidationError('patientName', 'Patient name cannot be empty');
  }

  const body = validateFollowUpDraftText(TEMPLATES[input.reason](firstName));

  return { body, templateName: FOLLOW_UP_TEMPLATE_NAME };
}
