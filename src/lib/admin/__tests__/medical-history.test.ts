import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  getMedicalHistory,
  upsertMedicalHistory,
} from '../medical-history';
import { ValidationError } from '../validate';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function buildQuery() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockUpsert = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();
  const mockOrder = vi.fn();

  return {
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    upsert: mockUpsert.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    single: mockSingle,
    order: mockOrder.mockReturnThis(),
    _mocks: { mockSelect, mockInsert, mockUpdate, mockUpsert, mockEq, mockSingle, mockOrder },
  };
}

describe('medical-history service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getMedicalHistory', () => {
    it('returns an existing medical history mapped to camelCase', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: {
          patient_id: PATIENT_ID,
          allergies: ['penicillin'],
          systemic_conditions: ['diabetes'],
          medications: ['metformin'],
          pregnancy_status: 'no',
          coagulation_disorders: 'none',
          anticoagulants: null,
          surgeries: 'appendectomy',
          infectious_diseases: null,
          smoking: 'never',
          alcohol: 'occasional',
          dental_history: 'brackets',
          oral_habits: ['nail_biting'],
          clinical_notes: 'notes',
          created_at: '2026-09-01T10:00:00Z',
          updated_at: '2026-09-01T10:00:00Z',
        },
        error: null,
      });
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(query),
      });

      const history = await getMedicalHistory(PATIENT_ID);

      expect(history).toEqual({
        patientId: PATIENT_ID,
        allergies: ['penicillin'],
        systemicConditions: ['diabetes'],
        medications: ['metformin'],
        pregnancyStatus: 'no',
        coagulationDisorders: 'none',
        anticoagulants: null,
        surgeries: 'appendectomy',
        infectiousDiseases: null,
        smoking: 'never',
        alcohol: 'occasional',
        dentalHistory: 'brackets',
        oralHabits: ['nail_biting'],
        clinicalNotes: 'notes',
        createdAt: '2026-09-01T10:00:00Z',
        updatedAt: '2026-09-01T10:00:00Z',
      });
    });

    it('returns default empty values when no history exists', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(query),
      });

      const history = await getMedicalHistory(PATIENT_ID);

      expect(history).toEqual({
        patientId: PATIENT_ID,
        allergies: [],
        systemicConditions: [],
        medications: [],
        pregnancyStatus: null,
        coagulationDisorders: null,
        anticoagulants: null,
        surgeries: null,
        infectiousDiseases: null,
        smoking: null,
        alcohol: null,
        dentalHistory: null,
        oralHabits: [],
        clinicalNotes: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('throws ValidationError for an invalid patient id', async () => {
      await expect(getMedicalHistory('bad-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('upsertMedicalHistory', () => {
    it('replaces the medical history and returns the mapped row', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: {
          patient_id: PATIENT_ID,
          allergies: ['latex'],
          systemic_conditions: [],
          medications: [],
          pregnancy_status: null,
          coagulation_disorders: null,
          anticoagulants: null,
          surgeries: null,
          infectious_diseases: null,
          smoking: null,
          alcohol: null,
          dental_history: null,
          oral_habits: [],
          clinical_notes: null,
          created_at: '2026-09-01T10:00:00Z',
          updated_at: '2026-09-02T10:00:00Z',
        },
        error: null,
      });
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(query),
      });

      const history = await upsertMedicalHistory(PATIENT_ID, {
        allergies: ['latex'],
      });

      expect(query._mocks.mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: PATIENT_ID,
          allergies: ['latex'],
          systemic_conditions: [],
          medications: [],
        }),
        expect.objectContaining({ onConflict: 'patient_id' })
      );
      expect(history.allergies).toEqual(['latex']);
      expect(history.updatedAt).toBe('2026-09-02T10:00:00Z');
    });

    it('validates pregnancy, smoking and alcohol statuses', async () => {
      (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue(buildQuery()),
      });

      await expect(
        upsertMedicalHistory(PATIENT_ID, {
          pregnancyStatus: 'maybe' as 'yes',
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});
