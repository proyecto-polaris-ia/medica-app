import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  createProvider,
  deleteProvider,
  getProvider,
  listProviders,
  updateProvider,
} from '../providers';
import { ValidationError } from '../validate';
import { NotFoundError } from '../errors';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('providers service', () => {
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

  it('lists mapped providers', async () => {
    mockOrder.mockResolvedValue({
      data: [{ id: PROVIDER_ID, name: 'Dra. Ana', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' }],
      error: null,
    });

    const providers = await listProviders();

    expect(providers).toEqual([
      { id: PROVIDER_ID, name: 'Dra. Ana', createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z' },
    ]);
  });

  it('creates a provider', async () => {
    mockSingle.mockResolvedValue({
      data: { id: PROVIDER_ID, name: 'Dra. Ana', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
      error: null,
    });

    const provider = await createProvider({ name: 'Dra. Ana' });

    expect(mockInsert).toHaveBeenCalledWith({ name: 'Dra. Ana' });
    expect(provider.name).toBe('Dra. Ana');
  });

  it('rejects an empty provider name', async () => {
    await expect(createProvider({ name: '   ' })).rejects.toThrow(ValidationError);
  });

  it('updates a provider', async () => {
    mockSingle.mockResolvedValue({
      data: { id: PROVIDER_ID, name: 'Dra. Ana López', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-02T10:00:00Z' },
      error: null,
    });

    const provider = await updateProvider(PROVIDER_ID, { name: 'Dra. Ana López' });

    expect(mockUpdate).toHaveBeenCalledWith({ name: 'Dra. Ana López' });
    expect(provider.name).toBe('Dra. Ana López');
  });

  it('deletes a provider', async () => {
    mockEq.mockResolvedValue({ error: null });

    await deleteProvider(PROVIDER_ID);

    expect(mockEq).toHaveBeenCalledWith('id', PROVIDER_ID);
  });

  describe('getProvider', () => {
    it('returns a provider by id', async () => {
      mockSingle.mockResolvedValue({
        data: { id: PROVIDER_ID, name: 'Dra. Ana', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
        error: null,
      });

      const provider = await getProvider(PROVIDER_ID);

      expect(provider).toEqual({
        id: PROVIDER_ID,
        name: 'Dra. Ana',
        createdAt: '2026-09-01T10:00:00Z',
        updatedAt: '2026-09-01T10:00:00Z',
      });
    });

    it('throws NotFoundError when provider does not exist', async () => {
      mockSingle.mockResolvedValue({ data: null, error: null });

      await expect(getProvider(PROVIDER_ID)).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError for a malformed id', async () => {
      await expect(getProvider('not-a-uuid')).rejects.toThrow(ValidationError);
    });
  });
});
