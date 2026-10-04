import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { sendWhatsAppTemplateMessage, sendWhatsAppTextMessage } from '@/lib/whatsapp/client';
import { appointmentReminderPeriod } from '../send-appointment-reminder';
import { ONBOARDING_NUDGE_TEMPLATE_NAME, sendOnboardingNudge } from '../send-onboarding-nudge';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppTemplateMessage: vi.fn(),
  sendWhatsAppTextMessage: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const APPOINTMENT_ID = '990e8400-e29b-41d4-a716-446655440000';
const NUDGE_ID = '770e8400-e29b-41d4-a716-446655440000';
const START_AT = '2026-10-05T16:00:00.000Z'; // 10:00 en America/Mexico_City

const EXPECTED_KEY = `onboarding:${PATIENT_ID}:${appointmentReminderPeriod(START_AT).isoWeekKey}`;

type QueryResult = { data: unknown; error: { message?: string; code?: string } | null };

interface MockQuery {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  _result: QueryResult;
  _single: QueryResult;
}

function buildQuery(): MockQuery {
  const query: MockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    _result: { data: [], error: null },
    _single: { data: null, error: null },
  };
  // La query encadenable de Supabase se resuelve al hacer await sobre el builder.
  Object.defineProperty(query, 'then', {
    get() {
      return (onFulfilled: (value: QueryResult) => unknown) =>
        Promise.resolve(query._result).then(onFulfilled);
    },
  });
  query.maybeSingle.mockImplementation(() => Promise.resolve(query._single));
  return query;
}

interface MockTables {
  history?: MockQuery;
  contacts?: MockQuery;
  nudges?: MockQuery;
}

function mockAdmin(tables: MockTables = {}) {
  const history = tables.history ?? buildQuery();
  const contacts = tables.contacts ?? buildQuery();
  const nudges = tables.nudges ?? buildQuery();
  const from = vi.fn((table: string) => {
    if (table === 'patient_medical_history') return history;
    if (table === 'whatsapp_contacts') return contacts;
    if (table === 'onboarding_nudges') return nudges;
    throw new Error(`Unexpected table query: ${table}`);
  });
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from, history, contacts, nudges };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    patientId: PATIENT_ID,
    patientName: 'María López',
    patientPhoneE164: '+5215512345678',
    appointmentId: APPOINTMENT_ID,
    startAt: START_AT,
    dryRun: false,
    ...overrides,
  };
}

const ORIGINAL_NUDGE_FLAG = process.env.WHATSAPP_ONBOARDING_NUDGE_ENABLED;

describe('sendOnboardingNudge', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.WHATSAPP_ONBOARDING_NUDGE_ENABLED = 'true';
    vi.mocked(sendWhatsAppTemplateMessage).mockResolvedValue({
      ok: true,
      status: 200,
      providerMessageId: 'wamid.nudge-1',
    });
    vi.mocked(sendWhatsAppTextMessage).mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    if (ORIGINAL_NUDGE_FLAG === undefined) delete process.env.WHATSAPP_ONBOARDING_NUDGE_ENABLED;
    else process.env.WHATSAPP_ONBOARDING_NUDGE_ENABLED = ORIGINAL_NUDGE_FLAG;
  });

  it('onboarding pendiente envía únicamente la plantilla onboarding_pendiente y persiste sent', async () => {
    const inserts: Record<string, unknown>[] = [];
    const nudges = buildQuery();
    nudges.insert.mockImplementation((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return nudges;
    });
    mockAdmin({ nudges });

    const result = await sendOnboardingNudge(baseInput());

    expect(sendWhatsAppTemplateMessage).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppTemplateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+5215512345678',
        templateName: ONBOARDING_NUDGE_TEMPLATE_NAME,
        languageCode: 'es_MX',
        bodyParameters: [{ type: 'text', text: 'María' }],
      })
    );
    expect(sendWhatsAppTextMessage).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      patient_id: PATIENT_ID,
      appointment_id: APPOINTMENT_ID,
      reminder_key: EXPECTED_KEY,
      template_name: 'onboarding_pendiente',
      status: 'sent',
      dry_run: false,
      provider_message_id: 'wamid.nudge-1',
    });
    expect(typeof inserts[0].sent_at).toBe('string');
    expect(result).toEqual({
      reminderKey: EXPECTED_KEY,
      sent: true,
      skipped: false,
      providerMessageId: 'wamid.nudge-1',
    });
  });

  it('onboarding completo (autoreporte) se omite sin llamar al proveedor ni persistir', async () => {
    const history = buildQuery();
    history._single = { data: { source: 'patient_autoreport' }, error: null };
    const inserts: Record<string, unknown>[] = [];
    const nudges = buildQuery();
    nudges.insert.mockImplementation((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return nudges;
    });
    mockAdmin({ history, nudges });

    const result = await sendOnboardingNudge(baseInput());

    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(result).toMatchObject({ reminderKey: EXPECTED_KEY, sent: false, skipped: true });
  });

  it('onboarding completo por staff (historia ya validada) también se omite', async () => {
    const history = buildQuery();
    history._single = { data: { source: 'staff' }, error: null };
    mockAdmin({ history });

    const result = await sendOnboardingNudge(baseInput());

    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: false, skipped: true });
  });

  it('se omite si el contacto tiene opt_in_status = opted_out', async () => {
    const contacts = buildQuery();
    contacts._single = { data: { opt_in_status: 'opted_out' }, error: null };
    const inserts: Record<string, unknown>[] = [];
    const nudges = buildQuery();
    nudges.insert.mockImplementation((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return nudges;
    });
    mockAdmin({ contacts, nudges });

    const result = await sendOnboardingNudge(baseInput());

    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(result).toMatchObject({ sent: false, skipped: true });
  });

  it('trata una llave ya existente como duplicado idempotente (skip sin reenvío)', async () => {
    const nudges = buildQuery();
    nudges._single = { data: { id: NUDGE_ID, status: 'sent' }, error: null };
    const inserts: Record<string, unknown>[] = [];
    nudges.insert.mockImplementation((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return nudges;
    });
    mockAdmin({ nudges });

    const result = await sendOnboardingNudge(baseInput());

    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(result).toEqual({ reminderKey: EXPECTED_KEY, sent: false, skipped: true });
  });

  it('trata una violación de unicidad (23505) en el insert como skip idempotente', async () => {
    const nudges = buildQuery();
    nudges._result = {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    };
    mockAdmin({ nudges });

    const result = await sendOnboardingNudge(baseInput());

    expect(result).toMatchObject({ reminderKey: EXPECTED_KEY, sent: false, skipped: true });
  });

  it('con el flag WHATSAPP_ONBOARDING_NUDGE_ENABLED apagado no hace ningún trabajo (fail-closed)', async () => {
    delete process.env.WHATSAPP_ONBOARDING_NUDGE_ENABLED;
    const { from } = mockAdmin();

    const result = await sendOnboardingNudge(baseInput());

    expect(from).not.toHaveBeenCalled();
    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ reminderKey: EXPECTED_KEY, sent: false, skipped: true });
  });

  it('en dry-run persiste scheduled/dry_run=true y nunca llama al proveedor', async () => {
    const inserts: Record<string, unknown>[] = [];
    const nudges = buildQuery();
    nudges.insert.mockImplementation((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return nudges;
    });
    mockAdmin({ nudges });

    const result = await sendOnboardingNudge(baseInput({ dryRun: true }));

    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
    expect(sendWhatsAppTextMessage).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      status: 'scheduled',
      dry_run: true,
      reminder_key: EXPECTED_KEY,
    });
    expect(inserts[0].sent_at).toBeUndefined();
    expect(result).toMatchObject({ sent: false, skipped: false, dryRun: true });
  });

  it('persiste failed con el error cuando el proveedor falla y jamás degrada a texto libre', async () => {
    vi.mocked(sendWhatsAppTemplateMessage).mockResolvedValueOnce({
      ok: false,
      skipped: true,
      status: null,
      error: 'WhatsApp Cloud API credentials are not configured.',
    });
    const inserts: Record<string, unknown>[] = [];
    const nudges = buildQuery();
    nudges.insert.mockImplementation((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return nudges;
    });
    mockAdmin({ nudges });

    const result = await sendOnboardingNudge(baseInput());

    expect(sendWhatsAppTextMessage).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      status: 'failed',
      dry_run: false,
      error: expect.stringContaining('credentials'),
    });
    expect(result).toMatchObject({
      sent: false,
      skipped: false,
      error: expect.stringContaining('credentials'),
    });
  });
});
