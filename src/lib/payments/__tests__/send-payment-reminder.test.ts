import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { listAccountsReceivable } from '@/lib/admin/accounts-receivable';
import { sendWhatsAppTemplateMessage } from '@/lib/whatsapp/client';
import {
  buildReminderKey,
  selectReminderCandidates,
  sendPaymentReminder,
} from '../send-payment-reminder';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/admin/accounts-receivable', () => ({
  listAccountsReceivable: vi.fn(),
}));

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppTemplateMessage: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_PATIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const PLAN_ID = '660e8400-e29b-41d4-a716-446655440000';
const SECOND_PLAN_ID = '660e8400-e29b-41d4-a716-446655440001';
const REMINDER_ID = '770e8400-e29b-41d4-a716-446655440000';

function buildQuery() {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    _result: { data: Record<string, unknown>[] | null; error: { message?: string } | null };
    _single: { data: Record<string, unknown> | null; error: { message?: string } | null };
  } = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    _result: { data: [], error: null },
    _single: { data: null, error: null },
  };
  // Chain awaits the final promise-like value (Supabase query resolves with the result).
  Object.defineProperty(query, 'then', {
    get() {
      return (onFulfilled: (value: typeof query._result) => unknown) =>
        Promise.resolve(query._result).then(onFulfilled);
    },
  });
  query.maybeSingle.mockImplementation(() => Promise.resolve(query._single));
  return query;
}

function mockAdminByTable(map: Record<string, ReturnType<typeof buildQuery>>) {
  const from = vi.fn((table: string) => {
    const q = map[table];
    if (!q) throw new Error(`Unexpected table query: ${table}`);
    return q;
  });
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from };
}

function accountsRow(overrides: Record<string, unknown> = {}) {
  return {
    patientId: PATIENT_ID,
    patientName: 'María López',
    patientPhoneE164: '+5215512345678',
    balance: 1200,
    pastDuePlans: [
      {
        treatmentPlanId: PLAN_ID,
        name: 'Ortodoncia',
        balance: 1200,
        daysPastDue: 30,
        isPastDue: true,
      },
    ],
    ...overrides,
  };
}

describe('sendPaymentReminder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listAccountsReceivable).mockResolvedValue([]);
    vi.mocked(sendWhatsAppTemplateMessage).mockResolvedValue({
      ok: true,
      status: 200,
      providerMessageId: 'wamid.reminder-1',
    });
  });

  describe('buildReminderKey', () => {
    it('formats patient/plan/period in a stable shape', () => {
      const key = buildReminderKey({
        patientId: PATIENT_ID,
        treatmentPlanId: PLAN_ID,
        periodKey: '2026-W39',
      });
      expect(key).toBe(`patient:${PATIENT_ID}:plan:${PLAN_ID}:2026-W39`);
    });
  });

  describe('selectReminderCandidates', () => {
    it('excludes rows with balance <= 0', () => {
      const rows = [
        accountsRow({ balance: 0, pastDuePlans: [{ treatmentPlanId: PLAN_ID, balance: 0, daysPastDue: 30, isPastDue: true }] }),
        accountsRow({ patientId: OTHER_PATIENT_ID, balance: 500 }),
      ];
      const candidates = selectReminderCandidates(rows);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].patientId).toBe(OTHER_PATIENT_ID);
    });

    it('excludes rows without a phone number', () => {
      const rows = [
        accountsRow({ patientPhoneE164: null }),
        accountsRow({ patientId: OTHER_PATIENT_ID, patientPhoneE164: '+5215512345679' }),
      ];
      const candidates = selectReminderCandidates(rows);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].patientId).toBe(OTHER_PATIENT_ID);
    });

    it('excludes rows whose only past-due plan is no longer past due', () => {
      const rows = [
        accountsRow({
          balance: 100,
          pastDuePlans: [{ treatmentPlanId: PLAN_ID, balance: 100, daysPastDue: 1, isPastDue: false }],
        }),
        accountsRow({ patientId: OTHER_PATIENT_ID, balance: 200 }),
      ];
      const candidates = selectReminderCandidates(rows);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].patientId).toBe(OTHER_PATIENT_ID);
    });

    it('keeps rows with a past-due plan regardless of global balance', () => {
      const rows = [
        accountsRow({
          balance: 50,
          pastDuePlans: [{ treatmentPlanId: PLAN_ID, balance: 50, daysPastDue: 60, isPastDue: true }],
        }),
      ];
      const candidates = selectReminderCandidates(rows);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].pastDuePlans).toHaveLength(1);
    });
  });

  describe('sendPaymentReminder', () => {
    const baseInput = {
      patientId: PATIENT_ID,
      treatmentPlanId: PLAN_ID,
      patientPhoneE164: '+5215512345678',
      patientName: 'María López',
      balance: 1200,
      daysPastDue: 30,
      periodKey: '2026-W39',
    } as const;

    it('skips sending and returns { sent: false, skipped: true } when reminder_key already exists', async () => {
      const remindersQuery = buildQuery();
      remindersQuery._single = {
        data: { id: REMINDER_ID, status: 'sent', dry_run: false },
        error: null,
      };
      const inserts: Record<string, unknown>[] = [];
      remindersQuery.insert.mockImplementation((payload: Record<string, unknown>) => {
        inserts.push(payload);
        return remindersQuery;
      });
      mockAdminByTable({ payment_reminders: remindersQuery });

      const result = await sendPaymentReminder({ ...baseInput, dryRun: false });

      expect(remindersQuery.maybeSingle).toHaveBeenCalled();
      expect(inserts).toHaveLength(0);
      expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
      expect(result).toEqual({
        reminderKey: `patient:${PATIENT_ID}:plan:${PLAN_ID}:2026-W39`,
        sent: false,
        skipped: true,
      });
    });

    it('persists a dry-run row with dry_run=true and never calls the send primitive', async () => {
      const remindersQuery = buildQuery();
      remindersQuery._single = { data: null, error: null };
      const inserts: Record<string, unknown>[] = [];
      remindersQuery.insert.mockImplementation((payload: Record<string, unknown>) => {
        inserts.push(payload);
        return remindersQuery;
      });
      mockAdminByTable({ payment_reminders: remindersQuery });

      const result = await sendPaymentReminder({ ...baseInput, dryRun: true });

      expect(inserts).toHaveLength(1);
      const row = inserts[0];
      expect(row).toMatchObject({
        patient_id: PATIENT_ID,
        treatment_plan_id: PLAN_ID,
        reminder_key: `patient:${PATIENT_ID}:plan:${PLAN_ID}:2026-W39`,
        template_name: 'recordatorio_pago',
        status: 'scheduled',
        dry_run: true,
        balance_at_send: 1200,
      });
      expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        sent: false,
        skipped: false,
        dryRun: true,
        reminderKey: `patient:${PATIENT_ID}:plan:${PLAN_ID}:2026-W39`,
      });
    });

    it('sends a template message and persists a sent row when dryRun=false and reminder_key is new', async () => {
      const remindersQuery = buildQuery();
      remindersQuery._single = { data: null, error: null };
      const inserts: Record<string, unknown>[] = [];
      remindersQuery.insert.mockImplementation((payload: Record<string, unknown>) => {
        inserts.push(payload);
        return remindersQuery;
      });
      mockAdminByTable({ payment_reminders: remindersQuery });

      const result = await sendPaymentReminder({ ...baseInput, dryRun: false });

      expect(sendWhatsAppTemplateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+5215512345678',
          templateName: 'recordatorio_pago',
          languageCode: 'es_MX',
          bodyParameters: expect.arrayContaining([
            expect.objectContaining({ type: 'text', text: 'María López' }),
            expect.objectContaining({ type: 'text', text: expect.stringContaining('1,200') }),
            expect.objectContaining({ type: 'text', text: '30' }),
          ]),
        })
      );

      expect(inserts).toHaveLength(1);
      const row = inserts[0];
      expect(row).toMatchObject({
        patient_id: PATIENT_ID,
        treatment_plan_id: PLAN_ID,
        reminder_key: `patient:${PATIENT_ID}:plan:${PLAN_ID}:2026-W39`,
        template_name: 'recordatorio_pago',
        status: 'sent',
        dry_run: false,
        balance_at_send: 1200,
        provider_message_id: 'wamid.reminder-1',
      });
      expect(result).toEqual({
        reminderKey: `patient:${PATIENT_ID}:plan:${PLAN_ID}:2026-W39`,
        sent: true,
        skipped: false,
        providerMessageId: 'wamid.reminder-1',
      });
    });

    it('persists a failed row when the upstream send returns ok=false', async () => {
      vi.mocked(sendWhatsAppTemplateMessage).mockResolvedValueOnce({
        ok: false,
        skipped: true,
        status: null,
        error: 'WhatsApp Cloud API credentials are not configured.',
      });
      const remindersQuery = buildQuery();
      remindersQuery._single = { data: null, error: null };
      const inserts: Record<string, unknown>[] = [];
      remindersQuery.insert.mockImplementation((payload: Record<string, unknown>) => {
        inserts.push(payload);
        return remindersQuery;
      });
      mockAdminByTable({ payment_reminders: remindersQuery });

      const result = await sendPaymentReminder({ ...baseInput, dryRun: false });

      expect(inserts).toHaveLength(1);
      const row = inserts[0];
      expect(row).toMatchObject({
        status: 'failed',
        dry_run: false,
        error: expect.stringContaining('credentials'),
      });
      expect(result).toMatchObject({
        sent: false,
        skipped: false,
        providerMessageId: undefined,
        error: expect.stringContaining('credentials'),
      });
    });
  });
});