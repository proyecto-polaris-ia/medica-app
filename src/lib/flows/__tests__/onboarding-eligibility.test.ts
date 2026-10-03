import { describe, expect, it } from 'vitest';
import {
  resolveOnboardingStartState,
  shouldStartOnboarding,
  type OnboardingEligibilityInput,
} from '../onboarding-eligibility';

function input(
  overrides: Partial<OnboardingEligibilityInput> = {}
): OnboardingEligibilityInput {
  return {
    enabled: true,
    historyExists: false,
    missingEmail: false,
    hasFutureScheduledAppointment: true,
    ...overrides,
  };
}

/**
 * Predicado puro del disparador (design.md D5, requirement ONB-R1).
 * Fase 1: solo `!historyExists` arranca la recolección de historia.
 */
describe('shouldStartOnboarding', () => {
  it('arranca con flag encendido, sin historia y cita futura', () => {
    expect(shouldStartOnboarding(input())).toBe(true);
  });

  it('no arranca con el flag apagado', () => {
    expect(shouldStartOnboarding(input({ enabled: false }))).toBe(false);
  });

  it('no arranca sin cita futura programada', () => {
    expect(
      shouldStartOnboarding(input({ hasFutureScheduledAppointment: false }))
    ).toBe(false);
  });

  it('no arranca con historia existente y email presente', () => {
    expect(
      shouldStartOnboarding(input({ historyExists: true, missingEmail: false }))
    ).toBe(false);
  });

  it('permite iniciar solo-contacto cuando hay historia y falta email (Fase 2)', () => {
    expect(
      shouldStartOnboarding(input({ historyExists: true, missingEmail: true }))
    ).toBe(true);
  });
});

describe('resolveOnboardingStartState', () => {
  it('devuelve ask_allergies cuando no hay historia', () => {
    expect(
      resolveOnboardingStartState({ historyExists: false, missingEmail: false })
    ).toBe('ask_allergies');
  });

  it('devuelve ask_allergies cuando no hay historia aunque falte email', () => {
    expect(
      resolveOnboardingStartState({ historyExists: false, missingEmail: true })
    ).toBe('ask_allergies');
  });

  it('devuelve null con historia existente (Fase 1 no inicia solo-contacto)', () => {
    expect(
      resolveOnboardingStartState({ historyExists: true, missingEmail: true })
    ).toBeNull();
    expect(
      resolveOnboardingStartState({ historyExists: true, missingEmail: false })
    ).toBeNull();
  });
});
