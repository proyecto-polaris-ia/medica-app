import { describe, it, expect } from 'vitest';
import {
  rawNormalizado,
  parseYesNo,
  parseSmoking,
  parseAlcohol,
  evaluateOnboardingStep,
  buildOnboardingSummary,
  type OnboardingDraft,
} from '../onboarding-answers';

function makeDraft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    context: {
      patientId: 'patient-1',
      phone: '+5215512345678',
      patientName: 'Ana López',
      sex: 'female',
      missingEmail: true,
    },
    allergies: null,
    medications: null,
    conditions: null,
    pregnancyStatus: null,
    smoking: null,
    alcohol: null,
    email: null,
    ...overrides,
  };
}

describe('onboarding-answers', () => {
  describe('rawNormalizado', () => {
    it('recorta, colapsa espacios y limita a 500 caracteres', () => {
      expect(rawNormalizado('  hola   mundo  ')).toBe('hola mundo');
      expect(rawNormalizado('a\t b\n c')).toBe('a b c');
      expect(rawNormalizado('x'.repeat(600))).toHaveLength(500);
    });
  });

  describe('parseYesNo', () => {
    it('reconoce las opciones afirmativas literales', () => {
      for (const raw of ['sí', 'si', 'yes', 'claro', 'correcto']) {
        expect(parseYesNo(raw)).toBe('yes');
      }
    });

    it('reconoce las opciones negativas literales', () => {
      for (const raw of ['no', 'nunca', 'ninguna', 'ninguno']) {
        expect(parseYesNo(raw)).toBe('no');
      }
    });

    it('normaliza mayúsculas y espacios', () => {
      expect(parseYesNo('  SÍ ')).toBe('yes');
      expect(parseYesNo('NO')).toBe('no');
    });

    it('devuelve null ante una respuesta no reconocida', () => {
      expect(parseYesNo('quizás')).toBeNull();
      expect(parseYesNo('')).toBeNull();
    });
  });

  describe('parseSmoking', () => {
    it('mapea las opciones cerradas', () => {
      expect(parseSmoking('nunca')).toBe('never');
      expect(parseSmoking('no')).toBe('never');
      expect(parseSmoking('jamás')).toBe('never');
      expect(parseSmoking('antes')).toBe('former');
      expect(parseSmoking('exfumador')).toBe('former');
      expect(parseSmoking('antes fumaba')).toBe('former');
      expect(parseSmoking('dejé')).toBe('former');
      expect(parseSmoking('sí')).toBe('current');
      expect(parseSmoking('actualmente')).toBe('current');
      expect(parseSmoking('actualmente fumo')).toBe('current');
      expect(parseSmoking('fumo')).toBe('current');
    });

    it('devuelve null ante una respuesta no reconocida', () => {
      expect(parseSmoking('a veces')).toBeNull();
    });
  });

  describe('parseAlcohol', () => {
    it('mapea las opciones cerradas', () => {
      expect(parseAlcohol('nunca')).toBe('never');
      expect(parseAlcohol('no')).toBe('never');
      expect(parseAlcohol('ocasional')).toBe('occasional');
      expect(parseAlcohol('ocasionalmente')).toBe('occasional');
      expect(parseAlcohol('a veces')).toBe('occasional');
      expect(parseAlcohol('socialmente')).toBe('occasional');
      expect(parseAlcohol('frecuente')).toBe('frequent');
      expect(parseAlcohol('frecuentemente')).toBe('frequent');
      expect(parseAlcohol('seguido')).toBe('frequent');
      expect(parseAlcohol('mucho')).toBe('frequent');
    });

    it('devuelve null ante una respuesta no reconocida', () => {
      expect(parseAlcohol('de vez en cuando')).toBeNull();
    });
  });

  describe('evaluateOnboardingStep — alergias', () => {
    it('ramifica "sí" hacia el detalle sin guardar todavía', () => {
      const result = evaluateOnboardingStep({
        step: 'ask_allergies',
        rawAnswer: 'sí',
        draft: makeDraft(),
      });
      expect(result.transition).toBe('yes');
      expect(result.draft.allergies).toBeNull();
    });

    it('ramifica "no" guardando lista vacía y omitiendo el detalle', () => {
      const result = evaluateOnboardingStep({
        step: 'ask_allergies',
        rawAnswer: 'no',
        draft: makeDraft(),
      });
      expect(result.transition).toBe('no');
      expect(result.draft.allergies).toEqual([]);
    });

    it('guarda el detalle literal sin normalización clínica', () => {
      const result = evaluateOnboardingStep({
        step: 'ask_allergies_detail',
        rawAnswer: 'Penicilina   y látex',
        draft: makeDraft({ allergies: [] }),
      });
      expect(result.transition).toBe('next');
      expect(result.draft.allergies).toEqual(['Penicilina y látex']);
    });

    it('reintenta ante una respuesta no reconocida y limpia la respuesta', () => {
      const result = evaluateOnboardingStep({
        step: 'ask_allergies',
        rawAnswer: 'quizás',
        draft: makeDraft(),
      });
      expect(result.transition).toBe('retry');
      expect(result.clearAnswer).toBe(true);
    });
  });

  describe('evaluateOnboardingStep — medicamentos y condiciones', () => {
    it('ramifica medicamentos sí/no', () => {
      const yes = evaluateOnboardingStep({
        step: 'ask_medications',
        rawAnswer: 'sí',
        draft: makeDraft({ allergies: [] }),
      });
      expect(yes.transition).toBe('yes');

      const no = evaluateOnboardingStep({
        step: 'ask_medications',
        rawAnswer: 'ninguno',
        draft: makeDraft({ allergies: [] }),
      });
      expect(no.transition).toBe('no');
      expect(no.draft.medications).toEqual([]);
    });

    it('guarda el detalle literal de medicamentos', () => {
      const result = evaluateOnboardingStep({
        step: 'ask_medications_detail',
        rawAnswer: 'Losartán 50 mg',
        draft: makeDraft({ medications: [] }),
      });
      expect(result.transition).toBe('next');
      expect(result.draft.medications).toEqual(['Losartán 50 mg']);
    });

    it('ramifica condiciones sí/no', () => {
      const yes = evaluateOnboardingStep({
        step: 'ask_conditions',
        rawAnswer: 'si',
        draft: makeDraft(),
      });
      expect(yes.transition).toBe('yes');

      const no = evaluateOnboardingStep({
        step: 'ask_conditions',
        rawAnswer: 'no',
        draft: makeDraft(),
      });
      expect(no.transition).toBe('no');
      expect(no.draft.conditions).toEqual([]);
    });
  });

  describe('evaluateOnboardingStep — gating de embarazo', () => {
    it('avanza a la pregunta de embarazo cuando el sexo es female', () => {
      const result = evaluateOnboardingStep({
        step: 'ask_conditions_detail',
        rawAnswer: 'Hipertensión',
        draft: makeDraft({ context: { ...makeDraft().context, sex: 'female' } }),
      });
      expect(result.transition).toBe('next_pregnancy');
      expect(result.draft.conditions).toEqual(['Hipertensión']);
      expect(result.draft.pregnancyStatus).toBeNull();
    });

    it('omite embarazo y marca no aplicable cuando el sexo no es female', () => {
      for (const draft of [
        makeDraft({ context: { ...makeDraft().context, sex: 'male' } }),
        makeDraft({ context: { ...makeDraft().context, sex: 'other' } }),
        makeDraft({ context: { ...makeDraft().context, sex: null } }),
      ]) {
        const result = evaluateOnboardingStep({
          step: 'ask_conditions_detail',
          rawAnswer: 'Ninguna',
          draft,
        });
        expect(result.transition).toBe('next_no_pregnancy');
        expect(result.draft.pregnancyStatus).toBe('not_applicable');
      }
    });
  });

  describe('evaluateOnboardingStep — hábitos', () => {
    it('guarda embarazo sí/no y avanza', () => {
      const yes = evaluateOnboardingStep({
        step: 'ask_pregnancy',
        rawAnswer: 'sí',
        draft: makeDraft(),
      });
      expect(yes.transition).toBe('next');
      expect(yes.draft.pregnancyStatus).toBe('yes');

      const no = evaluateOnboardingStep({
        step: 'ask_pregnancy',
        rawAnswer: 'no',
        draft: makeDraft(),
      });
      expect(no.transition).toBe('next');
      expect(no.draft.pregnancyStatus).toBe('no');
    });

    it('reintenta embarazo ante respuesta no reconocida', () => {
      const result = evaluateOnboardingStep({
        step: 'ask_pregnancy',
        rawAnswer: 'tal vez',
        draft: makeDraft(),
      });
      expect(result.transition).toBe('retry');
      expect(result.clearAnswer).toBe(true);
    });

    it('guarda tabaquismo y alcohol', () => {
      const smoking = evaluateOnboardingStep({
        step: 'ask_smoking',
        rawAnswer: 'antes fumaba',
        draft: makeDraft(),
      });
      expect(smoking.transition).toBe('next');
      expect(smoking.draft.smoking).toBe('former');

      const alcohol = evaluateOnboardingStep({
        step: 'ask_alcohol',
        rawAnswer: 'ocasionalmente',
        draft: makeDraft(),
      });
      expect(alcohol.transition).toBe('next');
      expect(alcohol.draft.alcohol).toBe('occasional');
    });

    it('reintenta hábitos ante respuesta no reconocida', () => {
      expect(
        evaluateOnboardingStep({ step: 'ask_smoking', rawAnswer: 'a veces', draft: makeDraft() }).transition
      ).toBe('retry');
      expect(
        evaluateOnboardingStep({ step: 'ask_alcohol', rawAnswer: 'muchísimo', draft: makeDraft() }).transition
      ).toBe('retry');
    });
  });

  describe('evaluateOnboardingStep — resumen y reinicio', () => {
    it('confirma el resumen', () => {
      const result = evaluateOnboardingStep({
        step: 'show_summary',
        rawAnswer: 'sí',
        draft: makeDraft({ allergies: ['Penicilina'] }),
      });
      expect(result.transition).toBe('confirm');
    });

    it('reinicia el borrador ante "no"', () => {
      const result = evaluateOnboardingStep({
        step: 'show_summary',
        rawAnswer: 'no',
        draft: makeDraft({
          allergies: ['Penicilina'],
          medications: ['Losartán'],
          conditions: ['Hipertensión'],
          smoking: 'never',
          alcohol: 'occasional',
          pregnancyStatus: 'no',
        }),
      });
      expect(result.transition).toBe('restart');
      expect(result.draft.allergies).toBeNull();
      expect(result.draft.medications).toBeNull();
      expect(result.draft.conditions).toBeNull();
      expect(result.draft.smoking).toBeNull();
      expect(result.draft.alcohol).toBeNull();
      expect(result.draft.pregnancyStatus).toBeNull();
      expect(result.draft.context.patientId).toBe('patient-1');
    });

    it('reinicia ante una frase no reconocida', () => {
      const result = evaluateOnboardingStep({
        step: 'show_summary',
        rawAnswer: 'creo que falta algo',
        draft: makeDraft({ allergies: ['Penicilina'] }),
      });
      expect(result.transition).toBe('restart');
      expect(result.draft.allergies).toBeNull();
    });
  });

  describe('buildOnboardingSummary', () => {
    it('produce una línea por dato fiel a lo capturado', () => {
      const summary = buildOnboardingSummary(
        makeDraft({
          allergies: ['Penicilina'],
          medications: [],
          conditions: ['Hipertensión'],
          pregnancyStatus: 'not_applicable',
          smoking: 'former',
          alcohol: 'frequent',
        })
      );
      expect(summary).toContain('Alergias: Penicilina');
      expect(summary).toContain('Medicamentos: Ninguno');
      expect(summary).toContain('Condiciones médicas: Hipertensión');
      expect(summary).toContain('Embarazo: No aplica');
      expect(summary).toContain('Tabaquismo: Antes fumaba');
      expect(summary).toContain('Alcohol: Frecuentemente');
    });

    it('refleja listas vacías y datos sin responder', () => {
      const summary = buildOnboardingSummary(
        makeDraft({
          allergies: [],
          medications: [],
          conditions: [],
        })
      );
      expect(summary).toContain('Alergias: Ninguna');
      expect(summary).toContain('Medicamentos: Ninguno');
      expect(summary).toContain('Condiciones médicas: Ninguna');
      expect(summary).toContain('Embarazo: Sin dato');
      expect(summary).toContain('Tabaquismo: Sin dato');
      expect(summary).toContain('Alcohol: Sin dato');
    });
  });
});
