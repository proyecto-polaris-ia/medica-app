import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/wcc-client', () => ({
  createWccClient: vi.fn(),
  isSupabaseConfigured: vi.fn(() => true),
}));

import { createWccClient } from '@/lib/wcc-client';
import { getWccPaymentsQueue, getWccRemindersQueue } from './wcc-payments';

function query(data: Record<string, unknown>[], count = data.length) {
  const value = Promise.resolve({ data, error: null, count });
  return Object.assign(value, {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  });
}

function makeWccClient(tableQueues: Record<string, ReturnType<typeof query>[]>) {
  vi.mocked(createWccClient).mockResolvedValue({
    from: vi.fn((table: string) => {
      const queue = tableQueues[table];
      if (!queue || queue.length === 0) {
        throw new Error(`Unexpected table: ${table}`);
      }
      return queue.shift()!;
    }),
  } as never);
}

describe('getWccPaymentsQueue', () => {
  it('joins payment_intents with patient identity and lists DB-derived amounts', async () => {
    makeWccClient({
      payment_intents: [
        query(
          [
            {
              id: 'intent-1',
              patient_id: 'patient-1',
              amount: '1200.00',
              method: 'cash',
              status: 'pending',
              created_at: '2026-09-30T12:00:00Z',
              updated_at: '2026-09-30T12:00:00Z',
            },
          ],
          1
        ),
      ],
      patients: [
        query([
          {
            id: 'patient-1',
            full_name: 'María López',
            phone_e164: '+5215512345678',
          },
        ]),
      ],
    });

    const result = await getWccPaymentsQueue({ page: 1 });

    expect(result.isSupabaseConfigured).toBe(true);
    expect(result.isConfiguredButUnavailable).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0]).toMatchObject({
      id: 'intent-1',
      patientId: 'patient-1',
      patientName: 'María López',
      patientPhoneE164: '+5215512345678',
      amount: 1200,
      method: 'cash',
      status: 'pending',
    });
  });

  it('degrades to empty when Supabase is not configured', async () => {
    vi.mocked(createWccClient).mockReset();
    // Reload the mocked module so isSupabaseConfigured returns false.
    const wcc = await import('@/lib/wcc-client');
    vi.mocked(wcc.isSupabaseConfigured).mockReturnValueOnce(false);
    const result = await getWccPaymentsQueue({});
    expect(result.isSupabaseConfigured).toBe(false);
    expect(result.isConfiguredButUnavailable).toBe(false);
    expect(result.intents).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('flags the queue as configured-but-unavailable when an upstream query throws', async () => {
    vi.mocked(createWccClient).mockReset();
    vi.mocked(createWccClient).mockRejectedValueOnce(new Error('connection refused'));
    const result = await getWccPaymentsQueue({});
    expect(result.isSupabaseConfigured).toBe(true);
    expect(result.isConfiguredButUnavailable).toBe(true);
    expect(result.intents).toEqual([]);
  });
});

describe('getWccRemindersQueue', () => {
  it('lists payment_reminders with patient identity, template, dry_run and sent_at', async () => {
    makeWccClient({
      payment_reminders: [
        query(
          [
            {
              id: 'reminder-1',
              patient_id: 'patient-1',
              reminder_key: 'patient:patient-1:plan:plan-1:2026-W39',
              template_name: 'recordatorio_pago',
              status: 'sent',
              dry_run: false,
              balance_at_send: '1200.00',
              sent_at: '2026-09-30T12:00:00Z',
              created_at: '2026-09-30T12:00:00Z',
              updated_at: '2026-09-30T12:00:00Z',
            },
            {
              id: 'reminder-2',
              patient_id: 'patient-1',
              reminder_key: 'patient:patient-1:plan:plan-1:2026-W40',
              template_name: 'recordatorio_pago',
              status: 'scheduled',
              dry_run: true,
              balance_at_send: null,
              sent_at: null,
              created_at: '2026-09-30T12:00:00Z',
              updated_at: '2026-09-30T12:00:00Z',
            },
          ],
          2
        ),
      ],
      patients: [
        query([
          {
            id: 'patient-1',
            full_name: 'María López',
            phone_e164: '+5215512345678',
          },
        ]),
      ],
    });

    const result = await getWccRemindersQueue({});

    expect(result.isSupabaseConfigured).toBe(true);
    expect(result.isConfiguredButUnavailable).toBe(false);
    expect(result.totalCount).toBe(2);
    expect(result.reminders).toHaveLength(2);
    expect(result.reminders[0]).toMatchObject({
      id: 'reminder-1',
      patientId: 'patient-1',
      patientName: 'María López',
      templateName: 'recordatorio_pago',
      status: 'sent',
      dryRun: false,
      balanceAtSend: 1200,
      sentAt: '2026-09-30T12:00:00Z',
    });
    expect(result.reminders[1]).toMatchObject({
      id: 'reminder-2',
      dryRun: true,
      sentAt: null,
      balanceAtSend: null,
      status: 'scheduled',
    });
  });

  it('degrades to empty when Supabase is not configured', async () => {
    vi.mocked(createWccClient).mockReset();
    const wcc = await import('@/lib/wcc-client');
    vi.mocked(wcc.isSupabaseConfigured).mockReturnValueOnce(false);
    const result = await getWccRemindersQueue({});
    expect(result.isSupabaseConfigured).toBe(false);
    expect(result.reminders).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});