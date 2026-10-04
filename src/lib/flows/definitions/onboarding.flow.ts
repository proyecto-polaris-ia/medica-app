/**
 * Flow Definition: Onboarding pre-cita
 *
 * Flujo determinístico de historia clínica básica por WhatsApp (design.md D2).
 * Orden fijo: alergias → medicamentos → condiciones → embarazo (gating) →
 * hábitos → resumen → escritura única.
 *
 * La Fase 2 agrega `ask_email`/`show_contact_summary`/`save_contact` con la
 * acción `saveOnboardingContact` (solo `patients`, nunca la historia clínica).
 */

import type { FlowDefinition } from '../types';

export const onboardingFlow: FlowDefinition = {
  name: 'onboarding',
  initialState: 'ask_allergies',
  states: {
    ask_allergies: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt:
        'Hola {patientFirstName}, soy Eva. Antes de tu cita quiero dejar listos tus datos médicos. Si algo no aplica, responde "no". ¿Tienes alguna alergia?',
      transitions: {
        yes: 'ask_allergies_detail',
        no: 'ask_medications',
        retry: 'ask_allergies',
      },
    },

    ask_allergies_detail: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt: '¿Cuáles alergias tienes? Escríbelas tal como las conoces.',
      transitions: {
        next: 'ask_medications',
      },
    },

    ask_medications: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt: '¿Tomas algún medicamento actualmente?',
      transitions: {
        yes: 'ask_medications_detail',
        no: 'ask_conditions',
        retry: 'ask_medications',
      },
    },

    ask_medications_detail: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt: '¿Cuáles medicamentos tomas?',
      transitions: {
        next: 'ask_conditions',
      },
    },

    ask_conditions: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt:
        '¿Tienes alguna condición médica relevante (por ejemplo, diabetes, hipertensión o del corazón)?',
      transitions: {
        yes: 'ask_conditions_detail',
        no: 'ask_pregnancy',
        retry: 'ask_conditions',
      },
    },

    ask_conditions_detail: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt: '¿Cuál o cuáles?',
      transitions: {
        next_pregnancy: 'ask_pregnancy',
        next_no_pregnancy: 'ask_smoking',
      },
    },

    ask_pregnancy: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt: '¿Estás embarazada actualmente?',
      transitions: {
        next: 'ask_smoking',
        retry: 'ask_pregnancy',
      },
    },

    ask_smoking: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt: '¿Fumas? Responde: *nunca*, *antes fumaba* o *actualmente fumo*.',
      transitions: {
        next: 'ask_alcohol',
        retry: 'ask_smoking',
      },
    },

    ask_alcohol: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt:
        '¿Consumes alcohol? Responde: *nunca*, *ocasionalmente* o *frecuentemente*.',
      transitions: {
        next: 'show_summary',
        retry: 'ask_alcohol',
      },
    },

    show_summary: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt:
        'Este es tu resumen:\n{onboardingSummary}\n\n¿Está correcto? Responde "sí" para guardarlo o "no" para corregirlo.',
      transitions: {
        confirm: 'save_history',
        restart: 'ask_allergies',
      },
    },

    save_history: {
      action: 'saveOnboardingHistory',
      prompt: 'Guardando tus datos…',
      transitions: {
        complete: 'complete',
        needs_contact: 'ask_email',
      },
    },

    ask_email: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt: 'Para enviarte la confirmación, ¿me compartes tu correo electrónico?',
      transitions: {
        next: 'show_contact_summary',
        retry: 'ask_email',
      },
    },

    show_contact_summary: {
      required: ['onboardingAnswer'],
      action: 'evaluateOnboardingAnswer',
      prompt: 'Tu correo es {onboardingContactSummary}. ¿Lo guardo?',
      transitions: {
        confirm: 'save_contact',
        restart: 'ask_email',
      },
    },

    save_contact: {
      action: 'saveOnboardingContact',
      prompt: 'Listo.',
      transitions: {
        complete: 'complete',
      },
    },

    complete: {
      terminal: true,
      prompt:
        '¡Listo! Ya dejé tus datos preparados para el doctor. Te esperamos en tu cita.',
    },
  },
};
