/**
 * Onboarding Answers — módulo puro (D2)
 *
 * Interpretación determinista de las respuestas del onboarding de historia
 * clínica básica. No hace I/O, no llama al LLM y no importa Supabase/WhatsApp:
 * solo mapea texto a transiciones y actualiza el borrador (`OnboardingDraft`).
 *
 * El motor (`flow-engine`) es la única autoridad de transición; este módulo
 * decide qué transición corresponde a cada respuesta.
 */

import type {
  Sex,
  PregnancyStatus,
  SmokingStatus,
  AlcoholStatus,
} from '@/lib/admin/types';

export type OnboardingDraftContext = {
  patientId: string;
  phone: string;
  patientName: string;
  sex: Sex | null;
  missingEmail: boolean;
};

export type OnboardingDraft = {
  context: OnboardingDraftContext;
  /** `null` = no preguntado; `[]` = el paciente respondió "no". */
  allergies: string[] | null;
  medications: string[] | null;
  conditions: string[] | null;
  pregnancyStatus: PregnancyStatus | null;
  smoking: SmokingStatus | null;
  alcohol: AlcoholStatus | null;
  /** Fase 2. */
  email: string | null;
  confirmed?: boolean;
};

export type OnboardingStepResult = {
  transition: string;
  draft: OnboardingDraft;
  /**
   * `true` cuando la respuesta cruda ya fue consumida por el determinista y
   * debe limpiarse antes de avanzar, para que el motor vuelva a preguntar (el
   * mismo paso en `retry`/`restart`, o el siguiente paso en las transiciones
   * hacia adelante).
   */
  clearAnswer?: boolean;
};

const MAX_ANSWER_LENGTH = 500;

const YES_ANSWERS = new Set(['sí', 'si', 'yes', 'claro', 'correcto']);
const NO_ANSWERS = new Set(['no', 'nunca', 'ninguna', 'ninguno']);

const SMOKING_MAP: Record<string, SmokingStatus> = {
  nunca: 'never',
  no: 'never',
  jamás: 'never',
  antes: 'former',
  exfumador: 'former',
  'antes fumaba': 'former',
  dejé: 'former',
  sí: 'current',
  si: 'current',
  actualmente: 'current',
  'actualmente fumo': 'current',
  fumo: 'current',
};

const ALCOHOL_MAP: Record<string, AlcoholStatus> = {
  nunca: 'never',
  no: 'never',
  ocasional: 'occasional',
  ocasionalmente: 'occasional',
  'a veces': 'occasional',
  socialmente: 'occasional',
  frecuente: 'frequent',
  frecuentemente: 'frequent',
  seguido: 'frequent',
  mucho: 'frequent',
};

/**
 * Normaliza la respuesta cruda: trim + colapso de espacios + máximo 500
 * caracteres. El detalle clínico se guarda tal cual, sin interpretación.
 */
export function rawNormalizado(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_ANSWER_LENGTH);
}

function normalizeToken(raw: string): string {
  return rawNormalizado(raw).toLowerCase();
}

export function parseYesNo(raw: string): 'yes' | 'no' | null {
  const token = normalizeToken(raw);
  if (YES_ANSWERS.has(token)) return 'yes';
  if (NO_ANSWERS.has(token)) return 'no';
  return null;
}

export function parseSmoking(raw: string): SmokingStatus | null {
  return SMOKING_MAP[normalizeToken(raw)] ?? null;
}

export function parseAlcohol(raw: string): AlcoholStatus | null {
  return ALCOHOL_MAP[normalizeToken(raw)] ?? null;
}

function resetAnswers(draft: OnboardingDraft): OnboardingDraft {
  return {
    ...draft,
    allergies: null,
    medications: null,
    conditions: null,
    pregnancyStatus: null,
    smoking: null,
    alcohol: null,
    email: null,
    confirmed: false,
  };
}

function retry(draft: OnboardingDraft): OnboardingStepResult {
  return { transition: 'retry', draft, clearAnswer: true };
}

function forward(
  transition: string,
  draft: OnboardingDraft
): OnboardingStepResult {
  return { transition, draft, clearAnswer: true };
}

/**
 * Evalúa la respuesta del paciente para el paso actual y devuelve la
 * transición y el borrador actualizado.
 */
export function evaluateOnboardingStep(input: {
  step: string;
  rawAnswer: string;
  draft: OnboardingDraft;
}): OnboardingStepResult {
  const { step, rawAnswer, draft } = input;
  const raw = rawNormalizado(rawAnswer);

  switch (step) {
    case 'ask_allergies': {
      const answer = parseYesNo(raw);
      if (answer === 'yes') return forward('yes', draft);
      if (answer === 'no') return forward('no', { ...draft, allergies: [] });
      return retry(draft);
    }

    case 'ask_allergies_detail':
      return forward('next', { ...draft, allergies: [raw] });

    case 'ask_medications': {
      const answer = parseYesNo(raw);
      if (answer === 'yes') return forward('yes', draft);
      if (answer === 'no') return forward('no', { ...draft, medications: [] });
      return retry(draft);
    }

    case 'ask_medications_detail':
      return forward('next', { ...draft, medications: [raw] });

    case 'ask_conditions': {
      const answer = parseYesNo(raw);
      if (answer === 'yes') return forward('yes', draft);
      if (answer === 'no') return forward('no', { ...draft, conditions: [] });
      return retry(draft);
    }

    case 'ask_conditions_detail': {
      const withConditions = { ...draft, conditions: [raw] };
      if (draft.context.sex === 'female') {
        return forward('next_pregnancy', withConditions);
      }
      return forward('next_no_pregnancy', {
        ...withConditions,
        pregnancyStatus: 'not_applicable',
      });
    }

    case 'ask_pregnancy': {
      const answer = parseYesNo(raw);
      if (answer === 'yes') {
        return forward('next', { ...draft, pregnancyStatus: 'yes' });
      }
      if (answer === 'no') {
        return forward('next', { ...draft, pregnancyStatus: 'no' });
      }
      return retry(draft);
    }

    case 'ask_smoking': {
      const smoking = parseSmoking(raw);
      if (!smoking) return retry(draft);
      return forward('next', { ...draft, smoking });
    }

    case 'ask_alcohol': {
      const alcohol = parseAlcohol(raw);
      if (!alcohol) return retry(draft);
      return forward('next', { ...draft, alcohol });
    }

    case 'show_summary': {
      if (parseYesNo(raw) === 'yes') return forward('confirm', draft);
      return { transition: 'restart', draft: resetAnswers(draft), clearAnswer: true };
    }

    default:
      throw new Error(`Paso de onboarding desconocido: ${step}`);
  }
}

function formatList(values: string[] | null, emptyLabel: string): string {
  if (values === null) return 'Sin dato';
  if (values.length === 0) return emptyLabel;
  return values.join(', ');
}

function formatPregnancy(status: PregnancyStatus | null): string {
  switch (status) {
    case 'yes':
      return 'Sí';
    case 'no':
      return 'No';
    case 'not_applicable':
      return 'No aplica';
    default:
      return 'Sin dato';
  }
}

function formatSmoking(status: SmokingStatus | null): string {
  switch (status) {
    case 'never':
      return 'Nunca';
    case 'former':
      return 'Antes fumaba';
    case 'current':
      return 'Actualmente fuma';
    default:
      return 'Sin dato';
  }
}

function formatAlcohol(status: AlcoholStatus | null): string {
  switch (status) {
    case 'never':
      return 'Nunca';
    case 'occasional':
      return 'Ocasionalmente';
    case 'frequent':
      return 'Frecuentemente';
    default:
      return 'Sin dato';
  }
}

/**
 * Construye el resumen fiel (una línea por dato) que sustituye el placeholder
 * `{onboardingSummary}`.
 */
export function buildOnboardingSummary(draft: OnboardingDraft): string {
  return [
    `Alergias: ${formatList(draft.allergies, 'Ninguna')}`,
    `Medicamentos: ${formatList(draft.medications, 'Ninguno')}`,
    `Condiciones médicas: ${formatList(draft.conditions, 'Ninguna')}`,
    `Embarazo: ${formatPregnancy(draft.pregnancyStatus)}`,
    `Tabaquismo: ${formatSmoking(draft.smoking)}`,
    `Alcohol: ${formatAlcohol(draft.alcohol)}`,
  ].join('\n');
}
