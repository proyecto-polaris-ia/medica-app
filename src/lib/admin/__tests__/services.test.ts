import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  createService,
  deleteService,
  listServices,
  updateService,
} from '../services';
import { ValidationError } from '../validate';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('services service', () => {
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

  it('lists mapped services', async () => {
    mockOrder.mockResolvedValue({
      data: [{ id: SERVICE_ID, name: 'Consulta', duration_minutes: 30, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' }],
      error: null,
    });

    const services = await listServices();

    expect(services).toEqual([
      { id: SERVICE_ID, name: 'Consulta', durationMinutes: 30, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z' },
    ]);
  });

  it('creates a service', async () => {
    mockSingle.mockResolvedValue({
      data: { id: SERVICE_ID, name: 'Consulta', duration_minutes: 30, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
      error: null,
    });

    const service = await createService({ name: 'Consulta', durationMinutes: 30 });

    expect(mockInsert).toHaveBeenCalledWith({ name: 'Consulta', duration_minutes: 30 });
    expect(service.durationMinutes).toBe(30);
  });

  it('rejects a non-positive duration', async () => {
    await expect(createService({ name: 'Consulta', durationMinutes: 0 })).rejects.toThrow(ValidationError);
    await expect(createService({ name: 'Consulta', durationMinutes: -10 })).rejects.toThrow(ValidationError);
  });

  it('updates a service', async () => {
    mockSingle.mockResolvedValue({
      data: { id: SERVICE_ID, name: 'Limpieza', duration_minutes: 60, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-02T10:00:00Z' },
      error: null,
    });

    const service = await updateService(SERVICE_ID, { name: 'Limpieza', durationMinutes: 60 });

    expect(mockUpdate).toHaveBeenCalledWith({ name: 'Limpieza', duration_minutes: 60 });
    expect(service.durationMinutes).toBe(60);
  });

  it('deletes a service', async () => {
    mockEq.mockResolvedValue({ error: null });

    await deleteService(SERVICE_ID);

    expect(mockEq).toHaveBeenCalledWith('id', SERVICE_ID);
  });
});
