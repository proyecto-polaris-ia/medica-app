/**
 * Feature flag del onboarding pre-cita (design.md D5, requirement ONB-R7).
 *
 * `WHATSAPP_ONBOARDING_ENABLED` habilita el disparador determinista del flujo
 * de onboarding; `WHATSAPP_ONBOARDING_NUDGE_ENABLED` habilitará el nudge de la
 * Fase 3. Convención estándar del repo: `true`, `1` o `yes`
 * (case-insensitive) encienden; cualquier otra cosa (y una variable ausente) apaga, por lo que el
 * default es **off**.
 *
 * Este módulo es la única lectura de estas variables de entorno; los
 * consumidores llaman sin argumento.
 */

const TRUTHY_VALUES = new Set(['true', '1', 'yes']);

function resolve(rawValue: string | null | undefined, envName: string): boolean {
  const value = rawValue === undefined ? process.env[envName] : rawValue;
  if (value == null) return false;
  return TRUTHY_VALUES.has(value.trim().toLowerCase());
}

export function isOnboardingEnabled(rawValue?: string | null): boolean {
  return resolve(rawValue, 'WHATSAPP_ONBOARDING_ENABLED');
}

export function isOnboardingNudgeEnabled(rawValue?: string | null): boolean {
  return resolve(rawValue, 'WHATSAPP_ONBOARDING_NUDGE_ENABLED');
}
