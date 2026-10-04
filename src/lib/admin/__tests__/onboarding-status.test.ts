import { describe, expect, it } from 'vitest';
import { deriveOnboardingStatus } from '../onboarding-status';

describe('deriveOnboardingStatus', () => {
  it('devuelve "pendiente" cuando el paciente no tiene fila de historia clínica', () => {
    expect(deriveOnboardingStatus({ historyExists: false, source: null })).toBe('pendiente');
  });

  it('devuelve "completo" con historia de autoreporte del paciente', () => {
    expect(
      deriveOnboardingStatus({ historyExists: true, source: 'patient_autoreport' })
    ).toBe('completo');
  });

  it('devuelve "completo" con historia capturada por staff (ya validada, no se nudgea)', () => {
    expect(deriveOnboardingStatus({ historyExists: true, source: 'staff' })).toBe('completo');
  });

  it('la procedencia no cambia el resultado binario cuando existe historia', () => {
    expect(deriveOnboardingStatus({ historyExists: true, source: null })).toBe('completo');
  });

  it('la derivación es reproducible para la misma entrada', () => {
    const input = { historyExists: true, source: 'patient_autoreport' as const };
    expect(deriveOnboardingStatus(input)).toBe(deriveOnboardingStatus(input));
  });
});
