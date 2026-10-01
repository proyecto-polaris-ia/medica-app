import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createPaymentIntent } from '../payment-intents';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PLAN_ID = '660e8400-e29b-41d4-a716-446655440000';
const CONTACT_ID = '770e8400-e29b-41d4-a716-446655440000';
const INTENT_ID = '880e8400-e29b-41d4-a716-446655440000';

type InsertPayload = Record<string, unknown>;

function buildInsert() {
  const insert = vi.fn();
  const select = vi.fn();
  const single = vi.fn();
  const query = {
    insert: insert.mockReturnThis(),
    select: select.mockReturnThis(),
    single,
    _calls: { insert, select, single },
  };
  return query;
}

function mockAdminForInsert(insertedRow: Record<string, unknown>) {
  const query = buildInsert();
  query._calls.single.mockResolvedValue({ data: insertedRow, error: null });
  const from = vi.fn((_table: string) => query);
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from, query };
}

describe('createPaymentIntent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('inserts a payment_intents row with the expected snake_case columns and returns it', async () => {
    const { from, query } = mockAdminForInsert({
      id: INTENT_ID,
      patient_id: PATIENT_ID,
      treatment_plan_id: PLAN_ID,
      whatsapp_contact_id: CONTACT_ID,
      intent_source: 'whatsapp',
      amount: 500,
      commitment_text: 'La próxima semana',
      method: 'cash',
      status: 'pending',
      notes: 'Paciente quiere liquidar el plan',
      created_at: '2026-09-30T12:00:00.000Z',
      updated_at: '2026-09-30T12:00:00.000Z',
    });

    const row = await createPaymentIntent({
      patientId: PATIENT_ID,
      treatmentPlanId: PLAN_ID,
      whatsappContactId: CONTACT_ID,
      amount: 500,
      commitmentText: 'La próxima semana',
      method: 'cash',
      notes: 'Paciente quiere liquidar el plan',
      source: 'whatsapp',
    });

    expect(from).toHaveBeenCalledWith('payment_intents');
    expect(query._calls.insert).toHaveBeenCalledTimes(1);

    const payload = query._calls.insert.mock.calls[0]?.[0] as InsertPayload;
    expect(payload).toEqual({
      patient_id: PATIENT_ID,
      treatment_plan_id: PLAN_ID,
      whatsapp_contact_id: CONTACT_ID,
      intent_source: 'whatsapp',
      amount: 500,
      commitment_text: 'La próxima semana',
      method: 'cash',
      notes: 'Paciente quiere liquidar el plan',
    });

    expect(row).toMatchObject({
      id: INTENT_ID,
      patientId: PATIENT_ID,
      treatmentPlanId: PLAN_ID,
      whatsappContactId: CONTACT_ID,
      source: 'whatsapp',
      amount: 500,
      commitmentText: 'La próxima semana',
      method: 'cash',
      status: 'pending',
      notes: 'Paciente quiere liquidar el plan',
    });
  });

  it('omits optional fields from the insert payload when they are undefined', async () => {
    const { query } = mockAdminForInsert({
      id: INTENT_ID,
      patient_id: PATIENT_ID,
      treatment_plan_id: null,
      whatsapp_contact_id: null,
      intent_source: 'whatsapp',
      amount: null,
      commitment_text: null,
      method: null,
      status: 'pending',
      notes: null,
      created_at: '2026-09-30T12:00:00.000Z',
      updated_at: '2026-09-30T12:00:00.000Z',
    });

    await createPaymentIntent({ patientId: PATIENT_ID, source: 'whatsapp' });

    const payload = query._calls.insert.mock.calls[0]?.[0] as InsertPayload;
    expect(payload).toEqual({
      patient_id: PATIENT_ID,
      intent_source: 'whatsapp',
    });
    expect(payload).not.toHaveProperty('amount');
    expect(payload).not.toHaveProperty('commitment_text');
    expect(payload).not.toHaveProperty('method');
    expect(payload).not.toHaveProperty('notes');
    expect(payload).not.toHaveProperty('treatment_plan_id');
    expect(payload).not.toHaveProperty('whatsapp_contact_id');
  });

  it('accepts a manual source for non-WhatsApp entry points', async () => {
    const { query } = mockAdminForInsert({
      id: INTENT_ID,
      patient_id: PATIENT_ID,
      intent_source: 'manual',
      status: 'pending',
      created_at: '2026-09-30T12:00:00.000Z',
      updated_at: '2026-09-30T12:00:00.000Z',
    });

    await createPaymentIntent({ patientId: PATIENT_ID, source: 'manual' });

    const payload = query._calls.insert.mock.calls[0]?.[0] as InsertPayload;
    expect(payload.intent_source).toBe('manual');
  });

  it('throws when the Supabase insert returns an error', async () => {
    const query = buildInsert();
    query._calls.single.mockResolvedValue({
      data: null,
      error: { message: 'insert failed' },
    });
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => query,
    });

    await expect(
      createPaymentIntent({ patientId: PATIENT_ID, source: 'whatsapp' })
    ).rejects.toThrow('insert failed');
  });

  it('never touches the payments table (no money movement guardrail)', async () => {
    const { from } = mockAdminForInsert({
      id: INTENT_ID,
      patient_id: PATIENT_ID,
      intent_source: 'whatsapp',
      status: 'pending',
      created_at: '2026-09-30T12:00:00.000Z',
      updated_at: '2026-09-30T12:00:00.000Z',
    });

    await createPaymentIntent({
      patientId: PATIENT_ID,
      treatmentPlanId: PLAN_ID,
      amount: 1000,
      source: 'whatsapp',
    });

    const tablesTouched = from.mock.calls.map((call) => String(call[0]));
    expect(tablesTouched).not.toContain('payments');
    expect(tablesTouched).toEqual(['payment_intents']);
  });
});