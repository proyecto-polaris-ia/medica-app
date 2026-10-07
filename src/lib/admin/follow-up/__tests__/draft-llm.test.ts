import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FOLLOW_UP_TEMPLATE_NAME,
  buildFollowUpDraft,
  validateFollowUpDraftText,
} from '../draft';
import {
  DRAFT_LLM_MAX_OUTPUT_TOKENS,
  DRAFT_LLM_TIMEOUT_MS,
  buildFollowUpDraftPrompt,
  createDraftProviderFromEnv,
  generateFollowUpDraftText,
  type FollowUpDraftProvider,
} from '../draft-llm';
import type { FollowUpReason } from '../rules';
import type { FollowUpCase } from '../types';

/**
 * Slice 1.3 — Prompt puro del caso (design.md decisión 5).
 *
 * El prompt es la única superficie donde los datos del caso se acercan al
 * proveedor del LLM, así que estos casos verifican sobre todo **qué no viaja**:
 * identificadores, teléfono, fechas del caso y categorías comerciales o
 * clínicas.
 */

const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
const APPOINTMENT_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const PATIENT_PHONE = '+525512345678';
const LLM_API_KEY_ENV = 'WHATSAPP_AGENT_LLM_API_KEY';
const LLM_BASE_URL_ENV = 'WHATSAPP_AGENT_LLM_BASE_URL';
const REASON_DATE = '2025-03-12T15:30:00.000Z';
const ROUND_DATE = '2025-01-06';

/** Palabras que solo pueden aparecer si el caso filtra datos del negocio. */
const FORBIDDEN_CASE_TERMS = [
  'precio',
  'costo',
  'descuento',
  'disponibilidad',
  'horario',
  'diagnóstico',
  'medicamento',
  'receta',
  'antibiótico',
  'analgésico',
  'infección',
];

/** Plantilla determinista esperada para el caso base del archivo. */
function templateFor(caso: FollowUpCase) {
  return buildFollowUpDraft({
    patientName: caso.patientName,
    reason: caso.reason,
  });
}

function makeCase(overrides: Partial<FollowUpCase> = {}): FollowUpCase {
  return {
    patientId: PATIENT_ID,
    patientName: 'María López',
    patientPhoneE164: PATIENT_PHONE,
    reason: 'no_show',
    reasonLabel: 'Cita no atendida',
    reasonDate: REASON_DATE,
    roundDate: ROUND_DATE,
    sourceAppointmentId: APPOINTMENT_ID,
    sourcePlanId: PLAN_ID,
    ...overrides,
  };
}

describe('buildFollowUpDraftPrompt', () => {
  it('saluda con el primer nombre y usa la etiqueta del motivo', () => {
    const { prompt } = buildFollowUpDraftPrompt(makeCase());
    expect(prompt).toContain('María');
    expect(prompt).not.toContain('López');
    expect(prompt).toContain('Cita no atendida');
  });

  it('no envía teléfono, identificadores ni fechas del caso', () => {
    // El bloque `system` es instrucción fija; solo el bloque `prompt` lleva
    // datos del caso y es el que no debe filtrar nada.
    const { prompt } = buildFollowUpDraftPrompt(makeCase());
    expect(prompt).not.toContain(PATIENT_PHONE);
    expect(prompt).not.toContain(PATIENT_ID);
    expect(prompt).not.toContain(APPOINTMENT_ID);
    expect(prompt).not.toContain(PLAN_ID);
    expect(prompt).not.toContain(ROUND_DATE);
    expect(prompt).not.toContain(REASON_DATE);
  });

  it('no envía datos comerciales ni clínicos del caso', () => {
    const { prompt } = buildFollowUpDraftPrompt(makeCase());
    expect(prompt).not.toMatch(/\$\s?\d/);
    for (const term of FORBIDDEN_CASE_TERMS) {
      expect(prompt.toLowerCase()).not.toContain(term);
    }
  });

  it('es invariante en el bloque system y limita la longitud a 600', () => {
    const noShow = buildFollowUpDraftPrompt(makeCase());
    const inactive = buildFollowUpDraftPrompt(
      makeCase({ reason: 'inactive', reasonLabel: 'Paciente inactivo' })
    );
    expect(noShow.system).toBe(inactive.system);
    expect(noShow.system).toContain('600');
  });

  it('da una instrucción distinta por cada uno de los 4 motivos', () => {
    const instructions: Record<FollowUpReason, RegExp> = {
      no_show: /reclamo/i,
      treatment_in_progress: /siguiente visita/i,
      quote_no_response: /valoración/i,
      inactive: /revisión/i,
    };

    const prompts = (
      Object.keys(instructions) as FollowUpReason[]
    ).map((reason) =>
      buildFollowUpDraftPrompt(
        makeCase({ reason, reasonLabel: `Motivo ${reason}` })
      ).prompt
    );

    expect(new Set(prompts).size).toBe(prompts.length);

    for (const reason of Object.keys(instructions) as FollowUpReason[]) {
      const { prompt } = buildFollowUpDraftPrompt(
        makeCase({ reason, reasonLabel: `Motivo ${reason}` })
      );
      expect(prompt).toMatch(instructions[reason]);
    }
  });
});

/**
 * Slice 1.4 — Capacidad y degradación (design.md decisión 3 y 4, spec
 * `clara-drafting` → "Fallback determinista garantizado").
 *
 * Todos los casos inyectan el provider o el flag: ningún test toca la red.
 */
describe('generateFollowUpDraftText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('con el kill switch apagado no llama al provider y usa la plantilla', async () => {
    const caso = makeCase();
    const provider = vi.fn<FollowUpDraftProvider>(async () => 'texto del LLM');

    const result = await generateFollowUpDraftText(caso, {
      isEnabled: () => false,
      provider,
    });

    expect(provider).not.toHaveBeenCalled();
    expect(result.source).toBe('template');
    expect(result.body).toBe(templateFor(caso).body);
    expect(result.templateName).toBe(FOLLOW_UP_TEMPLATE_NAME);
  });

  it('sin llaves del LLM no hay ninguna llamada de red', async () => {
    vi.stubEnv(LLM_API_KEY_ENV, '');
    vi.stubEnv(LLM_BASE_URL_ENV, '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const caso = makeCase();

    const result = await generateFollowUpDraftText(caso, {
      isEnabled: () => true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.source).toBe('template');
    expect(result.body).toBe(templateFor(caso).body);
  });

  it('cae a plantilla cuando el provider lanza y registra el fallback una sola vez', async () => {
    const caso = makeCase();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const partialText = 'texto a medio escribir';
    const provider = vi.fn<FollowUpDraftProvider>(async () => {
      void partialText;
      throw new Error('provider unavailable');
    });

    const result = await generateFollowUpDraftText(caso, {
      isEnabled: () => true,
      provider,
    });

    expect(result.source).toBe('template');
    expect(result.body).toBe(templateFor(caso).body);
    expect(warn).toHaveBeenCalledTimes(1);

    const [message, context] = warn.mock.calls[0] as [string, unknown];
    expect(message).toBe('[clara-drafting] llm fallback');
    const serialized = JSON.stringify(context);
    expect(serialized).toContain(caso.patientId);
    expect(serialized).toContain(caso.reason);
    expect(serialized).not.toContain(partialText);
    expect(serialized).not.toContain(PATIENT_PHONE);
  });

  it('acota el provider con el timeout y los tokens de salida del diseño', async () => {
    const provider = vi.fn<FollowUpDraftProvider>(async () => 'texto válido');

    await generateFollowUpDraftText(makeCase(), {
      isEnabled: () => true,
      provider,
    });

    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0]?.[0]).toMatchObject({
      timeoutMs: DRAFT_LLM_TIMEOUT_MS,
      maxOutputTokens: DRAFT_LLM_MAX_OUTPUT_TOKENS,
    });
  });

  it('un timeout del provider cae a plantilla sin lanzar', async () => {
    const caso = makeCase();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = vi.fn<FollowUpDraftProvider>(async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    });

    const result = await generateFollowUpDraftText(caso, {
      isEnabled: () => true,
      provider,
    });

    expect(result.source).toBe('template');
    expect(result.body).toBe(templateFor(caso).body);
  });

  it('descarta salidas inválidas y usa la plantilla (el texto inválido nunca sale)', async () => {
    const caso = makeCase();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const invalidOutputs = [
      '',
      'a'.repeat(601),
      'Hola María, el precio es $100',
      'Hola María, tu diagnóstico sigue igual',
      'Hola María, hay una promoción especial',
    ];

    for (const invalidOutput of invalidOutputs) {
      // El insumo del test es realmente inválido para los guardrails.
      expect(() => validateFollowUpDraftText(invalidOutput)).toThrow();

      const provider = vi.fn<FollowUpDraftProvider>(async () => invalidOutput);

      const result = await generateFollowUpDraftText(caso, {
        isEnabled: () => true,
        provider,
      });

      expect(result.source).toBe('template');
      expect(result.body).toBe(templateFor(caso).body);
      expect(result.templateName).toBe(FOLLOW_UP_TEMPLATE_NAME);
      if (invalidOutput.length > 0) {
        expect(result.body).not.toContain(invalidOutput.slice(0, 20));
      }
    }
  });

  it('usa el texto del LLM cuando pasa los guardrails, ya normalizado', async () => {
    const provider = vi.fn<FollowUpDraftProvider>(
      async () => '  Hola   María,\n\n  ¿Te gustaría agendar tu siguiente visita?  '
    );

    const result = await generateFollowUpDraftText(makeCase(), {
      isEnabled: () => true,
      provider,
    });

    expect(result.source).toBe('llm');
    expect(result.body).toBe('Hola María, ¿Te gustaría agendar tu siguiente visita?');
    expect(result.templateName).toBe(FOLLOW_UP_TEMPLATE_NAME);
  });

  it('envía al provider el system y el prompt del caso', async () => {
    const provider = vi.fn<FollowUpDraftProvider>(async () => 'texto válido');

    await generateFollowUpDraftText(makeCase(), {
      isEnabled: () => true,
      provider,
    });

    const input = provider.mock.calls[0]?.[0];
    expect(input?.system).toContain('600');
    expect(input?.prompt).toContain('María');
  });

  it('no registra el texto inválido del LLM al descartarlo', async () => {
    const invalidText = 'Hola María, tu diagnóstico sigue igual';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = vi.fn<FollowUpDraftProvider>(async () => invalidText);

    const result = await generateFollowUpDraftText(makeCase(), {
      isEnabled: () => true,
      provider,
    });

    expect(result.source).toBe('template');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain(invalidText);
  });

  it('no registra ningún fallback cuando el texto del LLM es válido', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = vi.fn<FollowUpDraftProvider>(
      async () => 'Hola María, ¿te gustaría agendar una revisión?'
    );

    const result = await generateFollowUpDraftText(makeCase(), {
      isEnabled: () => true,
      provider,
    });

    expect(result.source).toBe('llm');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('createDraftProviderFromEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('devuelve null cuando faltan llaves (degradación silenciosa)', () => {
    vi.stubEnv(LLM_API_KEY_ENV, '');
    vi.stubEnv(LLM_BASE_URL_ENV, '');
    expect(createDraftProviderFromEnv()).toBeNull();
  });

  it('lee las variables de entorno de forma lazy, no al importar el módulo', () => {
    vi.stubEnv(LLM_API_KEY_ENV, '');
    vi.stubEnv(LLM_BASE_URL_ENV, '');
    expect(createDraftProviderFromEnv()).toBeNull();

    vi.stubEnv(LLM_API_KEY_ENV, 'test-key');
    vi.stubEnv(LLM_BASE_URL_ENV, 'https://llm.example.test/v1');
    expect(typeof createDraftProviderFromEnv()).toBe('function');
  });
});
