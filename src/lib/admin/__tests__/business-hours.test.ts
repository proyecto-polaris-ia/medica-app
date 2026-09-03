import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  createBusinessHour,
  deleteBusinessHour,
  listBusinessHours,
  updateBusinessHour,
} from '../business-hours';
import { ValidationError } from '../validate';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const HOUR_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('business-hours service', () => {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockOrder = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();

  function buildQuery() {
    return {
      select: mockSelect.mockReturnThis(),
      insert: mockInsert.mockReturnThis(),
      update: mockUpdate.mockReturnThis(),
      delete: mockDelete.mockReturnThis(),
      order: mockOrder.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      single: mockSingle,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue(buildQuery()),
    });
  });

  it('lists mapped business hours', async () => {
    mockOrder.mockResolvedValue({
      data: [{ id: HOUR_ID, provider_id: PROVIDER_ID, day_of_week: 1, start_time: '09:00', end_time: '17:00', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' }],
      error: null,
    });

    const hours = await listBusinessHours();

    expect(hours).toEqual([
      { id: HOUR_ID, providerId: PROVIDER_ID, dayOfWeek: 1, startTime: '09:00', endTime: '17:00', createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z' },
    ]);
  });

  it('creates a business hour', async () => {
    mockSingle.mockResolvedValue({
      data: { id: HOUR_ID, provider_id: PROVIDER_ID, day_of_week: 1, start_time: '09:00', end_time: '17:00', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
      error: null,
    });

    const hour = await createBusinessHour({ providerId: PROVIDER_ID, dayOfWeek: 1, startTime: '09:00', endTime: '17:00' });

    expect(mockInsert).toHaveBeenCalledWith({ provider_id: PROVIDER_ID, day_of_week: 1, start_time: '09:00', end_time: '17:00' });
    expect(hour.dayOfWeek).toBe(1);
  });

  it('rejects an invalid day of week', async () => {
    await expect(createBusinessHour({ providerId: PROVIDER_ID, dayOfWeek: 7, startTime: '09:00', endTime: '17:00' })).rejects.toThrow(ValidationError);
  });

  it('rejects end time before start time', async () => {
    await expect(createBusinessHour({ providerId: PROVIDER_ID, dayOfWeek: 1, startTime: '17:00', endTime: '09:00' })).rejects.toThrow(ValidationError);
  });

  it('updates a business hour', async () => {
    mockSingle.mockResolvedValue({
      data: { id: HOUR_ID, provider_id: PROVIDER_ID, day_of_week: 2, start_time: '10:00', end_time: '18:00', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-02T10:00:00Z' },
      error: null,
    });

    const hour = await updateBusinessHour(HOUR_ID, { providerId: PROVIDER_ID, dayOfWeek: 2, startTime: '10:00', endTime: '18:00' });

    expect(mockUpdate).toHaveBeenCalledWith({ provider_id: PROVIDER_ID, day_of_week: 2, start_time: '10:00', end_time: '18:00' });
    expect(hour.dayOfWeek).toBe(2);
  });

  it('deletes a business hour', async () => {
    mockEq.mockResolvedValue({ error: null });

    await deleteBusinessHour(HOUR_ID);

    expect(mockEq).toHaveBeenCalledWith('id', HOUR_ID);
  });
});
