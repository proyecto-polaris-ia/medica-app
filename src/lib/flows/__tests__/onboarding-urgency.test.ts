import { describe, expect, it } from 'vitest';
import { detectOnboardingUrgency } from '../onboarding-urgency';

/**
 * Detección determinista de urgencia durante onboarding (design.md D7,
 * requirement ONB-R5). Subconjunto acotado de señales del spec: no debe
 * sobreexcaltar respuestas clínicas legítimas.
 */
describe('detectOnboardingUrgency', () => {
  it('marca dolor fuerte, intenso, insoportable o severo', () => {
    expect(detectOnboardingUrgency('tengo dolor fuerte en la muela').urgent).toBe(true);
    expect(detectOnboardingUrgency('es un dolor intenso').urgent).toBe(true);
    expect(detectOnboardingUrgency('dolor insoportable').urgent).toBe(true);
    expect(detectOnboardingUrgency('dolor severo').urgent).toBe(true);
  });

  it('marca urgencia o emergencia', () => {
    expect(detectOnboardingUrgency('creo que es una urgencia').urgent).toBe(true);
    expect(detectOnboardingUrgency('necesito atención de emergencia').urgent).toBe(true);
  });

  it('marca infección o hinchazón', () => {
    expect(detectOnboardingUrgency('tengo una infección en la encía').urgent).toBe(true);
    expect(detectOnboardingUrgency('tengo hinchazón en la cara').urgent).toBe(true);
  });

  it('marca sangrado abundante o que no para', () => {
    expect(detectOnboardingUrgency('tengo sangrado abundante').urgent).toBe(true);
    expect(detectOnboardingUrgency('no para de sangrar').urgent).toBe(true);
  });

  it('marca fiebre', () => {
    expect(detectOnboardingUrgency('tengo fiebre').urgent).toBe(true);
  });

  it('marca alergia a la anestesia', () => {
    expect(detectOnboardingUrgency('tengo alergia a la anestesia').urgent).toBe(true);
    expect(detectOnboardingUrgency('la anestesia me da alergia').urgent).toBe(true);
  });

  it('marca no poder respirar o desmayo', () => {
    expect(detectOnboardingUrgency('no puedo respirar bien').urgent).toBe(true);
    expect(detectOnboardingUrgency('sentí que me iba a desmayar').urgent).toBe(true);
  });

  it('devuelve el fragmento que hizo match', () => {
    const result = detectOnboardingUrgency('tengo dolor fuerte desde ayer');
    expect(result.urgent).toBe(true);
    expect(result.matched).toBe('dolor fuerte');
  });

  it('NO marca respuestas clínicas legítimas (alergia a penicilina)', () => {
    expect(detectOnboardingUrgency('soy alérgico a la penicilina').urgent).toBe(false);
  });

  it('NO marca respuestas clínicas legítimas (tomo medicamentos)', () => {
    expect(detectOnboardingUrgency('tomo medicamento para la presión').urgent).toBe(false);
    expect(detectOnboardingUrgency('tomo medicamentos').urgent).toBe(false);
  });

  it('NO marca respuestas ordinarias del onboarding', () => {
    expect(detectOnboardingUrgency('no').urgent).toBe(false);
    expect(detectOnboardingUrgency('ninguna').urgent).toBe(false);
    expect(detectOnboardingUrgency('antes fumaba').urgent).toBe(false);
    expect(detectOnboardingUrgency('ocasionalmente').urgent).toBe(false);
    expect(detectOnboardingUrgency('sí, está correcto').urgent).toBe(false);
  });
});
