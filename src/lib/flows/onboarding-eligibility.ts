/**
 * Onboarding Eligibility — predicado puro del disparador (design.md D5).
 *
 * Decide, a partir de hechos ya persistidos, si corresponde iniciar el flujo de
 * onboarding y en qué estado. No hace I/O ni conoce WhatsApp/Supabase.
 *
 * Reglas (D5): `enabled` y `hasFutureScheduledAppointment` y
 * (`!historyExists` **o** `missingEmail`). Sin historia arranca la recolección
 * (`'ask_allergies'`); con historia y sin email arranca el solo-contacto
 * (`'ask_email'`, Fase 2).
 */

export type OnboardingEligibilityInput = {
  enabled: boolean;
  historyExists: boolean;
  missingEmail: boolean;
  hasFutureScheduledAppointment: boolean;
};

export type OnboardingStartState = 'ask_allergies' | 'ask_email';

export function shouldStartOnboarding(
  input: OnboardingEligibilityInput
): boolean {
  if (!input.enabled) return false;
  if (!input.hasFutureScheduledAppointment) return false;
  return !input.historyExists || input.missingEmail;
}

export function resolveOnboardingStartState(input: {
  historyExists: boolean;
  missingEmail: boolean;
}): OnboardingStartState | null {
  if (!input.historyExists) return 'ask_allergies';
  if (input.missingEmail) return 'ask_email';
  return null;
}
