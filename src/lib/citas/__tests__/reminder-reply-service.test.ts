import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { transitionAppointmentFromReminder } from '../appointment-status';
import { createEveWhatsAppEscalation } from '@/lib/whatsapp/eve-escalation';
import { formatClinicDateLabel } from '../send-appointment-reminder';
import { clinicTimeLabel } from '@/lib/admin/timezone';
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

const APPOINTMENT_ID = '990e8400-e29b-41d4-a716-446655440000';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const REMINDER_ID = '770e8400-e29b-41d4-a716-446655440000';
const PHONE = '+5215512345678';
const PROVIDER_MESSAGE_ID = 'wamid.reply-1';
// 2026-10-05T16:00Z = lunes 5 de octubre, 10:00 en America/Mexico_City.
const START_AT = '2026-10-05T16:00:00.000Z';
const NOW = new Date('2026-10-05T13:00:00.000Z');

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
      notes: null,
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

/**
 * Fase 2 — Orquestación I/O (design.md §3, §7 y §9). Supabase, la transición y
 * la escalación se mockean; aquí se prueba la orquestación y sus decisiones.
 */
describe('handleReminderReply — query de elegibilidad', () => {
  beforeEach(() => vi.resetAllMocks());

  it('acota por status/dry_run/ventana/estado y ordena por sent_at', async () => {
    const query = buildQuery();
    const { from } = mockReminders(query);
    vi.mocked(transitionAppointmentFromReminder).mockResolvedValue({
      ok: true,
      status: 'confirmed',
    });
    query._result = { data: [reminderRow()], error: null };

    await handleReminderReply(baseInput());

    expect(from).toHaveBeenCalledWith('appointment_reminders');
    expect(query.eq).toHaveBeenCalledWith('status', 'sent');
    expect(query.eq).toHaveBeenCalledWith('dry_run', false);
    expect(query.gte).toHaveBeenCalledWith('sent_at', '2026-10-04T01:00:00.000Z');
    expect(query.in).toHaveBeenCalledWith('appointments.status', [
      'requested',
      'pending',
      'confirmed',
    ]);
    expect(query.order).toHaveBeenCalledWith('sent_at', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(10);
  });
});

describe('handleReminderReply — confirmación', () => {
  beforeEach(() => vi.resetAllMocks());

  it('transiciona una cita elegible y responde con la fecha real', async () => {
    const query = buildQuery();
    mockReminders(query);
    query._result = { data: [reminderRow()], error: null };
    vi.mocked(transitionAppointmentFromReminder).mockResolvedValue({
      ok: true,
      status: 'confirmed',
    });

    const result = await handleReminderReply(baseInput({ message: '1' }));

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
  });

  it('confirmación repetida sobre cita ya confirmada no revierte ni escala', async () => {
    const query = buildQuery();
    mockReminders(query);
    query._result = {
      data: [reminderRow({ appointments: { ...reminderRow().appointments, status: 'confirmed' } })],
      error: null,
    };

    const result = await handleReminderReply(baseInput({ message: 'sí' }));

    expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
    expect(createEveWhatsAppEscalation).not.toHaveBeenCalled();
    expect(result).toMatchObject({ handled: true, outcome: 'already', needsHuman: false });
    expect(result.responseText).toContain(formatClinicDateLabel(START_AT));
  });
});

describe('handleReminderReply — cancelación', () => {
  beforeEach(() => vi.resetAllMocks());

  it('transiciona, anexa motivo y escala una sola vez ofreciendo reagendar', async () => {
    const query = buildQuery();
    mockReminders(query);
    query._result = { data: [reminderRow()], error: null };
    vi.mocked(transitionAppointmentFromReminder).mockResolvedValue({
      ok: true,
      status: 'cancelled',
    });

    const result = await handleReminderReply(baseInput({ message: 'no puedo, trabajo' }));

    expect(transitionAppointmentFromReminder).toHaveBeenCalledWith({
      appointmentId: APPOINTMENT_ID,
      to: 'cancelled',
      reasonText: 'no puedo, trabajo',
      occurredAt: NOW,
    });
    expect(createEveWhatsAppEscalation).toHaveBeenCalledTimes(1);
    expect(createEveWhatsAppEscalation).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `${PROVIDER_MESSAGE_ID}:cancellation` })
    );
    expect(result).toMatchObject({ handled: true, outcome: 'cancellation', needsHuman: true });
    expect(result.responseText).toMatch(/reagendar/i);
    expect(result.responseText).toContain(formatClinicDateLabel(START_AT));
  });
});

describe('handleReminderReply — ambigüedad', () => {
  beforeEach(() => vi.resetAllMocks());

  it('escala sin tocar el estado de la cita', async () => {
    const query = buildQuery();
    mockReminders(query);
    query._result = { data: [reminderRow()], error: null };

    const result = await handleReminderReply(baseInput({ message: 'sí, me duele mucho' }));

    expect(createEveWhatsAppEscalation).toHaveBeenCalledTimes(1);
    expect(createEveWhatsAppEscalation).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `${PROVIDER_MESSAGE_ID}:ambiguity` })
    );
    expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
    expect(result).toMatchObject({ handled: true, outcome: 'ambiguous', needsHuman: true });
  });
});

describe('handleReminderReply — ninguna intención', () => {
  beforeEach(() => vi.resetAllMocks());

  it('deja el pipeline intacto sin consultar ni escalar', async () => {
    const { from } = mockReminders(buildQuery());

    const result = await handleReminderReply(baseInput({ message: 'gracias' }));

    expect(result).toEqual({
      handled: false,
      outcome: 'none',
      responseText: '',
      needsHuman: false,
    });
    expect(from).not.toHaveBeenCalled();
    expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
    expect(createEveWhatsAppEscalation).not.toHaveBeenCalled();
  });
});

describe('handleReminderReply — fuera de ventana', () => {
  beforeEach(() => vi.resetAllMocks());

  it('sin candidato elegible escala y no transiciona', async () => {
    const query = buildQuery();
    mockReminders(query);
    query._result = { data: [], error: null };

    const result = await handleReminderReply(baseInput({ message: 'confirmo' }));

    expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
    expect(createEveWhatsAppEscalation).toHaveBeenCalledTimes(1);
    expect(createEveWhatsAppEscalation).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `${PROVIDER_MESSAGE_ID}:out_of_window` })
    );
    expect(result).toMatchObject({ handled: true, outcome: 'out_of_window', needsHuman: true });
  });

  it('un recordatorio viejo (>36h) no es elegible', async () => {
    const query = buildQuery();
    mockReminders(query);
    query._result = { data: [reminderRow({ sent_at: '2026-10-03T20:00:00.000Z' })], error: null };

    const result = await handleReminderReply(baseInput({ message: '1' }));

    expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
    expect(result.outcome).toBe('out_of_window');
  });
});

describe('handleReminderReply — idempotencia', () => {
  beforeEach(() => vi.resetAllMocks());

  it('mantiene la misma llave de escalación en una cancelación repetida', async () => {
    const query = buildQuery();
    mockReminders(query);
    // Cita ya cancelada: no aparece en la query de elegibles.
    query._result = { data: [], error: null };

    await handleReminderReply(baseInput({ message: 'no puedo' }));
    await handleReminderReply(baseInput({ message: 'no puedo' }));

    expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
    const keys = vi
      .mocked(createEveWhatsAppEscalation)
      .mock.calls.map(([arg]) => arg.idempotencyKey);
    expect(keys).toEqual([
      `${PROVIDER_MESSAGE_ID}:out_of_window`,
      `${PROVIDER_MESSAGE_ID}:out_of_window`,
    ]);
  });
});

describe('handleReminderReply — triangulación', () => {
  beforeEach(() => vi.resetAllMocks());

  it('un estado terminal devuelto por la query nunca transiciona', async () => {
    const query = buildQuery();
    mockReminders(query);
    query._result = {
      data: [reminderRow({ appointments: { ...reminderRow().appointments, status: 'attended' } })],
      error: null,
    };

    const result = await handleReminderReply(baseInput({ message: '1' }));

    expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
    expect(result.outcome).toBe('out_of_window');
  });

  it('un teléfono distinto no matchea aunque normalice', async () => {
    const query = buildQuery();
    mockReminders(query);
    query._result = {
      data: [
        reminderRow({
          appointments: {
            ...reminderRow().appointments,
            patients: { full_name: 'Otra', phone_e164: '+5215599999999' },
          },
        }),
      ],
      error: null,
    };

    const result = await handleReminderReply(baseInput({ phone: '+52 155 1234 5678' }));

    expect(transitionAppointmentFromReminder).not.toHaveBeenCalled();
    expect(result.outcome).toBe('out_of_window');
  });

  it('en empate de sentAt elige el startAt más próximo', async () => {
    const nearId = 'aaa00000-0000-4000-8000-000000000001';
    const farId = 'bbb00000-0000-4000-8000-000000000002';
    const query = buildQuery();
    mockReminders(query);
    query._result = {
      data: [
        reminderRow({
          id: 'reminder-far',
          appointment_id: farId,
          appointments: { ...reminderRow().appointments, id: farId, start_at: '2026-10-09T16:00:00.000Z' },
        }),
        reminderRow({
          id: 'reminder-near',
          appointment_id: nearId,
          appointments: { ...reminderRow().appointments, id: nearId, start_at: START_AT },
        }),
      ],
      error: null,
    };
    vi.mocked(transitionAppointmentFromReminder).mockResolvedValue({
      ok: true,
      status: 'confirmed',
    });

    await handleReminderReply(baseInput({ message: 'ok' }));

    expect(transitionAppointmentFromReminder).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: nearId })
    );
  });

  it('acepta el borde exacto de la ventana (sentAt = now - 36h)', async () => {
    const query = buildQuery();
    mockReminders(query);
    query._result = { data: [reminderRow({ sent_at: '2026-10-04T01:00:00.000Z' })], error: null };
    vi.mocked(transitionAppointmentFromReminder).mockResolvedValue({
      ok: true,
      status: 'confirmed',
    });

    const result = await handleReminderReply(baseInput({ message: '1' }));

    expect(transitionAppointmentFromReminder).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('confirmation');
  });
});
