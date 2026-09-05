import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { bookAppointment } from '../booking';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440001';
const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440002';
const START_AT = new Date('2026-09-10T14:00:00.000Z');
const END_AT = new Date('2026-09-10T14:30:00.000Z');

describe('bookAppointment', () => {
  const mockInsert = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: mockInsert.mockReturnValue({ error: null }),
      }),
    });
  });

  it('books an appointment without notes', async () => {
    const result = await bookAppointment({
      patientId: PATIENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: START_AT,
      endAt: END_AT,
    });

    expect(result).toEqual({ ok: true });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null })
    );
  });

  it('trims notes before inserting', async () => {
    await bookAppointment({
      patientId: PATIENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: START_AT,
      endAt: END_AT,
      notes: '  Prefiere mañana  ',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Prefiere mañana' })
    );
  });

  it('stores null for whitespace-only notes', async () => {
    await bookAppointment({
      patientId: PATIENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: START_AT,
      endAt: END_AT,
      notes: '   ',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null })
    );
  });
});
