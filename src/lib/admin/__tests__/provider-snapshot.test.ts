import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProviderSnapshot } from '../provider-snapshot';
import { NotFoundError } from '../errors';
import { ValidationError } from '../validate';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { getSupabaseAdmin } from '@/lib/supabase/server';

const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440000';
const PATIENT_A = '550e8400-e29b-41d4-a716-446655440001';
const PATIENT_B = '550e8400-e29b-41d4-a716-446655440002';
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440003';

const TODAY_START = '2026-09-03T06:00:00.000Z';
const RECENT_START = '2026-08-04T06:00:00.000Z';

function buildScenario() {
  const provider = {
    id: PROVIDER_ID,
    name: 'Dra. García',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  };

  const upcoming = [
    {
      id: '660e8400-e29b-41d4-a716-446655440000',
      patient_id: PATIENT_A,
      service_id: SERVICE_ID,
      provider_id: PROVIDER_ID,
      start_at: '2026-09-05T14:00:00.000Z',
      end_at: '2026-09-05T14:30:00.000Z',
      status: 'confirmed',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
      patients: { id: PATIENT_A, full_name: 'Juan Pérez' },
      services: { id: SERVICE_ID, name: 'Limpieza' },
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440001',
      patient_id: PATIENT_B,
      service_id: SERVICE_ID,
      provider_id: PROVIDER_ID,
      start_at: '2026-09-10T14:00:00.000Z',
      end_at: '2026-09-10T14:30:00.000Z',
      status: 'confirmed',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
      patients: { id: PATIENT_B, full_name: 'María López' },
      services: { id: SERVICE_ID, name: 'Limpieza' },
    },
  ];

  const today = [
    {
      id: '660e8400-e29b-41d4-a716-446655440002',
      patient_id: PATIENT_A,
      service_id: SERVICE_ID,
      provider_id: PROVIDER_ID,
      start_at: '2026-09-03T14:00:00.000Z',
      end_at: '2026-09-03T14:30:00.000Z',
      status: 'confirmed',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
      patients: { id: PATIENT_A, full_name: 'Juan Pérez' },
      services: { id: SERVICE_ID, name: 'Limpieza' },
    },
  ];

  const recent = [
    {
      id: '660e8400-e29b-41d4-a716-446655440003',
      patient_id: PATIENT_A,
      service_id: SERVICE_ID,
      provider_id: PROVIDER_ID,
      start_at: '2026-08-25T14:00:00.000Z',
      end_at: '2026-08-25T14:30:00.000Z',
      status: 'attended',
      created_at: '2026-08-25T10:00:00Z',
      updated_at: '2026-08-25T10:00:00Z',
      patients: { id: PATIENT_A, full_name: 'Juan Pérez' },
      services: { id: SERVICE_ID, name: 'Limpieza' },
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440004',
      patient_id: PATIENT_A,
      service_id: SERVICE_ID,
      provider_id: PROVIDER_ID,
      start_at: '2026-08-28T14:00:00.000Z',
      end_at: '2026-08-28T14:30:00.000Z',
      status: 'confirmed',
      created_at: '2026-08-28T10:00:00Z',
      updated_at: '2026-08-28T10:00:00Z',
      patients: { id: PATIENT_A, full_name: 'Juan Pérez' },
      services: { id: SERVICE_ID, name: 'Limpieza' },
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440005',
      patient_id: PATIENT_B,
      service_id: SERVICE_ID,
      provider_id: PROVIDER_ID,
      start_at: '2026-08-29T14:00:00.000Z',
      end_at: '2026-08-29T14:30:00.000Z',
      status: 'attended',
      created_at: '2026-08-29T10:00:00Z',
      updated_at: '2026-08-29T10:00:00Z',
      patients: { id: PATIENT_B, full_name: 'María López' },
      services: { id: SERVICE_ID, name: 'Limpieza' },
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440006',
      patient_id: PATIENT_B,
      service_id: SERVICE_ID,
      provider_id: PROVIDER_ID,
      start_at: '2026-08-30T14:00:00.000Z',
      end_at: '2026-08-30T14:30:00.000Z',
      status: 'cancelled',
      created_at: '2026-08-30T10:00:00Z',
      updated_at: '2026-08-30T10:00:00Z',
      patients: { id: PATIENT_B, full_name: 'María López' },
      services: { id: SERVICE_ID, name: 'Limpieza' },
    },
  ];

  return { provider, upcoming, today, recent };
}

function buildQuery(scenario: ReturnType<typeof buildScenario>) {
  let table = '';
  let hasGt = false;
  let hasGte = false;
  let rangeStart: string | null = null;

  const query = {
    from: vi.fn((name: string) => {
      table = name;
      return query;
    }),
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gt: vi.fn((_field: string, value: string) => {
      hasGt = true;
      rangeStart = value;
      return query;
    }),
    gte: vi.fn((_field: string, value: string) => {
      hasGte = true;
      rangeStart = value;
      return query;
    }),
    lt: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve({ data: scenario.provider, error: null })),
    then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
      let data: unknown[] = [];
      if (table === 'appointments') {
        if (hasGt) {
          data = scenario.upcoming;
        } else if (hasGte && rangeStart === TODAY_START) {
          data = scenario.today;
        } else if (hasGte && rangeStart === RECENT_START) {
          data = scenario.recent;
        }
      }
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
  };

  return query as unknown as any;
}

describe('getProviderSnapshot', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns upcoming appointments sorted ascending', async () => {
    const scenario = buildScenario();
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockImplementation(() => buildQuery(scenario));

    const snapshot = await getProviderSnapshot(PROVIDER_ID, new Date('2026-09-01T10:00:00.000Z'));

    expect(snapshot.upcoming).toHaveLength(2);
    expect(snapshot.upcoming[0].startAt).toBe('2026-09-05T14:00:00.000Z');
    expect(snapshot.upcoming[1].startAt).toBe('2026-09-10T14:00:00.000Z');
  });

  it('returns today agenda in America/Mexico_City', async () => {
    const scenario = buildScenario();
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockImplementation(() => buildQuery(scenario));

    const snapshot = await getProviderSnapshot(PROVIDER_ID, new Date('2026-09-03T20:30:00.000Z'));

    expect(snapshot.today).toHaveLength(1);
    expect(snapshot.today[0].startAt).toBe('2026-09-03T14:00:00.000Z');
  });

  it('deduplicates recent clients and counts appointments', async () => {
    const scenario = buildScenario();
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockImplementation(() => buildQuery(scenario));

    const snapshot = await getProviderSnapshot(PROVIDER_ID, new Date('2026-09-03T20:30:00.000Z'));

    expect(snapshot.recentClients).toHaveLength(2);
    const juan = snapshot.recentClients.find((c) => c.fullName === 'Juan Pérez');
    const maria = snapshot.recentClients.find((c) => c.fullName === 'María López');
    expect(juan?.count).toBe(2);
    expect(maria?.count).toBe(1);
  });

  it('throws NotFoundError when provider does not exist', async () => {
    const scenario = buildScenario();
    const query = buildQuery(scenario);
    query.single.mockResolvedValue({ data: null, error: null });
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(query);

    await expect(getProviderSnapshot(PROVIDER_ID, new Date())).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError for a malformed id', async () => {
    await expect(getProviderSnapshot('not-a-uuid', new Date())).rejects.toThrow(ValidationError);
  });
});
