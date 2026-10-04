import { describe, it, expect } from 'vitest';
import { onboardingFlow } from '../definitions/onboarding.flow';

const INTERACTIVE_STATES = [
  'ask_allergies',
  'ask_allergies_detail',
  'ask_medications',
  'ask_medications_detail',
  'ask_conditions',
  'ask_conditions_detail',
  'ask_pregnancy',
  'ask_smoking',
  'ask_alcohol',
  'show_summary',
  'ask_email',
  'show_contact_summary',
];

describe('onboardingFlow', () => {
  it('declara el flujo de onboarding con el estado inicial correcto', () => {
    expect(onboardingFlow.name).toBe('onboarding');
    expect(onboardingFlow.initialState).toBe('ask_allergies');
  });

  it('declara exactamente los estados de la Fase 1 y de la Fase 2', () => {
    expect(Object.keys(onboardingFlow.states).sort()).toEqual(
      [
        'ask_alcohol',
        'ask_allergies',
        'ask_allergies_detail',
        'ask_conditions',
        'ask_conditions_detail',
        'ask_email',
        'ask_medications',
        'ask_medications_detail',
        'ask_pregnancy',
        'ask_smoking',
        'complete',
        'save_contact',
        'save_history',
        'show_contact_summary',
        'show_summary',
      ].sort()
    );
  });

  it('exige onboardingAnswer y usa la acción determinista en cada paso interactivo', () => {
    for (const state of INTERACTIVE_STATES) {
      const def = onboardingFlow.states[state];
      expect(def, `estado ${state} ausente`).toBeDefined();
      expect(def.required).toEqual(['onboardingAnswer']);
      expect(def.action).toBe('evaluateOnboardingAnswer');
    }
  });

  it('save_history ejecuta la escritura única y no exige required', () => {
    const def = onboardingFlow.states.save_history;
    expect(def.action).toBe('saveOnboardingHistory');
    expect(def.required ?? []).toEqual([]);
  });

  it('save_contact ejecuta la escritura del contacto y no exige required', () => {
    const def = onboardingFlow.states.save_contact;
    expect(def.action).toBe('saveOnboardingContact');
    expect(def.required ?? []).toEqual([]);
  });

  it('complete es terminal', () => {
    expect(onboardingFlow.states.complete.terminal).toBe(true);
  });

  it('respeta el orden determinista y las transiciones de la tabla D2', () => {
    expect(onboardingFlow.states.ask_allergies.transitions).toEqual({
      yes: 'ask_allergies_detail',
      no: 'ask_medications',
      retry: 'ask_allergies',
    });
    expect(onboardingFlow.states.ask_allergies_detail.transitions).toEqual({
      next: 'ask_medications',
    });
    expect(onboardingFlow.states.ask_medications.transitions).toEqual({
      yes: 'ask_medications_detail',
      no: 'ask_conditions',
      retry: 'ask_medications',
    });
    expect(onboardingFlow.states.ask_medications_detail.transitions).toEqual({
      next: 'ask_conditions',
    });
    expect(onboardingFlow.states.ask_conditions.transitions).toEqual({
      yes: 'ask_conditions_detail',
      no: 'ask_pregnancy',
      retry: 'ask_conditions',
    });
    expect(onboardingFlow.states.ask_conditions_detail.transitions).toEqual({
      next_pregnancy: 'ask_pregnancy',
      next_no_pregnancy: 'ask_smoking',
    });
    expect(onboardingFlow.states.ask_pregnancy.transitions).toEqual({
      next: 'ask_smoking',
      retry: 'ask_pregnancy',
    });
    expect(onboardingFlow.states.ask_smoking.transitions).toEqual({
      next: 'ask_alcohol',
      retry: 'ask_smoking',
    });
    expect(onboardingFlow.states.ask_alcohol.transitions).toEqual({
      next: 'show_summary',
      retry: 'ask_alcohol',
    });
    expect(onboardingFlow.states.show_summary.transitions).toEqual({
      confirm: 'save_history',
      restart: 'ask_allergies',
    });
    expect(onboardingFlow.states.save_history.transitions).toEqual({
      complete: 'complete',
      needs_contact: 'ask_email',
    });
    expect(onboardingFlow.states.ask_email.transitions).toEqual({
      next: 'show_contact_summary',
      retry: 'ask_email',
    });
    expect(onboardingFlow.states.show_contact_summary.transitions).toEqual({
      confirm: 'save_contact',
      restart: 'ask_email',
    });
    expect(onboardingFlow.states.save_contact.transitions).toEqual({
      complete: 'complete',
    });
  });

  it('omite el detalle cuando el paciente responde "no" en alergias', () => {
    const transitions = onboardingFlow.states.ask_allergies.transitions!;
    expect(transitions.no).toBe('ask_medications');
    expect(transitions.no).not.toBe('ask_allergies_detail');
  });

  it('usa los prompts es-MX con los placeholders de onboarding', () => {
    expect(onboardingFlow.states.ask_allergies.prompt).toContain('{patientFirstName}');
    expect(onboardingFlow.states.ask_allergies.prompt).toContain('alergia');
    expect(onboardingFlow.states.ask_allergies_detail.prompt).toContain('alergias');
    expect(onboardingFlow.states.ask_medications.prompt).toContain('medicamento');
    expect(onboardingFlow.states.ask_conditions.prompt).toContain('condición médica');
    expect(onboardingFlow.states.show_summary.prompt).toContain('{onboardingSummary}');
    expect(onboardingFlow.states.ask_smoking.prompt).toBe(
      '¿Fumas? Responde: *nunca*, *antes fumaba* o *actualmente fumo*.'
    );
    expect(onboardingFlow.states.ask_alcohol.prompt).toBe(
      '¿Consumes alcohol? Responde: *nunca*, *ocasionalmente* o *frecuentemente*.'
    );
    expect(onboardingFlow.states.ask_email.prompt).toBe(
      'Para enviarte la confirmación, ¿me compartes tu correo electrónico?'
    );
    expect(onboardingFlow.states.show_contact_summary.prompt).toContain(
      '{onboardingContactSummary}'
    );
    expect(onboardingFlow.states.save_contact.prompt).toBe('Listo.');
    expect(onboardingFlow.states.complete.prompt).toContain('Ya dejé tus datos preparados');
  });
});
