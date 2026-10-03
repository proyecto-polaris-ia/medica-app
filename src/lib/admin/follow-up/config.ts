/**
 * Umbrales y prioridad del módulo de seguimiento (follow-up).
 *
 * Módulo puro: solo constantes, sin I/O ni reloj implícito. Es la única fuente
 * de verdad de los umbrales de segmentación y del orden de prioridad de motivos.
 */

export const NO_SHOW_WINDOW_DAYS = 90;
export const STALLED_TREATMENT_DAYS = 45;
export const INACTIVE_PATIENT_MONTHS = 6;
/** Derivada en días (180) para mantener las reglas puramente en días. */
export const INACTIVE_PATIENT_DAYS = INACTIVE_PATIENT_MONTHS * 30;
export const UNANSWERED_QUOTE_DAYS = 21;

/** Prioridad de motivos, de mayor a menor. */
export const FOLLOW_UP_REASON_PRIORITY = [
  'no_show',
  'treatment_in_progress',
  'quote_no_response',
  'inactive',
] as const;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
