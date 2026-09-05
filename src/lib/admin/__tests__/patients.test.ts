import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  createPatient,
  deletePatient,
  listPatients,
  searchPatients,
  updatePatient,
} from '../patients';
import { ValidationError } from '../validate';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('patients service', () => {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockOrder = vi.fn();
  const mockEq = vi.fn();
  const mockIlike = vi.fn();
  const mockOr = vi.fn();
  const mockSingle = vi.fn();

  function buildQuery() {
    return {
      select: mockSelect.mockReturnThis(),
      insert: mockInsert.mockReturnThis(),
      update: mockUpdate.mockReturnThis(),
      delete: mockDelete.mockReturnThis(),
      order: mockOrder.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      ilike: mockIlike.mockReturnThis(),
      or: mockOr.mockReturnThis(),
      single: mockSingle,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue(buildQuery()),
    });
  });

  describe('listPatients', () => {
    it('returns mapped patients ordered by created_at desc', async () => {
      mockOrder.mockResolvedValue({
        data: [
          {
            id: PATIENT_ID,
            full_name: 'María García',
            phone_e164: '+5215512345678',
            notes: 'Nota',
            created_at: '2026-09-01T10:00:00Z',
            updated_at: '2026-09-01T10:00:00Z',
          },
        ],
        error: null,
      });

      const patients = await listPatients();

      expect(patients).toEqual([
        {
          id: PATIENT_ID,
          fullName: 'María García',
          phoneE164: '+5215512345678',
          notes: 'Nota',
          createdAt: '2026-09-01T10:00:00Z',
          updatedAt: '2026-09-01T10:00:00Z',
        },
      ]);
    });

    it('throws when the query fails', async () => {
      mockOrder.mockResolvedValue({
        data: null,
        error: { message: 'down' },
      });
      await expect(listPatients()).rejects.toThrow('down');
    });
  });

  describe('createPatient', () => {
    it('inserts and returns a mapped patient', async () => {
      mockSingle.mockResolvedValue({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          full_name: 'Juan Pérez',
          phone_e164: '+5215587654321',
          notes: null,
          created_at: '2026-09-02T10:00:00Z',
          updated_at: '2026-09-02T10:00:00Z',
        },
        error: null,
      });

      const patient = await createPatient({
        fullName: 'Juan Pérez',
        phoneE164: '+5215587654321',
      });

      expect(mockInsert).toHaveBeenCalledWith({
        full_name: 'Juan Pérez',
        phone_e164: '+5215587654321',
        notes: undefined,
      });
      expect(patient).toEqual(
        expect.objectContaining({
          id: '550e8400-e29b-41d4-a716-446655440001',
          fullName: 'Juan Pérez',
          phoneE164: '+5215587654321',
        })
      );
    });

    it('throws ValidationError for an invalid phone', async () => {
      await expect(
        createPatient({ fullName: 'Juan', phoneE164: '5512345678' })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for an empty name', async () => {
      await expect(
        createPatient({ fullName: '   ', phoneE164: '+5215512345678' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updatePatient', () => {
    it('updates and returns the mapped patient', async () => {
      mockSingle.mockResolvedValue({
        data: {
          id: PATIENT_ID,
          full_name: 'María G.',
          phone_e164: '+5215512345678',
          notes: 'Actualizado',
          created_at: '2026-09-01T10:00:00Z',
          updated_at: '2026-09-02T10:00:00Z',
        },
        error: null,
      });

      const patient = await updatePatient(PATIENT_ID, {
        fullName: 'María G.',
        phoneE164: '+5215512345678',
        notes: 'Actualizado',
      });

      expect(mockUpdate).toHaveBeenCalledWith({
        full_name: 'María G.',
        phone_e164: '+5215512345678',
        notes: 'Actualizado',
      });
      expect(patient).toEqual(
        expect.objectContaining({
          id: PATIENT_ID,
          fullName: 'María G.',
          notes: 'Actualizado',
        })
      );
    });

    it('throws ValidationError for an invalid id', async () => {
      await expect(
        updatePatient('bad-id', {
          fullName: 'María',
          phoneE164: '+5215512345678',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deletePatient', () => {
    it('deletes the patient', async () => {
      mockEq.mockResolvedValue({ error: null });

      await deletePatient(PATIENT_ID);

      expect(mockEq).toHaveBeenCalledWith('id', PATIENT_ID);
    });

    it('throws ValidationError for an invalid id', async () => {
      await expect(deletePatient('bad-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('searchPatients', () => {
    it('returns an empty array for an empty query', async () => {
      const patients = await searchPatients('');

      expect(patients).toEqual([]);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('filters by full_name (ilike) or phone_e164 (contains)', async () => {
      mockOrder.mockResolvedValue({
        data: [
          {
            id: PATIENT_ID,
            full_name: 'María García',
            phone_e164: '+5215512345678',
            notes: null,
            created_at: '2026-09-01T10:00:00Z',
            updated_at: '2026-09-01T10:00:00Z',
          },
        ],
        error: null,
      });

      const patients = await searchPatients('maria');

      expect(mockOr).toHaveBeenCalledWith(
        'full_name.ilike.%maria%,phone_e164.ilike.%maria%'
      );
      expect(patients).toEqual([
        {
          id: PATIENT_ID,
          fullName: 'María García',
          phoneE164: '+5215512345678',
          notes: null,
          createdAt: '2026-09-01T10:00:00Z',
          updatedAt: '2026-09-01T10:00:00Z',
        },
      ]);
    });

    it('throws when the query fails', async () => {
      mockOrder.mockResolvedValue({ data: null, error: { message: 'down' } });

      await expect(searchPatients('ana')).rejects.toThrow('down');
    });
  });
});
