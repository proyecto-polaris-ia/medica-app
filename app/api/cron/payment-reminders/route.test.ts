import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { listAccountsReceivable } from '@/lib/admin/accounts-receivable';
import type { AccountsReceivableRow, PlanBalance } from '@/lib/admin/types';
import { sendPaymentReminder } from '@/lib/payments/send-payment-reminder';
import { POST } from './route';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/admin/accounts-receivable', () => ({
  listAccountsReceivable: vi.fn(),
}));

vi.mock('@/lib/payments/send-payment-reminder', () => ({
  sendPaymentReminder: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PLAN_ID = '660e8400-e29b-41d4-a716-446655440000';

const CRON_SECRET = 'cron-test-secret';

function pastDuePlanRow(overrides: Partial<PlanBalance> = {}): PlanBalance {
  const balance = overrides.balance ?? 1200;
  return {
    treatmentPlanId: PLAN_ID,
    name: 'Ortodoncia',
    status: 'accepted',
    totalAmount: balance,
    paidAmount: 0,
    balance,
    baseDate: '2026-08-30T12:00:00.000Z',
    baseDateSource: 'accepted_at',
    daysPastDue: 30,
    isPastDue: true,
    ...overrides,
  };
}

function accountsRow(overrides: Partial<AccountsReceivableRow> = {}): AccountsReceivableRow {
  const pastDuePlans = overrides.pastDuePlans ?? [pastDuePlanRow()];
  const balance = overrides.balance ?? pastDuePlans[0]?.balance ?? 1200;

  return {
    patientId: PATIENT_ID,
    patientName: 'María López',
    patientPhoneE164: '+5215512345678',
    balance,
    totalEligibleAmount: balance,
    paidAmount: 0,
    unallocatedPaidAmount: 0,
    creditAmount: 0,
    planBalances: pastDuePlans,
    lastPaymentAt: null,
    pastDuePlans,
    ...overrides,
  };
}

function buildContactsQuery() {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    _result: { data: Record<string, unknown>[] | null; error: { message?: string } | null };
  } = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    _result: { data: [], error: null },
  };
  Object.defineProperty(query, 'then', {
    get() {
      return (onFulfilled: (value: typeof query._result) => unknown) =>
        Promise.resolve(query._result).then(onFulfilled);
    },
  });
  return query;
}

function buildRemindersQuery() {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    _single: { data: Record<string, unknown> | null; error: { message?: string } | null };
    _inserts: Record<string, unknown>[];
  } = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    _single: { data: null, error: null },
    _inserts: [],
  };
  query.maybeSingle.mockImplementation(() => Promise.resolve(query._single));
  query.insert.mockImplementation((payload: Record<string, unknown>) => {
    query._inserts.push(payload);
    return Promise.resolve({ data: null, error: null });
  });
  return query;
}

function mockAdmin(map: Record<string, ReturnType<typeof buildContactsQuery | typeof buildRemindersQuery>>) {
  const from = vi.fn((table: string) => {
    const q = map[table];
    if (!q) throw new Error(`Unexpected table query: ${table}`);
    return q;
  });
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from };
}

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function restoreEnv() {
  delete process.env.CRON_SECRET;
  delete process.env.MORA_REMINDERS_ENABLED;
  delete process.env.MORA_REMINDERS_DRY_RUN;
}

function postRequest(): Request {
  return new Request('http://localhost/api/cron/payment-reminders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
    },
  });
}

describe('POST /api/cron/payment-reminders', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listAccountsReceivable).mockResolvedValue([]);
    vi.mocked(sendPaymentReminder).mockResolvedValue({
      reminderKey: 'never-called',
      sent: false,
      skipped: false,
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  describe('guardrail 4 — CRON_SECRET authorization', () => {
    it('returns 401 and does no work when the Authorization header is missing', async () => {
      setEnv({ CRON_SECRET, MORA_REMINDERS_ENABLED: 'true', MORA_REMINDERS_DRY_RUN: 'true' });
      const contacts = buildContactsQuery();
      const reminders = buildRemindersQuery();
      mockAdmin({ whatsapp_contacts: contacts, payment_reminders: reminders });

      const res = await POST(
        new Request('http://localhost/api/cron/payment-reminders', { method: 'POST' })
      );

      expect(res.status).toBe(401);
      expect(listAccountsReceivable).not.toHaveBeenCalled();
      expect(sendPaymentReminder).not.toHaveBeenCalled();
      expect(reminders._inserts).toHaveLength(0);
      expect(getSupabaseAdmin).not.toHaveBeenCalled();
    });

    it('returns 401 and does no work when the Authorization header carries the wrong secret', async () => {
      setEnv({ CRON_SECRET, MORA_REMINDERS_ENABLED: 'true', MORA_REMINDERS_DRY_RUN: 'true' });
      const contacts = buildContactsQuery();
      const reminders = buildRemindersQuery();
      mockAdmin({ whatsapp_contacts: contacts, payment_reminders: reminders });

      const res = await POST(
        new Request('http://localhost/api/cron/payment-reminders', {
          method: 'POST',
          headers: { Authorization: 'Bearer wrong-secret' },
        })
      );

      expect(res.status).toBe(401);
      expect(listAccountsReceivable).not.toHaveBeenCalled();
      expect(sendPaymentReminder).not.toHaveBeenCalled();
      expect(reminders._inserts).toHaveLength(0);
    });

    it('returns 401 and does no work when CRON_SECRET is not configured', async () => {
      setEnv({ MORA_REMINDERS_ENABLED: 'true', MORA_REMINDERS_DRY_RUN: 'true' });
      const contacts = buildContactsQuery();
      const reminders = buildRemindersQuery();
      mockAdmin({ whatsapp_contacts: contacts, payment_reminders: reminders });

      const res = await POST(
        new Request('http://localhost/api/cron/payment-reminders', {
          method: 'POST',
          headers: { Authorization: `Bearer ${CRON_SECRET}` },
        })
      );

      expect(res.status).toBe(401);
      expect(listAccountsReceivable).not.toHaveBeenCalled();
      expect(sendPaymentReminder).not.toHaveBeenCalled();
      expect(reminders._inserts).toHaveLength(0);
    });

    it('rejects non-Bearer schemes (e.g. Basic) even when the secret matches', async () => {
      setEnv({ CRON_SECRET, MORA_REMINDERS_ENABLED: 'true', MORA_REMINDERS_DRY_RUN: 'true' });

      const res = await POST(
        new Request('http://localhost/api/cron/payment-reminders', {
          method: 'POST',
          headers: { Authorization: `Basic ${CRON_SECRET}` },
        })
      );

      expect(res.status).toBe(401);
      expect(listAccountsReceivable).not.toHaveBeenCalled();
    });
  });

  describe('MORA_REMINDERS_ENABLED flag', () => {
    it('returns 200 {skipped:true} and does no work when MORA_REMINDERS_ENABLED is missing/falsy', async () => {
      setEnv({ CRON_SECRET, MORA_REMINDERS_DRY_RUN: 'true' });
      // Note: MORA_REMINDERS_ENABLED intentionally not set.

      const res = await POST(postRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ skipped: true });
      expect(listAccountsReceivable).not.toHaveBeenCalled();
      expect(sendPaymentReminder).not.toHaveBeenCalled();
      expect(getSupabaseAdmin).not.toHaveBeenCalled();
    });

    it('treats MORA_REMINDERS_ENABLED=false as disabled', async () => {
      setEnv({ CRON_SECRET, MORA_REMINDERS_ENABLED: 'false', MORA_REMINDERS_DRY_RUN: 'true' });

      const res = await POST(postRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ skipped: true });
      expect(listAccountsReceivable).not.toHaveBeenCalled();
      expect(sendPaymentReminder).not.toHaveBeenCalled();
    });

    it('treats MORA_REMINDERS_ENABLED=0 as disabled', async () => {
      setEnv({ CRON_SECRET, MORA_REMINDERS_ENABLED: '0', MORA_REMINDERS_DRY_RUN: 'true' });

      const res = await POST(postRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ skipped: true });
      expect(listAccountsReceivable).not.toHaveBeenCalled();
    });
  });

  describe('enabled + dry-run path', () => {
    it('returns 200 {sent:0, skipped, dryRun:true} and persists dry-run rows when MORA_REMINDERS_DRY_RUN is unset (default true)', async () => {
      setEnv({ CRON_SECRET, MORA_REMINDERS_ENABLED: 'true' });
      // Note: MORA_REMINDERS_DRY_RUN intentionally not set — defaults to true.

      vi.mocked(listAccountsReceivable).mockResolvedValue([
        accountsRow({
          pastDuePlans: [pastDuePlanRow()],
        }),
      ]);

      const contacts = buildContactsQuery();
      contacts._result = {
        data: [
          {
            id: 'contact-1',
            phone_e164: '+5215512345678',
            opt_in_status: 'opted_in',
          },
        ],
        error: null,
      };
      const reminders = buildRemindersQuery();
      mockAdmin({ whatsapp_contacts: contacts, payment_reminders: reminders });

      const res = await POST(postRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.dryRun).toBe(true);
      expect(body.sent).toBe(0);
      expect(typeof body.skipped).toBe('number');
      expect(sendPaymentReminder).not.toHaveBeenCalled();
      expect(reminders._inserts).toHaveLength(1);
      const inserted = reminders._inserts[0];
      expect(inserted).toMatchObject({
        patient_id: PATIENT_ID,
        treatment_plan_id: PLAN_ID,
        template_name: 'recordatorio_pago',
        status: 'scheduled',
        dry_run: true,
        balance_at_send: 1200,
      });
      expect(inserted.reminder_key).toMatch(
        new RegExp(`^patient:${PATIENT_ID}:plan:${PLAN_ID}:\\d{4}-W\\d{2}$`)
      );
    });

    it('returns 200 {sent:0, skipped, dryRun:true} when MORA_REMINDERS_DRY_RUN=true is set explicitly', async () => {
      setEnv({
        CRON_SECRET,
        MORA_REMINDERS_ENABLED: 'true',
        MORA_REMINDERS_DRY_RUN: 'true',
      });

      vi.mocked(listAccountsReceivable).mockResolvedValue([
        accountsRow({
          pastDuePlans: [pastDuePlanRow({ balance: 800, daysPastDue: 45 })],
        }),
      ]);

      const contacts = buildContactsQuery();
      contacts._result = {
        data: [
          {
            id: 'contact-1',
            phone_e164: '+5215512345678',
            opt_in_status: 'opted_in',
          },
        ],
        error: null,
      };
      const reminders = buildRemindersQuery();
      mockAdmin({ whatsapp_contacts: contacts, payment_reminders: reminders });

      const res = await POST(postRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.dryRun).toBe(true);
      expect(body.sent).toBe(0);
      expect(sendPaymentReminder).not.toHaveBeenCalled();
      expect(reminders._inserts).toHaveLength(1);
      expect(reminders._inserts[0]).toMatchObject({
        status: 'scheduled',
        dry_run: true,
        balance_at_send: 800,
      });
    });

    it('returns 200 {sent:0, skipped, dryRun:false} and calls sendPaymentReminder when MORA_REMINDERS_DRY_RUN=false', async () => {
      setEnv({
        CRON_SECRET,
        MORA_REMINDERS_ENABLED: 'true',
        MORA_REMINDERS_DRY_RUN: 'false',
      });

      vi.mocked(listAccountsReceivable).mockResolvedValue([
        accountsRow({
          pastDuePlans: [pastDuePlanRow()],
        }),
      ]);
      vi.mocked(sendPaymentReminder).mockResolvedValue({
        reminderKey: `patient:${PATIENT_ID}:plan:${PLAN_ID}:2026-W39`,
        sent: true,
        skipped: false,
        providerMessageId: 'wamid.cron-1',
      });

      const contacts = buildContactsQuery();
      contacts._result = {
        data: [
          {
            id: 'contact-1',
            phone_e164: '+5215512345678',
            opt_in_status: 'opted_in',
          },
        ],
        error: null,
      };
      const reminders = buildRemindersQuery();
      mockAdmin({ whatsapp_contacts: contacts, payment_reminders: reminders });

      const res = await POST(postRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.dryRun).toBe(false);
      expect(body.sent).toBe(1);
      expect(sendPaymentReminder).toHaveBeenCalledTimes(1);
      expect(sendPaymentReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: PATIENT_ID,
          treatmentPlanId: PLAN_ID,
          patientPhoneE164: '+5215512345678',
          patientName: 'María López',
          balance: 1200,
          daysPastDue: 30,
          dryRun: false,
        })
      );
    });

    it('excludes patients whose contact has opted_out (no reminder row, no send)', async () => {
      setEnv({
        CRON_SECRET,
        MORA_REMINDERS_ENABLED: 'true',
        MORA_REMINDERS_DRY_RUN: 'true',
      });

      vi.mocked(listAccountsReceivable).mockResolvedValue([
        accountsRow({
          pastDuePlans: [pastDuePlanRow()],
        }),
      ]);

      const contacts = buildContactsQuery();
      contacts._result = {
        data: [
          {
            id: 'contact-1',
            phone_e164: '+5215512345678',
            opt_in_status: 'opted_out',
          },
        ],
        error: null,
      };
      const reminders = buildRemindersQuery();
      mockAdmin({ whatsapp_contacts: contacts, payment_reminders: reminders });

      const res = await POST(postRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.dryRun).toBe(true);
      expect(body.sent).toBe(0);
      expect(sendPaymentReminder).not.toHaveBeenCalled();
      expect(reminders._inserts).toHaveLength(0);
    });

    it('counts already-existing reminder_keys as skipped (no new rows, no sends)', async () => {
      setEnv({
        CRON_SECRET,
        MORA_REMINDERS_ENABLED: 'true',
        MORA_REMINDERS_DRY_RUN: 'true',
      });

      vi.mocked(listAccountsReceivable).mockResolvedValue([
        accountsRow({
          pastDuePlans: [pastDuePlanRow()],
        }),
      ]);
      vi.mocked(sendPaymentReminder).mockResolvedValue({
        reminderKey: `patient:${PATIENT_ID}:plan:${PLAN_ID}:2026-W39`,
        sent: false,
        skipped: true,
      });

      const contacts = buildContactsQuery();
      contacts._result = {
        data: [
          {
            id: 'contact-1',
            phone_e164: '+5215512345678',
            opt_in_status: 'opted_in',
          },
        ],
        error: null,
      };
      const reminders = buildRemindersQuery();
      mockAdmin({ whatsapp_contacts: contacts, payment_reminders: reminders });

      const res = await POST(postRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.dryRun).toBe(true);
      expect(body.sent).toBe(0);
      expect(body.skipped).toBe(1);
    });
  });
});
