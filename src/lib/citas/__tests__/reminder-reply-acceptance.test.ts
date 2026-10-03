import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createEveWhatsAppEscalation } from '@/lib/whatsapp/eve-escalation';
import { isFlowSessionActive } from '@/lib/whatsapp/orchestrator';
import { transitionAppointmentFromReminder } from '../appointment-status';
import { formatClinicDateLabel } from '../send-appointment-reminder';
import { clinicTimeLabel } from '@/lib/admin/timezone';
import {
  classifyReminderReply,
  isEligibleReminderReplyCandidate,
  type ReminderReplyCandidate,
} from '../reminder-reply';
import { handleReminderReply } from '../reminder-reply-service';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('../appointment-status', () => ({
  transitionAppointmentFromReminder: vi.fn(),
}));

vi.mock('@/lib/whatsapp/eve-escalation', () => ({
  createEveWhatsAppEscalation: vi.fn(),
}));

/**
 * Aceptación del issue #87 — Fase 4 (`tasks.md` 4.1–4.5).
 *
 * Pruebas de aceptación estilo end-to-end sobre el borde de servicio: recorren
 * `classifyReminderReply` → elegibilidad → `handleReminderReply` con Supabase,
 * la transición guardada y la escalación mockeadas (mismo patrón que
 * `reminder-reply-service.test.ts`). Esta fase es **solo de pruebas**: el RED de
 * comportamiento se observó en las tareas 1.1, 2.5 y 3.5, donde vivía cada
 * implementación; aquí la aceptación queda como regresión explícita en verde.
 *
 * Mapeo de los tres criterios de aceptación del issue #87:
 *
 * 1. **Parseo de intención** (positivos, negativos y ambiguos) →
 *    `describe('aceptación #87 (1) — parseo de intención')` (`tasks.md` 4.1).
 *    Complementa la cobertura unitaria de `reminder-reply.test.ts` con el efecto
 *    real de cada intención sobre el estado de la cita y la escalación.
 * 2. **"me duele mucho" nunca confirma y escala a humano** →
 *    `describe('aceptación #87 (2) — síntoma/urgencia')` (`tasks.md` 4.2). El
 *    síntoma **puro** no es una respuesta a recordatorio: el servicio devuelve
 *    `handled:false` sin tocar estado ni escalar por su cuenta, y la escalación
 *    humana la decide el pipeline general (orquestador), cubierta en
 *    `src/lib/whatsapp/__tests__/inbound-service*.test.ts`. La respuesta mezclada
 *    con clínica sí crea la escalación aquí y **no** transiciona (R6).
 * 3. **Una sesión de flow engine activa gana** →
 *    `describe('aceptación #87 (3) — coexistencia con flow engine activo')`
 *    (`tasks.md` 4.3). El caso de integración completo **ya existe y pasa** en
 *    `src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts`
 *    ("con una sesión de flow engine activa no hay transición ni escalación y el
 *    flujo continúa (aceptación #87)"). Como `inbound-service.ts` y su suite
 *    están fuera de las superficies de edición de esta parte, ese caso **no se
 *    duplica**: aquí se fija el contrato compuesto con las funciones puras reales
 *    (`classifyReminderReply`, `isEligibleReminderReplyCandidate` y
 *    `isFlowSessionActive`), que demuestra que la única razón por la que un "1"
 *    elegible deja de procesarse es la precedencia de la sesión activa.
 *
 * `tasks.md` 4.4 (path legacy) y 4.5 (duplicado por ledger) viven también en
 * `src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts` ("reconoce
 * la respuesta en el path legacy con el flow engine apagado" y "un duplicado por
 * ledger no repite transición ni acuse"), escritos y en verde desde la Fase 3
 * (3.5); tampoco se duplican aquí.
 */

const APPOINTMENT_ID = '990e8400-e29b-41d4-a716-446655440000';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const REMINDER_ID = '770e8400-e29b-41d4-a716-446655440000';
const PHONE = '+5215512345678';
const PROVIDER_MESSAGE_ID = 'wamid.acceptance-1';
// 2026-10-05T16:00Z = lunes 5 de octubre, 10:00 en America/Mexico_City.
const START_AT = '2026-10-05T16:00:00.000Z';
const NOW = new Date('2026-10-05T13:00:00.000Z');

const POSITIVE_REPLIES = ['1', 'si', 'sí', 'confirmo', 'va', 'ok'];
const NEGATIVE_REPLIES = ['hola', 'quién es?', 'gracias', 'no'];
const AMBIGUOUS_REPLIES = ['sí, pero me duele mucho', 'confirmo y además qué medicina tomo'];

type QueryResult = { data: unknown; error: { message?: string } | null };

interface MockQuery {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  _result: QueryResult;
}

function buildQuery(): MockQuery {
  const query: MockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    _result: { data: [], error: null },
  };
  Object.defineProperty(query, 'then', {
    get() {
      return (onFulfilled: (value: QueryResult) => unknown) =>
        Promise.resolve(query._result).then(onFulfilled);
    },
  });
  return query;
}

function mockReminders(query: MockQuery) {
  const from = vi.fn(() => query);
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from };
}

function reminderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REMINDER_ID,
    appointment_id: APPOINTMENT_ID,
    sent_at: '2026-10-05T12:00:00.000Z',
    appointments: {
      id: APPOINTMENT_ID,
      patient_id: PATIENT_ID,
      start_at: START_AT,
      end_at: '2026-10-05T17:00:00.000Z',
      status: 'requested',
      notes: 'Nota previa de recepción',
      patients: { full_name: 'María López', phone_e164: PHONE },
    },
    ...overrides,
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    phone: PHONE,
    message: '1',
    providerMessageId: PROVIDER_MESSAGE_ID,
    now: NOW,
    ...overrides,
  };
}

/** Candidato elegible real para probar la composición de la precedencia. */
function eligibleCandidate(): ReminderReplyCandidate {
  return {
    reminderId: REMINDER_ID,
    appointmentId: APPOINTMENT_ID,
    sentAt: '2026-10-05T12:00:00.000Z',
    appointmentStatus: 'requested',
    patientName: 'María López',
    patientPhoneE164: PHONE,
    startAt: START_AT,
    endAt: '2026-10-05T17:00:00.000Z',
    notes: 'Nota previa de recepción',
  };
}

describe('aceptación #87 (1) — parseo de intención', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(POSITIVE_REPLIES)(
    'positivo %s: confirma, transiciona y responde con la fecha y hora reales',
    async (message) => {
      const query = buildQuery();
      mockReminders(query);
      query._result = { data: [reminderRow()], error: null };
      vi.mocked(transitionAppointmentFromReminder).mockResolvedValue({
        ok: true,
        status: 'confirmed',
      });

      expect(classifyReminderReply(message)).toBe('confirmation');

      const result = await handleReminderReply(baseInput({ message }));

      expect(transitionAppointmentFromReminder).toHaveBeenCalledWith({
        appointmentId: APPOINTMENT_ID,
        to: 'confirmed',
        reasonText: undefined,
        occurredAt: NOW,
      });
      expect(result).toMatchObject({
        handled: true,
        outcome: 'confirmation',
        needsHuman: false,
      });
      expect(result.responseText).toContain(formatClinicDateLabel(START_AT));
      expect(result.responseText).toContain(clinicTimeLabel(START_AT));
      expect(createEveWhatsAppEscalation).not.toHaveBeenCalled();
    }
  );

  it.each(NEGATIVE_REPLIES)(
    'negativo %s: intención none, sin cambio de estado y pipeline intacto',
    async (message) => {
      const { from } = mockReminders(buildQuery());

      expect(classifyReminderReply(message)).toBe('none');

      const result = await handleReminderReply(baseInput({ message }));

      expect(result).toEqual({
        handled: false,
        outcome: 'none',
        responseText: '',
        needsHuman: false,
      });
      // Sin consulta a Supabase, sin transición y sin escalación: la cita y sus
      // notas quedan intactas y el mensaje sigue al pipeline general.
      expect(from).not.toHaveBeenCalled();
      expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
      expect(createEveWhatsAppEscalation).not.toHaveBeenCalled();
    }
  );

  it.each(AMBIGUOUS_REPLIES)(
    'ambiguo %s: escala a humano y NO cambia el estado',
    async (message) => {
      const { from } = mockReminders(buildQuery());

      expect(classifyReminderReply(message)).toBe('ambiguous');

      const result = await handleReminderReply(baseInput({ message }));

      expect(createEveWhatsAppEscalation).toHaveBeenCalledTimes(1);
      expect(createEveWhatsAppEscalation).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'high',
          idempotencyKey: `${PROVIDER_MESSAGE_ID}:ambiguity`,
        })
      );
      // La ambigüedad se resuelve antes de consultar o transicionar: la cita y
      // sus notas quedan intactas.
      expect(from).not.toHaveBeenCalled();
      expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        handled: true,
        outcome: 'ambiguous',
        needsHuman: true,
      });
    }
  );
});

describe('aceptación #87 (2) — síntoma/urgencia nunca confirma', () => {
  beforeEach(() => vi.resetAllMocks());

  it('"me duele mucho" no es respuesta a recordatorio: no transiciona y cede el turno al pipeline general', async () => {
    const { from } = mockReminders(buildQuery());

    // Señal clínica sin confirmación ni cancelación → el pipeline general escala
    // (esa escalación la decide el orquestador; aquí se prueba el borde del
    // servicio de recordatorio, que NO confirma nada).
    expect(classifyReminderReply('me duele mucho')).toBe('none');

    const result = await handleReminderReply(baseInput({ message: 'me duele mucho' }));

    expect(result).toEqual({
      handled: false,
      outcome: 'none',
      responseText: '',
      needsHuman: false,
    });
    expect(from).not.toHaveBeenCalled();
    // `appointments.notes` queda intacto: no hay transición ni rastro.
    expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
    expect(createEveWhatsAppEscalation).not.toHaveBeenCalled();
  });

  it('dolor mezclado con confirmación ("sí, pero me duele mucho") escala a humano sin confirmar', async () => {
    mockReminders(buildQuery());

    const result = await handleReminderReply(baseInput({ message: 'sí, pero me duele mucho' }));

    expect(createEveWhatsAppEscalation).toHaveBeenCalledTimes(1);
    expect(createEveWhatsAppEscalation).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: 'high',
        idempotencyKey: `${PROVIDER_MESSAGE_ID}:ambiguity`,
      })
    );
    expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: 'ambiguous', needsHuman: true });
  });

  it('urgencia mezclada con cancelación ("no puedo, tengo una infección") escala a humano sin cancelar', async () => {
    mockReminders(buildQuery());

    const result = await handleReminderReply(baseInput({ message: 'no puedo, tengo una infección' }));

    expect(createEveWhatsAppEscalation).toHaveBeenCalledTimes(1);
    expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: 'ambiguous', needsHuman: true });
  });
});

describe('aceptación #87 (3) — coexistencia con flow engine activo', () => {
  const activeSession = {
    name: 'collect_date',
    entities: {},
    lastActivity: '2026-10-05T12:59:00.000Z',
  };

  it('la sesión activa es lo único que impide procesar un "1" elegible (integración completa en inbound-service-reminder-reply.test.ts)', () => {
    // El "1" sí sería una confirmación de una cita elegible...
    expect(classifyReminderReply('1')).toBe('confirmation');
    expect(
      isEligibleReminderReplyCandidate(eligibleCandidate(), {
        phone: PHONE,
        now: NOW,
        to: 'confirmed',
      })
    ).toBe(true);

    // ...pero la guarda de precedencia del gancho (`!isFlowSessionActive(...)`)
    // cierra el paso mientras la sesión está activa y no expirada.
    expect(isFlowSessionActive(activeSession, NOW)).toBe(true);
    // Una sesión completa o expirada no bloquea (el gancho sí aplicaría).
    expect(isFlowSessionActive({ ...activeSession, name: 'complete' }, NOW)).toBe(false);
    expect(
      isFlowSessionActive(
        { ...activeSession, lastActivity: '2026-10-05T12:00:00.000Z' }, // 1 h antes
        NOW
      )
    ).toBe(false);
  });
});
