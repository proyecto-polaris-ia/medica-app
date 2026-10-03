import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  currentRoundDate,
  listDailyFollowUpCases,
  loadFollowUpContactsForRound,
  markFollowUpContact,
} from '../follow-up';
import type { FollowUpContactStatus } from '../types';
import { ValidationError } from '../../validate';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const P1 = '550e8400-e29b-41d4-a716-446655440000';
const P2 = '550e8400-e29b-41d4-a716-446655440001';
const P3 = '550e8400-e29b-41d4-a716-446655440002';
const USER_ID = '990e8400-e29b-41d4-a716-446655440000';
const NOW = new Date('2026-10-01T12:00:00.000Z');
const ROUND_DATE = '2026-10-01';
const YESTERDAY = '2026-09-30';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type QueryResult = {
  data: Record<string, unknown>[] | null;
  error: { message?: string } | null;
};

type Chain = {
  select: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise<unknown>;
};

function buildQuery(result: QueryResult): Chain {
  const chain = {} as Chain;
  chain.select = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.upsert = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.then = (onFulfilled, onRejected) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

function mockClient(tables: Record<string, Chain>) {
  const from = vi.fn((table: string) => {
    const chain = tables[table];
    if (!chain) {
      throw new Error(`Unexpected table query: ${table}`);
    }
    return chain;
  });
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from };
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appt-1',
    patient_id: P1,
    start_at: daysAgo(20),
    status: 'no_show',
    ...overrides,
  };
}

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    patient_id: P1,
    name: 'Ortodoncia',
    status: 'in_progress',
    created_at: daysAgo(120),
    updated_at: daysAgo(120),
    ...overrides,
  };
}

function visitRow(overrides: Record<string, unknown> = {}) {
  return { patient_id: P1, created_at: daysAgo(60), ...overrides };
}

function patientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: P1,
    full_name: 'Ana López',
    phone_e164: '+5215511111111',
    ...overrides,
  };
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    patient_id: P1,
    round_date: ROUND_DATE,
    status: 'contacted',
    contacted_at: NOW.toISOString(),
    dismissed_at: null,
    note: null,
    created_by: USER_ID,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

describe('follow-up data layer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('currentRoundDate', () => {
    it('returns the clinic day key for the injected instant', () => {
      expect(currentRoundDate(new Date('2026-10-01T12:00:00.000Z'))).toBe(
        ROUND_DATE
      );
    });

    it('crosses UTC midnight into the previous clinic day', () => {
      // 2026-10-03T05:30Z is 2026-10-02 23:30 in America/Mexico_City.
      expect(currentRoundDate(new Date('2026-10-03T05:30:00.000Z'))).toBe(
        '2026-10-02'
      );
    });
  });

  describe('listDailyFollowUpCases', () => {
    function buildFixture(contactRows: Record<string, unknown>[]) {
      return {
        appointments: buildQuery({
          data: [
            appointmentRow({
              id: 'appt-p1',
              patient_id: P1,
              start_at: daysAgo(20),
              status: 'no_show',
            }),
            appointmentRow({
              id: 'appt-p2',
              patient_id: P2,
              start_at: daysAgo(240),
              status: 'attended',
            }),
          ],
          error: null,
        }),
        treatment_plans: buildQuery({
          data: [
            planRow({
              id: 'plan-p3',
              patient_id: P3,
              status: 'in_progress',
              created_at: daysAgo(120),
              updated_at: daysAgo(120),
            }),
          ],
          error: null,
        }),
        clinical_visits: buildQuery({
          data: [visitRow({ patient_id: P3, created_at: daysAgo(60) })],
          error: null,
        }),
        follow_up_contacts: buildQuery({ data: contactRows, error: null }),
        patients: buildQuery({
          data: [
            patientRow({
              id: P1,
              full_name: 'Ana López',
              phone_e164: '+5215511111111',
            }),
            patientRow({
              id: P3,
              full_name: 'Carlos Ruiz',
              phone_e164: null,
            }),
          ],
          error: null,
        }),
      };
    }

    it('reads bulk with explicit columns and filters contacts by the current round', async () => {
      const tables = buildFixture([
        contactRow({
          id: 'contact-p2',
          patient_id: P2,
          round_date: ROUND_DATE,
          status: 'contacted',
        }),
        contactRow({
          id: 'contact-p1',
          patient_id: P1,
          round_date: YESTERDAY,
          status: 'dismissed',
        }),
      ]);
      const { from } = mockClient(tables);

      const cases = await listDailyFollowUpCases({ now: NOW });

      // Constant number of queries: appointments, plans, visits, contacts, patients.
      expect(from).toHaveBeenCalledTimes(5);
      expect(tables.follow_up_contacts.eq).toHaveBeenCalledWith(
        'round_date',
        ROUND_DATE
      );
      expect(tables.treatment_plans.in).toHaveBeenCalledWith('status', [
        'in_progress',
        'presented',
      ]);
      expect(tables.clinical_visits.in).toHaveBeenCalledWith('patient_id', [
        P3,
      ]);
      expect(tables.patients.in).toHaveBeenCalledWith('id', [P1, P3]);

      const selectArgs = Object.values(tables).map(
        (chain) => chain.select.mock.calls[0]?.[0]
      );
      expect(selectArgs.every((arg) => typeof arg === 'string')).toBe(true);
      expect(selectArgs).not.toContain('*');

      // p2 was contacted in the current round; p1's dismissal belongs to yesterday.
      expect(cases.map((entry) => entry.patientId)).toEqual([P1, P3]);
      expect(cases[0].reason).toBe('no_show');
      expect(cases[1].reason).toBe('treatment_in_progress');
      expect(cases[0].patientName).toBe('Ana López');
      expect(cases[0].patientPhoneE164).toBe('+5215511111111');
      expect(cases[1].patientPhoneE164).toBeNull();
      expect(cases.every((entry) => entry.roundDate === ROUND_DATE)).toBe(true);
    });

    it('excludes a patient dismissed in the current round', async () => {
      const tables = buildFixture([
        contactRow({
          id: 'contact-p1',
          patient_id: P1,
          round_date: ROUND_DATE,
          status: 'dismissed',
        }),
      ]);
      mockClient(tables);

      const cases = await listDailyFollowUpCases({ now: NOW });

      // P1 is dismissed today; P2 (inactive) and P3 (stalled) remain.
      expect(cases.map((entry) => entry.patientId)).toEqual([P3, P2]);
    });

    it('returns an empty list without throwing when there are no rows', async () => {
      mockClient({
        appointments: buildQuery({ data: [], error: null }),
        treatment_plans: buildQuery({ data: [], error: null }),
        follow_up_contacts: buildQuery({ data: [], error: null }),
      });

      await expect(listDailyFollowUpCases({ now: NOW })).resolves.toEqual([]);
    });

    it('drops a completed plan and a no-show outside the window', async () => {
      mockClient({
        appointments: buildQuery({
          data: [
            appointmentRow({
              id: 'appt-old',
              patient_id: P1,
              start_at: daysAgo(120),
              status: 'no_show',
            }),
          ],
          error: null,
        }),
        treatment_plans: buildQuery({
          data: [
            planRow({
              id: 'plan-done',
              patient_id: P2,
              status: 'completed',
              created_at: daysAgo(300),
              updated_at: daysAgo(300),
            }),
          ],
          error: null,
        }),
        follow_up_contacts: buildQuery({ data: [], error: null }),
      });

      await expect(listDailyFollowUpCases({ now: NOW })).resolves.toEqual([]);
    });
  });

  describe('loadFollowUpContactsForRound', () => {
    it('filters by round date and maps rows to camelCase', async () => {
      const tables = {
        follow_up_contacts: buildQuery({
          data: [contactRow()],
          error: null,
        }),
      };
      mockClient(tables);

      const contacts = await loadFollowUpContactsForRound(ROUND_DATE);

      expect(tables.follow_up_contacts.eq).toHaveBeenCalledWith(
        'round_date',
        ROUND_DATE
      );
      expect(contacts).toHaveLength(1);
      expect(contacts[0]).toEqual({
        id: 'contact-1',
        patientId: P1,
        roundDate: ROUND_DATE,
        status: 'contacted',
        contactedAt: NOW.toISOString(),
        dismissedAt: null,
        note: null,
        createdBy: USER_ID,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
    });
  });

  describe('markFollowUpContact', () => {
    it('upserts by patient and round, persisting the injected now', async () => {
      const chain = buildQuery({ data: [], error: null });
      chain.single = vi.fn(() =>
        Promise.resolve({ data: contactRow(), error: null })
      );
      mockClient({ follow_up_contacts: chain });

      const contact = await markFollowUpContact({
        patientId: P1,
        status: 'contacted',
        userId: USER_ID,
        now: NOW,
      });

      expect(chain.upsert).toHaveBeenCalledWith(
        {
          patient_id: P1,
          round_date: ROUND_DATE,
          status: 'contacted',
          contacted_at: NOW.toISOString(),
          dismissed_at: null,
          note: null,
          created_by: USER_ID,
        },
        { onConflict: 'patient_id,round_date' }
      );
      expect(contact.status).toBe('contacted');
      expect(contact.patientId).toBe(P1);
    });

    it('persists dismissed_at and the optional note when dismissing', async () => {
      const chain = buildQuery({ data: [], error: null });
      chain.single = vi.fn(() =>
        Promise.resolve({
          data: contactRow({
            status: 'dismissed',
            contacted_at: null,
            dismissed_at: NOW.toISOString(),
            note: 'Ya tiene cita',
          }),
          error: null,
        })
      );
      mockClient({ follow_up_contacts: chain });

      const contact = await markFollowUpContact({
        patientId: P2,
        status: 'dismissed',
        note: 'Ya tiene cita',
        userId: USER_ID,
        now: NOW,
      });

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'dismissed',
          contacted_at: null,
          dismissed_at: NOW.toISOString(),
          note: 'Ya tiene cita',
        }),
        { onConflict: 'patient_id,round_date' }
      );
      expect(contact.dismissedAt).toBe(NOW.toISOString());
    });

    it('rejects an invalid status and an invalid patient id', async () => {
      const chain = buildQuery({ data: [], error: null });
      mockClient({ follow_up_contacts: chain });

      await expect(
        markFollowUpContact({
          patientId: P1,
          status: 'nope' as FollowUpContactStatus,
          userId: USER_ID,
          now: NOW,
        })
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        markFollowUpContact({
          patientId: 'bad-id',
          status: 'contacted',
          userId: USER_ID,
          now: NOW,
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
