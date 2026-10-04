import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowState } from '@/lib/flows/types';
import type { OnboardingStartContext } from '../onboarding-context';
import type { OrchestratorContext } from '../orchestrator';

vi.mock('@/lib/whatsapp/onboarding-flag', () => ({
  isOnboardingEnabled: vi.fn(),
  isOnboardingNudgeEnabled: vi.fn(),
}));
vi.mock('@/lib/whatsapp/onboarding-context', () => ({
  loadOnboardingStartContext: vi.fn(),
  hasFutureScheduledAppointment: vi.fn(),
}));
vi.mock('@/lib/admin/medical-history', () => ({
  upsertMedicalHistory: vi.fn(),
  getMedicalHistory: vi.fn(),
}));
vi.mock('@/lib/admin/patients', () => ({
  updatePatientEmail: vi.fn(),
}));
vi.mock('@/lib/observability/whatsapp-ai', () => ({
  recordWhatsAppAiEvent: vi.fn(),
}));
vi.mock('@/lib/booking/catalog', () => ({
  listServices: vi.fn().mockResolvedValue([]),
  listProviders: vi.fn().mockResolvedValue([]),
  resolveProviderByName: vi.fn(),
  resolveServiceByName: vi.fn(),
}));
vi.mock('@/lib/booking/availability', () => ({ getFreeSlots: vi.fn() }));
vi.mock('@/lib/booking/booking', () => ({ bookAppointment: vi.fn() }));
vi.mock('@/lib/booking/patient-resolution', () => ({ resolvePatient: vi.fn() }));

import { upsertMedicalHistory } from '@/lib/admin/medical-history';
import { updatePatientEmail } from '@/lib/admin/patients';
import { loadOnboardingStartContext } from '../onboarding-context';
import { isOnboardingEnabled } from '../onboarding-flag';
import { orchestrate } from '../orchestrator';

const PHONE = '+5215512345678';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';

const ELIGIBLE_CONTEXT: OnboardingStartContext = {
  patientId: PATIENT_ID,
  patientName: 'Ana López',
  phone: PHONE,
  sex: 'female',
  historyExists: false,
  source: null,
  email: null,
  missingEmail: true,
  hasFutureScheduledAppointment: true,
};

type DraftOverrides = Partial<{
  allergies: string[] | null;
  medications: string[] | null;
  conditions: string[] | null;
  pregnancyStatus: 'yes' | 'no' | 'not_applicable' | null;
  smoking: 'never' | 'former' | 'current' | null;
  alcohol: 'never' | 'occasional' | 'frequent' | null;
  email: string | null;
  phone: string;
  missingEmail: boolean;
}>;

function makeDraft(overrides: DraftOverrides = {}) {
  return {
    context: {
      patientId: PATIENT_ID,
      phone: overrides.phone ?? PHONE,
      patientName: 'Ana López',
      sex: 'female' as const,
      missingEmail: overrides.missingEmail ?? false,
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

function onboardingState(name: string, draftOverrides: DraftOverrides = {}): FlowState {
  return {
    name,
    entities: {},
    flowName: 'onboarding',
    lastActivity: new Date().toISOString(),
    metadata: { onboarding: makeDraft(draftOverrides) },
  };
}

function makeContext(input: { body: string; flowState?: FlowState | null }): OrchestratorContext {
  return {
    store: {} as unknown as OrchestratorContext['store'],
    persisted: {
      inserted: true,
      contactId: 'contact-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
    },
    event: {
      providerMessageId: 'wamid-1',
      fromPhone: PHONE,
      profileName: 'Ana López',
      messageType: 'text',
      body: input.body,
      occurredAt: '2026-10-05T13:00:00.000Z',
      rawMessage: {},
      rawValue: {},
    },
    conversation: { id: 'conversation-1', flowState: input.flowState ?? undefined },
    knowledgeEntries: [],
  };
}

function draftOf(result: { flowState?: FlowState }) {
  return result.flowState?.metadata?.onboarding as
    | (ReturnType<typeof makeDraft> & { confirmed?: boolean })
    | undefined;
}

describe('orchestrate — arranque del onboarding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('con el flag apagado no evalúa el onboarding y conserva el routing', async () => {
    vi.mocked(isOnboardingEnabled).mockReturnValue(false);
    vi.mocked(loadOnboardingStartContext).mockResolvedValue(ELIGIBLE_CONTEXT);

    const result = await orchestrate(makeContext({ body: 'hola' }));

    expect(loadOnboardingStartContext).not.toHaveBeenCalled();
    expect(result.flowState).toBeUndefined();
  });

  it('con flag encendido y paciente elegible arranca y envía el primer prompt', async () => {
    vi.mocked(isOnboardingEnabled).mockReturnValue(true);
    vi.mocked(loadOnboardingStartContext).mockResolvedValue(ELIGIBLE_CONTEXT);

    const result = await orchestrate(makeContext({ body: 'hola' }));

    expect(loadOnboardingStartContext).toHaveBeenCalledWith({ phone: PHONE });
    expect(result.flowState?.name).toBe('ask_allergies');
    expect(result.flowState?.flowName).toBe('onboarding');
    expect(draftOf(result)?.context.patientName).toBe('Ana López');
    expect(result.responseText).toContain('Hola Ana');
    expect(result.responseText).toContain('¿Tienes alguna alergia?');
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });

  it('no arranca cuando el paciente no existe (contexto null) y sigue el routing', async () => {
    vi.mocked(isOnboardingEnabled).mockReturnValue(true);
    vi.mocked(loadOnboardingStartContext).mockResolvedValue(null);

    const result = await orchestrate(makeContext({ body: 'hola' }));

    expect(result.flowState).toBeUndefined();
  });

  it('no arranca con intent book_appointment', async () => {
    vi.mocked(isOnboardingEnabled).mockReturnValue(true);
    vi.mocked(loadOnboardingStartContext).mockResolvedValue(ELIGIBLE_CONTEXT);

    const result = await orchestrate(makeContext({ body: 'quiero agendar una cita' }));

    expect(loadOnboardingStartContext).not.toHaveBeenCalled();
    expect(result.flowState?.flowName).toBe('book_appointment');
  });

  it('no arranca con intent support', async () => {
    vi.mocked(isOnboardingEnabled).mockReturnValue(true);
    vi.mocked(loadOnboardingStartContext).mockResolvedValue(ELIGIBLE_CONTEXT);

    const result = await orchestrate(makeContext({ body: 'tengo dolor fuerte' }));

    expect(loadOnboardingStartContext).not.toHaveBeenCalled();
    expect(result.needsHuman).toBe(true);
  });

  it('con historia y sin email arranca en ask_email y nunca ejecuta saveOnboardingHistory', async () => {
    vi.mocked(isOnboardingEnabled).mockReturnValue(true);
    vi.mocked(loadOnboardingStartContext).mockResolvedValue({
      ...ELIGIBLE_CONTEXT,
      historyExists: true,
      source: 'patient_autoreport',
      email: null,
      missingEmail: true,
    });

    const result = await orchestrate(makeContext({ body: 'hola' }));

    expect(result.flowState?.name).toBe('ask_email');
    expect(result.flowState?.flowName).toBe('onboarding');
    expect(draftOf(result)?.context.missingEmail).toBe(true);
    expect(result.responseText).toContain('correo electrónico');
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
    expect(updatePatientEmail).not.toHaveBeenCalled();
  });
});

describe('orchestrate — continuación del onboarding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isOnboardingEnabled).mockReturnValue(true);
  });

  it('ramifica "sí" hacia el detalle de alergias sin escribir', async () => {
    const result = await orchestrate(
      makeContext({ body: 'sí', flowState: onboardingState('ask_allergies') })
    );

    expect(result.flowState?.name).toBe('ask_allergies_detail');
    expect(draftOf(result)?.allergies).toBeNull();
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });

  it('ramifica "no" y omite el detalle de alergias', async () => {
    const result = await orchestrate(
      makeContext({ body: 'no', flowState: onboardingState('ask_allergies') })
    );

    expect(result.flowState?.name).toBe('ask_medications');
    expect(draftOf(result)?.allergies).toEqual([]);
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });

  it('re-pregunta el mismo paso ante una respuesta no reconocida (retry)', async () => {
    const result = await orchestrate(
      makeContext({ body: 'quizá', flowState: onboardingState('ask_allergies') })
    );

    expect(result.flowState?.name).toBe('ask_allergies');
    expect(result.responseText).toContain('¿Tienes alguna alergia?');
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });

  it('reinicia el borrador y vuelve a ask_allergies en el resumen (restart)', async () => {
    const state = onboardingState('show_summary', {
      allergies: ['penicilina'],
      medications: [],
      conditions: [],
    });

    const result = await orchestrate(makeContext({ body: 'no', flowState: state }));

    expect(result.flowState?.name).toBe('ask_allergies');
    expect(draftOf(result)?.allergies).toBeNull();
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });

  it('aplica el gating de embarazo según el sexo femenino', async () => {
    const state = onboardingState('ask_conditions_detail');
    (state.metadata!.onboarding as { context: { sex: string } }).context.sex = 'female';

    const result = await orchestrate(
      makeContext({ body: 'hipertensión', flowState: state })
    );

    expect(result.flowState?.name).toBe('ask_pregnancy');
    expect(result.responseText).toContain('embarazada');
  });

  it('omite el embarazo y marca not_applicable cuando el sexo no es femenino', async () => {
    const state = onboardingState('ask_conditions_detail');
    (state.metadata!.onboarding as { context: { sex: string | null } }).context.sex = 'male';

    const result = await orchestrate(
      makeContext({ body: 'diabetes', flowState: state })
    );

    expect(result.flowState?.name).toBe('ask_smoking');
    expect(draftOf(result)?.pregnancyStatus).toBe('not_applicable');
  });

  it('renderiza {onboardingSummary} al llegar al resumen', async () => {
    const state = onboardingState('ask_alcohol', {
      allergies: ['penicilina'],
      medications: ['metformina'],
      conditions: ['hipertensión'],
      pregnancyStatus: 'no',
      smoking: 'never',
    });

    const result = await orchestrate(makeContext({ body: 'ocasionalmente', flowState: state }));

    expect(result.flowState?.name).toBe('show_summary');
    expect(result.responseText).toContain('Alergias: penicilina');
    expect(result.responseText).toContain('Tabaquismo: Nunca');
    expect(result.responseText).toContain('Alcohol: Ocasionalmente');
  });

  it('una sesión expirada limpia el estado y no escribe', async () => {
    vi.mocked(isOnboardingEnabled).mockReturnValue(false);
    const expired: FlowState = {
      ...onboardingState('show_summary', { allergies: ['penicilina'] }),
      lastActivity: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    };

    const result = await orchestrate(makeContext({ body: 'sí', flowState: expired }));

    expect(upsertMedicalHistory).not.toHaveBeenCalled();
    expect(result.flowState ?? null).toBeNull();
  });
});

describe('orchestrate — escritura de la historia', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isOnboardingEnabled).mockReturnValue(true);
  });

  it('escribe una sola vez con provenance patient_autoreport al confirmar el resumen', async () => {
    vi.mocked(upsertMedicalHistory).mockResolvedValue({} as never);
    const state = onboardingState('show_summary', {
      allergies: ['penicilina'],
      medications: [],
      conditions: ['hipertensión'],
      pregnancyStatus: 'no',
      smoking: 'never',
      alcohol: 'occasional',
    });

    const result = await orchestrate(makeContext({ body: 'sí', flowState: state }));

    expect(upsertMedicalHistory).toHaveBeenCalledTimes(1);
    expect(upsertMedicalHistory).toHaveBeenCalledWith(
      PATIENT_ID,
      expect.objectContaining({
        allergies: ['penicilina'],
        medications: [],
        systemicConditions: ['hipertensión'],
        pregnancyStatus: 'no',
        smoking: 'never',
        alcohol: 'occasional',
        source: 'patient_autoreport',
      })
    );
    expect(result.flowState?.name).toBe('complete');
    expect(draftOf(result)?.confirmed).toBe(true);
  });

  it('no escribe antes de la confirmación', async () => {
    await orchestrate(
      makeContext({
        body: 'sí',
        flowState: onboardingState('ask_conditions', { allergies: ['penicilina'] }),
      })
    );

    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });

  it('si la escritura falla escala sin reintentar ni re-preguntar', async () => {
    vi.mocked(upsertMedicalHistory).mockRejectedValue(new Error('db down'));
    const state = onboardingState('show_summary', {
      allergies: ['penicilina'],
      medications: [],
      conditions: [],
      pregnancyStatus: 'no',
      smoking: 'never',
      alcohol: 'occasional',
    });

    const result = await orchestrate(makeContext({ body: 'sí', flowState: state }));

    expect(upsertMedicalHistory).toHaveBeenCalledTimes(1);
    expect(result.needsHuman).toBe(true);
    expect(result.clearFlowState).toBe(true);
    expect(result.flowState).toBeUndefined();
  });

  it('nunca escribe si el teléfono del contexto difiere del canal y escala', async () => {
    const state = onboardingState('show_summary', {
      allergies: ['penicilina'],
      medications: [],
      conditions: [],
      pregnancyStatus: 'no',
      smoking: 'never',
      alcohol: 'occasional',
      phone: '+529998887777',
    });

    const result = await orchestrate(makeContext({ body: 'sí', flowState: state }));

    expect(upsertMedicalHistory).not.toHaveBeenCalled();
    expect(result.needsHuman).toBe(true);
    expect(result.clearFlowState).toBe(true);
  });
});

describe('orchestrate — datos generales (Fase 2)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isOnboardingEnabled).mockReturnValue(true);
  });

  it('con missingEmail la escritura de historia transiciona a ask_email', async () => {
    vi.mocked(upsertMedicalHistory).mockResolvedValue({} as never);
    const state = onboardingState('show_summary', {
      allergies: ['penicilina'],
      medications: [],
      conditions: ['hipertensión'],
      pregnancyStatus: 'no',
      smoking: 'never',
      alcohol: 'occasional',
      email: null,
      missingEmail: true,
    });

    const result = await orchestrate(makeContext({ body: 'sí', flowState: state }));

    expect(upsertMedicalHistory).toHaveBeenCalledTimes(1);
    expect(result.flowState?.name).toBe('ask_email');
    expect(result.responseText).toContain('correo electrónico');
    expect(updatePatientEmail).not.toHaveBeenCalled();
  });

  it('guarda el email normalizado y muestra el resumen de contacto', async () => {
    const result = await orchestrate(
      makeContext({
        body: '  ANA@EXAMPLE.COM ',
        flowState: onboardingState('ask_email', { missingEmail: true }),
      })
    );

    expect(result.flowState?.name).toBe('show_contact_summary');
    expect(draftOf(result)?.email).toBe('ana@example.com');
    expect(result.responseText).toContain('ana@example.com');
    expect(updatePatientEmail).not.toHaveBeenCalled();
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });

  it('re-pregunta el email ante un valor inválido sin avanzar', async () => {
    const result = await orchestrate(
      makeContext({
        body: 'no-es-un-correo',
        flowState: onboardingState('ask_email', { missingEmail: true }),
      })
    );

    expect(result.flowState?.name).toBe('ask_email');
    expect(draftOf(result)?.email).toBeNull();
    expect(result.responseText).toContain('correo electrónico');
    expect(updatePatientEmail).not.toHaveBeenCalled();
  });

  it('solo la confirmación explícita del resumen de contacto guarda el email', async () => {
    vi.mocked(updatePatientEmail).mockResolvedValue({} as never);
    const state = onboardingState('show_contact_summary', {
      email: 'ana@example.com',
      missingEmail: true,
    });

    const result = await orchestrate(makeContext({ body: 'sí', flowState: state }));

    expect(updatePatientEmail).toHaveBeenCalledTimes(1);
    expect(updatePatientEmail).toHaveBeenCalledWith(PATIENT_ID, 'ana@example.com');
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
    expect(result.flowState?.name).toBe('complete');
  });

  it('rechazar el resumen de contacto vuelve a ask_email sin escribir', async () => {
    const state = onboardingState('show_contact_summary', {
      email: 'ana@example.com',
      missingEmail: true,
    });

    const result = await orchestrate(makeContext({ body: 'no', flowState: state }));

    expect(updatePatientEmail).not.toHaveBeenCalled();
    expect(result.flowState?.name).toBe('ask_email');
    expect(draftOf(result)?.email).toBeNull();
  });

  it('no escribe el contacto si el teléfono del contexto difiere del canal y escala', async () => {
    const state = onboardingState('show_contact_summary', {
      email: 'ana@example.com',
      missingEmail: true,
      phone: '+529998887777',
    });

    const result = await orchestrate(makeContext({ body: 'sí', flowState: state }));

    expect(updatePatientEmail).not.toHaveBeenCalled();
    expect(result.needsHuman).toBe(true);
    expect(result.clearFlowState).toBe(true);
    expect(result.flowState).toBeUndefined();
  });

  it('si la escritura del contacto falla escala sin reintentar', async () => {
    vi.mocked(updatePatientEmail).mockRejectedValue(new Error('db down'));
    const state = onboardingState('show_contact_summary', {
      email: 'ana@example.com',
      missingEmail: true,
    });

    const result = await orchestrate(makeContext({ body: 'sí', flowState: state }));

    expect(updatePatientEmail).toHaveBeenCalledTimes(1);
    expect(result.needsHuman).toBe(true);
    expect(result.clearFlowState).toBe(true);
  });

  it('el flujo completo escribe la historia una vez y el email una vez', async () => {
    vi.mocked(upsertMedicalHistory).mockResolvedValue({} as never);
    vi.mocked(updatePatientEmail).mockResolvedValue({} as never);

    const summaryState = onboardingState('show_summary', {
      allergies: ['penicilina'],
      medications: [],
      conditions: ['hipertensión'],
      pregnancyStatus: 'no',
      smoking: 'never',
      alcohol: 'occasional',
      email: null,
      missingEmail: true,
    });

    const afterConfirm = await orchestrate(
      makeContext({ body: 'sí', flowState: summaryState })
    );
    expect(afterConfirm.flowState?.name).toBe('ask_email');
    expect(upsertMedicalHistory).toHaveBeenCalledTimes(1);
    expect(updatePatientEmail).not.toHaveBeenCalled();

    const afterEmail = await orchestrate(
      makeContext({ body: 'ANA@Example.com', flowState: afterConfirm.flowState })
    );
    expect(afterEmail.flowState?.name).toBe('show_contact_summary');
    expect(draftOf(afterEmail)?.email).toBe('ana@example.com');

    const afterContactConfirm = await orchestrate(
      makeContext({ body: 'sí', flowState: afterEmail.flowState })
    );
    expect(afterContactConfirm.flowState?.name).toBe('complete');
    expect(updatePatientEmail).toHaveBeenCalledTimes(1);
    expect(updatePatientEmail).toHaveBeenCalledWith(PATIENT_ID, 'ana@example.com');
    expect(upsertMedicalHistory).toHaveBeenCalledTimes(1);
  });

  it('un conflicto de correo (23505) escala sin escribir la historia', async () => {
    const { ConflictError } = await import('@/lib/admin/errors');
    vi.mocked(updatePatientEmail).mockRejectedValue(
      new ConflictError('Contact already registered', 'contact_conflict')
    );
    const state = onboardingState('show_contact_summary', {
      email: 'ana@example.com',
      missingEmail: true,
    });

    const result = await orchestrate(makeContext({ body: 'sí', flowState: state }));

    expect(updatePatientEmail).toHaveBeenCalledTimes(1);
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
    expect(result.needsHuman).toBe(true);
    expect(result.clearFlowState).toBe(true);
  });

  it('el flujo solo-contacto completa sin ejecutar saveOnboardingHistory', async () => {
    vi.mocked(updatePatientEmail).mockResolvedValue({} as never);

    const afterEmail = await orchestrate(
      makeContext({
        body: 'ana@example.com',
        flowState: onboardingState('ask_email', { missingEmail: true }),
      })
    );
    expect(afterEmail.flowState?.name).toBe('show_contact_summary');

    const afterConfirm = await orchestrate(
      makeContext({ body: 'sí', flowState: afterEmail.flowState })
    );
    expect(afterConfirm.flowState?.name).toBe('complete');
    expect(updatePatientEmail).toHaveBeenCalledTimes(1);
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });

  it('la expiración del paso de email no escribe', async () => {
    vi.mocked(isOnboardingEnabled).mockReturnValue(false);
    const expired: FlowState = {
      ...onboardingState('ask_email', { missingEmail: true }),
      lastActivity: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    };

    await orchestrate(makeContext({ body: 'ana@example.com', flowState: expired }));

    expect(updatePatientEmail).not.toHaveBeenCalled();
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });
});

describe('orchestrate — urgencia durante onboarding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isOnboardingEnabled).mockReturnValue(true);
  });

  it('escala, pausa el onboarding y no escribe ante una señal de urgencia', async () => {
    const result = await orchestrate(
      makeContext({
        body: 'tengo dolor fuerte e hinchazón',
        flowState: onboardingState('ask_conditions', { allergies: ['penicilina'] }),
      })
    );

    expect(result.needsHuman).toBe(true);
    expect(result.clearFlowState).toBe(true);
    expect(result.decision.intent).toBe('support');
    expect(result.decision.decision).toBe('needs_human');
    expect(result.responseText).toContain('una persona del consultorio te va a contactar');
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });

  it('no escala respuestas clínicas legítimas', async () => {
    const result = await orchestrate(
      makeContext({
        body: 'soy alérgico a la penicilina',
        flowState: onboardingState('ask_allergies_detail'),
      })
    );

    expect(result.clearFlowState).toBeUndefined();
    expect(result.flowState?.name).toBe('ask_medications');
    expect(result.decision.intent).not.toBe('support');
  });
});
