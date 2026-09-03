import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { listProviders, listServices } from '../catalog';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

describe('catalog', () => {
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  describe('listServices', () => {
    it('returns mapped services', async () => {
      mockSelect.mockReturnValue({
        data: [
          { id: 'svc-1', name: 'Consulta', duration_minutes: 30 },
          { id: 'svc-2', name: 'Limpieza', duration_minutes: 60 },
        ],
        error: null,
      });

      const services = await listServices();

      expect(getSupabaseAdmin).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith('services');
      expect(mockSelect).toHaveBeenCalledWith('id, name, duration_minutes');
      expect(services).toEqual([
        { id: 'svc-1', name: 'Consulta', durationMinutes: 30 },
        { id: 'svc-2', name: 'Limpieza', durationMinutes: 60 },
      ]);
    });

    it('throws when the query fails', async () => {
      mockSelect.mockReturnValue({
        data: null,
        error: { message: 'connection lost' },
      });

      await expect(listServices()).rejects.toThrow('connection lost');
    });

    it('returns an empty array when no services exist', async () => {
      mockSelect.mockReturnValue({ data: [], error: null });

      const services = await listServices();

      expect(services).toEqual([]);
    });
  });

  describe('listProviders', () => {
    it('returns mapped providers', async () => {
      mockSelect.mockReturnValue({
        data: [
          { id: 'pro-1', name: 'Dra. Ana López' },
          { id: 'pro-2', name: 'Dr. Carlos Ruiz' },
        ],
        error: null,
      });

      const providers = await listProviders();

      expect(mockFrom).toHaveBeenCalledWith('providers');
      expect(mockSelect).toHaveBeenCalledWith('id, name');
      expect(providers).toEqual([
        { id: 'pro-1', name: 'Dra. Ana López' },
        { id: 'pro-2', name: 'Dr. Carlos Ruiz' },
      ]);
    });

    it('throws when the query fails', async () => {
      mockSelect.mockReturnValue({
        data: null,
        error: { message: 'timeout' },
      });

      await expect(listProviders()).rejects.toThrow('timeout');
    });
  });
});
