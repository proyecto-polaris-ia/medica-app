import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '../../supabase/server';
import { resolvePatient, resolvePatientById } from '../patient-resolution';

vi.mock('../../supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

function buildQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

describe('resolvePatient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns an existing patient by phone', async () => {
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue(
        buildQuery({
          data: { id: 'pat-1', full_name: 'María García' },
          error: null,
        })
      ),
    });

    const patient = await resolvePatient({
      phone: '+5215512345678',
      fullName: 'María García',
    });

    expect(patient).toEqual({ id: 'pat-1', full_name: 'María García' });
  });

  it('creates a patient when no existing phone is found', async () => {
    const query = buildQuery({ data: null, error: null });
    query.single = vi.fn().mockResolvedValue({
      data: { id: 'pat-new', full_name: 'Patient +5215512345678' },
      error: null,
    });

    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    });

    const patient = await resolvePatient({ phone: '+5215512345678' });

    expect(patient.id).toBe('pat-new');
  });
});

describe('resolvePatientById', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the patient when found', async () => {
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue(
        buildQuery({
          data: { id: 'pat-1', full_name: 'María García' },
          error: null,
        })
      ),
    });

    const patient = await resolvePatientById('pat-1');

    expect(patient).toEqual({ id: 'pat-1', full_name: 'María García' });
  });

  it('throws NotFoundError when the patient does not exist', async () => {
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue(
        buildQuery({ data: null, error: null })
      ),
    });

    await expect(resolvePatientById('missing-id')).rejects.toThrow('Patient not found');
  });
});
