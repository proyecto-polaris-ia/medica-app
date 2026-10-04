/**
 * Onboarding Urgency — detector puro (design.md D7, requirement ONB-R5).
 *
 * Subconjunto deliberadamente acotado de las señales de urgencia del spec:
 * dolor fuerte, inflamación severa, alergia a anestesia, sangrado, fiebre y
 * señales respiratorias. A diferencia de la detección general de escalación
 * clínica, **no** incluye patrones genéricos como `/alerg/` o `/medicament/`,
 * porque durante el onboarding esas palabras son respuestas legítimas
 * («soy alérgico a la penicilina», «tomo medicamento») y escalarían el 100% de
 * los casos.
 */

const MAX_INPUT_LENGTH = 1000;

const URGENCY_PATTERNS: RegExp[] = [
  /dolor\s+(fuerte|intenso|insoportable|severo)/,
  /urgenc|emergenc/,
  /infecci[oó]n|hinchaz[oó]n/,
  /sangrado\s+(abundante|activo)|no\s+para\s+de\s+sangrar/,
  /fiebre/,
  /alergia\s+a\s+(la\s+)?anestesia|anestesia.*alerg/,
  /no\s+puedo\s+respirar|desmay/,
];

export function detectOnboardingUrgency(text: string): {
  urgent: boolean;
  matched?: string;
} {
  const normalized = (text ?? '').slice(0, MAX_INPUT_LENGTH).toLowerCase();

  for (const pattern of URGENCY_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      return { urgent: true, matched: match[0] };
    }
  }

  return { urgent: false };
}
